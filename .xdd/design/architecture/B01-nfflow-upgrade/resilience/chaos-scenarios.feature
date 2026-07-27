# language: zh-CN
# nfflow resilience — 混沌场景（@chaos）
# 编排系统特有：subagent 失败 / task_id 续接 / 跨产物一致性 / 预算循环。
# 每个 chaos 场景对应 failure-modes.md 的 FXX + 兜底策略。
# 注入命令必须具体（不是"模拟网络故障"空话）。
# 5 类真注入：subagent 崩溃 / 上下文超限 / 文件 IO / 阈值边界 / 续接失败 / 预算耗尽。

@B01-nfflow-upgrade @chaos @failure-mode-F02 @P0
Feature: 阶段2 nf-builder TDD 写到一半被 SIGTERM 杀掉 → 重启后能从断点继续
  @covers-R02

  Background: 共享前置
    Given flow-agent 在阶段2 in_progress
      And 阶段1 5 件设计产物齐全（R01~R07 共 7 条 RXX）
      And flow-agent 派 nf-builder（task_id=builder-001）跑 TDD
      And nf-builder 已跑完 R01~R03 的 TDD 循环（3 条 commit 已落）

  Scenario: 注入 SIGTERM → 续接后从 R04 继续
    Given nf-builder 正在写 R04 的 `@implements R04` 最小实现
    When 注入: `kill -SIGTERM $(pgrep -f "nf-builder.*R04")`
      And 等待 5 秒
    Then nf-builder 进程消失（pgrep 命中 0）
      And 阶段 2 Gate 5 条全部失败（检查 1 build-report.md 缺失 / 检查 3 @implements RXX 命中 = 3 < 7 / 检查 5 commit 追溯 = 3 < 7）
      And flow-agent 在 status.md 标 P0-F02-SIGTERM-XXX
    When flow-agent 续接 nf-builder（task_id=builder-001，prompt 显式含「上次执行到 R03/7，被中断，从 R04 续写，不要重写 R01~R03」）
    Then nf-builder 跑 git status, 看到 R01~R03 已 commit（`git log --grep 'R0[1-3]' --oneline` 命中 3 条）
      And 续接产物：R04~R07 共 4 条 RXX 全部 @implements RXX 标注
      And re-run 阶段 2 Gate 5 条全部通过：
        | 检查 | 实际 | 阈值 |
        | 1. build-report.md 落盘 | 存在 | 落盘 |
        | 2. build-report.md 字节数 | ≥ 1100 | ≥ 1000 |
        | 3. @implements RXX grep | 7 | ≥ 7 |
        | 4. no-stub-check | 0 命中 | 0 命中 |
        | 5. git log --grep RXX | 7 | ≥ 7 |
      And failure-log.md 追加 `[nfflow] R02 F02 SIGTERM 续接成功 R04~R07`

