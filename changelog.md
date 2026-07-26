# Changelog

## 2026-07-26 12:07:05 - 迁移 xdd-flow 从 ~/ws/cjpi 到 opencode

### 迁移内容

从 pi 生态（`~/ws/cjpi`）迁移 xdd-flow 全流程开发体系到 opencode 生态。参考 normal-flow 迁移经验，采用 agent 自编排方案（方案 C）：不移植 TypeScript 插件工具，agent 用内置 `read`/`write`/`edit`/`bash`/`glob`/`grep`/`skill`/`task` 自行完成所有工作。

### 新增

- **xdd-flow**（`src/agents/xdd-flow.md`）：primary agent，合并原 `xdd-walker`（单工匠）+ `xdd-orchestrator`（编排）为统一入口。小项目自己装 skill 全干完，大项目（≥3 业务线）派 xdd-* 子 agent 并行。
  - `permission.task` 限制只能派 6 个 xdd-* subagent + explore + general。

- **6 个 subagent**（`src/agents/xdd-*.md`）：原 `phase-*` 重命名为 `xdd-*`：
  - `xdd-brainstorm` -- 意图锚（装 xdd-brainstorm skill）
  - `xdd-design` -- 规则+结构+前端锚（装 xdd-spec + xdd-architecture + xdd-wire）
  - `xdd-resilience` -- 韧性锚（装 xdd-resilience skill）
  - `xdd-plan` -- 桥接层 TDD 计划（装 xdd-plan skill）
  - `xdd-build` -- 代码实现 + 自审（装 xdd-execute + xdd-cleanup skill）
  - `xdd-verify` -- 真实验证 + 聚合裁决（装 xdd-verify skill）
  - 每个 subagent 声明 `tools: {task: false}`，不派子 subagent。

- **20 个 skill**（`src/skills/xdd-*/`）：从 `~/ws/cjpi/skills/` 原样复制（含 scripts/references/templates）。丢弃 `xdd-subagents`（pi 专属，被 phase-*.md 替代）。

### TS 工具引用改写（agent 自编排，方案 C）

原 xdd 的 4 个 TypeScript 工具（`extensions/xdd/tools/`）不移植。改为 agent 用内置工具自编排：

| 原 TS 工具 | 改写为 | 影响文件 |
|-----------|-------|---------|
| `xdd_runtime_observe` | `bash` 跑 healthcheck/curl + `read` 对比基线 + `write` 保存 incident | xdd-verify.md, xdd-verify/SKILL.md |
| `xdd_quality_score` | `read`/`glob` 检查证据文件 + `bash` git status + `write` quality-score.json | xdd-verify.md, xdd-verify/SKILL.md |
| `xdd_release_decision` | `read`/`grep` 逐项检查 gate + `write` release-decision.json | xdd-verify.md, xdd-verify/SKILL.md |
| Pi AIGate code review | `read` 源码自审 6 角度 + `write` code-review.json + xdd-flow 可 `task` 派 general 复审 | xdd-build.md, xdd-execute/SKILL.md |

### 路径修复

- `skills/xdd-init/SKILL.md`：`~/.claude/skills/` -> `~/.config/opencode/skills/`
- `skills/xdd-skill-creator/scripts/run_eval.py`：仍引用 Claude Code CLI（`claude -p`、`.claude/commands/`），需后续适配 opencode（非核心流程，暂留）

### 与现有 nf-* 流程共存

xdd-flow / flow-agent 各自独立，用户自选。install.sh 不用改（已处理 agents/skills/plugins 符号链接）。

### 未迁移

- `extensions/xdd/`（78 个 TS 文件）-- agent 自编排替代
- `extensions/xdd-subagents/` -- xdd-*.md subagent 替代
- `skills/xdd-subagents/` -- 丢弃
- `pi/`、`node_modules/`、`.pi/`、`docs/`

## 2026-07-25 - 新增 e2e-tester subagent + e2e-test skill（浏览器 E2E 测试）

### 新增

按 AGENTS.md 开发流程"先写 gherkin scenario -> TDD 开发 -> E2E browser 测试"，
补齐第三阶段：浏览器 E2E 测试。

- **e2e-tester**（`src/agents/e2e-tester.md`）：subagent，支持 task_id 续接。
  读 .feature 场景 + 用户旅途文档，用 Playwright 驱动浏览器 click/navigate/screenshot/assert，
  产出 .nf/runs/e2e-report.md + .nf/runs/screenshots/ 截图。

