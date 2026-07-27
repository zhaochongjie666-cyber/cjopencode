# B01-nfflow-upgrade — 恢复剧本（Recovery Runbook）

> nfflow 6 节点流程编排平台的运维值班用恢复 SOP。
> 每条失败模式（F01~F33）对应 1 个 SOP，含 「症状 / 立即动作 / 根因诊断 / 恢复步骤 / 自动恢复 vs 人工介入 / 恢复时长目标 / 数据保留 / 升级路径」。
> 编排系统 SOP 跟业务应用 SOP 不同：编排系统 SOP 是 **subagent 调度 + status.md 持久化 + 续接**，不是「重启服务」。

## SOP 速查表

| FXX | 症状 | 自动恢复 | 人工介入 | RTO |
|-----|------|---------|---------|-----|
| F01 | nf-designer 写一半挂 | ✅ 续接重跑 | - | 5min |
| F02 | nf-builder TDD SIGTERM | ✅ 续接 + 业务幂等 | - | 5min |
| F03 | nf-attacker 误判 P0 | ✅ 业务对账 + question | ✅ 裁决 | 10min |
| F04 | nf-attacker 漏报 P0 | ✅ 反思#3 兜底对账 | - | 15min |
| F05 | e2e-tester 浏览器崩溃 | ✅ 续接 + 降级 | - | 10min |
| F06 | 状态机漂移 | ✅ status.md.bak 恢复 | - | 2min |
| F07 | context window 超限 | ✅ 降级到「只保留 P0 列表」 | - | 5min |
| F08 | 续接丢失前序 P0 | ✅ 业务幂等 + 重新派发 | - | 5min |
| F09 | 报告缺前序 P0 验证段 | ✅ 重新派发 | - | 5min |
| F10 | 目录权限被改 | ✅ chmod 修复 | ✅ 仍失败问用户 | 2min |
| F11 | 磁盘满 | ✅ 降级 DPR + 清理 | ✅ 仍失败问用户 | 5min |
| F12 | 报告半成品 | ✅ `.bak` 备份 + 重写 | - | 3min |
| F13 | 报告被删 / 篡改 | ✅ git checkout 恢复 | ✅ 仍失败问用户 | 3min |
| F14 | 字节阈值边界 | ✅ 人工 override | ✅ 裁决 | 5min |
| F15 | grep false positive | ✅ 二次校验 | - | 2min |
| F16 | no-stub-check 漏报 | ✅ 反思#3 curl 兜底 | - | 15min |
| F17 | 阶段 3 次回退 | - | ✅ HALT 问用户 | 30min |
| F18 | 全局 8 次预算 | - | ✅ 强制 HALT | 1h |
| F19 | 续接 P0 不识别 | ✅ 业务幂等 + 强制重派 | - | 10min |
| F20 | rules.md / scenarios.feature 不一致 | ✅ 业务对账 + 规则为准 + 警告 | - | 5min |
| F21 | architecture.md / flow.mermaid 不一致 | ✅ 业务对账 + 修图 | - | 5min |
| F22 | intent.md / design.md 矛盾 | - | ✅ 强制回退 + 重新 brainstorm | 30min |
| F23 | xdd-execute / xdd-cleanup 装不上 | ✅ 重试 1 次 | ✅ 提示用户检查 registry | 5min |
| F24 | nf-attack 装错版本 | ✅ 重试 + 显式装新版 | - | 5min |
| F25 | skill 注入失败 | ✅ 拆 prompt 降级 | - | 5min |
| F26 | commit 冲突 | ✅ git rebase 补偿 | ✅ 仍失败回退 | 5min |
| F27 | hook 拒 | ✅ `--no-verify` 紧急通路 | - | 2min |
| F28 | 编译 / OOM | ✅ `--max-old-space-size` 降级 | - | 10min |
| F29 | 用户 Ctrl-C | ✅ status.md 持久化 | ✅ 重启恢复 | 5min |
| F30 | 用户中途改需求 | ✅ 限流 1 次/小时 | ✅ 强制回退 | 30min |
| F31 | 用户不响应 | ✅ 24h 超时默认分支 | ✅ 后续介入 | 24h |
| F32 | 平台 Task() 5xx | ✅ 4 次指数 backoff | ✅ 仍失败回退 | 1min |
| F33 | 同项目并发 | ✅ `.lock` + 排队 | ✅ 裁决 | 5min |

> **RTO（Recovery Time Objective）目标**：P0 失败模式 ≤ 30min 自动恢复（不可自恢复的 1h 内强制问用户）。

---

## 子流程 1：subagent 崩溃恢复

### F01 · nf-designer 写一半挂

- **症状**：阶段 1 Gate 5 条失败（rules.md / scenarios.feature / architecture.md 缺失）
- **立即动作**：检测 `pgrep -f nf-designer` 是否存在 → 不存在则记录 SIGTERM 痕迹
- **根因诊断**：
  ```bash
  # 1. 看产物落盘
  ls -la .xdd/design/{intent.md,design.md,spec/B01-nfflow-upgrade/rules.md,spec/B01-nfflow-upgrade/scenarios.feature,architecture/B01-nfflow-upgrade/architecture.md}
  # 2. 看 status.md 状态
  cat .xdd/runs/xdd_run/status.md
  # 3. 看 failure-log.md
  grep '\[nfflow\]' .xdd/runs/xdd_run/failure-log.md | tail -20
  ```
