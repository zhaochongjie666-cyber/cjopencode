# B01-nfflow-upgrade — 兜底设计（Failsafe Design）

> nfflow 6 节点流程编排平台的兜底设计。
> 10 兜底模式（业务流程编排场景 + 业务特有补充） + 映射到 `failure-modes.md` 的 F01~F33。
> 编排系统特有：**业务对账**（跨产物一致性）+ **业务幂等**（task_id 续接幂等 / 报告半成品幂等）。
> 每条 FXX 至少 1 个兜底模式（**覆盖率 100%**）。

## 10 兜底模式总览

| # | 模式 | 适用场景 | 实现位置 |
|---|------|---------|---------|
| 1 | 熔断 Circuit Breaker | 阶段预算耗尽 / 全局预算耗尽 / 续接循环 | flow-agent state machine (`flow-agent.md`) |
| 2 | 降级 Degradation | context window 超限 / 磁盘满 / 编译 OOM | flow-agent dispatcher / nf-builder / nf-attacker |
| 3 | 补偿 Compensation | subagent 写一半挂 / 报告半成品 / commit 冲突 | flow-agent rollback dispatch |
| 4 | 重试 Retry w/ backoff | 平台 5xx / skill 临时装不上 / hook 拒 | flow-agent dispatcher |
| 5 | 限流 Rate Limit | 用户高频改需求 / 多任务并发 | flow-agent lock manager |
| 6 | 背压 Backpressure | 磁盘满 / 平台 5xx 队列积压 | flow-agent queue |
| 7 | 隔离 Bulkhead | nfflow vs xdd-flow 隔离 / 反思#3 兜底 | 文件路径 layout (`architecture.md §14`) |
| 8 | 幂等 Idempotency Key | task_id 续接 / 报告半成品 / 用户 Ctrl-C | flow-agent handoff + status.md |
| 9 | 超时 Timeout | subagent 跑太久 / question 工具不响应 | flow-agent dispatcher |
| 10 | 健康检查 Health Check | flow-agent 启动前环境检查 | flow-agent bootstrap |
| 11 | 业务对账 Reconciliation *(业务特有)* | rules.md / scenarios.feature / architecture.md / flow.mermaid 一致性 | flow-agent cross-doc check |
| 12 | 业务幂等 *(业务特有)* | task_id 续接幂等 / 报告路径幂等 | flow-agent handoff + status.md |

## 1. 熔断 Circuit Breaker

- **触发条件**：循环无法收敛（subagent 反复产生相同 P0 / 续接不识别 / 预算是死亡开关）
- **实现位置**：`flow-agent.md §state-machine` + `failure-log.md` 累计回退计数
- **标签**：`@failure-mode-F17`, `@failure-mode-F18`, `@failure-mode-F19`, `@failure-mode-F07`

**熔断器状态**：
```
CLOSED（正常） ──rollback_counter ≥ 8 ──> OPEN（熔断）
                                              │
                                              ↓
                       HALF_OPEN（用户介入后手动重置） ──> CLOSED
```

**熔断触发清单**：
- F17 阶段预算耗尽（`staging_counter[stage1] ≥ 3`）→ 熔断阶段1 subagent（停止续接）+ question 问用户
- F18 全局预算耗尽（`rollback_counter ≥ 8`）→ 熔断整个流程（永久 OPEN）
- F19 续接 P0 重复触发 → 熔断续接 + 强制重派新 subagent
- F07 context window 超限 → 熔断续接（不续接）+ 降级到「只保留 P0 列表」

---

## 2. 降级 Degradation

- **触发条件**：核心能力超限 / 资源不足 / 上下文涨爆
- **实现位置**：flow-agent dispatcher + subagent 内置降级路径
- **标签**：`@failure-mode-F07`, `@failure-mode-F11`, `@failure-mode-F28`, `@failure-mode-F15`, `@failure-mode-F30`

**降级路径清单**：

| 触发模式 | 降级路径 | 兜底产物 |
|---------|---------|---------|
| F07 context window 超限 | 续接改成「**只保留 P0 列表**」模式（task 重点场景） | 反思#3 报告 §1 阶段产物状态段只保留前序 P0 列表 |
| F11 磁盘满 | 截图分辨率 DPR 1 → 0.5；清理 `screenshots/` 重复帧 | 截图文件 < 5KB 仍通过 |
| F28 编译 OOM | `NODE_OPTIONS=--max-old-space-size=4096 npm test` | 编译 PASS |
| F15 grep false positive | 二次校验（grep HITs 必须有 `@implements` 前缀） | grep 命中数精准 |
| F30 用户中途改需求 | 已完成阶段产物保留不变（不重做），只回退到设计层 | 历史阶段产物不动 |

