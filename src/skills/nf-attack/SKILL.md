---
name: nf-attack
description: >
  Normal Flow 反思攻击 skill。同一 skill + stage ∈ {design, build, acceptance} 参数，
  3 个反思阶段共用本 skill。5 段方法论（阶段产物状态 + 正向验证 + 兜底攻击 + 反 sham + 问题清单），
  P0=0 才进下一阶段（硬阻塞），P1=0 才算完成（警告）。
  报告落 .xdd/runs/nf_run/reflect-attack-{stage}-report.md。
---

# nf-attack · 反思攻击方法论（stage 参数化 + 续接验证）

## 本 skill 做什么

对设计 + 实现 + 验收做主动攻击。不是写报告说"已验证通过"，而是拿出真实证据：正向路径跑通了什么命令、兜底路径拦住了什么攻击、续接是否验证了前序 P0。

## 入口行为

`use skill: nf-attack` + prompt 含 `stage ∈ {design, build, acceptance}`：

| stage | 攻击对象 | 必产出 | 关键证据 |
|-------|---------|--------|---------|
| `design` | 5 件设计产物（rules.md / scenarios.feature / architecture.md / intent.md / design.md） | `.xdd/runs/nf_run/reflect-attack-design-report.md` ≥ 1000 | grep 兜底场景 / 端点完整性 / 依赖缺失 / 跨产物一致性 |
| `build` | 代码 `@implements RXX` + tests/ + build-report.md + code-review.json | `.xdd/runs/nf_run/reflect-attack-build-report.md` ≥ 1000 | no-stub-check / curl 真实跑 / 重启数据保留 / 编译 PASS |
| `acceptance` | e2e-report.md + screenshots/*.png | `.xdd/runs/nf_run/reflect-attack-acceptance-report.md` ≥ 1000 | user journey 覆盖 / 边界截图 / 错误文案 / 截图非复用 / curl 非 mock |

**前序 P0 列表验证**（反思#2/#3 必填）：报告 §1 阶段产物状态段必须含「前序 P0 状态：P0-X 已修 / P0-Y 未修」。

## 前置：读设计 / 实现 / 验收产物

```
stage=design:
  read .xdd/design/intent.md
  read .xdd/design/design.md
  read .xdd/design/spec/{Bxx-slug}/rules.md
  read .xdd/design/spec/{Bxx-slug}/scenarios.feature
  read .xdd/design/architecture/{Bxx-slug}/architecture.md

stage=build:
  read src/**/*.{py,ts,go,...}  -- @implements RXX 标注的代码
  read tests/**/*_test.py        -- @covers RXX 的测试
  read .xdd/runs/nf_run/build-report.md
  read .xdd/runs/nf_run/code-review.json

