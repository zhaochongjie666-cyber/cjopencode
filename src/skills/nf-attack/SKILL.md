---
name: nf-attack
description: >
  Normal Flow 攻击/验证 skill。教 nf-attacker subagent 怎么做正向验证（证明跑通）
  和兜底攻击（证明拦得住），产出真实 attack-report.md。核心是"verify 不是照单确认，
  而是主动攻击" -- 只跑 happy path 不算验证。被 nf-attacker subagent 装载。
---

# nf-attack · 攻击方法论

## 本 skill 做什么

对设计 + 实现做主动攻击。不是写报告说"已验证通过"，而是拿出真实证据：正向路径跑通了什么命令、兜底路径拦住了什么攻击。

## 前置：读设计

```
read .nf/design/intent.md
read .nf/design/design.md
read .nf/design/spec/rules.md
read .nf/design/spec/scenarios.feature
read .nf/design/architecture.md
```

攻击对象 = 这些 RXX 规则和 Scenario。每条都要有证据。

## 产出

```
.nf/runs/attack-report.md  -- 至少 1000 字节，含真实执行证据
```

## attack-report.md 结构

```markdown
# Attack Report

## 1. 构建验证
（贴真实构建命令 + 输出 + exit code）
$ npm run build
... 输出 ...
exit code: 0

## 2. 正向验证（每条 RXX/Scenario）
### R03 用户登录
- 实现：src/auth/login.ts:42 @implements R03
- 测试：npm test -- login
  exit code: 0, 5 passed
- 端到端：curl -X POST /api/login -d '...'
  HTTP 200, {"token":"..."}

## 3. 兜底攻击（每条兜底场景）
### 密码错误
- curl 错误密码 -> HTTP 401, 无 token ✅ 拦住
### 连续错误锁定
- curl 5 次错误密码 -> 第 5 次 HTTP 429 ✅ 拦住
### 无权限访问
- 未带 token 访问 /api/profile -> HTTP 401 ✅ 拦住

## 4. 反 sham 检查
- grep -rn "TODO\|NotImplemented\|return None\|pass$" src/ -> 0 命中
- grep -rn "InMemory\|mock\|硬编码" src/ -> 0 命中

## 5. 问题清单
- P0: 0 个
- P1: 0 个
- P2: 0 个

## 6. 用户旅程验收
- 管理员旅程：登录 -> 配置 -> 审核 -> ✅ 走通
- 普通用户旅程：注册 -> 登录 -> 使用 -> ✅ 走通
```

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

## P0/P1/P2 分级

| 级别 | 含义 | 处理 |
|------|------|------|
| P0 | Scenario 没做 / 用户旅途走不通 / 存根假实现 | 必须回炉重做 |
| P1 | 功能有但行为错 / 兜底没拦住 | 必须修复后重交 |
| P2 | 体验/文档/小瑕疵 | 声明为 0 才能通过 |

**只有 P0=0 且 P1=0 才建议 flow_agent 调 `nf_submit(pass=true)`。**

## Gate 硬检查（报告里必须有的真实证据）

| 检查 | 要求 | 必须是真实证据 |
|------|------|---------------|
| 构建通过 | Gate 会跑 `npm run build` / `go build` / `make build`（无则跳过） | 贴构建命令 + 输出 + exit code |
| git 有改动 | git 工作区有代码改动（已排除 .nf/），证明有真实实现 | 不是纯设计文档 |
| 正向通过 | 报告里有 `exit code 0` / `PASS` / `测试通过` | 贴命令输出，不是写"已测试" |
| 兜底攻击 | 报告里有 `攻击` / `兜底` / `失败` / `拒绝` / `边界` | 贴攻击命令和拦截响应 |
| 真实执行 | 报告里有 `curl` / `HTTP` / `test` / `docker` | 贴完整命令，不是提名字 |
| P1 声明 | 报告明确声明 `P1: 0` / `无 P1` / `0 个 P1` | 明确数字 |

## 底线

```
1. 不写存根    - pass / TODO / return None 都不行
2. 不用假实现  - InMemoryRepository / mock DB 都不行
3. 说了完成就是真完成 - 功能必须跑过 + 有运行证据
4. verify 不是照单确认 - 主动攻击正向和兜底
```

干完后把 attack-report.md 路径 + P0/P1/P2 计数 + 是否建议 pass 返回给 flow_agent。
