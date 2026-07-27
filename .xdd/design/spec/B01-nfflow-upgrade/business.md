# B01-nfflow-upgrade — 业务线：nfflow 架构升级

> nfflow（normal-flow）6 节点流程编排平台。
> 业务线 ≠ 生产代码模块；它是 `.xdd/` 追踪标识，按 DDD 限界上下文（流程编排）划分。

## 业务目标

把 nfflow 从「**设计 → 攻击 → 验收**」3 阶段升级为「**探索设计 → 代码实现 → 验收**」3 阶段，每阶段后接一次横向**反思攻击**；新增 `nf-builder` agent 承担代码实现；nfflow 跟 xdd-flow 并存独立、共享 `.xdd/` + RXX 编号。

## 关键问题

1. **缺中间 "代码实现" 阶段**：当前 nfflow 的 nf-designer 写完 design.md / rules.md / architecture.md / scenarios.feature 后，没有 subagent 把设计变成可运行的代码。结果 attack 阶段攻击的是「设计文档」、不是「真实运行的应用」，e2e 阶段没有可测的应用可点。
2. **attack 是独立阶段，不是反思动作**：所有攻击都打向「设计」，无法拦截「实现 bug」和「验收漏测」两类问题。回顾 session c3692b46 的教训（60 端点只实施 23 = 38% 蒙混），attack 必须变成每阶段的反射性自检，而不是一次性大审判。
3. **没有 @implements RXX 链路**：nfflow 的 RXX 规则写到 `.xdd/design/spec/{Bxx-slug}/rules.md` 就停了，没有代码层回指，意图和实现断开。
4. **nfflow 跟 xdd-flow 边界**：两套 flow 是同一设计哲学的两种调度粒度。nfflow = 轻量 + 反思闭环；xdd-flow = 完整 + 一次验收。两套共享 `.xdd/` 目录，但报告隔离。

## 范围

### In Scope（做什么）

- **6 节点流程编排**：3 阶段（explore-design / build / acceptance）+ 3 反思（reflect-design / reflect-build / reflect-acceptance）
- **新增 `nf-builder` agent**：装 `xdd-execute` + `xdd-cleanup` skill，依据 `.xdd/design/spec/{Bxx-slug}/rules.md` + `scenarios.feature` + `architecture.md` 写真实代码、用 `@implements RXX` 标注、TDD 流程
- **`nf-attacker` 阶段化**：同一 agent + `stage` 参数（design / build / acceptance），产出 `reflect-attack-{stage}-report.md`
- **`flow-agent.md` 主调度**：todowrite 6 节点状态机 + 回退表覆盖 9 种「反思 N 发现阶段 M 根因」情形 + 回退预算 8 次
- **task_id 续接策略**：反思#1 ↔ #2 ↔ #3 同一 nf-attacker 续接保留前序 P0 列表；阶段切换 / 阶段与反思之间不续接
- **Gate 标准**：每阶段独立验证（产物真实落盘 + 字节数 + 关键 grep 命中），不靠「前序通过推断本阶段过」
- **nfflow 跟 xdd-flow 边界**：共享 `.xdd/design/`（RXX 编号项目级共享），报告隔离 `.xdd/runs/nf_run/` vs `.xdd/runs/xdd_run/`

### Out of Scope（不做什么）

- **不动 xdd-flow**：xdd-flow 的 8 节点链路、`xdd-build` agent、`xdd-execute`/`xdd-cleanup` skill 全部保留不动
- **不重构 nf-design / e2e-test skill**：保留现状，仅靠 flow-agent 调度把它接进新 3 阶段
- **不在本轮改 src/agents/ 下任何文件**：本轮只产出 `.xdd/design/` 设计层产物；agent MD 改写留给后续 xdd-execute
- **不预写 plan task / stages 配置文件 / Docker / CI**：架构升级是 flow 编排层的事，跟运行时基础设施无关
- **不绑定前端/后端技术栈**：nfflow 通用，nfflow 跑的项目用什么栈由 architecture + scenarios.feature 决定
- **不写 nfflow→xdd-flow 迁移脚本**：用户可手动接 RXX
- **新增 `nf-acceptance-attacker` 单独 agent**：复用 `nf-attacker` + stage 参数（避免 agent 膨胀）

## 通用语言（Ubiquitous Language）

> nfflow 业务线内的核心概念。术语跟 xdd-flow 重叠时，含义必须一致；含义不同时记此处。

