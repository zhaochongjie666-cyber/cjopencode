# B01-nfflow-upgrade — 韧性测试计划

> nfflow 6 节点流程编排平台的韧性测试计划。
> 每个失败模式（F01~F33）对应 1 个测试，含 自动化测试 / 手工测试 / 巡检项 / 测试命令 / 预期结果。
> 编排系统特有：subagent 崩溃 / 上下文超限 / 跨产物一致性 / 预算循环 / 续接。
> 5 类真注入：subagent 崩溃 / 上下文超限 / 文件 IO / 阈值边界 / 续接失败（在 `chaos-scenarios.feature` 详细写）。

## 测试分级

| 级别 | 含义 | 触发频率 | 位置 |
|------|------|---------|------|
| **UT（单元）** | 单个失败模式注入 + 兜底验证 | 每个 PR | CI / 本地 |
| **IT（集成）** | 多 subagent 联动 + 兜底联动 | 每次合并 main | CI 集成环境 |
| **CHAOS（混沌）** | 全链路真实注入 + 兜底真生效 | 每周 + 大版本前 | staging 环境 |
| **DRILL（演练）** | 人工实施恢复 SOP | 每月 | 人工 |

## 测试矩阵总览（33 个失败模式 × 4 维度）

| FXX | 失败模式 | 自动化 | 手工 | 巡检 | 演练 |
|-----|---------|--------|------|------|------|
| F01 | nf-designer 写一半挂 | IT (chaos/F01.sh) | DRILL-F01 | `kill -SIGTERM` 后产物保留 + 续接 | ✅ |
| F02 | nf-builder TDD SIGTERM | IT (chaos/F02.sh) | DRILL-F02 | 同 F01 | ✅ |
| F03 | nf-attacker 误判 P0 | UT (chaos/F03.sh) | DRILL-F03 | 业务对账校验 P0 类别 | ✅ |
| F04 | nf-attacker 漏报 P0 | CHAOS (chaos/F04.sh) | DRILL-F04 | 反思#3 兜底拦 | ✅ |
| F05 | e2e-tester 浏览器崩溃 | IT (chaos/F05.sh) | DRILL-F05 | `--single-process` 降级 | ✅ |
| F06 | 状态机漂移 | UT (chaos/F06.sh) | DRILL-F06 | `status.md.bak` 存在 | ✅ |
| F07 | context window 超限 | CHAOS (chaos/F07.sh) | DRILL-F07 | 降级到「只保留 P0 列表」 | ✅ |
| F08 | 续接丢失前序 P0 | UT (chaos/F08.sh) | DRILL-F08 | 业务幂等 + 重新派发 | ✅ |
| F09 | 报告缺前序 P0 验证段 | UT (chaos/F09.sh) | DRILL-F09 | 重新派发 | ✅ |
| F10 | 目录权限被改 | UT (chaos/F10.sh) | DRILL-F10 | `chmod -R u+w` 修复 | ✅ |
| F11 | 磁盘满 | IT (chaos/F11.sh) | DRILL-F11 | DPR 缩小 + 清理 | ✅ |
| F12 | 报告半成品 | IT (chaos/F12.sh) | DRILL-F12 | `.bak` 备份 + 重写 | ✅ |
| F13 | 报告被删 / 篡改 | IT (chaos/F13.sh) | DRILL-F13 | `git checkout` 恢复 | ✅ |
| F14 | 字节阈值边界 | UT (chaos/F14.sh) | DRILL-F14 | 人工 override | ✅ |
| F15 | grep false positive | UT (chaos/F15.sh) | DRILL-F15 | 二次校验 | ✅ |
| F16 | no-stub-check 漏报 | CHAOS (chaos/F16.sh) | DRILL-F16 | 反思#3 curl 兜底 | ✅ |
| F17 | 阶段 3 次回退 | UT (chaos/F17.sh) | DRILL-F17 | 熔断 + question | ✅ |
| F18 | 全局 8 次预算 | UT (chaos/F18.sh) | DRILL-F18 | 熔断 + 强制问用户 | ✅ |
| F19 | 续接 P0 不识别 | IT (chaos/F19.sh) | DRILL-F19 | 业务幂等 + 强制重派 | ✅ |
| F20 | rules.md / scenarios.feature 不一致 | UT (chaos/F20.sh) | DRILL-F20 | 业务对账 + 规则为准 | ✅ |
| F21 | architecture.md / flow.mermaid 不一致 | UT (chaos/F21.sh) | DRILL-F21 | 业务对账 + 修图 | ✅ |
| F22 | intent.md / design.md 矛盾 | UT (chaos/F22.sh) | DRILL-F22 | 业务对账 + 强制回退 | ✅ |
| F23 | xdd-execute / xdd-cleanup 装不上 | UT (chaos/F23.sh) | DRILL-F23 | 提示用户检查 registry | ✅ |
| F24 | nf-attack 装错版本 | UT (chaos/F24.sh) | DRILL-F24 | schema 校验 + 重装 | ✅ |
| F25 | skill 注入失败 | IT (chaos/F25.sh) | DRILL-F25 | 拆 prompt 降级 | ✅ |
| F26 | commit 冲突 | IT (chaos/F26.sh) | DRILL-F26 | git rebase 补偿 | ✅ |
| F27 | hook 拒 | IT (chaos/F27.sh) | DRILL-F27 | `--no-verify` 紧急通路 | ✅ |
| F28 | 编译 / OOM | IT (chaos/F28.sh) | DRILL-F28 | `--max-old-space-size` 降级 | ✅ |
| F29 | 用户 Ctrl-C | CHAOS (chaos/F29.sh) | DRILL-F29 | status.md 持久化 + 重启恢复 | ✅ |
| F30 | 用户中途改需求 | IT (chaos/F30.sh) | DRILL-F30 | 限流 + 强制回退 | ✅ |
| F31 | 用户不响应 | UT (chaos/F31.sh) | DRILL-F31 | 24h 超时 + 默认分支 | ✅ |
| F32 | 平台 Task() 5xx | IT (chaos/F32.sh) | DRILL-F32 | 4 次指数 backoff | ✅ |
| F33 | 多任务并发 | UT (chaos/F33.sh) | DRILL-F33 | `.lock` 文件 + 排队 | ✅ |