- **e2e-test skill**（`src/skills/e2e-test/SKILL.md`）：浏览器 E2E 测试方法论。
  - 环境准备：检查应用运行、安装 Playwright
  - 场景转测试：从 Gherkin Scenario 提取步骤 -> Playwright test
  - 用户旅途测试：从 design.md 旅程 -> 多步浏览器测试
  - 兜底场景测试：错误密码/无权限/边界值，证明页面真拦截了
  - 报告结构 + Gate 硬检查（报告存在/正向通过/兜底测试/真实浏览器操作/截图/P0=0）

- **flow-agent.md** 更新：两阶段 -> 三阶段（design -> attack -> e2e）。
  - task permission 新增 `e2e-tester: allow`
  - 新增阶段 3 Gate 标准（6 条，含 glob 检查截图文件）
  - 卡住时回退路径：e2e 发现 bug -> 回阶段 2 修实现

### 验证

- 符号链接验证：agents/e2e-tester.md + skills/e2e-test/SKILL.md 通过 symlink 可访问。

## 2026-07-25 - 架构重构：去掉 nf_* 插件工具依赖，改用 task_id 续接

### 根因确认

nf_* 插件工具（nf_start/nf_observe/nf_desired_state/nf_difference/nf_submit/nf_advance/nf_resume）
**实际未出现在 flow-agent 可用工具列表中**。flow-agent 实际可用工具只有：
glob / grep / read / skill / task / todowrite / question / webfetch。

插件代码本身能加载（bun import 验证 7 工具注册成功），但 opencode 运行时的
插件工具 -> agent 工具列表的桥接存在断点（可能是 v1/v2 工具注册差异，
或 InstanceState 初始化时序问题）。不再追查此问题，改为不依赖插件工具。

### 架构变更：flow_agent 自编排 + task_id 续接

**旧架构**: flow_agent 调 nf_* 插件工具 -> controller 状态机 -> 硬 Gate
**新架构**: flow_agent 在 prompt 中自行编排控制循环，用 read/grep 做 Gate 检查，用 task+task_id 派发/续接 subagent

**flow-agent.md** 重写：
- 控制循环编码在 prompt 里：observe(read) -> difference(grep对照) -> dispatch(task) -> check(read) -> advance
- 两阶段 Gate 标准用表格写明：每条条件 + 检查方法（read/grep 命令）
- task_id 续接规则：首次不传 task_id（fresh），修复时传 task_id（保留 subagent 上下文）
- 每阶段最多重试 3 次，超过用 question 向用户报告
- 用 todowrite 跟踪阶段进度

**nf-designer.md** 重写：
- 删除所有 nf_* 工具 deny 规则（工具不存在，无需 deny）
- 新增"续接模式"段：首次全量产出，续接时直接修缺口
- 保持以 skill 为准的薄包装结构

**nf-attacker.md** 重写：
- 同上，删除 nf_* deny，新增续接模式说明

### 优势

- **不依赖插件工具**：flow_agent 只用内置工具（read/glob/grep/task/todowrite），任何 opencode 版本都能跑
- **task_id 续接**：subagent 保留上下文，修复时不用从头读文件，更高效
- **Gate 透明**：检查标准在 prompt 里，flow_agent 自己跑 grep 验证，不依赖黑盒工具

### 遗留

- normal-flow 插件仍保留在 src/plugins/（session.idle hook 因无 runtime.json 不会触发，无害但无用）
- 后续可考虑删除插件或改为纯参考代码

## 2026-07-25 - 修复 Flow-Agent 工具幻觉 bug + skill agent 重构（以 skill 为准）

### Bug 修复：Flow-Agent 不走下一步

**根因**：Flow-Agent 使用 MiniMax-M3 时，模型收到 7 个 nf_* 工具定义（8839 input tokens 含工具 schema），
但产生 reasoning "Identifying missing nf_start tool / Confirming nf_start unavailability as blocker"，
**幻觉**工具不可用，直接输出文字拒绝推进，未调用任何工具。

**证据**：从 opencode.db event 表还原 session ses_066ef7e40ffe6rqjwD2GDjuv6Z：
- seq=10 reasoning: "Identifying missing nf_start tool"
- seq=12 text: "当前会话未提供 Normal Flow 必需的 nf_start..."
- 插件加载正常（bun import 验证 7 工具全部注册），工具确实在 LLM tool list 中。

**修复**（`src/agents/flow-agent.md`）：
- 新增"⚠️ 首要指令"段：明确告知 7 个工具已注册，不许声称不可用，直接调用。
- "铁律"第 1 条改为：不许声称工具不可用。
- "接到任务后的第一步"强化：不要输出文字、不要检查工具、直接调 nf_start。

**附带修复**：`~/.config/opencode/agents` 符号链接丢失（install.sh 对已有目录硬链接报错），
手动恢复。install.sh 需要改进（后续 issue）。

### 重构：skill agent 以 skill 为准

按 AGENTS.md 原则"agents/ 以 skill 为准，作为 skill 的 agent 方式调用"：

