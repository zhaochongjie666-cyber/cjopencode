---
name: e2e-setup
description: >
  E2E 浏览器测试环境准备 skill。教 AI 怎么检测 + 自动装 playwright / chromium / 系统依赖，
  解决"容器内没浏览器"的偷懒借口。被 cmd_think_then_do / flow-agent / e2e-tester 装载。
  核心纪律: 不允许 E2E 跳过，必须真跑通。环境受限则自动装，不允许手动清单兜底。
---

# e2e-setup · E2E 环境准备（禁止偷懒）

## 本 skill 做什么

**解决"环境受限 → 跳过 E2E"的偷懒借口**。

E2E 浏览器测试是真实验收，不是可选装饰。任何想"跳过 E2E 跑手动清单兜底"的行为都是反 sham。

本 skill 提供：
1. **环境检测脚本**（check.sh）—— 列 playwright / chromium / 系统依赖状态
2. **一键安装脚本**（setup.sh）—— 自动装齐缺失项
3. **纪律约束** —— 禁止跳过 E2E 的兜底话术

## 反 sham 底线（绝对禁止）

- ❌ **禁止**"环境受限 → 输出手动验证清单"——这是偷懒借口
- ❌ **禁止**"容器无 Chromium → 跳过 E2E"——应该用 `setup.sh` 装上
- ❌ **禁止**"无 GUI 环境 → 标注跳过"——必须 headless 模式跑通
- ❌ **禁止**"浏览器没装"——必须 `playwright install chromium` 装上

**唯一允许的妥协**：headless 模式跑真测试，不允许跳过。

## 何时装本 skill

- AI 被要求跑 E2E 浏览器测试前
- AI 报告 "E2E 受环境限制" 前（先跑 setup.sh）
- cmd_think_then_do / flow-agent / e2e-tester 的 Step 6 / Layer B 阶段
- 用户问"为啥 E2E 跑不通"时

## 用法（3 步强制）

```
【步骤 1】检测环境
  bash src/skills/e2e-setup/scripts/check.sh
  → 如 PASS=全部 OK → 进步骤 3
  → 如 FAIL ≥ 1 → 进步骤 2

【步骤 2】自动装缺失项（必须）
  bash src/skills/e2e-setup/scripts/setup.sh
  → 装完重新跑 check.sh 验证
  → 仍 FAIL → HALT 报告用户（不要继续往下编"手动清单"）

【步骤 3】跑 E2E（headless 强制）
  npx playwright install chromium   # 双保险
  npx playwright test --reporter=list --headed=false
  → 必须有真实输出 + 截图
```

## 脚本说明

### check.sh — 环境检测

检测 5 项：
1. **playwright** — `npx playwright --version`
2. **playwright chromium** — `~/.cache/ms-playwright/chromium-*/chrome-linux/chrome`
3. **系统 chrome** — `google-chrome` / `chromium` 命令
4. **系统依赖** — libnss3 / libatk-bridge-2.0 / libxkbcommon / libdrm
5. **docker** — `docker --version`

退出码：
- 0 = 全部 OK
- 2 = 有 WARN（建议修复但能跑）
- 1 = 有 FAIL（缺必备，必须 setup）

### setup.sh — 一键安装

自动装：
1. **node/npm 检测**（必须 ≥ 18）
2. **@playwright/test**（项目级 devDependency）
3. **chromium 浏览器**（`playwright install chromium`）
4. **系统依赖**（apt-get，Ubuntu 系）

支持 `--check-only`：只检测不装。

## 纪律约束（写进引用方的 prompt）

### cmd_think_then_do.md Layer B 强化示例

```markdown
### Layer B · E2E 浏览器测试（最重要）🎯

**主 agent 自己跑**（不派 e2e-tester，不允许跳过）：

1. **环境检测**（强制）:
   ```bash
   bash src/skills/e2e-setup/scripts/check.sh
   ```
   **FAIL ≥ 1 必须装**:
   ```bash
   bash src/skills/e2e-setup/scripts/setup.sh
   ```
   **禁止**用"环境受限"作 E2E 跳过的理由。装不上是技术问题，不是 E2E 可选理由。

2. **启动应用**:
   ```bash
   docker compose up -d
   # 或 npm start & / python main.py &
   ```

3. **写 + 跑 playwright 脚本**（1~3 个核心 journey）:
   ```bash
   npx playwright install chromium  # 双保险
   npx playwright test --reporter=list --headed=false
   ```

4. **断言**: 每个 journey 必须 PASS（含截图 + HTTP + DOM）
5. **失败处理**: 任何 journey FAIL → **P0 硬阻塞 → 回 Step 4**

**绝对禁止**：
- 禁止"环境受限 → 手动验证清单"兜底
- 禁止"无 GUI → 跳过 E2E"
- 禁止"浏览器没装 → 标注跳过"

唯一例外：setup.sh 装完后仍 FAIL（如 root 权限问题）→ HALT 报告用户，不准偷懒。
```

## 自检清单（装本 skill 后）

```
□ check.sh 能跑（exit code 反映状态）
□ setup.sh 能跑（能装 chromium）
□ cmd_think_then_do Layer B 模板引用 e2e-setup
□ 删掉一切"环境受限跳过"的话术
□ P0 规则：任何 journey FAIL = 回 Step 4，禁止兜底
```

## references/

待补：playwright 进阶用法（fixture / trace viewer / parallel / CI integration）。