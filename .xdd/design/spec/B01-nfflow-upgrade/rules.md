# B01-nfflow-upgrade — 规则锚（RXX）

> nfflow 6 节点流程编排平台的所有业务规则。
> **每条 RXX = 1 个 Feature 文件**（在 `scenarios.feature` 同一个文件里按 Feature 块隔离，或拆 .feature）。
> 下游 `xdd-plan` 按 RXX 拆 task，代码 `@implements RXX` 回指，verify 按 Gherkin 场景验收。

## 规则目录

| RXX | 规则一句话 | 角色 | 覆盖 Feature | 关联端点 | 实现 |
|-----|-----------|------|-------------|---------|------|
| R01 | nfflow 6 节点流程（3 阶段 + 3 反思）按 todowrite 串行跑通，阶段 Gate 必须独立验证 | P1 用户（开发者） | `scenarios.feature::Feature 1` | flow-agent 入口（`Task(subagent_type=flow-agent, prompt=...)`） | - [ ] |
| R02 | nf-builder 装 `xdd-execute` + `xdd-cleanup` 读 `.xdd/design/spec/{Bxx-slug}/rules.md` + `scenarios.feature` + `architecture.md`，按 TDD 写真实代码 + `@implements RXX` + 全测试 PASS + `code-review.json` verdict=pass | P1 用户（开发者） | `scenarios.feature::Feature 2` | nf-builder 入口（`Task(subagent_type=nf-builder, prompt=...)`） | - [ ] |
| R03 | nf-attacker 同一 agent + `stage ∈ {design, build, acceptance}`，产出 `reflect-attack-{stage}-report.md`；P0=0 才进下一阶段（硬阻塞），P1=0 才算完成（警告） | P1 用户（开发者） | `scenarios.feature::Feature 3, 4, 5` | nf-attacker 入口（`Task(subagent_type=nf-attacker, prompt=含 stage=...)`） | - [ ] |
| R04 | flow-agent `todowrite` 6 节点状态机 + 9 种回退表覆盖到位 + 回退预算 ≤ 8 次 | P1 用户（开发者） | `scenarios.feature::Feature 6` | flow-agent 内部状态机 | - [ ] |
| R05 | task_id 续接策略：反思#1 ↔ #2 ↔ #3 同一 nf-attacker 续接（保留前序 P0 列表 + 攻击历史 + RXX 知识）；阶段切换 / 阶段与反思之间不续接 | P1 用户（开发者） | `scenarios.feature::Feature 4 (Build + 反思#2 衔接)` | nf-attacker 入口（task_id 参数） | - [ ] |
| R06 | 每阶段 Gate 独立验证：产物真实落盘（`stat .xdd/...` 字节数 ≥ 阈值）+ 关键 grep 命中（@implements RXX / no-stub-check / Scenario 关键词）；不靠「前序通过推断本阶段过」 | P1 用户（开发者） | `scenarios.feature::Feature 1 (Gate 5 条)` | Gate 检查（在 flow-agent / nf-attacker 内部） | - [ ] |
| R07 | nfflow 跟 xdd-flow 并存边界：设计产物共享 `.xdd/design/`（`spec/rules.md` / `scenarios.feature` / `architecture.md` 同份）；nfflow 报告 `.xdd/runs/nf_run/`、xdd-flow 报告 `.xdd/runs/xdd_run/`；RXX 编号项目级共享（按 `Bxx-slug` 隔离） | P1 用户（开发者） | `scenarios.feature::Feature 7 (边界一致性)` | 目录约定 + RXX 编号空间 | - [ ] |

> **「实现」列语义**：`[x]` = 代码有 `@implements RXX` 标注；`[ ]` = 未实现。本表是运行时状态，跟 plan task 进度表语义不同，本表只看代码追溯。

---

## R01 · nfflow 6 节点流程编排

**规则**：nfflow 入口接受用户 prompt 后，flow-agent 启动 6 节点 todowrite 状态机（`stage1: explore-design` → `reflect#1: reflect-design` → `stage2: build` → `reflect#2: reflect-build` → `stage3: acceptance` → `reflect#3: reflect-acceptance`），按序串行执行。每阶段 Gate 必须独立验证（不靠「前序通过推断本阶段过」）。

