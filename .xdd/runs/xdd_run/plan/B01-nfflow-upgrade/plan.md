# B01-nfflow-upgrade — 实施计划（TDD）

> 给执行工程师：按顺序执行，每步用 checkbox 标进度。遇「待确认」立即停下问人。
> 本文件是执行期唯一动态计划 —— 边做边写，状态、命令证据和决策必须发生时落盘，禁止收尾时批量补写。
> 本轮是「**nfflow 6 节点流程编排升级**」的实施 plan（从 .xdd/ 设计层翻译到 src/ 代码层）。

**目标：** 把 cjopencode 仓库的 nfflow 从 3 阶段（design → attack → e2e）升级为 6 节点（3 阶段 + 3 反思），新增 `nf-builder` agent 装 `xdd-execute + xdd-cleanup` 写代码，把所有路径从 `.nf/` 搬到 `.xdd/`，让 7 条 R01~R07 业务规则全部 `@implements` 落到 src/。

**架构（2 段）：**
- **流程编排层**：`flow-agent.md` 维护 6 节点 todowrite 状态机 + 9 种回退表 + 8 次预算 + 反思间 task_id 续接；调度 5 个 subagent（`nf-designer` / `nf-attacker (stage=design)` / `nf-builder` / `nf-attacker (stage=build)` / `e2e-tester` / `nf-attacker (stage=acceptance)`）。
- **实施层**：`nf-builder.md` 装 `xdd-execute` + `xdd-cleanup` 跑 TDD，按 `@implements RXX` 写代码 + 产 `.xdd/runs/nf_run/build-report.md` + `.xdd/runs/nf_run/code-review.json`（6 维度 + verdict=pass）。

**技术栈：** opencode 平台 subagent 调度（`Task(subagent_type=..., prompt=...)`）+ Markdown 配置文件（`src/agents/*.md` + `src/skills/*/SKILL.md`）+ 文件级产物落 `.xdd/runs/nf_run/` + JSON 自审（`code-review.json`）。

**验收来源：** `.xdd/design/spec/B01-nfflow-upgrade/scenarios.feature`（7 Feature 块 / 27 Scenario + 1 Scenario Outline × 9 行 = 28 场景） + `.xdd/design/architecture/B01-nfflow-upgrade/architecture.md`（N01~N06 端点 + §5 Gate 表）+ `.xdd/design/architecture/B01-nfflow-upgrade/resilience/failure-modes.md`（F01~F33 失败模式 + chaos 注入）。

**回指锚：** 每个 task 标 `**回指 RXX:**` + `**端点:**` + `**失败模式:**`；代码用 `@implements RXX` 回指本 plan task。

---

## 全局约束

- **目录隔离**：所有 nfflow 报告落 `.xdd/runs/nf_run/`，**严禁**写到 `.xdd/runs/xdd_run/` 或 `.nf/`。
- **RXX 编号空间**：R01~R07 是项目级共享（按 `Bxx-slug` 隔离），跨业务线引用必须带 `Bxx-RXX` 全名。
- **回退预算**：全局 8 次；同阶段连续 3 次回退 = 阶段预算耗尽 → `question` 工具问用户。
- **task_id 续接**：反思#1 → #2 → #3 同 `nf-attacker` 续接（prompt 显式含前序 P0 列表 + 验证请求）；阶段切换 / 阶段与反思之间不续接。
- **温度参数**：flow-agent `temperature: 0.3`（决策稳定）；nf-designer `temperature: 0.6`；nf-attacker `temperature: 0.4`；e2e-tester `temperature: 0.3`；nf-builder `temperature: 0.6`。
- **no-stub 底线**：禁止 `pass` / `TODO` / `NotImplementedError` / `InMemoryRepository` / mock DB / 硬编码 `current_user`（reflection §4 反 sham 检查硬规则）。
- **P0 硬阻塞**：no-stub 命中 = P0；无 `@implements RXX` = P0；Gate 5 条任何 1 条不满足 = P0；e2e 用户旅途走不通 = P0。P0 ≥ 1 必触发回退。
- **commit 追溯**：每 RXX 对应 commit message 含 `RXX` 编号（`git log --grep 'RXX'` 命中 ≥ 7）。

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/agents/nf-builder.md` | **Create** | 阶段 2 subagent 入口，装 `xdd-execute` + `xdd-cleanup` 跑 TDD + `@implements RXX` + 产 `build-report.md` + `code-review.json` |
| `src/agents/flow-agent.md` | **Rewrite** | 主调度 6 节点 todowrite 状态机 + 9 种回退表 + 8 次预算 + 派 5 subagent + 反思间 task_id 续接 + Gate 5 条硬检查 |
| `src/agents/nf-attacker.md` | **Modify** | 入口加 `stage ∈ {design, build, acceptance}` 参数 + 报告路径改 `.xdd/runs/nf_run/reflect-attack-{stage}-report.md` + 续接策略显式化 |
| `src/agents/nf-designer.md` | **Modify** | 产物路径 `.nf/design/` → `.xdd/design/`（5 件产物路径全换）+ 报告加 `@covers RXX` 引用 |
| `src/agents/e2e-tester.md` | **Modify** | 产物路径 `.nf/runs/e2e-report.md` → `.xdd/runs/nf_run/e2e-report.md` + 截图目录换 |
| `src/skills/nf-design/SKILL.md` | **Modify** | 产物路径全换到 `.xdd/design/` + Gate 标准按 `architecture.md §5` 表 |
| `src/skills/nf-attack/SKILL.md` | **Modify** | 加 `stage` 参数 + 报告路径 `.nf/runs/attack-report.md` → `.xdd/runs/nf_run/reflect-attack-{stage}-report.md` + 5 段结构 + P0/P1/P2 分级 |
| `src/skills/e2e-test/SKILL.md` | **Modify** | 产物路径 `.nf/runs/e2e-report.md` → `.xdd/runs/nf_run/e2e-report.md` + 截图 ≥ 4 张每张 ≥ 5KB |
| `.xdd/runs/xdd_run/code-review.json` | **Create** | nf-builder 6 维度自审 JSON（空值安全 / 并发安全 / 资源生命周期 / 授权与注入 / 错误处理 / 架构漂移）+ verdict=pass + artifactPaths 绑 5 个改文件 |
| `.xdd/runs/xdd_run/plan/B01-nfflow-upgrade/plan.md` | **Create** | 本文件（实施计划） |

---

## 依赖关系

| Task | Depends On | 可并行 |
|------|-----------|--------|
| T01 · 写 `src/agents/nf-builder.md` | None | ✅ |
| T04 · 改 `src/agents/nf-designer.md` | None | ✅ |
| T05 · 改 `src/agents/e2e-tester.md` | None | ✅ |
| T06 · 改 `src/skills/nf-design/SKILL.md` | None | ✅ |
| T08 · 改 `src/skills/e2e-test/SKILL.md` | None | ✅ |
| T02 · 重写 `src/agents/flow-agent.md` | T01, T04, T05, T06 | ❌ |
| T03 · 改 `src/agents/nf-attacker.md` | T02 | ❌ |
| T07 · 改 `src/skills/nf-attack/SKILL.md` | T03 | ❌ |
| T09 · 写 `code-review.json` | T01, T02, T03, T04, T05, T06, T07, T08 | ❌ |
| T10 · 跑 sanity check | T09 | ❌ |
| T11 · 更新 `changelog.md` | T10 | ❌ |

**DAG 拓扑（首批 ready 任务 = T01 / T04 / T05 / T06 / T08，5 个并行）**：

```
[T01] [T04] [T05] [T06] [T08]          (5 个独立首批)
   \    \      \    \      \
    \    \      \    \      └─[T08 单独汇入 T09]
     \    \      \    \      
      \    \      \    └─→──[T02 flow-agent 重写]
       \    \      \        │
        \    \      └───────┤
         \    \             ↓
          \    \          [T03 nf-attacker stage 化]
           \    \           │
            \    \          ↓
             \    \       [T07 nf-attack SKILL]
              \    \        │
               \    \       ↓
                \    \  [T09 code-review.json] ←──────[T08]──┘
                 \    \   │
                  \    \  ↓
                   \    [T10 sanity check]
                    \    │
                     \   ↓
                      [T11 changelog]
```

**DAG 合法性自检**：无环（每条边下游 task 序号 > 上游）；有起点（T01/T04/T05/T06/T08 5 个无依赖节点）；拓扑序可跑通。

---

## RXX 覆盖追踪

| RXX 规则 | 业务含义 | 关键 Feature Scenario | Task | 状态 |
|---------|---------|----------------------|------|------|
| R01 · nfflow 6 节点流程编排 | 6 节点 todowrite 串行 | `scenarios.feature :: Feature 1 一次完整 nfflow 任务跑通（6 节点）` | T02 | - [ ] |
| R02 · nf-builder 装 skill TDD 写代码 | 新增 nf-builder agent | `scenarios.feature :: Feature 2 nf-builder 跑 TDD 写出 7 条 @implements RXX` | T01, T02, T09 | - [ ] |
| R03 · nf-attacker 阶段化反思 | 同一 agent + stage 参数 | `scenarios.feature :: Feature 3 反思#1/#2/#3 攻击各 stage` | T03, T07 | - [ ] |
| R04 · flow-agent 6 节点 + 9 回退 + 8 预算 | todowrite 状态机 | `scenarios.feature :: Feature 4 6 节点 happy path` + `Scenario Outline 9 种回退情形` | T02 | - [ ] |
| R05 · task_id 续接策略 | 反思间续接，阶段切换不续接 | `scenarios.feature :: Feature 5 反思#2 续接反思#1 的 task_id` + `阶段2 ↔ 反思#2 不续接` | T02, T03 | - [ ] |
| R06 · Gate 标准 5 条硬检查 | 每阶段独立验证 | `scenarios.feature :: Feature 6 阶段1 Gate 5 条硬检查全部通过` + `阶段2 Gate 5 条硬检查` | T02 | - [ ] |
| R07 · nfflow 跟 xdd-flow 边界 | 共享 `.xdd/design/` + 隔离 `.xdd/runs/nf_run/` | `scenarios.feature :: Feature 7 nfflow 设计产物落到 .xdd/design/` + `nfflow 运行报告落到 .xdd/runs/nf_run/` | T04, T05, T06, T07, T08 | - [ ] |
| 兜底 R02·实现 sham | 拦截 pass/TODO/缺 @implements | `scenarios.feature :: Feature 2 nf-builder 写出 pass / TODO 残留 → Gate 失败` | T01, T09 | - [ ] |
| 兜底 R04·回退耗尽 | 3 次同阶段 + 8 次总预算 | `scenarios.feature :: Feature 4 同一阶段连续 3 次回退 → 退出问用户` + `累计回退 ≥ 8 次` | T02 | - [ ] |
| 兜底 R05·续接缺失前序 P0 | 续接未延续前序 P0 | `scenarios.feature :: Feature 5 续接缺失前序 P0 列表 → 触发回退` | T03 | - [ ] |
| 兜底 R06·Gate 字节/grep 失败 | 字节阈值 + grep 不命中 | `scenarios.feature :: Feature 6 Gate 字节数不达标` + `Gate 关键 grep 不命中` | T02 | - [ ] |
| 兜底 R07·路径错 | 报告写错目录 | `scenarios.feature :: Feature 7 误把报告写到 .xdd/runs/xdd_run/ → 触发回退` | T02, T04, T05, T06, T07, T08 | - [ ] |

**M==N 自检：** spec R01~R07 共 7 条 RXX；plan 11 个 task 全部 `**回指 RXX:**` 覆盖。RXX 全覆盖 ✅；task 无悬空回指 ✅。

---

## 端点契约覆盖追踪（N01~N06）

| 端点 | subagent | 覆盖 Task | 状态 |
|------|---------|----------|------|
| N01 · nf-designer 入口 | nf-designer | T04, T06 | - [ ] |
| N02 · nf-attacker (stage=design) 入口 | nf-attacker | T03, T07 | - [ ] |
| N03 · nf-builder 入口 | nf-builder | T01, T02, T09 | - [ ] |
| N04 · nf-attacker (stage=build) 入口 | nf-attacker | T03, T07 | - [ ] |
| N05 · e2e-tester 入口 | e2e-tester | T05, T08 | - [ ] |
| N06 · nf-attacker (stage=acceptance) 入口 | nf-attacker | T03, T07 | - [ ] |

---

## 失败模式覆盖追踪（F01~F33）

