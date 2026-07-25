/**
 * normal-flow plugin 入口。
 *
 * 对齐 cjpi extensions/normal-flow/extension.ts 的核心机制：
 *   - 注册 nf_* 控制器工具（tool hook）；
 *   - 监听 session.idle 事件做自动续跑 steering（等价于 pi 的
 *     sendUserMessage(..., {deliverAs:"steer"})），让 controller 真正"驱动"
 *     flow_agent，而不是被动等它记得调工具。
 *
 * steering 策略：
 *   - run 未完成/未暂停 + 距上次 steer > 4s + 每阶段 steer 上限内 -> 用
 *     client.session.promptAsync 发一条 synthetic 用户消息，内容是 steerText()；
 *   - 防死循环：每阶段 steer 次数上限 40，且 steer 文本由 stageOutcome 推导。
 */
import type { Plugin, ToolDefinition } from "@opencode-ai/plugin"
import { loadRuntime, saveRuntime, type RuntimeState } from "./runtime.ts"
import { currentStageName, steerText } from "./controller.ts"
import { nfTools } from "./tools.ts"

const STEER_MIN_INTERVAL_MS = 4_000
const STEER_MAX_PER_STAGE = 40

function shouldSteer(state: RuntimeState | null): { steer: boolean; text: string } {
  if (!state) return { steer: false, text: "" }
  if (state.runComplete || state.paused || state.stopRequested) return { steer: false, text: "" }
  if (state.status === "failed" || state.status === "completed") return { steer: false, text: "" }
  if (state.steerCount >= STEER_MAX_PER_STAGE) return { steer: false, text: "" }
  if (Date.now() - state.lastSteerAt < STEER_MIN_INTERVAL_MS) return { steer: false, text: "" }
  const text = steerText(state.stageOutcome, currentStageName(state) ?? "?")
  if (!text) return { steer: false, text: "" }
  return { steer: true, text }
}

function markSteered(state: RuntimeState): void {
  state.lastSteerAt = Date.now()
  state.steerCount += 1
  saveRuntime(state.cwd || "", state)
}

export const NormalFlowPlugin: Plugin = async (input) => {
  const { client, worktree } = input

  return {
    tool: nfTools as unknown as Record<string, ToolDefinition>,

    event: async ({ event }) => {
      if (event.type !== "session.idle") return
      const sessionID = (event as { properties?: { sessionID?: string } }).properties?.sessionID
      if (!sessionID) return
      const state = loadRuntime(worktree)
      if (!state) return
      if (state.sessionID && state.sessionID !== sessionID) return
      const { steer, text } = shouldSteer(state)
      if (!steer) return
      markSteered(state)
      try {
        await client.session.promptAsync({
          path: { id: sessionID },
          body: {
            parts: [{ type: "text", text, synthetic: true }],
          },
        })
      } catch {
        // 发送失败不能让事件循环崩；下次 idle 会重试。
      }
    },
  }
}

export default NormalFlowPlugin