@B01-nfflow-upgrade @chaos @failure-mode-F07 @P0
Feature: 反思#3 续接时上下文超限 → 降级到「只保留 P0 列表」
  @covers-R05

  Background: 共享前置
    Given 反思#1 完成，产出 P0 列表 [P0-A, P0-B, P0-C, P0-D, P0-E]（5 条 P0）
      And 反思#2 完成，续接反思#1，产出 P0 列表 [P0-F, P0-G]（2 条 P0）
      And 反思#2 报告 §1 阶段产物状态段含「前序 P0 状态：P0-A 已修 / P0-B 已修 / P0-C 未修 / P0-D 已修 / P0-E 未修」
      And flow-agent 准备派反思#3（task_id=attacker-001 续接反思#2）

  Scenario: 注入 context window 超限 → 降级到只保留 P0 列表
    Given 反思#3 prompt 注入超长前序上下文（注入 200KB 伪造历史攻击报告，模拟 context window 已满）
    When 注入: 在反思#3 prompt 头部追加 `<!-- CHAOS: context-overflow -->` 触发 LLM context window 超限
      And flow-agent 派反思#3
    Then 反思#3 抛出 `context length exceeded` 或返回极短输出
      And flow-agent 检测「反思#3 报告 §1 缺前序 P0 状态段 / 报告 §5 列表异常短 < 5 条」→ 降级模式触发
    When flow-agent 走降级路径：prompt 改成「**只保留 P0 列表**」模式（task 重点场景）
    Then 反思#3 重跑 prompt 简化为：
      ```
      前序 P0 列表（按 R05 强行注入）：
      - P0-A: 已修
      - P0-B: 已修
      - P0-C: 未修
      - P0-D: 已修
      - P0-E: 未修
      - P0-F: 阶段 2 已修
      - P0-G: 阶段 2 未修

      任务：跑 stage=acceptance 5 段方法，只验证 P0-G 是否在阶段3 修复，其他历史上下文丢弃。
      ```
      And 反思#3 报告 §1 阶段产物状态段含「前序 P0 状态（P0-G 状态）：已修 / 未修」
      And 反思#3 报告 §5 含 P0-G 状态（P0-G 真实 + 必要的 P0/P1/P2 列表）
      And failure-log.md 追加 `[nfflow] R05 F07 context 超限降级到「只保留 P0 列表」`

  Scenario: 降级仍失败 → 重派 attacker（不续接）+ 手动注入 P0 列表
    Given 降级模式仍失败（重复 2 次）
    When flow-agent 重派 nf-attacker（task_id-001 不续接，新 task_id=attacker-002）
      And prompt 显式手动注入前序 P0 列表 [P0-A, P0-B, P0-C, P0-D, P0-E, P0-F, P0-G] + 状态
    Then 反思#3 跑通，报告 §1 阶段产物状态段含「前序 P0 状态」段
      And 反思#3 报告 §5 含完整 P0/P1/P2 列表
      And failure-log.md 追加 `[nfflow] R05 F07 降级仍失败，重派 attacker + 手动注入 P0 列表`

@B01-nfflow-upgrade @chaos @failure-mode-F14 @P1
Feature: Gate 字节阈值边界误判 → 应允许人工 override
  @covers-R06

  Background: 共享前置
    Given flow-agent 跑阶段 1 Gate 5 条硬检查
      And 阶段 1 产物 rules.md 字节数 = 199（< 200 阈值）

  Scenario: 注入 1 字节差异 → 触发人工 override
    Given 注入: `truncate -s 199 .xdd/design/spec/B01-nfflow-upgrade/rules.md`
    When flow-agent 跑检查 2 字节数（`wc -c`）
    Then 检查 2 失败（199 < 200 阈值）
      And 检查 1 产物落盘通过 / 检查 3 grep 命中 7 条 RXX 通过
      And flow-agent 触发「**降级 + 人工 override**」兜底（task 重点场景）
    When flow-agent 用 `question` 工具问用户：
      """
      `rules.md` 199 字节差 1（< 200 阈值），但语义足够（grep 命中 7 条 RXX）。
      选项：
      1) override 阈值，标 done with override，继续
      2) 让 nf-designer 补齐 1 字节（追加注释），重新跑 Gate
      3) 暂停，人工修补
      """
    Then 用户选 1 (override)
      And flow-agent 标阶段 1 为「done with override」
      And failure-log.md 追加 `[nfflow] R06 F14 字节阈值 199 边界 override（grep 命中 7 条够）`
      And 流程继续到反思#1

