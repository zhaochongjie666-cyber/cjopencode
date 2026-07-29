---
name: wire-design
description: |
  通用 web wire design 方法论（数据页面 / 用户关注点 / 设计哲学 / SVG 模板）参考案例集。
  配合 wire-design/SKILL.md 使用。
---

# wire-design · 参考案例

## 5 类数据页 × 3 示例 = 15 个完整 SVG 案例

### 概览页（仪表盘）— 3 个示例

1. **电商订单概览**：4 个 hero (今日订单 / 营收 / 异常订单 / 完成率) + 7 日趋势 + 异常 Top 5
2. **SaaS 用户概览**：DAU / MAU / 新增 / 流失 + 留存趋势 + 异常用户
3. **开发任务概览**：活跃任务 / 平均周期 / 阻塞数 / 完工率 + 燃尽图 + 阻塞列表

### 列表页 — 3 个示例

1. **客户列表**：搜索 + 筛选 + 批量 + 7 列精选
2. **订单列表**：状态筛选 + 时间窗 + 异常标红 + 导出
3. **Bug 列表**：标签筛选 + 严重度 + 批量分配 + 趋势

### 详情页 — 3 个示例

1. **任务详情**：头部信息卡 + Tab（详情 / 评论 / 附件） + 时间线 + 操作
2. **客户详情**：基础信息 + 订单历史 + 备注 + 操作按钮
3. **Bug 详情**：复现步骤 + 截图 + 评论 + 关联 PR

### 表单页 — 3 个示例

1. **3 步创建任务**：基本信息 → 分配 → 提交（带自动保存）
2. **设置页（多分组）**：账号 / 通知 / 安全 / API 密钥
3. **筛选器配置**：保存的筛选 + 共享 + 删除

### 对比页 — 3 个示例

1. **方案对比**：性能 / 成本 / 推荐项
2. **版本对比**：本期 vs 上期 + 关键指标 diff
3. **AB 实验对比**：实验组 vs 对照组 + 显著性

## 通用组件 SVG 库

### Hero Metric 卡

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 120" font-family="sans-serif" font-size="14">
  <rect x="0" y="0" width="220" height="120" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="20" y="30" fill="#666" font-size="13">[指标名] ([时间范围])</text>
  <text x="20" y="75" fill="#333" font-size="36" font-weight="bold">[数值]</text>
  <text x="20" y="100" fill="#10b981" font-size="12">[对比基准]</text>
</svg>
```

### 状态标签

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 24" font-family="sans-serif" font-size="12">
  <rect x="0" y="0" width="100" height="24" rx="12"/>
  <!-- 主色: 进行中 -->
  <rect x="0" y="0" width="100" height="24" fill="#eff6ff" stroke="#3b82f6" rx="12"/>
  <text x="50" y="16" fill="#1e40af" text-anchor="middle">进行中</text>

  <!-- 成功: 已完成 -->
  <rect x="0" y="0" width="100" height="24" fill="#ecfdf5" stroke="#10b981" rx="12"/>
  <text x="50" y="16" fill="#065f46" text-anchor="middle">已完成</text>

  <!-- 警告: 待审核 -->
  <rect x="0" y="0" width="100" height="24" fill="#fffbeb" stroke="#f59e0b" rx="12"/>
  <text x="50" y="16" fill="#92400e" text-anchor="middle">待审核</text>

  <!-- 错误: 异常 -->
  <rect x="0" y="0" width="100" height="24" fill="#fef2f2" stroke="#ef4444" rx="12"/>
  <text x="50" y="16" fill="#991b1b" text-anchor="middle">异常</text>
</svg>
```

### 按钮三态

```svg
<!-- 主按钮 -->
<rect x="0" y="0" width="100" height="36" fill="#3b82f6" rx="4"/>
<text x="50" y="22" fill="#fff" text-anchor="middle" font-weight="bold">[主按钮]</text>

<!-- 次按钮 -->
<rect x="0" y="0" width="100" height="36" fill="#fff" stroke="#ccc" rx="4"/>
<text x="50" y="22" fill="#333" text-anchor="middle">[次按钮]</text>

<!-- 危险按钮 -->
<rect x="0" y="0" width="100" height="36" fill="#ef4444" rx="4"/>
<text x="50" y="22" fill="#fff" text-anchor="middle" font-weight="bold">[危险按钮]</text>
```

### 表单字段

```svg
<!-- 普通字段 -->
<text x="0" y="0" fill="#333">[label] <tspan fill="#ef4444">*</tspan></text>
<rect x="0" y="10" width="300" height="36" fill="#fff" stroke="#ccc" rx="4"/>
<text x="15" y="33" fill="#333" font-size="13">[值]</text>
<text x="0" y="60" fill="#999" font-size="11">[帮助文字]</text>

<!-- 错误状态 -->
<rect x="0" y="10" width="300" height="36" fill="#fef2f2" stroke="#ef4444" rx="4"/>
<text x="15" y="33" fill="#991b1b" font-size="13">[错误值]</text>
<text x="0" y="60" fill="#ef4444" font-size="11">⚠ [错误原因]</text>

<!-- 成功状态 -->
<rect x="0" y="10" width="300" height="36" fill="#f0fdf4" stroke="#10b981" rx="4"/>
<text x="280" y="33" fill="#10b981" text-anchor="end" font-size="13">✓</text>
```

### 表格行

```svg
<!-- 表头 -->
<rect x="0" y="0" width="800" height="44" fill="#f3f4f6"/>
<text x="20" y="27" fill="#666" font-size="12">☐</text>
<text x="60" y="27" fill="#666" font-size="12">[列 1]</text>
...

<!-- 行 (正常) -->
<rect x="0" y="0" width="800" height="44" fill="#fff"/>
<line x1="0" y1="44" x2="800" y2="44" stroke="#f3f4f6"/>
<text x="20" y="27" fill="#666" font-size="13">☐</text>
...

<!-- 行 (异常高亮) -->
<rect x="0" y="0" width="800" height="44" fill="#fef2f2"/>
<line x1="0" y1="44" x2="800" y2="44" stroke="#f3f4f6"/>
<text x="20" y="27" fill="#666" font-size="13">☐</text>
...
```

### 面包屑 + 返回

```svg
<text x="20" y="30" fill="#666" font-size="13">
  <tspan fill="#3b82f6">[根]</tspan> / <tspan fill="#3b82f6">[父]</tspan> / <tspan fill="#333">[当前]</tspan>
</text>
<rect x="20" y="42" width="100" height="32" fill="#fff" stroke="#ccc" rx="4"/>
<text x="70" y="62" fill="#333" text-anchor="middle">← 返回 [父]</text>
```

## 反例画廊（5 个常见错误 → 5 个正确做法）

| # | 错误 | 正确 |
|---|------|------|
| 1 | 14 列堆叠 | 8 列精选 + 详情下钻 |
| 2 | 全是大字号 KPI | hero + 单位 + 时间 + 对比基准 |
| 3 | 8 个按钮平铺 | 3 个主按钮 + 「更多」下拉 |
| 4 | 无面包屑 | 面包屑 + 返回按钮 + URL 反映 |
| 5 | 角色混用同一视图 | 顶部角色切换 / 视图切换 |

## 什么时候用 examples.md

- **复杂页面**：当 wire/SKILL.md 的 5 类模板不够用时
- **想看具体效果**：跟用户 / 设计师对线时拉实际 SVG
- **教学**：给初级设计师 / 开发者入门