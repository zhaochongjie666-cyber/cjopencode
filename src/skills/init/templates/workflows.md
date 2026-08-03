# Workflows — 工作流清单（ACK W 区索引源）

> 回复开头的 ACK `%>R.. G.. T.. W..%` 的 **W 区**指向下表 W 编号。
> 默认列 XDD 8 节点；项目可自定义组合 —— **改本文件 = 改本项目认可的工作流**。

| W | 工作流 | skill | 产出 |
|---|--------|-------|------|
| W1 | 理解意图 | brainstorm | intent.md + design.md |
| W2 | 规则 | spec | spec/{bxx-slug}/rules.md |
| W3 | 架构 | architecture | architecture/{bxx-slug}/ |
| W4 | 前端 | wire | wire/{page}/ |
| W5 | 韧性 | resilience | architecture/{bxx-slug}/resilience/ |
| W6 | 计划 | plan | plan/{bxx-slug}/plan.md |
| W7 | 实现 | execute | 代码 @implements RXX |
| W8 | 验证 | verify | verify-report.md |

<!-- 自定义工作流组合（可选）：在下追加项目专属流程，ACK 的 W 区就能指到，如
| W9 | 安全扫描 | （自定义）| security-report.md |
| W10 | 性能压测 | （自定义）| perf-report.md |
-->