### 正向

- **Given** flow-agent 6 节点 todowrite 初始化完成
- **When** 用户向 nfflow 入口提交任务描述（例：「用 nfflow 实现给已有 TodoList 加上过期提醒」）
- **Then** flow-agent 依次执行 6 节点：阶段1 → 反思#1 → 阶段2 → 反思#2 → 阶段3 → 反思#3
- **And** 每个阶段产出的报告文件存在且字节数 ≥ 阈值（参见 R06 Gate 标准）
- **And** 每阶段 Gate 独立验证通过（5 条硬检查全过）

### 兜底

- **Given** 任一阶段 Gate 不满足（产物缺失 / 字节数不达标 / grep 关键标记缺失）
- **When** flow-agent 检测到 Gate 失败
- **Then** 阻塞后续阶段启动，触发回退（4 种回退路径，详见 R04）
- **And** 报告记录失败原因并写入 `.xdd/runs/xdd_run/failure-log.md`（按 `[nfflow]` 前缀）
- **And** 不修改后续阶段的 todowrite 状态（保持 `pending`）

---

## R02 · nf-builder agent 装 skill 干活（TDD）

**规则**：新增 `nf-builder` agent，接收 prompt 时装 `xdd-execute` + `xdd-cleanup` skill；从 `.xdd/design/spec/{Bxx-slug}/rules.md` 读 RXX 全集 + 从 `scenarios.feature` 读 Scenario 全集 + 从 `architecture.md` 读端点 / 模块 / 数据存储；按 TDD 流程（先写失败测试 → 最小实现 → 重构 → commit）写真实代码、用 `@implements RXX` 标注；交付必须满足：no-stub-check 零命中 + 全测试 PASS + `code-review.json` 6 维度（空值安全 / 并发安全 / 资源生命周期 / 授权与注入 / 错误处理 / 架构漂移）`verdict=pass` + `.xdd/runs/nf_run/build-report.md` 产出。

### 正向

- **Given** 阶段 1 完成的 5 件设计产物（rules.md / scenarios.feature / architecture.md / intent.md / design.md）齐全
- **When** flow-agent 在阶段 2 派 nf-builder
- **Then** nf-builder 装 `xdd-execute` + `xdd-cleanup` skill（不在 prompt 里写 skill 内容，直接 `use skill: xdd-execute`）
- **And** 读 `.xdd/design/spec/{Bxx-slug}/rules.md` 拿到 RXX 全集（例：B01-R01 ~ B01-R07）
- **And** 按 RXX 顺序逐条 TDD：先写测试（标 `@covers RXX`）→ 跑测试确认失败 → 最小实现（标 `@implements RXX`）→ 跑测试确认通过 → 重构 → commit（commit message 含 RXX 编号）
- **And** 跑通 `no-stub-check` 脚本（扫 `pass` / `TODO` / `NotImplementedError` / `InMemoryRepository` / mock DB / 硬编码 current_user）零命中
- **And** 跑通全测试套件（exit code 0）
- **And** 产出 `.xdd/runs/nf_run/code-review.json` 含 6 维度自审 + `verdict=pass`
- **And** 产出 `.xdd/runs/nf_run/build-report.md`，按 6 维度 markdown 报告

### 兜底

- **Given** nf-builder 写出 `@implements RXX` 但代码含 `pass` / `TODO` / `NotImplementedError`
- **When** 反思#2 nf-attacker 跑 `no-stub-check`
- **Then** 报告标记 P0 ≥ 1（硬阻塞），触发回退到阶段 2
- **And** 续接 nf-builder（task_id 续接）修复，保留前序 P0 列表
- **And** 修复后必须 re-run 全测试 + re-run no-stub-check 零命中

- **Given** nf-builder 写出代码但没标 `@implements RXX`
- **When** 反思#2 nf-attacker 跑 `grep @implements RXX`
- **Then** 报告标记 P0 ≥ 1（硬阻塞），触发回退
- **And** 续接 nf-builder 补标注，re-run Gate

---

## R03 · nf-attacker 阶段化反思（P0 硬阻塞 + P1 警告）