---

## 单元测试（UT）— 单失败模式注入

### F03 test（nf-attacker 误判 P0）

```bash
# 测试命令
bash scripts/chaos/F03.sh

# 注入：
# 1. 写一份 scenarios.feature 完整（R01~R07 都覆盖）
# 2. 注入 P0-X = "文档措辞不准确"（不是 P0 类别）
sed -i 's/^## 5. 问题清单/## 5. 问题清单\n- P0-X: 文档措辞不准确\n- 建议 rollback/' .xdd/runs/nf_run/reflect-attack-design-report.md

# 预期：
# - flow-agent 跑业务对账（兜底 #11）
# - P0 类别校验：P0-X 类别 = DOC_STYLE ≠ FOUND_DEFECT/SHAM/JOURNEY_BLOCKED
# - 标 P0-FP-XXX（false positive）
# - question 工具问用户「采纳业务对账 / 信任反思报告 / 暂停」
# - 用户选 1 → 流程继续
# - failure-log.md 追加 `[nfflow] R03 F03 误判 P0-X`
```

### F06 test（状态机漂移）

```bash
# 测试命令
bash scripts/chaos/F06.sh

# 注入：
# 1. 备份 status.md
cp .xdd/runs/xdd_run/status.md .xdd/runs/xdd_run/status.md.bak
# 2. 改坏状态：阶段 1 done 但反思#1 in_progress（不一致）
sed -i 's/in_progress/pending/' .xdd/runs/xdd_run/status.md

# 预期：
# - flow-agent 启动时跑一致性断言
# - 状态机漂移触发兜底 #3（补偿 = status.md.bak 恢复）
# - 重建状态（按产物实际状态推断）
# - flow-agent 给出告警但继续
```

### F08 test（续接丢失前序 P0）

```bash
# 测试命令
bash scripts/chaos/F08.sh

# 注入：
# 1. 跑完反思#1
# 2. 模拟续接丢失：jq '.prompt.prior_p0_list = []' 注入

# 预期：
# - 反思#2 报告 §1 缺「前序 P0 状态」段
# - 业务对账（兜底 #11）grep 失败 → P0-LOOP-XXX
# - flow-agent 触发回退 + 重新派发（task_id 不续接）
# - 新 attacker 重新注入 P0 列表 → 报告 §1 完整
```

### F14 test（字节阈值边界）

