---
name: e2e-test
description: >
  Normal Flow E2E 浏览器测试 skill。e2e-tester 装本 skill 跑 Playwright 用户旅途 + 截图。
  产物落 .xdd/runs/nf_run/（e2e-report.md ≥ 1000 + screenshots/*.png ≥ 4 张每张 ≥ 5KB）。
---

# e2e-test · 浏览器 E2E 测试方法论

## 本 skill 做什么

把设计阶段的 .feature 场景和用户旅途文档，转成真实的浏览器 E2E 测试。用 Playwright 驱动浏览器，逐个场景 click/navigate/assert，贴真实截图和输出。

## 前置：读设计

```
read .xdd/design/spec/{Bxx-slug}/scenarios.feature   -- Gherkin 场景（正向 + 兜底）
read .xdd/design/design.md                            -- 用户旅途
read .xdd/design/architecture/{Bxx-slug}/architecture.md  -- 端点/端口/模块
```

测试对象 = 这些场景和用户旅途。每条都要有浏览器执行证据。

## 产物路径（落 `.xdd/runs/nf_run/`）

- `.xdd/runs/nf_run/e2e-report.md` ≥ 1000 字节，含「用户旅途截图」+ 截图引用
- `.xdd/runs/nf_run/screenshots/*.png` ≥ 4 张 PNG，每张 ≥ 5KB
- PNG 文件头校验：`file *.png` 必须返回 `PNG image data`

## Gate 硬检查（按 architecture §5）

1. e2e-report.md 真实落盘（`stat` 返回）
2. e2e-report.md 字节数 ≥ 1000
3. 关键 grep 命中：含「用户旅途截图」+ 截图路径引用
4. screenshots/*.png 张数 ≥ 4，每张 ≥ 5KB
5. PNG 文件头校验通过
6. 用户旅途走通（P0 = 0）

## 环境准备

### 1. 确认应用运行

```bash
# 从 architecture.md 找到端口，检查应用是否在跑
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
# 没跑就启动（根据项目类型）
npm start &     # 或 go run main.go & 或 make run &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

### 2. 安装 Playwright（如未安装）

```bash
# 检查是否已有 playwright
npx playwright --version 2>/dev/null || npm install -D playwright && npx playwright install chromium
```

## 测试方法

### 从 .feature 提取场景

读 `scenarios.feature`，把每个 Scenario 转成一个浏览器测试步骤序列：

```gherkin
Scenario: 正确密码登录
  Given 用户 user1 已注册
  When 用正确密码登录
  Then 返回 200 和 token
```

转成：

```javascript
// test/e2e/login.spec.js
import { test, expect } from '@playwright/test';

test('正确密码登录', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await page.fill('[name=username]', 'user1');
  await page.fill('[name=password]', 'correct_pass');
  await page.click('button[type=submit]');
  // 断言
  await expect(page).toHaveURL(/dashboard|home/);
  // 截图
  await page.screenshot({ path: '.xdd/runs/nf_run/screenshots/01-login-success.png' });
});
```

### 用户旅途测试

从 `design.md` 的用户旅程，构造端到端多步测试：

```javascript
test('用户注册->登录->使用->退出', async ({ page }) => {
  // 注册
  await page.goto('http://localhost:3000/register');
  await page.fill('[name=username]', 'testuser_e2e');
  await page.fill('[name=password]', 'Test1234!');
  await page.click('button[type=submit]');
  await page.screenshot({ path: '.xdd/runs/nf_run/screenshots/journey-01-register.png' });

  // 登录
  await page.goto('http://localhost:3000/login');
  await page.fill('[name=username]', 'testuser_e2e');
  await page.click('button[type=submit]');
  await page.screenshot({ path: '.xdd/runs/nf_run/screenshots/journey-02-login.png' });

  // 使用核心功能
  // ...

  // 退出
  await page.click('[data-testid=logout]');
  await expect(page).toHaveURL(/login/);
  await page.screenshot({ path: '.xdd/runs/nf_run/screenshots/journey-03-logout.png' });
});
```

### 兜底场景测试（必须测）

每个兜底场景（失败/拒绝/无权限/边界）都要有浏览器测试：

```javascript
test('密码错误显示错误提示', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await page.fill('[name=username]', 'user1');
  await page.fill('[name=password]', 'wrong_pass');
  await page.click('button[type=submit]');
  // 断言错误提示出现，不是 500 崩溃
  await expect(page.locator('.error')).toBeVisible();
  await expect(page).not.toHaveURL(/dashboard/);
  await page.screenshot({ path: '.xdd/runs/nf_run/screenshots/fallback-01-wrong-password.png' });
});

test('未登录访问受保护页面被拒', async ({ page }) => {
  await page.goto('http://localhost:3000/profile');
  await expect(page).toHaveURL(/login/);  // 重定向到登录页
  await page.screenshot({ path: '.xdd/runs/nf_run/screenshots/fallback-02-no-auth.png' });
});
```

## e2e-report.md 结构

```markdown
# E2E Test Report

## 1. 环境
- App URL: http://localhost:3000
- Browser: chromium (Playwright)
- 启动命令: npm start
- 测试时间: 2026-07-25T12:00:00Z

## 2. 用户旅途测试
### 旅程1: 注册 -> 登录 -> 使用 -> 退出
- Navigate /register: ✅ 200
- Fill + submit: ✅
- Redirect /login: ✅
- 截图: .xdd/runs/nf_run/screenshots/journey-01-register.png
- 结果: ✅ PASS

## 3. 场景测试（来自 .feature）
### Scenario: 正确密码登录
- goto /login, fill, click
- 断言: redirect to /dashboard
- 截图: .xdd/runs/nf_run/screenshots/01-login-success.png
- 结果: ✅ PASS

### Scenario: 密码错误（兜底）
- goto /login, fill wrong password, click
- 断言: .error visible, not redirected
- 截图: .xdd/runs/nf_run/screenshots/02-wrong-password.png
- 结果: ✅ PASS

## 4. 测试命令输出
$ npx playwright test --reporter=line
  ✓  1 [chromium] › login.spec.js:3:1 › 正确密码登录
  ✓  2 [chromium] › login.spec.js:15:1 › 密码错误显示错误提示
  2 passed (3.2s)

exit code: 0

## 5. 截图清单
- journey-01-register.png
- journey-02-login.png
- 01-login-success.png
- 02-wrong-password.png

## 6. 结果汇总
- 总场景: 8
- 通过: 7
- 失败: 1
- P0: 0 (所有用户旅途走通)
- P1: 1 (密码错误时 error 文案与设计不符)
- P2: 0
```

## Gate 硬检查条目

| 检查 | 要求 | 必须是真实证据 |
|------|------|---------------|
| 报告存在 | `.xdd/runs/nf_run/e2e-report.md` >= 1000 字节 | 有实质内容 |
| 正向通过 | 报告含 `PASS` / `passed` / `通过` + exit code 0 | 贴 playwright 输出 |
| 兜底测试 | 报告含兜底场景的浏览器测试结果 | 贴 click/assert 输出 |
| 真实浏览器 | 报告含 `goto` / `click` / `navigate` / `screenshot` | 贴真实 URL 和操作 |
| 截图 | screenshots 目录有 ≥ 4 张 .png 文件，每张 ≥ 5KB | 不是空目录 |
| P0 声明 | 报告明确声明 P0 数量 | P0=0 才算通过 |

## P0/P1/P2 分级

| 级别 | 含义 | 处理 |
|------|------|------|
| P0 | 用户旅途走不通 / 核心场景失败 / 浏览器崩溃 | 必须回炉修复 |
| P1 | 兜底场景未拦截 / 错误文案不对 / 断言失败 | 必须修复后重测 |
| P2 | 截图缺失 / 样式小问题 | 声明后可过 |

**只有 P0=0 才建议通过。P1 必须修复。**

## 底线

```
1. 每个场景都要有真实浏览器执行 -- 不是写"已测试"，贴 goto/click/assert
2. 兜底场景必须测 -- 错误密码/无权限/边界值，证明页面真的拦截了
3. 截图必须有 -- 每个关键步骤截图存到 .xdd/runs/nf_run/screenshots/（≥ 4 张，每张 ≥ 5KB）
4. 用户旅途必须走通 -- 从开始到结束完整跑一遍
```

干完后把 e2e-report.md 路径 + P0/P1/P2 计数 + 是否建议通过返回给 flow_agent。
