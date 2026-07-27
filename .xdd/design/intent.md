# 意图锚 — cjopencode（nfflow 架构升级）

> 用户为什么做这次升级？要解决谁的什么问题？不行的话现状痛在哪？
> 这一层是**用户审的契约**——确认对齐才往下。xdd-brainstorm 填。

## 一句话

把 nfflow 从「**设计 → 攻击 → 验收**」3 阶段升级为「**探索设计 → 代码实现 → 验收**」3 阶段，每阶段后接一次横向**反思攻击**，并新增 `nf-builder` agent 承担代码实现；nfflow 跟 xdd-flow 并存独立。

## 现状痛点

**nfflow（轻量版）当前 3 阶段**：design（nf-designer） → attack（nf-attacker） → e2e（e2e-tester）。
- **缺中间"代码实现"阶段**：designer 写完 design.md / rules.md / architecture.md / scenarios.feature 后，**没有任何 subagent 把这些设计变成可运行的代码**。结果是 attack 阶段攻击的是"设计文档"，不是"真实运行的应用"，e2e 阶段没有可测的应用可点。
- **attack 是独立阶段，不是反思动作**：当前 attack 出现位置 = design 之后，所有攻击都打向"设计"，无法拦截"实现 bug"和"验收漏测"两类问题。回顾 session c3692b46 的教训（60 端点只实施 23 = 38% 蒙混），attack 必须变成每阶段的反射性自检，而不是一次性的大审判。
- **没有 @implements RXX 链路**：nfflow 的 RXX 规则写到 `.xdd/design/spec/{Bxx-slug}/rules.md` 就停了，没有代码层回指，意图和实现断开。

**xdd-flow（完整版）现状**：brainstorm → spec → architecture → wire → resilience → plan → execute → verify（8 节点），用 `xdd-build` agent 装 `xdd-execute` + `xdd-cleanup` 跑 TDD + 写代码。完整但重，对小项目是负担。

## 成功标准

1. **三阶段闭环能跑通**：用 nfflow 跑一个端到端任务，从「探索设计」到「代码实现」到「验收」，每阶段产物真实落盘、可被 read 抽查。
2. **每阶段反思攻击能拦截问题**：阶段 1 / 2 / 3 后各跑一次反思攻击，至少能拦出（a）设计缺陷（兜底场景缺失）、（b）实现 bug（@implements RXX 缺失 / 端点 sham）、（c）验收漏测（用户旅途走不通）三类问题中的一种。
3. **新增 nf-builder agent 装 skill 干活**：依据 architecture.md + rules.md + scenarios.feature 写出真实代码（无存根 / 无假实现），代码用 `@implements RXX` 回指规则，全测试通过，跑通 curl/截图证据。
4. **跟 xdd-flow 在 `.xdd/` 下协作**：nfflow 设计产物合并到 `.xdd/design/`（项目级共享 RXX 编号），报告隔离到 `.xdd/runs/nf_run/`（跟 xdd-flow 的 `.xdd/runs/xdd_run/` 平级）；xdd-flow 用 `.xdd/design/` + `.xdd/runs/xdd_run/`。两套**流程编排粒度不同**（nfflow 3 阶段 + 3 反思 vs xdd-flow 8 节点），但**目录同源、RXX 编号共享**。
5. **flow-agent.md 主调度能用**：todowrite 6 节点状态机，回退表覆盖「反思 N 发现阶段 M 根因」的情形，回退预算 ≤ 8 次。

## 非目标（不做什么）

- **不动 xdd-flow**：xdd-flow 的 8 节点链路、`xdd-build` agent、`xdd-execute`/`xdd-cleanup` skill 全部保留不动。本轮不与 nfflow 整合。
- **不重构 nf-design / e2e-test skill**：保留现状，仅靠 flow-agent 调度把它接进新 3 阶段。
- **不在 src/agents/ 下写代码**：本轮只产出 `.xdd/design/intent.md` + `design.md`，不修改 flow-agent.md / nf-designer.md / nf-attacker.md / e2e-tester.md / nf-builder.md 等 agent 文件——这些是后续 xdd-spec / xdd-plan / xdd-execute 的产出。
- **不预写 stages**.mk / 配置文件 / Docker / CI 之类：架构升级是 flow 编排层的事，跟运行时基础设施无关。
- **不绑定前端/后端技术栈**：nfflow 保持跟 xdd-flow 同等的栈中立，由 architecture + scenarios.feature 决定具体技术。