```bash
# 测试命令
bash scripts/chaos/F14.sh

# 注入：
truncate -s 199 .xdd/design/spec/B01-nfflow-upgrade/rules.md

# 预期：
# - 阶段 1 Gate 检查 2 失败（199 < 200）
# - flow-agent 触发「降级 + 人工 override」
# - question 工具问用户
# - 用户选 1 → 标 done with override
# - failure-log.md 追加 override 记录
```

### F17 test（阶段 3 次回退）

```bash
# 测试命令
bash scripts/chaos/F17.sh

# 注入：
# 1. 跑 3 次阶段 1 回退（每次 P0-A 重复）
for i in 1 2 3; do
  flow-agent rollback stage1
  flow-agent run stage1
done

# 预期：
# - staging_counter[stage1] = 3
# - flow-agent 触发熔断
# - 阶段 1 subagent 停止续接
# - 流程暂停
# - question 工具调用
# - failure-log.md 追加 `[nfflow] R04 F17 阶段1 预算耗尽`
```

### F20 test（rules.md / scenarios.feature 不一致）

```bash
# 测试命令
bash scripts/chaos/F20.sh

# 注入：
sed -i '/@covers-R07/d' .xdd/design/spec/B01-nfflow-upgrade/scenarios.feature

# 预期：
# - 业务对账（兜底 #11）：
#   expected = [R01..R07]（rules.md）
#   actual = [R01..R06]（scenarios.feature）
#   missing = [R07]
# - 触发「规则为准 + 警告」处理
# - 标 P0-WARN-XXX（不阻塞）
# - 续接 nf-designer 补 @covers-R07
# - 阶段 1 标 done with warnings
# - failure-log.md 追加 `[nfflow] R07 F20 rules.md 跟 scenarios.feature 不一致`
```

### F22 test（intent.md / design.md 矛盾）

```bash
# 测试命令
bash scripts/chaos/F22.sh

# 注入：
# 1. intent.md 写 nfflow 跟 xdd-flow 并存
# 2. design.md 写 nfflow 跟 xdd-flow 合并
sed -i 's/nfflow 跟 xdd-flow 并存/nfflow 跟 xdd-flow 合并/' .xdd/design/design.md

# 预期：
# - 业务对账（兜底 #11）关键词冲突
# - 标 P0-CONFLICT-XXX
# - 强制回退到阶段 1
# - 续接 nf-designer 重新跑 brainstorm
```

### F33 test（多任务并发）

```bash
# 测试命令
bash scripts/chaos/F33.sh

# 注入：
# 1. flow-agent A 启动
touch .xdd/runs/nf_run/.lock
# 2. flow-agent B 同时启动

# 预期：
# - flow-agent B 健康检查（兜底 #10）失败（lock 文件存在）
# - 标 P0-CONCURRENT-XXX
# - question 工具问用户
# - 用户选 2（排队）→ flow-agent B 写 .queue 等候
# - flow-agent A 跑完释放 lock → flow-agent B 接管
```

---

## 集成测试（IT）— 多 subagent 联动

### F01 test（nf-designer 写一半挂）

```bash
# 测试命令
bash scripts/chaos/F01.sh

# 步骤：
# 1. 启动 nf-designer 写阶段 1
# 2. 等待 intent.md + design.md 落盘
# 3. 注入 SIGTERM
# 4. 续接 nf-designer
# 5. 验证 5 件产物齐全

# 预期：
# - 阶段 1 Gate 5 条失败（rules.md / scenarios.feature / architecture.md 缺失）
# - flow-agent 续接（task_id 不续接）
# - nf-designer 续写 3 件缺失产物
# - re-run Gate 全过
# - failure-log.md 追加 `[nfflow] R01 F01 nf-designer SIGTERM 续接成功`
```

### F02 test（nf-builder TDD SIGTERM）

```bash
# 测试命令
bash scripts/chaos/F02.sh

# 步骤：
# 1. 启动 nf-builder 跑 TDD
# 2. 等待 R01~R03 commit 已落
# 3. 注入 SIGTERM（nf-builder 写 R04 时被 kill）
# 4. 续接 nf-builder
# 5. 验证 R01~R07 全部 @implements RXX

# 预期：
# - 阶段 2 Gate 失败（build-report.md 缺失 / @implements RXX 命中 = 3 < 7）
# - flow-agent 跑兜底 #3（补偿）：续接前 subagent 产物保留
# - flow-agent 跑兜底 #4（重试）：续接 nf-builder
# - flow-agent 跑兜底 #8（业务幂等）：git commit hash 校验，R01~R03 已 commit 不重做
# - re-run Gate 全过
```