@B01-nfflow-upgrade @chaos @failure-mode-F17 @P0
Feature: 阶段预算耗尽 → HALT 用 question 问用户
  @covers-R04

  Background: 共享前置
    Given flow-agent 内部 `staging_counter[stage1] = 3`（阶段1 连续 3 次回退）
      And 反思#1 仍 P0 ≥ 1（每次回退后重跑反思#1 失败）

  Scenario: 注入 3 次阶段回退 → HALT 问用户
    Given 注入: 阶段 1 连续 3 次回退（每次 P0 都标「scenarios.feature 缺密码错误兜底场景」）
    When flow-agent 检测 `staging_counter[stage1] = 3`
    Then flow-agent 触发熔断（task 重点场景）：
      - 阶段 1 subagent 停止续接（熔断 CLOSED → OPEN）
      - 流程暂停（不自动重启）
      - question 工具调用：
        ```
        阶段1 连续 3 次回退失败，P0 列表重复：
        - P0-A: scenarios.feature 缺密码错误兜底场景
        - P0-B: 端点列表不完整
        - P0-C: rules.md 跟 scenarios.feature 不一致

        选项：
        1) 继续自动回退（重置 staging_counter[stage1]）
        2) 暂停，等用户调整 RXX 后重跑
        3) 调整规则（在 RXX 上加 P0-D 双跑兜底）
        ```
    And 用户选 2 (暂停)
      And flow-agent 标 P0-F17-STALL-XXX
      And failure-log.md 追加 `[nfflow] R04 F17 阶段1 预算耗尽，HALT 问用户`
      And 流程暂停（如用户重启，flow-agent 读 status.md 恢复）

  Scenario: 注入 stage 3 也耗尽 → 阶段 3 触发 HALT
    Given 注入: 阶段 3 连续 3 次回退（截图总是缺失）
    When flow-agent 检测 `staging_counter[stage3] = 3`
    Then 触发同上 HALT 路径
      And failure-log.md 追加 `[nfflow] R04 F17 阶段3 预算耗尽`

@B01-nfflow-upgrade @chaos @failure-mode-F03 @P0
Feature: 反思攻击误判 P0 → 设计回退 + 用户裁决机制
  @covers-R03

  Background: 共享前置
    Given 反思#1 完成，产出 `.xdd/runs/nf_run/reflect-attack-design-report.md`
      And 报告 §5 标 P0-X = 1（attacker 错把文档措辞不准确判 P0）

  Scenario: 注入 P0 误判 → 触发裁决
    Given 注入: `sed -i 's/^## 5. 问题清单/## 5. 问题清单\n- P0-X: 文档措辞不准确\n- 建议 rollback/' .xdd/runs/nf_run/reflect-attack-design-report.md`
    When flow-agent 读反思#1 报告，分类 P0 类别
    Then flow-agent 跑业务对账（兜底 #11）：P0 类别校验
      - P0-X 类别 = 「FOUND_DEFECT」(真实 P0)
      - P0-X 类别 = 「SHAM」(真实 P0)
      - P0-X 类别 = 「JOURNEY_BLOCKED」(真实 P0)
      - **P0-X 类别 = 「DOC_STYLE」(非 P0 → false positive)**
      And flow-agent 标 P0-FP-XXX（false positive）
    When flow-agent 触发回退 + 用户裁决（task 重点场景）：
      ```
      反思#1 误判 P0-X：
      - 原文: 反思#1 §5 标 P0-X: 文档措辞不准确
      - 业务对账: DOC_STYLE 不是 P0（FOUND_DEFECT / SHAM / JOURNEY_BLOCKED 才算 P0）
      - 判定: false positive

      选项：
      1) 采纳业务对账，忽略 P0-X，流程继续
      2) 信任反思#1 报告，触发起回退
      3) 暂停，重新派反思#1
      ```
    And 用户选 1 (采纳业务对账)
      And flow-agent 标阶段 1 为「done」（P0-FP-XXX 忽略）
      And failure-log.md 追加 `[nfflow] R03 F03 误判 P0-X，业务对账纠错`

