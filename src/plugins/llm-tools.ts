/// <reference types="bun-types" />
import type { Plugin, PluginInput, ToolDefinition } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { Effect, Fiber, Layer } from "effect"
import { LLM, LLMClient, Message, SystemPart } from "./llm-vendor/index"
import * as OpenAICompatible from "./llm-vendor/providers/openai-compatible"
import * as Anthropic from "./llm-vendor/providers/anthropic"
import { RequestExecutor } from "./llm-vendor/route/executor"

const DEFAULT_INSTRUCTION = "思考你的作为"
// 上下文窗口取「全部」（大值兜底）：implicit prompt cache 要求前缀严格只增不减。
// 窗口滑动（旧消息被丢弃）会让每次新请求的前缀整体左移，之前缓存全部失效重写 —— 故禁用尾部窗口。
// 注意：limit=10000 不是真正的"全部"，超长会话（>10000 条）仍会丢弃最旧消息 → 前缀左移 → cache 失效。
const CONTEXT_MESSAGES_LIMIT = 10000
// 单条消息字符上限：防止大文件内容全量进 context（token 爆炸），总量由模型 context 兜底。
const MAX_MESSAGE_CHARS = 8192
const MAX_TOKENS = 4096

// 交叉审计的差异化视角：每个 auditor 取一项，注入 system persona + 差异化 temperature，
// 避免所有 auditor 收相同 prompt 产出雷同（"交叉质疑"才有意义）。temperature 仅作扰动。
const AUDIT_PERSONAS = [
  { role: "架构与可维护性", focus: "结构、耦合、扩展性、长期维护成本", temperature: 0.6 },
  { role: "安全与健壮性", focus: "注入、越权、边界、异常路径、数据泄漏", temperature: 0.8 },
  { role: "正确性与边界", focus: "逻辑漏洞、边界条件、并发、幂等、错误处理", temperature: 0.9 },
  { role: "性能与成本", focus: "时间/空间复杂度、资源占用、调用频次、token 成本", temperature: 0.7 },
  { role: "可读性与规范", focus: "命名、注释、一致性、是否符合既有约定", temperature: 0.5 },
  { role: "可观测与运维", focus: "日志、指标、可调试性、上线风险", temperature: 0.7 },
] as const

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
    // env 兜底（测试专用）：优先读 LLM_INFER_TEST_*，旧名 LLM_INFER_* 向后兼容
    const fallback = process.env.LLM_INFER_TEST_PROVIDER_ID ?? process.env.LLM_INFER_PROVIDER_ID
    const fallbackModel = process.env.LLM_INFER_TEST_MODEL ?? process.env.LLM_INFER_MODEL
    if (fallback && fallbackModel) return { providerID: fallback, modelID: fallbackModel }
    throw new Error(`会话 ${sessionID} 无 model 信息（providerID=${model?.providerID} id=${model?.id}）`)
  }
  return { providerID: model.providerID, modelID: model.id }
}

// 主 Agent 的 provider 解析：对齐 opencode **experimental** native 路径
// （native-runtime.ts statusWithFetch + native-request.ts model()）的
// apiKey/baseURL/protocol 解析。注意：native-runtime 为 experimental 路径，
// 生产默认走 provider.resolveSDK（动态 Npm.add、url 变量替换等），二者细节有差。
//   apiKey   = provider.options.apiKey ?? provider.key ?? env 扫描兜底
//   baseURL  = provider.options.baseURL ?? model.api.url
//   协议     = model.api.npm（权威选择，不是 baseURL 嗅探）
//   模型 ID  = model.api.id（API 侧真实 ID，可能 ≠ session 的 model.id）
//   headers  = model.headers；limits = model.limit
type MainAgentModel = {
  providerID: string
  apiKey: string
  baseURL: string
  apiNpm?: string
  apiID?: string
  headers?: Record<string, string>
  limits?: { context?: number; output?: number }
}

