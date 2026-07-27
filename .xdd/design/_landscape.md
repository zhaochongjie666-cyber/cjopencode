# 业务线 Landscape — cjopencode

> 全局业务线全景索引。每条业务线有自己的 spec / architecture / wire / resilience 锚。
> 业务线编号 `BXX` 是 `.xdd/` 追踪标识（**不是代码目录名**），按 DDD 限界上下文（Bounded Context）划分。
> 本项目当前阶段：B01 单业务线（nfflow 架构升级），随着后续业务上线扩 B02/B03/...。

## 业务线清单

| BXX | slug | 名称 | 定位（1 句话） | 子域类型 | 状态 |
|-----|------|------|--------------|---------|------|
| B01 | nfflow-upgrade | nfflow 架构升级 | 把 nfflow 从「设计 → 攻击 → 验收」3 阶段升级为「探索设计 → 代码实现 → 验收」3 阶段 + 3 反思 + 新增 nf-builder agent；nfflow 跟 xdd-flow 并存于 `.xdd/` 共享 RXX | 核心（流程编排平台差异化） | ⏳ 设计层产物填充中 |
| B01-default | default | 默认业务线占位 | xdd-init 生成的占位目录，无实际业务含义 | - | 占位（待业务实化时重命名） |

> **B01 与 B01-default 的关系**：B01-nfflow-upgrade 是本项目（cjopencode）当前真正在做的业务线；B01-default 是 xdd-init scaffold 留下的默认占位目录（业务线 ID 编号相同但 slug 不同），不冲突。

## 子域类型判定

| 子域类型 | 含义 | 投入策略 |
|---------|------|---------|
| **核心** | 差异化竞争力 | 重点 DDD 建模，规则严密，长期演进 |
| **支撑** | 必要但非差异化 | 简化做，能买现成就买现成 |
| **通用** | 行业通用 | 复用一个事件 example / 横切基础 |

**B01-nfflow-upgrade = 核心**：nfflow 流程编排是 cjopencode 的核心差异化能力（跟 xdd-flow 形成两种调度粒度），必须严守 RXX 规则 + 反 sham 底线。

## 业务线锚定路径

### B01-nfflow-upgrade

| 锚层 | 路径 | 状态 |
|------|------|------|
| spec 业务描述 | `.xdd/design/spec/B01-nfflow-upgrade/business.md` | ✅ |
| spec 规则清单 | `.xdd/design/spec/B01-nfflow-upgrade/rules.md` | ✅ |
| spec Gherkin | `.xdd/design/spec/B01-nfflow-upgrade/scenarios.feature` | ✅ |
| architecture | `.xdd/design/architecture/B01-nfflow-upgrade/architecture.md` | ✅ |
| architecture 流程图 | `.xdd/design/architecture/B01-nfflow-upgrade/flow.mermaid` | ✅ |
| wire | （跳过：本业务线无前端，纯后端 sdk/tool） | - |
| resilience | `.xdd/design/architecture/B01-nfflow-upgrade/resilience/`（下一轮 xdd-resilience 跑） | ⏳ |
| plan | `.xdd/runs/xdd_run/plan/B01-nfflow-upgrade/plan.md`（下一轮 xdd-plan 跑） | ⏳ |

## 跨业务线主题

### 1. RXX 编号共享

- **项目级共享 RXX 编号空间**（按 `Bxx-slug` 隔离）
- nfflow 跟 xdd-flow 都消费同一份 `.xdd/design/spec/{Bxx-slug}/rules.md`
- 改一条 RXX → 通知 xdd-flow 同步（同 project 内 cross-flow 调用）

### 2. 目录约定

- **nfflow 设计产物**：`.xdd/design/`（跟 xdd-flow 同目录）
- **nfflow 运行报告**：`.xdd/runs/nf_run/`（跟 xdd-flow 的 `.xdd/runs/xdd_run/` 平级隔离）
- **xdd-flow 设计产物**：`.xdd/design/`
- **xdd-flow 运行报告**：`.xdd/runs/xdd_run/`

### 3. 失败日志共享

- 复用 `.xdd/runs/xdd_run/failure-log.md`（nfflow 跟 xdd-flow 共享失败日志文件，按流名前缀区分条目）
- 避免目录冗余

### 4. Agent 命名隔离

- nfflow：`nf-*` / `flow-agent` / `e2e-tester`
- xdd-flow：`xdd-*` / `xdd-flow` / `xdd-build` / `xdd-verify` / `xdd-brainstorm` / ...
- 两套不重用

### 5. 跨业务线一致性 checklist（status.md 末尾）

- [ ] **术语**：agent / skill / 阶段名 / Reflect Attack vs xdd-verify 区分清晰
- [ ] **API 命名**：nfflow 内部 subagent 入口（agent call）不暴露 HTTP，统一用 `Task(subagent_type=..., prompt=...)` 模式
- [ ] **错误码**：nfflow 报告用 `P0/P1/P2` 三档（区别于 xdd-flow 的 verify-report.md 表格）
- [ ] **auth**：nfflow 跑在用户本地（CLI/IDE），鉴权由 opencode 平台托管，无需单建
- [ ] **审计**：每阶段报告 + 反思报告都落 `.xdd/`，可被 `git log` + `wc -c` 双重追溯
- [ ] **multi-tenant 隔离**：nfflow 是单用户工具，不存在多租户分问题

## 跨业务线关系图（context-map）

```
B01-nfflow-upgrade (核心)
  │
  ├── 共享内核 ───────────► .xdd/design/（spec + architecture 共目录）
  │                          ─────  RXX 编号按 Bxx-slug 隔离
  │
  ├── 报告隔离 ───────────► .xdd/runs/nf_run/  （自己）
  │                       ─► .xdd/runs/xdd_run/（xdd-flow）
  │
  └── 失败日志共享 ────────► .xdd/runs/xdd_run/failure-log.md
                              ─────  按流名前缀区分条目
```

## 业务线演化路径

- **当前**：B01 单业务线（nfflow 架构升级）
- **下一步**：extract nfflow 业务线到 B02（如果未来 nfflow 本身要拆分模块化）
- **预留**：xdd-flow 升级若是单独项目可挂 B02-xdd-flow-evolution

> **演化原则**：单→多演进零重构。永远以 BXX 编号追踪，业务线扩展不破坏现有锚。
