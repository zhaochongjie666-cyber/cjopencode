import type { Plugin, ToolDefinition } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

const DEFAULT_INSTRUCTION = "思考你的作为"

const childCache = new Map<string, string>()

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
    } as unknown as Record<string, ToolDefinition>,
  }
}

export default LlmToolsPlugin
