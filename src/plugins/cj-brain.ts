/// <reference types="bun-types" />
/**
 * cj-brain —— "换脑子"插件（动态状态注入，融入 opencode 体系）
 *
 * 配合 agents/cj.md。cj.md 是静态脑子（性格/工作流，流入 system header，全量缓存）；
 * 本插件是动态脑子：每轮把"第 N 轮 / 已用工具 / 阶段提示"注入到【最后一条 user 消息尾部】。
 *
 * ┌─ 缓存正确性（核心设计，勿回退到 system.transform）──────────────────────────┐
 * │ 注入点必须用 messages.transform，不能用 system.transform。原因：              │
 * │  - opencode 把 system 组装成 [header]，插件 push 后变 [header, inject]         │
 * │  - applyCachePolicy.markLastSystem(cache-policy.ts:54-59) 把 cache_control    │
 * │    打在【最后一个】system part = 打在动态 inject 上 → 每轮变 → Anthropic 全 miss │
 * │  - messages.transform 注入到最后一条 user 消息：那是 Anthropic 的 cache 边界   │
 * │    (messages:"latest-user-message", cache-policy.ts:18,91) + OpenAI 非缓存尾部 │
 * │    放变化内容不扰动任何已缓存前缀；system(header+cj.md) 保持跨轮 byte-identical   │
 * │  - 对标 opencode 自身：compaction/summary 动态内容都走 messages，从不注 system   │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 生命周期（对标 opencode 原生模式）──────────────────────────────────────────┐
 * │  - event hook: session.created 建映射(含 parentID) / session.deleted 清理       │
 * │    (对标 CodexAuthPlugin codex.ts:274-277)；第一行早返回防每-token-delta 开销   │
 * │  - dispose hook: sessions.clear() (对标 codex.ts:270-273)                      │
 * │  - experimental.session.compacting: reset turn/toolsUsed (上下文被总结,计数重来)│
 * │  - per-sessionID 独立计数；agent===targetAgent 即注入(主/子独立,简单直觉)       │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * 配置（opencode.json）：
 *   "plugin": [["cj-brain", { "targetAgent": "cj", "debug": true }]]
 * options 无 schema 校验(opencode 限制)，typo 静默失效。
 */
import type { Plugin, PluginOptions } from "@opencode-ai/plugin"

type SessionState = {
  agent: string
  isSubagent: boolean
  parentID?: string
  turn: number // 一次输入(runLoop)内的轮次；新输入(chat.message)或 compacting 时重置
  toolsUsed: string[] // 一次输入(runLoop)内已用工具名（按调用序）；同上重置
  lastToolAt: number // 最后一次工具调用时的 turn（阶段启发式用）；同上重置
}

// 内存态：sessionID → state。进程重启清空（瞬态可接受；要跨会话记忆另做持久化）
const sessions = new Map<string, SessionState>()

interface BrainConfig {
  targetAgent: string
  debug: boolean
}

function parseConfig(options: PluginOptions | undefined): BrainConfig {
  const o = (options ?? {}) as Record<string, unknown>
  return {
    targetAgent: typeof o.targetAgent === "string" ? o.targetAgent : "cj",
    debug: o.debug === true || process.env.CJ_BRAIN_DEBUG === "1",
  }
}

function ensureState(sessionID: string, agent: string, parentID?: string): SessionState {
  let s = sessions.get(sessionID)
  if (!s) {
    s = {
      agent,
      isSubagent: !!parentID,
      parentID,
      turn: 0,
      toolsUsed: [],
      lastToolAt: 0,
    }
    sessions.set(sessionID, s)
  }
  return s
}

function dbg(cfg: BrainConfig, ...args: unknown[]) {
  if (cfg.debug) console.error("[cj-brain]", ...args)
}

/** 阶段启发式：根据 state 推断当前阶段。第一版简单规则，看效果再迭代。 */
function phaseHint(s: SessionState): string {
  if (s.turn <= 1 && s.toolsUsed.length === 0) {
    return "阶段【理解】动手前先用 llm_understand_task 拆解（除非任务极小）"
  }
  if (s.toolsUsed.length > 0 && s.turn - s.lastToolAt >= 3) {
    return "阶段【反思】已几轮没用工具，若空转考虑 llm_reflect_midway 或直接给结论"
  }
  return "阶段【执行】按理解逐子目标动手；遇歧义/关键转折用 llm_reflect_midway"
}

/** 连续相同合并 + 取最近 N 个，避免清单过长 */
function dedupeRecent(tools: string[], n: number): string[] {
  const out: string[] = []
  for (const t of tools) {
    if (out[out.length - 1] !== t) out.push(t)
  }
  return out.slice(-n)
}

