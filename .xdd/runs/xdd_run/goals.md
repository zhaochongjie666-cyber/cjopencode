# Goals — xdd_run

> 本 run 要达成的高层目标。由 **xdd-brainstorm** 生成并分配 G 编号（来自 intent.md「成功标准」）。
> ACK 的 G 区指向下表 G 编号（高层目标）；T 区指向 plan task（见 runs/xdd_run/plan/{bxx-slug}/plan.md，goal 的 TDD 分解）。

| G | 目标 | 状态 | 来源 |
|---|------|------|------|
| G1 | nfflow 三阶段闭环能跑通 -- 用 nfflow 跑一个端到端任务，从「探索设计」→「代码实现」→「验收」，每阶段产物真实落盘 | ⏳ | intent.md 成功标准 1 |
| G2 | 每阶段反思攻击能拦截问题 -- 阶段 1 / 2 / 3 后各跑一次反思攻击，能拦出（a）设计缺陷（b）实现 bug（c）验收漏测 三类问题 | ⏳ | intent.md 成功标准 2 |
| G3 | 新增 nf-builder agent 装 skill 干活 -- 装 xdd-execute + xdd-cleanup，依据 architecture.md + rules.md + scenarios.feature 写真实代码 + @implements RXX + 全测试 PASS | ⏳ | intent.md 成功标准 3 |
| G4 | nfflow 跟 xdd-flow 在 `.xdd/` 下协作 -- nfflow 设计产物落到 `.xdd/design/`（项目级共享 RXX 编号），报告隔离到 `.xdd/runs/nf_run/`；xdd-flow 用 `.xdd/design/` + `.xdd/runs/xdd_run/`。两套流程编排粒度不同（nfflow 3 阶段 + 3 反思 vs xdd-flow 8 节点）但目录同源 | ⏳ | intent.md 成功标准 4 |
| G5 | flow-agent.md 主调度能用 -- todowrite 6 节点状态机 + 回退表覆盖「反思 N 发现阶段 M 根因」 + 回退预算 ≤ 8 次 | ⏳ | intent.md 成功标准 5 |
