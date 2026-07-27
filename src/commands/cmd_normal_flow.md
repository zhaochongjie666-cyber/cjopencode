---
description: nfflow 6 节点流程任务入口（设计/反思/实现/反思/验证/反思，失败回炉重做）
---

# nfflow 6 节点任务执行

用户任务：$ARGUMENTS

按以下 6 节点流程执行（调什么 skill / 派什么 sub-agent 由你决定）：

## 阶段 1 · 探索设计
- 派 `nf-designer` 跑探索设计
- 产出：`.xdd/design/intent.md` + `design.md` + `spec/{Bxx-slug}/{business.md, rules.md, scenarios.feature}` + `architecture/{Bxx-slug}/architecture.md`
- Gate 5 条不通过 → 回炉本阶段

## 反思 #1 · 反击设计
- 派 `nf-attacker` (stage=design) 跑 5 段方法（构建/正向/兜底/反 sham/问题清单）
- 产出：`.xdd/runs/nf_run/reflect-attack-design-report.md`
- P0=0 才进阶段 2；P0≥1 → 回炉阶段 1

## 阶段 2 · 代码实现
- 派 `nf-builder` 跑 TDD（装 `xdd-execute` + `xdd-cleanup`）
- 写代码 `@implements RXX` + 测试
- 产出：`.xdd/runs/nf_run/build-report.md` + `code-review.json`（verdict=pass）
- no-stub-check 零命中 + 全测试 PASS 才进反思 #2

## 反思 #2 · 反击实现
- 派 `nf-attacker` (stage=build) 跑 5 段方法 + 验证反思#1 的 P0 已修
- 产出：`.xdd/runs/nf_run/reflect-attack-build-report.md`
- P0=0 才进阶段 3；P0≥1 → 看根因（设计/实现）回炉

## 阶段 3 · 验收
- 派 `e2e-tester` 跑浏览器 E2E
- 产出：`.xdd/runs/nf_run/e2e-report.md` + `screenshots/*.png`
- 用户旅途走通 + 截图 ≥ 4 张才进反思 #3

## 反思 #3 · 反击验收
- 派 `nf-attacker` (stage=acceptance) 跑 5 段方法 + 验证反思#1+#2 的 P0 已修
- 产出：`.xdd/runs/nf_run/reflect-attack-acceptance-report.md`
- P0=0 + P1=0 才算流程完成；否则 → 回炉根因层

## 回炉重做规则
- 反思#N 发现 P0 → 看根因层（设计/实现/验收）→ 重派对应阶段 sub-agent
- 同一阶段连续 3 次回退 → 阶段预算耗尽 → 用 `question` 工具问用户
- 全局 8 次回退预算 → 用 `question` 工具问用户
- 反思#1 → #2 → #3 同 `nf-attacker` 续接（保留前序 P0 列表）
- 阶段切换 / 阶段与反思之间不续接

## 报告收集
流程完成后摘要：
- 交付物路径清单
- commit 列表（`git log --grep 'RXX' --oneline`）
- 反思攻击 P0/P1 统计（3 份 report）
- 关键证据链接（curl / 截图 / test 输出）