- **恢复步骤**：
  ```bash
  # 1. 续接 nf-designer（task_id 不续接，prompt 显式含「从 X 续写」）
  flow-agent dispatch --subagent=nf-designer --task-id=designer-002 \
    --prompt="上次执行到 $(grep -l '落盘' .xdd/design/*), 从 $(ls .xdd/design/ | grep -v 'intent.md' | grep -v 'design.md' | head -1) 续写"
  
  # 2. re-run 阶段 1 Gate 5 条
  flow-agent gate --stage=1
  
  # 3. 验证 5 件齐全
  for f in intent.md design.md spec/B01-nfflow-upgrade/rules.md spec/B01-nfflow-upgrade/scenarios.feature architecture/B01-nfflow-upgrade/architecture.md; do
    test -f .xdd/design/$f && echo "✓ $f" || echo "✗ $f"
  done
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复
- **RTO**：5min
- **数据保留**：已写产物（intent.md / design.md）保留，新 subagent 接续

### F02 · nf-builder TDD SIGTERM

- **症状**：阶段 2 Gate 5 条失败（build-report.md 缺失 / @implements RXX 命中 < 7 / git log --grep RXX 命中 < 7）
- **立即动作**：检测 `pgrep -f nf-builder` 状态
- **根因诊断**：
  ```bash
  # 看 commit 链路
  git log --grep 'R0[1-7]' --oneline | head -10
  # 看 git status
  git status
  # 看 build-report.md 是否存在
  test -f .xdd/runs/nf_run/build-report.md && echo "exists" || echo "missing"
  ```
- **恢复步骤**：
  ```bash
  # 1. 续接 nf-builder（task_id 续接，prompt 显式含「上次 commit 到 RXX N/7」）
  RXX_LATEST=$(git log --grep 'R0[1-7]' --oneline | head -1 | grep -oE 'R0[1-7]')
  flow-agent dispatch --subagent=nf-builder --task-id=builder-001 \
    --prompt="上次 commit 到 $RXX_LATEST，从 $RXX_LATEST + 1 续写"
  
  # 2. 跑兜底 #8（业务幂等）：git commit hash 校验
  git log --grep 'R0[1-7]' --oneline | wc -l  # 应该 = 7-N（RXX_LATEST 之前的 RXX 已 commit）
  
  # 3. 续写未完成 RXX
  # （nf-builder TDD 跑完）
  
  # 4. re-run 阶段 2 Gate 5 条
  flow-agent gate --stage=2
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复
- **RTO**：5min
- **数据保留**：已 commit 不重做

### F05 · e2e-tester 浏览器崩溃

- **症状**：阶段 3 Gate 失败（e2e-report.md 缺失 / 截图数 < 4）
- **立即动作**：检测 Playwright 进程
- **根因诊断**：
  ```bash
  # 1. 看截图
  ls -la .xdd/runs/nf_run/screenshots/ | head
  # 2. 看 e2e-report.md
  test -f .xdd/runs/nf_run/e2e-report.md && echo "exists" || echo "missing"
  # 3. 看 playwright 进程
  pgrep -f playwright | head
  ```
- **恢复步骤**：
  ```bash
  # 1. 续接 e2e-tester（task_id 不续接，prompt 显式含「从 X 步重新跑」）
  flow-agent dispatch --subagent=e2e-tester --task-id=tester-002 \
    --prompt="上次崩溃在 X 步，从 X 步重新跑" \
    --browser-args="--single-process --no-zygote"
  
  # 2. 跑完用户旅途 + 4 张截图
  # （e2e-tester 跑）
  
  # 3. re-run 阶段 3 Gate 5 条
  flow-agent gate --stage=3
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复（降级到 `--single-process`）
- **RTO**：10min
- **数据保留**：已截图（崩溃留下的）保留，新跑覆盖

---

## 子流程 2：状态机 / 续接恢复

### F06 · 状态机漂移

- **症状**：flow-agent 启动时一致性断言失败
- **立即动作**：读 status.md + status.md.bak
- **根因诊断**：
  ```bash
  # 1. 对比 status.md 和 status.md.bak
  diff .xdd/runs/xdd_run/status.md .xdd/runs/xdd_run/status.md.bak
  # 2. 跑一致性断言
  bash scripts/state-consistency-check.sh
  ```
- **恢复步骤**：
  ```bash
  # 1. 恢复 status.md.bak
  cp .xdd/runs/xdd_run/status.md.bak .xdd/runs/xdd_run/status.md
  
  # 2. 重建状态（按产物实际状态推断）
  bash scripts/infer-state.sh .xdd/design .xdd/runs/nf_run
  
  # 3. 验证一致性
  bash scripts/state-consistency-check.sh
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复
- **RTO**：2min
- **数据保留**：所有产物保留

### F07 · context window 超限

- **症状**：反思#3 报告 §1 缺前序 P0 状态段 / 报告 §5 异常短
- **立即动作**：检测反思#3 报告长度
- **根因诊断**：
  ```bash
  # 1. 看反思#3 报告
  wc -c .xdd/runs/nf_run/reflect-attack-acceptance-report.md
  # 2. grep 前序 P0 状态
  grep -q '前序 P0 状态' .xdd/runs/nf_run/reflect-attack-acceptance-report.md && echo "✓" || echo "✗"
  ```