async function resolveMainAgentModel(
  client: PluginInput["client"],
  sessionID: string,
): Promise<MainAgentModel> {
  const { providerID, modelID } = await resolveSessionModel(client, sessionID)
  const res = await client.config.providers()
  const provider = res.data?.providers.find((p) => p.id === providerID)
  if (!provider) throw new Error(`provider 未找到: ${providerID}`)
  const opts = provider.options ?? {}
  const model = (provider.models ?? {})[modelID] as
    | {
        api?: { id?: string; url?: string; npm?: string }
        limit?: { context?: number; output?: number }
        headers?: Record<string, string>
      }
    | undefined
  // 模型必须在 provider.models 中登记，否则 api.npm/协议不可确定 —— 不猜测，直接报错
  // （否则 Anthropic 模型可能静默走 openai-compatible 协议 → 400 难排查）。
  if (!model) {
    throw new Error(
      `provider ${providerID} 的 models 中无 modelID=${modelID}（无法确定 api.npm/协议；请检查 opencode 配置 provider.models）`,
    )
  }
  // apiKey 解析链：options.apiKey → provider.key → env 扫描兜底。
  // opencode bootstrap 只在 provider.env.length===1 时写 provider.key（provider.ts:1522-1527），
  // 多 env 声明时 key 为 undefined 但 env 有值 —— 这里复刻 bootstrap 语义扫所有 env 取首个 truthy。
  const apiKeyFromEnv =
    Array.isArray(provider.env) && provider.env.length
      ? provider.env.map((e) => process.env[e]).find((v) => typeof v === "string" && !!v)
      : undefined
  const apiKey =
    (typeof opts.apiKey === "string" && opts.apiKey ? opts.apiKey : provider.key) ||
    apiKeyFromEnv ||
    undefined
  const baseURL =
    (typeof opts.baseURL === "string" && opts.baseURL ? opts.baseURL : model.api?.url) || undefined
  if (!apiKey) throw new Error(`provider ${providerID} 无 apiKey（options.apiKey / key / env）`)
  if (!baseURL) throw new Error(`provider ${providerID} 无 baseURL（options.baseURL / model.api.url）`)
  return {
    providerID,
    apiKey,
    baseURL,
    apiNpm: model.api?.npm,
    apiID: model.api?.id,
    headers: model.headers,
    limits: model.limit,
  }
}

// 协议选择照 native-request.ts model()：model.api.npm 权威决定。
// vendor 已裁剪至 anthropic + openai-compatible；其余 npm 明确报错（不猜测）。
// apiNpm 为空（model 在但缺 npm 字段）时容忍回退 openai-compatible（遗留兼容）。
type ConfiguredModel = ReturnType<ReturnType<typeof Anthropic.configure>["model"]>
function configureModel(
  resolved: MainAgentModel,
  fallbackModelID: string,
): ConfiguredModel {
  const { providerID, apiKey, apiNpm, apiID, headers, limits } = resolved
  const baseURL = resolved.baseURL
  const options = {
    apiKey,
    ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
    ...(limits ? { limits } : {}),
  }
  if (apiNpm === "@ai-sdk/anthropic") {
    // Anthropic 兼容端点（如 MiniMax）baseURL 缺 /v1 时规范化补上（协议约定 = baseURL + /v1/messages）
    const v1 = /\/v\d+$/.test(baseURL.replace(/\/+$/, ""))
      ? baseURL
      : `${baseURL.replace(/\/+$/, "")}/v1`
    return Anthropic.configure({ ...options, baseURL: v1 }).model(apiID ?? fallbackModelID)
  }
  if (!apiNpm || apiNpm === "@ai-sdk/openai-compatible") {
    return OpenAICompatible.configure({ ...options, provider: providerID, baseURL }).model(
      apiID ?? fallbackModelID,
    )
  }
  throw new Error(`协议未 vendor: ${apiNpm}（当前支持 @ai-sdk/anthropic / @ai-sdk/openai-compatible）`)
}

// 主会话 Message List → LLMRequest messages（text-only，过滤纯工具消息，连续同 role 合并，单条截断）。
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
        .slice(0, MAX_MESSAGE_CHARS)
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

// fiber 中断 → effect FetchHttpClient 自动 abort fetch（interruption 语义）：
// 与主会话取消行为等价 —— 中断即停止请求，不浪费 token。
async function runWithAbort<A, E>(effect: Effect.Effect<A, E>, signal?: AbortSignal): Promise<A> {
  if (signal?.aborted) throw new DOMException("已取消", "AbortError")
  if (!signal) return Effect.runPromise(effect)
  const fiber = Effect.runFork(effect)
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener(
      "abort",
      () => {
        void Effect.runPromise(Fiber.interrupt(fiber)).catch(() => {})
        reject(new DOMException("已取消", "AbortError"))
      },
      { once: true },
    )
  })
  return Promise.race([Effect.runPromise(Fiber.join(fiber)), aborted])
}

