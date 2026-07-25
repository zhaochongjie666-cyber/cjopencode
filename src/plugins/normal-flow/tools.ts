/**
 * nf_* 控制器工具。对齐 cjpi extensions/normal-flow/tools/ 的 6 个工具：
 * nf_start / nf_observe / nf_desired_state / nf_difference / nf_submit / nf_advance / nf_resume。
 *
 * 工具是 controller 的对外 API：flow_agent 调这些工具推进流程，
 * 工具内部跑 dispatch + 落盘 + 跑真实硬 Gate。
 */
import { tool } from "@opencode-ai/plugin"
import {
  defaultRuntime,
  loadRuntime,
  mutateRuntime,
  saveRuntime,
  scaffoldDirs,
  type RuntimeState,
} from "./runtime.ts"
import { NF_STAGES, stageByName, type StageSpec } from "./stages.ts"
import {
  currentStage,
  currentStageName,
  dispatch,
  steerText,
  type Command,
} from "./controller.ts"
import { existsSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const WALK_EXCLUDE = new Set([
  "node_modules", ".git", "dist", "build", "vendor",
  ".next", "target", ".cache", ".turbo", "coverage", ".nf",
])

function walkRelSync(dir: string, maxFiles = 5000): string[] {
  const out: string[] = []
  const stack: string[] = [dir]
  let count = 0
  while (stack.length > 0 && count < maxFiles) {
    const cur = stack.pop() as string
    let entries: string[]
    try { entries = readdirSync(cur) } catch { continue }
    for (const name of entries) {
      if (WALK_EXCLUDE.has(name)) continue
      const full = join(cur, name)
      let st
      try { st = statSync(full) } catch { continue }
      count++
      if (st.isDirectory()) stack.push(full)
      else out.push(relative(dir, full).replace(/\\/g, "/"))
    }
  }
  return out
}

function requireGlobsSync(cwd: string, patterns: readonly string[]): boolean {
  if (patterns.length === 0) return false
  let walked: string[] | undefined
  for (const p of patterns) {
    if (!/[*?]/.test(p)) { if (existsSync(join(cwd, p))) return true; continue }
    if (walked === undefined) walked = walkRelSync(cwd)
    const re = new RegExp(
      "^" + p.split("/").map((s) =>
        s === "**" ? "(?:[^/]+/)*" : s.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]"),
      ).join("/") + "$",
    )
    if (walked.some((f) => re.test(f))) return true
  }
  return false
}

function ok(text: string) {
  return text
}

function snapshot(state: RuntimeState): string {
  const stage = currentStage(state)
  const signals = state.signals.join(", ") || "(无)"
  const arts = Object.entries(state.submittedArtifacts)
    .map(([k, v]) => `${k}: [${v.join(", ")}]`).join(" ") || "(无)"
  const heal = state.selfHealUsed[stage?.name ?? ""] ?? 0
  return [
    `run: ${state.runId}`,
    `阶段: ${stage?.name ?? "?"}（第 ${state.planIndex + 1}/${state.plan.length} 阶段，design -> attack）`,
    `角色: ${stage?.role ?? "?"}`,
    `信号: ${signals}`,
    `stageOutcome: ${state.stageOutcome}`,
    `lastStageError: ${state.lastStageError ?? "(无)"}`,
    `产物闸门(任一): ${stage?.deliverablePaths.join(", ") ?? "(软通过)"}`,
    `已提交产物: ${arts}`,
    `自愈预算(当前阶段): ${state.maxSelfHealPerStage - heal}/${state.maxSelfHealPerStage}`,
    `Flow 回退预算: ${state.flowRollbackLimit - state.flowRollbackCount}/${state.flowRollbackLimit}`,
    `状态: ${state.status}${state.paused ? " (paused)" : ""}${state.runComplete ? " (complete)" : ""}`,
  ].join("\n")
}

function renderDeliverables(cwd: string, stage: StageSpec | undefined): string {
  if (!stage) return ""
  const lines = stage.deliverablePaths.map((p) => {
    const found = requireGlobsSync(cwd, [p])
    return `  ${found ? "✅" : "⬜"} ${p}`
  })
  return `\n产物现状:\n${lines.join("\n")}`
}