@B01-nfflow-upgrade @chaos @failure-mode-F08 @P1
Feature: task_id 续接丢失 → 重新派发而不是污染上下文
  @covers-R05

  Background: 共享前置
    Given 反思#1 产出 P0 列表 [P0-A: scenarios.feature 缺密码错误场景, P0-B: 端点列表不完整]
      And flow-agent 准备派反思#2（task_id=attacker-001 续接反思#1）

  Scenario: 注入续接丢失前序 P0 → 业务幂等 + 重新派发
    Given 注入: 续接 prompt 显式删除前序 P0 列表（`jq '.prompt.prior_p0_list = []'` 模拟续接丢失）
    When flow-agent 派反思#2
    Then 反思#2 报告 §1 阶段产物状态段缺失「前序 P0 状态」段（任务重点场景）
      And flow-agent 跑业务对账（兜底 #11）：grep `前序 P0 状态` 反思#2 报告失败 → P0-LOOP-XXX
    When flow-agent 触发回退 + 重新派发（task 重点场景）：
      - 不续接（task_id 不用 attacker-001，新 task_id=attacker-002）
      - prompt 显式重新注入前序 P0 列表 [P0-A, P0-B] + 状态
      And 反思#2 重跑，报告 §1 含「前序 P0 状态：P0-A 已修 / P0-B 未修」
      And 反思#2 报告 §5 含完整 P0/P1/P2 列表
      And failure-log.md 追加 `[nfflow] R05 F08 续接丢失前序 P0，重新派发（不续接）`

@B01-nfflow-upgrade @chaos @failure-mode-F16 @P0
Feature: no-stub-check 漏报 → 反思#3 兜底（curl 真实接口）
  @covers-R02

  Background: 共享前置
    Given 阶段2 完成，build-report.md 写「全测试 PASS，无 stub」
      And 反思#2 跑 no-stub-check 0 命中（但代码实际有 `return None` 蒙混）

  Scenario: 注入 return None 蒙混 → 反思#2 漏报 → 反思#3 兜底
    Given 注入: `sed -i 's/return MyService(.*)/return None  # mock for chaos test/g' src/services/xxx.py`
    When 反思#2 跑 no-stub-check（扫 `pass` / `TODO` / `NotImplementedError` / `InMemoryRepository`）
    Then no-stub-check 0 命中（`return None` 不是 stub 模式）
      And 反思#2 报告 §5 标 P0=0（漏报）
      And flow-agent 标 P0-F16-FN-XXX（false negative）
    When 反思#3 跑兜底（按 architecture §7 表格；task 重点场景）：
      - 跑 curl 真实接口 `curl -fsS http://localhost:8000/api/xxx`
      - 跑全测试 `npm test`（实际跑）
      - 跑截图（用户旅途走不通才有截图）
    Then 反思#3 检测到 `return None` 导致 5xx 错误
      And 反思#3 报告 §5 标 P0-Y = 1（NO_STUB_FN）
      And flow-agent 触发回退到阶段 2（按 architecture §7 表格，no-stub-check 漏报走反思#3 兜底）
      And 续接 nf-builder 修复（替换 `return None` 为真实实现）
      And failure-log.md 追加 `[nfflow] R02 F16 no-stub-check 漏报，反思#3 兜底拦住`

  Scenario: 注入 @implements RXX 漏标 → no-stub-check 兜底
    Given 注入: `sed -i '/@implements R/d' src/services/xxx.py`（删除所有 @implements RXX）
    When flow-agent 跑阶段 2 Gate 5 条检查 3 grep `@implements R` 命中 = 0
    Then Gate 失败（task 重点场景：no-stub-check 兜底不是兜这个，是兜 return None；这条走 R02 兜底）
      And flow-agent 触发回退到阶段 2
      And 续接 nf-builder 补标注

