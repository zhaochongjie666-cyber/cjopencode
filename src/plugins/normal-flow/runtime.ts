/**
 * normal-flow runtime: 类型 + 文件优先的 runtime store。
 * runtime.json 是唯一事实来源（SSOT），每次属性读写都落盘。
 * 对齐 cjpi extensions/normal-flow/types.ts 的 NfRunnerState 思路。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

export const RUNTIME_DIR = ".nf"
export const RUNTIME_FILE = "runtime.json"
export const DESIGN_DIR = `${RUNTIME_DIR}/design`
export const RUNS_DIR = `${RUNTIME_DIR}/runs`

export type StageName = "design" | "attack"
export type Signal = "complete" | "verdict_pass" | "verdict_fail"
export type StageOutcome =
  | "idle" | "working" | "hard_gate_failed" | "gate_passed"
  | "advanced" | "completed" | "failed" | "paused"

export interface RuntimeState {
  runId: string
  cwd: string
  userInput: string
  sessionID: string | null
  plan: Array<{ stageName: StageName; originalIndex: number }>
  planIndex: number
  status: "running" | "paused" | "completed" | "failed"
  signals: Signal[]
  submittedArtifacts: Record<string, string[]>
  stageOutcome: StageOutcome
  lastStageError: string | null
  selfHealUsed: Record<string, number>
  maxSelfHealPerStage: number
  flowRollbackCount: number
  flowRollbackLimit: number
  lastSteerAt: number
  steerCount: number
  paused: boolean
  stopRequested: boolean
  runComplete: boolean
  at: string
}

export function runtimePath(worktree: string): string {
  return join(worktree, RUNTIME_DIR, RUNTIME_FILE)
}

export function defaultRuntime(
  runId = "",
  cwd = "",
  userInput = "",
  sessionID: string | null = null,
): RuntimeState {
  return {
    runId, cwd, userInput, sessionID,
    plan: [
      { stageName: "design", originalIndex: 0 },
      { stageName: "attack", originalIndex: 1 },
    ],
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
}

export function loadRuntime(worktree: string): RuntimeState | null {
  const p = runtimePath(worktree)
  try {
    const text = readFileSync(p, "utf8")
    if (!text.trim()) return null
    const raw = JSON.parse(text) as Partial<RuntimeState>
    return { ...defaultRuntime(), ...raw } as RuntimeState
  } catch {
    return null
  }
}

export function saveRuntime(worktree: string, state: RuntimeState): void {
  const p = runtimePath(worktree)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify({ ...state, at: new Date().toISOString() }, null, 2) + "\n", "utf8")
}

/** 读-改-写：每次改动都落盘，保证跨调用一致。 */
export function mutateRuntime(worktree: string, fn: (s: RuntimeState) => void): RuntimeState {
  const cur = loadRuntime(worktree) ?? defaultRuntime()
  fn(cur)
  saveRuntime(worktree, cur)
  return cur
}

export function scaffoldDirs(worktree: string): string[] {
  const dirs = [
    join(worktree, RUNTIME_DIR),
    join(worktree, DESIGN_DIR),
    join(worktree, DESIGN_DIR, "spec"),
    join(worktree, RUNS_DIR),
  ]
  const created: string[] = []
  for (const d of dirs) {
    if (!existsSync(d)) {
      mkdirSync(d, { recursive: true })
      created.push(d)
    }
  }
  return created
}
