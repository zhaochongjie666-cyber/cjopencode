# 收敛决策 — nfflow 架构升级

> 5 段：Selected（选定方案）/ Alternatives（考虑过没选的）/ Assumptions（假设）/
> Out of Scope（不做）/ Open Questions（待答）。xdd-brainstorm 填。

---

## 设计原则（先于具体决策）

> **设计导向（design-first）**——设计产物是单一真相源，flow 是调度层。
>
> 两套 flow 是同一设计哲学的两种调度粒度：
>
> | 维度 | xdd-flow | nfflow |
> |------|----------|--------|
> | 调度粒度 | **详细分步**（8 节点：brainstorm → spec → architecture → wire → resilience → plan → execute → verify）| **合并精简**（6 节点：探索设计 → 代码实现 → 验收，每节点附反思攻击）|
> | 设计产物 | **同一份**（.xdd/design/ + .xdd/design/spec/{bxx-slug}/rules.md + scenarios.feature + architecture.md） | **同一份**（同上，落到 .xdd/ 共享）|
> | 阶段数 | 8 | 3 阶段 + 3 反思 = 6 节点 |
> | 适用 | 大项目 / 多业务线 / 多人协作 | 小项目 / 新想法 / 快速验证 |
>
> **关键不变量**：不管用哪套 flow，跑完产出的 `.xdd/design/spec/{bxx-slug}/rules.md` + `scenarios.feature` + `architecture.md` 是同一份——同一个项目的同一组规则、同一组场景、同一份架构。**flow 只决定怎么调度，不决定设计是什么**。

---

## Selected（选定方案）

### 决策 1 — 新 3 阶段 + 3 反思攻击 = 6 节点流程

```
用户 prompt
   ↓
[阶段1] 探索设计 (explore-design)
   ├─ 派 nf-designer → 装 nf-design skill
   ├─ 产出：.xdd/design/{intent,design}.md + spec/{Bxx-slug}/rules.md + spec/{Bxx-slug}/scenarios.feature + architecture/{Bxx-slug}/architecture.md
   └─ Gate 5 条全部满足
   ↓
[反思#1] 反击设计 (reflect-design)
   ├─ 派 nf-attacker (stage=design) → 装 nf-attack skill
   ├─ 产出：.xdd/runs/nf_run/reflect-attack-design-report.md
   └─ Gate：P0=0（硬阻塞，不通过则回退）+ P1=0（标警告，不阻塞）
   ↓
[阶段2] 代码实现 (build)
   ├─ 派 nf-builder → 装 xdd-execute + xdd-cleanup skill
   ├─ 产出：代码 @implements RXX + 测试 + code-review.json + 全测试 PASS 证据
   └─ Gate：RXX 覆盖率 100% + no-stub-check 零命中 + 全测试 PASS
   ↓
[反思#2] 反击实现 (reflect-build)
   ├─ 派 nf-attacker (stage=build) → 装 nf-attack skill
   ├─ 产出：.xdd/runs/nf_run/reflect-attack-build-report.md
   └─ Gate：P0=0（硬阻塞，不通过则回退）+ P1=0（标警告，不阻塞）
   ↓
[阶段3] 验收 (acceptance)
   ├─ 派 e2e-tester → 装 e2e-test skill
   ├─ 产出：.xdd/runs/nf_run/e2e-report.md + .xdd/runs/nf_run/screenshots/*.png
   └─ Gate：用户旅途走通 + 兜底场景有截图 + P0=0
   ↓
[反思#3] 反击验收 (reflect-acceptance)
   ├─ 派 nf-attacker (stage=acceptance) → 装 nf-attack skill
   ├─ 产出：.xdd/runs/nf_run/reflect-attack-acceptance-report.md
   └─ Gate：P0=0（硬阻塞，不通过则回退）+ P1=0（标警告，不阻塞）
   ↓
流程完成
```

