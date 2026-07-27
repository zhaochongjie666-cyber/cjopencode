# language: zh-CN
# nfflow 6 节点流程编排平台 — Gherkin 验收场景
# 一条 RXX 一个 Feature 块，每 Feature 含 Background + 正向 Scenario + 兜底 Scenario
# 实测值（字节数 / 时间 / 路径）都来自 architecture.md，不写占位符

@B01-nfflow-upgrade
Feature: nfflow 6 节点流程编排（3 阶段 + 3 反思）按 todowrite 串行跑通
  @covers-R01

  Background: 共享前置
    Given 用户在 cjopencode 仓库根目录打开 IDE
      And 用户本地已装 opencode 客户端 v0.5.0+
      And 用户已配置 `~/.config/opencode/agents/`，含 flow-agent / nf-designer / nf-builder / nf-attacker / e2e-tester 5 个 agent
      And 文件 `.xdd/runs/xdd_run/goals.md` 存在并含 G1~G5 目标
      And 文件 `.xdd/runs/xdd_run/status.md` 存在并标记「设计·理解 ✅」

  Scenario: 一次完整 nfflow 任务跑通（6 节点）
    Given 用户在 nfflow 入口描述任务：「用 nfflow 给已有 TodoList 加上过期提醒 API，过期时间到则任务标红」
    When flow-agent 启动 6 节点 todowrite
      And 阶段1 派 nf-designer 装 nf-design skill，产出 5 件设计产物
      And 反思#1 派 nf-attacker (stage=design) 跑 5 段方法，产出 reflect-attack-design-report.md
      And 阶段2 派 nf-builder 装 xdd-execute + xdd-cleanup skill，产出 build-report.md + code-review.json
      And 反思#2 派 nf-attacker (stage=build) 跑 5 段方法，产出 reflect-attack-build-report.md
      And 阶段3 派 e2e-tester 装 e2e-test skill，产出 e2e-report.md + 4 张截图
      And 反思#3 派 nf-attacker (stage=acceptance) 跑 5 段方法，产出 reflect-attack-acceptance-report.md
    Then 流程标记完成，6 节点状态全部 done
      And 5 件设计产物真实落盘（`stat .xdd/design/intent.md` 字节数 ≥ 80、`design.md` ≥ 150、`spec/{B01-nfflow-upgrade}/rules.md` ≥ 200、`scenarios.feature` ≥ 500、`architecture/{B01-nfflow-upgrade}/architecture.md` ≥ 200）
      And 4 件 nfflow 报告真实落盘（`stat .xdd/runs/nf_run/build-report.md` ≥ 1000、`reflect-attack-design-report.md` ≥ 1000、`reflect-attack-build-report.md` ≥ 1000、`reflect-attack-acceptance-report.md` ≥ 1000）
      And `.xdd/runs/nf_run/e2e-report.md` ≥ 1000，含 `screenshots/*.png` 4 张 PNG 文件（每张 ≥ 5KB）
      And `.xdd/runs/nf_run/code-review.json` 含 6 维度自审 + `verdict=pass`
      And 4 份反思报告 P0=0（无存根 / 无 sham / 无用户旅途走不通）
      And 7 条 RXX 规则全部 @implements RXX 标注（每 RXX 至少 1 处，`grep -r "@implements R" src/` 命中 ≥ 7）

  Scenario: 反思#1 拦住设计缺陷（兜底 P0 阻塞）
    Given 阶段1 完成的 scenarios.feature 缺「密码错误」兜底场景
      And 阶段1 完成的 architecture.md 缺「数据存储」段
        # 任意缺失兜底场景或关键段 → 算设计缺陷
    When 反思#1 派 nf-attacker (stage=design)
    Then 反思#1 5 段方法跑完，产出 `.xdd/runs/nf_run/reflect-attack-design-report.md`
      And 报告 §3 兜底攻击段列 P0-A: 「scenarios.feature 缺 1 个异常 Scenario」
      And 报告 §5 问题清单标记 P0 ≥ 1（`echo $?` 非 0）
      And 报告 §5 末尾建议：「rollback → 阶段1」
    When flow-agent 读报告并触发回退
    Then 阶段1 状态 in_progress
      And 反思#1 / 阶段2 / 反思#2 / 阶段3 / 反思#3 全部 pending
      And 续接 nf-designer（task_id 续接，prompt 显式列 P0-A）
      And `.xdd/runs/xdd_run/failure-log.md` 末尾追加 `[nfflow] R01 反思#1 P0-A: scenarios.feature 缺异常场景`

  Scenario: 反思#2 拦住实现 sham（兜底 P0 阻塞）
    Given 阶段2 完成的 build-report.md 缺 curl 跑通证据
      And 阶段2 完成的代码含 `pass` 残留（`grep -rn "^\s*pass\s*$" src/` 命中 ≥ 1）
      And 阶段2 完成的代码无 `@implements RXX` 标注（`grep -r "@implements R" src/` 命中 = 0）
    When 反思#2 派 nf-attacker (stage=build)
    Then 反思#2 跑 no-stub-check 脚本（扫 `pass` / `TODO` / `NotImplementedError` / `InMemoryRepository`）
      And 报告 §4 反 sham 检查段标记 P0-B: 「no-stub-check 命中 1 处」
      And 报告 §5 问题清单标记 P0 ≥ 1
      And 报告 §5 末尾建议：「rollback → 阶段2」
    When flow-agent 读报告并触发回退
    Then 阶段2 状态 in_progress
      And 反思#2 / 阶段3 / 反思#3 全部 pending
      And 续接 nf-builder（task_id 续接，prompt 显式列 P0-B + P0-C）
      And re-run Gate 直至 P0=0

  Scenario: 反思#3 拦住验收漏测（兜底 P0 阻塞）
    Given 阶段3 完成的 e2e-report.md 缺用户旅途截图
      And 阶段3 完成的 `.xdd/runs/nf_run/screenshots/` 目录为空（`ls .xdd/runs/nf_run/screenshots/` 命中 0 文件）
    When 反思#3 派 nf-attacker (stage=acceptance)
    Then 反思#3 跑截图覆盖检查
      And 报告 §3 兜底攻击段标记 P0-D: 「用户旅途截图缺失 0/4」
      And 报告 §5 问题清单标记 P0 ≥ 1
      And 报告 §5 末尾建议：「rollback → 阶段3」
    When flow-agent 读报告并触发回退
    Then 阶段3 状态 in_progress
      And 反思#3 状态 pending
      And 续接 e2e-tester（task_id 续接）
      And re-run Gate 直至 P0=0

  Scenario: 三次回退到同一阶段耗尽阶段预算
    Given 阶段1 连续 3 次回退（flow-agent 内部 staging_counter[stage1] = 3）
      And 反思#1 仍 P0 ≥ 1（每次回退后重跑反思#1 失败）
    When flow-agent 检测到阶段1 预算耗尽
    Then flow-agent 用 `question` 工具向用户报告（不是自动重启）
      And 报告内容含：阶段性失败原因（前 3 次回退的 P0 列表）+ 累计回退次数 + 询问「继续自动回退 / 暂停 / 调整规则」
      And 流程暂停（不自动重启）
      And 用户回答后由 flow-agent 继续