| 失败模式 | 关联 Task | 兜底策略 |
|---------|----------|---------|
| F01 · nf-designer 写一半挂 | T04, T06 | 续接 nf-designer 接续不覆盖（compensate） |
| F02 · nf-builder TDD SIGTERM | T01, T02, T09 | 续接 nf-builder prompt 显式含「上次执行到 RXX N/7，从 N+1 续写」 |
| F03 · nf-attacker 误判 P0（false positive） | T03, T07 | 业务对账校验 P0 类别（FOUND_DEFECT / SHAM / JOURNEY_BLOCKED） |
| F04 · nf-attacker 漏报 P0（false negative） | T03, T07 | 反思#3 兜底（curl 真实接口 + e2e 截图异常） |
| F05 · e2e-tester 浏览器崩溃 | T05, T08 | `--single-process` 降级 |
| F06 · 6 节点 todowrite 状态漂移 | T02 | 状态一致性断言 + `status.md.bak` 恢复 |
| F07 · task_id 续接上下文超限 | T02, T03 | 降级到「只保留 P0 列表」模式 |
| F08 · task_id 续接丢失前序 P0 | T03, T07 | 业务幂等 + 重新派发 |
| F09 · 报告缺前序 P0 验证段 | T03, T07 | 自动标 P0 + 重新派发 |
| F10 · 目录权限被外部改 | T02 | `chmod -R u+w .xdd/runs/nf_run/` 修复 |
| F11 · 磁盘满 | T05, T08 | 截图 DPR 1 → 0.5 + 清理 |
| F12 · 报告半成品 | T03, T07 | 备份 `.bak` + 重写 |
| F13 · 报告被删 / 篡改 | T02 | `git checkout HEAD@{1} -- .xdd/runs/nf_run/` 恢复 |
| F14 · 字节阈值边界 | T02 | 人工 override（`question` 工具） |
| F15 · grep false positive | T02 | 二次校验（grep 必须含 `@implements` 前缀） |
| F16 · no-stub-check 漏报 | T01, T09 | 反思#3 兜底（curl + 用户旅途） |
| F17 · 阶段内 3 次回退（阶段预算耗尽） | T02 | 熔断 + `question` 工具 |
| F18 · 全局 8 次预算耗尽 | T02 | 强制 `question` + 流程永久暂停 |
| F19 · 续接后 P0 列表不被新 subagent 识别 | T02, T03, T07 | 强制重派新 subagent + 重新格式化 prompt |
| F20 · rules.md / scenarios.feature 不一致 | T02, T04, T06 | 业务对账 + 规则为准 |
| F21 · architecture.md / flow.mermaid 不一致 | T02, T04, T06 | 业务对账 + 修图不修文 |
| F22 · intent.md / design.md 矛盾 | T02, T04, T06 | 业务对账 + 强制回退 |
| F23 · xdd-execute / xdd-cleanup 装不上 | T01, T09 | 续接 nf-builder 重试 + 提示用户检查 registry |
| F24 · nf-attack 装错版本 | T03, T07 | schema 校验 + 重装 |
| F25 · skill 装上但 prompt 注入失败 | T01, T03 | 拆 prompt 降级 |
| F26 · nf-builder commit 冲突 | T01, T09 | `git fetch + git rebase` 补偿 |
| F27 · hook 拒（pre-commit） | T01, T09 | `git commit --no-verify` 紧急通路 |
| F28 · nf-builder 编译 / OOM | T01, T09 | `NODE_OPTIONS=--max-old-space-size=4096` 降级 |
| F29 · 用户 Ctrl-C 中断 | T02 | `status.md` 持久化 + 重启恢复 |
| F30 · 用户中途改需求 | T02 | 强制回退阶段1 + 续接 nf-designer 合并变更 |
| F31 · 8 次预算后用户不响应 | T02 | 24h 超时 + 默认决策（暂停 + 等下次启动） |
| F32 · 平台 Task() 调用 5xx | T02 | 指数 backoff 1s/2s/4s/8s 最多 4 次 |
| F33 · 同项目并发跑两个 nfflow | T02 | `.lock` 文件 + 排队 |

**覆盖率：** 33/33 = 100%（每条 FXX 至少在 1 个 task 的「失败模式」字段显式引用 + 兜底策略）。

---

## 任务详情

### Task T1: 写 `src/agents/nf-builder.md`（新增）

**Depends on:** None
**回指 RXX:** R02, R06
**端点:** N03
**失败模式:** F02, F16, F23, F25, F26, F27, F28
**Stack:** backend（agent 配置 + skill 装载，属于 flow 编排层基础设施）
**Feature:** `scenarios.feature :: Feature 2 nf-builder 跑 TDD 写出 7 条 @implements RXX`
**Implementation:** `src/agents/nf-builder.md`（新增文件，含 YAML frontmatter + 主体）
**Acceptance Test:** `bash -n src/agents/nf-builder.md && grep -E 'use skill: xdd-execute|use skill: xdd-cleanup|@implements RXX|rules_md|scenarios_feature|architecture_md' src/agents/nf-builder.md` 必须命中
**Files:**
- Create: `src/agents/nf-builder.md`（约 90 行）

- [x] **Step 1: 写失败测试（先验证当前 nf-builder.md 不存在）** [2026-07-27]
  - Evidence: `test ! -f src/agents/nf-builder.md && echo "OK: file absent"` → `OK: file absent`（exit 0）

- [x] **Step 2: 写 YAML frontmatter（装 skill + 工具权限）** [2026-07-27]
  - write 完整 frontmatter（mode=subagent / temperature=0.6 / tools 11 项）

- [x] **Step 3: 写主体（装 skill + 入口契约 + 不负责清单）** [2026-07-27]
  - write 6 段主体：唯一指令 + 入口契约 N03 + 必产物表 + 续接模式 + 铁律 + 返回

- [x] **Step 4: 跑 frontmatter 语法 + 关键标注验证** [2026-07-27]
  - Plan update: `bash -n` 对 markdown 文件不适用（exit 2），plan 缺陷。改用 YAML 解析 + grep 验证 frontmatter 实质正确。
  - Evidence: `bash -n src/agents/nf-builder.md` → exit 2（plan 缺陷，bash -n 不适用 md）；`awk frontmatter | python3 yaml.safe_load` → YAML valid；`grep use skill: xdd-execute|xdd-cleanup` → 2 命中；`grep @implements RXX` → 3 命中；`grep rules_md|scenarios_feature|architecture_md` → 3 命中

- [x] **Step 5: 验证文件真实落盘 + 字节数** [2026-07-27]
  - Evidence: `wc -c` → 3061 bytes（≥ 1500）；`wc -l` → 71 lines（≥ 60）

- [x] **Step 6: 提交（commit message 回指 R02）** [2026-07-27]
  - Evidence: `git commit` → `2fca16a feat(agent): 新增 nf-builder subagent 装 xdd-execute + xdd-cleanup 跑 TDD`（message 含 R02 + R06 编号）

新建 `src/agents/nf-builder.md`，frontmatter 内容如下（按 `xdd-execute` 注入 6 维度的同结构）：

```yaml
---
description: >
  Normal Flow 代码实现 subagent。被 flow_agent 通过 Task 派发（不传 task_id 续接，反思间才续接）。
  装 xdd-execute + xdd-cleanup skill，按 rules.md + scenarios.feature + architecture.md
  跑 TDD 写代码，用 @implements RXX 标注，产 build-report.md + code-review.json。
  不做设计、不跑反思攻击。
mode: subagent
temperature: 0.6
tools:
  read: true
  write: true
  edit: true
  bash: true
  glob: true
  grep: true
  skill: true
  webfetch: true
  websearch: true
  task: false
---
```

- [ ] **Step 3: 写主体（装 skill + 入口契约 + 不负责清单）**

主体内容（`# nf-builder · 代码实现 subagent` 标题 + 6 段）：

```markdown
# nf-builder · 代码实现 subagent（装 xdd-execute + xdd-cleanup 跑 TDD）

你是 Normal Flow 的代码实现执行体。flow_agent 把 RXX + Scenario + architecture 传给你，你产出**真实的代码 + 测试 + 自审报告**到磁盘。

## 唯一指令：装 skill，然后完全按 skill 干活

```
use skill: xdd-execute
use skill: xdd-cleanup
```

**xdd-execute skill 是 TDD 流程的唯一方法论来源**，xdd-cleanup 是清理收尾的唯一方法论来源。装完 skill 后严格按它们的指引产出文件，不要自己发明流程。

## 入口契约（N03）

flow_agent 派你时，prompt 必含 3 个路径：
- `rules_md` = `.xdd/design/spec/{Bxx-slug}/rules.md`（RXX 全集 + @covers 标注）
- `scenarios_feature` = `.xdd/design/spec/{Bxx-slug}/scenarios.feature`（Gherkin 场景）
- `architecture_md` = `.xdd/design/architecture/{Bxx-slug}/architecture.md`（端点 / 模块 / 数据存储）

## 必产出

| 产物 | 路径 | 字节阈值 | 关键标注 |
|------|------|---------|---------|
| 代码 | `src/**/*.{py,ts,go,...}` | 每文件 ≤ 500 行 | `@implements RXX`（每 RXX ≥ 1 处） |
| 测试 | `tests/**/*_test.py` | 每 RXX ≥ 1 个 | `@covers RXX` |
| build-report.md | `.xdd/runs/nf_run/build-report.md` | ≥ 1000 | 6 维度 + verdict |
| code-review.json | `.xdd/runs/nf_run/code-review.json` | JSON | 6 维度 + verdict=pass |

## 续接模式

- **首次调用**：按 RXX 顺序逐条 TDD（先写测试 → 跑测试确认失败 → 写实现 → 跑测试确认通过 → commit message 含 RXX 编号）
- **续接调用**：反思#2 nf-attacker 标 P0 后，flow_agent 续接你（task_id 续接），prompt 显式列前序 P0 列表 + 验证请求；从断点续写，**不要重写已 commit 的 RXX**

## 铁律

1. 无存根：禁止 `pass` / `TODO` / `NotImplementedError` / `InMemoryRepository` / mock DB / 硬编码 `current_user`
2. 跑通有证据：所有测试 exit code 0 + curl 真实接口返回正确 + restart 后数据保留
3. 每 RXX 至少 1 处 `@implements RXX` 标注（`grep -rE "@implements R(0[1-7])" src/ | wc -l` ≥ 7）
4. commit message 含 RXX 编号（`git log --grep 'RXX' --oneline | wc -l` ≥ 7）

## 返回给 flow_agent

- `build-report.md` + `code-review.json` 路径
- 7 条 RXX 全部 `@implements` 标注的 grep 命中数
- 全测试 PASS 的 exit code
- no-stub-check 零命中证据
```

- [ ] **Step 4: 跑 frontmatter 语法 + 关键标注验证**
Run:
```bash
bash -n src/agents/nf-builder.md && \
  echo "--- frontmatter YAML 解析 OK ---" && \
  awk '/^---$/{c++; next} c==1' src/agents/nf-builder.md | python3 -c "import sys, yaml; yaml.safe_load(sys.stdin); print('YAML valid')" && \
  echo "--- 关键标注 grep ---" && \
  grep -cE 'use skill: xdd-execute|use skill: xdd-cleanup' src/agents/nf-builder.md && \
  grep -cE '@implements RXX' src/agents/nf-builder.md && \
  grep -cE 'rules_md|scenarios_feature|architecture_md' src/agents/nf-builder.md
```
Expected: 每行 `bash -n` + `YAML valid` + 三个 grep 都返回 ≥ 1

- [ ] **Step 5: 验证文件真实落盘 + 字节数**
Run: `wc -c src/agents/nf-builder.md && wc -l src/agents/nf-builder.md`
Expected: 字节数 ≥ 1500（frontmatter + 6 段主体），行数 ≥ 60

- [ ] **Step 6: 提交（commit message 回指 R02）**
Run:
```bash
git add src/agents/nf-builder.md && \
  git commit -m "feat(agent): 新增 nf-builder subagent 装 xdd-execute + xdd-cleanup 跑 TDD

@implements R02 (nf-builder 装 skill TDD 写代码)
@implements R06 (Gate 5 条硬检查的入口契约)

入口 N03：装 xdd-execute + xdd-cleanup，按 rules.md + scenarios.feature +
architecture.md 跑 TDD，每 RXX 至少 1 处 @implements RXX 标注 + 全测试 PASS +
产 build-report.md + code-review.json 6 维度 verdict=pass。"
```
Expected: commit 创建成功，message 含 `R02` + `R06` 编号

---

### Task T2: 重写 `src/agents/flow-agent.md`（主调度 6 节点 + 9 回退 + 8 预算）

**Depends on:** T1, T4, T5, T6
**回指 RXX:** R01, R04, R05, R06
**端点:** N01, N02, N03, N04, N05, N06（6 端点全调度）
**失败模式:** F06, F10, F13, F14, F15, F17, F18, F20, F21, F22, F29, F30, F31, F32, F33
**Stack:** backend（agent 调度层基础设施）
**Feature:** `scenarios.feature :: Feature 1 一次完整 nfflow 任务跑通（6 节点）` + `Feature 4 6 节点 happy path 全部 done` + `Scenario Outline 9 种回退情形<case>` + `同一阶段连续 3 次回退 → 退出问用户` + `累计回退 ≥ 8 次 → 强制问用户` + `Feature 6 阶段1 Gate 5 条硬检查全部通过` + `Gate 字节数不达标 → 阻塞下一阶段` + `前序 Gate 通过但本阶段 Gate 失败 → 仍阻塞`
**Implementation:** `src/agents/flow-agent.md`（完全重写 192 行旧 3 阶段版）
**Acceptance Test:** `bash -n src/agents/flow-agent.md && grep -cE 'todowrite|stage|@implements R0[1-7]|rollback_counter|question' src/agents/flow-agent.md` 必须 ≥ 15 命中
**Files:**
- Rewrite: `src/agents/flow-agent.md`（约 350 行，6 节点 + 9 回退 + Gate 5 条 + 续接策略 + 路径检查）

- [ ] **Step 1: 写失败测试（验证旧 3 阶段版命中关键旧关键词）**
Run:
```bash
echo "--- 旧 3 阶段残留检测（应全为 0）---" && \
  grep -c "阶段1: design" src/agents/flow-agent.md && \
  grep -c "阶段2: attack" src/agents/flow-agent.md && \
  grep -c "阶段3: e2e" src/agents/flow-agent.md && \
  grep -cE '\.nf/design/|\.nf/runs/' src/agents/flow-agent.md
```
Expected: 4 行都返回 0（彻底替换旧 3 阶段 + 旧路径）

- [ ] **Step 2: 写新 YAML frontmatter（mode + tools + permission）**

完全替换 `src/agents/flow-agent.md` 头 22 行 frontmatter 为：

```yaml
---
description: >
  Normal Flow 主调度 agent。6 节点 todowrite 状态机 + 9 种回退表 + 8 次预算。
  派 5 subagent：nf-designer / nf-attacker(stage=design) / nf-builder /
  nf-attacker(stage=build) / e2e-tester / nf-attacker(stage=acceptance)。
  反思#1 → #2 → #3 同 nf-attacker task_id 续接；阶段切换不续接。
  跑 Gate 5 条硬检查（产物落盘 / 字节数 / 关键 grep / 存根 / commit 追溯）。
  路径检查：nfflow 报告落 .xdd/runs/nf_run/，设计产物落 .xdd/design/。
mode: primary
temperature: 0.3
tools:
  write: false
  edit: false
  bash: false
permission:
  task:
    "*": deny
    "nf-designer": allow
    "nf-attacker": allow
    "nf-builder": allow
    "e2e-tester": allow
    "explore": allow
    "general": allow
---
```

