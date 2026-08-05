/// <reference types="bun-types" />
import type { Plugin, PluginInput, ToolDefinition } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { Effect, Layer } from "effect"
import { LLM, LLMClient, Message, SystemPart } from "./llm-vendor/index"
import * as OpenAICompatible from "./llm-vendor/providers/openai-compatible"
import * as Anthropic from "./llm-vendor/providers/anthropic"
import { RequestExecutor } from "./llm-vendor/route/executor"

const DEFAULT_INSTRUCTION = "思考你的作为"
const PARENT_CONTEXT_MESSAGES = 30
const MAX_TOKENS = 4096

// 推理层装配：LLMClient.Service 由 RequestExecutor.Service（基于 effect FetchHttpClient）提供。
// 与 opencode 原生 LLM Engine（native-runtime.ts + route/client.ts）完全同构。
const LLM_CLIENT_LAYERS = LLMClient.layer.pipe(Layer.provide(RequestExecutor.fetchLayer))

// 当前主 Agent 的 provider + model：session.get → model.{providerID, id}
// 这是「用 opencode 本身的能力」——与主 Agent 完全相同的 provider。
async function resolveSessionModel(
  client: PluginInput["client"],
  sessionID: string,
): Promise<{ providerID: string; modelID: string }> {
  const res = await client.session.get({ path: { id: sessionID } })
  // v1 SDK 的 Session 类型未暴露 model 字段，但 HTTP API 返回 { id, providerID, variant }
  const model = (res.data as never as { model?: { providerID?: string; id?: string } })?.model
  if (!model?.providerID || !model?.id) {
    const fallback = process.env.LLM_INFER_PROVIDER_ID
    const fallbackModel = process.env.LLM_INFER_MODEL
    if (fallback && fallbackModel) return { providerID: fallback, modelID: fallbackModel }
    throw new Error(`会话 ${sessionID} 无 model 信息（providerID=${model?.providerID} id=${model?.id}）`)
  }
  return { providerID: model.providerID, modelID: model.id }
}

// 从 opencode 配置解析 provider 的 baseURL/apiKey（config.providers → options；env source 兜底）。
async function resolveProviderEndpoint(
  client: PluginInput["client"],
  providerID: string,
): Promise<{ baseURL: string; apiKey: string }> {
  const envBaseURL = process.env.LLM_INFER_BASE_URL
  const envApiKey = process.env.LLM_INFER_API_KEY
  if (envBaseURL && envApiKey) return { baseURL: envBaseURL, apiKey: envApiKey }

  const res = await client.config.providers()
  const provider = res.data?.providers.find((p) => p.id === providerID)
  if (!provider) throw new Error(`provider 未找到: ${providerID}`)
  const options = provider.options ?? {}
  const baseURL = typeof options.baseURL === "string" ? options.baseURL : undefined
  let apiKey = typeof options.apiKey === "string" ? options.apiKey : undefined
  if (!apiKey && provider.source === "env" && provider.env?.[0]) {
    apiKey = process.env[provider.env[0]]
  }
  if (!baseURL) throw new Error(`provider ${providerID} 无 baseURL`)
  if (!apiKey) throw new Error(`provider ${providerID} 无 apiKey`)
  return { baseURL, apiKey }
}

// 主会话 Message List → LLMRequest messages（text-only，过滤纯工具消息，连续同 role 合并）。
// 组装对齐 opencode openai-chat.ts lowerMessages：system 在前 + 消息按序 append，
// 保证 wire 前缀稳定 → provider implicit prompt cache 命中。
async function getConversation(
  client: PluginInput["client"],
  sessionID: string,
  limit: number,
): Promise<Array<{ role: "user" | "assistant"; text: string }>> {
  try {
    const res = await client.session.messages({ path: { id: sessionID }, query: { limit } })
    const raw = (res.data ?? []) as Array<{
      info?: { role?: string }
      parts?: Array<{ type?: string; text?: string }>
    }>
    // API 返回最新在前 → 逆转为旧→新（稳定前缀）
    const seq = [...raw].reverse()
    const out: Array<{ role: "user" | "assistant"; text: string }> = []
    for (const m of seq) {
      const role = m.info?.role
      if (role !== "user" && role !== "assistant") continue
      const text = (m.parts ?? [])
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("\n")
        .trim()
      if (!text) continue
      const last = out[out.length - 1]
      if (last && last.role === role) last.text += `\n${text}`
      else out.push({ role, text })
    }
    return out
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`主会话消息拉取失败: ${msg}`)
  }
}

