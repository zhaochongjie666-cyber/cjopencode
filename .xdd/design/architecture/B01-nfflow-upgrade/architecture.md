# B01-nfflow-upgrade — 架构锚

> nfflow 6 节点流程编排平台的技术架构。
> 把 R01~R07 业务规则映射到模块 / API 端点 / 事件契约 / 状态机 / 运维视图。

## 0. 已知事实 / 架构决策 / 待确认问题

### 已知事实（来自 design.md + intent.md）

- nfflow 是 cjopencode 仓库的轻量版流程编排平台（跟 xdd-flow 并存）
- nfflow 跟 xdd-flow 共享 `.xdd/design/` 目录，但报告隔离在 `.xdd/runs/nf_run/`
- 6 节点流程 = 3 阶段（explore-design / build / acceptance）+ 3 反思（reflect-design / reflect-build / reflect-acceptance）
- 每阶段前一个反思攻击横向自检
- 回退表覆盖 9 种情形，回退预算 8 次
- 反思攻击之间 task_id 续接，阶段切换 / 阶段与反思之间不续接
- Gate 标准 5 条硬检查（产物真实落盘 / 字节数 / 关键 grep / 存根检测 / commit 追溯）
- 设计产物文件路径已经固化（见 `.xdd/design/design.md` 决策 7）

### 架构决策（技术团队根据约束做）

- **主调度**：flow-agent（5 个 subagent 的派发器 + 6 节点 todowrite 状态机）
- **subagent 通信**：通过 opencode 平台的 `Task(subagent_type=..., prompt=...)` 模式（不是 HTTP）
- **task_id 续接**：nf-attacker 同一 session 内续接（保留前序 P0 列表）
- **fail-fast Gate**：每阶段 Gate 独立验证，不靠前序推断
- **失败日志共享**：`.xdd/runs/xdd_run/failure-log.md`（按流名前缀区分）

### 待确认问题（需求没答案但会影响实现）

- **flow-agent 跑 6 节点时的物理位置**：在用户本地 IDE 跑（CLI 模式）还是 opencode server 跑？→ 暂定「用户在本地 IDE 跑（CLI 模式）」。
- **subagent 通信协议**：opencode 平台内部的 `Task()` 调用，不是 HTTP REST。→ 暂定「平台内部 Task() 调用，不暴露 HTTP」。
- **e2e-tester 跑在 headless 浏览器 vs 本地浏览器**：→ 暂定「headless 浏览器（npm playwright）」，截图落 `.xdd/runs/nf_run/screenshots/`。

---

## 1. 模块划分

### 1.1 主调度（flow-agent）

```
flow-agent
├── 入口：用户 prompt（CLI/IDE 注入）
├── 状态机：todowrite 6 节点 + 9 种回退表 + 8 次预算
├── 派发器：Task(subagent_type=..., prompt=...) × 5 subagent
├── Gate 验证器：5 条硬检查（产物落盘 / 字节数 / grep / 存根 / commit）
├── 续接调度器：task_id 续接 / 不续接决策
└── 报告收集器：读 .xdd/runs/nf_run/ 全部报告
```

### 1.2 5 个 subagent（按节点分类）

| Subagent | 装 skill | 入口 prompt | 产出 | 不负责 |
|----------|---------|-----------|------|--------|
| **nf-designer** | `nf-design` | 「按用户 X 任务探索设计」 | `.xdd/design/intent.md` + `design.md` + `spec/{Bxx-slug}/rules.md` + `scenarios.feature` + `architecture/{Bxx-slug}/architecture.md` | 不写代码、不跑反思攻击 |
| **nf-builder** | `xdd-execute` + `xdd-cleanup` | 「装 R01~RXX + Scenario + architecture，写 TDD 代码」 | 代码 `@implements RXX` + `.xdd/runs/nf_run/build-report.md` + `code-review.json` | 不做设计、不跑反思攻击 |
| **nf-attacker** | `nf-attack` | 「stage=design/build/acceptance，跑 5 段方法」 | `.xdd/runs/nf_run/reflect-attack-{stage}-report.md` | 不写代码、不做设计、不做 e2e |
| **e2e-tester** | `e2e-test` | 「跑用户旅途 + 截图」 | `.xdd/runs/nf_run/e2e-report.md` + `screenshots/*.png` | 不写代码、不做设计 |
| **flow-agent**（自调） | - | - | 6 节点 todowrite 状态机推进 | 不写代码、不做设计、不做 e2e |

### 1.3 模块职责表

| 模块 | 职责 | 不负责 |
|------|------|--------|
| **flow-agent state machine** | 维护 6 节点 todowrite + 推进 / 回退 | 不写代码、不直接管理文件 |
| **flow-agent gate validator** | 跑 5 条硬检查（stat / wc -c / grep / no-stub-check / git log） | 不解释结论（只返回 pass / fail） |
| **flow-agent rollback dispatch** | 根据回退表 9 种情形更新 todowrite + 派 subagent 续接 | 不写代码 |
| **nf-designer** | 探索设计 → 5 件产物 | 不写代码、不反思攻击 |
| **nf-builder TDD loop** | TDD 循环（test → impl → refactor → commit） | 不做设计、不反思攻击 |
| **nf-builder code-review** | 6 维度自审 + 产 code-review.json | 不替反思攻击下结论 |
| **nf-attacker 5 段方法** | 阶段产物状态 + 正向验证 + 兜底攻击 + 反 sham + 问题清单 | 不写代码、不做设计、不做 e2e |
| **e2e-tester** | 跑用户旅途 + 截图 + 产 e2e-report.md | 不写代码、不做设计 |
| **Task(subagent_type=...)** | subagent 派发通信（opencode 平台内） | 不替 subagent 决策 |

---

## 2. 端点契约（subagent 入口 / 出口）

> nfflow 是 subagent 调度平台，**没有传统 HTTP REST API 端点**。"端点"等价于 subagent 入口（prompt 接口）和出口（产物文件）。

### 2.1 端点清单总表

