/**
 * Controller：纯状态机。dispatch(command) -> { state, effects }。
 * 对齐 cjpi extensions/normal-flow/core/controller.ts，但去掉 healing/AIGate，
 * 只保留 START / SUBMIT / ADVANCE / ROLLBACK / STOP / RESUME / RECORD_SIGNAL。
 *
 * 不直接写文件 -- 由调用方拿到结果后 saveRuntime。
 */
import { NF_STAGES, type StageSpec } from "./stages.ts"
import type {
  RuntimeState,
  Signal,
  StageName,
  StageOutcome,
} from "./runtime.ts"

export type Effect =
  | { type: "STEER"; text: string }
  | { type: "NOTIFY"; level: "info" | "warning" | "error"; text: string }
  | { type: "ABORT_AGENT" }

export interface TransitionResult {
  state: RuntimeState
  effects: Effect[]
}

export type Command =
  | { type: "START"; task: string; cwd: string; sessionID: string; runId: string }
  | { type: "SUBMIT"; stage: StageName; summary: string; artifacts: string[]; pass: boolean; gateOk: boolean; gateReason?: string }
  | { type: "ADVANCE" }
  | { type: "ROLLBACK"; target: StageName; reason: string }
  | { type: "STOP" }
  | { type: "RESUME" }
  | { type: "RECORD_SIGNAL"; signal: Signal }

function clone(s: RuntimeState): RuntimeState {
  return JSON.parse(JSON.stringify(s))
}

function stamp(s: RuntimeState): RuntimeState {
  s.at = new Date().toISOString()
  return s
}

export function currentStage(state: RuntimeState): StageSpec | undefined {
  const entry = state.plan[state.planIndex]
  if (!entry) return undefined
  return NF_STAGES[entry.originalIndex]
}

export function currentStageName(state: RuntimeState): StageName | undefined {
  return state.plan[state.planIndex]?.stageName
}

export function dispatch(state: RuntimeState, command: Command): TransitionResult {
  const next = clone(state)
  const effects: Effect[] = []
  switch (command.type) {
    case "START":
      return startTransition(command)
    case "SUBMIT":
      return submitTransition(next, command, effects)
    case "ADVANCE":
      return advanceTransition(next, effects)
    case "ROLLBACK":
      return rollbackTransition(next, command, effects)
    case "STOP":
      return stopTransition(next, effects)
    case "RESUME":
      return resumeTransition(next, effects)
    case "RECORD_SIGNAL":
      if (!next.signals.includes(command.signal)) next.signals.push(command.signal)
      return { state: stamp(next), effects }
  }
}

function startTransition(command: Extract<Command, { type: "START" }>): TransitionResult {
  const state: RuntimeState = {
    runId: command.runId,
    cwd: command.cwd,
    userInput: command.task,
    sessionID: command.sessionID,
    plan: NF_STAGES.map((s, i) => ({ stageName: s.name, originalIndex: i })),
    planIndex: 0,
    status: "running",
    signals: [],
    submittedArtifacts: {},
    stageOutcome: "idle",
    lastStageError: null,
    selfHealUsed: {},
    maxSelfHealPerStage: 3,
    flowRollbackCount: 0,
    flowRollbackLimit: 8,
    lastSteerAt: 0,
    steerCount: 0,
    paused: false,
    stopRequested: false,
    runComplete: false,
    at: new Date().toISOString(),
  }
  return {
    state: stamp(state),
    effects: [{ type: "STEER", text: steerText("idle", "design") }],
  }
}

function submitTransition(
  state: RuntimeState,
  command: Extract<Command, { type: "SUBMIT" }>,
  effects: Effect[],
): TransitionResult {
  state.submittedArtifacts[command.stage] = command.artifacts
  if (command.gateOk) {
    state.stageOutcome = "gate_passed"
    state.lastStageError = null
    if (!state.signals.includes("complete")) state.signals.push("complete")
    if (command.pass && !state.signals.includes("verdict_pass")) state.signals.push("verdict_pass")
    return { state: stamp(state), effects }
  }
  state.stageOutcome = "hard_gate_failed"
  state.lastStageError = command.gateReason ?? "硬 Gate 未通过"
  const used = (state.selfHealUsed[command.stage] ?? 0) + 1
  state.selfHealUsed[command.stage] = used
  const stage = NF_STAGES.find((s) => s.name === command.stage)!
  const exhausted = used >= state.maxSelfHealPerStage
  if (exhausted && stage.exit !== "verdict") {
    state.signals = state.signals.filter((s) => s !== "complete")
    state.signals.push("complete")
    state.stageOutcome = "gate_passed"
    return {
      state: stamp(state),
      effects: [{
        type: "NOTIFY",
        level: "warning",
        text: `⚠️ design Gate 未通过且预算耗尽：${state.lastStageError}\n问题已记录带到 attack 阶段，现软通过；请调 nf_advance 推进。`,
      }],
    }
  }
  return {
    state: stamp(state),
    effects: [{
      type: "STEER",
      text: `❌ [${used}/${state.maxSelfHealPerStage}] ${command.stage} Gate 未通过：${state.lastStageError}\n请按上述缺口修复后重新调 nf_submit。`,
    }],
  }
}