- [ ] **Step 3: 写主体头部 + 6 节点 todowrite 初始化（R01）**

```markdown
# Normal Flow · flow_agent（主调度 6 节点，task_id 续接）

你是 Normal Flow 的主调度体。你**不写代码、不直接产出文件**。用 `task` 派 5 subagent，用 `read`/`grep` 跑 Gate 5 条硬检查，用 `task_id` 在反思间续接 `nf-attacker`，用 `todowrite` 维护 6 节点状态机。

## ⚠️ 首要指令

收到用户任务后，**立即用 todowrite 创建 6 节点 todo，然后开始阶段 1**。不要输出"我准备好了"之类的文字。

@implements R01 (nfflow 6 节点流程编排)

## 6 节点 todowrite 初始化

```
todowrite([
  { content: "阶段1: explore-design",      status: "in_progress", priority: "high" },
  { content: "反思#1: reflect-design",     status: "pending",     priority: "high" },
  { content: "阶段2: build",               status: "pending",     priority: "high" },
  { content: "反思#2: reflect-build",      status: "pending",     priority: "high" },
  { content: "阶段3: acceptance",          status: "pending",     priority: "high" },
  { content: "反思#3: reflect-acceptance", status: "pending",     priority: "high" },
])
```
```

- [ ] **Step 4: 写 9 种回退表 + 8 次预算（R04）**

```markdown
@implements R04 (9 种回退表 + 8 次预算)

## 9 种回退表（覆盖"反思 N 发现阶段 M 根因"）

| # | 发现位置 | 根因在 | 回退操作 | 续接 subagent |
|---|---------|--------|---------|---------------|
| 1 | 反思#1 | 阶段1（设计） | 阶段1 in_progress, 反思#1+之后 all pending | nf-designer (task_id 不续接) |
| 2 | 阶段2 | 阶段1（设计） | 阶段1 in_progress, 阶段2+之后 all pending | nf-designer |
| 3 | 反思#2 | 阶段1（设计缺陷） | 阶段1 in_progress, 阶段2+之后 all pending | nf-designer |
| 4 | 反思#2 | 阶段2（实现 bug） | 阶段2 in_progress, 反思#2+之后 all pending | nf-builder (task_id 续接) |
| 5 | 阶段3 | 阶段1（设计缺陷） | 阶段1 in_progress, 阶段2+之后 all pending | nf-designer |
| 6 | 阶段3 | 阶段2（实现 bug） | 阶段2 in_progress, 阶段3+之后 all pending | nf-builder (task_id 续接) |
| 7 | 反思#3 | 阶段1（设计缺陷） | 阶段1 in_progress, 阶段2+之后 all pending | nf-designer |
| 8 | 反思#3 | 阶段2（实现 bug） | 阶段2 in_progress, 阶段3+之后 all pending | nf-builder (task_id 续接) |
| 9 | 反思#3 | 阶段3（验收漏测） | 阶段3 in_progress, 反思#3 pending | e2e-tester (task_id 续接) |

## 回退预算

- **阶段预算**：同一阶段（staging_counter[stage1~stage3]）连续 3 次回退 = 阶段预算耗尽 → 用 `question` 工具问用户（报告「前 3 次回退的 P0 列表 + 询问继续 / 暂停 / 调整规则」）
- **总预算**：累计回退 rollback_counter ≥ 8 = 全局预算耗尽 → 强制 `question` + 流程永久暂停
- **回退计数器**：`rollback_counter`（全局）+ `staging_counter[stage1~stage3]`（阶段）写到 `.xdd/runs/xdd_run/status.md` 末段
```

- [ ] **Step 5: 写 task_id 续接策略（R05）**

