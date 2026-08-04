import type { Plugin, ToolDefinition } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

const DEFAULT_INSTRUCTION = "思考你的作为"

const childCache = new Map<string, string>()

// Cache for cross-audit sessions: parentID -> { auditors: string[], synthesizer: string }
interface CrossAuditSessions {
  auditors: string[]
  synthesizer: string
}
const crossAuditCache = new Map<string, CrossAuditSessions>()

export const LlmToolsPlugin: Plugin = async (input) => {
  const { client } = input

  async function getOrCreateChild(parentID: string): Promise<string> {
    const cached = childCache.get(parentID)
    if (cached) return cached
    const forked = await client.session.fork({ path: { id: parentID } })
    const childID = forked.data?.id
    if (!childID) throw new Error("fork 未返回子会话 ID")
    childCache.set(parentID, childID)
    return childID
  }

  async function forkNew(parentID: string): Promise<string> {
    const forked = await client.session.fork({ path: { id: parentID } })
    const childID = forked.data?.id
    if (!childID) throw new Error("fork 未返回子会话 ID")
    return childID
  }

  async function getOrCreateCrossAuditSessions(
    parentID: string,
    auditorCount: number,
  ): Promise<CrossAuditSessions> {
    const cached = crossAuditCache.get(parentID)
    if (cached && cached.auditors.length === auditorCount) return cached
    // Fork auditors and synthesizer in parallel
    const forkPromises = Array.from({ length: auditorCount + 1 }, () => forkNew(parentID))
    const ids = await Promise.all(forkPromises)
    const sessions: CrossAuditSessions = {
      auditors: ids.slice(0, auditorCount),
      synthesizer: ids[auditorCount],
    }
    crossAuditCache.set(parentID, sessions)
    return sessions
  }

  async function run(sessionID: string, text: string): Promise<string> {
    const res = await client.session.prompt({
      path: { id: sessionID },
      body: { parts: [{ type: "text", text }] },
    })
    const parts = (res.data?.parts ?? []) as Array<{ type: string; text?: string }>
    const out = parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("\n")
      .trim()
    return out || "(无输出)"
  }

  return {
    tool: {
      llm_reflect: tool({
        description:
          "LLM 自省工具：基于当前主对话上下文发起一次独立 LLM 推理并返回结果。" +
          "首次调用会 fork 主会话（继承完整上下文）得到子会话并缓存；后续调用复用同一子会话，" +
          "使 prompt_cache_key 稳定以命中 KV/prompt 缓存，且自省历史在子会话中累积。" +
          "用于让模型以固定指令（默认“思考你的作为”）反思/推理自身行为或给定内容，把结论带回当前对话。",
        args: {
          context: tool.schema.string().describe("要自省的内容/上下文"),
          instruction: tool.schema
            .string()
            .optional()
            .describe('自省指令，默认"思考你的作为"。可覆盖为任意推理要求。'),
        },
        async execute(args, ctx) {
          const inst =
            args.instruction && args.instruction.trim() ? args.instruction.trim() : DEFAULT_INSTRUCTION
          const text = `${inst}\n\n上下文:\n${args.context}`
          try {
            let childID = await getOrCreateChild(ctx.sessionID)
            try {
              return await run(childID, text)
            } catch {
              childCache.delete(ctx.sessionID)
              childID = await getOrCreateChild(ctx.sessionID)
              return await run(childID, text)
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return `[llm_reflect] 推理失败: ${msg}`
          }
        },
      }),

      llm_cross_audit: tool({
        description:
          "LLM 交叉审计工具：将给定内容同时发送给多个独立的子 LLM（默认 3 个）并行分析，" +
          "再由一个独立的汇总 LLM 对所有分析结果进行综合与交叉质疑，最终返回汇总报告。" +
          "每个子会话均从主会话 fork（继承完整上下文），并在后续调用中复用以保持 KV cache。",
        args: {
          content: tool.schema.string().describe("要审计/分析的内容"),
          auditor_count: tool.schema
            .number()
            .optional()
            .describe("并行审计 LLM 的数量，默认 3，范围 2-6"),
          auditor_instruction: tool.schema
            .string()
            .optional()
            .describe('每个审计 LLM 的分析指令，默认"请对以下内容进行独立深入分析，指出问题、风险和改进建议"'),
          synthesis_instruction: tool.schema
            .string()
            .optional()
            .describe('汇总 LLM 的综合指令，默认"对以上多份独立分析进行综合，交叉质疑各方观点，得出最终结论"'),
        },
        async execute(args, ctx) {
          const count = Math.min(6, Math.max(2, args.auditor_count ?? 3))
          const auditInst =
            args.auditor_instruction?.trim() ||
            "请对以下内容进行独立深入分析，指出问题、风险和改进建议"
          const synthInst =
            args.synthesis_instruction?.trim() ||
            "对以上多份独立分析进行综合，交叉质疑各方观点，得出最终结论"

          // runTwo sends two sequential messages to a session to maximise KV-cache reuse:
          // msg1 is the fixed role/instruction (cached across calls), msg2 is the variable content.
          async function runTwo(sessionID: string, msg1: string, msg2: string): Promise<string> {
            await run(sessionID, msg1)
            return run(sessionID, msg2)
          }

          try {
            let sessions = await getOrCreateCrossAuditSessions(ctx.sessionID, count)

            // Run auditors in parallel: msg1=fixed instruction (cache hit), msg2=content
            const auditorResults = await Promise.all(
              sessions.auditors.map(async (id, i) => {
                try {
                  return await runTwo(id, auditInst, args.content)
                } catch {
                  // On failure, re-fork this slot only
                  const newID = await forkNew(ctx.sessionID)
                  sessions.auditors[i] = newID
                  return await runTwo(newID, auditInst, args.content)
                }
              }),
            )

            // Build synthesis content (variable part)
            const auditSection = auditorResults
              .map((r, i) => `## 审计员 ${i + 1} 分析\n${r}`)
              .join("\n\n")

            // Synthesizer: msg1=fixed instruction (cache hit), msg2=audit results
            let summary: string
            try {
              summary = await runTwo(sessions.synthesizer, synthInst, auditSection)
            } catch {
              const newSynth = await forkNew(ctx.sessionID)
              sessions.synthesizer = newSynth
              summary = await runTwo(newSynth, synthInst, auditSection)
            }

            return [
              `# 交叉审计报告`,
              ``,
              auditSection,
              ``,
              `## 综合与交叉质疑`,
              summary,
            ].join("\n")
          } catch (e) {
            crossAuditCache.delete(ctx.sessionID)
            const msg = e instanceof Error ? e.message : String(e)
            return `[llm_cross_audit] 审计失败: ${msg}`
          }
        },
      }),
    } as unknown as Record<string, ToolDefinition>,
  }
}

export default LlmToolsPlugin