function advanceTransition(state: RuntimeState, effects: Effect[]): TransitionResult {
  const stage = currentStage(state)
  const passed = stage?.exit === "verdict"
    ? state.signals.includes("verdict_pass")
    : state.signals.includes("complete")
  if (!passed) {
    return {
      state: stamp(state),
      effects: [{
        type: "STEER",
        text: `[nf_advance] 当前阶段 ${stage?.name ?? "?"} 尚未通过 Gate；请先调 nf_submit 并通过闸门。`,
      }],
    }
  }
  state.planIndex += 1
  state.signals = []
  if (state.planIndex >= state.plan.length) {
    state.runComplete = true
    state.status = "completed"
    state.stageOutcome = "completed"
    return { state: stamp(state), effects }
  }
  state.stageOutcome = "advanced"
  const next = currentStageName(state) ?? "?"
  return {
    state: stamp(state),
    effects: [{ type: "STEER", text: steerText("advanced", next) }],
  }
}

function rollbackTransition(
  state: RuntimeState,
  command: Extract<Command, { type: "ROLLBACK" }>,
  effects: Effect[],
): TransitionResult {
  const idx = state.plan.findIndex((e) => e.stageName === command.target)
  if (idx < 0 || idx >= state.planIndex) {
    return {
      state: stamp(state),
      effects: [{ type: "NOTIFY", level: "error", text: `rollback 目标 ${command.target} 必须早于当前阶段` }],
    }
  }
  if (state.flowRollbackCount >= state.flowRollbackLimit) {
    state.status = "failed"
    state.stageOutcome = "failed"
    state.lastStageError = `流程回退预算耗尽（${state.flowRollbackCount}/${state.flowRollbackLimit}）`
    state.stopRequested = true
    return {
      state: stamp(state),
      effects: [{ type: "NOTIFY", level: "error", text: `[normal-flow] ${state.lastStageError}。` }],
    }
  }
  state.planIndex = idx
  state.flowRollbackCount += 1
  state.selfHealUsed[command.target] = 0
  state.signals = []
  state.stageOutcome = "advanced"
  state.lastStageError = command.reason
  for (const entry of state.plan.slice(idx)) {
    delete state.submittedArtifacts[entry.stageName]
  }
  return {
    state: stamp(state),
    effects: [{ type: "STEER", text: steerText("advanced", command.target) }],
  }
}

function stopTransition(state: RuntimeState, effects: Effect[]): TransitionResult {
  if (state.paused) return { state: stamp(state), effects }
  state.status = "paused"
  state.paused = true
  state.stopRequested = true
  state.stageOutcome = "paused"
  effects.push({ type: "ABORT_AGENT" })
  effects.push({ type: "NOTIFY", level: "warning", text: "[normal-flow] run 已暂停。可用 nf_resume 恢复。" })
  return { state: stamp(state), effects }
}

function resumeTransition(state: RuntimeState, effects: Effect[]): TransitionResult {
  if (!state.paused) {
    return { state: stamp(state), effects: [{ type: "NOTIFY", level: "info", text: "[normal-flow] 当前 run 未暂停。" }] }
  }
  state.status = "running"
  state.paused = false
  state.stopRequested = false
  state.stageOutcome = "idle"
  state.lastStageError = null
  effects.push({ type: "STEER", text: steerText("idle", currentStageName(state) ?? "?") })
  return { state: stamp(state), effects }
}

/** 根据阶段产物计算下一步行动文本（scheduler）。 */
export function steerText(outcome: StageOutcome, stageName: string | undefined): string {
  const name = stageName ?? "?"
  switch (outcome) {
    case "gate_passed":
      return `[normal-flow] 阶段 ${name} Gate 已通过。立即调 nf_advance 推进；不要停下来只汇报已提交。`
    case "hard_gate_failed":
      return `[normal-flow] 阶段 ${name} Gate 未通过。请按 lastStageError 修复产物后重新调 nf_submit。`
    case "advanced":
      if (name === "attack") {
        return `[normal-flow] 已进入 attack 阶段。attack 不是写报告说通过就通过。你要：1) 确保所有 RXX/场景都有真实实现（无桩/占位）；2) 正向路径用 curl/测试端到端验证；3) 兜底路径（拒绝/失败/无权限/边界）也要端到端攻击；4) 把真实命令输出贴进 attack-report.md；5) P0=场景没做必须回炉，P1 必须为 0。先调 nf_observe、nf_desired_state、nf_difference 开始。`
      }
      return `[normal-flow] 已进入 ${name} 阶段。立即调 nf_observe、nf_desired_state、nf_difference，按差距派 subagent 完成产物；不要停下来只汇报。`
    case "idle":
    case "working":
      return `[normal-flow] 继续 ${name} 阶段。调 nf_observe / nf_difference 看差距，按差距派 ${name === "design" ? "nf-designer" : "nf-attacker"} subagent 干活，完成后调 nf_submit。`
    case "completed":
      return `[normal-flow] 流程已完成 ✅。`
    case "failed":
      return `[normal-flow] 流程已失败：${stageName ?? ""}。`
    case "paused":
      return `[normal-flow] 流程已暂停。`
  }
}