**规则**：反思攻击是横向动作（不是独立阶段），通过 `nf-attacker` 同一 agent + `stage` 参数实现。`stage ∈ {design, build, acceptance}`，每阶段产物落盘后立即派 nf-attacker 跑 `reflect-attack-{stage}-report.md`。**P0=0 才进下一阶段（硬阻塞），P1=0 才算完成（警告）**。攻击方法论 5 段：阶段产物状态 + 正向验证 + 兜底攻击 + 反 sham 检查 + 问题清单（P0/P1/P2）。

### 正向

- **Given** 阶段 1 产物落盘（rules.md / scenarios.feature / architecture.md）
- **When** flow-agent 派 nf-attacker (`stage=design`)
- **Then** nf-attacker 装 `nf-attack` skill，按 5 段方法跑：
  - 阶段产物状态：每个产物 grep 关键标记（rules.md 含 RXX 编号 / scenarios.feature 含 @covers / architecture.md 含端点）
  - 正向验证：每条 RXX 至少 1 个 Scenario 覆盖
  - 兜底攻击：scenarios.feature 至少 1 个 `[拒绝|失败|不存在|无权限|冲突]` 异常场景
  - 反 sham 检查：no-stub-check / mock / 硬编码 / 假数据
  - 问题清单：P0/P1/P2 分级
- **And** 产出 `.xdd/runs/nf_run/reflect-attack-design-report.md`
- **And** 若 P0=0 且 P1=0 → 报告标记「pass」，进下一阶段

### 兜底

- **Given** 反思#1 报告 P0 ≥ 1（例：scenarios.feature 缺密码错误兜底场景）
- **When** flow-agent 读报告
- **Then** 触发回退：阶段 1 in_progress，阶段 2 / 3 / 反思#2 / 反思#3 all pending
- **And** 续接 nf-designer 修复（task_id 续接，保留前序 P0 列表）
- **And** 修复后必须 re-run 反思#1 直至 P0=0

- **Given** 反思#1 报告 P1 ≥ 1（例：scenarios.feature 异常路径不完整）
- **When** flow-agent 读报告
- **Then** 报告标记「warn」，流程继续（警告不阻塞）
- **And** P1 写到 `.xdd/runs/nf_run/reflect-attack-design-report.md` 末尾「warning」段
- **And** 阶段 1 标「done with warnings」

- **Given** 反思#2 报告 P0 ≥ 1（no-stub-check 命中）
- **When** flow-agent 读报告
- **Then** 触发回退：阶段 2 in_progress，阶段 3 / 反思#3 all pending
- **And** 续接 nf-builder 修复

- **Given** 反思#3 报告 P0 ≥ 1（用户旅途截图缺失）
- **When** flow-agent 读报告
- **Then** 触发回退：阶段 3 in_progress，反思#3 pending
- **And** 续接 e2e-tester 补截图

---

## R04 · flow-agent 6 节点 todowrite 状态机（9 种回退 + 预算 8 次）

**规则**：flow-agent 主调度用 todowrite 维护 6 节点状态机（in_progress / pending / done）。回退表覆盖 9 种「反思 N 发现阶段 M 根因」映射。回退预算 8 次（连续 3 次回退同一阶段则退出问用户）。

### 正向

- **Given** flow-agent 初始化 6 节点 todowrite：阶段1 / 反思#1 / 阶段2 / 反思#2 / 阶段3 / 反思#3，每个 priority=high
- **When** 阶段 1 in_progress，其余 5 项 pending
- **Then** 阶段 1 完成 → 阶段 1 done / 反思#1 in_progress
- **And** 反思#1 完成 → 反思#1 done / 阶段 2 in_progress
- **And** 阶段 2 完成 → 阶段 2 done / 反思#2 in_progress
- **And** 反思#2 完成 → 反思#2 done / 阶段 3 in_progress
- **And** 阶段 3 完成 → 阶段 3 done / 反思#3 in_progress
- **And** 反思#3 完成 → 反思#3 done / 流程完成

### 兜底（9 种回退表）

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

- **Given** 同一阶段连续 3 次回退（回退计数器 ≥ 3）
- **When** flow-agent 检测到阶段预算耗尽
- **Then** flow-agent 用 `question` 工具向用户报告：
  - 阶段性失败原因（前 3 次回退的 P0 列表）
  - 累计回退次数（≥ 3）
  - 询问用户：「继续自动回退 / 暂停 / 调整规则」