**关键纪律**：
- 反思攻击是**横向**动作，不是阶段，未通过则回退到对应阶段
- 每阶段 Gate 独立验证，**不靠"前序通过推断本阶段过"**
- 阶段间上下文通过文件传递（不共享 task_id）

### 决策 2 — nf-builder agent = 精简版 xdd-build

**装什么 skill**：
- `xdd-execute`（TDD + @implements RXX + Step 0 环境准备）
- `xdd-cleanup`（清理死代码 / 调试残留 / 格式统一）
- **不装** `xdd-plan`（nfflow 不走 plan.task 桥接）

**必产出**（写 `.xdd/runs/nf_run/build-report.md` + 系统内文件）：
- 真实代码（每个 RXX 至少一个 `@implements RXX` 标注）
- 每个 RXX 至少 1 个测试用例（单测 / 集成测，由 architecture 决定）
- 跑通证据（curl 输出 / docker logs / npm test 等）
- `code-review.json`（6 维度：空值安全 / 并发安全 / 资源生命周期 / 授权与注入 / 错误处理 / 架构漂移）
- `n-stub-check` 零命中

**入口行为**：
- 读 `.xdd/design/spec/{Bxx-slug}/rules.md` 拿到 RXX 全集（**项目级共享编号**，nfflow 跟 xdd-flow 消费同一份 RXX）
- 读 `.xdd/design/spec/{Bxx-slug}/scenarios.feature` 拿到 Scenario 全集
- 读 `.xdd/design/architecture/{Bxx-slug}/architecture.md` 拿到端点 / 模块 / 数据存储
- 读 `.xdd/design/design.md` 拿到用户旅程
- 按 `@covers RXX` 反向映射：每个 RXX → 每个 Scenario → 每个生产实现
- TDD 流程：先写失败测试 → 最小实现 → 重构 → commit（message 含 RXX 编号）

**为什么不像 xdd-build 那么重**：
- xdd-build 依赖 xdd-plan 的 task DAG（task 间依赖 + 顺序）
- nfflow 设计层已经把 RXX + Scenario + 架构都铺好，可直接 TDD，不需要再拆 task
- 跳过 xdd-plan 节省时间，**但牺牲排序精度**（场景间执行顺序由 RXX 编号决定，不显式 DAG）

### 决策 3 — nf-attacker 阶段化（同一 agent，按 stage 投递）

**核心设计**：**同一个 nf-attacker agent**，但每次 prompt 带 `stage` 参数（design / build / acceptance），产出对应的 `reflect-attack-{stage}-report.md`。

**为什么同一 agent**：
- 攻击方法论一致（正向 + 兜底 + 反 sham + P0/P1/P2）
- **task_id 续接保留前序 P0 列表**（"上次发现 P0-X 已修？这次再验证"）
- 阶段化报告命名让反思攻击自带阶段标签，便于回退时定位

**每阶段反思攻击的差异化**：
| stage | 攻击对象 | 关键证据 |
|-------|---------|---------|
| design | rules.md / scenarios.feature / architecture.md | grep 兜底场景 / 端点完整性 / 依赖缺失 |
| build | 代码 @implements RXX + 测试 | no-stub-check / curl 真实跑 / 重启数据保留 |
| acceptance | e2e-report.md + 截图 | user journey 覆盖 / 边界截图 / 错误文案 |

**入口行为**：
- 接收 prompt 含 `stage ∈ {design, build, acceptance}`
- 读 `.xdd/design/` + 阶段产物（`spec/{Bxx-slug}/rules.md` / 代码 / `runs/nf_run/e2e-report.md`）
- 攻击方法按 stage 切换，但 report 结构一致（5 段：构建 / 正向 / 兜底 / 反 sham / 问题清单）