@B01-nfflow-upgrade @chaos @failure-mode-F20 @P0
Feature: scenarios.feature 跟 rules.md 不一致 → 哪个为准 + 警告
  @covers-R07

  Background: 共享前置
    Given 阶段1 完成，rules.md 写 R01~R07（7 条 RXX）
      And scenarios.feature 写 @covers-R01 ~ @covers-R06（缺 @covers-R07）

  Scenario: 注入缺失 @covers-R07 → 规则为准 + 警告
    Given 注入: `sed -i '/@covers-R07/d' .xdd/design/spec/B01-nfflow-upgrade/scenarios.feature`
    When flow-agent 跑业务对账（兜底 #11；task 重点场景）：
      ```
      expected = rules.md RXX 列表 = [R01, R02, R03, R04, R05, R06, R07]
      actual = scenarios.feature @covers 列表 = [R01, R02, R03, R04, R05, R06]
      missing = [R07]
      ```
    Then flow-agent 触发「**默认 rules.md 为准 + 警告**」处理（task 重点场景）：
      - 标 P0-WARN-XXX（不阻塞，警告）
      - 续接 nf-designer 补 `@covers-R07` 标注
      - failure-log.md 追加 `[nfflow] R07 F20 rules.md 跟 scenarios.feature 不一致，scenarios.feature 补 @covers-R07`
      And 阶段 1 标「done with warnings」
      And 流程继续

  Scenario: 注入 @covers 含不存在 RXX → 警告
    Given 注入: `printf "\n  @covers-R99\n  Scenario: 测试幽灵 RXX\n    Given stuff\n" >> .xdd/design/spec/B01-nfflow-upgrade/scenarios.feature`
    When flow-agent 跑业务对账
    Then extra = [R99]（scenarios.feature 含 R99，rules.md 无 R99）
      And flow-agent 标 P0-WARN-XXX
      And 续接 nf-designer 删除 `@covers-R99`（幽灵 RXX）
      And failure-log.md 追加 `[nfflow] R07 F20 scenarios.feature 含幽灵 R99，删除`

@B01-nfflow-upgrade @chaos @failure-mode-F18 @P0
Feature: 全局 8 次预算耗尽 → 强制问用户
  @covers-R04

  Background: 共享前置
    Given flow-agent 内部 `rollback_counter = 8`（累计 8 次回退）
      And 流程仍处于非 done 状态

  Scenario: 注入 8 次回退 → 永久 HALT
    Given 注入: 累计 8 次回退（阶段1 3 次 + 阶段2 3 次 + 阶段3 2 次）
    When flow-agent 检测 `rollback_counter ≥ 8`
    Then flow-agent 触发熔断（task 重点场景）：
      - 熔断器 OPEN → 整个流程永久暂停
      - 强制 question 工具调用：
        ```
        累计 8 次回退详情：
        - 阶段1 3 次：P0-A, P0-B, P0-C
        - 阶段2 3 次：P0-D, P0-E, P0-F
        - 阶段3 2 次：P0-G, P0-H

        选项：
        1) 重置 rollback_counter 继续（强烈不推荐）
        2) 暂停，等用户人工介入
        3) 终止流程，写 final failure-log.md
        ```
      And 流程永久暂停（OPEN 状态不自动重置）
      And failure-log.md 追加 `[nfflow] R04 F18 全局预算耗尽，永久 HALT`

@B01-nfflow-upgrade @chaos @failure-mode-F01 @P0
Feature: nf-designer 探索设计写一半挂 → 续接后从已写阶段继续
  @covers-R01

  Background: 共享前置
    Given flow-agent 派 nf-designer（task_id=designer-001）跑阶段 1
      And nf-designer 已写完 intent.md + design.md（2 件），正在写 rules.md

  Scenario: 注入 SIGTERM → 续接后从 rules.md 继续
    Given 注入: `kill -SIGTERM $(pgrep -f "nf-designer.*rules.md")`
    When 等待 5 秒
    Then nf-designer 进程消失
      And 阶段 1 Gate 状态：
        | 产物 | 字节数 | 通过 |
        | intent.md | ≥ 80 | ✓ |
        | design.md | ≥ 150 | ✓ |
        | rules.md | 0 / < 200 | ✗ |
        | scenarios.feature | 0 / < 500 | ✗ |
        | architecture.md | 0 / < 200 | ✗ |
    When flow-agent 续接 nf-designer（task_id=designer-002，不续接，prompt 显式含「上次已写 intent.md + design.md，从 rules.md 续写」）
    Then nf-designer 续写 rules.md → scenarios.feature → architecture.md
      And 续接产物：5 件齐全，合并到 stage1（不覆盖 intent.md / design.md）
      And re-run 阶段 1 Gate 5 条全部通过
      And failure-log.md 追加 `[nfflow] R01 F01 nf-designer SIGTERM 续接成功`

