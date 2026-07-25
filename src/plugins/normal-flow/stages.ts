/**
 * 两阶段定义 + 真实硬 Gate。
 * 对齐 cjpi extensions/normal-flow/stages.ts，但聚焦用户需求：正向设计 + 攻击。
 *
 * design Gate：设计文档齐全 + 含兜底场景 + RXX 规则锚 + 架构要素。
 * attack Gate：构建通过 + git 有改动 + 报告有正向/兜底/命令证据 + P1=0。
 */
import {
  DESIGN_DIR,
  RUNS_DIR,
  type StageName,
} from "./runtime.ts"
import {
  gitHasChanges,
  readMatchedText,
  requireMinSize,
  runBuild,
  type GateResult,
} from "./gate.ts"

export type Gate = (args: { cwd: string; summary: string }) => Promise<GateResult>

export interface StageSpec {
  name: StageName
  role: string
  skill: string
  subagent: string
  exit: "goal_complete" | "verdict"
  desiredState: readonly string[]
  deliverablePaths: readonly string[]
  gate: Gate
  rollbackTarget: StageName | "none"
}

const designGate: Gate = async ({ cwd }) => {
  const checks: Array<[string[], number, string]> = [
    [[`${DESIGN_DIR}/intent.md`], 80, "意图锚 intent.md"],
    [[`${DESIGN_DIR}/design.md`], 150, "收敛决策 design.md"],
    [[`${DESIGN_DIR}/spec/rules.md`], 100, "RXX 规则 rules.md"],
    [[`${DESIGN_DIR}/spec/scenarios.feature`], 100, "正向与兜底场景 scenarios.feature"],
    [[`${DESIGN_DIR}/architecture.md`], 150, "架构 architecture.md"],
  ]
  for (const [pats, min, label] of checks) {
    const r = await requireMinSize(cwd, pats, min)
    if (!r.ok) return { ok: false, reason: `design Gate: 缺少${label}；${r.reason}` }
  }
  const featureText = readMatchedText(cwd, [`${DESIGN_DIR}/spec/scenarios.feature`])
  if (!/失败|拒绝|无权限|未授权|边界|invalid|unauthorized|forbidden|denied|error|冲突|超时|timeout|limit/i.test(featureText)) {
    return {
      ok: false,
      reason: "design Gate: scenarios.feature 只有正向场景，缺少兜底场景（失败/拒绝/无权限/边界）；正向和兜底都要设计",
    }
  }
  const rulesText = readMatchedText(cwd, [`${DESIGN_DIR}/spec/rules.md`])
  if (!/R\d{2}|@implements|规则|RXX/i.test(rulesText)) {
    return {
      ok: false,
      reason: "design Gate: rules.md 未提取 RXX 规则锚（R01..RNN）；请从能力提取可追溯规则",
    }
  }
  const archText = readMatchedText(cwd, [`${DESIGN_DIR}/architecture.md`])
  if (!/模块|端点|endpoint|事件|event|数据|存储|database|依赖/i.test(archText)) {
    return {
      ok: false,
      reason: "design Gate: architecture.md 缺少模块/端点/事件/数据等架构要素",
    }
  }
  return { ok: true }
}

const attackGate: Gate = async ({ cwd }) => {
  const build = await runBuild(cwd)
  if (!build.ok) return { ok: false, reason: `attack Gate: 构建失败 -- ${build.reason}` }
  const git = await gitHasChanges(cwd)
  if (!git.ok) return { ok: false, reason: `attack Gate: ${git.reason}` }
  const report = await requireMinSize(cwd, [`${RUNS_DIR}/attack-report.md`], 1000)
  if (!report.ok) {
    return {
      ok: false,
      reason: "attack Gate: 缺少 attack-report.md（至少 1000 字节，须含真实执行证据）",
    }
  }
  const text = readMatchedText(cwd, [`${RUNS_DIR}/attack-report.md`])
  if (!/exit\s*code\s*[:=]?\s*0|✅|PASS|测试通过|tests?\s+passed|通过/i.test(text)) {
    return {
      ok: false,
      reason: "attack Gate: attack-report.md 缺少正向通过证据（exit code 0 / PASS / 测试通过）",
    }
  }
  if (!/攻击|attack|逆向|兜底|fallback|失败|fail|边界|edge|拒绝|deny|无权限/i.test(text)) {
    return {
      ok: false,
      reason: "attack Gate: attack-report.md 缺少兜底/攻击路径证据；attack 不是只跑 happy path",
    }
  }
  if (!/curl|HTTP|命令|command|执行|docker|test|npm|go\s+test/i.test(text)) {
    return {
      ok: false,
      reason: "attack Gate: attack-report.md 缺少真实命令执行记录；要贴真实输出，不是只写关键词",
    }
  }
  if (!/P1.*[:：]\s*0|P1.*无|无\s*P1|0\s*个\s*P1|P1.*零/i.test(text)) {
    return {
      ok: false,
      reason: "attack Gate: attack-report.md 未明确声明 P1=0；有 P1 问题必须回炉修复",
    }
  }
  return { ok: true }
}

export const NF_STAGES: readonly StageSpec[] = [
  {
    name: "design",
    role: "Forward Designer",
    skill: "nf-design",
    subagent: "nf-designer",
    exit: "goal_complete",
    rollbackTarget: "none",
    desiredState: [
      "已把用户意图、目标、成功标准写进 intent.md，而不是让代码反推需求",
      "已设计正向用户旅程与端到端业务流程（design.md）",
      "已提取 RXX 规则锚（rules.md，R01..RNN），每条规则可被场景追溯",
      "已写全正向与兜底场景（scenarios.feature），包含失败/拒绝/无权限/边界，不能只有 happy path",
      "已设计解耦的架构与模块、端点、事件、数据存储（architecture.md）",
      "设计层产物可被 attack 阶段直接消费，正向和兜底都有设计依据",
    ],
    deliverablePaths: [
      `${DESIGN_DIR}/intent.md`,
      `${DESIGN_DIR}/design.md`,
      `${DESIGN_DIR}/spec/rules.md`,
      `${DESIGN_DIR}/spec/scenarios.feature`,
      `${DESIGN_DIR}/architecture.md`,
    ],
    gate: designGate,
  },
  {
    name: "attack",
    role: "Attacker / Verifier",
    skill: "nf-attack",
    subagent: "nf-attacker",
    exit: "verdict",
    rollbackTarget: "design",
    desiredState: [
      "已从正向验证：每条 RXX/场景都有真实实现证据（代码 + 测试 + 命令输出），不是桩/占位",
      "已从兜底攻击：失败/拒绝/无权限/冲突/边界路径都有真实执行证据，证明兜底真的拦得住",
      "构建通过（代码能编译/运行），git 有真实代码改动",
      "attack-report.md 记录正向通过证据 + 兜底攻击证据 + 真实命令输出 + P0/P1/P2 清单",
      "P0=有场景没做（必须回炉）；P1 由报告声明必须为 0；用户旅途走不通=P0=回炉",
    ],
    deliverablePaths: [`${RUNS_DIR}/attack-report.md`],
    gate: attackGate,
  },
]

export function stageByName(name: string): StageSpec | undefined {
  return NF_STAGES.find((s) => s.name === name)
}