**报告结构**（统一 5 段，按 stage 注水）：
```
# Reflect Attack Report — {stage}

## 1. 阶段产物状态
（贴产物路径 + 字节数 + 关键 grep 输出）

## 2. 正向验证
（按 RXX / Scenario 逐条贴运行证据）

## 3. 兜底攻击
（按兜底场景逐条贴攻击证据：attack / fallback / 拒绝 / 边界）

## 4. 反 sham 检查
（no-stub-check / mock / 硬编码等）

## 5. 问题清单
- P0: X
- P1: X
- P2: X
- 建议: pass / rollback
```

### 决策 4 — flow-agent.md 状态机 = 6 节点 todowrite

```
todowrite([
  { content: "阶段1: explore-design", status: "in_progress", priority: "high" },
  { content: "反思#1: reflect-design", status: "pending", priority: "high" },
  { content: "阶段2: build", status: "pending", priority: "high" },
  { content: "反思#2: reflect-build", status: "pending", priority: "high" },
  { content: "阶段3: acceptance", status: "pending", priority: "high" },
  { content: "反思#3: reflect-acceptance", status: "pending", priority: "high" },
])
```

**回退表**（合并 6 节点的"根因 → 锚"映射）：

| 发现位置 | 根因在 | 回退操作 |
|---------|--------|---------|
| 反思#1 | 阶段1（设计） | 阶段1 in_progress, 反思#1+之后 all pending |
| 阶段2 | 阶段1（设计） | 阶段1 in_progress, 阶段2+之后 all pending |
| 反思#2 | 阶段1（设计缺陷） | 阶段1 in_progress, 阶段2+之后 all pending |
| 反思#2 | 阶段2（实现 bug） | 阶段2 in_progress, 反思#2+之后 all pending |
| 阶段3 | 阶段1（设计缺陷） | 阶段1 in_progress, 阶段2+之后 all pending |
| 阶段3 | 阶段2（实现 bug） | 阶段2 in_progress, 阶段3+之后 all pending |
| 反思#3 | 阶段1（设计缺陷） | 阶段1 in_progress, 阶段2+之后 all pending |
| 反思#3 | 阶段2（实现 bug） | 阶段2 in_progress, 阶段3+之后 all pending |
| 反思#3 | 阶段3（验收漏测） | 阶段3 in_progress, 反思#3 pending |

**回退预算**：维持 8 次（不增不减，跟原有约定一致）。

**task_id 续接策略**：
- 阶段1 ↔ 反思#1：不同 subagent（designer / attacker），**不续接**
- 阶段2 ↔ 反思#2：不同 subagent（builder / attacker），**不续接**
- 阶段3 ↔ 反思#3：不同 subagent（tester / attacker），**不续接**
- 反思#1 → 反思#2 → 反思#3：**同一 nf-attacker，task_id 续接**（保留前序 P0 状态 + 攻击历史）
- 阶段切换：必然换 subagent，不续接

### 决策 5 — Gherkin scenario：把用户原话当 Feature 写

**正向场景**（升级后跑通完整流程）：
```gherkin
Feature: nfflow 三阶段 + 反思攻击流程

  Scenario: 一次完整 nfflow 任务跑通
    Given 用户在 nfflow 入口描述任务 X
    When flow-agent 启动 6 节点 todowrite
    And 阶段1 设计完成（5 Gate 通过）
    And 反思#1 攻击设计通过（P0=0 过硬阻塞，P1=0 警告清零）
    And 阶段2 实现完成（RXX 100% 覆盖 + 全测试 PASS）
    And 反思#2 攻击实装通过（P0=0 过硬阻塞，P1=0 警告清零）
    And 阶段3 验收完成（用户旅途走通 + 截图齐）
    And 反思#3 攻击验收通过（P0=0 过硬阻塞，P1=0 警告清零）
    Then 流程标记完成
    And 产出 .xdd/runs/nf_run/{reflect-attack-design-report, build-report, e2e-report, reflect-attack-acceptance-report}.md

  Scenario: 新增 nf-builder 装 xdd-execute + xdd-cleanup skill 执行 TDD
    Given 阶段2 in_progress
    When 派 nf-builder
    Then nf-builder 装 xdd-execute + xdd-cleanup skill
    And 读 .xdd/design/spec/{Bxx-slug}/rules.md 拿到 RXX 全集
    And 写出代码每处 @implements RXX
    And 跑通全测试（exit code 0）
    And 产出 code-review.json 6 维度 + verdict=pass
    And 产 .xdd/runs/nf_run/build-report.md
```