| 端点 | subagent | BXX | NYY | 覆盖规则 | 入口（prompt） | 出口（产物） | Gate |
|------|----------|-----|-----|---------|---------------|-------------|------|
| Task(subagent_type=nf-designer) | nf-designer | B01 | N01 | R01, R06 | 用户任务 + 「按 nf-design 跑」 | 5 件设计产物 | 5 条硬检查 |
| Task(subagent_type=nf-attacker, stage=design) | nf-attacker | B01 | N02 | R03, R06 | 「stage=design 跑 5 段方法」 | reflect-attack-design-report.md | P0=0 + P1=0 |
| Task(subagent_type=nf-builder) | nf-builder | B01 | N03 | R02, R06 | 「装 xdd-execute + xdd-cleanup，按 RXX 跑 TDD」 | 代码 + build-report.md + code-review.json | no-stub-check 零命中 + 全测试 PASS |
| Task(subagent_type=nf-attacker, stage=build) | nf-attacker | B01 | N04 | R03, R05, R06 | 「stage=build 跑 5 段方法」 + 前序 P0 列表 | reflect-attack-build-report.md | P0=0 + P1=0 |
| Task(subagent_type=e2e-tester) | e2e-tester | B01 | N05 | R01, R06 | 「跑用户旅途 + 截图」 | e2e-report.md + screenshots/*.png | 用户旅途走通 + 截图齐 |
| Task(subagent_type=nf-attacker, stage=acceptance) | nf-attacker | B01 | N06 | R03, R05, R06 | 「stage=acceptance 跑 5 段方法」 + 前序 P0 列表 | reflect-attack-acceptance-report.md | P0=0 + P1=0 |

### 2.2 端点详细契约

#### N01 · nf-designer 入口

```markdown
@flow B01-N01
@rules R01, R06
@input:
  - user_task: string（用户原话）
  - stage: "explore-design"
@output:
  - .xdd/design/intent.md（≥ 80 字节）
  - .xdd/design/design.md（≥ 150 字节）
  - .xdd/design/spec/{Bxx-slug}/rules.md（≥ 200 字节）
  - .xdd/design/spec/{Bxx-slug}/scenarios.feature（≥ 500 字节）
  - .xdd/design/architecture/{Bxx-slug}/architecture.md（≥ 200 字节）
@errors:
  - DESIGN_INCOMPLETE: 5 件产物缺 1 件
  - RXX_COUNT_LOW: rules.md 里 RXX < 7
  - SCENARIO_COVERAGE_LOW: scenarios.feature @covers RXX < 7
```

#### N02 · nf-attacker (stage=design) 入口

```markdown
@flow B01-N02
@rules R03, R06
@input:
  - stage: "design"
  - design_artifacts: paths × 5
@output:
  - .xdd/runs/nf_run/reflect-attack-design-report.md（≥ 1000 字节）
@errors:
  - P0_FOUND: 报告 §5 标 P0 ≥ 1
  - P1_FOUND: 报告 §5 标 P1 ≥ 1（警告不阻塞）
```

#### N03 · nf-builder 入口

```markdown
@flow B01-N03
@rules R02, R06
@input:
  - rules_md: path to .xdd/design/spec/{Bxx-slug}/rules.md
  - scenarios_feature: path to .xdd/design/spec/{Bxx-slug}/scenarios.feature
  - architecture_md: path to .xdd/design/architecture/{Bxx-slug}/architecture.md
@output:
  - 代码 src/**/*.{py,ts,go,...}（每文件 ≤ 500 行）
  - 测试 tests/**/*_test.py（每 RXX 至少 1 个）
  - .xdd/runs/nf_run/build-report.md（≥ 1000 字节）
  - .xdd/runs/nf_run/code-review.json（含 6 维度 + verdict=pass）
@errors:
  - STUB_FOUND: 代码含 pass / TODO / NotImplementedError
  - RXX_NOT_IMPLEMENTED: @implements RXX 缺失（hash 命中 < 7）
  - TEST_FAILED: pytest 退出非 0
```

#### N04 · nf-attacker (stage=build) 入口

```markdown
@flow B01-N04
@rules R03, R05, R06
@input:
  - stage: "build"
  - prior_p0: list[string]（来自反思#1 的 P0 列表，验证是否已修）
  - task_id: 反思#1 的 task_id（task_id 续接）
@output:
  - .xdd/runs/nf_run/reflect-attack-build-report.md（≥ 1000 字节）
@errors:
  - P0_FOUND: 报告 §5 标 P0 ≥ 1
  - PRIOR_P0_NOT_VERIFIED: 报告 §1 没验证前序 P0
```

#### N05 · e2e-tester 入口

```markdown
@flow B01-N05
@rules R01, R06
@input:
  - user_journey: list[step]
  - base_url: 应用启动后的访问 URL