- **And** 流程暂停（不自动重启）
- **And** 用户回答后由 flow-agent 继续

- **Given** 累计回退次数 ≥ 8（全局预算）
- **When** flow-agent 检测到总预算耗尽
- **Then** 强制 flow-agent 用 `question` 工具向用户报告
- **And** 流程永久暂停，等用户介入

---

## R05 · task_id 续接策略（反思间续接，阶段切换不续接）

**规则**：`task_id` 续接策略按关系分两类：
- **续接**：反思#1 → 反思#2 → 反思#3（同 nf-attacker，保留前序 P0 列表 + 攻击历史 + RXX 知识）
- **不续接**：阶段 ↔ 反思（不同 subagent）、阶段切换

### 正向

- **Given** 反思#1 跑完，产出 P0 列表 [P0-A: scenarios.feature 缺密码错误场景, P0-B: 端点列表不完整]
- **When** 反思#2 启动
- **Then** nf-attacker 接收 prompt 时显式传 `task_id` = 反思#1 的 task_id（同 session 续接）
- **And** prompt 中显式列出前序 P0 列表 + 验证请求（"P0-A 是否已修？P0-B 是否已修？"）
- **And** 反思#2 报告 `## 1. 阶段产物状态` 段显式记录「前序 P0 状态：P0-A 已修 / P0-B 未修（仍是 P0）」

- **Given** 阶段 2 跑完
- **When** 反思#2 启动
- **Then** nf-attacker 接收 prompt 时**不传** task_id（不同 subagent）
- **And** 反思#2 报告只引用 build-report.md + rules.md + scenarios.feature + architecture.md，**不引用** nf-builder 的 task_id

### 兜底

- **Given** 反思#2 续接反思#1 的 task_id，但 prompt 没列前序 P0 列表
- **When** 反思#2 跑
- **Then** 报告标记 P1（警告，续接未能延续前序 P0 上下文）
- **And** flow-agent 触发回退：阶段 2 in_progress，重跑阶段 2（确保 nf-builder 知道 P0-A/P0-B 要修）

- **Given** 反思#1 → 反思#2 续接，反思#2 报告没验证前序 P0 是否已修
- **When** flow-agent 读反思#2 报告
- **Then** 报告标记 P0（新规则违反：续接必须验证前序 P0）
- **And** 触发回退：阶段 2 in_progress

---

## R06 · Gate 标准（每阶段独立验证）

**规则**：每阶段 Gate 独立验证，**不靠「前序通过推断本阶段过」**。每阶段必须满足 5 条硬检查（产物真实落盘 + 字节数 + 关键 grep 命中），才能进下一节点。

### 正向（5 条硬检查）

1. **产物真实落盘**：`stat .xdd/...` 返回真实文件（不是空目录 / 符号链接 / 临时文件）
2. **字节数达标**：每阶段产物字节数 ≥ 阈值（详见 architecture.md §Gate 阈值表）
3. **关键 grep 命中**：
   - rules.md 含 `RXX 编号（至少 R0X 共 7 条）`
   - scenarios.feature 含 `@covers RXX` 至少 1 次（每 RXX 至少 1 个 Scenario）
   - architecture.md 含 `端点` / `事件` / `数据` / `依赖` 4 关键词
   - 代码含 `@implements RXX` 标注（每 RXX 至少 1 处）
   - build-report.md 含 6 维度自审 + verdict 字段
   - e2e-report.md 含 `screenshots/` 引用
4. **存根检测**：no-stub-check 脚本零命中（扫 `pass` / `TODO` / `NotImplementedError` / `InMemoryRepository` / mock DB / 硬编码 current_user）
5. **commit 追溯**：每个 RXX 对应的 commit message 含 `RXX` 编号（`git log --grep 'RXX'` 命中）

### 兜底

- **Given** 产物字节数 < 阈值（例：rules.md 仅 50 字节）
- **When** flow-agent 跑 5 条硬检查
- **Then** 检查结果标记 Gate 不通过，把具体失败项（哪 1 条 X 项）写进失败日志
- **And** 阻塞下一阶段启动