**兜底场景**（每阶段反思攻击能拦出问题，P0 是硬阻塞，P1 是警告）：
```gherkin
  Scenario: 反思#1 拦截设计缺失兜底场景
    Given 阶段1 完成，scenarios.feature 缺"密码错误"兜底场景
    When 派 nf-attacker (stage=design)
    Then 报告标记 P1 ≥ 1（警告，不阻塞）
    And 反思#1 仍 P0=0，过硬阻塞
    And 流程继续，但 P1 警告写到 nf_run/reflect-attack-design-report.md

  Scenario: 反思#2 拦截实现 sham（P0 硬阻塞）
    Given 阶段2 完成，但 .xdd/runs/nf_run/build-report.md 缺 curl 跑通证据
    And 代码有 TODO / pass / mock 残留
    When 派 nf-attacker (stage=build)
    Then no-stub-check 命中 → P0 ≥ 1（硬阻塞）
    And 触发回退: 阶段2 in_progress, 反思#2+之后 all pending
    And 续接 nf-builder 修复

  Scenario: 反思#3 拦截验收漏测（P0 硬阻塞）
    Given 阶段3 完成，但 e2e-report.md 缺用户旅途截图
    When 派 nf-attacker (stage=acceptance)
    Then 报告标记 P0 ≥ 1（硬阻塞）
    And 触发回退: 阶段3 in_progress, 反思#3 pending
    And 续接 e2e-tester 补截图

  Scenario: 三次回退到同一阶段耗尽阶段预算
    Given 阶段1 连续 3 次回退
    When 反思#1 仍 P0 ≥ 1
    Then flow-agent 用 question 工具向用户报告
    And 流程暂停
```

### 决策 6 — nfflow 跟 xdd-flow 边界（共享 `.xdd/`，区别在流程编排粒度）

| 维度 | nfflow | xdd-flow |
|------|--------|----------|
| 入口 | 用户说"用 nfflow / normal-flow / 快速做个 X" | 用户说"用 xdd-flow" 或项目 ≥3 业务线 |
| 设计产物目录 | `.xdd/design/`（跟 xdd-flow 同目录） | `.xdd/design/` |
| 运行报告目录 | `.xdd/runs/nf_run/` | `.xdd/runs/xdd_run/` |
| 设计层流程 | **一气呵成**（nf-design 一次性产出 intent + design + spec + architecture） | **分 5 节点**（brainstorm / spec / architecture / wire / resilience 逐步走） |
| 实施 | **nf-builder**（精简版，self-contained） | xdd-build（重，依赖 xdd-plan） |
| 验收 | e2e-tester（浏览器） | xdd-verify（部署 + 烟测 + 一致性审计） |
| 反思攻击 | ✅ 每阶段后必做（3 反思 = 横向自查） | ❌（不在 8 节点内，靠 xdd-verify 一次性验收） |
| agent 数量 | 5（flow + designer + attacker + builder + tester） | 8+（xdd-flow + xdd-* 子 agent） |
| 适用 | 小项目 / 新想法 / 验证场景 / 想要反思闭环 | 大项目 / 多人协作 / 多业务线 / 完整留痕 |
| 阶段 | 3 阶段 + 3 反思 = 6 节点 | 8 节点 |

**核心边界**：nfflow 跟 xdd-flow **共享 `.xdd/` 目录**，但**用不同的 runs 子目录隔离**（`nf_run/` vs `xdd_run/`）。区别在「流程编排粒度」而非「目录」：
- nfflow = 轻量版 + 反思闭环（一次跑完，每阶段有反思攻击）
- xdd-flow = 完整版 + 一次验收（分步走，每节点有正式产出，靠 xdd-verify 兜底）