---

@B01-nfflow-upgrade
Feature: nf-builder 装 xdd-execute + xdd-cleanup skill 执行 TDD 写代码
  @covers-R02

  Background: 共享前置
    Given 阶段1 5 件设计产物齐全（rules.md R01~R07 共 7 条 RXX / scenarios.feature 含 @covers RXX 标注 / architecture.md 端点 / intent.md / design.md）
      And flow-agent 已派 nf-builder（阶段 2 in_progress）

  Scenario: nf-builder 跑 TDD 写出 7 条 @implements RXX
    Given 阶段1 产出的 `.xdd/design/spec/B01-nfflow-upgrade/rules.md` 含 R01~R07 共 7 条 RXX 规则
      And 阶段1 产出的 `.xdd/design/spec/B01-nfflow-upgrade/scenarios.feature` 含 @covers R01~R07 标注
      And 阶段1 产出的 `.xdd/design/architecture/B01-nfflow-upgrade/architecture.md` 含 端点 / 事件 / 数据 / 依赖 4 段
    When flow-agent 派 nf-builder（task_id 不续接，prompt 含「装 xdd-execute + xdd-cleanup skill，读 3 件设计产物，TDD 写真实代码」）
    Then nf-builder 通过 `use skill: xdd-execute` 装 xdd-execute（不在 prompt 里写 skill 内容）
      And nf-builder 通过 `use skill: xdd-cleanup` 装 xdd-cleanup
      And nf-builder 跑 Step 0 环境准备（依赖 / 测试框架 / Docker 服务起来）
      And nf-builder 跑 TDD 循环：先写 `@covers RXX` 测试 → 跑 test 确认失败 → 写 `@implements RXX` 最小实现 → 跑 test 确认通过 → 重构 → commit
      And 全部 7 条 RXX 至少 1 处 `@implements RXX` 标注（`grep -rE "@implements R(0[1-7])" src/ | wc -l` ≥ 7）
      And 全测试 PASS（`pytest tests/` exit code 0）
      And no-stub-check 零命中（`./scripts/no-stub-check.sh` exit code 0）
      And 产 `.xdd/runs/nf_run/code-review.json` 含 6 维度（空值安全 / 并发安全 / 资源生命周期 / 授权与注入 / 错误处理 / 架构漂移） + `verdict=pass`
      And 产 `.xdd/runs/nf_run/build-report.md` ≥ 1000 字节

  Scenario: nf-builder 写出 pass / TODO 残留 → Gate 失败
    Given 阶段1 5 件设计产物齐全
    When flow-agent 派 nf-builder，nf-builder 写代码时留 `pass` 占位
      And nf-builder 写代码时留 `TODO` 注释
    Then 跑 `grep -rn "^\s*pass\s*$" src/` 命中 ≥ 1
      And 跑 `grep -rn "TODO" src/` 命中 ≥ 1
      And no-stub-check 报告 ≥ 1 命中
      And 阶段 2 Gate 失败，触发回退到阶段 2

  Scenario: nf-builder 未标 @implements RXX → Gate 失败
    Given 阶段1 5 件设计产物齐全
    When flow-agent 派 nf-builder，nf-builder 写代码但忘记标 `@implements RXX`
    Then 跑 `grep -r "@implements R" src/` 命中 = 0
      And 阶段 2 Gate 失败（关键 grep 不命中）
      And 触发回退到阶段 2

