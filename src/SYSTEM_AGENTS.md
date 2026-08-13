# cjopencode 全局 agent 规则
first: must use todo tools orchestration your work

平台设计规矩：页面表头（Header），遵循 GitHub、Linear、Atlassian、Datadog 等高信息密度 SaaS 后台设计。Header 仅保留面包屑、页面标题、核心操作按钮，整体高度控制在 60~100px。所有统计信息采用紧凑 KPI Bar（40~48px），搜索、筛选、排序、刷新等统一放入 Toolbar（48px），避免大面积留白。页面打开后首屏必须展示至少 10~15 行 Table，以数据为主体而非 Header。统一所有页面 Header、Toolbar、KPI 的布局、间距、按钮位置和视觉风格，减少装饰元素，提高信息密度、操作效率和一致性，使页面更专业、更紧凑、更符合企业级后台产品设计规范。

## 1. 先 design，再 TDD

**做之前先 design**——

- 捋清楚「做什么 / 不做什么」
- 想清楚「怎么实现 / 端点 / 数据 / 边界 case」
- 默认充分自主推进并完成决策，**仅在存在冲突时才停下询问用户，不要擅自仲裁**

**design 必须把以下文档真实落到磁盘**（不只在脑子里想）：

| 产物 | 路径模板 | 用途 |
|------|---------|------|
| 意图锚 | `.xdd/design/intent.md` | 用户为什么做、成功标准 |
| 设计决策 | `.xdd/design/design.md` | 收敛方案、用户旅程、取舍 |
| 业务规则 | `.xdd/design/spec/{Bxx-slug}/rules.md` | RXX 编号 + 正向/兜底 |
| Gherkin 场景 | `.xdd/design/spec/{Bxx-slug}/scenarios.feature` | 正向 + 异常场景 + `@covers RXX` |
| 架构 | `.xdd/design/architecture/{Bxx-slug}/architecture.md` | 端点 / 事件 / 数据 / 依赖 |
| 流程图 | `.xdd/design/architecture/{Bxx-slug}/flow.mermaid` | 状态机 / 流程 |
| 前端线框 | `.xdd/design/wire/{page}.md` | SVG 嵌入 markdown |
| 韧性 | `.xdd/design/architecture/{Bxx-slug}/resilience/` | 失败模式 + 兜底 + 恢复剧本 |

每条规则都有 RXX + Feature 覆盖；每个端点有契约；每个用户旅程有 wire；
没落到磁盘 = 没 design 完。

**TDD**——
- 先写失败测试（红）
- 最小实现让它过（绿）
- 重构 + commit（中文短句）

## 2. 复杂任务走 llm_* 工作流

非平凡任务（多步、要写代码/写文档、要改多文件）默认走 `llm_*` 工作流——
**动手前先用 `llm_understand_task` 拆解，关键转折用 `llm_reflect_midway` 自省，交付前用 `llm_assess_progress` 验收**。
`llm_switch_role` 在切下一条 todo 时定位角色与颗粒度操作清单，
`llm_cross_audit` 用于关键交付前的交叉质疑，`llm_reflect` 是通用独立推理。

**平凡任务例外**：单值查询、单文件小改、读文件查一个字段等——直接做，别走流程。
**`cj` agent 例外**：`src/agents/cj.md` 已自带更严的「理解 → 执行 → 中途反思 → 收尾评估」节奏，仍按 cj 的规则走（更严不冲突）。

| 工具 | 触发时机 | 关键参数 | 产出结构 |
|------|---------|---------|---------|
| `llm_understand_task` | 动手前 | `task_description` + 可选 `context_or_exploration` | 目标 / 要求 / 约束 / 验收标准 / 关键问题 / 可行性判断 |
| `llm_reflect_midway` | 歧义 / 关键转折 / 偏离感 | `current_situation` + 可选 `original_goal` / `concerns` | 路径评估 / 偏差检测 / 隐藏风险 / 备选方案 / 调整建议 / 置信度 |
| `llm_switch_role` | 切到下一条 todo 前 | `current_todo` + 可选 `previous_todo` / `todos_overview` / `task_overall` | 当前角色 / 核心目标 / 细节操作清单 / 上下游衔接 / 易犯的错 / 完成判据 |
| `llm_cross_audit` | 关键交付前 / 外部质疑 | `content` + 可选 `auditor_count`（2-6） | 多个独立审计视角 + 综合与交叉质疑 |
| `llm_reflect` | 任意独立推理 | `context` + 可选 `instruction` | 按 instruction 输出 |
| `llm_assess_progress` | 交付前 | `task_understanding` + `current_state` + 可选 `artifacts` | 完成度 / 已满足验收 / 未满足验收 / 质量风险 / 下一步 / 交付判定 |

**默认节奏**：`llm_understand_task → (work, 中途可多次 llm_reflect_midway / llm_switch_role) → llm_assess_progress`，
判定「可交付」才结束。`llm_cross_audit` 可在任何需要交叉质疑的节点单独调用。
工具细节定义见 `src/plugins/llm-tools.ts`。

## 3. 说中文

跟用户沟通、注释、错误提示都用中文。

## 4. 任务完成 = changelog + recap

`changelog.md` 顶部插一条：

```
## YYYY-MM-DD HH:MM:SS - <一句话标题>

### 变更
<文件 + 操作>

### 关键决策
<为什么这样做>

### 验证 / 反 sham
<怎么证明做对了>

### 遗留事项
<已知 / 下一步>
```

recap 给用户：**做了什么 / 关键决策 / 下一步**。

## 5. 获得新知识 → `./docs/<topic>.md`

gen 到仓库根 `./docs/`（**不是** `.docs/`，会创出错的隐藏目录）。
已有同名文件 → 追加，不要覆盖。

## 6. 可移植性优先，避免 hack

动手前先问一句「**这台机器跑没问题，换一台就挂吗？**」。能跨主机 / 跨 OS / 跨 shell
稳定运行的方案才合格。常见的 hack 形态（出现任一就要警觉）：

- 硬编码绝对路径（`/home/zhaocj/...`、`C:\\Users\\xxx\\...`、`~/Desktop/...`）——其他用户/机器必挂
- 依赖当前主机的特定 shell（bash 独有的语法/扩展 / PowerShell 别名 / `which` 路径差异）
- 假设某个工具的特定版本已装（不指定版本、不锁 manifest）
- 假设某个环境变量已存在（不读就崩）
- 把本机调试残留写进产物（`/tmp/xxx` 硬路径、`localhost` 绑定、调试端口固化）
- 把 Windows 风格路径写进 shell 命令（`source C:\Users\...\foo.sh` 在 bash 里跑不通）

**正确做法**：

- 路径全部相对仓库根 / 用 `${VAR}` / 走 opencode 的标准目录（`~/.config/opencode/...`）
- 跨平台 shell 兼容：脚本优先 bash POSIX 语义、必要时写 `#!/usr/bin/env bash` shebang；能用 JS/Python 跨平台调用就别依赖 shell
- 依赖钉版本（`package.json` / `requirements.txt` / `bun.lock`），CI/其它机器复现一致
- 环境变量先 `process.env.X ?? "default"` 兜底再读，不假设存在
- 调试残留用 git stash / .gitignore 隔离，别混进 commit
- 跨平台产物路径：用 `path.join` / `path.resolve` 而非字符串拼接

**验证**：写完后实际跑一遍「在我这里能跑通，**换另一台容器/另一台机器也跑通**」的检查；
若只在本机 OK、其他环境必挂，立刻重写而不是补补丁。
