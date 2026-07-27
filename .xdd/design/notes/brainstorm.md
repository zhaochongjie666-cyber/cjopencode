# Brainstorm — nfflow 架构升级

> **⚠️ 过程笔记**：本文件记录 nfflow 架构升级 brainstorm 的发散过程（初始版本）。其中提到的 `.nf/` 路径 / RXX 编号独立 / 反思攻击 4 candidate 等描述是**升级前的初始决策**。用户最终裁决后已反转（详见 `.xdd/design/design.md` Open Questions 段「已答」标记 + 备 A6 反转）。本文保留仅作历史回溯，所有引用当前最新的设计请看 design.md。

> 记录本轮 brainstorm 的发散过程、收敛决策依据、用户原话与对齐点。
> design.md 是收敛产物，本文件是过程回溯。

## 用户原话（核心意图）

> 「**nfflow 应当是探索设计-代码实现-验收三个阶段，然后每个阶段都要有反思攻击**」

## 已跟用户确认的边界（不再追问）

1. **三阶段**：探索设计 → 代码实现 → 验收
2. **每阶段反思攻击**：横向动作，不是独立阶段
3. **新增 nf-builder agent**：类似 xdd-build，承担代码实现
4. **nfflow 跟 xdd-flow 关系**：并存独立，nfflow 轻量、xdd-flow 完整版

## 发散过程

### 探讨 1：nfflow 现状缺什么

nfflow 现有 3 阶段：design → attack → e2e。
- **缺中间 build**：designer 写完 design.md / rules.md / architecture.md / scenarios.feature，没有任何 subagent 把它们变成代码。结果 attack 打的是文档、不是代码、e2e 没真实应用可测。
- **attack 是独立阶段**：所有攻击都打向"设计"，无法拦截"实现 bug" 跟 "验收漏测"。
- **没有 @implements RXX 链路**：RXX 写到 .nf/design/spec/rules.md 就停了。

**结论**：用户原话精准命中。3 阶段必须有「代码实现」，attack 必须拆成 3 个反思动作。

### 探讨 2：nf-builder 能否复用 xdd-build

xdd-build 装 xdd-execute + xdd-cleanup，TDD 写代码 + @implements RXX + 6 维度自审。看似一模一样。

**否决合并**：
- xdd-build 依赖 xdd-plan 的 task DAG（任务间依赖 + 顺序）
- xdd-build 用 `.xdd/runs/xdd_run/` 路径
- 合并会让两套 flow 双向耦合

**结论**：保留 nf-builder 独立 agent，但**单向引用** xdd-execute + xdd-cleanup skill。

### 探讨 3：反思攻击是 1 总报告还是 3 分报告

考虑过 3 种方案：
- **A. 同一报告分章节**：1 个报告看全局，但每阶段都要做"全量"
- **B. 3 份独立报告**：每阶段独立报告，可单独回退
- **C. 1 总 + 3 索引**：总报告汇总，分报告留作回退依据

**选 B**：每阶段独立报告（reflect-attack-{stage}-report.md），便于回退时定位。task_id 续接让反思 #2 / #3 知道前序 P0 状态。

### 探讨 4：task_id 续接策略

| 关系 | 是否续接 | 理由 |
|------|---------|------|
| 阶段1 ↔ 反思#1 | ❌ | designer / attacker 不同 subagent |
| 阶段2 ↔ 反思#2 | ❌ | builder / attacker 不同 subagent |
| 阶段3 ↔ 反思#3 | ❌ | tester / attacker 不同 subagent |
| 反思#1 → 反思#2 → 反思#3 | ✅ | 同一 attacker，保留攻击历史 |
| 阶段切换 | ❌ | 必换 subagent |

**核心原则**：反思攻击是"独立第三方"，不复用阶段的 subagent 上下文；反思攻击之间是"同一调查员迭代"，续接保留历史。

### 探讨 5：回退预算

维持 8 次（继承现有 flow-agent.md 约定）。
- 6 节点流程每个都可能回退
- 8 次 = 1.33 次/节点，足够
- 每阶段内 3 试机制（细化层）保证不靠回退预算硬扛

### 探讨 6：回退表设计

新回退表覆盖 9 种情形（合并 6 节点的"根因 → 锚"映射）：
- 反思#1 → 阶段1
- 阶段2 → 阶段1 / 阶段2
- 反思#2 → 阶段1 / 阶段2
- 阶段3 → 阶段1 / 阶段2
- 反思#3 → 阶段1 / 阶段2 / 阶段3

每种情形都明文写到 design.md 决策 4。

### 探讨 7：Gherkin 场景

用户原话本身就是一个 Feature："三阶段 + 每阶段反思"。
- 正向场景：6 节点全跑通
- 兜底场景：
  - 反思#1 拦截设计缺陷（兜底场景缺失）
  - 反思#2 拦截实现 sham（stub / mock）
  - 反思#3 拦截验收漏测（用户旅途截图缺失）
  - 阶段耗尽 3 次回退 → 暂停问用户

写到 design.md 决策 5。

### 探讨 8：目录约定

- nfflow：`.nf/`（保留）
- xdd-flow：`.xdd/`（保留）
- 不统一（避免 rename 成本）

报告统一存 `.nf/runs/`：
- `reflect-attack-design-report.md`
- `build-report.md`
- `reflect-attack-build-report.md`
- `e2e-report.md`
- `reflect-attack-acceptance-report.md`

## 关键决策汇总

1. **6 节点流程**：3 阶段（explore-design / build / acceptance）+ 3 反思（reflect-design / reflect-build / reflect-acceptance）
2. **nf-builder 独立 agent**：装 xdd-execute + xdd-cleanup skill，不依赖 xdd-plan
3. **nf-attacker 阶段化**：同一 agent + stage 参数，产出 reflect-attack-{stage}-report.md
4. **状态机**：todowrite 6 节点，回退预算 8 次，回退表 9 情形
5. **task_id 续接**：反思攻击之间续接，阶段切换 / 阶段与反思之间不续接
6. **目录分离**：`.nf/` 跟 `.xdd/` 独立，RXX 编号独立
7. **Gherkin 兼容**：跟 xdd-flow 同样用 Gherkin + @covers RXX，可交叉消费

## 用户审 design.md 前的待确认点

> 这些 Open Questions 中，需要用户拍板才能进 xdd-spec。

1. **build-report.md 输出格式**：markdown vs JSON vs 不输出（design.md Open Q1）
2. **反思攻击之间续接的"保留范围"**：完整 vs 仅 P0 列表（Q2）
3. **阶段2 ↔ 反思#2 续接与否**：不续接（让 attacker 独立第三方）vs 续接（让 attacker 看到 build 笔记）（Q3）
4. **三条反思能不能并行**：串行 vs 反思#3 + 反思#2 + 反思#1 并行（Q4）
5. **P0/P1 是不是反思攻击的硬 Gate**（Q5）
6. **要不要新增独立 acceptance-attacker agent**（Q6）
7. **RXX 编号共享 vs 独立**（Q7）

## 下游

- **xdd-spec**：把 design.md 决策 1 / 4 / 5 翻译成 RXX 规则 + scenarios.feature
- **xdd-architecture**：把 design.md 决策 2 / 3 翻译成 nf-builder / nf-attacker 的 SKILL.md 接口约定
- **xdd-plan**：按 G1~G5 拆 task
- **xdd-execute**：实施 flow-agent.md / nf-builder.md / nf-attacker.md 改写