---

@B01-nfflow-upgrade
Feature: nf-attacker 阶段化反思攻击（design / build / acceptance）
  @covers-R03

  Background: 共享前置
    Given nfflow 6 节点流程中任一阶段已 in_progress
      And 阶段对应产物已落盘

  Scenario: 反思#1 攻击设计产物（stage=design）
    Given 阶段1 产物 5 件落盘（rules.md / scenarios.feature / architecture.md / intent.md / design.md）
    When 反思#1 派 nf-attacker (stage=design)
    Then nf-attacker 装 `nf-attack` skill
      And 反思#1 跑 5 段方法：
        | 段 | 内容 |
        | §1 阶段产物状态 | 贴产物路径 + 字节数 + 关键 grep 输出 |
        | §2 正向验证 | 按 R01~R07 逐条贴运行证据 |
        | §3 兜底攻击 | 按兜底场景逐条贴攻击证据 |
        | §4 反 sham 检查 | no-stub-check / mock / 硬编码 |
        | §5 问题清单 | P0 / P1 / P2 + 建议 pass / rollback |
      And 产出 `.xdd/runs/nf_run/reflect-attack-design-report.md` ≥ 1000 字节
      And 报告 §5 末尾含 `verdict: pass|rollback`
      And 若 P0=0 → 标记「pass」，进阶段 2
      And 若 P0 ≥ 1 → 标记「rollback」，触发回退（详见 R04）

  Scenario: 反思#2 攻击实现产物（stage=build）
    Given 阶段2 产物落盘（代码 / 测试 / build-report.md / code-review.json）
    When 反思#2 派 nf-attacker (stage=build)
    Then 反思#2 跑 5 段方法：
      | 段 | 内容 |
      | §1 阶段产物状态 | 代码路径 + `@implements RXX` grep 命中数 + `code-review.json` verdict |
      | §2 正向验证 | 每 RXX 至少 1 个测试 PASS |
      | §3 兜底攻击 | 跑全测试套件 + 跑 curl 真实接口 + 重启数据保留 |
      | §4 反 sham 检查 | no-stub-check / mock DB / 硬编码 current_user |
      | §5 问题清单 | P0 / P1 / P2 + 建议 |
    And 产出 `.xdd/runs/nf_run/reflect-attack-build-report.md` ≥ 1000 字节

  Scenario: 反思#3 攻击验收产物（stage=acceptance）
    Given 阶段3 产物落盘（e2e-report.md + screenshots/*.png）
    When 反思#3 派 nf-attacker (stage=acceptance)
    Then 反思#3 跑 5 段方法：
      | 段 | 内容 |
      | §1 阶段产物状态 | e2e-report.md 字节数 + screenshots/*.png 张数 |
      | §2 正向验证 | 用户旅途每步截图齐 |
      | §3 兜底攻击 | 边界截图 / 错误文案 / 离线降级 |
      | §4 反 sham 检查 | 截图非复用 / curl 非 mock |
      | §5 问题清单 | P0 / P1 / P2 + 建议 |
    And 产出 `.xdd/runs/nf_run/reflect-attack-acceptance-report.md` ≥ 1000 字节

---

@B01-nfflow-upgrade
Feature: flow-agent 6 节点 todowrite 状态机 + 9 种回退 + 预算 8 次
  @covers-R04

  Background: 共享前置
    Given flow-agent 已初始化 6 节点 todowrite
      And 回退计数器 rollback_counter = 0
      And 阶段预算计数器 staging_counter[stage1~stage3] = 0

  Scenario: 6 节点 happy path 全部 done
    Given 6 节点 todowrite 初始状态：阶段1 in_progress，其余 5 项 pending
    When 阶段1 完成 → 反思#1 完成 → 阶段2 完成 → 反思#2 完成 → 阶段3 完成 → 反思#3 完成
    Then 6 节点全部 done
      And 流程标记完成
      And rollback_counter = 0

  Scenario Outline: 9 种回退情形<case>
    Given 触发位置 "<trigger>"，根因在 "<root_cause>"
    When flow-agent 跑回退表查询
    Then 回退操作：阶段"<target_stage>" in_progress，剩余 pending
      And rollback_counter += 1
      And staging_counter[<target_stage>] += 1

    Examples:
      | case | trigger | root_cause | target_stage |
      | 1 | 反思#1 | 阶段1（设计） | 阶段1 |
      | 2 | 阶段2 | 阶段1（设计） | 阶段1 |
      | 3 | 反思#2 | 阶段1（设计缺陷） | 阶段1 |
      | 4 | 反思#2 | 阶段2（实现 bug） | 阶段2 |
      | 5 | 阶段3 | 阶段1（设计缺陷） | 阶段1 |
      | 6 | 阶段3 | 阶段2（实现 bug） | 阶段2 |
      | 7 | 反思#3 | 阶段1（设计缺陷） | 阶段1 |
      | 8 | 反思#3 | 阶段2（实现 bug） | 阶段2 |
      | 9 | 反思#3 | 阶段3（验收漏测） | 阶段3 |

  Scenario: 同一阶段连续 3 次回退 → 退出问用户
    Given 阶段1 连续 3 次回退（staging_counter[stage1] = 3）
      And 反思#1 仍 P0 ≥ 1
    When flow-agent 检测到阶段预算耗尽
    Then flow-agent 用 `question` 工具向用户报告
      And 报告含：阶段性失败原因（前 3 次回退的 P0 列表）+ 累计回退次数 + 询问「继续自动回退 / 暂停 / 调整规则」
      And 流程暂停（不自动重启）
      And `.xdd/runs/xdd_run/failure-log.md` 追加 `[nfflow] R04 阶段1 预算耗尽`

  Scenario: 累计回退 ≥ 8 次 → 强制问用户
    Given 累计回退 rollback_counter = 8
    When flow-agent 检测到总预算耗尽
    Then flow-agent 用 `question` 工具向用户报告
      And 报告含：累计 8 次回退的详情 + 询问「继续 / 暂停 / 调整规则」
      And 流程永久暂停，等用户介入

---

@B01-nfflow-upgrade
Feature: task_id 续接策略（反思攻击之间续接，阶段切换不续接）
  @covers-R05

  Background: 共享前置
    Given nfflow 6 节点流程已启动
      And 反思#1 已跑完

  Scenario: 反思#2 续接反思#1 的 task_id
    Given 反思#1 产出 P0 列表 [P0-A: scenarios.feature 缺密码错误场景, P0-B: 端点列表不完整]
    When 反思#2 启动，nf-attacker 接收 prompt 显式传 `task_id` = 反思#1 的 task_id
    Then prompt 内容含「前序 P0-A 是否已修？P0-B 是否已修？」
      And 反思#2 报告 §1 阶段产物状态段显式记录「前序 P0 状态：P0-A 已修 / P0-B 未修」
      And 反思#2 报告 §5 问题清单段把 P0-B 继续标记 P0

  Scenario: 阶段2 ↔ 反思#2 不续接
    Given 阶段2 跑完，nf-builder 产出 build-report.md
    When 反思#2 启动
    Then nf-attacker 接收 prompt 时**不传** task_id
      And 反思#2 报告只引用 build-report.md + rules.md + scenarios.feature + architecture.md
      And 反思#2 报告**不引用** nf-builder 的 task_id
      And 反思#2 攻击方法：把代码当黑盒（不读 builder 的实现笔记）

  Scenario: 续接缺失前序 P0 列表 → 触发回退
    Given 反思#1 产出 P0 列表 [P0-A, P0-B]
    When 反思#2 启动，prompt 没列前序 P0 列表
    Then 反思#2 报告标记 P1（警告：续接未能延续前序 P0 上下文）
      And flow-agent 触发回退：阶段 2 in_progress
      And 续接 nf-builder，prompt 显式列 P0-A / P0-B 让 builder 知道要修

---

@B01-nfflow-upgrade
Feature: Gate 标准（每阶段独立验证，不靠前序推断）
  @covers-R06

  Background: 共享前置
    Given 任一阶段产物已落盘
      And flow-agent 准备跑 5 条硬检查

  Scenario: 阶段1 Gate 5 条硬检查全部通过
    Given 阶段1 产物落盘：
      | 产物 | 路径 | 字节阈值 |
      | intent.md | .xdd/design/intent.md | ≥ 80 |
      | design.md | .xdd/design/design.md | ≥ 150 |
      | rules.md | .xdd/design/spec/B01-nfflow-upgrade/rules.md | ≥ 200 |
      | scenarios.feature | .xdd/design/spec/B01-nfflow-upgrade/scenarios.feature | ≥ 500 |
      | architecture.md | .xdd/design/architecture/B01-nfflow-upgrade/architecture.md | ≥ 200 |
    When flow-agent 跑 5 条硬检查
    Then 5 条全部通过：
      | 检查 | 判定 |
      | 1. 产物真实落盘 | `stat` 路径返回真实文件，5 件全在 |
      | 2. 字节数达标 | 5 件产物的实际字节数 ≥ 阈值 |
      | 3. 关键 grep 命中 | rules.md 含 RXX 编号（≥ 7 处）/ scenarios.feature 含 @covers RXX（≥ 7 处）/ architecture.md 含 端点+事件+数据+依赖 4 关键词 |
      | 4. 存根检测 | no-stub-check 零命中（设计层无代码，但需扫「占位符」如「TODO」/「待定」之类） |
      | 5. commit 追溯 | （设计阶段无 commit，跳过此项） |

  Scenario: 阶段2 Gate 5 条硬检查（实现层）
    Given 阶段2 产物落盘：
      | 产物 | 路径 | 字节阈值 |
      | 代码 | src/**/*.py | （每文件 ≤ 500 行） |
      | 测试 | tests/**/*_test.py | （每 RXX 至少 1 个） |
      | build-report.md | .xdd/runs/nf_run/build-report.md | ≥ 1000 |
      | code-review.json | .xdd/runs/nf_run/code-review.json | （含 6 维度 + verdict） |
    When flow-agent 跑 5 条硬检查
    Then 5 条全部通过：
      | 检查 | 判定 |
      | 1. 产物真实落盘 | `stat` 路径返回真实文件 |
      | 2. 字节数达标 | build-report.md ≥ 1000，每个 RXX 至少 1 测试 |
      | 3. 关键 grep 命中 | `grep -r "@implements R" src/` 命中 ≥ 7 / `grep -r "@covers R" tests/` 命中 ≥ 7 |
      | 4. 存根检测 | no-stub-check 零命中 |
      | 5. commit 追溯 | `git log --grep 'RXX'` 命中 ≥ 7 条 commit |

  Scenario: Gate 字节数不达标 → 阻塞下一阶段
    Given 阶段1 产出的 rules.md 仅 50 字节（< 200 阈值）
    When flow-agent 跑 5 条硬检查
    Then 检查 2 字节数不达标，返回失败
      And 阶段 1 标记 Gate 不通过
      And 阻塞阶段 2 启动
      And 触发回退到阶段 1

  Scenario: Gate 关键 grep 不命中 → 阻塞下一阶段
    Given 阶段1 产出的 architecture.md 缺「端点」关键词
    When flow-agent 跑 5 条硬检查
    Then 检查 3 关键 grep 不命中，返回失败
      And 阶段 1 标记 Gate 不通过
      And 阻塞阶段 2 启动
      And 触发回退到阶段 1

  Scenario: 前序 Gate 通过但本阶段 Gate 失败 → 仍阻塞
    Given 阶段1 Gate 通过（5 条全过）
      And 阶段2 产物 sham（设计层 sham 反向流到实现层）
    When 阶段2 跑 5 条硬检查
    Then 阶段2 Gate 失败，**不靠「前序通过推断本阶段过」**
      And 阻塞阶段 3 启动
      And 触发回退到阶段 2

