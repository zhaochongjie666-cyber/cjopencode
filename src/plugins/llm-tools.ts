import type { Plugin, ToolDefinition } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

const DEFAULT_INSTRUCTION = "思考你的作为"
const SUBAGENT_NAME = "llm-helper"

const childCache = new Map<string, string>()

interface CrossAuditSessions {
  auditors: string[]
  synthesizer: string
}
const crossAuditCache = new Map<string, CrossAuditSessions>()

export const LlmToolsPlugin: Plugin = async (input) => {
  const { client } = input

  // subagent 派发：fork 主 agent 会话作为 subagent 会话——
  // session.fork 完整复制主会话历史（继承主 Agent 的上下文），
  // 在 fork 出的会话上以 llm-helper subagent 身份 prompt，结果返回主 agent。
  async function createSubagentChild(parentID: string): Promise<string> {
    const forked = await client.session.fork({ path: { id: parentID } })
    const childID = forked.data?.id
    if (!childID) throw new Error("fork 未返回子会话 ID")
    return childID
  }

  async function getOrCreateChild(parentID: string): Promise<string> {
    const cached = childCache.get(parentID)
    if (cached) return cached
    const childID = await createSubagentChild(parentID)
    childCache.set(parentID, childID)
    return childID
  }

  async function forkNew(parentID: string): Promise<string> {
    return createSubagentChild(parentID)
  }

  async function getOrCreateCrossAuditSessions(
    parentID: string,
    auditorCount: number,
  ): Promise<CrossAuditSessions> {
    const cached = crossAuditCache.get(parentID)
    if (cached && cached.auditors.length === auditorCount) return cached
    const forkPromises = Array.from({ length: auditorCount + 1 }, () => forkNew(parentID))
    const ids = await Promise.all(forkPromises)
    const sessions: CrossAuditSessions = {
      auditors: ids.slice(0, auditorCount),
      synthesizer: ids[auditorCount],
    }
    crossAuditCache.set(parentID, sessions)
    return sessions
  }

  // 拼装 subagent 提示：msg1 = 固定指令（缓存命中），msg2 = 任务内容。
  async function runTwo(sessionID: string, msg1: string, msg2: string): Promise<string> {
    await run(sessionID, msg1)
    return run(sessionID, msg2)
  }

  async function run(sessionID: string, text: string): Promise<string> {
    // 在 fork 出的子会话上以 llm-helper subagent 身份 prompt
    const res = await client.session.prompt({
      path: { id: sessionID },
      body: {
        agent: SUBAGENT_NAME,
        parts: [{ type: "text", text }],
      },
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
          "LLM 自省工具：基于当前主会话上下文发起一次独立 LLM 推理并返回结果。" +
          "subagent 形式——首次调用 fork 主 agent 会话（继承完整上下文）作为 subagent 会话并缓存；" +
          "后续调用复用同一子会话，使 prompt_cache_key 稳定以命中 KV/prompt 缓存，" +
          "且自省历史在子会话中累积。结果返回主 agent。",
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
          const task = `${inst}\n\n## 要自省的内容\n${args.context}`
          try {
            let childID = await getOrCreateChild(ctx.sessionID)
            try {
              
              return await runTwo(childID, inst, task)
            } catch {
              childCache.delete(ctx.sessionID)
              childID = await getOrCreateChild(ctx.sessionID)
              
              return await runTwo(childID, inst, task)
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return `[llm_reflect] 推理失败: ${msg}`
          }
        },
      }),

      llm_understand_task: tool({
        description:
          "LLM 理解需求工具（管理流程第一步）：接收任务描述 + 可选的上下文/探索记录。" +
          "subagent 形式——首次调用 fork 主 agent 会话（继承完整上下文）作为 subagent 会话并缓存；后续调用复用同一子会话" +
          "（KV cache 友好，需求理解历史在子会话中累积）。结果返回主 agent。" +
          "工作流：llm_understand_task → (work) → llm_reflect_midway → (work) → llm_assess_progress。",
        args: {
          task_description: tool.schema.string().describe("任务描述"),
          context_or_exploration: tool.schema
            .string()
            .optional()
            .describe("可选的上下文/探索笔记（先前调研、约束、相关代码等）"),
          instruction: tool.schema
            .string()
            .optional()
            .describe('理解指令（默认"分析任务并产出结构化需求理解"）。可覆盖为自定义角色或侧重。'),
        },
        async execute(args, ctx) {
          const inst =
            args.instruction && args.instruction.trim()
              ? args.instruction.trim()
              : "分析任务并产出结构化需求理解"
          const taskBody = `## 任务描述\n${args.task_description}` +
            (args.context_or_exploration && args.context_or_exploration.trim()
              ? `\n\n## 上下文 / 探索笔记\n${args.context_or_exploration}`
              : "")
          const outputFormat =
            "\n\n## 输出要求（必须按以下中文结构输出）\n" +
            "1. **目标**：一句话目标；如有子目标，列出。\n" +
            "2. **要求**：必须满足的功能/非功能需求。\n" +
            "3. **约束**：硬性边界（技术栈、时间、依赖、兼容性）。\n" +
            "4. **验收标准**：可观测、可验证的判据。\n" +
            "5. **关键问题**：需要先回答或澄清的开放问题。\n" +
            "6. **可行性判断**：可行 / 部分可行 / 不可行 + 简要原因。"
          const task = `${taskBody}${outputFormat}`
          try {
            let childID = await getOrCreateChild(ctx.sessionID)
            try {
              return await runTwo(childID, inst, task)
            } catch {
              childCache.delete(ctx.sessionID)
              childID = await getOrCreateChild(ctx.sessionID)
              return await runTwo(childID, inst, task)
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return `[llm_understand_task] 推理失败: ${msg}`
          }
        },
      }),

      llm_assess_progress: tool({
        description:
          "LLM 评估进度工具（管理流程第二步）：接收需求理解 + 当前状态 + 可选产出物。" +
          "subagent 形式——每次调用都 fork 主 agent 会话（继承完整上下文）作为全新 subagent 会话（不累积上下文），" +
          "以 agent=llm-helper 身份处理，结果返回主 agent，确保评估独立、无偏差。" +
          "工作流：llm_understand_task → (work) → llm_reflect_midway → (work) → llm_assess_progress → 重复直到交付。",
        args: {
          task_understanding: tool.schema.string().describe("先前 llm_understand_task 产出的结构化需求理解"),
          current_state: tool.schema.string().describe("当前进度描述（已做、正在做、卡在哪）"),
          artifacts: tool.schema
            .string()
            .optional()
            .describe("可选的产出物/证据（代码改动、测试结果、日志、文档片段等摘要）"),
          instruction: tool.schema
            .string()
            .optional()
            .describe('评估指令（默认"对照需求理解评估当前进度并给出交付判定"）。可覆盖。'),
        },
        async execute(args, ctx) {
          const inst =
            args.instruction && args.instruction.trim()
              ? args.instruction.trim()
              : "对照需求理解评估当前进度并给出交付判定"
          const taskBody = `## 需求理解\n${args.task_understanding}\n\n## 当前状态\n${args.current_state}` +
            (args.artifacts && args.artifacts.trim() ? `\n\n## 产出物 / 证据\n${args.artifacts}` : "")
          const outputFormat =
            "\n\n## 输出要求（必须按以下中文结构输出）\n" +
            "1. **完成度**：百分比（0-100%）+ 一句说明。\n" +
            "2. **已满足验收标准**：列出对应条目。\n" +
            "3. **未满足验收标准**：列出对应条目 + 缺口。\n" +
            "4. **质量风险**：潜在缺陷、边界遗漏、可维护性。\n" +
            "5. **下一步行动**：按优先级排序的具体动作。\n" +
            "6. **交付判定**：可交付 / 不可交付（差什么）/ 需重做（为什么）。"
          const task = `${taskBody}${outputFormat}`
          try {
            const sessionID = await forkNew(ctx.sessionID)
            return await runTwo(sessionID, inst, task)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return `[llm_assess_progress] 评估失败: ${msg}`
          }
        },
      }),

      llm_reflect_midway: tool({
        description:
          "LLM 中途反思工具（管理流程贯穿步骤）：接收当前情况 + 可选原始目标 + 可选担忧。" +
          "subagent 形式——每次调用都 fork 主 agent 会话（继承完整上下文）作为全新 subagent 会话（不累积上下文），" +
          "以 agent=llm-helper 身份处理，结果返回主 agent，保证反思客观无历史污染。" +
          "工作流：llm_understand_task → (work) → llm_reflect_midway → (work) → llm_assess_progress。",
        args: {
          current_situation: tool.schema.string().describe("当前情况描述（进展、卡点、决策点）"),
          original_goal: tool.schema
            .string()
            .optional()
            .describe("原始目标/需求理解（用于对照判断是否偏离）"),
          concerns: tool.schema.string().optional().describe("当前担忧/疑问（可选）"),
          instruction: tool.schema
            .string()
            .optional()
            .describe('反思指令（默认"对当前情况进行中途反思，识别偏离与风险并给出调整建议"）。可覆盖。'),
        },
        async execute(args, ctx) {
          const inst =
            args.instruction && args.instruction.trim()
              ? args.instruction.trim()
              : "对当前情况进行中途反思，识别偏离与风险并给出调整建议"
          const taskBody = `## 当前情况\n${args.current_situation}` +
            (args.original_goal && args.original_goal.trim() ? `\n\n## 原始目标\n${args.original_goal}` : "") +
            (args.concerns && args.concerns.trim() ? `\n\n## 担忧 / 疑问\n${args.concerns}` : "")
          const outputFormat =
            "\n\n## 输出要求（必须按以下中文结构输出）\n" +
            "1. **路径评估**：当前路径能否达成目标？顺/逆/卡。\n" +
            "2. **偏差检测**：与原始目标/需求的偏离点（若有）。\n" +
            "3. **隐藏风险**：未显化但可能爆雷的问题。\n" +
            "4. **备选方案**：若继续走不通，列出 2-3 个替代路径。\n" +
            "5. **调整建议**：具体动作（继续/转向/暂停/回滚）。\n" +
            "6. **置信度**：高/中/低 + 简要原因。"
          const task = `${taskBody}${outputFormat}`
          try {
            const sessionID = await forkNew(ctx.sessionID)
            return await runTwo(sessionID, inst, task)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return `[llm_reflect_midway] 反思失败: ${msg}`
          }
        },
      }),

      llm_cross_audit: tool({
        description:
          "LLM 交叉审计工具：将给定内容同时发送给多个独立的 subagent（默认 3 个）并行分析，" +
          "再由一个独立的汇总 subagent 对所有分析结果进行综合与交叉质疑，最终返回汇总报告。" +
          "每个 subagent 均从主会话 fork（继承主 Agent 完整上下文），" +
          "以 agent=llm-helper 身份处理；后续调用复用以保持 KV cache。",
        args: {
          content: tool.schema.string().describe("要审计/分析的内容"),
          auditor_count: tool.schema
            .number()
            .optional()
            .describe("并行审计 subagent 的数量，默认 3，范围 2-6"),
          auditor_instruction: tool.schema
            .string()
            .optional()
            .describe('每个审计 subagent 的分析指令，默认"请对以下内容进行独立深入分析，指出问题、风险和改进建议"'),
          synthesis_instruction: tool.schema
            .string()
            .optional()
            .describe('汇总 subagent 的综合指令，默认"对以上多份独立分析进行综合，交叉质疑各方观点，得出最终结论"'),
        },
        async execute(args, ctx) {
          const count = Math.min(6, Math.max(2, args.auditor_count ?? 3))
          const auditInst =
            args.auditor_instruction?.trim() ||
            "请对以下内容进行独立深入分析，指出问题、风险和改进建议"
          const synthInst =
            args.synthesis_instruction?.trim() ||
            "对以上多份独立分析进行综合，交叉质疑各方观点，得出最终结论"

          try {
            let sessions = await getOrCreateCrossAuditSessions(ctx.sessionID, count)

            const auditorResults = await Promise.all(
              sessions.auditors.map(async (id, i) => {
                try {
                  return await runTwo(id, auditInst, args.content)
                } catch {
                  const newID = await createSubagentChild(ctx.sessionID)
                  sessions.auditors[i] = newID
                  return await runTwo(newID, auditInst, args.content)
                }
              }),
            )

            const auditSection = auditorResults
              .map((r, i) => `## 审计员 ${i + 1} 分析\n${r}`)
              .join("\n\n")

            let summary: string
            try {
              summary = await runTwo(sessions.synthesizer, synthInst, auditSection)
            } catch {
              const newSynth = await createSubagentChild(ctx.sessionID)
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