// 走 vendor 的 opencode LLM Engine：LLM.request（request.ts 同构组装）→
// LLMClient.generate（内部 = stream 流式收集 + applyCachePolicy 缓存策略）。
// 返回完整文本。
async function llmInfer(
  client: PluginInput["client"],
  sessionID: string,
  systemText: string,
  conversation: Array<{ role: "user" | "assistant"; text: string }>,
  task: string,
): Promise<string> {
  const { providerID, modelID } = await resolveSessionModel(client, sessionID)
  const { baseURL, apiKey } = await resolveProviderEndpoint(client, providerID)
  const envModel = process.env.LLM_INFER_MODEL

  // 协议选择：Anthropic 兼容端点（baseURL 含 /anthropic，如 MiniMax）走 anthropic-messages
  // 协议（cache-policy 会注入 cacheControl ephemeral 断点）；否则走 OpenAI 兼容
  // （opencode 默认 npm=@ai-sdk/openai-compatible，implicit prefix caching）。
  const isAnthropicEndpoint = baseURL.includes("/anthropic")
  const model = isAnthropicEndpoint
    ? Anthropic.configure({ apiKey, baseURL }).model(envModel ?? modelID)
    : OpenAICompatible.configure({ apiKey, baseURL, provider: providerID }).model(envModel ?? modelID)

  const messages = [
    ...conversation.map((m) => Message.make({ role: m.role, content: m.text })),
    Message.user(task),
  ]

  const request = LLM.request({
    model: model as never,
    system: [SystemPart.make(systemText)],
    messages,
    generation: { maxTokens: MAX_TOKENS },
  })

  const response = await Effect.runPromise(
    LLMClient.generate(request).pipe(Effect.provide(LLM_CLIENT_LAYERS)),
  )
  const text = response.text.trim()
  if (!text) throw new Error("推理无输出")
  return text
}