| 术语 | 含义 | 跟 xdd-flow 关系 |
|------|------|-----------------|
| **nfflow** | normal-flow 轻量版流程编排；3 阶段 + 3 反思 = 6 节点 | 跟 xdd-flow 并存独立 |
| **xdd-flow** | 完整版流程编排；8 节点（brainstorm → spec → architecture → wire → resilience → plan → execute → verify） | 跟 nfflow 并存独立 |
| **阶段（stage）** | 3 阶段：explore-design / build / acceptance | 类似 xdd-flow 的「节点」概念，但 nfflow 把 8 节点压成 3 阶段 |
| **反思攻击（reflect attack）** | 阶段产物落盘后立即跑的横向自检；同一 nf-attacker、不同 stage | xdd-flow 没有「反思」，靠 xdd-verify 一次性验收 |
| **stage 参数** | `stage ∈ {design, build, acceptance}`，nf-attacker 用 stage 切换攻击方法 | xdd-flow 不分 stage |
| **6 节点 todowrite** | flow-agent 主调度状态机的 6 项任务（3 阶段 + 3 反思） | xdd-flow 用 8 节点 todowrite |
| **回退表** | 9 种「反思 N 发现阶段 M 根因 → 回退到某阶段」映射 | xdd-flow 回退表更复杂（8 节点 × 多根因） |
| **回退预算** | 8 次；连续 3 次回退同一阶段则退出问用户 | 跟 xdd-flow 一致 |
| **task_id 续接** | 反思攻击之间续接（同 attacker）；阶段切换 / 阶段与反思之间不续接 | xdd-flow 续接策略类似 |
| **RXX 编号** | 项目级共享编号空间（按 `Bxx-slug` 隔离），写在 `.xdd/design/spec/{Bxx-slug}/rules.md` | nfflow 跟 xdd-flow 消费同一份 |
| **Gate 标准** | 每阶段必过 5 条硬检查（产物真实落盘 + 字节数 + 关键 grep 命中） | 类似 xdd-flow 的 xdd-verify 一致性审计 |
| **P0 / P1 / P2** | 反思攻击的问题分级：P0=硬阻塞（存根 / sham / 用户旅途走不通）、P1=警告（兜底未拦 / 行为错）、P2=建议 | 仅用于 nfflow 反思报告；xdd-flow verify-report.md 用表格 |
| **build-report.md** | nfflow 阶段 2（build）的产出自报告，路径 `.xdd/runs/nf_run/build-report.md` | 类似 xdd-build 的 code-review.json，但 nfflow 用 markdown |
| **reflect-attack-{stage}-report.md** | nfflow 反思攻击产物，路径 `.xdd/runs/nf_run/reflect-attack-{stage}-report.md` | xdd-flow 没有对应产物 |
| **e2e-report.md** | nfflow 阶段 3（acceptance）的产物，路径 `.xdd/runs/nf_run/e2e-report.md` | 对应 xdd-flow 的 verify-report.md |
| **`.xdd/runs/nf_run/`** | nfflow 运行报告目录 | 跟 xdd-flow 的 `.xdd/runs/xdd_run/` 隔离 |
| **`.xdd/design/`** | 设计层共享目录（nfflow 跟 xdd-flow 同份） | 同享 |
| **subagent** | flow-agent 派出的子 agent：nf-designer / nf-builder / nf-attacker / e2e-tester | xdd-flow 派 xdd-* 子 agent |
| **nf-builder** | 阶段 2 实施 subagent，装 xdd-execute + xdd-cleanup，TDD 写代码 | 类似 xdd-build，但精简版（不依赖 xdd-plan） |
| **nf-attacker** | 反思攻击 subagent，阶段化（同一 agent + stage 参数） | xdd-flow 用 xdd-verify 一次性验收 |
| **flow-agent** | nfflow 入口 / 主调度 agent | 类似 xdd-flow |

## 关联（锚定路径）

### Spec 规则

- **RXX 编号空间**：B01-nfflow-upgrade 内裸编号 `R01` ~ `R07`（多条 RXX 共享 RXX 编号空间）
- **核心规则**（详见 `rules.md`）：
  - R01 nfflow 6 节点流程编排
  - R02 nf-builder agent 装 skill 干活（TDD + @implements RXX + no-stub-check）
  - R03 nf-attacker 阶段化反思（P0 硬阻塞 + P1 警告）
  - R04 flow-agent 6 节点 todowrite 状态机（9 种回退 + 预算 8 次）
  - R05 task_id 续接策略（反思间续接，阶段切换不续接）
  - R06 Gate 标准（每阶段独立验证，不靠前序推断）
  - R07 跟 xdd-flow 并存边界（共享 `.xdd/design/` + 隔离 `.xdd/runs/nf_run/`）

### Gherkin 验收

- `scenarios.feature`：6 个核心 Scenario（@covers R01~R06）+ 兜底场景

### Architecture 锚