@B01-nfflow-upgrade @chaos @failure-mode-F04 @P0
Feature: nf-attacker 漏报 P0 → 反思#3 兜底对账
  @covers-R03

  Background: 共享前置
    Given 阶段 2 完成，代码有真实 stub（`raise NotImplementedError("待实现")`）
      And 反思#2 跑 no-stub-check 0 命中（脚本误判）

  Scenario: 注入漏报 → 反思#3 兜底
    Given 注入: `echo '    raise NotImplementedError("待实现")  # chaos test' >> src/services/xxx.py`
    And 注入: no-stub-check 脚本临时禁用 `mv scripts/no-stub-check.sh scripts/no-stub-check.sh.bak`
    When 反思#2 跑 no-stub-check（实际 no-stub-check.sh.bak）
    Then 0 命中（漏报）
      And 反思#2 报告 §5 标 P0=0（实际 P0=1）
      And flow-agent 标 P0-F04-FN-XXX
    When 反思#3 跑兜底：
      - `mv scripts/no-stub-check.sh.bak scripts/no-stub-check.sh`（恢复）
      - 跑 no-stub-check 实际命中 1 处
      - 跑 curl 真实接口（5xx）
      And 反思#3 报告 §5 标 P0-K = 1（STUB_FOUND_VIA_RECON）
      And flow-agent 触发回退到阶段 2
      And 续接 nf-builder 修复
      And failure-log.md 追加 `[nfflow] R03 F04 attacker 漏报，反思#3 兜底对账`

@B01-nfflow-upgrade @chaos @failure-mode-F29 @P0
Feature: 用户 Ctrl-C 中断 → status.md 持久化 + 重启恢复
  @covers-R04

  Background: 共享前置
    Given flow-agent 跑阶段 2 in_progress
      And 阶段 2 已写代码 R01~R05（5 条 RXX），未 commit

  Scenario: 注入 Ctrl-C → 重启后从阶段 2 继续
    Given 注入: `kill -SIGINT $(pgrep -f flow-agent)` 模拟用户 Ctrl-C
    When flow-agent 收到 SIGINT
    Then flow-agent 跑 `trap` 写入 status.md：
      - status.md 含 `current_stage: 2`
      - status.md 含 `staging_counter[stage2] = 0`
      - status.md 含 `current_task: builder-001`
      - 阶段 2 in_progress
      And flow-agent 退出
    When 用户重启 flow-agent
    Then flow-agent 读 status.md 推断恢复点：
      - 阶段 1 done（rules.md 存在）
      - 阶段 2 in_progress（build-report.md 缺失）
      - 当前 task_id=builder-001
      And flow-agent 续接 nf-builder（task_id=builder-001，prompt 显式含「上次 Ctrl-C 中断，从 R06 续写」）
      And nf-builder 续写 R06 + R07
      And failure-log.md 追加 `[nfflow] R04 F29 Ctrl-C 中断 → status.md 持久化 → 重启恢复`

@B01-nfflow-upgrade @chaos @failure-mode-F33 @P0
Feature: 同项目并发跑两个 nfflow → lock 文件 + 排队
  @covers-R04

  Background: 共享前置
    Given flow-agent A 已启动（项目 nfflow 1）
      And lock 文件 `.xdd/runs/nf_run/.lock` 存在（持有者=flow-agent A）

  Scenario: 注入并发 → flow-agent B 排队 / 退出
    Given 注入: 同时启动 flow-agent B（同一项目）
    When flow-agent B 跑健康检查 `#10`：
      - `test ! -f .xdd/runs/nf_run/.lock`
      - lock 文件存在 → 失败
    Then flow-agent B 触发 P0-CONCURRENT-XXX
      And flow-agent B 用 question 工具问用户：
        ```
        已有 nfflow 跑此项目（flow-agent A）：
        选项：
        1) 覆盖：杀掉 flow-agent A，flow-agent B 接管
        2) 排队：等 flow-agent A 跑完，flow-agent B 接续
        3) 退出：flow-agent B 退出
        ```
      And 用户选 2 (排队)
      And flow-agent B 写 `.xdd/runs/nf_run/.queue` 排队
      And 等待 flow-agent A 跑完（lock 文件删除）
      And flow-agent B 接管，恢复跑
      And failure-log.md 追加 `[nfflow] R04 F33 同项目并发，flow-agent B 排队`