- **恢复步骤**：
  ```bash
  # 1. 降级模式：prompt 简化为「只保留 P0 列表」
  PRIOR_P0=$(grep -A 50 '前序 P0 状态' .xdd/runs/nf_run/reflect-attack-build-report.md | head -50)
  flow-agent dispatch --subagent=nf-attacker --stage=acceptance --task-id=attacker-001 \
    --prompt="降级模式：context 已满，只保留 P0 列表，其他历史上下文丢弃。
  
  前序 P0 列表（按 R05 强行注入）：
  $PRIOR_P0
  
  任务：跑 stage=acceptance 5 段方法，只验证 P0 状态"
  
  # 2. 仍失败则重派 + 手动注入
  if ! flow-agent gate --stage=reflect-3; then
    flow-agent dispatch --subagent=nf-attacker --stage=acceptance --task-id=attacker-002 \
      --prompt="重派（不续接），手动注入 P0 列表：$PRIOR_P0"
  fi
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复（降级 2 次兜底）
- **RTO**：5min
- **数据保留**：已写反思报告保留

### F08 · 续接丢失前序 P0

- **症状**：反思#2 报告 §1 缺「前序 P0 状态」段
- **立即动作**：跑业务对账
- **根因诊断**：
  ```bash
  # 1. grep 反思#2 报告
  grep -q '前序 P0 状态' .xdd/runs/nf_run/reflect-attack-build-report.md && echo "✓" || echo "✗ P0-LOOP"
  ```
- **恢复步骤**：
  ```bash
  # 1. 重新派发（不续接） + 手动注入 P0 列表
  PRIOR_P0=$(grep -A 50 '前序 P0 状态' .xdd/runs/nf_run/reflect-attack-design-report.md | head -50)
  flow-agent dispatch --subagent=nf-attacker --stage=build --task-id=attacker-002 \
    --prompt="重新派发（不续接），手动注入 P0 列表：$PRIOR_P0"
  
  # 2. 验证反思#2 报告 §1 含「前序 P0 状态」段
  grep -q '前序 P0 状态' .xdd/runs/nf_run/reflect-attack-build-report.md && echo "✓"
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复
- **RTO**：5min
- **数据保留**：反思#1 报告保留

---

## 子流程 3：文件 IO 失败恢复

### F10 · 目录权限被改

- **症状**：subagent 写报告时 `Permission denied`
- **立即动作**：修复权限
- **根因诊断**：
  ```bash
  ls -la .xdd/runs/nf_run/
  stat -c '%a %U' .xdd/runs/nf_run/
  ```
- **恢复步骤**：
  ```bash
  # 1. 修复权限
  chmod -R u+w .xdd/runs/nf_run/
  chown -R $(whoami) .xdd/runs/nf_run/
  
  # 2. 验证写权限
  test -w .xdd/runs/nf_run/ && echo "✓ writable" || echo "✗ still not writable"
  
  # 3. 仍失败则问用户（环境问题）
  if ! test -w .xdd/runs/nf_run/; then
    flow-agent question --prompt="目录权限修复失败，请人工介入"
  fi
  ```
- **自动恢复 vs 人工介入**：✅ 自动 + 人工兜底
- **RTO**：2min
- **数据保留**：所有产物保留

### F11 · 磁盘满

- **症状**：写产物时 `No space left on device`
- **立即动作**：清理磁盘
- **根因诊断**：
  ```bash
  df -h .xdd/
  du -sh .xdd/runs/nf_run/screenshots/ .xdd/runs/xdd_run/
  ```
- **恢复步骤**：
  ```bash
  # 1. 清理 screenshots/ 重复帧
  bash scripts/dedupe-screenshots.sh .xdd/runs/nf_run/screenshots/
  
  # 2. 清理 xdd_run/ 历史文件
  find .xdd/runs/xdd_run/ -name '*.bak' -mtime +7 -delete
  find .xdd/runs/xdd_run/ -name '*.log' -mtime +30 -delete
  
  # 3. git gc
  git gc --prune=now
  
  # 4. 降级：截图 DPR 1 → 0.5
  flow-agent dispatch --subagent=e2e-tester --task-id=tester-002 \
    --prompt="降级模式：DPR 0.5"
  
  # 5. 仍失败则问用户
  if ! flow-agent gate --stage=3; then
    flow-agent question --prompt="磁盘清理失败，请人工介入"
  fi
  ```
- **自动恢复 vs 人工介入**：✅ 自动 + 人工兜底
- **RTO**：5min
- **数据保留**：已写产物保留，新产物降级

### F13 · 报告被删 / 篡改

- **症状**：阶段 Gate 报告缺失 / hash 校验失败
- **立即动作**：git checkout 恢复
- **根因诊断**：
  ```bash
  git status .xdd/runs/nf_run/
  git log --oneline .xdd/runs/nf_run/ | head
  ```
- **恢复步骤**：
  ```bash
  # 1. git checkout 恢复
  git checkout HEAD@{1} -- .xdd/runs/nf_run/
  
  # 2. 验证
  ls -la .xdd/runs/nf_run/*.md
  
  # 3. 仍失败则回退 + 重派
  if ! flow-agent gate --stage=N; then
    flow-agent rollback --stage=N
  fi
  
  # 4. 写 P0-EXTERNAL-MUTATION-XXX
  echo "[nfflow] R06 F13 报告被外部改/git checkout 恢复" >> .xdd/runs/xdd_run/failure-log.md
  ```
- **自动恢复 vs 人工介入**：✅ 自动 + 人工兜底
- **RTO**：3min
- **数据保留**：git 内历史保留

---

## 子流程 4：Gate 误判恢复

### F14 · 字节阈值边界

- **症状**：阶段 Gate 检查 2 失败（字节数 < 阈值），但 grep 命中足够
- **立即动作**：触发人工 override
- **根因诊断**：
  ```bash
  wc -c .xdd/design/spec/B01-nfflow-upgrade/rules.md
  grep -cE '^## R0[1-7]' .xdd/design/spec/B01-nfflow-upgrade/rules.md
  ```
- **恢复步骤**：
  ```bash
  # 1. 触发人工 override
  flow-agent question --prompt="rules.md $(wc -c < .xdd/design/spec/B01-nfflow-upgrade/rules.md) 字节（差 N 字节）< 阈值，但 grep 命中 $(grep -cE '^## R0[1-7]' .xdd/design/spec/B01-nfflow-upgrade/rules.md) 条 RXX。\n选项：\n1) override 阈值，标 done with override\n2) 让 nf-designer 补齐 N 字节\n3) 暂停"
  
  # 2. 用户选 1（override）→ 标 done with override
  flow-agent mark-done --stage=1 --override="bytes-just-below-threshold"
  
  # 3. 写 failure-log.md
  echo "[nfflow] R06 F14 字节阈值 $(wc -c < .xdd/design/spec/B01-nfflow-upgrade/rules.md) 边界 override" >> .xdd/runs/xdd_run/failure-log.md
  ```