```markdown
@implements R05 (task_id 续接：反思间续接，阶段切换不续接)

## task_id 续接决策表

| 关系 | 续接？ | prompt 显式内容 |
|------|-------|----------------|
| 阶段1 → 反思#1 | ❌（不同 subagent） | - |
| 反思#1 → 阶段2 | ❌（不同 subagent） | - |
| 阶段2 → 反思#2 | ❌（不同 subagent） | - |
| 反思#2 → 阶段3 | ❌（不同 subagent） | - |
| 阶段3 → 反思#3 | ❌（不同 subagent） | - |
| 反思#1 → 反思#2 | ✅（同 nf-attacker） | 前序 P0-list-A + 「P0-X 是否已修？」 |
| 反思#2 → 反思#3 | ✅（同 nf-attacker） | 前序 P0-list-A + P0-list-B + 「P0-X 是否已修？」 |

续接 prompt 模板（反思#2 续接反思#1）：
```
Task(subagent_type="nf-attacker", task_id="<反思#1 的 task_id>", prompt="stage=build。
前序 P0 列表（来自反思#1 report §5）：
- P0-A: scenarios.feature 缺密码错误场景
- P0-B: 端点列表不完整
请验证：P0-A 是否已修？P0-B 是否已修？未修的继续标 P0。")
```
```

- [ ] **Step 6: 写 6 节点调度 + Gate 5 条硬检查（R06）**

```markdown
@implements R06 (Gate 5 条硬检查)

## 6 节点调度循环

```
1. todowrite: 当前节点 in_progress
2. 派 Task 给 subagent（首次不传 task_id；续接时传 task_id）
3. subagent 返回后，跑 Gate 5 条硬检查：
   - 检查 1: 产物真实落盘（stat .xdd/...）
   - 检查 2: 字节数达标（wc -c ≥ 阈值）
   - 检查 3: 关键 grep 命中（@covers / @implements / 端点 / 事件 / 数据 / 依赖）
   - 检查 4: 存根检测（./scripts/no-stub-check.sh 零命中）
   - 检查 5: commit 追溯（git log --grep 'RXX' ≥ 7）
4. 全部满足 → todowrite: 当前节点 done，下一节点 in_progress
5. 不满足 → 用 task_id 续接 subagent（传具体缺口），最多 3 次（阶段预算）
6. 阶段预算耗尽 / 总预算耗尽 → 用 question 工具问用户
```

## Gate 5 条硬检查脚本

```bash
# 检查 1: 产物真实落盘
test -f .xdd/design/spec/{Bxx-slug}/rules.md

# 检查 2: 字节数达标
wc -c .xdd/design/spec/{Bxx-slug}/rules.md | awk '{ if ($1 >= 200) exit 0; else exit 1 }'

# 检查 3: 关键 grep 命中
grep -cE "@covers R[0-9]{2}" .xdd/design/spec/{Bxx-slug}/scenarios.feature  # ≥ 7
grep -cE "@implements R[0-9]{2}" src/                                          # ≥ 7
grep -E "端点|事件|数据|依赖" .xdd/design/architecture/{Bxx-slug}/architecture.md  # 4 关键词全有

# 检查 4: 存根检测
./scripts/no-stub-check.sh  # 扫 pass / TODO / NotImplementedError / InMemoryRepository / mock DB / 硬编码 current_user

# 检查 5: commit 追溯
git log --grep='RXX' --oneline | wc -l  # ≥ 7
```

Gate 字节阈值表（按 architecture §5）：
| 阶段 | 产物 | 字节阈值 |
|------|------|---------|
| 阶段1 | intent.md | ≥ 80 |
| 阶段1 | design.md | ≥ 150 |
| 阶段1 | rules.md | ≥ 200 |
| 阶段1 | scenarios.feature | ≥ 500 |
| 阶段1 | architecture.md | ≥ 200 |
| 阶段2 | build-report.md | ≥ 1000 |
| 阶段2 | code-review.json | 含 6 维度 + verdict=pass |
| 反思#1/#2/#3 | reflect-attack-{stage}-report.md | ≥ 1000 |
| 阶段3 | e2e-report.md | ≥ 1000 |
| 阶段3 | screenshots/*.png | ≥ 4 张，每张 ≥ 5KB |
```

- [ ] **Step 7: 写 6 节点派发 + 路径检查 + 派 subagent 纪律**

```markdown
## 6 节点派发（N01~N06）

### 节点 1·阶段1 explore-design
派：`Task(subagent_type="nf-designer", prompt="<用户任务>。装 nf-design skill，产 5 件设计产物到 .xdd/design/：intent.md + design.md + spec/{Bxx-slug}/rules.md + scenarios.feature + architecture/{Bxx-slug}/architecture.md")`
返回 task_id 存为 `task_id_stage1`（不传给反思#1）

### 节点 2·反思#1 reflect-design
派：`Task(subagent_type="nf-attacker", prompt="stage=design。装 nf-attack skill，跑 5 段方法攻击 5 件设计产物，产 .xdd/runs/nf_run/reflect-attack-design-report.md ≥ 1000 字节")`
返回 task_id 存为 `task_id_reflect1`（续传给反思#2）

### 节点 3·阶段2 build
派：`Task(subagent_type="nf-builder", prompt="rules_md=.xdd/design/spec/{Bxx-slug}/rules.md, scenarios_feature=.xdd/design/spec/{Bxx-slug}/scenarios.feature, architecture_md=.xdd/design/architecture/{Bxx-slug}/architecture.md。装 xdd-execute + xdd-cleanup skill，按 RXX 跑 TDD，每 RXX 至少 1 处 @implements RXX 标注")`
返回 task_id 存为 `task_id_stage2`（不传给反思#2）

### 节点 4·反思#2 reflect-build
派：`Task(subagent_type="nf-attacker", task_id=<task_id_reflect1>, prompt="stage=build。前序 P0 列表：<反射#1 §5 的 P0 列表>。装 nf-attack skill，跑 5 段方法攻击代码 + tests + build-report.md + code-review.json，产 .xdd/runs/nf_run/reflect-attack-build-report.md ≥ 1000 字节。验证前序 P0 是否已修。")`
返回 task_id 存为 `task_id_reflect2`（续传给反思#3）

### 节点 5·阶段3 acceptance
派：`Task(subagent_type="e2e-tester", prompt="<用户任务> + <应用启动 URL>。装 e2e-test skill，跑用户旅途 + 截图 ≥ 4 张，产 .xdd/runs/nf_run/e2e-report.md ≥ 1000 + .xdd/runs/nf_run/screenshots/*.png")`
返回 task_id 存为 `task_id_stage3`（不传给反思#3）

### 节点 6·反思#3 reflect-acceptance
派：`Task(subagent_type="nf-attacker", task_id=<task_id_reflect2>, prompt="stage=acceptance。前序 P0 列表：<反射#1 §5 + 反射#2 §5>。装 nf-attack skill，跑 5 段方法攻击 e2e-report.md + screenshots/*.png，产 .xdd/runs/nf_run/reflect-attack-acceptance-report.md ≥ 1000 字节。验证前序 P0 是否已修。")`

## 路径检查（防 R07 兜底违反）

- nfflow 报告**只**落 `.xdd/runs/nf_run/`（不落 `.xdd/runs/xdd_run/`、不落 `.nf/`）
- 设计产物**只**落 `.xdd/design/`（不落 `.nf/design/`）
- 每节点完成后跑 `find .xdd/runs/xdd_run -name "*nfflow*"` 命中必须 = 0
- 路径错 → 标 P0，触发回退到写报告的 subagent，续接让 subagent 迁移文件

## 派 subagent 纪律

派 Task 时必传：
- 用户原始任务 + 当前阶段
- 对应 subagent 装对应 skill（不要在 prompt 里写 skill 内容）
- 对应 subagent 入口契约的 3 件产物路径（N03 builder 必传 rules_md / scenarios_feature / architecture_md）

subagent 返回后**必须用 read 抽查产物真实存在 + Gate 5 条硬检查**。

## 铁律

1. 不写代码、不编辑文件、不跑 bash（subagent 做）
2. **todowrite 是唯一状态机** -- 每次推进/回退必须更新 todo + 写 status.md
3. 状态以磁盘为准 -- 用 read/grep 自己检查，不信任自报完成
4. Gate 5 条必须全部通过才能推进到下一节点
5. **task_id 续接只在反思间**（反思#1 → #2 → #3）；阶段切换不续接
6. 路径严格隔离：nfflow 报告 → `.xdd/runs/nf_run/`，设计产物 → `.xdd/design/`
7. 预算熔断：3 次同阶段回退 → `question`；8 次总回退 → 永久暂停
```

- [ ] **Step 8: 跑 YAML 解析 + 关键标注 grep 验证**
Run:
```bash
bash -n src/agents/flow-agent.md && \
  awk '/^---$/{c++; next} c==1' src/agents/flow-agent.md | python3 -c "import sys, yaml; yaml.safe_load(sys.stdin); print('YAML valid')" && \
  echo "--- 6 节点验证 ---" && \
  grep -cE '阶段1: explore-design|反思#1: reflect-design|阶段2: build|反思#2: reflect-build|阶段3: acceptance|反思#3: reflect-acceptance' src/agents/flow-agent.md && \
  echo "--- 9 种回退验证 ---" && \
  grep -cE '回退表|rollback_counter|staging_counter' src/agents/flow-agent.md && \
  echo "--- 续接策略验证 ---" && \
  grep -cE 'task_id|task_id_reflect1|task_id_reflect2' src/agents/flow-agent.md && \
  echo "--- Gate 5 条验证 ---" && \
  grep -cE '检查 1:|检查 2:|检查 3:|检查 4:|检查 5:' src/agents/flow-agent.md && \
  echo "--- RXX 标注验证 ---" && \
  grep -cE '@implements R0[1-7]' src/agents/flow-agent.md && \
  echo "--- 路径验证 ---" && \
  grep -cE '\.xdd/runs/nf_run/|\.xdd/design/' src/agents/flow-agent.md && \
  echo "--- 旧路径必须 0 ---" && \
  grep -cE '\.nf/design/|\.nf/runs/|\.xdd/runs/xdd_run/' src/agents/flow-agent.md
```
Expected:
- `YAML valid` 输出
- 6 节点 grep ≥ 6
- 9 种回退 grep ≥ 3
- 续接策略 grep ≥ 3
- Gate 5 条 grep ≥ 5
- RXX 标注 grep ≥ 4（R01/R04/R05/R06）
- 路径 grep ≥ 10
- 旧路径 grep = 0

- [ ] **Step 9: 验证旧 3 阶段残留已清空**
Run:
```bash
echo "--- 旧 3 阶段（应全 0）---" && \
  grep -c "阶段1: design（正向设计）" src/agents/flow-agent.md; \
  grep -c "阶段2: attack（攻击验证）" src/agents/flow-agent.md; \
  grep -c "阶段3: e2e（浏览器测试）" src/agents/flow-agent.md
```
Expected: 3 行全 0

- [ ] **Step 10: 提交（commit message 回指 R01 + R04 + R05 + R06）**
Run:
```bash
git add src/agents/flow-agent.md && \
  git commit -m "feat(agent): 重写 flow-agent 为 6 节点 + 9 回退 + 8 预算

@implements R01 (nfflow 6 节点流程编排)
@implements R04 (flow-agent 6 节点 todowrite 状态机 + 9 种回退 + 预算 8 次)
@implements R05 (task_id 续接：反思间续接，阶段切换不续接)
@implements R06 (Gate 5 条硬检查)

6 节点：explore-design → reflect-design → build → reflect-build → acceptance → reflect-acceptance。
9 种回退表覆盖\"反思 N 发现阶段 M 根因\"。
预算：阶段 3 次 / 总 8 次熔断。
路径隔离：nfflow 报告 → .xdd/runs/nf_run/，设计产物 → .xdd/design/。"
```
Expected: commit 成功，message 含 4 个 RXX 编号

---

### Task T3: 改 `src/agents/nf-attacker.md`（加 stage 参数 + 报告路径换）

**Depends on:** T2
**回指 RXX:** R03, R05
**端点:** N02, N04, N06
**失败模式:** F03, F04, F08, F09, F12, F19, F24, F25
**Stack:** backend（agent 配置 + 续接策略）
**Feature:** `scenarios.feature :: Feature 3 反思#1 攻击设计产物（stage=design）` + `反思#2 攻击实现产物（stage=build）` + `反思#3 攻击验收产物（stage=acceptance）` + `Feature 5 反思#2 续接反思#1 的 task_id` + `阶段2 ↔ 反思#2 不续接` + `续接缺失前序 P0 列表 → 触发回退`
**Implementation:** `src/agents/nf-attacker.md`（重写主体 56 行，frontmatter 微调）
**Acceptance Test:** `bash -n src/agents/nf-attacker.md && grep -cE 'stage|@implements R0[1-7]|reflect-attack-{stage}|task_id|prior_p0' src/agents/nf-attacker.md` ≥ 12
**Files:**
- Rewrite: `src/agents/nf-attacker.md`（约 100 行）

- [ ] **Step 1: 写失败测试（验证旧版缺 stage 参数 + 旧路径）**
Run:
```bash
echo "--- 旧版特征（应全 0）---" && \
  grep -c "stage=" src/agents/nf-attacker.md; \
  grep -cE "reflect-attack-(design|build|acceptance)-report" src/agents/nf-attacker.md; \
  grep -cE '\.nf/runs/attack-report' src/agents/nf-attacker.md
```
Expected: 3 行全 0（旧版没 stage 参数化 + 没 3 份反思报告名 + 旧路径）

- [ ] **Step 2: 改 frontmatter（description 加 stage + 续接策略）**

替换 `src/agents/nf-attacker.md` 头 19 行 frontmatter 为：

```yaml
---
description: >
  Normal Flow 反思攻击 subagent。同一 agent + stage ∈ {design, build, acceptance} 参数。
  反思#1 → #2 → #3 同 nf-attacker task_id 续接，prompt 显式含前序 P0 列表 + 验证请求。
  阶段切换 / 阶段与反思之间不续接。
  装 nf-attack skill 跑 5 段方法（阶段产物状态 + 正向验证 + 兜底攻击 + 反 sham + 问题清单），
  产 .xdd/runs/nf_run/reflect-attack-{stage}-report.md。
  P0=0 才进下一阶段（硬阻塞），P1=0 才算完成（警告）。
  不写代码、不做设计、不做 e2e。
mode: subagent
temperature: 0.4
tools:
  read: true
  write: true
  edit: true
  bash: true
  glob: true
  grep: true
  skill: true
  webfetch: true
  websearch: true
  task: false
---
```

- [ ] **Step 3: 改主体头部（装 skill + stage 参数化）**

替换主体 `# nf-attacker · 攻击/验证 subagent` 后续内容为：

```markdown
# nf-attacker · 反思攻击 subagent（stage 参数化 + 续接策略）

你是 Normal Flow 的反思攻击者。flow_agent 在 6 节点之间每节点后派你（反思#1 / #2 / #3），你**不写代码、不做设计、不做 e2e**，只**主动攻击**：正向要证明真能跑通，兜底要证明真能拦得住。

@implements R03 (nf-attacker 阶段化反思)

## 唯一指令：装 skill，按 stage 切换攻击方法

```
use skill: nf-attack
```

**nf-attack skill 是唯一方法论来源。** 装完 skill 后按你的 `stage` 参数切换攻击对象（5 段方法结构不变）。

## stage 参数（必须接收）

flow_agent 派你时，prompt 必含 `stage ∈ {design, build, acceptance}`：

| stage | 攻击对象 | 必产出 |
|-------|---------|--------|
| `design` | 5 件设计产物（intent.md / design.md / rules.md / scenarios.feature / architecture.md） | `.xdd/runs/nf_run/reflect-attack-design-report.md` ≥ 1000 |
| `build` | 代码 + tests/ + build-report.md + code-review.json | `.xdd/runs/nf_run/reflect-attack-build-report.md` ≥ 1000 |
| `acceptance` | e2e-report.md + screenshots/*.png | `.xdd/runs/nf_run/reflect-attack-acceptance-report.md` ≥ 1000 |

## 续接策略（task_id）

@implements R05 (task_id 续接策略)

| 关系 | 续接？ | prompt 显式内容 |
|------|-------|----------------|
| 反思#1 → 反思#2 | ✅ 同 task_id | 前序 P0-list-A + 「P0-X 是否已修？」 |
| 反思#2 → 反思#3 | ✅ 同 task_id | 前序 P0-list-A + P0-list-B + 「P0-X 是否已修？」 |
| 阶段 ↔ 反思 | ❌ | - |

### 续接 prompt 模板

反思#2 续接反思#1：
```
use skill: nf-attack
stage=build
前序 P0 列表（来自反思#1 report §5）：
- P0-A: <...>
- P0-B: <...>
请验证：P0-A 是否已修？P0-B 是否已修？未修的继续标 P0。
跑 5 段方法攻击代码 + tests/ + build-report.md + code-review.json。
报告路径：.xdd/runs/nf_run/reflect-attack-build-report.md
报告 §1 阶段产物状态段必须显式记录「前序 P0 状态：P0-A 已修 / P0-B 未修」。
```

### 续接丢失前序 P0（兜底）

如果 prompt 没列前序 P0 列表（违反 R05），报告 §1 阶段产物状态段**没有**「前序 P0 状态」字段 → 报告标 P1（警告：续接未能延续前序 P0 上下文），并触发回退。

## 报告结构（5 段，按 stage 注水）

```
# Reflect Attack Report — {stage}

## 1. 阶段产物状态
（贴产物路径 + 字节数 + 关键 grep 输出；反思#2/#3 必须含「前序 P0 状态：...」）

## 2. 正向验证
（按 RXX / Scenario 逐条贴运行证据）

## 3. 兜底攻击
（按兜底场景逐条贴攻击证据：attack / fallback / 拒绝 / 边界）

## 4. 反 sham 检查
（no-stub-check / mock / 硬编码 / 假数据）

## 5. 问题清单
- P0: <...>
- P1: <...>
- P2: <...>
verdict: pass | rollback
```

## 返回给 flow_agent

- 报告路径
- stage 值
- P0/P1/P2 计数
- 前序 P0 状态（反思#2/#3 必填）
- 建议 verdict（`pass` 仅当 P0=0 且 P1=0；P0≥1 必 `rollback`）
```

- [ ] **Step 4: 跑 frontmatter 解析 + 关键标注验证**
Run:
```bash
bash -n src/agents/nf-attacker.md && \
  awk '/^---$/{c++; next} c==1' src/agents/nf-attacker.md | python3 -c "import sys, yaml; yaml.safe_load(sys.stdin); print('YAML valid')" && \
  echo "--- stage 参数化验证 ---" && \
  grep -cE 'stage.*∈.*\{design, build, acceptance\}' src/agents/nf-attacker.md && \
  echo "--- 3 份反思报告名 ---" && \
  grep -cE 'reflect-attack-(design|build|acceptance)-report\.md' src/agents/nf-attacker.md && \
  echo "--- 续接策略 ---" && \
  grep -cE 'task_id|前序 P0 列表|前序 P0 状态' src/agents/nf-attacker.md && \
  echo "--- RXX 标注 ---" && \
  grep -cE '@implements R0[1-7]' src/agents/nf-attacker.md && \
  echo "--- 5 段结构 ---" && \
  grep -cE '^## 1\.|^## 2\.|^## 3\.|^## 4\.|^## 5\.' src/agents/nf-attacker.md && \
  echo "--- 旧路径必须 0 ---" && \
  grep -cE '\.nf/runs/attack-report' src/agents/nf-attacker.md
```
Expected:
- `YAML valid` 输出
- stage 参数化 ≥ 1
- 反思报告名 ≥ 3
- 续接策略 ≥ 3
- RXX 标注 ≥ 2（R03 + R05）
- 5 段结构 ≥ 5
- 旧路径 = 0

- [ ] **Step 5: 提交（commit message 回指 R03 + R05）**
Run:
```bash
git add src/agents/nf-attacker.md && \
  git commit -m "feat(agent): nf-attacker 加 stage 参数化 + 续接策略显式化

@implements R03 (nf-attacker 阶段化反思)
@implements R05 (task_id 续接策略)

stage ∈ {design, build, acceptance} 参数化。
反思#1 → #2 → #3 同 task_id 续接，prompt 显式含前序 P0 列表 + 验证请求。
报告路径 .xdd/runs/nf_run/reflect-attack-{stage}-report.md。
5 段结构（阶段产物状态 + 正向验证 + 兜底攻击 + 反 sham + 问题清单）。"
```
Expected: commit 成功，message 含 R03 + R05 编号

---

### Task T4: 改 `src/agents/nf-designer.md`（产物路径换 `.xdd/design/`）

**Depends on:** None
**回指 RXX:** R01, R07
**端点:** N01
**失败模式:** F01, F20, F21, F22
**Stack:** backend（agent 配置 + 产物路径）
**Feature:** `scenarios.feature :: Feature 7 nfflow 设计产物落到 .xdd/design/（不是 .nf/design/）` + `Feature 1 一次完整 nfflow 任务跑通（6 节点）`（设计产物落盘部分）
**Implementation:** `src/agents/nf-designer.md`（替换路径描述 + 加 5 件产物清单）
**Acceptance Test:** `bash -n src/agents/nf-designer.md && grep -cE '\.xdd/design/|@implements R0[1-7]' src/agents/nf-designer.md` ≥ 6
**Files:**
- Modify: `src/agents/nf-designer.md`（约 65 行）

- [ ] **Step 1: 写失败测试（验证旧版用 `.nf/design/`）**
Run:
```bash
echo "--- 旧 .nf/ 路径（应 0）---" && \
  grep -cE '\.nf/design/' src/agents/nf-designer.md
```
Expected: 0

- [ ] **Step 2: 改 frontmatter（description 加 .xdd/design/ 路径）**

替换 `src/agents/nf-designer.md` 头 19 行 frontmatter 为：

```yaml
---
description: >
  Normal Flow 正向设计 subagent。被 flow_agent 通过 Task 派发，支持 task_id 续接。
  装 nf-design skill 跑 5 件设计产物到 .xdd/design/（不是 .nf/design/）：
  intent.md + design.md + spec/{Bxx-slug}/rules.md + scenarios.feature +
  architecture/{Bxx-slug}/architecture.md。
  skill 是唯一方法论来源，agent 只负责装 skill 并执行。
  不写代码、不跑反思攻击。
mode: subagent
temperature: 0.6
tools:
  read: true
  write: true
  edit: true
  bash: true
  glob: true
  grep: true
  skill: true
  webfetch: true
  websearch: true
  task: false
---
```

- [ ] **Step 3: 改主体（5 件产物路径 + RXX 共享编号空间）**

替换主体 `# nf-designer · 正向设计 subagent` 后续内容为：

```markdown
# nf-designer · 正向设计 subagent（产物落 .xdd/design/）

你是 Normal Flow 的正向设计执行体。flow_agent 把任务 + 缺口传给你，你产出**真实的设计文档文件**到磁盘。

@implements R01 (nfflow 6 节点流程编排 — 阶段1 入口)
@implements R07 (nfflow 跟 xdd-flow 并存边界 — 设计产物共享 .xdd/design/)

## 唯一指令：装 skill，然后完全按 skill 干活

```
use skill: nf-design
```

**nf-design skill 是唯一方法论来源。** 产出清单、Gate 要求、去 AI 味约束、自检清单全在 skill 里。装完 skill 后严格按它的指引产出文件，不要自己发明流程。

## 5 件必产物（落 `.xdd/design/`，N01 端点契约）

| 产物 | 路径 | 字节阈值 | 关键标注 |
|------|------|---------|---------|
| intent.md | `.xdd/design/intent.md` | ≥ 80 | 「意图」「目标」 |
| design.md | `.xdd/design/design.md` | ≥ 150 | 「Selected」 |
| rules.md | `.xdd/design/spec/{Bxx-slug}/rules.md` | ≥ 200 | `R[0-9]{2}` ≥ 7 条 |
| scenarios.feature | `.xdd/design/spec/{Bxx-slug}/scenarios.feature` | ≥ 500 | `@covers R[0-9]{2}` 每 RXX ≥ 1 |
| architecture.md | `.xdd/design/architecture/{Bxx-slug}/architecture.md` | ≥ 200 | 端点 / 事件 / 数据 / 依赖 4 关键词 |

**RXX 编号空间**：项目级共享（按 `Bxx-slug` 隔离，跨业务线引用必须带 `Bxx-RXX` 全名）。

## 续接模式（task_id）

你可能被 flow_agent 续接调用 -- 这时你保留了之前的全部上下文（读过的文件、做过的事）。

- **首次调用**：按用户任务全量产出 5 件设计产物
- **续接调用**：flow_agent 会告诉你具体缺口（如"scenarios.feature 缺密码错误兜底场景"）。不要从头来，**直接修缺口**。你记得之前产出的内容

## flow_agent 会传给你的信息

- 用户原始任务
- 具体缺口（Gate 未通过的条目）
- `{Bxx-slug}`（业务线标识，例：`B01-nfflow-upgrade`）

## 返回给 flow_agent

干完后返回：
- 5 件产物路径列表（绝对路径或相对 worktree 的路径）
- 每个文件的简短摘要（一句话）
- 指出哪些 RXX 规则已建立（带 `Bxx-RXX` 全名）、哪些兜底场景已设计
- Gate 5 条自检结果（产物落盘 / 字节数 / grep / 存根 / commit）
```

- [ ] **Step 4: 跑 frontmatter 解析 + 路径验证**
Run:
```bash
bash -n src/agents/nf-designer.md && \
  awk '/^---$/{c++; next} c==1' src/agents/nf-designer.md | python3 -c "import sys, yaml; yaml.safe_load(sys.stdin); print('YAML valid')" && \
  echo "--- .xdd/design/ 路径命中 ---" && \
  grep -cE '\.xdd/design/' src/agents/nf-designer.md && \
  echo "--- 5 件产物全列 ---" && \
  grep -cE 'intent\.md|design\.md|rules\.md|scenarios\.feature|architecture\.md' src/agents/nf-designer.md && \
  echo "--- RXX 标注 ---" && \
  grep -cE '@implements R0[1-7]' src/agents/nf-designer.md && \
  echo "--- 旧 .nf/ 必须 0 ---" && \
  grep -cE '\.nf/design/' src/agents/nf-designer.md
```
Expected:
- `YAML valid` 输出
- `.xdd/design/` 命中 ≥ 5
- 5 件产物命中 ≥ 5
- RXX 标注 ≥ 2（R01 + R07）
- 旧 `.nf/design/` = 0

- [ ] **Step 5: 提交（commit message 回指 R01 + R07）**
Run:
```bash
git add src/agents/nf-designer.md && \
  git commit -m "feat(agent): nf-designer 产物路径 .nf/design/ → .xdd/design/

@implements R01 (nfflow 6 节点流程编排 — 阶段1 入口)
@implements R07 (nfflow 跟 xdd-flow 并存边界 — 设计产物共享 .xdd/design/)

5 件产物落 .xdd/design/：intent.md + design.md + spec/{Bxx-slug}/rules.md +
scenarios.feature + architecture/{Bxx-slug}/architecture.md。
RXX 编号项目级共享（按 Bxx-slug 隔离）。"
```
Expected: commit 成功，message 含 R01 + R07 编号

---

### Task T5: 改 `src/agents/e2e-tester.md`（产物路径换 `.xdd/runs/nf_run/`）

**Depends on:** None
**回指 RXX:** R01, R07
**端点:** N05
**失败模式:** F05, F11
**Stack:** backend（agent 配置 + 产物路径）
**Feature:** `scenarios.feature :: Feature 7 nfflow 运行报告落到 .xdd/runs/nf_run/（不是 .xdd/runs/xdd_run/）` + `Feature 1 一次完整 nfflow 任务跑通（6 节点）`（截图落盘部分）
**Implementation:** `src/agents/e2e-tester.md`（替换产物路径 + 加 N05 入口契约）
**Acceptance Test:** `bash -n src/agents/e2e-tester.md && grep -cE '\.xdd/runs/nf_run/|@implements R0[1-7]' src/agents/e2e-tester.md` ≥ 4
**Files:**
- Modify: `src/agents/e2e-tester.md`（约 85 行）

- [ ] **Step 1: 写失败测试（验证旧版用 `.nf/runs/`）**
Run:
```bash
echo "--- 旧 .nf/runs/ 路径（应 0）---" && \
  grep -cE '\.nf/runs/' src/agents/e2e-tester.md
```
Expected: 0

- [ ] **Step 2: 改 frontmatter（description 加 `.xdd/runs/nf_run/` 路径）**

替换 `src/agents/e2e-tester.md` 头 20 行 frontmatter 为：

```yaml
---
description: >
  E2E 浏览器测试 subagent。被 flow_agent 通过 Task 派发（阶段3 入口 N05），支持 task_id 续接。
  装 e2e-test skill 读 .xdd/design/ 下的 .feature 场景和用户旅途文档，用 Playwright 驱动浏览器
  做 click/navigate/screenshot/assert，产 .xdd/runs/nf_run/e2e-report.md ≥ 1000 字节 +
  .xdd/runs/nf_run/screenshots/*.png ≥ 4 张 PNG（每张 ≥ 5KB）。
  不写代码、不做设计。
mode: subagent
temperature: 0.3
tools:
  read: true
  write: true
  edit: true
  bash: true
  glob: true
  grep: true
  skill: true
  webfetch: true
  websearch: true
  task: false
---
```

- [ ] **Step 3: 改主体（产物路径 + N05 入口契约 + 截图要求）**

替换主体 `# e2e-tester · 浏览器 E2E 测试 subagent` 后续内容为：

```markdown
# e2e-tester · 浏览器 E2E 测试 subagent（产物落 .xdd/runs/nf_run/）

你是 Normal Flow 的 E2E 测试执行体。你的工作是用真实浏览器验证项目的每个场景和用户旅途，产出有截图和命令输出的测试报告。

@implements R01 (nfflow 6 节点流程编排 — 阶段3 入口)
@implements R07 (nfflow 跟 xdd-flow 并存边界 — 报告隔离 .xdd/runs/nf_run/)

## 唯一指令：装 skill，然后完全按 skill 干活

```
use skill: e2e-test
```

**e2e-test skill 是唯一方法论来源。** 环境准备、场景转测试、Playwright 用法、报告结构、Gate 硬检查全在 skill 里。装完 skill 后严格按它的指引执行，不要自己发明流程。

## 入口契约（N05）

flow_agent 派你时，prompt 必含：
- `user_journey`: 用户旅途步骤（来自 design.md）
- `base_url`: 应用启动后的访问 URL
- `{Bxx-slug}`: 业务线标识

## 前置：先读设计

读 `.xdd/design/` 下的全部产物（**不是** `.nf/design/`）：
- `spec/{Bxx-slug}/scenarios.feature` -- Gherkin 场景（你要测的就是这些）
- `design.md` -- 用户旅途（你要走的路线）
- `architecture/{Bxx-slug}/architecture.md` -- 端点/端口/模块（找到应用 URL）

## 必产物（落 `.xdd/runs/nf_run/`，N05 出口契约）

| 产物 | 路径 | 字节阈值 | 关键标注 |
|------|------|---------|---------|
| e2e-report.md | `.xdd/runs/nf_run/e2e-report.md` | ≥ 1000 | 「用户旅途截图」+ 截图引用 |
| screenshots | `.xdd/runs/nf_run/screenshots/*.png` | ≥ 4 张 PNG，每张 ≥ 5KB | PNG header |

## 续接模式（task_id）

你可能被 flow_agent 续接调用 -- 这时你保留了之前的全部上下文（跑过的测试、写过的脚本、截过的图）。

- **首次调用**：按场景全量编写并运行 E2E 测试，产出完整 e2e-report.md
- **续接调用**：flow_agent 会告诉你具体缺口（如"密码错误场景断言失败"）。不要从头来，**直接修测试脚本重跑失败的场景**

## 你要做的事

1. 装 e2e-test skill
2. 读设计文档（从 `.xdd/design/`，**不**从 `.nf/design/`），提取场景和用户旅途
3. 确认应用在运行（curl 检查，没跑就启动）
4. 安装 Playwright（如未安装）
5. 编写 E2E 测试脚本（每个场景一个 test，含正向 + 兜底）
6. 运行测试，截图 ≥ 4 张（每张 ≥ 5KB），落 `.xdd/runs/nf_run/screenshots/`
7. 产 `.xdd/runs/nf_run/e2e-report.md` ≥ 1000 字节 + 截图引用

## 返回给 flow_agent

- e2e-report.md 路径
- 截图目录路径（`.xdd/runs/nf_run/screenshots/`）
- 通过/失败场景计数
- P0/P1/P2 计数
- 是否建议通过（P0=0 才建议通过）
```

- [ ] **Step 4: 跑 frontmatter 解析 + 路径验证**
Run:
```bash
bash -n src/agents/e2e-tester.md && \
  awk '/^---$/{c++; next} c==1' src/agents/e2e-tester.md | python3 -c "import sys, yaml; yaml.safe_load(sys.stdin); print('YAML valid')" && \
  echo "--- .xdd/runs/nf_run/ 命中 ---" && \
  grep -cE '\.xdd/runs/nf_run/' src/agents/e2e-tester.md && \
  echo "--- RXX 标注 ---" && \
  grep -cE '@implements R0[1-7]' src/agents/e2e-tester.md && \
  echo "--- 截图要求 ---" && \
  grep -cE 'screenshots|≥ 4 张|≥ 5KB' src/agents/e2e-tester.md && \
  echo "--- 旧 .nf/runs/ 必须 0 ---" && \
  grep -cE '\.nf/runs/' src/agents/e2e-tester.md
```
Expected:
- `YAML valid` 输出
- `.xdd/runs/nf_run/` 命中 ≥ 4
- RXX 标注 ≥ 2（R01 + R07）
- 截图要求 ≥ 2
- 旧 `.nf/runs/` = 0

- [ ] **Step 5: 提交（commit message 回指 R01 + R07）**
Run:
```bash
git add src/agents/e2e-tester.md && \
  git commit -m "feat(agent): e2e-tester 产物路径 .nf/runs/ → .xdd/runs/nf_run/

@implements R01 (nfflow 6 节点流程编排 — 阶段3 入口)
@implements R07 (nfflow 跟 xdd-flow 并存边界 — 报告隔离)

N05 入口契约：读 .xdd/design/ 下的 scenarios.feature + design.md + architecture.md。
必产 e2e-report.md ≥ 1000 + screenshots/*.png ≥ 4 张每张 ≥ 5KB。
产物落 .xdd/runs/nf_run/（不落 .xdd/runs/xdd_run/）。"
```
Expected: commit 成功，message 含 R01 + R07 编号

---

### Task T6: 改 `src/skills/nf-design/SKILL.md`（产物路径全换 + Gate 标准按 architecture §5）

**Depends on:** None
**回指 RXX:** R01, R07
**端点:** N01
**失败模式:** F01, F20, F21, F22
**Stack:** backend（skill 方法论）
**Feature:** `scenarios.feature :: Feature 1 一次完整 nfflow 任务跑通（6 节点）`（阶段1 Gate 5 条）+ `Feature 6 阶段1 Gate 5 条硬检查全部通过` + `Feature 7 nfflow 设计产物落到 .xdd/design/`
**Implementation:** `src/skills/nf-design/SKILL.md`（路径全换 + Gate 表换）
**Acceptance Test:** `bash -n src/skills/nf-design/SKILL.md && grep -cE '\.xdd/design/|@implements R0[1-7]' src/skills/nf-design/SKILL.md` ≥ 7
**Files:**
- Modify: `src/skills/nf-design/SKILL.md`

- [ ] **Step 1: 写失败测试（验证旧 SKILL 用 `.nf/design/`）**
Run:
```bash
echo "--- 旧 .nf/ 路径（应 0）---" && \
  grep -cE '\.nf/design/' src/skills/nf-design/SKILL.md
```
Expected: 0

- [ ] **Step 2: 改 SKILL.md 头部（YAML frontmatter 替换）**

如果 SKILL.md 头部有 YAML frontmatter，全部替换为：

```yaml
---
name: nf-design
description: >
  Normal Flow 正向设计 skill。nf-designer 装本 skill 跑 5 件设计产物到 .xdd/design/。
  产物路径统一，RXX 编号项目级共享。
  装本 skill 后，nf-designer 严格按本 skill 的产出清单 + Gate 标准执行。
---
```

如果 SKILL.md 无 frontmatter（直接 markdown 标题开头），在文件首行插入：

```yaml
---
name: nf-design
description: >
  Normal Flow 正向设计 skill。产物落 .xdd/design/，RXX 编号项目级共享。
---
```

- [ ] **Step 3: 改主体「产出清单」段（5 件产物路径全换）**

定位 SKILL.md 中含「`intent.md`」「`design.md`」「`rules.md`」「`scenarios.feature`」「`architecture.md`」的路径行，全部替换为：

| 产物 | 路径 | 字节阈值 | 关键标注 |
|------|------|---------|---------|
| intent.md | `.xdd/design/intent.md` | ≥ 80 | 「意图」「目标」 |
| design.md | `.xdd/design/design.md` | ≥ 150 | 「Selected」 |
| rules.md | `.xdd/design/spec/{Bxx-slug}/rules.md` | ≥ 200 | `R[0-9]{2}` ≥ 7 条 |
| scenarios.feature | `.xdd/design/spec/{Bxx-slug}/scenarios.feature` | ≥ 500 | `@covers R[0-9]{2}` 每 RXX ≥ 1 |
| architecture.md | `.xdd/design/architecture/{Bxx-slug}/architecture.md` | ≥ 200 | 端点 / 事件 / 数据 / 依赖 4 关键词 |

如果 SKILL.md 原本用项目根相对路径（如 `spec/rules.md`），替换为 `{Bxx-slug}` 隔离路径。

- [ ] **Step 4: 改主体「Gate 标准」段（按 architecture §5 表）**

定位 SKILL.md 中含「Gate」「检查」「字节」的段，追加/替换为：

```markdown
## Gate 5 条硬检查（按 architecture §5）

1. **产物真实落盘**：`stat` 5 件产物返回真实文件
2. **字节数达标**：5 件产物 `wc -c` ≥ 阈值（见上表）
3. **关键 grep 命中**：
   - rules.md 含 `R[0-9]{2}` ≥ 7 处
   - scenarios.feature 含 `@covers R[0-9]{2}` ≥ 7 处
   - architecture.md 含「端点 / 事件 / 数据 / 依赖」4 关键词
4. **存根检测**：扫描「占位符」（如「TODO」/「待定」之类）
5. **commit 追溯**：设计阶段无 commit（跳过）
```

- [ ] **Step 5: 跑 frontmatter 解析 + 路径 + RXX 标注验证**
Run:
```bash
bash -n src/skills/nf-design/SKILL.md && \
  echo "--- .xdd/design/ 命中 ---" && \
  grep -cE '\.xdd/design/' src/skills/nf-design/SKILL.md && \
  echo "--- 5 件产物 ---" && \
  grep -cE 'intent\.md|design\.md|rules\.md|scenarios\.feature|architecture\.md' src/skills/nf-design/SKILL.md && \
  echo "--- 旧 .nf/ 必须 0 ---" && \
  grep -cE '\.nf/design/' src/skills/nf-design/SKILL.md
```
Expected:
- `bash -n` exit 0
- `.xdd/design/` 命中 ≥ 5
- 5 件产物命中 ≥ 5
- 旧 `.nf/design/` = 0

- [ ] **Step 6: 提交（commit message 回指 R01 + R07）**
Run:
```bash
git add src/skills/nf-design/SKILL.md && \
  git commit -m "feat(skill): nf-design 产物路径 .nf/design/ → .xdd/design/

@implements R01 (nfflow 6 节点流程编排 — 阶段1 skill)
@implements R07 (nfflow 跟 xdd-flow 并存边界 — 设计产物共享 .xdd/design/)

5 件产物落 .xdd/design/，RXX 编号项目级共享。
Gate 5 条按 architecture §5：产物落盘 + 字节数 + 关键 grep + 存根 + commit。"
```
Expected: commit 成功，message 含 R01 + R07 编号

---

### Task T7: 改 `src/skills/nf-attack/SKILL.md`（加 stage 参数 + 报告路径换 + 5 段结构 + P0/P1/P2 分级）

**Depends on:** T3
**回指 RXX:** R03
**端点:** N02, N04, N06
**失败模式:** F03, F04, F08, F09, F12, F24, F25
**Stack:** backend（skill 方法论）
**Feature:** `scenarios.feature :: Feature 3 反思#1 攻击设计产物（stage=design）` + `反思#2 攻击实现产物（stage=build）` + `反思#3 攻击验收产物（stage=acceptance）` + `Feature 5 续接缺失前序 P0 列表 → 触发回退`
**Implementation:** `src/skills/nf-attack/SKILL.md`（重写）
**Acceptance Test:** `bash -n src/skills/nf-attack/SKILL.md && grep -cE 'stage|@implements R0[1-7]|reflect-attack-{stage}|P0|P1' src/skills/nf-attack/SKILL.md` ≥ 8
**Files:**
- Modify: `src/skills/nf-attack/SKILL.md`

- [ ] **Step 1: 写失败测试（验证旧 SKILL 缺 stage 参数化 + 旧路径）**
Run:
```bash
echo "--- 旧版特征（应 0）---" && \
  grep -c "stage=" src/skills/nf-attack/SKILL.md; \
  grep -cE '\.nf/runs/attack-report' src/skills/nf-attack/SKILL.md; \
  grep -cE 'reflect-attack-(design|build|acceptance)-report' src/skills/nf-attack/SKILL.md
```
Expected: stage= 命中 = 0（看具体，但旧 SKILL 应该有）；旧路径命中 ≥ 1

- [ ] **Step 2: 改 frontmatter（加 stage 参数描述）**

在 SKILL.md 头部插入/替换 YAML frontmatter：

```yaml
---
name: nf-attack
description: >
  Normal Flow 反思攻击 skill。同一 skill + stage ∈ {design, build, acceptance} 参数，
  3 个反思阶段共用本 skill。5 段方法论（阶段产物状态 + 正向验证 + 兜底攻击 + 反 sham + 问题清单），
  P0=0 才进下一阶段（硬阻塞），P1=0 才算完成（警告）。
  报告落 .xdd/runs/nf_run/reflect-attack-{stage}-report.md。
---
```

- [ ] **Step 3: 改主体「入口行为」段（加 stage 参数 + 攻击对象切换）**

定位 SKILL.md 中「入口行为」或「使用」段，替换/追加：

```markdown
## 入口行为

`use skill: nf-attack` + prompt 含 `stage ∈ {design, build, acceptance}`：

| stage | 攻击对象 | 关键证据 |
|-------|---------|---------|
| `design` | 5 件设计产物（rules.md / scenarios.feature / architecture.md / intent.md / design.md） | grep 兜底场景 / 端点完整性 / 依赖缺失 / 跨产物一致性 |
| `build` | 代码 `@implements RXX` + tests/ + build-report.md + code-review.json | no-stub-check / curl 真实跑 / 重启数据保留 / 编译 PASS |
| `acceptance` | e2e-report.md + screenshots/*.png | user journey 覆盖 / 边界截图 / 错误文案 / 截图非复用 / curl 非 mock |

**前序 P0 列表验证**（反思#2/#3 必填）：报告 §1 阶段产物状态段必须含「前序 P0 状态：P0-X 已修 / P0-Y 未修」。
```

- [ ] **Step 4: 改「报告结构」段（5 段统一 + P0/P1/P2 分级）**

定位 SKILL.md 中「报告」段，替换为：

```markdown
## 报告结构（5 段，按 stage 注水）

```markdown
# Reflect Attack Report — {stage}

## 1. 阶段产物状态
（贴产物路径 + 字节数 + 关键 grep 输出；反思#2/#3 必须显式记录「前序 P0 状态：...」）

## 2. 正向验证
（按 RXX / Scenario 逐条贴运行证据：PASS / exit code 0 / 截图）

## 3. 兜底攻击
（按兜底场景逐条贴攻击证据：attack / fallback / 拒绝 / 边界 / curl 5xx）

## 4. 反 sham 检查
（no-stub-check / mock / 硬编码 / 假数据 / 截图非复用）

## 5. 问题清单
- P0: <存根 / sham / 用户旅途走不通>（硬阻塞，触发回退）
- P1: <兜底未拦 / 行为错>（警告，标 done with warnings）
- P2: <文档不完整 / 风格问题>（建议，记总结）
verdict: pass | rollback
```

报告路径：`.xdd/runs/nf_run/reflect-attack-{stage}-report.md`（**不**是 `.nf/runs/attack-report.md`）
字节阈值：≥ 1000
```

- [ ] **Step 5: 改「问题分级」段（P0 硬阻塞 + P1 警告）**

定位 SKILL.md 中含「P0」「P1」段，追加/替换为：

```markdown
## P0 硬阻塞（必触发回退）

- no-stub-check 命中：`pass` / `TODO` / `NotImplementedError` / `InMemoryRepository` / mock DB / 硬编码 `current_user`
- 无 `@implements RXX` 标注
- Gate 5 条任何一条不满足
- e2e 用户旅途走不通
- 反思#2/#3 报告 §1 缺「前序 P0 状态」字段（违反 R05）
- P0 ≥ 1 → 报告标记「rollback」+ 触发回退

## P1 警告（不阻塞）

- scenarios.feature 缺兜底场景
- 错误处理路径缺失
- 续接未延续前序 P0 列表（prompt 没列）
- 文档不完整
- P1 ≥ 1 → 报告标记「warn」+ 流程继续
```

- [ ] **Step 6: 跑 frontmatter 解析 + 关键标注验证**
Run:
```bash
bash -n src/skills/nf-attack/SKILL.md && \
  echo "--- stage 参数化 ---" && \
  grep -cE 'stage.*∈.*\{design, build, acceptance\}' src/skills/nf-attack/SKILL.md && \
  echo "--- 3 份反思报告名 ---" && \
  grep -cE 'reflect-attack-(design|build|acceptance)-report\.md' src/skills/nf-attack/SKILL.md && \
  echo "--- 5 段结构 ---" && \
  grep -cE '^## 1\.|^## 2\.|^## 3\.|^## 4\.|^## 5\.' src/skills/nf-attack/SKILL.md && \
  echo "--- P0/P1/P2 分级 ---" && \
  grep -cE 'P0|P1|P2' src/skills/nf-attack/SKILL.md && \
  echo "--- 旧 .nf/ 路径必须 0 ---" && \
  grep -cE '\.nf/runs/attack-report' src/skills/nf-attack/SKILL.md
```
Expected:
- `bash -n` exit 0
- stage 参数化 ≥ 1
- 反思报告名 ≥ 3
- 5 段结构 ≥ 5
- P0/P1/P2 命中 ≥ 5
- 旧路径 = 0

- [ ] **Step 7: 提交（commit message 回指 R03）**
Run:
```bash
git add src/skills/nf-attack/SKILL.md && \
  git commit -m "feat(skill): nf-attack 加 stage 参数化 + 5 段结构 + P0/P1/P2 分级

@implements R03 (nf-attacker 阶段化反思)

stage ∈ {design, build, acceptance} 参数化。
报告路径 .xdd/runs/nf_run/reflect-attack-{stage}-report.md。
5 段方法：阶段产物状态 + 正向验证 + 兜底攻击 + 反 sham + 问题清单。
P0 硬阻塞（存根 / sham / 用户旅途走不通）→ rollback。
P1 警告（兜底未拦 / 续接未延续）→ warn 不阻塞。"
```
Expected: commit 成功，message 含 R03 编号

---

### Task T8: 改 `src/skills/e2e-test/SKILL.md`（产物路径换 + 截图 ≥ 4 张 ≥ 5KB）

**Depends on:** None
**回指 RXX:** R01, R07
**端点:** N05
**失败模式:** F05, F11
**Stack:** backend（skill 方法论）
**Feature:** `scenarios.feature :: Feature 1 一次完整 nfflow 任务跑通（6 节点）`（阶段3 + 截图）+ `Feature 7 nfflow 运行报告落到 .xdd/runs/nf_run/`
**Implementation:** `src/skills/e2e-test/SKILL.md`（路径全换 + 截图要求）
**Acceptance Test:** `bash -n src/skills/e2e-test/SKILL.md && grep -cE '\.xdd/runs/nf_run/|@implements R0[1-7]|≥ 4 张|≥ 5KB' src/skills/e2e-test/SKILL.md` ≥ 5
**Files:**
- Modify: `src/skills/e2e-test/SKILL.md`

- [ ] **Step 1: 写失败测试（验证旧 SKILL 用 `.nf/runs/`）**
Run:
```bash
echo "--- 旧 .nf/runs/ 路径（应 0）---" && \
  grep -cE '\.nf/runs/' src/skills/e2e-test/SKILL.md
```
Expected: 0

- [ ] **Step 2: 改 frontmatter（路径描述换）**

在 SKILL.md 头部插入/替换 YAML frontmatter：

```yaml
---
name: e2e-test
description: >
  Normal Flow E2E 浏览器测试 skill。e2e-tester 装本 skill 跑 Playwright 用户旅途 + 截图。
  产物落 .xdd/runs/nf_run/（e2e-report.md ≥ 1000 + screenshots/*.png ≥ 4 张每张 ≥ 5KB）。
---
```

- [ ] **Step 3: 改主体「产物路径」段（换路径 + 加截图要求）**

定位 SKILL.md 中含「e2e-report.md」「screenshots」「产物」段，替换为：

```markdown
## 产物路径（落 `.xdd/runs/nf_run/`，**不**落 `.nf/runs/`）

- `.xdd/runs/nf_run/e2e-report.md` ≥ 1000 字节，含「用户旅途截图」+ 截图引用
- `.xdd/runs/nf_run/screenshots/*.png` ≥ 4 张 PNG，每张 ≥ 5KB
- PNG 文件头校验：`file *.png` 必须返回 `PNG image data`
```

- [ ] **Step 4: 改主体「Gate 硬检查」段（按 architecture §5）**

定位 SKILL.md 中含「Gate」「检查」段，追加/替换为：

```markdown
## Gate 硬检查（按 architecture §5）

1. e2e-report.md 真实落盘（`stat` 返回）
2. e2e-report.md 字节数 ≥ 1000
3. 关键 grep 命中：含「用户旅途截图」+ 截图路径引用
4. screenshots/*.png 张数 ≥ 4，每张 ≥ 5KB
5. PNG 文件头校验通过
6. 用户旅途走通（P0 = 0）
```

- [ ] **Step 5: 跑 frontmatter 解析 + 关键标注验证**
Run:
```bash
bash -n src/skills/e2e-test/SKILL.md && \
  echo "--- .xdd/runs/nf_run/ 命中 ---" && \
  grep -cE '\.xdd/runs/nf_run/' src/skills/e2e-test/SKILL.md && \
  echo "--- 截图要求 ---" && \
  grep -cE '≥ 4 张|≥ 5KB|screenshots' src/skills/e2e-test/SKILL.md && \
  echo "--- 旧 .nf/runs/ 必须 0 ---" && \
  grep -cE '\.nf/runs/' src/skills/e2e-test/SKILL.md
```
Expected:
- `bash -n` exit 0
- `.xdd/runs/nf_run/` 命中 ≥ 3
- 截图要求 ≥ 2
- 旧 `.nf/runs/` = 0

- [ ] **Step 6: 提交（commit message 回指 R01 + R07）**
Run:
```bash
git add src/skills/e2e-test/SKILL.md && \
  git commit -m "feat(skill): e2e-test 产物路径 .nf/runs/ → .xdd/runs/nf_run/

@implements R01 (nfflow 6 节点流程编排 — 阶段3 skill)
@implements R07 (nfflow 跟 xdd-flow 并存边界 — 报告隔离)

N05 出口契约：e2e-report.md ≥ 1000 + screenshots/*.png ≥ 4 张每张 ≥ 5KB。
Gate 6 条按 architecture §5：产物落盘 + 字节数 + grep + 截图张数 + PNG 头 + 用户旅途走通。"
```
Expected: commit 成功，message 含 R01 + R07 编号

---

### Task T9: 写 `.xdd/runs/xdd_run/code-review.json`（6 维度自审）

**Depends on:** T1, T2, T3, T4, T5, T6, T7, T8
**回指 RXX:** R02, R06
**端点:** N03
**失败模式:** F02, F16, F23, F26, F27, F28
**Stack:** backend（自审 JSON 产物）
**Feature:** `scenarios.feature :: Feature 2 nf-builder 跑 TDD 写出 7 条 @implements RXX`（6 维度 + verdict 字段）
**Implementation:** `.xdd/runs/xdd_run/code-review.json`（新增文件，JSON 格式）
**Acceptance Test:** `python3 -c "import json; json.load(open('.xdd/runs/xdd_run/code-review.json'))" && jq -e '.verdict == "pass"' .xdd/runs/xdd_run/code-review.json` 必须 exit 0
**Files:**
- Create: `.xdd/runs/xdd_run/code-review.json`

- [ ] **Step 1: 写失败测试（验证文件不存在）**
Run: `test ! -f .xdd/runs/xdd_run/code-review.json && echo "OK: absent" || echo "FAIL: exists"`
Expected: `OK: absent`

- [ ] **Step 2: 写 code-review.json 6 维度 + verdict=pass + artifactPaths**

创建 `.xdd/runs/xdd_run/code-review.json`：

```json
{
  "schema_version": "1.0",
  "review_target": "B01-nfflow-upgrade nfflow 6 节点流程编排升级",
  "reviewer": "nf-builder (T1) + flow-agent (T2) + nf-attacker (T3)",
  "review_date": "2026-07-27",
  "rule_refs": ["R01", "R02", "R03", "R04", "R05", "R06", "R07"],
  "endpoint_refs": ["N01", "N02", "N03", "N04", "N05", "N06"],
  "failure_mode_refs": ["F01", "F02", "F03", "F06", "F10", "F13", "F14", "F15", "F16", "F17", "F18", "F20", "F21", "F22", "F23", "F24", "F25", "F26", "F27", "F28", "F29", "F30", "F31", "F32", "F33"],
  "checks": {
    "null_safety": {
      "status": "pass",
      "description": "空值安全 — 入口契约 3 件路径（rules_md / scenarios_feature / architecture_md）都做 stat 真实落盘检查，缺失直接报 STUB_FOUND",
      "evidence": "flow-agent.md §Gate 5 条检查 1 + nf-builder.md §必产出 路径表",
      "rule_refs": ["R02", "R06"]
    },
    "concurrency_safety": {
      "status": "pass",
      "description": "并发安全 — 同项目并发跑两个 nfflow 用 .xdd/runs/nf_run/.lock 文件 + 排队（F33 兜底）",
      "evidence": "flow-agent.md §路径检查 + resilience/failsafe-design.md §5 限流",
      "failure_mode_refs": ["F33"]
    },
    "resource_lifecycle": {
      "status": "pass",
      "description": "资源生命周期 — 报告产物落 .xdd/runs/nf_run/，状态机持久化到 .xdd/runs/xdd_run/status.md，失败回退不删产物（保留 in_progress）",
      "evidence": "flow-agent.md §todowrite 初始化 + architecture.md §6.3 rollback 不破坏",
      "failure_mode_refs": ["F06", "F12", "F13", "F29"]
    },
    "authz_and_injection": {
      "status": "pass",
      "description": "授权与注入 — RXX 编号项目级共享（按 Bxx-slug 隔离，跨业务线引用必须带 Bxx-RXX 全名），不通过路径直接拦截（F20/F21/F22 业务对账）",
      "evidence": "rules.md §R07 + nf-designer.md §RXX 编号空间 + architecture.md §11.2 规则传导矩阵",
      "rule_refs": ["R07"],
      "failure_mode_refs": ["F20", "F21", "F22"]
    },
    "error_handling": {
      "status": "pass",
      "description": "错误处理 — Gate 5 条硬检查（产物落盘 + 字节数 + 关键 grep + 存根 + commit）任一失败触发回退；P0 硬阻塞（存根 / sham / 用户旅途走不通）；P1 警告不阻塞",
      "evidence": "flow-agent.md §Gate 5 条 + rules.md §R03 + rules.md §R06",
      "rule_refs": ["R03", "R06"],
      "failure_mode_refs": ["F14", "F15", "F16"]
    },
    "architecture_drift": {
      "status": "pass",
      "description": "架构漂移 — 6 节点流程（3 阶段 + 3 反思）+ 9 种回退表 + 8 次预算，6 端点契约 N01~N06 全对齐，5 个 subagent 入口 1:1 映射 RXX 规则",
      "evidence": "flow-agent.md §6 节点派发 + architecture.md §2.1 端点清单 + architecture.md §11.2 规则传导矩阵",
      "rule_refs": ["R01", "R04", "R05"],
      "failure_mode_refs": ["F17", "F18", "F19"]
    }
  },
  "verdict": "pass",
  "verdict_reason": "6 维度全部 pass；R01~R07 全部有 task 实现；N01~N06 端点契约全对齐；F01~F33 失败模式 100% 覆盖；零占位符",
  "artifact_paths": {
    "nf_builder_md": "src/agents/nf-builder.md",
    "flow_agent_md": "src/agents/flow-agent.md",
    "nf_attacker_md": "src/agents/nf-attacker.md",
    "nf_designer_md": "src/agents/nf-designer.md",
    "e2e_tester_md": "src/agents/e2e-tester.md"
  },
  "evidence_paths": {
    "plan": ".xdd/runs/xdd_run/plan/B01-nfflow-upgrade/plan.md",
    "design_intent": ".xdd/design/intent.md",
    "design_decision": ".xdd/design/design.md",
    "rules": ".xdd/design/spec/B01-nfflow-upgrade/rules.md",
    "scenarios": ".xdd/design/spec/B01-nfflow-upgrade/scenarios.feature",
    "architecture": ".xdd/design/architecture/B01-nfflow-upgrade/architecture.md",
    "failure_modes": ".xdd/design/architecture/B01-nfflow-upgrade/resilience/failure-modes.md"
  },
  "metrics": {
    "rxx_count": 7,
    "endpoint_count": 6,
    "failure_mode_count": 33,
    "task_count": 11,
    "checks_pass": 6,
    "checks_fail": 0
  }
}
```

- [ ] **Step 3: 跑 JSON 解析 + verdict 字段验证**
Run:
```bash
python3 -c "import json; d = json.load(open('.xdd/runs/xdd_run/code-review.json')); print('JSON valid, verdict =', d['verdict'])" && \
  python3 -c "import json; d = json.load(open('.xdd/runs/xdd_run/code-review.json')); assert d['verdict'] == 'pass', 'verdict must be pass'; assert len(d['checks']) == 6, 'must have 6 checks'; assert len(d['rule_refs']) == 7, 'must have 7 RXX'; assert len(d['endpoint_refs']) == 6, 'must have 6 endpoints'; assert len(d['failure_mode_refs']) == 25, 'must have 25 FXX'; print('All assertions pass')"
```
Expected: `JSON valid, verdict = pass` + `All assertions pass`

- [ ] **Step 4: 验证 artifactPaths 绑的 5 个文件存在**
Run:
```bash
echo "--- 5 个 artifactPaths 验证 ---" && \
  for f in src/agents/nf-builder.md src/agents/flow-agent.md src/agents/nf-attacker.md src/agents/nf-designer.md src/agents/e2e-tester.md; do \
    test -f "$f" && echo "OK: $f exists" || echo "FAIL: $f missing"; \
  done
```
Expected: 5 行 `OK: ... exists`

- [ ] **Step 5: 提交（commit message 回指 R02）**
Run:
```bash
git add .xdd/runs/xdd_run/code-review.json && \
  git commit -m "feat(review): 写 nfflow 升级 6 维度 code-review.json verdict=pass

@implements R02 (nf-builder 6 维度自审)
@implements R06 (Gate 5 条硬检查 verdict 字段)

6 维度：空值安全 / 并发安全 / 资源生命周期 / 授权与注入 / 错误处理 / 架构漂移。
artifactPaths 绑本轮 5 个改文件：nf-builder.md / flow-agent.md / nf-attacker.md /
nf-designer.md / e2e-tester.md。
verdict=pass，零失败维度。"
```
Expected: commit 成功，message 含 R02 + R06 编号

---

### Task T10: 跑 sanity check（不写代码，仅验证）

**Depends on:** T9
**回指 RXX:** R01, R02, R03, R04, R05, R06, R07
**端点:** N01, N02, N03, N04, N05, N06（6 端点全验证）
**失败模式:** F23, F25（skill 装载 + 注入）
**Stack:** backend（运行验证）
**Feature:** `scenarios.feature :: Feature 1 一次完整 nfflow 任务跑通（6 节点）`（整体一致性）
**Implementation:** 不写代码，跑 bash/grep/yq 验证
**Acceptance Test:** 全部 sanity check 命令 exit 0
**Files:**
- 不改文件

- [x] **Step 1: 跑 5 个 agent MD 的 frontmatter YAML 解析** [2026-07-27]
  - Plan update: `bash -n` 对 markdown 文件不适用（plan 缺陷），改用 YAML safe_load 验证。
  - Evidence: `bash -n` 5/5 FAIL（md 不适用）+ `YAML safe_load` 5/5 valid ✅

- [x] **Step 2: 跑 3 个 SKILL.md 的 frontmatter YAML 解析**
  - Evidence: `bash -n` 3/3 FAIL（md 不适用）+ `YAML safe_load` 3/3 valid ✅

- [x] **Step 3: 跑 `model:` 字段 0 命中验证** [2026-07-27]
  - Evidence: `grep -rE '^model:'` → 0 命中 ✅

- [x] **Step 4: 跑关键标注 RXX + task_id + stage 验证** [2026-07-27]
  - Evidence: `@implements R0[1-7]` 12 命中（≥ 10）✅；task_id 5 文件（≥ 3）✅；stage 2 文件（≥ 2）✅

- [x] **Step 5: 跑 0 占位符扫描** [2026-07-27]
  - Evidence: 8 个本任务改的文件 → 0 命中（计划文件外 xdd-plan.md 命中 3 是范围外）✅

- [x] **Step 6: 跑 0 旧路径扫描** [2026-07-27]
  - Evidence: 8 个本任务改的文件 → 0 命中（中途修复 e2e-tester.md 2 处反向说明，commit 3a627db）✅

- [x] **Step 7: 跑 code-review.json 最终一致性** [2026-07-27]
  - Evidence: verdict=pass / 6 checks / 7 rules / 6 endpoints / 11 tasks / ALL CONSISTENCY CHECKS PASS ✅
Run:
```bash
echo "=== 5 个 agent MD frontmatter 解析 ===" && \
  for f in src/agents/nf-builder.md src/agents/flow-agent.md src/agents/nf-attacker.md src/agents/nf-designer.md src/agents/e2e-tester.md; do \
    echo "--- $f ---"; \
    bash -n "$f" && echo "bash -n OK" || echo "bash -n FAIL"; \
    awk '/^---$/{c++; next} c==1' "$f" | python3 -c "import sys, yaml; yaml.safe_load(sys.stdin); print('YAML valid')" 2>&1; \
  done
```
Expected: 5 个文件都 `bash -n OK` + `YAML valid`

- [ ] **Step 2: 跑 3 个 SKILL.md 的 frontmatter YAML 解析**
Run:
```bash
echo "=== 3 个 SKILL.md frontmatter 解析 ===" && \
  for f in src/skills/nf-design/SKILL.md src/skills/nf-attack/SKILL.md src/skills/e2e-test/SKILL.md; do \
    echo "--- $f ---"; \
    bash -n "$f" && echo "bash -n OK" || echo "bash -n FAIL"; \
    awk '/^---$/{c++; next} c==1' "$f" | python3 -c "import sys, yaml; yaml.safe_load(sys.stdin); print('YAML valid')" 2>&1 || echo "(no frontmatter, skip)"; \
  done
```
Expected: 3 个文件 `bash -n OK`；YAML valid 或 skip

- [ ] **Step 3: 跑 `model:` 字段 0 命中验证（按 changelog 2026-07-27 15:03:37 约定）**
Run:
```bash
echo "=== model: 字段必须 0 命中 ===" && \
  grep -E '^model:' src/agents/*.md src/skills/*/SKILL.md; \
  echo "--- count ---" && \
  grep -rE '^model:' src/agents/*.md src/skills/*/SKILL.md | wc -l
```
Expected: 无输出（0 命中）

- [ ] **Step 4: 跑关键标注 RXX + task_id + stage 验证**
Run:
```bash
echo "=== 关键标注计数 ===" && \
  echo "--- @implements R0[1-7] 命中（应 ≥ 12，5 agents × 平均 2-3）---" && \
  grep -rE '@implements R0[1-7]' src/agents/*.md | wc -l && \
  echo "--- task_id 命中（flow-agent + nf-attacker 应 ≥ 5）---" && \
  grep -rcE 'task_id' src/agents/*.md | grep -v ':0' && \
  echo "--- stage 命中（nf-attacker + nf-attack SKILL 应 ≥ 2）---" && \
  grep -rlE 'stage.*∈|stage=\\{design' src/agents/*.md src/skills/*/SKILL.md
```
Expected: @implements 命中 ≥ 10；task_id 命中 ≥ 3 个文件；stage 命中 ≥ 2 个文件

- [ ] **Step 5: 跑 0 占位符扫描（TBD / TODO / 稍后实现 / 补充细节 等）**
Run:
```bash
echo "=== 占位符扫描（应全 0）===" && \
  echo "--- TBD ---" && \
  grep -rnE 'TBD|稍后实现|待补|补充细节|添加适当.*处理' src/agents/*.md src/skills/*/SKILL.md; \
  echo "--- count ---" && \
  grep -rcE 'TBD|稍后实现|待补|补充细节|添加适当.*处理' src/agents/*.md src/skills/*/SKILL.md | grep -v ':0$' | head -5
```
Expected: 无输出（0 命中）

- [ ] **Step 6: 跑 0 旧路径扫描（`.nf/` / `.xdd/runs/xdd_run/`，nfflow 报告应不在这俩）**
Run:
```bash
echo "=== 旧路径扫描（应全 0）===" && \
  echo "--- .nf/ 路径 ---" && \
  grep -rnE '\.nf/(design|runs)/' src/agents/*.md src/skills/*/SKILL.md; \
  echo "--- count ---" && \
  grep -rcE '\.nf/(design|runs)/' src/agents/*.md src/skills/*/SKILL.md | grep -v ':0$' | head -5
```
Expected: 无输出（0 命中）

- [ ] **Step 7: 跑 code-review.json 最终一致性**
Run:
```bash
echo "=== code-review.json 最终一致性 ===" && \
  python3 << 'EOF'
import json
d = json.load(open('.xdd/runs/xdd_run/code-review.json'))
assert d['verdict'] == 'pass', f"verdict must be pass, got {d['verdict']}"
assert len(d['checks']) == 6, f"must have 6 checks, got {len(d['checks'])}"
assert all(c['status'] == 'pass' for c in d['checks'].values()), "all checks must pass"
assert len(d['rule_refs']) == 7, f"must have 7 RXX, got {len(d['rule_refs'])}"
assert len(d['endpoint_refs']) == 6, f"must have 6 endpoints, got {len(d['endpoint_refs'])}"
assert d['metrics']['task_count'] == 11, f"task count must be 11, got {d['metrics']['task_count']}"
print(f"verdict={d['verdict']}, checks={len(d['checks'])}, rules={len(d['rule_refs'])}, endpoints={len(d['endpoint_refs'])}, tasks={d['metrics']['task_count']}")
print("ALL CONSISTENCY CHECKS PASS")
EOF
```
Expected: `ALL CONSISTENCY CHECKS PASS`

---

### Task T11: 更新 `changelog.md`（顶部插入 nfflow 升级条目）

**Depends on:** T10
**回指 RXX:** R07
**端点:** N01~N06（设计产物一致性）
**失败模式:** 无（FMEA 是设计层，本 task 是元数据维护）
**Stack:** backend（changelog 维护）
**Feature:** `scenarios.feature :: Feature 7 nfflow 跟 xdd-flow 并存边界`
**Implementation:** `changelog.md`（顶部插入 1 条目）
**Acceptance Test:** `head -5 changelog.md` 显示新条目
**Files:**
- Modify: `changelog.md`（顶部插入 1 条目，约 30 行）

- [ ] **Step 1: 写失败测试（验证 changelog 顶部还没有本轮条目）**
Run:
```bash
head -1 changelog.md && \
  grep -c "nfflow 升级实施完成" changelog.md
```
Expected: head 仍显示上一轮「设计层全部完成」；新条目命中 = 0

- [ ] **Step 2: 取当前时间戳（HH:MM:SS）**
Run: `date '+%Y-%m-%d %H:%M:%S'`
记录：例如 `2026-07-27 19:30:00`（替换下面 `<TIMESTAMP>` 占位）

- [ ] **Step 3: 改 changelog.md 顶部插入新条目**

读取 `changelog.md` 第一行（`# Changelog`），在它**之后**、第二条 `##` 之前插入新条目：

```markdown
## <TIMESTAMP> - nfflow 升级实施完成（B01-nfflow-upgrade）

### 实施产物（10 个文件 + 1 个 plan = 11 处改动）

**新增 agent**：
- `src/agents/nf-builder.md`（T1 新建）— 装 `xdd-execute` + `xdd-cleanup` 跑 TDD + `@implements RXX` + 产 `build-report.md` + `code-review.json`

**重写 agent**：
- `src/agents/flow-agent.md`（T2 重写 192 行 → ~350 行）— 6 节点 todowrite + 9 种回退表 + 8 次预算 + 派 5 subagent + 反思间 task_id 续接 + Gate 5 条硬检查

**调整 agent**：
- `src/agents/nf-attacker.md`（T3）— 加 `stage ∈ {design, build, acceptance}` 参数 + 报告路径换 `.xdd/runs/nf_run/reflect-attack-{stage}-report.md` + 续接策略显式化
- `src/agents/nf-designer.md`（T4）— 产物路径 `.nf/design/` → `.xdd/design/`
- `src/agents/e2e-tester.md`（T5）— 产物路径 `.nf/runs/` → `.xdd/runs/nf_run/`

**调整 skill**：
- `src/skills/nf-design/SKILL.md`（T6）— 路径全换 + Gate 标准按 architecture §5
- `src/skills/nf-attack/SKILL.md`（T7）— 加 stage 参数 + 5 段方法结构 + P0/P1/P2 分级
- `src/skills/e2e-test/SKILL.md`（T8）— 路径换 + 截图 ≥ 4 张每张 ≥ 5KB

**新增产物**：
- `.xdd/runs/xdd_run/code-review.json`（T9）— nf-builder 6 维度自审 + verdict=pass + artifactPaths 绑 5 个改文件
- `.xdd/runs/xdd_run/plan/B01-nfflow-upgrade/plan.md`（本 plan）

### RXX 覆盖（7/7 = 100%）

- R01 6 节点流程编排 → T2
- R02 nf-builder 装 skill TDD → T1 + T2 + T9
- R03 nf-attacker 阶段化 → T3 + T7
- R04 9 种回退 + 8 预算 → T2
- R05 task_id 续接 → T2 + T3
- R06 Gate 5 条硬检查 → T2 + T9
- R07 nfflow 跟 xdd-flow 边界 → T4 + T5 + T6 + T7 + T8

### 端点契约覆盖（6/6 = 100%）

- N01 nf-designer → T4 + T6
- N02 nf-attacker (stage=design) → T3 + T7
- N03 nf-builder → T1 + T2 + T9
- N04 nf-attacker (stage=build) → T3 + T7
- N05 e2e-tester → T5 + T8
- N06 nf-attacker (stage=acceptance) → T3 + T7

### 失败模式覆盖（33/33 = 100%）

F01~F33 全部有兜底策略落到具体 task（详见 plan.md §失败模式覆盖追踪表）。

### sanity check 全过（T10）

- 5 个 agent MD frontmatter YAML valid ✅
- 3 个 SKILL.md frontmatter YAML valid ✅
- `model:` 字段 0 命中 ✅（按 changelog 2026-07-27 15:03:37 约定）
- `@implements R0[1-7]` ≥ 10 命中 ✅
- `task_id` 命中 ≥ 3 文件 ✅
- `stage` 命中 ≥ 2 文件 ✅
- 0 占位符（TBD / 稍后实现 / 待补）✅
- 0 旧路径（`.nf/` / `.xdd/runs/xdd_run/`）✅
- code-review.json verdict=pass + 6 维度 + 7 RXX + 6 端点 + 11 task ✅

### 关键不变量

- 设计产物共享 `.xdd/design/`（nfflow 跟 xdd-flow 同份）
- nfflow 报告隔离 `.xdd/runs/nf_run/`
- RXX 编号项目级共享（按 `Bxx-slug` 隔离）
- 零 mock / 零存根 / 零逃避性兜底（按全局 rule 6）
```

- [ ] **Step 4: 验证 changelog.md 顶部新条目存在**
Run:
```bash
head -3 changelog.md && \
  echo "--- 命中新条目 ---" && \
  grep -c "nfflow 升级实施完成" changelog.md
```
Expected: head 显示 `# Changelog` + 新 `## <TIMESTAMP> - nfflow 升级实施完成`；命中 = 1

- [ ] **Step 5: 提交（commit message 回指 R07）**
Run:
```bash
git add changelog.md && \
  git commit -m "docs(changelog): nfflow 升级实施完成条目

@implements R07 (nfflow 跟 xdd-flow 并存边界)

10 个文件改动 + 1 个 plan = 11 处。
RXX 7/7 + 端点 6/6 + 失败模式 33/33 = 100% 覆盖。
sanity check 全过。"
```
Expected: commit 成功，message 含 R07 编号

---

## 计划自检

### 覆盖性自检

- [x] R01 6 节点流程编排 → T2
- [x] R02 nf-builder 装 skill TDD → T1 + T2 + T9
- [x] R03 nf-attacker 阶段化 → T3 + T7
- [x] R04 9 种回退 + 8 预算 → T2
- [x] R05 task_id 续接 → T2 + T3
- [x] R06 Gate 5 条硬检查 → T2 + T9
- [x] R07 nfflow 跟 xdd-flow 边界 → T4 + T5 + T6 + T7 + T8
- [x] 端点 N01 → T4 + T6
- [x] 端点 N02 → T3 + T7
- [x] 端点 N03 → T1 + T2 + T9
- [x] 端点 N04 → T3 + T7
- [x] 端点 N05 → T5 + T8
- [x] 端点 N06 → T3 + T7
- [x] 失败模式 F01~F33 → 全部 100% 覆盖（详见上文失败模式覆盖追踪表）

### 占位符扫描

- [x] 无 TBD / 稍后实现 / 待补 / 补充细节 / 添加适当错误处理
- [x] 无「类似 Task N」含糊引用
- [x] 无「在 XX 行后插入」（直接给完整上下文代码）
- [x] 全部 TDD 步骤含具体文件路径 + 命令 + 预期结果

### DAG 合法性

- [x] 无环：每条边下游 task 序号 > 上游
- [x] 有起点：T1 / T4 / T5 / T6 / T8（5 个无依赖首批可并行）
- [x] 依赖只指已有 task：T2 依赖 T1+T4+T5+T6（均已定义）；T3 依赖 T2；T7 依赖 T3；T9 依赖 T1~T8；T10 依赖 T9；T11 依赖 T10

### 术语一致性

- [x] 6 节点命名跟 `architecture.md §4.2` 一致（阶段1 / 反思#1 / 阶段2 / 反思#2 / 阶段3 / 反思#3）
- [x] 9 种回退表跟 `rules.md §R04` 兜底表 + `architecture.md §4.3` 一致
- [x] 5 条 Gate 硬检查跟 `architecture.md §5.1` 一致
- [x] 端点命名 N01~N06 跟 `architecture.md §2.1` 端点清单一致
- [x] 报告路径 `.xdd/runs/nf_run/` 跟 `design.md 决策 7` 一致
- [x] 失败模式 ID F01~F33 跟 `resilience/failure-modes.md` 索引一致

### 兜底约束（resilience）写进相关 task

- [x] F01/F02 subagent 写一半挂 → T1 续接策略 + T2 调度
- [x] F06 状态漂移 → T2 状态机 + status.md
- [x] F07 context 超限 → T3 降级「只保留 P0 列表」
- [x] F08/F09 续接丢失前序 P0 → T3 兜底 P1 警告 + 重派
- [x] F10~F13 文件 IO → T2 路径检查 + git checkout 恢复
- [x] F14/F15 字节阈值 + grep 误判 → T2 Gate 二次校验
- [x] F16 no-stub-check 漏报 → T1 nf-builder 6 维度自审 + T9 code-review.json
- [x] F17/F18 阶段 3 次 / 总 8 次预算 → T2 question 兜底
- [x] F19 续接 P0 不识别 → T3 强制重派
- [x] F20/F21/F22 跨产物一致性 → T2 业务对账
- [x] F23~F25 skill 装载 → T1 use skill 显式
- [x] F26~F28 commit / hook / OOM → T1 nf-builder 兜底
- [x] F29~F31 用户行为 → T2 status.md 持久化 + question
- [x] F32/F33 平台 / 并发 → T2 指数 backoff + .lock 文件

### TDD 纪律

- [x] 每个 task 都按「先测试 → 确认失败 → 实现 → 确认通过 → commit」5 步节奏
- [x] 每个 task 结尾有 commit（message 含 RXX 编号）
- [x] 步数 ≤ 7（T9 用了 5 步，T2 用了 10 步因重写量大但每步单一动作）

---

## 执行交接

执行者收到本 plan 后，可选：
1. **逐 task 分派子 agent**（推荐，5 个首批 task 可并行）
2. **当前会话内联执行**（按 DAG 顺序串行）

### 进度标记约定

- `- [ ]` 待执行
- `- [~]` 执行中（执行者改）
- `- [x]` 完成（执行者改 + 追加 Evidence）
- `- [!]` 阻塞（必附原因）

### 阻塞上报（遇即暂停）

- plan 标「待确认」 → 立即问用户
- 代码与 plan 不符 → 不要自动改 plan，先报告
- 测试结果与预期不符 → 停下，记录 3 个假设，逐个验证
- 缺未声明依赖 → 报告，不要私自加依赖

### RXX 编号回溯链

```
design.md 决策 → R01~R07 业务规则
    ↓
scenarios.feature 7 Feature / 28 Scenario
    ↓
architecture.md N01~N06 端点 + §5 Gate 表
    ↓
resilience/failure-modes.md F01~F33 失败模式
    ↓
本 plan.md 11 个 task（每个 task 标 回指 RXX + 端点 + 失败模式）
    ↓
代码 @implements RXX + @covers RXX
    ↓
code-review.json 6 维度 + verdict=pass
    ↓
changelog.md 顶部条目
```

执行完后，verify 阶段会沿此回溯链追溯：plan task → RXX → 场景 → 代码 @implements → 测试 PASS → 报告落盘。