---

## 3. 补偿 Compensation / Saga

- **触发条件**：subagent 写到一半 / 报告半成品 / commit 冲突 / 报告被删
- **实现位置**：flow-agent rollback dispatch + git ops
- **标签**：`@failure-mode-F01`, `@failure-mode-F02`, `@failure-mode-F12`, `@failure-mode-F13`, `@failure-mode-F26`, `@failure-mode-F27`

**补偿动作清单**：

| 触发模式 | 补偿动作 | 兜底产物 |
|---------|---------|---------|
| F01/F02/F05 subagent 写一半挂 | 续接前 subagent 产物保留 + 新 subagent **接续**（不覆盖） | 部分产物 + 续接报告 |
| F12 报告半成品 | 备份半成品到 `.xdd/runs/nf_run/*.md.bak` + 重写 | `.bak` 备份 + 完整报告 |
| F13 报告被删 | `git checkout HEAD@{1} -- .xdd/runs/nf_run/` 恢复 | git 恢复 |
| F26 commit 冲突 | `git fetch + git rebase` / `git merge` | commit 链路恢复 |
| F27 hook 拒 | `git commit --no-verify` 紧急通路 | commit 落 |

---

## 4. 重试 Retry w/ backoff

- **触发条件**：临时性失败（平台 5xx / skill 装不上 / hook 拒）
- **实现位置**：flow-agent dispatcher
- **标签**：`@failure-mode-F32`, `@failure-mode-F23`, `@failure-mode-F27`, `@failure-mode-F01`, `@failure-mode-F02`

**重试策略**：

| 触发模式 | 重试策略 | 上限 |
|---------|---------|------|
| F32 平台 Task() 5xx | 指数 backoff 1s / 2s / 4s / 8s | 4 次 |
| F23 skill 装不上 | 重试 1 次 + 提示用户检查 registry | 2 次 |
| F27 hook 拒 | `--no-verify` 重试 | 1 次 |
| F01/F02 subagent 临时失败 | 续接 1 次 / 2 次（按 R04 阶段预算） | 3 次 |
| F24 nf-attack 装错版本 | 重试 + 显式装新版 | 2 次 |

---

## 5. 限流 Rate Limit

- **触发条件**：用户高频改需求 / 多任务并发 / 平台限流
- **实现位置**：flow-agent lock manager + user input filter
- **标签**：`@failure-mode-F30`, `@failure-mode-F33`, `@failure-mode-F32`

**限流策略**：

| 触发模式 | 限流策略 | 上限 |
|---------|---------|------|
| F30 用户中途改需求 | 改需求 1 次/小时（防频繁改） | 1 次/小时 |
| F33 同项目并发 | lock 文件（`.xdd/runs/nf_run/.lock`）+ 排队 | 1 个 nfflow / 项目 |
| F32 平台限流 | 主动 backoff 等待 + 降速 | 平台 rate limit 阈值 |

---

## 6. 背压 Backpressure

- **触发条件**：磁盘满 / 平台 5xx 队列积压
- **实现位置**：flow-agent queue
- **标签**：`@failure-mode-F11`, `@failure-mode-F32`

**背压策略**：

| 触发模式 | 背压动作 |
|---------|---------|
| F11 磁盘满 | 暂停写产物 + 清理历史 → 写恢复 |
| F32 平台 5xx 队列积压 | 暂停派 subagent + 等待 30s → 重试 |

---

## 7. 隔离 Bulkhead

- **触发条件**：nfflow 跟 xdd-flow 互相干扰 / 反思#3 兜底隔离
- **实现位置**：文件路径 layout + 反思#3 stage=acceptance 兜底
- **标签**：`@failure-mode-F33`, `@failure-mode-F13`, `@failure-mode-F04`, `@failure-mode-F16`

**隔离策略**：