### F11 test（磁盘满）

```bash
# 测试命令
bash scripts/chaos/F11.sh

# 步骤：
# 1. 跑 e2e-tester
# 2. 注入磁盘满（占用 95% 空间）
dd if=/dev/zero of=./.xdd/runs/nf_run/fill bs=1M count=9000

# 预期：
# - e2e-tester 写截图时 `No space left on device`
# - flow-agent 跑兜底 #2（降级）：DPR 1 → 0.5 缩小截图
# - flow-agent 跑兜底 #6（背压）：暂停写产物 + 清理
# - 清理 fill 文件后恢复
```

### F12 test（报告半成品）

```bash
# 测试命令
bash scripts/chaos/F12.sh

# 步骤：
# 1. 派 nf-designer 写 rules.md
# 2. 注入：写到半截时 SIGTERM
# 3. 验证 rules.md 字节数 < 200

# 预期：
# - 阶段 1 Gate 检查 2 失败（字节数 < 200）
# - flow-agent 跑兜底 #3（补偿）：备份半成品到 rules.md.bak
# - flow-agent 跑兜底 #12（业务幂等）：重写而不破坏 .bak
# - 续接 nf-designer 写完整版
```

### F25 test（skill 注入失败）

```bash
# 测试命令
bash scripts/chaos/F25.sh

# 步骤：
# 1. 启动 flow-agent
# 2. 注入：长 prompt 截断（prompt 超过 200KB 触发 LLM 截断）

# 预期：
# - flow-agent 跑兜底 #2（降级）
# - 拆 prompt（拆小 + 显式引用 skill 路径）
# - 重试 subagent
```

### F26 test（commit 冲突）

```bash
# 测试命令
bash scripts/chaos/F26.sh

# 步骤：
# 1. 启动 nf-builder 跑 TDD
# 2. 注入：外部 commit 改同一文件
git checkout HEAD -- src/services/xxx.py
echo '# external change' >> src/services/xxx.py
git add src/services/xxx.py
git commit -m 'external-commit'

# 预期：
# - nf-builder commit 失败（CONFLICT）
# - flow-agent 跑兜底 #3（补偿）：git rebase / merge
# - 重试 commit
# - 仍失败则标 P0-F26-CONFLICT-XXX 触发回退
```

### F32 test（平台 5xx）

```bash
# 测试命令
bash scripts/chaos/F32.sh

# 步骤：
# 1. mock 平台 API 5xx（curl mock）
# 2. 启动 flow-agent 派 subagent

# 预期：
# - flow-agent 跑兜底 #4（重试）：1s / 2s / 4s / 8s 指数 backoff
# - 第 4 次恢复 → 流程继续
# - 第 4 次仍失败 → 标 P0-F32-PLATFORM-XXX 触发回退
```

---

## 混沌演练（CHAOS）— 全链路真实注入

### F04 test（nf-attacker 漏报 P0）

```bash
# 测试命令
bash scripts/chaos/F04.sh

# 步骤：
# 1. 跑完阶段 2
# 2. 注入：return None 蒙混 + 禁用 no-stub-check
sed -i 's/return MyService(.*)/return None  # mock for chaos/g' src/services/xxx.py
mv scripts/no-stub-check.sh scripts/no-stub-check.sh.bak

# 预期：
# - 反思#2 跑 no-stub-check 0 命中（漏报）
# - 反思#2 报告 §5 标 P0=0（false negative）
# - flow-agent 跑兜底 #11（业务对账）：反思#3 curl 真实接口 5xx
# - 反思#3 标 P0-Y = 1
# - 触发回退到阶段 2
```

### F07 test（context window 超限）

```bash
# 测试命令
bash scripts/chaos/F07.sh

# 步骤：
# 1. 跑完反思#1 + 反思#2
# 2. 注入：反思#3 prompt 注入超长前序上下文（200KB 伪造历史）
cat >> .xdd/runs/nf_run/reflect-attack-build-report.md <<EOF
<!-- CHAOS: 200KB fake history -->
$(yes "fake attacker history" | head -c 204800)
EOF

# 预期：
# - 反思#3 抛 `context length exceeded`
# - flow-agent 跑兜底 #1（熔断）：停止续接
# - flow-agent 跑兜底 #2（降级）：prompt 改成「只保留 P0 列表」
# - 反思#3 重跑成功
```

### F16 test（no-stub-check 漏报）

