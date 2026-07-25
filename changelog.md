# Changelog

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