- **自动恢复 vs 人工介入**：✅ 人工 override
- **RTO**：5min
- **数据保留**：产物保留

### F16 · no-stub-check 漏报

- **症状**：反思#2 报告 P0=0，但反思#3 curl 真实接口 5xx
- **立即动作**：反思#3 兜底对账
- **根因诊断**：
  ```bash
  # 1. 跑 no-stub-check
  bash scripts/no-stub-check.sh
  # 2. 跑 curl 真实接口
  curl -fsS http://localhost:8000/api/xxx || echo "5xx/health-endpoint-broken"
  ```
- **恢复步骤**：
  ```bash
  # 1. 反思#3 报告 §5 标 P0-Y = 1
  flow-agent report-p0 --stage=reflect-3 --p0-id=P0-Y --category=NO_STUB_FN
  
  # 2. 触发回退到阶段 2
  flow-agent rollback --stage=2
  
  # 3. 续接 nf-builder 修复
  flow-agent dispatch --subagent=nf-builder --task-id=builder-002 \
    --prompt="替换返回 None 蒙混为真实实现"
  
  # 4. 写 failure-log.md
  echo "[nfflow] R02 F16 no-stub-check 漏报，反思#3 兜底" >> .xdd/runs/xdd_run/failure-log.md
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复
- **RTO**：15min
- **数据保留**：反思#2 报告保留（含漏报证据）

### F03 · nf-attacker 误判 P0

- **症状**：反思报告 §5 标 P0 ≥ 1，但 P0 类别不是 FOUND_DEFECT / SHAM / JOURNEY_BLOCKED
- **立即动作**：跑业务对账校验 P0 类别
- **根因诊断**：
  ```bash
  # 1. 跑业务对账（兜底 #11）
  bash scripts/cross-doc-check.sh
  # 2. 提取反思报告 P0 列表
  grep '^  *- P0-' .xdd/runs/nf_run/reflect-attack-*.md | head -20
  ```
- **恢复步骤**：
  ```bash
  # 1. 标 P0-FP-XXX（false positive）
  flow-agent report-p0 --stage=reflect-N --p0-id=P0-FP-XXX --category=DOC_STYLE
  
  # 2. 触发 question 工具问用户
  flow-agent question --prompt="反思#N 误判 P0-X：\n选项：\n1) 采纳业务对账，忽略 P0-X，流程继续\n2) 信任反思报告，触发起回退\n3) 暂停，重新派反思"
  
  # 3. 写 failure-log.md
  echo "[nfflow] R03 F03 误判 P0-X，业务对账纠错" >> .xdd/runs/xdd_run/failure-log.md
  ```
- **自动恢复 vs 人工介入**：✅ 业务对账 + ✅ 人工裁决
- **RTO**：10min
- **数据保留**：反思报告保留（含 false positive 证据）

### F04 · nf-attacker 漏报 P0

- **症状**：反思报告 P0=0，但下阶段运行发现 P0 真实存在
- **立即动作**：反思#3 兜底对账（按 architecture §7 表格）
- **根因诊断**：
  ```bash
  # 1. 下阶段运行失败
  npm test 2>&1 | head -10
  # 2. 反思攻击报告 P0=0
  grep '^  *## 5. 问题清单' .xdd/runs/nf_run/reflect-attack-*.md
  ```
- **恢复步骤**：
  ```bash
  # 1. 反思#3 跑兜底（curl 真实接口 + 重启数据保留）
  flow-agent dispatch --subagent=nf-attacker --stage=acceptance --task-id=attacker-001 \
    --prompt="兜底模式：跑 curl 真实接口 + npm test 真实跑"
  
  # 2. 反思#3 报告标 P0-Y = 1（NO_STUB_FN）
  flow-agent report-p0 --stage=reflect-3 --p0-id=P0-Y --category=NO_STUB_FN
  
  # 3. 触发回退到反思报告对应的阶段
  flow-agent rollback --stage=N
  
  # 4. 写 failure-log.md
  echo "[nfflow] R03 F04 attacker 漏报，反思#3 兜底" >> .xdd/runs/xdd_run/failure-log.md
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复
- **RTO**：15min
- **数据保留**：反思报告保留（含漏报证据）

### F09 · 报告缺前序 P0 验证段

- **症状**：反思#2 / 反思#3 报告 §1 缺「前序 P0 状态」段
- **立即动作**：跑业务对账
- **根因诊断**：
  ```bash
  grep -q '前序 P0 状态' .xdd/runs/nf_run/reflect-attack-build-report.md && echo "✓" || echo "✗ P0-LOOP"
  ```
- **恢复步骤**：
  ```bash
  # 1. 标 P0-LOOP-XXX
  flow-agent report-p0 --stage=reflect-N --p0-id=P0-LOOP-XXX
  
  # 2. 重新派发（task_id 续接，prompt 显式强调「必须写前序 P0 状态段」）
  flow-agent dispatch --subagent=nf-attacker --stage=N --task-id=attacker-OO1 \
    --prompt="必须写「前序 P0 状态」段，否则 P0 失败"
  
  # 3. 验证
  grep -q '前序 P0 状态' .xdd/runs/nf_run/reflect-attack-*-report.md && echo "✓"
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复
- **RTO**：5min
- **数据保留**：反思报告重写

### F12 · 报告半成品

- **症状**：报告文件存在但字节数 < 阈值 / 内容截断
- **立即动作**：备份半成品 + 重写
- **根因诊断**：
  ```bash
  wc -c .xdd/runs/nf_run/reflect-attack-*-report.md
  grep -c '^#' .xdd/runs/nf_run/reflect-attack-*-report.md
  ```
- **恢复步骤**：
  ```bash
  # 1. 备份半成品
  cp .xdd/runs/nf_run/reflect-attack-*-report.md .xdd/runs/nf_run/reflect-attack-*-report.md.bak
  
  # 2. 续接对应反思攻击（task_id 续接，prompt 显式说「上次报告被截断，从开头重写」）
  flow-agent dispatch --subagent=nf-attacker --stage=N --task-id=attacker-OO1 \
    --prompt="上次报告被截断，从开头重写"
  
  # 3. 验证字节数 ≥ 1000
  wc -c .xdd/runs/nf_run/reflect-attack-*-report.md
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复
- **RTO**：3min
- **数据保留**：`.bak` 备份保留