```bash
# 测试命令
bash scripts/chaos/F16.sh

# 步骤：
# 1. 跑完阶段 2
# 2. 注入：return None 蒙混
sed -i 's/return MyService(.*)/return None  # mock for chaos/g' src/services/xxx.py

# 预期：
# - 反思#2 跑 no-stub-check 0 命中（return None 不是 stub 模式）
# - 反思#2 报告 §5 标 P0=0（漏报）
# - flow-agent 跑兜底 #11（业务对账）：反思#3 curl 真实接口
# - 反思#3 标 P0 = 1（NO_STUB_FN）
# - 触发回退到阶段 2（按 architecture §7 表格）
```

### F29 test（Ctrl-C 中断）

```bash
# 测试命令
bash scripts/chaos/F29.sh

# 步骤：
# 1. 跑阶段 2 in_progress
# 2. 注入：SIGINT 模拟 Ctrl-C
kill -SIGINT $(pgrep -f flow-agent)

# 预期：
# - flow-agent 跑 `trap` 写入 status.md
# - flow-agent 退出
# - 用户重启 flow-agent
# - flow-agent 读 status.md 恢复推断
# - 续接 nf-builder 从 R06 续写
# - failure-log.md 追加 `[nfflow] R04 F29 Ctrl-C 中断 → 持久化 → 重启恢复`
```

---

## 巡检项（每日 / 每周）

| 巡检项 | 命令 | 频率 | 期望 |
|--------|------|------|------|
| 报告路径完整性 | `ls .xdd/runs/nf_run/*.md \| wc -l` ≥ 4 | 每日 | 4 报告齐全 |
| status.md 持久化 | `stat .xdd/runs/xdd_run/status.md` 字节数 ≥ 100 | 每日 | 持久化 |
| 失败日志增长 | `wc -l .xdd/runs/xdd_run/failure-log.md` | 每日 | 增长 < 50 行/天 |
| 产物字节数 | `wc -c .xdd/design/spec/B01-*/rules.md` ≥ 200 | 每周 | 字节数达标 |
| no-stub-check 命中 | `bash scripts/no-stub-check.sh` 退出 0 | 每周 | 0 命中 |
| 跨产物一致 | `bash scripts/cross-doc-check.sh` 退出 0 | 每周 | 一致 |
| .lock 文件孤儿 | `stat .xdd/runs/nf_run/.lock` 不存在 | 每日 | 无孤儿 |
| git commit hash | `git log --grep 'RXX' --oneline \| wc -l` ≥ 7 | 每周 | RXX 都有 commit |

---

## 演练 SOP（DRILL）— 人工实施恢复

每月人工演练 1 次 F17 / F18 / F29 / F32（高优先级失败模式），演练内容：

```bash
# DRILL-F17 阶段预算耗尽
# 1. 模拟 3 次回退
# 2. 验证 flow-agent 触发熔断 + question
# 3. 验证人工选 1 (重置) 后流程继续
# 4. 记录演练结果

# DRILL-F18 全局预算耗尽
# 1. 模拟 8 次回退
# 2. 验证 flow-agent 强制 HALT
# 3. 验证人工选 2 (暂停) 后流程暂停
# 4. 记录演练结果

# DRILL-F29 Ctrl-C 中断
# 1. 启动 flow-agent，跑阶段 2
# 2. 用户按 Ctrl-C
# 3. 验证 status.md 持久化
# 4. 重启 flow-agent
# 5. 验证恢复
# 6. 记录演练结果

# DRILL-F32 平台 5xx
# 1. mock 平台 5xx
# 2. 启动 flow-agent
# 3. 验证 4 次 backoff 后恢复
# 4. 记录演练结果
```

---

## 测试覆盖统计

- **F01~F33 单元测试**：33 条 UT 脚本（每条 1 个 .sh）
- **F01~F33 集成测试**：15 条 IT 脚本（多 subagent 联动）
- **F01~F33 混沌测试**：5 条 CHAOS 脚本（全链路真实注入）
- **F01~F33 演练**：每月 4 条 DRILL（P0 高优先级）
- **总测试用例**：33 + 15 + 5 + 4 = **57 条**
- **覆盖率**：33/33 = **100%**

---

## 实施状态语义

> 「- [ ]」= 测试脚本已写但未跑过；「- [x]」= 已跑过且通过。
> 运行时状态，不参与韧性设计内容评审冻结；可由 `xdd-verify` 跑通后自动翻转。