- 主调度：`flow-agent.md`（6 节点 todowrite）
- 实施 subagent：`nf-builder`（精简 xdd-build）
- 反思 subagent：`nf-attacker`（同一 agent + stage 参数）
- 设计 subagent：`nf-designer`（装 `nf-design` skill）
- 验收 subagent：`e2e-tester`（装 `e2e-test` skill）
- 详见 `architecture/architecture.md` + `flow.mermaid`

### Wire 锚

- 跳过（无前端，纯后端 sdk/tool）

### Resilience 锚

- 下一轮 xdd-resilience 产出

### Plan 锚

- 下一轮 xdd-plan 产出

## 关键不变量（设计层必须一致）

### 1. 设计产物一致（nfflow 跟 xdd-flow 同份）

不管用哪套 flow（nfflow 或 xdd-flow），跑完产出的 `.xdd/design/spec/{Bxx-slug}/rules.md` + `scenarios.feature` + `architecture.md` 是同一份。**flow 只决定怎么调度，不决定设计是什么**。

### 2. P0 硬阻塞（不可违反）

- no-stub-check 命中（`pass` / `TODO` / `NotImplementedError` / `InMemoryRepository` / mock DB / 硬编码 current_user）= P0
- 无 `@implements RXX` 标注 = P0
- Gate 5 条任何一条不满足 = P0
- e2e 用户旅途走不通 = P0
- P0 ≥ 1 → 反思 attack 报告标记「rollback」+ 触发回退

### 3. P1 警告（不阻塞）

- scenarios.feature 缺兜底场景 = P1
- 错误处理路径缺失 = P1
- 文档不完整 = P1
- P1 ≥ 1 → 反思 attack 报告标记「warn」+ 流程继续

### 4. 反 sham 底线（永不允许）

- 无存根：`pass` / `TODO` / `return None` / `NotImplementedError` 禁止
- 无假实现：mock DB / 硬编码用户 / 假数据 禁止
- 跑通有证据：curl / 数据查询 / 截图，不是「应该能跑」
- 不假完成：没跑通直说没跑通

### 5. 反思攻击之间 task_id 续接

- 反思#1 → 反思#2 → 反思#3：同一 nf-attacker，续接保留前序 P0 列表 + 攻击历史 + RXX 知识
- 阶段切换 / 阶段与反思之间：不续接（attacker 独立第三方）

### 6. 目录隔离（两套 flow 不混）

- nfflow 报告：`.xdd/runs/nf_run/`
- xdd-flow 报告：`.xdd/runs/xdd_run/`
- 设计产物共享：`.xdd/design/`
- 失败日志共享：`.xdd/runs/xdd_run/failure-log.md`（按流名前缀区分条目）

## 6 节点流程图（高层视图）

```
用户 prompt
  ↓
[阶段1] explore-design
  └─ 派 nf-designer → 装 nf-design skill
  └─ 产出：.xdd/design/{intent,design}.md + spec/{Bxx-slug}/rules.md + scenarios.feature + architecture/{Bxx-slug}/architecture.md
  └─ Gate 5 条全部满足
  ↓
[反思#1] reflect-design
  └─ 派 nf-attacker (stage=design) → 装 nf-attack skill
  └─ 产出：.xdd/runs/nf_run/reflect-attack-design-report.md
  └─ Gate: P0=0（硬阻塞）+ P1=0（警告）
  ↓
[阶段2] build
  └─ 派 nf-builder → 装 xdd-execute + xdd-cleanup skill
  └─ 产出：代码 @implements RXX + 测试 + build-report.md + code-review.json
  └─ Gate: RXX 覆盖率 100% + no-stub-check 零命中 + 全测试 PASS
  ↓
[反思#2] reflect-build
  └─ 派 nf-attacker (stage=build) → 装 nf-attack skill
  └─ 产出：.xdd/runs/nf_run/reflect-attack-build-report.md
  └─ Gate: P0=0 + P1=0
  ↓
[阶段3] acceptance
  └─ 派 e2e-tester → 装 e2e-test skill
  └─ 产出：.xdd/runs/nf_run/e2e-report.md + screenshots/*.png
  └─ Gate: 用户旅途走通 + 兜底场景有截图 + P0=0
  ↓
[反思#3] reflect-acceptance
  └─ 派 nf-attacker (stage=acceptance) → 装 nf-attack skill
  └─ 产出：.xdd/runs/nf_run/reflect-attack-acceptance-report.md
  └─ Gate: P0=0 + P1=0
  ↓
流程完成
```

详见 `architecture/flow.mermaid` 的完整流程图（含 9 种回退箭头 + 每节点「派谁 / 装什么 skill / 产什么 / Gate」标注）。