stage=acceptance:
  read .xdd/runs/nf_run/e2e-report.md
  ls .xdd/runs/nf_run/screenshots/*.png
```

## 报告结构（5 段，按 stage 注水）

```markdown
# Reflect Attack Report — {stage}

## 1. 阶段产物状态
（贴产物路径 + 字节数 + 关键 grep 输出；反思#2/#3 必须显式记录「前序 P0 状态：...」）

## 2. 正向验证
（按 RXX / Scenario 逐条贴运行证据：PASS / exit code 0 / 截图）

## 3. 兜底攻击
（按兜底场景逐条贴攻击证据：attack / fallback / 拒绝 / 边界 / curl 5xx）

## 4. 反 sham 检查
（no-stub-check / mock / 硬编码 / 假数据 / 截图非复用）

## 5. 问题清单
- P0: <存根 / sham / 用户旅途走不通>（硬阻塞，触发回退）
- P1: <兜底未拦 / 行为错>（警告，标 done with warnings）
- P2: <文档不完整 / 风格问题>（建议，记总结）
verdict: pass | rollback
```

报告路径：`.xdd/runs/nf_run/reflect-attack-{stage}-report.md`（3 个 stage 对应 3 个具体报告：`reflect-attack-design-report.md` / `reflect-attack-build-report.md` / `reflect-attack-acceptance-report.md`）
字节阈值：≥ 1000

## 攻击方法

### 正向攻击（证明跑通）

对每条 RXX 规则：
1. **找实现**：`grep -rn "@implements R03" src/` 确认有真实代码（不是桩）
2. **跑测试**：执行项目测试命令，贴 exit code 和通过数
3. **端到端**：能 curl 的端点用 curl 验证，贴 HTTP 状态码和响应体
4. **数据落地**：写入 -> 查询 -> 重启后还在，证明真落库了

**没找到实现 = P0**，必须回炉。

### 兜底攻击（证明拦得住）

对每个兜底场景：
1. **构造攻击输入**：错误数据 / 无权限请求 / 超限请求 / 空值
2. **真实执行**：curl 或测试脚本跑，贴真实输出
3. **验证拦截**：返回的是预期错误（401/403/429/422），不是 500 崩溃或静默通过

**兜底没拦住 = P1**，必须修复。

### 反 sham 检查

```bash
# 存根检查
grep -rn "TODO\|FIXME\|NotImplemented\|return None\|NotImplementedException\|pass$" src/
# 假实现检查
grep -rn "InMemoryRepository\|mock.*Repository\|硬编码.*current_user" src/
```

有任何命中 = P0（声称完成但有存根/假实现）。

## P0 硬阻塞（必触发回退）

- no-stub-check 命中：`pass` / `TODO` / `NotImplementedError` / `InMemoryRepository` / mock DB / 硬编码 `current_user`
- 无 `@implements RXX` 标注
- Gate 5 条任何一条不满足
- e2e 用户旅途走不通
- 反思#2/#3 报告 §1 缺「前序 P0 状态」字段（违反 R05）
- P0 ≥ 1 → 报告标记「rollback」+ 触发回退

## P1 警告（不阻塞）

- scenarios.feature 缺兜底场景
- 错误处理路径缺失
- 续接未延续前序 P0 列表（prompt 没列）
- 文档不完整
- P1 ≥ 1 → 报告标记「warn」+ 流程继续

## P2 建议

- 文档风格 / 注释不完整
- 命名风格不一致
- 性能可优化
- P2 ≥ 1 → 报告标记「建议」+ 流程继续

## Gate 硬检查（报告里必须有的真实证据）

| 检查 | 要求 | 必须是真实证据 |
|------|------|---------------|
| 构建通过 | Gate 会跑 `npm run build` / `go build` / `make build`（无则跳过） | 贴构建命令 + 输出 + exit code |
| git 有改动 | git 工作区有代码改动（已排除 .xdd/），证明有真实实现 | 不是纯设计文档 |
| 正向通过 | 报告里有 `exit code 0` / `PASS` / `测试通过` | 贴命令输出，不是写"已测试" |
| 兜底攻击 | 报告里有 `攻击` / `兜底` / `失败` / `拒绝` / `边界` | 贴攻击命令和拦截响应 |
| 真实执行 | 报告里有 `curl` / `HTTP` / `test` / `docker` | 贴完整命令，不是提名字 |
| P0 声明 | 报告明确声明 `P0: 0` / `无 P0` / `0 个 P0` | 明确数字 |
| 续接验证 | 反思#2/#3 报告 §1 含「前序 P0 状态」字段 | 验证每个 P0 已修 / 未修 |

## 底线

```
1. 不写存根    - pass / TODO / return None 都不行
2. 不用假实现  - InMemoryRepository / mock DB 都不行
3. 说了完成就是真完成 - 功能必须跑过 + 有运行证据
4. verify 不是照单确认 - 主动攻击正向和兜底
5. 续接必须验证前序 P0 - 反思#2/#3 必填「前序 P0 状态」字段
```

干完后把 reflect-attack-{stage}-report.md 路径 + P0/P1/P2 计数 + 是否建议 pass 返回给 flow_agent。
