# Pipeline Status — xdd_run

> 三层骨架：设计层（锚）→ 桥接 → 代码层。每层用 ✅/⏳ 标。
> 多业务线项目按 ## BXX 分段。

## 项目层

| 层 | 状态 | skill | 产出 |
|----|------|-------|------|
| 设计·理解 | ✅ | xdd-brainstorm | design/intent.md + design.md + notes/{recap,brainstorm,external-references}.md |
| 设计·规则 | ✅ | xdd-spec | design/spec/B01-nfflow-upgrade/{business.md, rules.md, scenarios.feature} + _landscape.md |
| 设计·架构 | ✅ | xdd-architecture | design/architecture/B01-nfflow-upgrade/{architecture.md, flow.mermaid} |
| 设计·前端 | ⏭ 跳过 | xdd-wire | 纯后端/无 UI（cjopencode 仓库改造） |
| 设计·韧性 | ✅ | xdd-resilience | design/architecture/B01-nfflow-upgrade/resilience/（5 文档） |
| 桥接·计划 | ✅ | xdd-plan | runs/xdd_run/plan/B01-nfflow-upgrade/plan.md（1922 行 / 11 task / 67 step）|
| 代码·实现 | ✅ | xdd-execute | 5 agent（1 新 + 4 改）+ 3 skill + 12 commit + code-review.json verdict=pass |
| 代码·验证 | ⏳ | xdd-verify | runs/xdd_run/verify-report.md（待跑）|

## 上下文地图

### 当前
- 层: 代码·实现 ✅ / 活跃 slug: B01-nfflow-upgrade / 失败计数: 0
- 当前目标: G1~G5（nfflow 架构升级，详见 runs/xdd_run/goals.md）
- 上游: 设计层 + 桥接层全部 ✅
- 下游: xdd-verify（待跑）

### 本层必读（下一步：xdd-verify）
- skill: xdd-verify
- 输入: 12 commit（src/agents/*.md + src/skills/*/SKILL.md）+ code-review.json + 5 维度自检
- 上游指针: @implements RXX（12 命中）+ RXX 编号 commit（12 命中）+ sanity check 全过
- 自检: 真实可加载（新 agent 能被 opencode 解析）+ 真实可调度（flow-agent 能派发 5 subagent）+ 真实可回退（9 种回退表覆盖到位）

### 关键决策摘要（nfflow 架构升级）
- **设计原则**：设计导向，xdd-flow 详细 8 节点 / nfflow 合并 6 节点，但设计产物一致（共享 .xdd/）
- **6 节点流程**：3 阶段（explore-design / build / acceptance）+ 3 反思（reflect-design / reflect-build / reflect-acceptance）
- **新增 nf-builder agent**：装 xdd-execute + xdd-cleanup，不依赖 xdd-plan
- **nf-attacker 阶段化**：同一 agent + stage 参数，task_id 续接保留 P0 列表
- **状态机**：todowrite 6 节点，回退预算 8 次，回退表 9 情形
- **RXX 编号**：R01~R07（项目级共享，nfflow 跟 xdd-flow 共用同一份 rules.md）
- **失败模式**：F01~F33（10 维度 = 8 基础 + 2 编排特有），兜底映射 33/33 = 100%
- **目录约定**：设计产物 `.xdd/design/` 共享，nfflow 报告隔离 `.xdd/runs/nf_run/`、xdd-flow 用 `.xdd/runs/xdd_run/`

## 跨业务线一致性 checklist（B01 唯一）
- [x] _landscape.md 含 B01 索引
- [x] spec 跟 architecture 的业务线列表一致（仅 B01）
- [x] RXX 编号跨文档一致（rules.md / scenarios.feature / architecture.md 都用 R01~R07）
- [x] 失败模式 ID 跨文档一致（F01~F33 在 failure-modes / failsafe-design / chaos-scenarios / resilience-test-plan / recovery-runbook 全闭环）
- [x] flow.mermaid 能用 mmdc 渲染（PASS=1）