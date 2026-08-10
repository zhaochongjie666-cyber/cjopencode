/// <reference types="bun-types" />
/**
 * cj-brain —— "换脑子"插件（动态 system 注入）
 *
 * 配合 agents/cj.md 使用。cj.md 是静态脑子（性格/工作流），本插件是动态脑子：
 * 每轮 LLM 调用前，往 cj agent 的 system 末尾注入当前轮次 / 已用工具 / 阶段提示，
 * 让模型"记得"自己在第几轮、处于哪个阶段。
 *
 * 只对 agent === "cj" 的会话生效；其他 agent（build/plan/...）原样放行。
 *
 * 这是**软换脑**：通过 system prompt 引导模型按 cj.md 的规矩走，不是硬控制流。
 * 模型若某轮不听话直接给答案，opencode 的 loop 照样停 —— 那是 loop 的边界，不是本插件能破的。
 *
 * Hook 边界（已核实 opencode 源码）：
 *   - chat.message: input 有 agent → 用来建 sessionID→agent 映射（system.transform 没有 agent 输入）
 *   - experimental.chat.system.transform: input { sessionID, model }，可改 output.system: string[]
 *   - tool.execute.before: input { tool, sessionID, callID }，可观测工具使用
 */
import type { Plugin } from "@opencode-ai/plugin"

const TARGET_AGENT = "cj"
const DEBUG = process.env.CJ_BRAIN_DEBUG === "1"

type SessionState = {
  agent: string
  turn: number // system.transform 触发次数 = LLM 轮次
  toolsUsed: string[] // 本会话已用工具名（按调用序，不去重）
  lastToolAt: number // 最后一次工具调用时的 turn（用于阶段启发式）
}

// 内存态：sessionID → state。进程重启清空（第一版够用；要持久化另做）
const sessions = new Map<string, SessionState>()

function getState(sessionID: string | undefined): SessionState | undefined {
  if (!sessionID) return undefined
  return sessions.get(sessionID)
}

function ensureState(sessionID: string, agent: string): SessionState {
  let s = sessions.get(sessionID)
  if (!s) {
    s = { agent, turn: 0, toolsUsed: [], lastToolAt: 0 }
    sessions.set(sessionID, s)
  }
  return s
}

function dbg(...args: unknown[]) {
  if (DEBUG) console.error("[cj-brain]", ...args)
}

/**
 * 阶段启发式：根据 state 推断当前阶段，给模型一句提示。
 * 第一版用简单规则，看效果再迭代。
 *   - turn 1 且没调过工具 → "理解"（先 llm_understand_task）
 *   - 调过工具但最近几轮没新工具 → 可能卡住 → "反思"
 *   - 其他 → "执行"
 */
function phaseHint(s: SessionState): string {
  if (s.turn <= 1 && s.toolsUsed.length === 0) {
    return "阶段【理解】：动手前先用 llm_understand_task 拆解任务（除非任务极小）"
  }
  // 调过工具，但距离上次工具调用已过 ≥3 轮 → 可能空转，提示反思
  if (s.toolsUsed.length > 0 && s.turn - s.lastToolAt >= 3) {
    return "阶段【反思】：已几轮没用工具，若在空转，考虑 llm_reflect_midway 或直接给结论"
  }
  return "阶段【执行】：按理解逐子目标动手；遇歧义/关键转折用 llm_reflect_midway"
}

const CjBrainPlugin: Plugin = async (_input) => {
  // 不注册工具；cj agent 用原生工具 + 全局注册的 llm_* 工具。
  // 这里只挂 loop 引导 hook：chat.message 建映射、tool.execute.before 观测、
  // experimental.chat.system.transform 每轮注入动态上下文（仅对 cj 生效）。
  return {
    // 用户发消息时：建立/刷新 sessionID → agent 映射
    "chat.message": async (input, _output) => {
      const sid = input.sessionID
      const agent = input.agent ?? "build"
      ensureState(sid, agent).agent = agent
      dbg(`chat.message sid=${sid} agent=${agent}`)
    },

    // 工具执行前：若是 cj 会话，记录工具使用
    "tool.execute.before": async (input, _output) => {
      const s = getState(input.sessionID)
      if (!s || s.agent !== TARGET_AGENT) return
      s.toolsUsed.push(input.tool)
      s.lastToolAt = s.turn
      dbg(`tool.before sid=${input.sessionID} tool=${input.tool} (turn ${s.turn}, total ${s.toolsUsed.length})`)
    },

    // 每轮 LLM 调用前：只对 cj agent 注入动态 system
    "experimental.chat.system.transform": async (input, output) => {
      const sid = input.sessionID
      const s = getState(sid)
      // 非 cj 会话：原样放行（关键，别影响 build/plan/...）
      if (!s || s.agent !== TARGET_AGENT) return
      s.turn += 1

      const toolsSummary =
        s.toolsUsed.length === 0
          ? "（暂无）"
          : dedupeRecent(s.toolsUsed, 8).join(", ")
      const inject =
        `\n[cj-brain] 第 ${s.turn} 轮 | 已用工具：${toolsSummary} | ${phaseHint(s)}。` +
        `遵循 cj agent 的工作节奏（理解→执行→反思→评估）。`

      output.system.push(inject)
      dbg(`system.transform sid=${sid} turn=${s.turn} injected`)
    },
  }
}

// 保留最近 N 个工具名，轻度去重（连续相同合并），避免清单过长
function dedupeRecent(tools: string[], n: number): string[] {
  const out: string[] = []
  for (const t of tools) {
    if (out[out.length - 1] !== t) out.push(t)
  }
  return out.slice(-n)
}

export default {
  id: "cj-brain",
  server: CjBrainPlugin,
} as const
