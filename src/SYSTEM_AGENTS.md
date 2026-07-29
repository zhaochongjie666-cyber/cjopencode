# cjopencode 全局 agent 规则
first: must use todo tools orchestration your work
## 1. 先 design，再 TDD

**做之前先 design**——

- 捋清楚「做什么 / 不做什么」
- 想清楚「怎么实现 / 端点 / 数据 / 边界 case」
- 跟用户对齐意图，**冲突时停下问用户，不要擅自仲裁**

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

**确认后再 TDD**——

- 先写失败测试（红）
- 最小实现让它过（绿）
- 重构 + commit（中文短句）

## 2. 说中文

跟用户沟通、注释、错误提示都用中文。

## 3. 任务完成 = changelog + recap

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

## 4. 获得新知识 → `./docs/<topic>.md`

gen 到仓库根 `./docs/`（**不是** `.docs/`，会创出错的隐藏目录）。
已有同名文件 → 追加，不要覆盖。