@output:
  - .xdd/runs/nf_run/e2e-report.md（≥ 1000 字节）
  - .xdd/runs/nf_run/screenshots/*.png（≥ 4 张，每张 ≥ 5KB）
@errors:
  - JOURNEY_BLOCKED: 用户旅途走不通
  - SCREENSHOT_MISSING: 截图缺失 0/4
```

#### N06 · nf-attacker (stage=acceptance) 入口

```markdown
@flow B01-N06
@rules R03, R05, R06
@input:
  - stage: "acceptance"
  - prior_p0: list[string]（来自反思#2 的 P0 列表，验证是否已修）
  - task_id: 反思#2 的 task_id（task_id 续接）
@output:
  - .xdd/runs/nf_run/reflect-attack-acceptance-report.md（≥ 1000 字节）
@errors:
  - P0_FOUND: 报告 §5 标 P0 ≥ 1
  - PRIOR_P0_NOT_VERIFIED: 报告 §1 没验证前序 P0
```

---

## 3. 事件契约（流程节点间文件传递清单）

> nfflow 是 subagent 调度平台，**没有跨服务的 MQ 事件**。"事件"等价于阶段间文件传递（Handoff 文档）。

### 3.1 文件传递清单

| 源节点 | 目标节点 | 传递文件 | 格式 | 约束 |
|--------|---------|---------|------|------|
| 阶段1（explore-design） | 反思#1 | 5 件设计产物 | markdown / gherkin | 字节数 ≥ 阈值 |
| 反思#1 | 阶段2（build） | reflect-attack-design-report.md（确认 P0=0） | markdown | P0=0 才传 |
| 阶段2（build） | 反思#2 | 代码 + tests + build-report.md + code-review.json | 多种 | git commit + tag |
| 反思#2 | 阶段3（acceptance） | reflect-attack-build-report.md（确认 P0=0） | markdown | P0=0 才传 |
| 阶段3（acceptance） | 反思#3 | e2e-report.md + screenshots/*.png | markdown + png | 截图 ≥ 4 张 |
| 反思#3 | 流程完成 | reflect-attack-acceptance-report.md | markdown | P0=0 + P1=0 |

### 3.2 续接策略（cross-反思）

```
反思#1 (task_id=001)
  ↓ 产出 P0-list-A
反思#2 (task_id=001 续接, prompt 显式含 P0-list-A)
  ↓ 产出 P0-list-B
反思#3 (task_id=001 续接, prompt 显式含 P0-list-A + P0-list-B)
```

| 关系 | task_id 续接？ | 显式 prompt 续接内容？ |
|------|--------------|---------------------|
| 阶段1 → 反思#1 | ❌（不同 subagent） | - |
| 反思#1 → 阶段2 | ❌（不同 subagent） | - |
| 阶段2 → 反思#2 | ❌（不同 subagent） | - |
| 反思#2 → 阶段3 | ❌（不同 subagent） | - |
| 阶段3 → 反思#3 | ❌（不同 subagent） | - |
| 反思#1 → 反思#2 | ✅（同 nf-attacker） | 前序 P0-list-A |
| 反思#2 → 反思#3 | ✅（同 nf-attacker） | 前序 P0-list-A + P0-list-B |

---

## 4. 状态机（6 节点 todowrite）

### 4.1 节点状态

| 状态 | 含义 |
|------|------|
| `pending` | 未开始 |
| `in_progress` | 正在执行 |
| `done` | 完成（含 warnings） |
| `done_clean` | 完成（无 P0/P1） |

### 4.2 6 节点初始状态

```
todowrite([
  { content: "阶段1: explore-design",     status: "in_progress", priority: "high" },
  { content: "反思#1: reflect-design",    status: "pending",     priority: "high" },
  { content: "阶段2: build",              status: "pending",     priority: "high" },
  { content: "反思#2: reflect-build",     status: "pending",     priority: "high" },
  { content: "阶段3: acceptance",         status: "pending",     priority: "high" },
  { content: "反思#3: reflect-acceptance", status: "pending",     priority: "high" },
])
```

### 4.3 9 种回退表（详见 R04）

```
[反思#1] P0  → 阶段1 in_progress, 反思#1+之后 all pending
[阶段2]   P0  → 阶段1 in_progress, 阶段2+之后 all pending
[反思#2] 设计 P0 → 阶段1 in_progress, 阶段2+之后 all pending
[反思#2] 实现 P0 → 阶段2 in_progress, 反思#2+之后 all pending
[阶段3]   设计 P0 → 阶段1 in_progress, 阶段2+之后 all pending
[阶段3]   实现 P0 → 阶段2 in_progress, 阶段3+之后 all pending
[反思#3] 设计 P0 → 阶段1 in_progress, 阶段2+之后 all pending
[反思#3] 实现 P0 → 阶段2 in_progress, 阶段3+之后 all pending
[反思#3] 验收 P0 → 阶段3 in_progress, 反思#3 pending
```

### 4.4 状态机 Mermaid（stateDiagram 不适用，用 graph）

> 6 节点状态机用 mermaid `flowchart` 表达更清晰，详见 `flow.mermaid`。

---

## 5. Gate 阈值表（5 条硬检查）

| 阶段 | 产物 | 字节阈值 | 关键 grep 关键字 | 备注 |
|------|------|---------|----------------|------|
| 阶段1 | intent.md | ≥ 80 | 「意图」「目标」 | 1 句话定位 |
| 阶段1 | design.md | ≥ 150 | 「Selected」 | 5 段决策 |
| 阶段1 | rules.md | ≥ 200 | `R[0-9]{2}` | 至少 7 条 RXX |
| 阶段1 | scenarios.feature | ≥ 500 | `@covers R[0-9]{2}` | 每 RXX ≥ 1 |
| 阶段1 | architecture.md | ≥ 200 | 端点 / 事件 / 数据 / 依赖 | 4 关键词全有 |
| 阶段2 | 代码 | 每个文件 ≤ 500 行 | `@implements R[0-9]{2}` | 每 RXX ≥ 1 处 |
| 阶段2 | 测试 | 每 RXX ≥ 1 个 | `@covers R[0-9]{2}` | hash 命中 ≥ 7 |
| 阶段2 | build-report.md | ≥ 1000 | 「6 维度」+「verdict」 | 6 维度自审 |
| 阶段2 | code-review.json | 含 6 维度 | "verdict": "pass" | JSON 格式 |
| 反思#1 | reflect-attack-design-report.md | ≥ 1000 | 「P0」「P1」 | 5 段方法 |
| 反思#2 | reflect-attack-build-report.md | ≥ 1000 | 「P0」「P1」 | 5 段方法 |
| 反思#3 | reflect-attack-acceptance-report.md | ≥ 1000 | 「P0」「P1」 | 5 段方法 |
| 阶段3 | e2e-report.md | ≥ 1000 | 「用户旅途截图」 | 含 4 张截图引用 |
| 阶段3 | screenshots/*.png | ≥ 4 张 | PNG header | 每张 ≥ 5KB |

### 5.1 5 条硬检查（runs in flow-agent）

```bash
# 检查 1: 产物真实落盘
test -f .xdd/design/spec/{Bxx-slug}/rules.md  # 5 件产物各自 test

# 检查 2: 字节数达标
wc -c .xdd/design/spec/{Bxx-slug}/rules.md | awk '{ if ($1 >= 200) exit 0; else exit 1 }'

# 检查 3: 关键 grep 命中
grep -cE "@covers R[0-9]{2}" .xdd/design/spec/{Bxx-slug}/scenarios.feature  # ≥ 7
grep -cE "@implements R[0-9]{2}" src/  # ≥ 7
grep -E "端点|事件|数据|依赖" .xdd/design/architecture/{Bxx-slug}/architecture.md  # 4 关键词全有

# 检查 4: 存根检测（no-stub-check）
./scripts/no-stub-check.sh  # 扫 pass / TODO / NotImplementedError / InMemoryRepository / mock DB / 硬编码 current_user

# 检查 5: commit 追溯
git log --grep='RXX' --oneline | wc -l  # ≥ 7
```

---

## 6. 事务边界

> nfflow 流程节点无 DB 事务（不进单一 DB），但有「文件原子性」概念。

### 6.1 文件原子性

每个阶段产物视为一次原子写入：
- **同一阶段内多文件**：必须全部写完才算阶段 done（任一缺失 → 阶段不通过）
- **跨阶段**：前一阶段 done 是后一阶段启动前提（Gate 验证）

### 6.2 续接不破坏

反思#2 续接反思#1 时，反思#1 的产物（reflect-attack-design-report.md）保留不动。反思#2 写新文件 reflect-attack-build-report.md。

### 6.3 rollback 不破坏

当回退发生时：
- 阶段产物文件保留（不删）
- 阶段状态改为 in_progress
- 其他节点状态改为 pending
- 失败日志写到 `.xdd/runs/xdd_run/failure-log.md`（按 `[nfflow]` 前缀）

---

## 7. 失败模式与恢复

| 失败点 | 主业务结果 | 系统处理 |
|--------|----------|---------|
| 阶段1 Gate 失败 | 流程阻塞 | 触发回退：阶段1 in_progress，续接 nf-designer |
| 反思#1 P0 ≥ 1 | 流程阻塞 | 触发回退：阶段1 in_progress，续接 nf-designer |
| 反思#1 P1 ≥ 1 | 流程继续 + 警告 | 报告标 warn，阶段 1 标 done with warnings |
| 阶段2 no-stub-check 命中 | 流程阻塞 | 触发回退：阶段2 in_progress，续接 nf-builder |
| 阶段2 测试失败 | 流程阻塞 | 触发回退：阶段2 in_progress，续接 nf-builder |
| 反思#2 P0 ≥ 1 | 流程阻塞 | 触发回退：阶段2 in_progress，续接 nf-builder |
| 阶段3 用户旅途走不通 | 流程阻塞 | 触发回退：阶段3 in_progress，续接 e2e-tester |
| 阶段3 截图缺失 | 流程阻塞 | 触发回退：阶段3 in_progress，续接 e2e-tester |
| 反思#3 P0 ≥ 1 | 流程阻塞 | 触发回退：阶段3 in_progress，续接 e2e-tester |
| 阶段预算耗尽（3 次） | 流程暂停 | flow-agent 用 `question` 工具问用户 |
| 总预算耗尽（8 次） | 流程永久暂停 | flow-agent 用 `question` 工具问用户 |
| no-stub-check 漏报 | 反思#2 拦不住 | 反思#3 兜底（stage=acceptance 跑 curl 真实接口） |
| 反思#2 → 反思#3 续接失败 | 反思#3 不知道前序 P0 | 反思#3 报告标 P1（警告：续接未延续） |
| task_id 续接破坏上下文 | 反思#2/3 攻击失准 | 报告标 P1，触发回退重跑阶段 |

---

## 8. 运维视图（ODD）

### 8.1 启动序列

```
用户启动 nfflow（CLI / IDE 命令）
  ↓
flow-agent 加载 `.xdd/runs/xdd_run/goals.md` + status.md
  ↓
flow-agent 初始化 6 节点 todowrite
  ↓
flow-agent 启动 6 节点串行调度
```

### 8.2 关闭序列

```
用户 Ctrl-C / 流程完成
  ↓
flow-agent 把当前 todowrite 状态写到 status.md
  ↓
flow-agent 关闭所有 subagent（task_id 标记 cancelled）
  ↓
flow-agent 退出
```

### 8.3 状态机核心时序图

```
用户 → flow-agent(初始化 todowrite)
  → flow-agent 派 nf-designer
    → nf-designer 写 5 件设计产物
  ← nf-designer 报告 done
  → flow-agent 跑 Gate 5 条
  → flow-agent 派 nf-attacker (stage=design)
    → nf-attacker 跑 5 段方法
  ← nf-attacker 报告 reflect-attack-design-report.md
  → flow-agent 读 P0/P1
  → if P0=0: 继续
  → if P0 ≥ 1: 触发回退到阶段1
  → flow-agent 派 nf-builder
    → nf-builder 装 xdd-execute + xdd-cleanup
    → nf-builder 跑 TDD 循环
  ← nf-builder 报告 build-report.md + code-review.json
  → flow-agent 跑 Gate 5 条
  → flow-agent 派 nf-attacker (stage=build, task_id 续接)
    → nf-attacker 跑 5 段方法
  ← nf-attacker 报告 reflect-attack-build-report.md
  → flow-agent 读 P0/P1 + 验证前序 P0
  → if P0=0: 继续
  → if P0 ≥ 1: 触发回退
  → flow-agent 派 e2e-tester
    → e2e-tester 跑用户旅途 + 截图
  ← e2e-tester 报告 e2e-report.md + screenshots/*.png
  → flow-agent 跑 Gate 5 条
  → flow-agent 派 nf-attacker (stage=acceptance, task_id 续接)
    → nf-attacker 跑 5 段方法
  ← nf-attacker 报告 reflect-attack-acceptance-report.md
  → flow-agent 读 P0/P1 + 验证前序 P0
  → if P0=0 + P1=0: 流程完成
  → flow-agent 标记 6 节点全部 done_clean
```

### 8.4 排障锚点

| 锚点 | 含义 | 排查方式 |
|------|------|---------|
| `.xdd/runs/xdd_run/status.md` | 当前 6 节点状态机进度 | `cat status.md` |
| `.xdd/runs/xdd_run/failure-log.md` | 失败日志（按 `[nfflow]` 前缀过滤） | `grep '\[nfflow\]' failure-log.md` |
| `.xdd/runs/nf_run/build-report.md` | 阶段2 自报告 | `cat build-report.md` |
| `.xdd/runs/nf_run/reflect-attack-{stage}-report.md` | 反思攻击报告 | `cat reflect-attack-*-report.md` |
| `.xdd/runs/nf_run/e2e-report.md` | 阶段3 验收报告 | `cat e2e-report.md` |
| `.xdd/runs/nf_run/screenshots/*.png` | 用户旅途截图 | `ls screenshots/` |
| `.xdd/runs/nf_run/code-review.json` | 6 维度自审 | `cat code-review.json \| jq .verdict` |

### 8.5 自动恢复 vs 人工介入

| 场景 | 自动恢复 | 人工介入 |
|------|---------|---------|
| 阶段内 1 次回退 | ✅ 续接重跑 | - |
| 阶段内 2 次回退 | ✅ 续接重跑 | - |
| 阶段内 3 次回退（预算耗尽） | ❌ | ✅ flow-agent 用 `question` 问用户 |
| 总预算 8 次用完 | ❌ | ✅ flow-agent 强制问用户 |
| no-stub-check 命中 | ✅ 续接重跑 | - |
| 反思攻击报告 P0 ≥ 1 | ✅ 触发回退 | - |
| 用户主动 Ctrl-C | ✅ 状态持久化 | 用户重新启动 |

---

## 9. 可观测性（observability）

### 9.1 日志

- **位置**：`flow-agent 跑在用户本地 IDE，stdout 实时输出`
- **格式**：`[nfflow][阶段名][动作] 详情`
- **关键日志事件**：
  - `[nfflow][flow-agent][init] 6 节点 todowrite 初始化`
  - `[nfflow][flow-agent][dispatch] 派 nf-designer (task_id=...)`
  - `[nfflow][flow-agent][gate] 阶段1 Gate 5 条：pass / fail`
  - `[nfflow][flow-agent][rollback] 反思#1 P0 触发回退：阶段1 in_progress`
  - `[nfflow][nf-attacker][continue] 反思#2 续接反思#1 task_id=..., P0-list-A=...`

### 9.2 指标（runtime 不持久化，仅 status.md 末段聚合）

| 指标 | 含义 |
|------|------|
| stage_done_count | 完成阶段数（0~6） |
| rollback_count | 累计回退次数 |
| staging_counter[stage1~stage3] | 每阶段预算用了几次 |
| stage1_at_designer / stage2_at_builder / stage3_at_tester | 每阶段在哪个 subagent |
| prior_p0_list_size | 反思攻击前序 P0 列表大小 |

### 9.3 告警

- **阶段预算耗尽**：flow-agent 调 `question` 工具
- **总预算耗尽**：flow-agent 调 `question` 工具
- **续接未延续前序 P0**：报告 §1 标 P1 警告
- **no-stub-check 命中**：报告 §4 标 P0 阻塞

---

## 10. ADR（架构决策记录）

### ADR-001 · 6 节点流程编排（3 阶段 + 3 反思）

- **背景**：nfflow 现状 3 阶段（design / attack / e2e），缺中间 build 阶段，attack 是独立阶段而非反思。
- **选择**：升级为 6 节点 = 3 阶段（explore-design / build / acceptance）+ 3 反思（reflect-design / reflect-build / reflect-acceptance）。
- **原因**：用户原话「**nfflow 应当是探索设计-代码实现-验收三个阶段，然后每个阶段都要有反思攻击**」。
- **放弃方案**：
  - 维持 3 阶段（design / attack / e2e）—— 缺 build，攻击打的是文档。
  - 1 总反思报告（设计完后一次性攻击）—— 无法拦截实现 bug / 验收漏测。
- **后果**：每阶段后必反思，P0 硬阻塞；流程更长（6 节点 vs 3 节点），但每节点都被独立验证。

### ADR-002 · nf-builder 装 xdd-execute + xdd-cleanup skill（不依赖 xdd-plan）

- **背景**：xdd-build 已有 TDD + @implements RXX + 6 维度自审实现。
- **选择**：nf-builder 装 `xdd-execute` + `xdd-cleanup` skill（不装 `xdd-plan`）。
- **原因**：
  - nfflow 设计层已经把 RXX + Scenario + 架构都铺好，可直接 TDD，不需要再拆 task
  - skill 单向引用（nfflow 不反向依赖 xdd-flow）
  - 跳过 xdd-plan 节省时间
- **放弃方案**：
  - 装 `xdd-plan` 也 —— 流程重，跟 nfflow 轻量版定位冲突
  - 全自研 TDD 循环 —— 重复造轮子
- **后果**：nfflow 颗粒度比 xdd-flow 粗，但足够覆盖小项目；执行顺序由 RXX 编号决定，不显式 DAG。

### ADR-003 · nf-attacker 同一 agent + stage 参数

- **背景**：反思攻击需要复用同一 attacker，但不同阶段攻击对象不同。
- **选择**：同一 `nf-attacker` agent + `stage ∈ {design, build, acceptance}` 参数。
- **原因**：
  - 攻击方法论一致（正向 + 兜底 + 反 sham + P0/P1/P2）
  - task_id 续接保留前序 P0 列表（"上次 P0 这次是否修了？"）
  - 避免 agent 膨胀（不新增 nf-acceptance-attacker）
- **放弃方案**：
  - 3 个独立 attacker agent —— 重复造轮子，攻击方法论分裂
  - 1 总反思报告（设计 + 实现 + 验收一口气跑）—— 失去阶段化能力
- **后果**：3 份独立报告 `reflect-attack-{stage}-report.md`；反思间续接，阶段切换不续接。

### ADR-004 · flow-agent 6 节点 todowrite + 9 种回退 + 8 次预算

- **背景**：6 节点流程每个都可能回退。
- **选择**：todowrite 6 节点 + 9 种回退表覆盖到位 + 回退预算 8 次。
- **原因**：
  - 9 种表覆盖"反思 N 发现阶段 M 根因"所有情形
  - 8 次预算维持原 flow-agent.md 约定（不增不减）
  - 3 次连续回退同一阶段 → 退出问用户（避免无限回退）
- **放弃方案**：
  - 8+1 总节点（设计并行做）—— 状态机复杂
  - 预算改成 6 次或 10 次 —— 跟现有约定冲突
- **后果**：9 种回退情形明文写定；3 次回退同一阶段 = 阶段预算耗尽；8 次总回退 = 全局预算耗尽。

### ADR-005 · nfflow 设计产物合并到 .xdd/，报告隔离 .xdd/runs/nf_run/

- **背景**：nfflow 跟 xdd-flow 是同设计哲学的两种调度粒度。
- **选择**：nfflow 设计产物落到 `.xdd/design/`（跟 xdd-flow 同目录），报告隔离 `.xdd/runs/nf_run/`（跟 xdd-flow 的 `.xdd/runs/xdd_run/` 平级）。
- **原因**：
  - RXX 编号项目级共享要求设计产物路径统一
  - 报告隔离避免两套 flow 互相覆盖
  - 失败日志共享（`.xdd/runs/xdd_run/failure-log.md`），按流名前缀区分
- **放弃方案**：
  - 维持 `.nf/` 跟 `.xdd/` 两套目录 —— 路径不一致，RXX 编号分裂
  - 统一 `.xdd/`（目录合并）—— 报告乱
- **后果**：nfflow 跟 xdd-flow 同 `.xdd/`，RXX 编号项目级共享；目录约定向前兼容（不再用 `.nf/`）。

### ADR-006 · Gate 5 条硬检查（每阶段独立验证）

- **背景**：每阶段产物可能被 sham（设计层 sham 反向流到实现层）。
- **选择**：每阶段 Gate 5 条硬检查（产物落盘 + 字节数 + 关键 grep + 存根检测 + commit 追溯），不靠「前序通过推断本阶段过」。
- **原因**：
  - 5 条覆盖真实产物（落盘 + 字节）+ 关键内容（grep）+ 反 sham（存根）+ 追溯（commit）
  - 每阶段独立验证：典型反 sham 场景「设计阶段产物 sham」能拦住
- **放弃方案**：
  - 只检查产物存在（`stat` 通过即可）—— 字节数 / grep 都能被 sham
  - 只靠前序通过推断本阶段过 —— 失守
- **后果**：fail-fast Gate；任一阶段 sham 立即拦截。

---

## 11. 业务规则（BR-XX）+ 规则传导矩阵

### 11.1 业务规则（BR-XX）

| BR | 业务规则 | 来源 RXX |
|----|---------|---------|
| BR-01 | nfflow 6 节点流程必须按序串行执行（阶段1 → 反思#1 → 阶段2 → 反思#2 → 阶段3 → 反思#3） | R01 |
| BR-02 | 每阶段 Gate 必须独立验证（5 条硬检查），不靠前序通过推断 | R01, R06 |
| BR-03 | nf-builder 装 `xdd-execute` + `xdd-cleanup` skill，不装 `xdd-plan` | R02 |
| BR-04 | nf-builder 写代码必须用 `@implements RXX` 标注，每 RXX 至少 1 处 | R02 |
| BR-05 | nf-builder 写代码必须 TDD 流程（先测试 → 实现 → 重构 → commit） | R02 |
| BR-06 | 反思#1/2/3 跑 5 段方法（产物状态 + 正向验证 + 兜底攻击 + 反 sham + 问题清单） | R03 |
| BR-07 | 反思攻击 P0 = 硬阻塞（必须回退），P1 = 警告（不阻塞） | R03 |
| BR-08 | flow-agent 6 节点 todowrite 状态机 + 9 种回退表 + 8 次预算 | R04 |
| BR-09 | 同一阶段连续 3 次回退 → 阶段预算耗尽 → 退出问用户 | R04 |
| BR-10 | 总预算 8 次用完 → 强制问用户 | R04 |
| BR-11 | 反思#1 → 反思#2 → 反思#3 同 nf-attacker，task_id 续接保留前序 P0 列表 | R05 |
| BR-12 | 阶段切换 / 阶段与反思之间不续接（不同 subagent） | R05 |
| BR-13 | 续接 prompt 必须显式列前序 P0 列表 + 验证请求 | R05 |
| BR-14 | 反思#2/3 报告 §1 必须显式记录「前序 P0 状态」 | R05 |
| BR-15 | 5 条硬检查：产物落盘 + 字节数 + 关键 grep + 存根检测 + commit 追溯 | R06 |
| BR-16 | nfflow 设计产物落 `.xdd/design/`（不是 `.nf/design/`） | R07 |
| BR-17 | nfflow 报告落 `.xdd/runs/nf_run/`（不是 `.xdd/runs/xdd_run/`） | R07 |
| BR-18 | RXX 编号项目级共享（nfflow 跟 xdd-flow 同份 rules.md） | R07 |
| BR-19 | 跨业务线引用必须带 `Bxx-RXX` 全名 | R07 |

### 11.2 规则传导矩阵

| RXX | BR | 模块 | 文件 | 入口契约 | 实现 |
|-----|-----|------|------|---------|------|
| R01 | BR-01, BR-02 | flow-agent state machine | flow-agent.md §state-machine | N01 / N02 / N03 / N04 / N05 / N06 | - [ ] |
| R02 | BR-03, BR-04, BR-05 | nf-builder | nf-builder.md §tdd-loop | N03 | - [ ] |
| R03 | BR-06, BR-07 | nf-attacker | nf-attacker.md §5-段方法 | N02 / N04 / N06 | - [ ] |
| R04 | BR-08, BR-09, BR-10 | flow-agent state machine | flow-agent.md §rollback-table | N01 / N02 / N03 / N04 / N05 / N06 | - [ ] |
| R05 | BR-11, BR-12, BR-13, BR-14 | flow-agent 续接调度器 | flow-agent.md §task-id-handoff | N04 / N06 | - [ ] |
| R06 | BR-02, BR-15 | flow-agent gate validator | flow-agent.md §gate-validator | N01 / N02 / N03 / N04 / N05 / N06 | - [ ] |
| R07 | BR-16, BR-17, BR-18, BR-19 | flow-agent 路径检查 | flow-agent.md §path-check | N01~N06 | - [ ] |

---

## 12. Feature 追踪矩阵

| Feature Scenario | 业务规则 | 应用入口 | 核心模块 | 数据变化 | 测试级别 |
|-----------------|---------|---------|---------|---------|---------|
| Feature 1·一次完整 nfflow 任务跑通 | BR-01, BR-02 | flow-agent 入口 | flow-agent state machine | 6 个产物落盘 | e2e |
| Feature 1·反思#1 拦设计缺陷 | BR-07, BR-08 | N02 | nf-attacker (stage=design) | reflect-attack-design-report.md | 集成 |
| Feature 1·反思#2 拦实现 sham | BR-07, BR-04 | N04 | nf-attacker (stage=build) | reflect-attack-build-report.md | 集成 |
| Feature 1·反思#3 拦验收漏测 | BR-07 | N06 | nf-attacker (stage=acceptance) | reflect-attack-acceptance-report.md | e2e |
| Feature 1·三回退耗尽阶段预算 | BR-09 | flow-agent | flow-agent state machine | failure-log.md | 集成 |
| Feature 2·nf-builder 跑 TDD 7 条 RXX | BR-03, BR-04, BR-05 | N03 | nf-builder | 代码 + build-report.md | 集成 |
| Feature 2·nf-builder 留 pass / TODO | BR-04 | N03 | nf-builder | 无（Gate 失败） | 单元 |
| Feature 2·nf-builder 缺 @implements | BR-04 | N03 | nf-builder | 无（Gate 失败） | 单元 |
| Feature 3·反思#1/#2/#3 攻击各 stage | BR-06, BR-07 | N02 / N04 / N06 | nf-attacker | 3 份反思报告 | 集成 |
| Feature 4·6 节点 happy path | BR-01 | flow-agent | flow-agent state machine | 6 节点 done | 集成 |
| Feature 4·9 种回退情形 | BR-08 | flow-agent | flow-agent rollback dispatch | 状态机更新 | 单元 |
| Feature 4·3 回退耗尽 → 问用户 | BR-09 | flow-agent | flow-agent `question` | failure-log.md | 集成 |
| Feature 4·8 回退耗尽 → 强问 | BR-10 | flow-agent | flow-agent `question` | failure-log.md | 集成 |
| Feature 5·反思#2 续接 | BR-11, BR-13, BR-14 | N04 | nf-attacker | P0-list 报告 | 集成 |
| Feature 5·阶段2↔反思#2 不续接 | BR-12 | N04 | nf-attacker | 无 | 单元 |
| Feature 5·续接缺失前序 P0 | BR-13 | N04 | nf-attacker | P1 警告 | 集成 |
| Feature 6·阶段1 Gate 5 条 | BR-15 | flow-agent | flow-agent gate validator | 5 条 pass | 单元 |
| Feature 6·阶段2 Gate 5 条 | BR-15 | flow-agent | flow-agent gate validator | 5 条 pass | 集成 |
| Feature 6·字节数不达标 | BR-15 | flow-agent | flow-agent gate validator | Gate 失败 | 单元 |
| Feature 6·grep 不命中 | BR-15 | flow-agent | flow-agent gate validator | Gate 失败 | 单元 |
| Feature 6·前序过本阶段不过 | BR-02, BR-15 | flow-agent | flow-agent gate validator | Gate 失败 | 单元 |
| Feature 7·设计产物落 .xdd/design | BR-16 | flow-agent | flow-agent path-check | 5 件路径 | 单元 |
| Feature 7·报告落 .xdd/runs/nf_run | BR-17 | flow-agent | flow-agent path-check | 7 件路径 | 单元 |
| Feature 7·RXX 编号共享 | BR-18 | flow-agent | flow-agent path-check | - | 集成 |
| Feature 7·路径错 → 回退 | BR-16, BR-17 | flow-agent | flow-agent rollback dispatch | 路径修正 | 集成 |
| Feature 7·Bxx-RXX 编号隔离 | BR-19 | flow-agent | flow-agent path-check | - | 集成 |

---

## 13. 开发任务拆分（DEV-XX，从架构推导）

> 每个 DEV 必须能追溯到 RXX / BR / Feature Scenario。

### 13.1 流程编排层（flow-agent）

- **DEV-01**：flow-agent 6 节点 todowrite 初始化（R01 / BR-01）
- **DEV-02**：flow-agent 5 条 Gate 硬检查实现（R06 / BR-15）
- **DEV-03**：flow-agent 9 种回退表实现（R04 / BR-08）
- **DEV-04**：flow-agent 阶段预算 3 次耗尽 + `question` 兜底（R04 / BR-09）
- **DEV-05**：flow-agent 总预算 8 次耗尽 + 强制问用户（R04 / BR-10）
- **DEV-06**：flow-agent task_id 续接调度器（R05 / BR-11, BR-13）
- **DEV-07**：flow-agent 路径检查（nfflow 报告落 `.xdd/runs/nf_run/`、设计产物落 `.xdd/design/`）（R07 / BR-16, BR-17）

### 13.2 实施层（nf-builder）

- **DEV-08**：nf-builder agent 装 `xdd-execute` + `xdd-cleanup` skill 接入（R02 / BR-03）
- **DEV-09**：nf-builder TDD 循环（test → impl → refactor → commit），commit message 含 RXX 编号（R02 / BR-05）
- **DEV-10**：nf-builder 6 维度自审 + `code-review.json` 产出（R02 / BR-04）

### 13.3 反思层（nf-attacker）

- **DEV-11**：nf-attacker 5 段方法（阶段产物状态 + 正向验证 + 兜底攻击 + 反 sham + 问题清单）（R03 / BR-06）
- **DEV-12**：nf-attacker stage 参数化（design / build / acceptance）（R03 / ADR-003）
- **DEV-13**：nf-attacker 续接时 prompt 显式列前序 P0 列表（R05 / BR-13）

### 13.4 验收层（e2e-tester）

- **DEV-14**：e2e-tester 跑用户旅途 + 截图（4 张 PNG ≥ 5KB）

### 13.5 验证层

- **DEV-15**：no-stub-check 脚本实现（扫 `pass` / `TODO` / `NotImplementedError` / `InMemoryRepository` / mock DB / 硬编码 current_user）

### 13.6 测试策略

- **阶段1 单元测试**：模拟 flow-agent 跑 Gate 5 条，验证 pass / fail 路径
- **阶段2 集成测试**：模拟 nf-builder 跑 TDD 循环，验证 `@implements RXX` 标注 + 测试 PASS
- **反思层 集成测试**：模拟 nf-attacker 跑 5 段方法，验证报告格式 + P0/P1 分级
- **端到端 e2e**：模拟完整 6 节点流程，验证 6 节点 done + 7 件产物落盘

---

## 14. 目录结构（设计 / 运行产物）

```
.xdd/
├── design/                                      # 设计层（nfflow 跟 xdd-flow 共享）
│   ├── intent.md                                # 项目意图
│   ├── design.md                                # 收敛决策
│   ├── _landscape.md                            # 业务线全景
│   ├── spec/
│   │   └── B01-nfflow-upgrade/
│   │       ├── business.md                      # ✅
│   │       ├── rules.md                         # ✅（R01~R07）
│   │       └── scenarios.feature                # ✅（Gherkin）
│   └── architecture/
│       └── B01-nfflow-upgrade/
│           ├── architecture.md                  # ✅（本文件）
│           └── flow.mermaid                     # ✅（6 节点流程图）
├── runs/
│   ├── xdd_run/                                 # xdd-flow 共用失败日志
│   │   ├── goals.md
│   │   ├── status.md
│   │   ├── failure-log.md                       # 失败日志（按 [nfflow] / [xdd-flow] 前缀）
│   │   └── plan/
│   └── nf_run/                                  # nfflow 报告（隔离）
│       ├── build-report.md
│       ├── reflect-attack-design-report.md
│       ├── reflect-attack-build-report.md
│       ├── reflect-attack-acceptance-report.md
│       ├── e2e-report.md
│       ├── code-review.json
│       └── screenshots/
│           └── *.png
```

---

## 15. §21 reconcile 审查（slide 三问）

### Q1 · desiredState 显式可见吗？

| 检查 | 落到哪一节 |
|------|-----------|
| 6 节点状态机的"什么是达成"显式 | §4（每节点 done 含 / done_clean 不含） |
| 反思攻击 P0=0 / P1=0 的"达成"显式 | §5 Gate 阈值表 |
| 阶段预算 3 次 / 总预算 8 次的"达成"显式 | §4.3 + §4.4 |
| 每个 RXX 的"达成"显式（rules.md） | `rules.md` §R01~R07 |

### Q2 · 谁自动检测实际 vs 期望？

| 检测点 | 自动化机制 |
|--------|----------|
| 6 节点状态机 | flow-agent 跑 `todowrite` + 每步 `wc -c` 验证 |
| Gate 5 条 | flow-agent 跑 5 条硬检查脚本（`stat` / `wc -c` / `grep` / `no-stub-check.sh` / `git log`） |
| P0/P1 分级 | nf-attacker 跑 5 段方法后产报告 §5 |
| 续接未延续前序 P0 | nf-attacker 检查报告 §1 是否有"前序 P0 状态"段 |
| 路径错误 | flow-agent 跑 `stat .xdd/runs/nf_run/...` vs `stat .xdd/runs/xdd_run/...` |

### Q3 · 失败能重试并收敛？

| 失败类型 | 瞬态 vs 永久 | 处理 |
|---------|-------------|------|
| 阶段产物 sham | 瞬态（重新实现） | retry：续接 subagent 重跑，最多 3 次 |
| 阶段预算耗尽 | 永久（3 次重试后仍 P0） | 退出问用户，不无限 retry |
| 总预算耗尽 | 永久 | 强制问用户 + 流程永久暂停 |
| 续接未延续前序 P0 | 瞬态 | retry：续接 subagent 重跑 |
| 路径错误 | 瞬态 | retry：续接 subagent 迁移文件 |
| 反思攻击报告 P0 ≥ 1 | 瞬态（修复后能过） | retry：触发回退 + 续接 subagent |

---

## 16. 自检清单

- [x] 6 节点流程编排映射到 5 个 subagent 入口契约
- [x] 9 种回退表 + 8 次预算明文写定
- [x] 5 条 Gate 硬检查 + 字节阈值 + 关键 grep 关键字
- [x] 7 篇反思报告 / 实现报告路径隔离（nfflow / xdd-flow）
- [x] BR-XX 19 条业务规则映射到 RXX
- [x] 规则传导矩阵覆盖 R01~R07
- [x] Feature 追踪矩阵覆盖 7 个 Feature 块 + 27 个 Scenario
- [x] ADR 6 篇关键决策
- [x] 失败模式 14 条 + 运维视图 6 块齐
- [x] §21 reconcile 三问过
- [x] 不引用 `xdd_run/` 路径到设计产物（只在运行层报告用）
- [x] 命名规范：nfflow 用 `nf-*` / `flow-agent` / `e2e-tester`，xdd-flow 用 `xdd-*`
