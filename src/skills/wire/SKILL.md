---
name: wire
description: |
  xdd 业务版 wire design。复用通用 wire-design skill（必装），加 xdd 特定约定。
  产出 .xdd/design/wire/{page}.md，回指 RXX。
  触发：xdd 设计层 wire / 前端线框，跟 xdd-flow 配套使用。
---

# wire · xdd 业务版 wire

> 通用方法论见 `wire-design` skill（**先装**，再读本文件）。
> 本文件只记 xdd 特定约定。

## 必装上游 skill

```
use skill: wire-design    # 通用 web wire 方法论（设计哲学 + 用户关注点 + 5 类模板 + 9 态）
```

通用层负责：SVG 基础规范 / 设计哲学 6 条 / 用户关注点 5 问 / 5 类数据页模板 / 9 操作态 / 反 sham 自检 8 条。

本文件（wire）只补充 xdd 特有：上下游绑定 + 路径约定 + RXX 溯源 + xdd 自检清单。

## xdd 上下游绑定

| | |
|---|---|
| **上游** | `brainstorm`(intent.md) + `spec`(RXX + Feature 页面名/交互/角色) |
| **我产出** | `.xdd/design/wire/{page}.md`（含 SVG 布局 + 元素清单 + 9 操作态 + Review） |
| **下游** | `plan`（前端 task）、`verify`（页面渲染验收） |
| **回溯锚** | 元素清单里标 `@covers-RXX` |

## xdd 路径约定

```
.xdd/design/wire/
├── _pages.md                  ← 页面清单（可选，也可写在第一个页面顶部）
├── tasks.md                   ← 每页一个 .md
├── login.md
└── ...
```

`{page}.md` 名用小写连字符（kebab-case）。

## xdd 自检清单（在 wire-design 8 条之上叠加）

```
[xdd 特有 6 条]
□ 每页 .md 顶部 `@covers-RXX,RXX,...` 标注？
□ 元素清单覆盖 RXX（无凭空元素，每个元素对应规则）？
□ 混淆元素 4 类 A/B/C/D 全扫（A 视觉 / B 语义 / C 交互 / D 内容）？
□ Review Q1-Q5 逐条回答（写在文件底部）？
□ 可见文字无 em-dash（-）（用「—」或换措辞）？
□ design/ 产物不引用 xdd_run（design 是长期锚，不混当前 run）？

[wire-design 8 条]
□ 5 问已答（角色 / 关注 / 动作 / 决策 / 带宽）？
□ 角色差异已标（同页不同角色视图）？
□ 主按钮最多 3 个（> 3 = 用户选择困难）？
□ 异常高亮置顶（> 第一屏顶部）？
□ 5s 首屏可懂（标题 + 面包屑 + hero metric）？
□ 无装饰按钮（每个按钮都映射到 Q3 主动作）？
□ 数字三要素齐（单位 + 时间范围 + 对比基准）？
□ 无 14 列堆叠（关注点超载警告）？
```

## 跟通用层的产出差异

通用 wire-design 的 wire 文档 vs wire 的 wire 文档，关键差异：

| 维度 | 通用 wire-design | wire（叠加） |
|------|------------------|------------------|
| 路径 | 任何 `{project}/docs/wire/` 或类似 | `.xdd/design/wire/`（业务规范） |
| 元素追溯 | 可选 `@covers-{bxx}-RXX` | 必须 `@covers-RXX`（按 Bxx-slug 隔离） |
| 自检 | 8 条关注点层 | 8 + 6 = 14 条（叠加） |
| 上下游 | 无绑定 | 显式绑定 brainstorm/spec/plan/verify |

**关键不变量**：通用设计哲学（6 条 + 5 问 + 5 类模板 + 9 态）完全一致，仅附加 xdd 业务约束。

## 跟其他 xdd skill 的配合

| 阶段 | xdd skill | 产出 |
|------|-----------|------|
| 设计·理解 | brainstorm | intent.md |
| 设计·规格 | spec | spec/{Bxx-slug}/rules.md + scenarios.feature |
| 设计·架构 | architecture | architecture/{Bxx-slug}/ + flow.mermaid |
| **设计·前端** | **wire** | **wire/{page}.md** ← 你在这 |
| 设计·韧性 | resilience | resilience/{Bxx-slug}/ |
| 桥接·计划 | plan | plan/{Bxx-slug}/plan.md |
| 代码·实现 | execute | 代码 @implements RXX |
| 代码·验证 | verify | verify-report.md |

## references/

- `operation-states.md` — 6 态方法论（xdd 特有，补充通用 9 态）
- `ux-review.md` — Q1-Q5 Review 深度方法
- `references/examples.md`（继承自 wire-design）— SVG 案例库