// 走 vendor 的 opencode LLM Engine：LLM.request（request.ts 同构组装）→
// LLMClient.generate（内部 = stream 流式收集 + applyCachePolicy 缓存策略）。
// Anthropic 协议下 applyCachePolicy 默认 "auto" 已在 last-user-message / system / tools
// 打 ephemeral 断点（≤4 上限），无需手动设 cache_control；OpenAI 兼容靠 implicit prefix caching。
// provider/model 复用主 Agent（config.providers → models[modelID]），env 覆盖仅测试用。
// 返回完整文本。
async function llmInfer(
  client: PluginInput["client"],
  sessionID: string,
  systemText: string,
  conversation: Array<{ role: "user" | "assistant"; text: string }>,
  task: string,
  signal?: AbortSignal,
  opts?: { temperature?: number },
): Promise<string> {
  const { modelID } = await resolveSessionModel(client, sessionID)

  // env 覆盖（测试专用）：优先读 LLM_INFER_TEST_*，旧名 LLM_INFER_* 向后兼容
  const envBaseURL = process.env.LLM_INFER_TEST_BASE_URL ?? process.env.LLM_INFER_BASE_URL
  const envApiKey = process.env.LLM_INFER_TEST_API_KEY ?? process.env.LLM_INFER_API_KEY
  const envModel = process.env.LLM_INFER_TEST_MODEL ?? process.env.LLM_INFER_MODEL

  // 主路径解析出 limits.output 用于 maxTokens 上限；env 测试路径无 model 信息 → 兜底 MAX_TOKENS
  let maxTokens: number
  let model: ConfiguredModel
  if (envBaseURL && envApiKey) {
    // 测试专用：env 覆盖端点（无 model.api 信息，协议按 baseURL 嗅探）
    maxTokens = MAX_TOKENS
    model = envBaseURL.includes("/anthropic")
      ? Anthropic.configure({
          apiKey: envApiKey,
          baseURL: /\/v\d+$/.test(envBaseURL.replace(/\/+$/, ""))
            ? envBaseURL
            : `${envBaseURL.replace(/\/+$/, "")}/v1`,
        }).model(envModel ?? modelID)
      : OpenAICompatible.configure({
          apiKey: envApiKey,
          baseURL: envBaseURL,
          provider: "env-infer",
        }).model(envModel ?? modelID)
  } else {
    const resolved = await resolveMainAgentModel(client, sessionID)
    maxTokens = resolved.limits?.output ?? MAX_TOKENS
    model = configureModel(resolved, modelID)
  }

  const messages = [
    ...conversation.map((m) => Message.make({ role: m.role, content: m.text })),
    Message.user(task),
  ]

  const request = LLM.request({
    model: model as never,
    system: [SystemPart.make(systemText)],
    messages,
    generation: {
      maxTokens,
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
    },
  })

  const response = await runWithAbort(
    LLMClient.generate(request).pipe(Effect.provide(LLM_CLIENT_LAYERS)),
    signal,
  )
  const text = response.text.trim()
  if (!text) throw new Error("推理无输出")
  return text
}

