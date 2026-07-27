---
name: nf-design
description: >
  Normal Flow 正向设计 skill。nf-designer 装本 skill 跑 5 件设计产物到 .xdd/design/。
  产物路径统一，RXX 编号项目级共享。
  装本 skill 后，nf-designer 严格按本 skill 的产出清单 + Gate 标准执行。
---

# nf-design · 正向设计方法论

## 本 skill 做什么

把用户意图固化成可被攻击阶段直接消费的设计链。设计是**冻结契约**，attack 阶段照着它验证，所以设计缺口会直接变成实现缺口。

## 产出清单（写到 `.xdd/design/`，括号内为 Gate 最小字节数）

| 产物 | 路径 | 字节阈值 | 关键标注 |
|------|------|---------|---------|
| intent.md | `.xdd/design/intent.md` | ≥ 80 | 「意图」「目标」 |
| design.md | `.xdd/design/design.md` | ≥ 150 | 「Selected」 |
| rules.md | `.xdd/design/spec/{Bxx-slug}/rules.md` | ≥ 200 | `R[0-9]{2}` ≥ 7 条 |
| scenarios.feature | `.xdd/design/spec/{Bxx-slug}/scenarios.feature` | ≥ 500 | `@covers R[0-9]{2}` 每 RXX ≥ 1 |
| architecture.md | `.xdd/design/architecture/{Bxx-slug}/architecture.md` | ≥ 200 | 端点 / 事件 / 数据 / 依赖 4 关键词 |

**RXX 编号空间**：项目级共享（按 `Bxx-slug` 隔离，跨业务线引用必须带 `Bxx-RXX` 全名）。

## Gate 5 条硬检查（按 architecture §5）

1. **产物真实落盘**：`stat` 5 件产物返回真实文件
2. **字节数达标**：5 件产物 `wc -c` ≥ 阈值（见上表）
3. **关键 grep 命中**：
   - rules.md 含 `R[0-9]{2}` ≥ 7 处
   - scenarios.feature 含 `@covers R[0-9]{2}` ≥ 7 处
   - architecture.md 含「端点 / 事件 / 数据 / 依赖」4 关键词
4. **存根检测**：扫描「占位符」（如「TODO」/「待定」之类）
5. **commit 追溯**：设计阶段无 commit（跳过）

## 怎么写

### 1. intent.md（意图锚）

回答四个问题，不要套话：
- **做什么**：一句话能说清的产品目标（不是"构建一个高效系统"这种废话）
- **为什么**：现在没这个会怎样、谁在痛、痛成什么样
- **成功标准**：做完后怎么判断成了（可观察：能跑、能查、能用，带数量）
- **不做什么**：明确划出边界，这次不碰什么

### 2. design.md（收敛决策）

- **用户旅程**：从开始到结束用户走哪几步，每步看到什么、能做什么
- **业务流程**：端到端怎么流转，谁触发、谁审批、数据怎么落
- **取舍**：哪个方案选了、为什么、放弃了什么。不要"各有优缺点应根据实际情况选择"

### 3. spec/rules.md（规则锚 RXX）

从能力提取规则，编号 `R01`、`R02`... 每条规则：
- **ID**：R01
- **描述**：一句话规则
- **正向**：满足时是什么行为
- **兜底**：违反/异常时怎么处理（这一栏不许空 -- 兜底也是规则）

例：
```
R03 用户登录
- 正向：凭正确账号密码登录，返回 token，有效期 2h
- 兜底：密码错误返回 401，连续 5 次错误锁定 15min；账号不存在返回 401（不泄露是否存在）
```

### 4. spec/scenarios.feature（Gherkin 场景）

**正向和兜底都要写**。Gate 会硬检查兜底关键词（失败/拒绝/无权限/边界/超时）。

```gherkin
Feature: 用户登录
  # 正向
  Scenario: 正确密码登录
    Given 用户 user1 已注册
    When 用正确密码登录
    Then 返回 200 和 token
    And token 在 2h 后过期

  # 兜底 -- 必须有
  Scenario: 密码错误
    When 用错误密码登录
    Then 返回 401
    And 不返回 token

  Scenario: 连续错误锁定
    Given 连续 4 次密码错误
    When 第 5 次用错误密码登录
    Then 返回 429
    And 账号锁定 15min

  Scenario: 无权限访问
    Given 未登录
    When 访问 /api/profile
    Then 返回 401
```

每个 Scenario 用 `# @covers R03` 标注对应规则，建立追溯。

### 5. architecture.md（架构）

- **模块划分**：解耦的模块列表，每个模块职责单一、可单测
- **端点**：API 端点列表（方法 + 路径 + 入参 + 出参 + 对应 RXX）
- **事件**：模块间怎么通信（同步调用/事件/消息）
- **数据存储**：用什么库、关键表/集合、migration 策略
- **依赖**：外部依赖列表 + 降级策略（依赖挂了怎么办）

## 去 AI 味（必须遵守）

禁止的 AI 痕迹：
- 开头"随着...不断发展"、"在当今...背景下"
- "首先/其次/再次/最后"的机械列举
- "高效/智能/全面/赋能/闭环/生态/深度融合"等营销词
- "各有优缺点，应根据实际情况选择"这种没立场的废话

必须做到：
- 抽象词改具体事实：谁做了什么、什么场景、什么数量
- 有明确判断和取舍：什么最重要、哪种方案更好、为什么
- 加真实语境：团队人数、已有系统限制、时间成本约束
- 营销词换动作词："赋能业务" -> "减少人工审核"

判断标准：有具体细节 + 有明确取舍 + 有真实限制 + 有作者判断 = 没有 AI 味。

## 自检（提交前过一遍）

```
□ intent.md 有可观察的成功标准（带数量），不是套话
□ design.md 有用户旅程和取舍，不是功能罗列
□ rules.md 有 R01..编号，每条都有兜底栏
□ scenarios.feature 有兜底场景（失败/拒绝/无权限/边界）
□ architecture.md 有模块/端点/事件/数据存储
□ 每个场景标注了 @covers RXX
□ 没有 AI 味
```

自检通过后，把文件路径列表返回给 flow_agent。