- **nf-designer.md**：删除重复的产出表、Gate 要求、纪律条款（这些都在 skill 里），
  改为薄包装：装 nf-design skill -> 按 skill 干活 -> 返回路径列表。
- **nf-attacker.md**：同样删除重复的 Gate 检查、攻击方法、P0/P1/P2 分级（都在 skill 里），
  改为薄包装：装 nf-attack skill -> 按 skill 干活 -> 返回报告路径 + P 计数。
- **nf-design/SKILL.md**：产出清单补充 Gate 最小字节数（intent 80 / design 150 / rules 100 / scenarios 100 / architecture 150）。
- **nf-attack/SKILL.md**：Gate 硬检查表补充"构建通过"和"git 有改动"两行（原先只在 agent 里有）。

### 验证

- tsc typecheck 通过（对 @opencode-ai/plugin 1.14.41 SDK 类型）。
- 插件 import 验证：7 个 nf_* 工具 + event hook 正常注册。
- 符号链接验证：agents/skills/plugins/tools 四个 symlink 均指向 src/。

## 2026-07-25 - Normal Flow 初版（agents 协调方法）

参考 `~/ws/cjpi` 的 normal-flow 扩展，移植到 opencode 的 plugin + agent + skill 模型。

### 新增

- **flow_agent**（`src/agents/flow-agent.md`）：主调度 agent，primary 模式。
  只允许 read/glob/grep + Task 派 subagent + 调 nf_* 控制器工具（write/edit/bash 全禁）。
  按控制循环推进：nf_observe -> nf_desired_state -> nf_difference -> 派 subagent -> nf_submit -> nf_advance。

- **两个 subagent**：
  - `nf-designer`（正向设计）：装 nf-design skill，产出真实设计文档到 `.nf/design/`。
  - `nf-attacker`（攻击/验证）：装 nf-attack skill，产出真实 `attack-report.md`。
  两者都有完整文件写入能力，但禁用 task 和所有 nf_* 工具（控制器归 flow_agent）。

- **两个 skill**（真实输出方法论）：
  - `nf-design`：意图锚/收敛决策/RXX 规则锚/正向+兜底场景/架构，带去 AI 味约束。
  - `nf-attack`：正向验证（证明跑通）+ 兜底攻击（证明拦得住）+ 反 sham 检查 + P0/P1/P2 分级。

- **controller + tools 插件**（`src/plugins/normal-flow/`）：
  - `runtime.ts`：`.nf/runtime.json` 是 SSOT，文件优先，每次读写落盘。
  - `controller.ts`：纯状态机 dispatch(command) -> {state, effects}，
    命令 = START/SUBMIT/ADVANCE/ROLLBACK/STOP/RESUME/RECORD_SIGNAL。
  - `stages.ts`：design/attack 两阶段，各带 desiredState + 真实硬 Gate。
  - `gate.ts`：自包含 gate helpers（requireGlobs/requireMinSize/runBuild/gitHasChanges）。
  - `tools.ts`：7 个 nf_* 工具（nf_start/nf_observe/nf_desired_state/nf_difference/nf_submit/nf_advance/nf_resume）。
  - `index.ts`：plugin 入口，注册工具 + `session.idle` 事件自动续跑 steering
    （等价 pi 的 sendUserMessage steer，用 client.session.promptAsync 发 synthetic 消息）。

- **install.sh**：symlink `src/{agents,skills,plugins,tools}` -> `~/.config/opencode`。

### 设计要点

- **正向和兜底**：design Gate 硬检查 scenarios.feature 必须含兜底场景关键词；attack Gate 硬检查报告必须有正向通过证据 + 兜底攻击证据 + 真实命令输出 + P1=0 声明。
- **controller 驱动 agent**：session.idle 钩子根据 stageOutcome 推导 steerText，自动发 synthetic 消息让 flow_agent 继续推进，不依赖 agent 自觉调工具。
- **反 sham**：attack skill 含存根/假实现 grep 检查；有命中 = P0。
- **平台中立迁移**：把 pi 的 InlineExtension(factory) + sendUserMessage(steer) 范式，
  映射到 opencode 的 Plugin(Hooks) + client.session.promptAsync(synthetic)。

### 验证

- tsc typecheck 通过（对真实 @opencode-ai/plugin 1.14.41 SDK 类型）。
- 控制器状态机 smoke test 通过：START->SUBMIT->ADVANCE->complete 全链路 + ROLLBACK 回退 + design Gate 真实文件检查。
- 插件加载 smoke test 通过：flat entry 只导出 default 函数（避免 opencode legacy loader 对非函数 export 抛错），返回 7 个工具 + event 钩子，工具 execute 正常。