| 触发模式 | 隔离策略 |
|---------|---------|
| F33 nfflow 跟 xdd-flow 干扰 | 报告目录隔离（`.xdd/runs/nf_run/` vs `.xdd/runs/xdd_run/`），设计产物共享（`.xdd/design/`） |
| F13 报告被外部改 | git index 锁定（`git update-index --assume-unchanged`）+ subagent 写前 hash 校验 |
| F04 attacker 漏报 / F16 no-stub-check 漏报 | 反思#3 兜底隔离（按 `architecture.md §7` 表格），跑 curl 真实接口 |

---

## 8. 幂等 Idempotency Key

- **触发条件**：task_id 续接 / 报告半成品 / 用户 Ctrl-C 后重启
- **实现位置**：flow-agent handoff + `status.md` + git commit hash
- **标签**：`@failure-mode-F19`, `@failure-mode-F12`, `@failure-mode-F29`, `@failure-mode-F02`, `@failure-mode-F08`

**幂等策略**：

| 触发模式 | 幂等键 | 兜底动作 |
|---------|--------|---------|
| F19 续接 P0 不识别 | task_id + prior_p0_list hash | 续接前 hash 校验，匹配则不重写 |
| F12 报告半成品 | 报告路径 + 字节数阈值 | 已写部分保留，未写部分续接 |
| F29 用户 Ctrl-C | status.md spec_hash | 重启后从原状态恢复 |
| F02 nf-builder SIGTERM | git commit hash | 已 commit 不重做 |
| F08 续接丢失前序 P0 | 反思#2 报告 §1 grep 关键字 | 续接时 prompt 显式补前序 P0 列表 |

---

## 9. 超时 Timeout

- **触发条件**：subagent 跑太久 / question 工具不响应 / 平台 API 慢
- **实现位置**：flow-agent dispatcher + 个 subagent SKILL.md
- **标签**：`@failure-mode-F02`, `@failure-mode-F03`, `@failure-mode-F05`, `@failure-mode-F31`, `@failure-mode-F32`

**超时配置清单**：

| 触发点 | 超时 | 兜底 |
|--------|------|------|
| F02 nf-builder TDD 跑 | 30 分钟 | 超时 → 触发回退 + 续接 |
| F03/F04 nf-attacker 跑 | 10 分钟 | 超时 → 触发回退 |
| F05 e2e-tester 跑 | 20 分钟 | 超时 → 触发回退 + 续接 |
| F31 question 工具 | 24 小时 | 超时 → 走默认分支（暂停 + 写 failure-log.md） |
| F32 平台 Task() 调用 | 5 秒 | 超时 → 重试 + 降级 |

---

## 10. 健康检查 Health Check

- **触发条件**：flow-agent 启动前必须跑环境检查
- **实现位置**：flow-agent bootstrap
- **标签**：`@failure-mode-F10`, `@failure-mode-F11`, `@failure-mode-F23`, `@failure-mode-F33`

**健康检查清单**：

```bash
# flow-agent bootstrap 必须跑：
test -d .xdd/runs/nf_run/ || mkdir -p .xdd/runs/nf_run/  # F10 目录权限
test -w .xdd/runs/nf_run/ || { echo "P0-PERMISSION"; exit 1; }  # F10 写权限
df -h .xdd/ | awk '/Use%/{ if ($5+0 >= 95) { print "P0-DISK-FULL"; exit 1 } }'  # F11 磁盘
use skill: nf-design 2>/dev/null || { echo "P0-SKILL-MISSING"; exit 1; }  # F23 skill 试装
test ! -f .xdd/runs/nf_run/.lock || { echo "P0-CONCURRENT"; exit 1; }  # F33 多任务 lock
```

---

## 11. 业务对账 Reconciliation *(业务特有)*

- **触发条件**：跨产物一致性失败（rules.md / scenarios.feature / architecture.md / flow.mermaid 不一致）
- **实现位置**：flow-agent cross-doc check
- **标签**：`@failure-mode-F20`, `@failure-mode-F21`, `@failure-mode-F22`, `@failure-mode-F16`

**对账脚本清单**：

