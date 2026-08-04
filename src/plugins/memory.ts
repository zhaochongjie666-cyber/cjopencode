import type { Plugin, ToolDefinition } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { embed, embedMany, cosineSimilarity } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { spawn } from "bun"

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------
const VLLM_HOST = process.env.MEMORY_VLLM_HOST ?? "127.0.0.1"
const VLLM_PORT = process.env.MEMORY_VLLM_PORT ?? "8100"
const VLLM_BASE_URL = process.env.MEMORY_VLLM_BASE_URL ?? `http://${VLLM_HOST}:${VLLM_PORT}/v1`
const EMBEDDING_MODEL_ID = process.env.MEMORY_EMBEDDING_MODEL ?? "BAAI/bge-m3"
const MAX_MEMORIES = Number(process.env.MEMORY_MAX_ITEMS ?? "2000")
const TOP_K = Number(process.env.MEMORY_TOP_K ?? "10")
const RERANK_TOP_N = Number(process.env.MEMORY_RERANK_TOP_N ?? "5")
const STORE_PATH = process.env.MEMORY_STORE_PATH ?? ""
const VLLM_STARTUP_TIMEOUT = Number(process.env.MEMORY_VLLM_STARTUP_TIMEOUT ?? "600") // 秒（含镜像拉取）
const VLLM_EXTRA_ARGS = process.env.MEMORY_VLLM_EXTRA_ARGS ?? "" // 额外 vllm 参数
const VLLM_DOCKER_IMAGE = process.env.MEMORY_VLLM_DOCKER_IMAGE ?? "vllm/vllm-openai:latest"
const VLLM_CONTAINER_NAME = process.env.MEMORY_VLLM_CONTAINER_NAME ?? "opencode-memory-vllm"
const VLLM_GPU_COUNT = process.env.MEMORY_VLLM_GPU_COUNT ?? "all" // "all" 或具体数字

// ---------------------------------------------------------------------------
// Docker 容器管理：拉取镜像、启动容器、健康检查
// ---------------------------------------------------------------------------
let vllmReady = false