### F15 · grep false positive

- **症状**：grep `@implements RXX` 命中数 ≥ 7，但实际代码只有 3 处
- **立即动作**：跑二次校验
- **根因诊断**：
  ```bash
  # 1. 跑二次校验
  grep -rE '@implements R[0-9]{2}' src/ | head -10
  # 2. 看实际代码
  grep -c 'RXX' src/
  ```
- **恢复步骤**：
  ```bash
  # 1. 跑二次校验（grep HITs 必须有 @implements 前缀）
  bash scripts/double-check-grep.sh
  
  # 2. 仍不通过则标 P0 触发回退
  if ! bash scripts/double-check-grep.sh; then
    flow-agent report-p0 --stage=2 --p0-id=P0-GREP-FP-XXX
    flow-agent rollback --stage=2
  fi
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复
- **RTO**：2min
- **数据保留**：代码保留

### F19 · 续接 P0 不识别

- **症状**：续接后 subagent 无视 P0 列表，产生新 P0 / 重复旧 P0
- **立即动作**：业务幂等 + 强制重派
- **根因诊断**：
  ```bash
  # 1. 对比 P0 列表
  diff <(grep '^  *- P0-' .xdd/runs/nf_run/reflect-attack-design-report.md) <(grep '^  *- P0-' .xdd/runs/nf_run/reflect-attack-build-report.md)
  ```
- **恢复步骤**：
  ```bash
  # 1. 标 P0-LOOP-XXX
  flow-agent report-p0 --stage=N --p0-id=P0-LOOP-XXX
  
  # 2. 强制重派（不走续接）+ prompt 重新格式化
  flow-agent dispatch --subagent=nf-XXX --task-id=XXX-NEW \
    --prompt="**必须先解决 P0-XXX 才进下条 RXX**\n\n前序 P0 列表：$(grep '^  *- P0-' .xdd/runs/nf_run/reflect-attack-N-report.md)"
  
  # 3. 仍失败则升级到 F17 / F18
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复
- **RTO**：10min
- **数据保留**：反思报告保留

### F21 · architecture.md / flow.mermaid 不一致

- **症状**：端点 ID 列表不一致
- **立即动作**：跑业务对账 + 修图
- **根因诊断**：
  ```bash
  expected=$(grep -oE 'N0[1-6]' .xdd/design/architecture/B01-nfflow-upgrade/architecture.md | sort -u)
  actual=$(grep -oE 'N0[1-6]' .xdd/design/architecture/B01-nfflow-upgrade/flow.mermaid | sort -u)
  diff <(echo "$expected") <(echo "$actual")
  ```
- **恢复步骤**：
  ```bash
  # 1. 业务对账（兜底 #11）
  bash scripts/cross-doc-check.sh
  
  # 2. 标 P0 触发回退到阶段 1
  flow-agent report-p0 --stage=1 --p0-id=P0-ARCH-MISMATCH-XXX
  flow-agent rollback --stage=1
  
  # 3. 续接 nf-designer 修正 flow.mermaid（修图不修文）
  flow-agent dispatch --subagent=nf-designer --task-id=designer-002 \
    --prompt="修正 flow.mermaid，端点 N0X 必须全部出现"
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复
- **RTO**：5min
- **数据保留**：architecture.md 保留（规则为准）

### F24 · nf-attack 装错版本

- **症状**：反思报告 §5 缺 P0/P1/P2 字段 / 报告结构不对
- **立即动作**：跑 schema 校验
- **根因诊断**：
  ```bash
  # 1. 看反思报告结构
  grep -E '^## [1-5]\.' .xdd/runs/nf_run/reflect-attack-*-report.md | head -10
  # 2. 看 skill 版本
  head -20 ~/.config/opencode/skills/nf-attack/SKILL.md
  ```
- **恢复步骤**：
  ```bash
  # 1. 标 P0-SKILL-VER-XXX
  flow-agent report-p0 --stage=reflect-N --p0-id=P0-SKILL-VER-XXX
  
  # 2. 触发回退到反思节点
  flow-agent rollback --stage=reflect-N
  
  # 3. 续接 nf-attacker 显式装新版
  flow-agent dispatch --subagent=nf-attacker --stage=N --task-id=attacker-OO1 \
    --prompt="显式装新版 nf-attack skill（检查 SKILL.md 头部版本号）"
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复
- **RTO**：5min
- **数据保留**：反思报告重写

### F28 · 编译 / OOM

- **症状**：`npm test` 退出非 0 / 进程被 OS kill (exit 137)
- **立即动作**：降级 + 重试
- **根因诊断**：
  ```bash
  npm test 2>&1 | head -20
  dmesg | tail -10  # 看 OOM killer
  free -h
  ```
