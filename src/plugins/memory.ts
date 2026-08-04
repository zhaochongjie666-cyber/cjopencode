import type { Plugin, ToolDefinition } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { embed, embedMany, rerank, cosineSimilarity } from "ai"

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------
const EMBEDDING_MODEL = process.env.MEMORY_EMBEDDING_MODEL ?? "openai/text-embedding-3-small"
const RERANK_MODEL = process.env.MEMORY_RERANK_MODEL ?? "cohere/rerank-v3.5"
const MAX_MEMORIES = Number(process.env.MEMORY_MAX_ITEMS ?? "2000")
const TOP_K = Number(process.env.MEMORY_TOP_K ?? "10")
const RERANK_TOP_N = Number(process.env.MEMORY_RERANK_TOP_N ?? "5")
const STORE_PATH = process.env.MEMORY_STORE_PATH ?? ""

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
  const { embedding } = await embed({ model: EMBEDDING_MODEL as any, value: text })
  return embedding
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({ model: EMBEDDING_MODEL as any, values: texts })
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

  // 2) Rerank 精排
  try {
    const { results } = await rerank({
      model: RERANK_MODEL as any,
      query,
      documents: candidates.map((c) => c.text),
      topN: rerankTopN,
    })
    return results.map((r: any) => ({
      id: candidates[r.index].id,
      text: candidates[r.index].text,
      score: r.relevanceScore ?? r.score ?? 0,
    }))
  } catch {
    // rerank 不可用时降级为 embedding 排序
    return candidates.slice(0, rerankTopN).map((c) => ({
      id: c.id,
      text: c.text,
      score: c.score,
    }))
  }
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