export const nfTools = {
  nf_start: tool({
    description:
      "启动 Normal Flow。传入用户任务描述。会初始化 .nf/runtime.json（SSOT）并进入 design 阶段。" +
      "启动后用 nf_observe 查看状态，按 nf_difference 的差距派 nf-designer subagent 干活。",
    args: {
      task: tool.schema.string().describe("用户任务描述，要做成什么、为什么、完事是什么样"),
    },
    async execute(args, context) {
      const worktree = context.worktree
      const existing = loadRuntime(worktree)
      if (existing && !existing.runComplete && !existing.paused) {
        return ok(`[nf_start] 已有未完成的 run（${existing.runId}，阶段 ${currentStageName(existing)}）。用 nf_observe 继续，或先 nf_stop / nf_resume。`)
      }
      const runId = `nf-${Date.now()}`
      scaffoldDirs(worktree)
      const cmd: Command = {
        type: "START",
        task: args.task,
        cwd: worktree,
        sessionID: context.sessionID,
        runId,
      }
      const state = defaultRuntime()
      const result = dispatch(state, cmd)
      result.state.sessionID = context.sessionID
      saveRuntime(worktree, result.state)
      return ok(
        `[nf_start] run ${runId} 启动。当前阶段: design。\n\n` +
        snapshot(result.state) +
        `\n\n下一步: 调 nf_observe / nf_desired_state / nf_difference 看差距，然后派 @nf-designer subagent 产出设计文档。`,
      )
    },
  }),

  nf_observe: tool({
    description:
      "Observe：返回当前 Normal Flow 状态全貌（阶段/进度/信号/产物/自愈预算）+ 磁盘产物现状。" +
      "状态以磁盘为准，不信任自报完成。",
    args: {},
    async execute(_args, context) {
      const state = loadRuntime(context.worktree)
      if (!state) return ok("[nf_observe] 无活跃 run。先调 nf_start。")
      const stage = currentStage(state)
      return ok(snapshot(state) + renderDeliverables(context.worktree, stage))
    },
  }),

  nf_desired_state: tool({
    description: "返回当前阶段的 Desired State（观察型条件列表）+ 角色与应派发的 subagent。",
    args: {},
    async execute(_args, context) {
      const state = loadRuntime(context.worktree)
      if (!state) return ok("[nf_desired_state] 无活跃 run。")
      const stage = currentStage(state)
      if (!stage) return ok("[nf_desired_state] 无活跃阶段。")
      const desired = stage.desiredState.map((d, i) => `  ${i + 1}. ${d}`).join("\n")
      return ok(
        `当前阶段: ${stage.name}\n角色: ${stage.role}\n应派 subagent: @${stage.subagent}\n应装 skill: ${stage.skill}\n\nDesired State:\n${desired}`,
      )
    },
  }),

  nf_difference: tool({
    description:
      "Compare：跑本阶段真实硬 Gate + 磁盘观测，逐条返回未满足条件。不靠关键词猜测，不信任自报完成。",
    args: {},
    async execute(_args, context) {
      const state = loadRuntime(context.worktree)
      if (!state) return ok("[nf_difference] 无活跃 run。")
      const stage = currentStage(state)
      if (!stage) return ok("[nf_difference] 无活跃阶段。")
      const gateResult = await stage.gate({ cwd: context.worktree, summary: "" })
      const desired = stage.desiredState.map((d, i) => `  ${i + 1}. ${d}`).join("\n")
      const artifacts = state.submittedArtifacts[stage.name] ?? []
      const heal = state.selfHealUsed[stage.name] ?? 0
      const remaining = state.maxSelfHealPerStage - heal
      const lines = [
        `当前阶段: ${stage.name}`,
        `Desired State:\n${desired}`,
        ``,
        `硬 Gate: ${gateResult.ok ? "✅ 通过" : "❌ 未通过"}${gateResult.soft ? "（软通过）" : ""}`,
        gateResult.reason ? `Gate 原因: ${gateResult.reason}` : "",
        `已提交产物: ${artifacts.length > 0 ? artifacts.join(", ") : "(无)"}`,
        `自愈预算: ${remaining}/${state.maxSelfHealPerStage}`,
        renderDeliverables(context.worktree, stage),
      ].filter(Boolean)
      let guidance: string
      if (gateResult.ok) {
        guidance = `\n\n→ Gate 已通过。立即调 nf_advance 推进。`
      } else if (stage.name === "design") {
        guidance = `\n\n→ 派 @${stage.subagent} subagent（装 ${stage.skill} skill）按上述缺口产出/修复设计文档，完成后调 nf_submit。`
      } else {
        guidance = `\n\n→ 派 @${stage.subagent} subagent（装 ${stage.skill} skill）按上述缺口实现/攻击，完成后调 nf_submit。`
      }
      return ok(lines.join("\n") + guidance)
    },
  }),

  nf_submit: tool({
    description:
      "提交阶段产物并触发真实硬 Gate。design 阶段：summary + artifacts。attack 阶段：还需 pass（是否通过验证）。" +
      "Gate 通过后调 nf_advance 推进。",
    args: {
      summary: tool.schema.string().describe("本阶段完成内容摘要"),
      artifacts: tool.schema.array(tool.schema.string()).describe("提交的产物文件路径列表"),
      pass: tool.schema.boolean().optional().describe("仅 attack 阶段：是否通过验证"),
    },
    async execute(args, context) {
      const worktree = context.worktree
      const state = loadRuntime(worktree)
      if (!state) return ok("[nf_submit] 无活跃 run。")
      const stage = currentStage(state)
      if (!stage) return ok("[nf_submit] 无活跃阶段。")
      const summary = String(args.summary ?? "")
      const artifacts = args.artifacts ?? []
      const pass = Boolean(args.pass)
      const gateResult = await stage.gate({ cwd: worktree, summary })
      const cmd: Command = {
        type: "SUBMIT",
        stage: stage.name,
        summary,
        artifacts,
        pass,
        gateOk: gateResult.ok,
        gateReason: gateResult.reason,
      }
      const result = dispatch(state, cmd)
      saveRuntime(worktree, result.state)
      if (gateResult.ok) {
        return ok(
          `✅ ${stage.name} Gate 通过${gateResult.soft ? "（软通过）" : ""}：${summary}\n` +
          `剩余自愈预算：${state.maxSelfHealPerStage - (result.state.selfHealUsed[stage.name] ?? 0)}/${state.maxSelfHealPerStage}\n` +
          `→ 立即调 nf_advance 推进；不要停下来只汇报已提交。`,
        )
      }
      const used = result.state.selfHealUsed[stage.name] ?? 0
      const remaining = state.maxSelfHealPerStage - used
      if (result.state.stageOutcome === "gate_passed") {
        return ok(
          `⚠️ ${stage.name} Gate 未通过但预算耗尽，软通过：${gateResult.reason}\n` +
          `问题已记录带到下一阶段。→ 调 nf_advance 推进。`,
        )
      }
      return ok(
        `❌ [${used}/${state.maxSelfHealPerStage}] ${stage.name} Gate 未通过：${gateResult.reason}\n` +
        `剩余自愈预算：${remaining}/${state.maxSelfHealPerStage}。→ 修复后重新调 nf_submit。`,
      )
    },
  }),

  nf_advance: tool({
    description: "推进到下一阶段。前置：当前阶段须已调 nf_submit 并通过闸门。",
    args: {},
    async execute(_args, context) {
      const worktree = context.worktree
      const state = loadRuntime(worktree)
      if (!state) return ok("[nf_advance] 无活跃 run。")
      const result = dispatch(state, { type: "ADVANCE" })
      saveRuntime(worktree, result.state)
      if (result.state.runComplete) {
        return ok(`[nf_advance] 最终阶段通过，Normal Flow 完成 ✅。\n${snapshot(result.state)}`)
      }
      const next = currentStageName(result.state) ?? "?"
      return ok(`[nf_advance] 进入下一阶段 ${next}。\n${snapshot(result.state)}`)
    },
  }),

  nf_resume: tool({
    description: "恢复已暂停的 Normal Flow run。",
    args: {},
    async execute(_args, context) {
      const worktree = context.worktree
      const state = loadRuntime(worktree)
      if (!state) return ok("[nf_resume] 无活跃 run。")
      const result = dispatch(state, { type: "RESUME" })
      result.state.sessionID = context.sessionID
      saveRuntime(worktree, result.state)
      return ok(`[nf_resume] 已恢复。\n${snapshot(result.state)}`)
    },
  }),
}