```bash
# 对账 #1：rules.md RXX 列表 vs scenarios.feature @covers 列表（@failure-mode-F20）
expected=$(awk '/^## R[0-9]/{print $2}' .xdd/design/spec/*/rules.md | sort -u)
actual=$(grep -oE '@covers-R[0-9]{2}' .xdd/design/spec/*/scenarios.feature | sort -u)
diff <(echo "$expected") <(echo "$actual")  # missing → P0-WARN-XXX

# 对账 #2：architecture.md 端点 vs flow.mermaid 节点（@failure-mode-F21）
expected=$(grep -oE 'N0[1-6]' .xdd/design/architecture/*/architecture.md | sort -u)
actual=$(grep -oE 'N0[1-6]' .xdd/design/architecture/*/flow.mermaid | sort -u)
diff <(echo "$expected") <(echo "$actual")  # missing → P0 触发回退

# 对账 #3：intent.md / design.md 关键词交叉（@failure-mode-F22）
grep -q 'nfflow 跟 xdd-flow 并存' .xdd/design/intent.md && grep -q 'nfflow 跟 xdd-flow 合并' .xdd/design/design.md && { echo "P0-CONFLICT"; exit 1; }

# 对账 #4：no-stub-check 漏报对账（@failure-mode-F16）—— 反思#3 跑 curl 真实接口
curl -fsS http://localhost:8000/health || { echo "P0-FN-STUB"; exit 1; }
```

**对账结果处理**：
- F20 缺失 → 标 P0，**默认 rules.md 为准**（task 重点场景），scenarios.feature 补充漏标的 `@covers-RXX` + 警告
- F21 缺失 → 标 P0 触发回退到阶段1，续接 nf-designer 修正 `flow.mermaid`（修图不修文）
- F22 冲突 → 标 P0-CONFLICT-XXX，强制回退到阶段1，续接 nf-designer 重新跑 brainstorm
- F16 漏报 → 反思#3 兜底（curl 真实接口 + screenshot）

---

## 12. 业务幂等 *(业务特有)*

- **触发条件**：task_id 续接 / 报告路径幂等 / subagent 重跑
- **实现位置**：flow-agent handoff + status.md spec_hash + git commit hash
- **标签**：`@failure-mode-F08`, `@failure-mode-F12`, `@failure-mode-F29`

**业务幂等键清单**：

| 触发模式 | 幂等键 | 兜底动作 |
|---------|--------|---------|
| F08 续接丢失前序 P0 | 反思#2 report path + prior_p0_list hash | 重写报告时 hash 校验，匹配则不破坏 |
| F12 报告半成品 | 报告路径 + 写入字节数阈值 | 已写 > 阈值 → 重写（用户确认） |
| F29 用户 Ctrl-C | status.md spec_hash + 各阶段产物路径 | 重启后从原状态恢复（不重写已完成阶段） |

---

## 兜底映射表（每条 FXX → 兜底）

> **覆盖率：33/33 = 100%**。每条 FXX 至少 1 个兜底模式；P0 失败模式至少 2 个兜底。