export const LlmToolsPlugin: Plugin = async (input) => {
  const { client } = input

  // 一次推理：主会话 Message List 上下文 + 结构化任务。
  async function infer(ctx: { sessionID: string; abort?: AbortSignal }, systemText: string, task: string): Promise<string> {
    const conversation = await getConversation(client, ctx.sessionID, CONTEXT_MESSAGES_LIMIT)
    return llmInfer(client, ctx.sessionID, systemText, conversation, task, ctx.abort)
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
          // 错误直接抛出 → opencode 标记 status:error / resultType:error（Anthropic is_error:true），agent 可识别失败
          return await infer(ctx, "你是 llm_* 工具的独立推理引擎，请认真完成推理任务，输出中文。", task)
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
          return await infer(
            ctx,
            "你是 llm_* 工具的需求理解引擎，请以产品/工程双视角理解任务，输出中文。",
            task,
          )
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
          return await infer(
            ctx,
            "你是 llm_* 工具的进度评估引擎，请严格对照验收标准客观评估，输出中文。",
            task,
          )
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
          return await infer(
            ctx,
            "你是 llm_* 工具的中途反思引擎，请客观识别偏离与风险，输出中文。",
            task,
          )
        },
      }),

      llm_cross_audit: tool({
        description:
          "LLM 交叉审计工具：将给定内容同时发送给多个独立推理（默认 2 个并行）分析，" +
          "每个 auditor 分配不同视角（架构/安全/正确性/性能/可读性/运维）与差异化采样，" +
          "再由一个独立的汇总推理对所有分析结果进行综合与交叉质疑，最终返回汇总报告。" +
          "不走 Session——直接拉主会话 Message List 作为上下文，用主 Agent 当前的 provider 推理" +
          "（vendor 自 opencode LLM Engine，wire 与主会话请求同构，前缀稳定命中 provider implicit prompt cache）。" +
          "并行推理共享同一稳定前缀，缓存可命中。任一 auditor 失败会在报告中标注，仅全部失败才整体报错。",
        args: {
          content: tool.schema.string().describe("要审计/分析的内容"),
          auditor_count: tool.schema
            .number()
            .optional()
            .describe("并行审计推理的数量，默认 2，范围 2-6"),
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
          const count = Math.min(6, Math.max(2, args.auditor_count ?? 2))
          const auditInst =
            args.auditor_instruction?.trim() || "请对以下内容进行独立深入分析，指出问题、风险和改进建议"
          const synthInst =
            args.synthesis_instruction?.trim() || "对以上多份独立分析进行综合，交叉质疑各方观点，得出最终结论"

          const conversation = await getConversation(client, ctx.sessionID, CONTEXT_MESSAGES_LIMIT)
          const taskBody = `${auditInst}\n\n## 要审计的内容\n${args.content}`

          // 并行审计，allSettled 容错：单个 auditor 失败不致命，仅标注；全部失败才抛错
          const settled = await Promise.allSettled(
            Array.from({ length: count }, (_, i) => {
              const persona = AUDIT_PERSONAS[i % AUDIT_PERSONAS.length]
              return llmInfer(
                client,
                ctx.sessionID,
                `你是 llm_* 工具的交叉审计引擎。当前审计视角：${persona.role}；重点：${persona.focus}。请从该视角独立深入分析，指出问题、风险和改进建议，输出中文。`,
                conversation,
                taskBody,
                ctx.abort,
                { temperature: persona.temperature },
              )
            }),
          )

          const okCount = settled.filter((r) => r.status === "fulfilled").length
          if (okCount === 0) {
            const reasons = settled
              .map((r, i) =>
                r.status === "rejected"
                  ? `审计员${i + 1}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`
                  : null,
              )
              .filter(Boolean)
              .join("; ")
            throw new Error(`[llm_cross_audit] 全部审计员失败: ${reasons}`)
          }

          // 拼装审计段：成功的给结果，失败的标注（汇总引擎仍可交叉质疑"为何缺位"）
          const auditSection = settled
            .map((r, i) => {
              const persona = AUDIT_PERSONAS[i % AUDIT_PERSONAS.length]
              const head = `## 审计员 ${i + 1}（${persona.role}）`
              if (r.status === "fulfilled") return `${head}\n${r.value}`
              const why = r.reason instanceof Error ? r.reason.message : String(r.reason)
              return `${head}\n> ⚠️ 该审计员推理失败: ${why}`
            })
            .join("\n\n")

          // 汇总推理失败 → 自然向上抛（status:error）
          const summary = await llmInfer(
            client,
            ctx.sessionID,
            "你是 llm_* 工具的审计汇总引擎，请综合交叉质疑各方观点并给出最终结论，输出中文。",
            conversation,
            `${synthInst}\n\n${auditSection}`,
            ctx.abort,
          )
          return [`# 交叉审计报告`, ``, auditSection, ``, `## 综合与交叉质疑`, summary].join("\n")
        },
      }),
    } as unknown as Record<string, ToolDefinition>,
  }
}

export default {
  id: "llm-tools",
  server: LlmToolsPlugin,
} as const