/** 执行命令并返回 stdout */
async function exec(cmd: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = spawn(cmd, { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stdout: stdout.trim(), stderr: stderr.trim() }
}

/** 检查 vLLM 服务是否已在运行 */
async function isVllmHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`http://${VLLM_HOST}:${VLLM_PORT}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}

/** 检查 Docker 是否可用 */
async function ensureDocker(): Promise<void> {
  const { code } = await exec(["docker", "info"])
  if (code !== 0) {
    throw new Error("[memory] Docker 不可用，请确保已安装 Docker 并且 Docker daemon 正在运行")
  }
}

/** 检查容器是否已在运行 */
async function isContainerRunning(): Promise<boolean> {
  const { code, stdout } = await exec([
    "docker", "inspect", "-f", "{{.State.Running}}", VLLM_CONTAINER_NAME,
  ])
  return code === 0 && stdout === "true"
}

/** 启动 vLLM Docker 容器 */
async function startVllmContainer(): Promise<void> {
  // 先移除同名旧容器（如果存在）
  await exec(["docker", "rm", "-f", VLLM_CONTAINER_NAME])

  const args = [
    "docker", "run", "-d",
    "--name", VLLM_CONTAINER_NAME,
    "--gpus", VLLM_GPU_COUNT,
    "--ipc=host",
    "-p", `${VLLM_PORT}:8000`,
    "-v", `${process.env.HOME ?? "/root"}/.cache/huggingface:/root/.cache/huggingface`,
    VLLM_DOCKER_IMAGE,
    "--model", EMBEDDING_MODEL_ID,
    "--task", "embed",
    "--host", "0.0.0.0",
    "--port", "8000",
  ]
  // 追加用户自定义参数
  if (VLLM_EXTRA_ARGS.trim()) {
    args.push(...VLLM_EXTRA_ARGS.trim().split(/\s+/))
  }

  console.log(`[memory] 启动 vLLM 容器: ${args.join(" ")}`)
  const { code, stderr } = await exec(args)
  if (code !== 0) {
    throw new Error(`[memory] Docker 容器启动失败: ${stderr}`)
  }
  console.log(`[memory] 容器 ${VLLM_CONTAINER_NAME} 已启动`)
}

/** 等待 vLLM 健康检查通过 */
async function waitForVllm(timeoutSec: number): Promise<void> {
  const deadline = Date.now() + timeoutSec * 1000
  while (Date.now() < deadline) {
    if (await isVllmHealthy()) {
      console.log("[memory] vLLM 服务就绪")
      return
    }
    // 检查容器是否意外退出
    const running = await isContainerRunning()
    if (!running) {
      const { stdout } = await exec(["docker", "logs", "--tail", "30", VLLM_CONTAINER_NAME])
      throw new Error(`[memory] vLLM 容器已退出。日志:\n${stdout}`)
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error(`[memory] vLLM 在 ${timeoutSec}s 内未就绪，启动超时`)
}

/** 确保 vLLM 可用：检测 → Docker 启动 → 等待就绪 */
async function ensureVllm(): Promise<void> {
  if (vllmReady) return
  // 如果已有 vLLM 服务在运行（外部或之前启动的容器），直接复用
  if (await isVllmHealthy()) {
    vllmReady = true
    console.log("[memory] 检测到已运行的 vLLM 服务，直接复用")
    return
  }
  // 检查 Docker
  await ensureDocker()
  // 如果容器存在但未就绪，可能正在加载模型，先检查
  if (await isContainerRunning()) {
    console.log("[memory] 容器已在运行，等待就绪 …")
  } else {
    await startVllmContainer()
  }
  // 等待就绪（含镜像拉取 + 模型下载，可能较久）
  await waitForVllm(VLLM_STARTUP_TIMEOUT)
  vllmReady = true
}

// 进程退出时不主动删除容器 —— 让它持续运行供后续复用

// ---------------------------------------------------------------------------
// vLLM provider（通过 OpenAI 兼容接口访问本地 vLLM 服务）
// ---------------------------------------------------------------------------
const vllm = createOpenAI({ baseURL: VLLM_BASE_URL, apiKey: "not-needed" })
const embeddingModel = vllm.embedding(EMBEDDING_MODEL_ID)

// ---------------------------------------------------------------------------
// 内存记忆存储
// ---------------------------------------------------------------------------
interface MemoryEntry {
  id: string
  text: string
  embedding: number[]
  metadata: {
    source: "llm_inference" | "user_store" | "tool_result"
    sessionID?: string
    timestamp: number
    [key: string]: unknown
  }
}

let memories: MemoryEntry[] = []
let nextId = 1

/** 持久化到磁盘（best-effort） */
async function persist() {
  if (!STORE_PATH) return
  try {
    const data = JSON.stringify(memories)
    await Bun.write(STORE_PATH, data)
  } catch {
    // 静默失败 —— 持久化为可选功能
  }
}

/** 从磁盘恢复 */
async function restore() {
  if (!STORE_PATH) return
  try {
    const file = Bun.file(STORE_PATH)
    if (await file.exists()) {
      const raw = await file.text()
      memories = JSON.parse(raw) as MemoryEntry[]
      nextId = memories.reduce((m, e) => Math.max(m, Number(e.id) + 1), 1)
    }
  } catch {
    // 静默
  }
}

// ---------------------------------------------------------------------------
// Embedding 辅助
// ---------------------------------------------------------------------------
async function embedText(text: string): Promise<number[]> {
  await ensureVllm()
  const { embedding } = await embed({ model: embeddingModel, value: text })
  return embedding
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  await ensureVllm()
  const { embeddings } = await embedMany({ model: embeddingModel, values: texts })
  return embeddings
}

// ---------------------------------------------------------------------------
// 核心：存储 / 检索
// ---------------------------------------------------------------------------
async function storeMemory(
  text: string,
  source: MemoryEntry["metadata"]["source"],
  sessionID?: string,
  extra?: Record<string, unknown>,
): Promise<MemoryEntry> {
  const emb = await embedText(text)
  const entry: MemoryEntry = {
    id: String(nextId++),
    text,
    embedding: emb,
    metadata: { source, sessionID, timestamp: Date.now(), ...extra },
  }
  memories.push(entry)
  // 超出上限时淘汰最旧的
  if (memories.length > MAX_MEMORIES) {
    memories = memories.slice(memories.length - MAX_MEMORIES)
  }
  await persist()
  return entry
}

async function searchMemory(
  query: string,
  topK: number = TOP_K,
  rerankTopN: number = RERANK_TOP_N,
): Promise<Array<{ id: string; text: string; score: number }>> {
  if (memories.length === 0) return []

  // 1) Embedding 粗检索 —— 余弦相似度
  const queryEmb = await embedText(query)
  const scored = memories.map((m) => ({
    ...m,
    score: cosineSimilarity(queryEmb, m.embedding),
  }))
  scored.sort((a, b) => b.score - a.score)
  const candidates = scored.slice(0, topK)

  // 精排 —— 本地模式下使用纯 embedding 余弦相似度排序（无需远程 Rerank API）
  return candidates.slice(0, rerankTopN).map((c) => ({
    id: c.id,
    text: c.text,
    score: c.score,
  }))
}

// ---------------------------------------------------------------------------
// 截断文本，避免对极长内容做 embedding
// ---------------------------------------------------------------------------
function truncate(text: string, maxLen = 4000): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "…(已截断)" : text
}

// ---------------------------------------------------------------------------
// Plugin 导出
// ---------------------------------------------------------------------------
export const MemoryPlugin: Plugin = async (input) => {
  await restore()

  return {
    // -----------------------------------------------------------------------
    // Event hook：拦截所有 LLM 推理结果并存储
    // -----------------------------------------------------------------------
    event: async ({ event }: { event: { type: string; properties?: any } }) => {
      try {
        if (event.type === "message.updated") {
          const parts = event.properties?.parts as Array<{ type: string; text?: string }> | undefined
          if (!parts) return
          const text = parts
            .filter((p) => p.type === "text" && typeof p.text === "string")
            .map((p) => p.text as string)
            .join("\n")
            .trim()
          if (!text) return

          const sessionID = event.properties?.sessionID as string | undefined
          await storeMemory(truncate(text), "llm_inference", sessionID)
        }
      } catch {
        // 静默 —— hook 不应阻塞主流程
      }
    },

    // -----------------------------------------------------------------------
    // Tool hooks：拦截工具调用前后
    // -----------------------------------------------------------------------
    "tool.execute.after": async (
      toolInput: { tool: string; args: Record<string, any> },
      toolOutput: { output?: string },
    ) => {
      try {
        const output = typeof toolOutput.output === "string" ? toolOutput.output : ""
        if (!output) return
        await storeMemory(
          truncate(`[tool:${toolInput.tool}] ${output}`),
          "tool_result",
          undefined,
          { toolName: toolInput.tool },
        )
      } catch {
        // 静默
      }
    },

    // -----------------------------------------------------------------------
    // 自定义 Tools：供 Agent 主动存储/检索记忆
    // -----------------------------------------------------------------------
    tool: {
      memory_store: tool({
        description:
          "将一段文本存入长期记忆。文本会被 Embedding 后持久存储，后续可通过 memory_search 语义检索。",
        args: {
          text: tool.schema.string().describe("要存储的文本内容"),
          tags: tool.schema.string().optional().describe("可选标签，用逗号分隔"),
        },
        async execute(args, ctx) {
          const entry = await storeMemory(
            truncate(args.text),
            "user_store",
            ctx.sessionID,
            args.tags ? { tags: args.tags.split(",").map((t: string) => t.trim()) } : {},
          )
          return `已存储记忆 #${entry.id}（${entry.text.length} 字符）`
        },
      }),

      memory_search: tool({
        description:
          "语义检索记忆库。先使用 Embedding 余弦相似度粗检索 top-K，再用 Rerank 模型精排返回最相关结果。",
        args: {
          query: tool.schema.string().describe("检索查询文本"),
          top_k: tool.schema.number().optional().describe(`粗检索数量，默认 ${TOP_K}`),
          top_n: tool.schema.number().optional().describe(`精排返回数量，默认 ${RERANK_TOP_N}`),
        },
        async execute(args) {
          const results = await searchMemory(
            args.query,
            args.top_k ?? TOP_K,
            args.top_n ?? RERANK_TOP_N,
          )
          if (results.length === 0) return "记忆库中未找到相关内容。"
          return results
            .map((r, i) => `### ${i + 1}. [#${r.id}] (score: ${r.score.toFixed(3)})\n${r.text}`)
            .join("\n\n")
        },
      }),

      memory_list: tool({
        description: "列出记忆库中最近存储的记忆条目。",
        args: {
          count: tool.schema.number().optional().describe("返回数量，默认 20"),
        },
        async execute(args) {
          const n = Math.min(args.count ?? 20, 100)
          const recent = memories.slice(-n).reverse()
          if (recent.length === 0) return "记忆库为空。"
          return recent
            .map(
              (m) =>
                `- **#${m.id}** [${m.metadata.source}] ${new Date(m.metadata.timestamp).toLocaleString()}\n  ${m.text.slice(0, 120)}${m.text.length > 120 ? "…" : ""}`,
            )
            .join("\n")
        },
      }),

      memory_delete: tool({
        description: "按 ID 删除指定记忆条目。",
        args: {
          id: tool.schema.string().describe("要删除的记忆 ID"),
        },
        async execute(args) {
          const idx = memories.findIndex((m) => m.id === args.id)
          if (idx === -1) return `未找到记忆 #${args.id}`
          memories.splice(idx, 1)
          await persist()
          return `已删除记忆 #${args.id}`
        },
      }),
    } as unknown as Record<string, ToolDefinition>,
  }
}

export default MemoryPlugin