- **Given** 关键 grep 不命中（例：architecture.md 缺「端点」关键词）
- **When** flow-agent 跑 5 条硬检查
- **Then** 检查结果标记 Gate 不通过
- **And** 报告参考 R03 触发回退

- **Given** 前序 Gate 通过但本阶段 Gate 失败（典型反 sham 场景：设计阶段产物 sham）
- **When** flow-agent 跑本阶段 Gate
- **Then** 阻塞本阶段，不允许「前序通过推断本阶段过」
- **And** 触发回退到本阶段对应的 subagent（即阶段 1 的 sham 设计回退到阶段 1）

---

## R07 · nfflow 跟 xdd-flow 并存边界（共享 `.xdd/design/` + 隔离 `.xdd/runs/nf_run/`）

**规则**：nfflow 跟 xdd-flow 是同设计哲学的两种调度粒度，**共享 `.xdd/` 目录**，但**用不同的 runs 子目录隔离**。两套 agent 命名独立（`nf-*` / `xdd-*`），共享 RXX 编号空间（按 `Bxx-slug` 隔离）。

### 正向

- **Given** nfflow 跑完一个任务，产出 5 件设计产物（rules.md / scenarios.feature / architecture.md / intent.md / design.md）
- **When** xdd-flow 接手消费（用同一份 RXX）
- **Then** xdd-flow 读 `.xdd/design/spec/{Bxx-slug}/rules.md` 拿到 RXX 全集
- **And** xdd-flow 读 `.xdd/design/spec/{Bxx-slug}/scenarios.feature` 拿到 Scenario 全集
- **And** xdd-flow 读 `.xdd/design/architecture/{Bxx-slug}/architecture.md` 拿到端点 / 模块 / 数据存储
- **And** 不重复写设计产物（直接复用 nfflow 写的）

- **Given** nfflow 跑完一个任务
- **When** 检查设计产物路径
- **Then** 5 件设计产物在 `.xdd/design/` 下（不是 `.nf/design/`）
- **And** 4 件运行报告在 `.xdd/runs/nf_run/` 下（不是 `.xdd/runs/xdd_run/`）：
  - `.xdd/runs/nf_run/build-report.md`
  - `.xdd/runs/nf_run/reflect-attack-design-report.md`
  - `.xdd/runs/nf_run/reflect-attack-build-report.md`
  - `.xdd/runs/nf_run/reflect-attack-acceptance-report.md`
  - `.xdd/runs/nf_run/e2e-report.md`
  - `.xdd/runs/nf_run/code-review.json`
  - `.xdd/runs/nf_run/screenshots/*.png`

- **Given** nfflow 写的 RXX 编号 R01 = 「nfflow 6 节点流程编排」
- **When** xdd-flow 同一项目也用 R01
- **Then** xdd-flow 读 rules.md 看到 R01 含义一致
- **And** 项目级共享 RXX 编号空间（nfflow 写的 R01 跟 xdd-flow 的 R01 是同一规则）

### 兜底

- **Given** nfflow 误把报告写到 `.xdd/runs/xdd_run/`（错误路径）
- **When** flow-agent 跑路径检查
- **Then** Gate 失败，报告标 P0，触发回退到写报告的 subagent
- **And** 续接让 subagent 把报告迁移到 `.xdd/runs/nf_run/`

- **Given** nfflow 跟 xdd-flow 写 R01 含义不一致（例：nfflow 说 R01 = 6 节点，xdd-flow 写 R01 = 其他）
- **When** flow-agent 跑 RXX 编号空间一致性检查
- **Then** 报告标 P0，触发回退
- **And** 续接让两边 subagent 协商 RXX 编号（约定先到先得，后写者调整）

- **Given** RXX 编号跨业务线（例：B01-R01 vs B02-R01）
- **When** flow-agent 跑 RXX 编号隔离检查
- **Then** 编号互不冲突（B01-R01 在 `.xdd/design/spec/B01-*/rules.md`，B02-R01 在 `.xdd/design/spec/B02-*/rules.md`）
- **And** 跨业务线引用必须带 `Bxx-RXX` 全名（如 `B01-R01`），不能裸 `RXX`