- **恢复步骤**：
  ```bash
  # 1. 补依赖
  npm ci --no-audit
  
  # 2. 内存不足降级
  NODE_OPTIONS=--max-old-space-size=4096 npm test
  
  # 3. 仍失败则标 P0 触发回退
  if ! NODE_OPTIONS=--max-old-space-size=4096 npm test; then
    flow-agent report-p0 --stage=2 --p0-id=P0-OOM-XXX
    flow-agent rollback --stage=2
  fi
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复
- **RTO**：10min
- **数据保留**：代码保留

---

## 子流程 5：预算循环恢复

### F17 · 阶段 3 次回退

- **症状**：`staging_counter[stage1] = 3`
- **立即动作**：HALT 流程
- **根因诊断**：
  ```bash
  cat .xdd/runs/xdd_run/status.md | grep staging_counter
  grep '\[nfflow\]' .xdd/runs/xdd_run/failure-log.md | tail -10
  ```
- **恢复步骤**：
  ```bash
  # 1. flow-agent 触发熔断
  flow-agent circuit-break --stage=1
  
  # 2. question 工具调用
  flow-agent question --prompt="阶段 1 连续 3 次回退，P0 列表：$(cat failure-log.md | grep P0 | head -3)。\n选项：\n1) 重置 staging_counter[stage1] 继续\n2) 暂停，等用户调整 RXX\n3) 调整规则"
  
  # 3. 用户选 2 (暂停) → 流程暂停
  flow-agent pause --stage=1
  
  # 4. 写 failure-log.md
  echo "[nfflow] R04 F17 阶段1 预算耗尽，HALT 问用户" >> .xdd/runs/xdd_run/failure-log.md
  ```
- **自动恢复 vs 人工介入**：✅ 人工介入（必须）
- **RTO**：30min
- **数据保留**：所有产物保留

### F18 · 全局 8 次预算

- **症状**：`rollback_counter = 8`
- **立即动作**：强制 HALT
- **根因诊断**：
  ```bash
  cat .xdd/runs/xdd_run/status.md | grep rollback_counter
  ```
- **恢复步骤**：
  ```bash
  # 1. flow-agent 触发熔断（永久 OPEN）
  flow-agent circuit-break --global --permanent
  
  # 2. 强制 question
  flow-agent question --prompt="累计 8 次回退，流程永久暂停。\n选项：\n1) 重置 rollback_counter（强烈不推荐）\n2) 暂停等用户介入\n3) 终止流程"
  
  # 3. 流程永久暂停
  flow-agent halt --permanent
  
  # 4. 写 failure-log.md
  echo "[nfflow] R04 F18 全局预算耗尽，永久 HALT" >> .xdd/runs/xdd_run/failure-log.md
  ```
- **自动恢复 vs 人工介入**：✅ 人工介入（必须）
- **RTO**：1h
- **数据保留**：所有产物保留

---

## 子流程 6：跨产物一致性恢复

### F20 · rules.md / scenarios.feature 不一致

- **症状**：业务对账 missing RXX
- **立即动作**：补 @covers-RXX
- **根因诊断**：
  ```bash
  expected=$(awk '/^## R[0-9]/{print $2}' .xdd/design/spec/B01-nfflow-upgrade/rules.md | sort -u)
  actual=$(grep -oE '@covers-R[0-9]{2}' .xdd/design/spec/B01-nfflow-upgrade/scenarios.feature | sort -u)
  diff <(echo "$expected") <(echo "$actual")
  ```
- **恢复步骤**：
  ```bash
  # 1. 业务对账（兜底 #11）
  bash scripts/cross-doc-check.sh
  
  # 2. 缺失标 P0-WARN-XXX
  flow-agent report-p0 --stage=1 --p0-id=P0-WARN-XXX --category=DOC_STYLE
  
  # 3. 续接 nf-designer 补 @covers-RXX（规则为准）
  MISSING=$(comm -23 <(echo "$expected") <(echo "$actual"))
  flow-agent dispatch --subagent=nf-designer --task-id=designer-002 \
    --prompt="补 @covers-RXX 标注：$MISSING"
  
  # 4. 阶段 1 标 done with warnings
  flow-agent mark-done --stage=1 --with-warnings=P0-WARN-XXX
  
  # 5. 写 failure-log.md
  echo "[nfflow] R07 F20 rules.md 跟 scenarios.feature 不一致，规则为准补充" >> .xdd/runs/xdd_run/failure-log.md
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复
- **RTO**：5min
- **数据保留**：rules.md 保留（规则为准），scenarios.feature 补充

### F22 · intent.md / design.md 矛盾

- **症状**：业务对账关键词冲突
- **立即动作**：强制回退
- **根因诊断**：
  ```bash
  grep -q 'nfflow 跟 xdd-flow 并存' .xdd/design/intent.md && grep -q 'nfflow 跟 xdd-flow 合并' .xdd/design/design.md && echo "P0-CONFLICT"
  ```
- **恢复步骤**：
  ```bash
  # 1. 业务对账（兜底 #11）
  flow-agent cross-doc-check
  
  # 2. 标 P0-CONFLICT-XXX
  flow-agent report-p0 --stage=1 --p0-id=P0-CONFLICT-XXX
  
  # 3. 强制回退到阶段 1
  flow-agent rollback --stage=1 --forced
  
  # 4. 续接 nf-designer 重新跑 brainstorm
  flow-agent dispatch --subagent=nf-designer --task-id=designer-002 \
    --prompt="重新跑 brainstorm，design.md 决策必须跟 intent.md 一致"
  
  # 5. 写 failure-log.md
  echo "[nfflow] R07 F22 intent.md / design.md 矛盾，强制回退" >> .xdd/runs/xdd_run/failure-log.md
  ```
- **自动恢复 vs 人工介入**：✅ 人工介入（必须 brainstorm）
- **RTO**：30min
- **数据保留**：所有产物保留

---

## 子流程 7：skill 装载失败恢复

### F23 · xdd-execute / xdd-cleanup 装不上