---

@B01-nfflow-upgrade
Feature: nfflow 跟 xdd-flow 并存边界（共享 .xdd/design/ + 隔离 .xdd/runs/nf_run/）
  @covers-R07

  Background: 共享前置
    Given 用户在 cjopencode 仓库根目录
      And `.xdd/` 目录已存在

  Scenario: nfflow 设计产物落到 .xdd/design/（不是 .nf/design/）
    Given nfflow 跑一个端到端任务
    When 阶段1 跑完
    Then 5 件设计产物在 `.xdd/design/` 下：
      | 产物 | 路径 |
      | intent.md | .xdd/design/intent.md |
      | design.md | .xdd/design/design.md |
      | rules.md | .xdd/design/spec/B01-nfflow-upgrade/rules.md |
      | scenarios.feature | .xdd/design/spec/B01-nfflow-upgrade/scenarios.feature |
      | architecture.md | .xdd/design/architecture/B01-nfflow-upgrade/architecture.md |
    And `.nf/design/` 目录不存在（`stat .nf/design/` 失败）

  Scenario: nfflow 运行报告落到 .xdd/runs/nf_run/（不是 .xdd/runs/xdd_run/）
    Given nfflow 跑完 6 节点
    When 检查所有报告路径
    Then 7 件 nfflow 报告在 `.xdd/runs/nf_run/` 下：
      | 报告 | 路径 |
      | build-report.md | .xdd/runs/nf_run/build-report.md |
      | reflect-attack-design-report.md | .xdd/runs/nf_run/reflect-attack-design-report.md |
      | reflect-attack-build-report.md | .xdd/runs/nf_run/reflect-attack-build-report.md |
      | reflect-attack-acceptance-report.md | .xdd/runs/nf_run/reflect-attack-acceptance-report.md |
      | e2e-report.md | .xdd/runs/nf_run/e2e-report.md |
      | code-review.json | .xdd/runs/nf_run/code-review.json |
      | screenshots/*.png | .xdd/runs/nf_run/screenshots/*.png |
    And 0 份 nfflow 报告在 `.xdd/runs/xdd_run/`（`find .xdd/runs/xdd_run -name "*nfflow*"` 命中 0）

  Scenario: RXX 编号项目级共享（nfflow 跟 xdd-flow 同一 RXX）
    Given nfflow 写的 `.xdd/design/spec/B01-nfflow-upgrade/rules.md` 含 R01 = 「nfflow 6 节点流程编排」
    When xdd-flow 同一项目接入读 rules.md
    Then xdd-flow 拿到的 R01 含义一致
      And 项目级共享 RXX 编号空间（nfflow 写的 R01 跟 xdd-flow 的 R01 是同一规则）
      And 跨业务线引用必须带 `Bxx-RXX` 全名（如 `B01-R01`），不能裸 `RXX`

  Scenario: 误把报告写到 .xdd/runs/xdd_run/ → 触发回退
    Given nfflow 误把 build-report.md 写到 `.xdd/runs/xdd_run/build-report.md`（错误路径）
    When flow-agent 跑路径检查
    Then Gate 失败，报告标 P0
      And 触发回退到写报告的 subagent
      And 续接让 subagent 把报告迁移到 `.xdd/runs/nf_run/build-report.md`
      And `rm .xdd/runs/xdd_run/build-report.md`

  Scenario: RXX 跨业务线编号隔离（B01-R01 vs B02-R01）
    Given B01-nfflow-upgrade 写了 R01 = 「nfflow 6 节点流程编排」
      And 假设 B02-xdd-flow-evolution 写了 R01 = 「xdd-flow 8 节点流程编排」
    When flow-agent 跑 RXX 编号隔离检查
    Then B01-R01 在 `.xdd/design/spec/B01-nfflow-upgrade/rules.md`
      And B02-R01 在 `.xdd/design/spec/B02-xdd-flow-evolution/rules.md`
      And 编号互不冲突（两个 R01 含义不同，但路径隔离）
      And 跨业务线引用必须带 `Bxx-RXX` 全名