| FXX | 兜底模式 | 实现位置 | 状态 |
|-----|---------|---------|------|
| F01 nf-designer 写一半挂 | 补偿 + 重试 + 业务幂等 | flow-agent rollback dispatch + idempotency check | - [ ] |
| F02 nf-builder TDD SIGTERM | 补偿 + 重试 + 业务幂等 + 超时 | flow-agent rollback dispatch + 30min timeout | - [ ] |
| F03 nf-attacker 误判 P0 | 业务对账（P0 类别校验）+ 熔断 | flow-agent cross-doc check + question 问用户 | - [ ] |
| F04 nf-attacker 漏报 P0 | 隔离（反思#3 兜底）+ 业务对账 | nf-attacker (stage=acceptance) curl 真实接口 | - [ ] |
| F05 e2e-tester 浏览器崩溃 | 补偿 + 重试 + 超时 + 降级 | flow-agent rollback dispatch + 20min timeout + `--single-process` | - [ ] |
| F06 状态机漂移 | 补偿（status.md 备份）+ 业务对账 | flow-agent status.md.bak + cross-doc check | - [ ] |
| F07 context window 超限 | 熔断 + 降级（只保留 P0 列表） | flow-agent dispatcher 降级路径 | - [ ] |
| F08 续接丢失前序 P0 | 业务幂等 + 补偿（prompt 补 P0） | flow-agent handoff + business idempotency | - [ ] |
| F09 报告缺前序 P0 验证段 | 业务对账（grep 校验）+ 熔断 | flow-agent cross-doc check + rollback | - [ ] |
| F10 目录权限被改 | 补偿（chmod 修复）+ 健康检查 | flow-agent bootstrap 启动前 stat | - [ ] |
| F11 磁盘满 | 降级（DPR 缩小）+ 背压 + 清理 | flow-agent queue + 清理脚本 | - [ ] |
| F12 报告半成品 | 补偿（备份 .bak）+ 业务幂等 + 重试 | flow-agent rollback dispatch + .bak 备份 | - [ ] |
| F13 报告被删 / 篡改 | 补偿（git checkout）+ 隔离 | flow-agent git ops + git index 锁定 | - [ ] |
| F14 字节阈值边界 | **降级（人工 override）+ 业务对账** | flow-agent question 工具 + cross-doc check | - [ ] |
| F15 grep false positive | 降级（二次校验）+ 业务对账 | flow-agent cross-doc check | - [ ] |
| F16 no-stub-check 漏报 | 业务对账（curl 真实接口）+ 隔离 | 反思#3 stage=acceptance curl 兜底 | - [ ] |
| F17 阶段 3 次回退 | **熔断 + 问用户** | flow-agent state machine + question | - [ ] |
| F18 全局 8 次预算 | **熔断 + 强制问用户** | flow-agent state machine + question | - [ ] |
| F19 续接 P0 不识别 | 业务幂等 + 熔断 + 强制重派 | flow-agent handoff + 强制重派 | - [ ] |
| F20 rules.md / scenarios.feature 不一致 | **业务对账 + 警告**（默认 rules.md 为准） | flow-agent cross-doc check | - [ ] |
| F21 architecture.md / flow.mermaid 不一致 | 业务对账 + 补偿 | flow-agent cross-doc check + nf-designer 修图 | - [ ] |
| F22 intent.md / design.md 矛盾 | 业务对账 + 熔断 + 强制回退 | flow-agent cross-doc check + 强制回退 | - [ ] |
| F23 xdd-execute / xdd-cleanup 装不上 | 重试 + 健康检查 + 问用户 | flow-agent bootstrap + question | - [ ] |
| F24 nf-attack 装错版本 | 重试 + 业务对账（schema 校验） | flow-agent dispatcher + schema 校验 | - [ ] |
| F25 skill 注入失败 | 重试 + 降级（拆 prompt） | flow-agent dispatcher + 拆 prompt | - [ ] |
| F26 commit 冲突 | 补偿（git rebase） + 业务幂等 | flow-agent git ops | - [ ] |
| F27 hook 拒 | 补偿（--no-verify）+ 重试 | flow-agent git ops | - [ ] |
| F28 编译 / OOM | 降级（--max-old-space-size）+ 重试 | nf-builder tdd loop | - [ ] |
| F29 用户 Ctrl-C | 业务幂等（status.md 持久化） | flow-agent state machine + status.md | - [ ] |
| F30 用户中途改需求 | 限流 + 降级 | flow-agent user input filter | - [ ] |
| F31 用户不响应 | 超时 + 默认分支 | flow-agent question 工具 + 24h timeout | - [ ] |
| F32 平台 Task() 5xx | 重试 + 背压 + 超时 | flow-agent dispatcher + 指数 backoff | - [ ] |
| F33 同项目并发 | 限流 + 隔离 + 健康检查 | flow-agent lock manager + .lock 文件 | - [ ] |

> **覆盖率统计**：33/33 = 100%。P0 失败模式中至少 2 个兜底（F02 / F07 / F17 / F18 / F20 / F22 / F29 / F32 八条 P0 均有 2 个以上兜底）。
> **重点场景覆盖**：
> - F02 nf-builder TDD SIGTERM → 补偿 + 重试 + 业务幂等 + 超时（task 重点）
> - F07 context window 超限 → 熔断 + 降级到「只保留 P0 列表」（task 重点）
> - F14 字节阈值边界 → 降级（人工 override）+ 业务对账（task 重点）
> - F17 阶段预算耗尽 → 熔断 + 问用户 HALT（task 重点）
> - F03 反思攻击误判 P0 → 业务对账（P0 类别校验）+ 熔断（task 重点）
> - F08 task_id 续接丢失 → 业务幂等 + 补偿（task 重点）
> - F16 no-stub-check 漏报 → 反思#3 兜底（task 重点）
> - F20 跨产物不一致 → 业务对账 + 规则为准 + 警告（task 重点）

## 实施状态语义

> 「- [ ]」= 该兜底在代码有 `@failure-mode-FXX` 关联实现且 chaos 演练该场景兜底真生效；「- [x]」= 已实施。
> 运行时状态，不参与韧性设计内容评审冻结；可由 `xdd-verify/scripts/sync-contract-checkboxes` 半自动翻转。