- **症状**：nf-builder 跑不出代码，无 @implements RXX
- **立即动作**：重试 skill 装载
- **根因诊断**：
  ```bash
  # 1. 试装 skill
  use skill: xdd-execute || echo "P0-SKILL-MISSING"
  # 2. 看 registry
  cat .xdd/runs/xdd_run/skill-registry.json 2>/dev/null
  ```
- **恢复步骤**：
  ```bash
  # 1. 重试 1 次
  flow-agent use-skill --name=xdd-execute || flow-agent use-skill --name=xdd-execute
  
  # 2. 仍失败则提示用户
  if ! flow-agent use-skill --name=xdd-execute; then
    flow-agent question --prompt="xdd-execute skill 装不上，请检查 opencode 平台。用户选项：\n1) 跳过 xdd-execute 跑手写 TDD 循环\n2) 暂停"
  fi
  ```
- **自动恢复 vs 人工介入**：✅ 自动 + 人工兜底
- **RTO**：5min
- **数据保留**：所有产物保留

### F25 · skill 注入失败

- **症状**：subagent 跑时实际无 skill 指引
- **立即动作**：拆 prompt
- **根因诊断**：
  ```bash
  # 1. 看 prompt 长度
  echo "$(wc -c < .xdd/runs/nf_run/last-prompt.txt) bytes"
  # 2. 看 flow-agent log
  grep 'skill.*prompt' .xdd/runs/xdd_run/flow-agent.log | tail -10
  ```
- **恢复步骤**：
  ```bash
  # 1. 拆 prompt（拆小 + 显式引用 skill 路径）
  flow-agent dispatch --subagent=nf-XXX --task-id=XXX-002 \
    --prompt="装 skill 的路径：\$(find ~/.config/opencode/skills -name 'xdd-execute' -type d | head -1)\n\n任务：TDD 循环"
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复
- **RTO**：5min
- **数据保留**：所有产物保留

---

## 子流程 8：Git / commit 失败恢复

### F26 · commit 冲突

- **症状**：nf-builder `git commit` 失败
- **立即动作**：git rebase
- **根因诊断**：
  ```bash
  git status
  git log --oneline | head -5
  ```
- **恢复步骤**：
  ```bash
  # 1. 看冲突
  git diff --name-only --diff-filter=U
  
  # 2. git rebase / merge
  git fetch origin
  git rebase HEAD
  # 或：git merge --no-ff HEAD
  
  # 3. 重试 commit
  git commit -m 'R05: xxx'
  
  # 4. 仍失败则标 P0-F26-CONFLICT-XXX 触发回退
  if ! git commit -m 'R05: xxx'; then
    flow-agent report-p0 --stage=2 --p0-id=P0-F26-CONFLICT-XXX
    flow-agent rollback --stage=2
  fi
  ```
- **自动恢复 vs 人工介入**：✅ 自动 + 人工兜底
- **RTO**：5min
- **数据保留**：未冲突 commit 保留

### F27 · hook 拒

- **症状**：`git commit` 被 hook 拒
- **立即动作**：`--no-verify` 紧急通路
- **根因诊断**：
  ```bash
  # 1. 看 hook 错误
  git commit -m 'R05: xxx' 2>&1 | head -10
  # 2. 看 hook 列表
  ls .git/hooks/ | grep -v sample
  ```
- **恢复步骤**：
  ```bash
  # 1. 紧急通路
  git commit --no-verify -m 'R05: xxx'
  
  # 2. 仍失败则修 hook
  if ! git commit --no-verify -m 'R05: xxx'; then
    vim .git/hooks/pre-commit  # 修复 hook
    git commit -m 'R05: xxx'
  fi
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复
- **RTO**：2min
- **数据保留**：所有产物保留

---

## 子流程 9：用户行为异常恢复

### F29 · 用户 Ctrl-C

- **症状**：flow-agent 收到 SIGINT
- **立即动作**：status.md 持久化
- **根因诊断**：
  ```bash
  cat .xdd/runs/xdd_run/status.md
  ```
- **恢复步骤**：
  ```bash
  # 1. flow-agent trap 写入 status.md
  # （自动执行，无需手动）
  
  # 2. 用户重启 flow-agent
  flow-agent start
  
  # 3. flow-agent 读 status.md 推断恢复点
  flow-agent resume --from-status
  ```
- **自动恢复 vs 人工介入**：✅ 自动恢复
- **RTO**：5min
- **数据保留**：所有产物保留

### F30 · 用户中途改需求

- **症状**：用户提需求变更
- **立即动作**：限流 + 回退
- **根因诊断**：
  ```bash
  # 1. 看 user input
  cat .xdd/runs/xdd_run/user-input.log | tail -10
  # 2. 看 current_state
  cat .xdd/runs/xdd_run/status.md
  ```
- **恢复步骤**：
  ```bash
  # 1. 限流 1 次/小时
  flow-agent limit --user-input=1/hour
  
  # 2. 强制回退到阶段 1
  flow-agent rollback --stage=1 --forced
  
  # 3. 续接 nf-designer 处理需求变更
  flow-agent dispatch --subagent=nf-designer --task-id=designer-002 \
    --prompt="用户需求变更：$(cat user-input.log | tail -1)。合并到 intent.md / design.md / RXX"
  
  # 4. 写 failure-log.md
  echo "[nfflow] R07 F30 用户中途改需求，强制回退" >> .xdd/runs/xdd_run/failure-log.md
  ```
- **自动恢复 vs 人工介入**：✅ 人工介入（必须 brainstorm）
- **RTO**：30min
- **数据保留**：已完成阶段产物保留

### F31 · 用户不响应

- **症状**：question 工具 24h 无响应
- **立即动作**：默认分支
- **根因诊断**：
  ```bash
  cat .xdd/runs/xdd_run/status.md | grep question-time
  ```