@B01-nfflow-upgrade @chaos @failure-mode-F26 @P0
Feature: nf-builder commit 冲突 → git rebase / merge 补偿
  @covers-R02

  Background: 共享前置
    Given nf-builder 跑 TDD 循环，提交 R05
      And 外部进程修改同一文件（注入冲突）

  Scenario: 注入 commit 冲突 → git rebase 补偿
    Given 注入: `git checkout HEAD -- src/services/xxx.py && echo '# external change' >> src/services/xxx.py && git add src/services/xxx.py && git commit -m 'external-commit'`
    When nf-builder 跑 TDD 提交 R05：`git commit -m 'R05: xxx'`
    Then `git commit` 失败（CONFLICT）
      And nf-builder 报告 `commit failed: CONFLICT`
      And flow-agent 跑兜底 #3（补偿）：
      - `git fetch origin R05`（如有 remote）
      - `git rebase HEAD` 或 `git merge --no-ff HEAD`
      - `git commit -m 'R05: xxx'` 重试
      And 仍失败则标 P0-F26-CONFLICT-XXX 触发回退
      And failure-log.md 追加 `[nfflow] R02 F26 commit 冲突，git rebase 补偿`

@B01-nfflow-upgrade @chaos @failure-mode-F32 @P0
Feature: 平台 Task() 调用 5xx → 指数 backoff 重试
  @covers-R01

  Background: 共享前置
    Given opencode 平台 Task() API 临时 5xx（注入故障）

  Scenario: 注入平台 5xx → 指数 backoff 重试
    Given 注入: opencode 平台 mock 5xx（`curl -X POST http://localhost:11434/api/task -d '...'` 返回 503）
    When flow-agent 派 nf-designer
    Then Task() 调用 5xx（503 Service Unavailable）
      And flow-agent 跑兜底 #4（重试）：
      - 1s 后重试 1 次（仍 5xx）
      - 2s 后重试 1 次（仍 5xx）
      - 4s 后重试 1 次（仍 5xx）
      - 8s 后重试 1 次（成功）
      And 5xx 临时故障自动恢复
      And 流程继续
    When 第 4 次重试仍失败（8s 后）
    Then flow-agent 标 P0-F32-PLATFORM-XXX 触发回退
      And failure-log.md 追加 `[nfflow] R01 F32 平台 Task() 5xx，4 次 backoff 后恢复`

# ===== 注入命令速查表 =====
#
# | 失败类型 | 注入命令 |
# |---------|---------|
# | subagent SIGTERM | `kill -SIGTERM $(pgrep -f "nf-XXX")` |
# | 用户 Ctrl-C | `kill -SIGINT $(pgrep -f flow-agent)` |
# | 上下文超限 | 在 prompt 头部追加超长伪造历史 |
# | 字节边界 | `truncate -s <N-1> <file>` |
# | 文件删 | `rm <file>` |
# | 文件篡改 | `sed -i '...' <file>` |
# | 权限改 | `chmod 000 <dir>` |
# | 磁盘满 | `dd if=/dev/zero of=./.xdd/runs/nf_run/fill ...` |
# | commit 冲突 | `git commit` 时外部改同一文件 |
# | hook 拒 | 项目配 pre-commit 拒 |
# | 编译 OOM | `NODE_OPTIONS=--max-old-space-size=64 npm test` |
# | 平台 5xx | mock 平台 API 返回 503 |
# | 多任务并发 | `mkdir .xdd/runs/nf_run/.lock` 抢占 |
# | 跨产物不一致 | `sed -i '/@covers-R07/d' scenarios.feature` |
#
# 5 类真注入（subagent 崩溃 / 上下文超限 / 文件 IO / 阈值边界 / 续接失败）覆盖 @chaos 全部场景。
# 脚本支持：`scripts/chaos-runner.sh`（可移植 bash，在 docker compose 环境跑）。