**协作原则**：
- **设计产物共享**：nfflow 跟 xdd-flow 都写到 `.xdd/design/`，RXX 编号按 `Bxx-slug` 隔离（`.xdd/design/spec/{Bxx-slug}/rules.md`），**项目级共享 RXX 编号空间**（nfflow 写的 RXX，xdd-flow 也能消费）
- **运行报告隔离**：nfflow 报告 `.xdd/runs/nf_run/`，xdd-flow 报告 `.xdd/runs/xdd_run/`，避免冲突
- **两套 agent 命名独立**：`nf-*` / `xdd-*` 各自命名，不重用
- **skill 可复用**：nf-builder 装 xdd-execute + xdd-cleanup 是单向引用，nfflow 不反向依赖
- **流程可中途切换**：nfflow 跑完的设计可被 xdd-flow 接管（用同一份 RXX）；xdd-flow 跑完的设计可被 nfflow 跳到实施（用同一份 RXX）

### 决策 7 — 端点命名收敛（设计产物共享 `.xdd/design/`，报告隔离 `.xdd/runs/nf_run/`）

| 阶段 | 路径 |
|------|------|
| 阶段1 设计 | `.xdd/design/{intent,design}.md` + `.xdd/design/spec/{Bxx-slug}/rules.md` + `.xdd/design/spec/{Bxx-slug}/scenarios.feature` + `.xdd/design/architecture/{Bxx-slug}/architecture.md` |
| 反思#1 | `.xdd/runs/nf_run/reflect-attack-design-report.md` |
| 阶段2 实现 | `.xdd/runs/nf_run/build-report.md` + 真实代码 + `.xdd/runs/nf_run/code-review.json` |
| 反思#2 | `.xdd/runs/nf_run/reflect-attack-build-report.md` |
| 阶段3 验收 | `.xdd/runs/nf_run/e2e-report.md` + `.xdd/runs/nf_run/screenshots/*.png` |
| 反思#3 | `.xdd/runs/nf_run/reflect-attack-acceptance-report.md` |

**约定**：
- `reflect-attack-{stage}-report.md` 命名格式让反思报告自带阶段标签
- nfflow 报告统一存 `.xdd/runs/nf_run/`，跟 xdd-flow 的 `.xdd/runs/xdd_run/` 平级隔离
- design 产物（intent.md / design.md / spec/ / architecture/）落到 `.xdd/design/` 共享区
- `code-review.json` 跟 `build-report.md` 同目录，便于 phase2 反思攻击一次 glob 查全

---

## Alternatives（考虑过没选）

### A1 — 把 nf-builder 合并进 xdd-build
- **理由**：避免重复 agent，节省维护
- **否决**：用户明确要求 nfflow 跟 xdd-flow 并存独立，合并会绑死两套 flow 的耦合；xdd-build 依赖 xdd-plan + 用 `.xdd/runs/xdd_run/`，路径约定不同
- **替代**：保留 nf-builder 独立 agent，但**装 skill 复用** xdd-execute / xdd-cleanup（单向引用、不绑定）

### A2 — 反思攻击每阶段独立 subagent（不续接）
- **理由**：阶段间彻底隔离，避免一个阶段的 attack 状态污染下一阶段
- **否决**：攻击者会反复犯同样的错误（"上次发现的 P0 这次是不是修了？"），续接能保留前序 P0 列表，让反思 #2 能验证反思 #1 标记的"已修 P0" 真修了
- **替代**：反思攻击之间 task_id 续接（保留攻击历史），阶段切换不续接

### A3 — 反思攻击只做 1 次（设计完毕后），不每阶段做
- **理由**：用户原话没明确说"几次"，3 次反思 attack 报告会让流程更重
- **否决**：用户原话明确「**每个阶段都要有反思攻击**」，这是核心需求
- **替代**：3 次反思，每阶段后必做