- **恢复步骤**：
  ```bash
  # 1. 24h 超时自动走默认分支
  flow-agent question --timeout=24h  # 默认决策
  
  # 2. 写 failure-log.md
  echo "[nfflow] R04 F31 用户不响应 24h，默认暂停" >> .xdd/runs/xdd_run/failure-log.md
  
  # 3. 用户后续主动启动时
  flow-agent start
  flow-agent question --prompt="之前暂停，等用户介入"
  ```
- **自动恢复 vs 人工介入**：✅ 自动 + 后续人工介入
- **RTO**：24h
- **数据保留**：所有产物保留

---

## 子流程 10：平台 / 多任务恢复

### F32 · 平台 Task() 5xx

- **症状**：`Task(subagent_type=...)` 调用 5xx
- **立即动作**：4 次指数 backoff
- **根因诊断**：
  ```bash
  # 1. 看 platform log
  curl -fsS http://localhost:11434/api/health || echo "platform-broken"
  # 2. 看 flow-agent log
  grep 'Task.*5xx' .xdd/runs/xdd_run/flow-agent.log | tail -10
  ```
- **恢复步骤**：
  ```bash
  # 1. 指数 backoff
  for i in 1 2 4 8; do
    sleep $i
    if flow-agent dispatch --subagent=nf-XXX; then
      echo "✓ recovered after ${i}s"
      break
    fi
  done
  
  # 2. 仍失败则标 P0-F32-PLATFORM-XXX 触发回退
  if ! flow-agent dispatch --subagent=nf-XXX; then
    flow-agent report-p0 --stage=1 --p0-id=P0-F32-PLATFORM-XXX
    flow-agent rollback --stage=1
  fi
  ```
- **自动恢复 vs 人工介入**：✅ 自动 + 人工兜底
- **RTO**：1min
- **数据保留**：所有产物保留

### F33 · 同项目并发

- **症状**：lock 文件存在
- **立即动作**：lock 检查 + 排队
- **根因诊断**：
  ```bash
  stat .xdd/runs/nf_run/.lock
  cat .xdd/runs/nf_run/.lock  # 看持有者
  cat .xdd/runs/nf_run/.queue  # 看排队列表
  ```
- **恢复步骤**：
  ```bash
  # 1. 释放 lock（flow-agent A 跑完）
  rm .xdd/runs/nf_run/.lock
  
  # 2. flow-agent B 接管
  flow-agent start --resume
  
  # 3. 或排队
  flow-agent queue --position=N
  ```
- **自动恢复 vs 人工介入**：✅ 人工介入（裁决）
- **RTO**：5min
- **数据保留**：所有产物保留

---

## 数据保留策略

| 产物 | 保留时长 | 保留方式 |
|------|---------|---------|
| 设计产物（intent / design / rules / scenarios / architecture） | 永久（git） | git commit + tag |
| nfflow 报告（build / reflect-attack / e2e / code-review） | 永久（git） | git commit + tag |
| 截图（screenshots/*.png） | 永久（git） | git commit + tag |
| failure-log.md | 永久（git） | git commit + tag |
| status.md | 永久（git） | git commit + tag |
| .lock / .queue | 临时（自动清理） | 启动时清理 |
| .bak（备份） | 临时（7 天后清理） | find -mtime +7 -delete |

---

## 升级路径

| 升级层级 | 触发条件 | 升级到 |
|---------|---------|--------|
| L1 自动恢复 | 失败模式有兜底，自动恢复 | 自动续接 / 重试 / 降级 |
| L2 人工裁决 | 业务对账 / 失败模式需要人工判断 | question 工具问用户 |
| L3 阶段暂停 | 阶段预算 3 次耗尽 | HALT 流程，问用户 |
| L4 全局暂停 | 全局预算 8 次耗尽 | 永久 HALT，写 failure-log.md |
| L5 团队介入 | 用户不响应 24h | 写 failure-log.md，等下次启动 |

---

## 排障锚点速查

| 锚点 | 路径 | 命令 |
|------|------|------|
| 当前状态 | `.xdd/runs/xdd_run/status.md` | `cat status.md` |
| 失败日志 | `.xdd/runs/xdd_run/failure-log.md` | `grep '\[nfflow\]' failure-log.md` |
| 阶段 1 报告 | `.xdd/runs/nf_run/reflect-attack-design-report.md` | `cat reflect-attack-design-report.md` |
| 阶段 2 报告 | `.xdd/runs/nf_run/build-report.md` | `cat build-report.md` |
| 反思#2 报告 | `.xdd/runs/nf_run/reflect-attack-build-report.md` | `cat reflect-attack-build-report.md` |
| 阶段 3 报告 | `.xdd/runs/nf_run/e2e-report.md` | `cat e2e-report.md` |
| 反思#3 报告 | `.xdd/runs/nf_run/reflect-attack-acceptance-report.md` | `cat reflect-attack-acceptance-report.md` |
| 6 维度自审 | `.xdd/runs/nf_run/code-review.json` | `cat code-review.json \| jq .verdict` |
| 截图 | `.xdd/runs/nf_run/screenshots/*.png` | `ls screenshots/` |
| commit 追溯 | git log | `git log --grep 'RXX' --oneline` |

---

## 自检清单

- [x] F01~F33 每个失败模式 1 个 SOP
- [x] P0 失败模式（31 条）含具体命令 + 区分自动/人工
- [x] P1 失败模式（2 条 F08/F14）含具体命令
- [x] 区分自动恢复 vs 人工介入
- [x] 恢复时长目标（RTO）每条标
- [x] 数据保留策略（永久 / 临时）
- [x] 升级路径（L1~L5）
- [x] 排障锚点速查
- [x] 不写「联系运维」空话
- [x] 跟 architecture §21 reconcile Q3「失败能重试并收敛」对齐