export const LlmToolsPlugin: Plugin = async (input) => {
  const { client } = input

  // 一次推理：主会话 Message List 上下文 + 结构化任务。
  async function infer(ctx: { sessionID: string }, systemText: string, task: string): Promise<string> {
    const conversation = await getConversation(client, ctx.sessionID, PARENT_CONTEXT_MESSAGES)
    return llmInfer(client, ctx.sessionID, systemText, conversation, task)
  }

  return {
    tool: {
      llm_reflect: tool({
        description:
          "LLM 自省工具：基于当前主会话上下文发起一次独立 LLM 推理并返回结果。" +
          "不走 Session——直接拉主会话 Message List 作为上下文，用主 Agent 当前的 provider 推理" +
          "（vendor 自 opencode LLM Engine，wire 与主会话请求同构，前缀稳定命中 provider implicit prompt cache）。" +
          "每次调用都是独立推理，不创建任何会话。",
        args: {
          context: tool.schema.string().describe("要自省的内容/上下文"),
          instruction: tool.schema
            .string()
            .optional()
            .describe('自省指令，默认"思考你的作为"。可覆盖为任意推理要求。'),
        },
        async execute(args, ctx) {
          const inst = args.instruction && args.instruction.trim() ? args.instruction.trim() : DEFAULT_INSTRUCTION
          const task = `${inst}\n\n## 要自省的内容\n${args.context}`
          try {
            return await infer(ctx, "你是 llm_* 工具的独立推理引擎，请认真完成推理任务，输出中文。", task)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return `[llm_reflect] 推理失败: ${msg}`
          }
        },
      }),

      llm_understand_task: tool({
        description:
          "LLM 理解需求工具（管理流程第一步）：接收任务描述 + 可选的上下文/探索记录。" +
          "不走 Session——直接拉主会话 Message List 作为上下文，用主 Agent 当前的 provider 推理" +
          "（vendor 自 opencode LLM Engine，wire 与主会话请求同构，前缀稳定命中 provider implicit prompt cache）。" +
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
          const taskBody =
            `## 任务描述\n${args.task_description}` +
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
            return await infer(
              ctx,
              "你是 llm_* 工具的需求理解引擎，请以产品/工程双视角理解任务，输出中文。",
              task,
            )
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return `[llm_understand_task] 推理失败: ${msg}`
          }
        },
      }),

      llm_assess_progress: tool({
        description:
          "LLM 评估进度工具（管理流程第二步）：接收需求理解 + 当前状态 + 可选产出物。" +
          "不走 Session——直接拉主会话 Message List 作为上下文，用主 Agent 当前的 provider 推理" +
          "（vendor 自 opencode LLM Engine，wire 与主会话请求同构，前缀稳定命中 provider implicit prompt cache）。" +
          "每次调用独立推理，确保评估独立、无偏差。" +
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
          const taskBody =
            `## 需求理解\n${args.task_understanding}\n\n## 当前状态\n${args.current_state}` +
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
            return await infer(
              ctx,
              "你是 llm_* 工具的进度评估引擎，请严格对照验收标准客观评估，输出中文。",
              task,
            )
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return `[llm_assess_progress] 评估失败: ${msg}`
          }
        },
      }),

      llm_reflect_midway: tool({
        description:
          "LLM 中途反思工具（管理流程贯穿步骤）：接收当前情况 + 可选原始目标 + 可选担忧。" +
          "不走 Session——直接拉主会话 Message List 作为上下文，用主 Agent 当前的 provider 推理" +
          "（vendor 自 opencode LLM Engine，wire 与主会话请求同构，前缀稳定命中 provider implicit prompt cache）。" +
          "每次调用独立推理，保证反思客观无历史污染。" +
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
          const taskBody =
            `## 当前情况\n${args.current_situation}` +
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
            return await infer(
              ctx,
              "你是 llm_* 工具的中途反思引擎，请客观识别偏离与风险，输出中文。",
              task,
            )
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return `[llm_reflect_midway] 反思失败: ${msg}`
          }
        },
      }),

      llm_cross_audit: tool({
        description:
          "LLM 交叉审计工具：将给定内容同时发送给多个独立推理（默认 3 个并行）分析，" +
          "再由一个独立的汇总推理对所有分析结果进行综合与交叉质疑，最终返回汇总报告。" +
          "不走 Session——直接拉主会话 Message List 作为上下文，用主 Agent 当前的 provider 推理" +
          "（vendor 自 opencode LLM Engine，wire 与主会话请求同构，前缀稳定命中 provider implicit prompt cache）。" +
          "并行推理共享同一稳定前缀，缓存可命中。",
        args: {
          content: tool.schema.string().describe("要审计/分析的内容"),
          auditor_count: tool.schema
            .number()
            .optional()
            .describe("并行审计推理的数量，默认 3，范围 2-6"),
          auditor_instruction: tool.schema
            .string()
            .optional()
            .describe('每个审计推理的分析指令，默认"请对以下内容进行独立深入分析，指出问题、风险和改进建议"'),
          synthesis_instruction: tool.schema
            .string()
            .optional()
            .describe('汇总推理的综合指令，默认"对以上多份独立分析进行综合，交叉质疑各方观点，得出最终结论"'),
        },
        async execute(args, ctx) {
          const count = Math.min(6, Math.max(2, args.auditor_count ?? 3))
          const auditInst =
            args.auditor_instruction?.trim() || "请对以下内容进行独立深入分析，指出问题、风险和改进建议"
          const synthInst =
            args.synthesis_instruction?.trim() || "对以上多份独立分析进行综合，交叉质疑各方观点，得出最终结论"

          try {
            const conversation = await getConversation(client, ctx.sessionID, PARENT_CONTEXT_MESSAGES)
            const auditResults = await Promise.all(
              Array.from({ length: count }, (_, i) =>
                llmInfer(
                  client,
                  ctx.sessionID,
                  "你是 llm_* 工具的交叉审计引擎，请独立深入分析并指出问题、风险和改进建议，输出中文。",
                  conversation,
                  `${auditInst}\n\n## 要审计的内容\n${args.content}`,
                ),
              ),
            )
            const auditSection = auditResults.map((r, i) => `## 审计员 ${i + 1} 分析\n${r}`).join("\n\n")
            const summary = await llmInfer(
              client,
              ctx.sessionID,
              "你是 llm_* 工具的审计汇总引擎，请综合交叉质疑各方观点并给出最终结论，输出中文。",
              conversation,
              `${synthInst}\n\n${auditSection}`,
            )
            return [`# 交叉审计报告`, ``, auditSection, ``, `## 综合与交叉质疑`, summary].join("\n")
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return `[llm_cross_audit] 审计失败: ${msg}`
          }
        },
      }),
    } as unknown as Record<string, ToolDefinition>,
  }
}

export default LlmToolsPlugin