const CjBrainPlugin: Plugin = async (_input, options) => {
  const cfg = parseConfig(options)

  return {
    // ── 用户发消息（新一次 prompt/runLoop 开始）：建/刷 agent 映射 + 重置 runLoop 内累加状态 ──
    // turn/toolsUsed 只在一次输入触发的多轮循环内累加（让模型感知"本任务第N轮"），
    // 下次输入重来（"顺便看看 tsconfig"是新任务，不该背着上个任务的轮次/工具历史）。
    // session.compacting 也会重置（那是上下文被总结的特殊情况）。
    "chat.message": async (input, _output) => {
      const sid = input.sessionID
      const agent = input.agent ?? "build"
      const s = ensureState(sid, agent)
      s.agent = agent
      s.turn = 0
      s.toolsUsed = []
      s.lastToolAt = 0
      dbg(cfg, `chat.message sid=${sid} agent=${agent} state reset (new prompt)`)
    },

    // ── 生命周期观察：session.created 建映射(含 parentID) / session.deleted 清理 ──
    // event 对所有事件触发(含每 token 的 message.part.delta)，必须第一行早返回
    event: async (input) => {
      const ev = input.event as { type: string; properties: { info?: { id?: string; agent?: string; parentID?: string } } }
      if (ev.type !== "session.created" && ev.type !== "session.deleted") return
      const info = ev.properties?.info
      if (!info?.id) return
      if (ev.type === "session.created") {
        const agent = info.agent ?? "build"
        ensureState(info.id, agent, info.parentID)
        dbg(cfg, `session.created sid=${info.id} agent=${agent} parent=${info.parentID ?? "—"}`)
      } else {
        // session.deleted:对标 CodexAuthPlugin，清理 Map 防 leak
        sessions.delete(info.id)
        dbg(cfg, `session.deleted sid=${info.id} cleaned`)
      }
    },

    // ── compaction 兼容：上下文被总结，turn/工具计数重来(否则语义漂移误导模型) ──
    "experimental.session.compacting": async (input, _output) => {
      const s = sessions.get(input.sessionID)
      if (!s || s.agent !== cfg.targetAgent) return
      s.turn = 0
      s.toolsUsed = []
      s.lastToolAt = 0
      dbg(cfg, `compacting sid=${input.sessionID} state reset`)
    },

    // ── 工具使用观测：仅 target agent 会话记录 ──
    "tool.execute.before": async (input, _output) => {
      const s = sessions.get(input.sessionID)
      if (!s || s.agent !== cfg.targetAgent) return
      s.toolsUsed.push(input.tool)
      s.lastToolAt = s.turn
      dbg(cfg, `tool.before sid=${input.sessionID} tool=${input.tool} (turn ${s.turn}, total ${s.toolsUsed.length})`)
    },

    // ── 主注入点：每轮把动态状态追加到最后一条 user 消息尾部 ──
    // sessionID 从 messages[0].info.sessionID 取（messages.transform 的 input 是 {}，无 sessionID）
    "experimental.chat.messages.transform": async (_input, output) => {
      const msgs = output.messages as Array<{
        info: { sessionID?: string; role?: string }
        parts: Array<{ type?: string; text?: string }>
      }>
      const sid = msgs[0]?.info?.sessionID
      const s = sid ? sessions.get(sid) : undefined
      // 非 target 会话：原样放行（关键，别影响 build/plan/…）
      if (!s || s.agent !== cfg.targetAgent) return
      s.turn += 1

      // 找最后一条 user 消息
      let userMsg: (typeof msgs)[number] | undefined
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].info.role === "user") {
          userMsg = msgs[i]
          break
        }
      }
      if (!userMsg) return // 无 user 消息(异常)，跳过本轮不阻塞

      // 找其最后一个 text part，末尾追加动态行（不新增 part、不破坏结构）
      let lastText: { text?: string } | undefined
      for (let i = userMsg.parts.length - 1; i >= 0; i--) {
        if (userMsg.parts[i].type === "text") {
          lastText = userMsg.parts[i]
          break
        }
      }
      if (!lastText) return // 无 text part，跳过

      const toolsSummary =
        s.toolsUsed.length === 0 ? "（暂无）" : dedupeRecent(s.toolsUsed, 8).join(", ")
      const inject = `\n\n[cj-brain] 第 ${s.turn} 轮 | 已用工具：${toolsSummary} | ${phaseHint(s)}。遵循 cj agent 工作节奏（理解→执行→反思→评估）。`
      lastText.text = (lastText.text ?? "") + inject
      dbg(cfg, `messages.transform sid=${sid} turn=${s.turn} injected to last user msg`)
    },

    // ── 进程关闭：清空全部状态 ──
    dispose: async () => {
      sessions.clear()
      dbg(cfg, "dispose: all state cleared")
    },
  }
}

export default {
  id: "cj-brain",
  server: CjBrainPlugin,
} as const