### A4 — 反思攻击产出合成一份总报告
- **理由**：方便全局审阅
- **否决**：每阶段报告独立便于回退（"反思 #2 发现 P0，回退到阶段 2"），分开更利于责任归位
- **替代**：3 份独立报告 `reflect-attack-{stage}-report.md`，可加一份 `reflect-attack-summary.md` 作为索引

### A5 — 回退预算改成 6 次或 10 次
- **理由**：6 节点流程每个都可能回退，8 次可能不够
- **否决**：跟原有约定一致（flow-agent.md 当前 8 次），用户没要求改；回退 3 次就该退到设计层（每阶段内 3 试），8 次对 6 节点 = 1.33 次/节点，足够
- **替代**：维持 8 次，但定义"3 试没过 = 退到对应阶段，不是退到设计 1"

### A6 — 统一 `.nf/` 跟 `.xdd/` 命名
- **理由**：消除用户认知负担
- **初判否决**：rename 成本高，且破坏向后兼容；用户已确认不统一
- **替代**：保留两套目录
- **🔄 反转**：用户最终决策改为「nfflow 设计产物合并到 `.xdd/`，报告隔离在 `.xdd/runs/nf_run/`」。原因：RXX 编号项目级共享要求 RXX 落在同一份规则文件下，路径必须统一。详见决策 6 / Open Q1 答复。`.nf/` 目录从本轮起取消。

### A7 — 把反思攻击合并到阶段内（不占独立节点）
- **理由**：状态机少 3 个节点
- **否决**：反思攻击是独立 subagent，独立产物、独立 Gate；合并会让 stage 内部变成"既要做事又要审自己"，违反职责分离
- **替代**：6 节点独立

---

## Assumptions（自拍的默认）

1. **语言**：所有设计文档、报告、commit message 中文（跟现有 nf-design / nf-attack skill 一致）
2. **commit 格式**：nf-builder 跑 commit 时 `commit message` 含 RXX 编号（跟 xdd-build 一致），便于 `git log --grep 'R0X'` 追溯
3. **回退预算**：维持 8 次（继承现有 flow-agent.md 约定）
4. **task_id 续接**：反思攻击之间续接，阶段切换不续接
5. **RXX 编号**：**项目级共享**，nfflow 跟 xdd-flow 都消费同一份 `.xdd/design/spec/{Bxx-slug}/rules.md` 的 RXX 编号空间（按 `Bxx-slug` 隔离）
6. **目录约定**：**`.nf/` 目录取消**。设计产物（intent.md / design.md / spec/ / architecture/）落到 `.xdd/design/` 共享区；nfflow 报告（build-report / e2e-report / reflect-attack-*）落到 `.xdd/runs/nf_run/`，跟 xdd-flow 的 `.xdd/runs/xdd_run/` 平级隔离
7. **温度参数**：nf-builder 用 temperature=0.6（跟 xdd-build 一致，允许小幅创意用于 TDD 重新组织）
8. **nf-attacker 三个反思阶段共用同一份 SKILL.md**（nf-attack）：差异化靠 prompt 而非 skill 重载，避免 SKILL 维护膨胀
9. **build-report.md 含 6 维度自审**：跟 xdd-build 的 code-review.json 概念一致，但输出 markdown 报告（nfflow 偏好 markdown 风格）
10. **失败日志**：复用 `.xdd/runs/xdd_run/failure-log.md` 路径（nfflow 跟 xdd-flow 共享失败日志文件，按流名前缀区分条目），避免目录冗余

---

## Out of Scope（不做）

