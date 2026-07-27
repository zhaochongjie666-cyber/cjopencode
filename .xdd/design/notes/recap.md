# 现状 recap — nfflow 架构升级

> **⚠️ 历史快照**：本文件记录的是 nfflow 架构升级**之前**的现状（`.nf/` 目录、3 阶段 design/attack/e2e、agent 命名等）。升级后路径已变（合并到 `.xdd/`，6 节点流程），详见 `.xdd/design/design.md` 决策 6 / 决策 7 / Open Q1 答复。下文保留原状仅为历史回溯。

## 已读文件清单

**xdd 骨架（4 个）**
1. `.xdd/WORKFLOW.md`
2. `.xdd/workflows.md`
3. `.xdd/runs/xdd_run/goals.md`
4. `.xdd/runs/xdd_run/status.md`

**nfflow agents（4 个）**
5. `src/agents/flow-agent.md`
6. `src/agents/nf-designer.md`
7. `src/agents/nf-attacker.md`
8. `src/agents/e2e-tester.md`

**nfflow skills（3 个）**
9. `src/skills/nf-design/SKILL.md`
10. `src/skills/nf-attack/SKILL.md`
11. `src/skills/e2e-test/SKILL.md`

**xdd 参考（4 个）**
12. `src/agents/xdd-flow.md`
13. `src/agents/xdd-build.md`
14. `src/skills/xdd-execute/SKILL.md`
15. `.xdd/design/intent.md`（模板占位，无内容）
16. `.xdd/design/design.md`（模板占位，无内容）

**Glob 摸底（4 个目录）**
17. `.xdd/design/` 子目录：architecture/ notes/ spec/ wire/
18. `.xdd/runs/xdd_run/` 子目录：audits/ evidence/ plan/ (xdd_run/goals.md status.md 已读)
19. `src/agents/` 全列出：deployer e2e-tester flow-agent nf-attacker nf-designer xdd-brainstorm xdd-build xdd-design xdd-flow xdd-plan xdd-resilience xdd-verify
20. `src/skills/` 全列出：deploy e2e-test nf-attack nf-design xdd-architecture xdd-backend xdd-blind-journey xdd-brainstorm xdd-cleanup xdd-docker-helper xdd-execute xdd-frontend xdd-gherkin-plus xdd-git-commit xdd-init xdd-mermaid-check xdd-plan xdd-polish xdd-resilience xdd-reverse xdd-skill-creator xdd-spec xdd-verify xdd-wire

→ 20 项核查通过（每个文件都读完）

## 前因后果

cjopencode 是 opencode 插件仓库，安装脚本（install.sh）把 `src/` 镜像到 `~/.config/opencode`。提供 nfflow 和 xdd-flow 两套开发流：
- **xdd-flow**：完整版，brainstorm→spec→architecture→wire→resilience→plan→execute→verify（8 节点，已成型）
- **nfflow**：轻量版，flow-agent → nf-designer → nf-attacker → e2e-tester（3 阶段，纯设计 + 攻击 + 浏览器验收，**没有"代码实现"**）

冲突点：用户原话「**nfflow 应当是探索设计-代码实现-验收三个阶段，然后每个阶段都要有反思攻击**」。当前 nfflow 缺中间一阶段（build），且 attack 是独立阶段而非横向反思。

## 现有设计（nfflow 现状）

### 阶段 1：design（正向设计）
- **agent**：nf-designer
- **skill**：nf-design
- **产出**：
  - `.nf/design/intent.md`（≥80 字节）
  - `.nf/design/design.md`（≥150 字节）
  - `.nf/design/spec/rules.md`（≥100 字节，含 RXX 编号）
  - `.nf/design/spec/scenarios.feature`（≥100 字节，含兜底场景）
  - `.nf/design/architecture.md`（≥150 字节，含模块/端点/事件/数据/依赖）
- **Gate 5 条**：全部满足才能进入阶段 2

### 阶段 2：attack（攻击验证）
- **agent**：nf-attacker
- **skill**：nf-attack
- **产出**：`.nf/runs/attack-report.md`（≥1000 字节）
- **Gate 5 条**：含正向/兜底/真实执行证据 + P1=0

### 阶段 3：e2e（浏览器测试）
- **agent**：e2e-tester
- **skill**：e2e-test
- **产出**：`.nf/runs/e2e-report.md`（≥1000 字节）+ `.nf/runs/screenshots/*.png`
- **Gate 6 条**：含正向/兜底/真实浏览器/截图 + P0=0

### 主调度（flow-agent.md）
- **状态机**：todowrite 3 阶段
- **回退预算**：8 次
- **task_id 续接**：首次不传，续接修复时传（同阶段 subagent）
- **回退表**：
  - attack 发现 design 根因 → 回退 design
  - e2e 发现 attack（实现 bug）→ 回退 attack
  - e2e 发现 design 根因 → 回退 design

### 关键纪律
- 五条 Gate 硬检查（每阶段）
- 反 sham 底线（无存根/无假实现/跑通有证据）
- 派 subagent 必传：用户任务 + 当前缺口 + 装 skill 指令

## 现有业务（对照 xdd-flow 抽取）

**xdd-flow 完整版**（用于参考 nf-builder 形态）：
- xdd-build agent 装 xdd-execute + xdd-cleanup，TDD + @implements RXX
- 6 维度自审（空值/并发/资源/授权/错误/架构漂移）
- code-review.json 含 artifactPaths + artifactDigest + 6 维度 + verdict
- 依赖 xdd-plan 的 task 列表（每 task 回指 RXX）

**nfflow 跟 xdd-flow 的关键差异**：
- nfflow 不走 plan.task（设计层直接给 rules + architecture + scenarios）
- nfflow 不走 xdd-spec / xdd-architecture / xdd-resilience 多节点（合在 nf-design 一次产出）
- nfflow 用 .nf/ 目录（xdd-flow 用 .xdd/）

## ⚠️ 设计 ↔ 代码脱节

设计（用户意图）跟代码（nfflow 现状）的脱节：
1. **设计意图**：3 阶段（探索设计 / 代码实现 / 验收）+ 每阶段反思攻击
2. **代码现状**：3 阶段（design / attack / e2e），attack 独立 + 缺中间 build 阶段
3. **裁决**：以设计意图为准（用户原话），本轮 brainstorm 改造 flow-agent.md + 新增 nf-builder + 改造 nf-attacker

## 缺什么 / 本轮增量

新增 / 改造：
1. **新增 nf-builder agent**（src/agents/nf-builder.md）—— 代码实现阶段执行体
2. **改造 flow-agent.md** —— 3 阶段 + 3 反思 = 6 节点 todowrite
3. **改造 nf-attacker** —— 阶段化（按设计/实现/验收投递不同攻击任务）
4. **产出新的 goals.md G1** —— nfflow 架构升级目标
5. **产出新的 design/ 意图锚 + 收敛决策**（本轮主产出）

## 约束与边界

- **不动 xdd-flow**：xdd-flow 是 xdd-brainstorm/xdd-design/xdd-spec/... 的完整版，本轮不碰
- **不动 .xdd 命名**：nfflow 用 .nf/，xdd-flow 用 .xdd/，两块不统一
- **不动 nf-design / e2e-test skill**：只调整 flow-agent.md 调度，新增 nf-builder
- **nf-builder 形态**：可复用 xdd-execute / xdd-cleanup skill，但不依赖 xdd-plan
- **不修改 src/agents/ 下的任何文件**（用户明确要求）—— 本轮只产出 design/intent.md + design.md