- **不动 xdd-flow agent/skill**：xdd-flow / xdd-design / xdd-plan / xdd-build / xdd-verify / xdd-execute / xdd-cleanup 全部保留原状。本轮升级只改 nfflow 一侧。
- **不动 nf-design / e2e-test skill**：只调整 flow-agent.md 调度，不重写 SKILL.md。
- **不在 src/agents/ 下写代码**：本轮只产出 `.xdd/design/intent.md` + `design.md`。`src/agents/nf-builder.md` / `src/agents/flow-agent.md` / `src/agents/nf-attacker.md` 的**具体改写**留给后续 xdd-spec / xdd-execute 跑。
- **不写具体 task 计划**：plan task 留给 xdd-plan skill。
- **不预写 Gherkin scenarios.feature / architecture.md**：这些是 nf-designer 的产出，不是本轮设计的内容。
- **不绑技术栈**：nfflow 通用，nfflow 跑的项目用什么栈，由 architecture 决定。
- **不写 NF 配置文件**（如 `nf-config.yaml`）：nfflow 保持无配置、不存 runtime.json，跟 flow-agent.md 现状一致。
- **不写 Docker / CI**：跟运行时基础设施无关，架构升级是 flow 编排层的事。
- **不审查现有 .nf/ 项目**：本轮只画设计，不做反向审计（那是 xdd-reverse 活）。**【已反转】** 既然 `.nf/` 目录取消，本项不再相关。
- **不做 nfflow→xdd-flow 迁移工具**：nfflow 跑完的任务不自动迁移到 xdd-flow（用户可手动接 RXX）。本轮不写迁移脚本。

---

## Open Questions（已答）

> 1. **nf-builder 的"build-report.md"放在哪？**
>    - **✅ 已答：`.xdd/runs/nf_run/build-report.md`**（用户原话）
>    - 理由：nfflow 报告统一存 `.xdd/runs/nf_run/`，跟 e2e-report / reflect-attack-* 平级，跟 xdd-flow 的 `.xdd/runs/xdd_run/` 隔离

2. **反思攻击之间 task_id 续接的"保留范围"是？**
   - **✅ 已答：全部保留**（同 xdd-flow 实践）
   - 保留前序 P0 列表 + 攻击历史 + RXX 知识 + 完整 subagent 上下文
   - 便于反思#2 验证反思#1 标记的"已修 P0"真修了

3. **阶段2 ↔ 反思#2 要不要 task_id 续接？**
   - **✅ 已答：不续接**
   - 理由：attacker 应该是"独立第三方"，不应该看过 builder 的实现笔记；阶段切换 / 阶段与反思之间都不续接

4. **三条反思攻击能不能并行派？**
   - **✅ 已答：6 节点串行**
   - 理由：用户原话「**每个阶段都要有反思攻击**」隐含每阶段后必反思；保存反思攻击历史可读性

5. **Gate 中 P0/P1 算反思攻击的硬 Gate 吗？**
   - **✅ 已答：P0=0 才进下一阶段（硬阻塞），P1=0 标警告（不阻塞）**
   - 理由：P0 = 存根 / sham / 用户旅途走不通（必须修），P1 = 兜底未拦 / 行为错（标警告不阻塞，提高效率）

6. **要不要新增 `nf-acceptance-attacker` 单独 agent？**
   - **✅ 已答：复用 nf-attacker，加 stage 参数**
   - 理由：避免 agent 膨胀；3 个反思阶段的攻击方法论一致（正向 + 兜底 + 反 sham + P0/P1/P2），差异化靠 prompt

7. **nfflow 项目的 RXX 编号要不要跟 xdd-flow 共享计数器？**
   - **✅ 已答：项目级共享**
   - 理由：nfflow 合并到 `.xdd/` 后，RXX 编号必须项目级共享（按 `Bxx-slug` 隔离），nfflow 跟 xdd-flow 消费同一份 `.xdd/design/spec/{Bxx-slug}/rules.md`
   - 关键变化：原 brainstomer 建议"独立"，本轮用户改为"共享"

> **变更 A 标记**：本轮所有 7 个 Open Questions 全部由用户裁决。最大变化是 Q1（路径搬迁到 `.xdd/runs/nf_run/`）+ Q7（共享 RXX 编号），这两条连带反转了「nfflow 跟 xdd-flow 目录约定」「RXX 编号独立性」两条核心假设。
