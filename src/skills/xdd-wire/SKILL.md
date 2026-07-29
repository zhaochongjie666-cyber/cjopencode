---
name: xdd-wire
description: |
  xdd 设计层 -- 前端锚。根据规则（RXX）生成页面清单，每页一个 Markdown 线框文件（含布局 + 6 操作态 + review）。
  核心原则：每个元素必须有存在的意义，无混淆。一个页面一个 .md，所有态在一起。
  产出 .xdd/design/wire/{page}.md（含 **SVG 嵌入 markdown** 布局 + 元素清单 + 6 操作态 + review）。
  纯后端项目跳过本 skill。
  触发：画页面、wire、线框图、UI 设计、前端设计稿、review 页面、原型、操作态、空状态、加载态、错误态、边界态、edge case、状态页面。
---

# xdd-wire - 前端锚（SVG 段落）

## 我锚定什么 / 上游 / 下游

**我锚定的是「用户看到什么、怎么操作、每个状态长什么样」** -- 把业务规则变成可视的页面线框。每个元素都要有存在的理由，6 态都要写清楚。

**画图方式升级**：所有布局用 **SVG code fence 嵌入 markdown**（不用 ASCII 段落）。SVG 直接在 IDE / GitHub / GitLab / Obsidian 渲染，无需外部工具，可在 review 时直接看到视觉效果。

| | |
|---|---|
| **上游** | `xdd-brainstorm`(intent.md) + `xdd-spec`(RXX 规则 + Feature 里的页面名/交互/角色) |
| **我产出** | `.xdd/design/wire/{page}.md`（每页一个文件，含 **SVG 嵌入** + 元素清单 + 6 操作态 + review） |
| **下游消费者** | `xdd-plan`（前端 task）、`xdd-verify`（页面渲染验收） |
| **回溯锚** | 元素清单里标 `@covers-RXX` |

## 怎么做

### Step 1 · 解析规格，产出页面清单

**输入优先级**（按顺序读）：

1. `.xdd/design/spec/{bxx-slug}/*.feature` - Feature/Scenario 里的页面名、交互、角色
2. `.xdd/design/intent.md` - 业务目标
3. `.xdd/design/design.md` - 范围（in/out scope）
4. `.xdd/design/wire/` - 历史 wire（识别可复用组件）

**输出页面清单**（写到第一个页面 .md 的顶部，或单独 `_pages.md`）：

```markdown
| # | 页面名 | 文件 | 核心交互 | 角色 | 来源 RXX |
|---|--------|------|---------|------|---------|
| 1 | 任务列表页 | tasks.md | 展示/筛选/创建 | P1 普通用户 | R05,R06 |
| 2 | 登录页 | login.md | 账号密码登录 | P1 游客 | R01 |
```


**自检**：所有页面都有规格来源，无凭空出现；多角色页面标角色差异。

### Step 2 · 每页一个 Markdown，画布局 + 6 操作态

**一个页面一个 `.md` 文件**，**用 SVG code fence 嵌入 markdown** 画布局，6 态全写在同一个文件里。

#### SVG 基础规范

**所有布局代码块用 ` ```svg ` 包裹**，例：

    ```svg
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" font-family="sans-serif" font-size="14">
      <!-- 元素 -->
      <rect x="0" y="0" width="800" height="600" fill="#fafafa" stroke="#ccc"/>
      <rect x="0" y="0" width="800" height="60" fill="#fff" stroke="#ccc"/>
      <text x="20" y="35" fill="#333">[Logo]</text>
      <text x="100" y="35" fill="#666">任务</text>
      <rect x="650" y="80" width="100" height="32" fill="#3b82f6" rx="4"/>
      <text x="700" y="100" fill="#fff" text-anchor="middle">新建</text>
    </svg>
    ```

**SVG 画图原则**：
- 用 `<rect>` 画容器 / 卡片 / 按钮（fill 颜色 + stroke 描边 + rx 圆角）
- 用 `<text>` 画文字（x/y 定位 + fill 颜色 + text-anchor 居中）
- 用 `<line>` 画分隔线（y1=y2 水平 / x1=x2 垂直）
- 用 `<circle>` 画头像 / 状态点（cx/cy + r）
- 用 `<!-- -->` 注释标注关键区域（不渲染）
- viewBox 用 800×600（desktop）/ 400×600（mobile），按需调
- 颜色规范：
  - 背景 `#fafafa` / 容器 `#fff` / 描边 `#ccc`
  - 主色 `#3b82f6` / 警告 `#f59e0b` / 错误 `#ef4444` / 成功 `#10b981`
  - 文字 主 `#333` / 次 `#666` / 禁用 `#999`

#### 文件模板

````markdown
# 任务列表页 - 线框  @covers-R05,R06

## 页面信息
- 路由: /tasks
- 角色: P1 普通用户
- 来源: R05(展示任务), R06(筛选任务)

## 布局（desktop）

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" font-family="sans-serif" font-size="14">
  <!-- 背景 -->
  <rect x="0" y="0" width="800" height="600" fill="#fafafa"/>

  <!-- 导航栏 -->
  <rect x="0" y="0" width="800" height="60" fill="#fff"/>
  <line x1="0" y1="60" x2="800" y2="60" stroke="#ccc"/>
  <text x="20" y="35" fill="#333" font-weight="bold">[Logo]</text>
  <text x="100" y="35" fill="#666">任务</text>
  <text x="160" y="35" fill="#666">设置</text>
  <text x="700" y="35" fill="#666">[用户▼]</text>

  <!-- 标题栏 -->
  <text x="20" y="100" fill="#333" font-size="18" font-weight="bold">任务列表</text>
  <rect x="650" y="80" width="60" height="32" fill="#3b82f6" rx="4"/>
  <text x="680" y="100" fill="#fff" text-anchor="middle">新建</text>
  <rect x="720" y="80" width="60" height="32" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="750" y="100" fill="#333" text-anchor="middle">筛选</text>

  <!-- 任务卡片 ×3 -->
  <rect x="20" y="140" width="240" height="120" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="30" y="160" fill="#333" font-weight="bold">任务标题 1</text>
  <circle cx="35" cy="185" r="4" fill="#10b981"/>
  <text x="45" y="189" fill="#666" font-size="12">进行中</text>
  <text x="30" y="220" fill="#999" font-size="12">[操作▼]</text>

  <rect x="280" y="140" width="240" height="120" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="290" y="160" fill="#333" font-weight="bold">任务标题 2</text>
  <circle cx="295" cy="185" r="4" fill="#f59e0b"/>
  <text x="305" y="189" fill="#666" font-size="12">待审核</text>
  <text x="290" y="220" fill="#999" font-size="12">[操作▼]</text>

  <rect x="540" y="140" width="240" height="120" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="550" y="160" fill="#333" font-weight="bold">任务标题 3</text>
  <circle cx="555" cy="185" r="4" fill="#10b981"/>
  <text x="565" y="189" fill="#666" font-size="12">进行中</text>
  <text x="550" y="220" fill="#999" font-size="12">[操作▼]</text>

  <!-- 分页 -->
  <text x="20" y="500" fill="#666">&lt; 1 2 3 ... 10 &gt;</text>
</svg>
```

## 布局（mobile）

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" font-family="sans-serif" font-size="14">
  <!-- 顶栏 -->
  <rect x="0" y="0" width="400" height="50" fill="#fff"/>
  <line x1="0" y1="50" x2="400" y2="50" stroke="#ccc"/>
  <text x="20" y="32" fill="#333" font-size="18">☰</text>
  <text x="200" y="32" fill="#333" text-anchor="middle" font-weight="bold">任务</text>
  <text x="365" y="32" fill="#3b82f6" font-size="20">+</text>

  <!-- 筛选 tab -->
  <rect x="0" y="50" width="400" height="40" fill="#fff"/>
  <line x1="0" y1="90" x2="400" y2="90" stroke="#ccc"/>
  <text x="50" y="75" fill="#3b82f6" font-weight="bold">[全部]</text>
  <text x="130" y="75" fill="#666">[进行中]</text>
  <text x="220" y="75" fill="#666">[已完成]</text>

  <!-- 卡片列表 -->
  <rect x="20" y="110" width="360" height="100" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="30" y="135" fill="#333" font-weight="bold">任务标题 1</text>
  <circle cx="35" cy="160" r="4" fill="#10b981"/>
  <text x="45" y="164" fill="#666" font-size="12">进行中</text>

  <rect x="20" y="230" width="360" height="100" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="30" y="255" fill="#333" font-weight="bold">任务标题 2</text>
  <circle cx="35" cy="280" r="4" fill="#f59e0b"/>
  <text x="45" y="284" fill="#666" font-size="12">待审核</text>
</svg>
```

## 元素清单
| 元素 | 类型 | 作用 | 来源 RXX | 混淆风险 |
|------|------|------|---------|---------|
| 新建按钮 | button(主色) | 创建新任务 | R05 | 无 |
| 筛选器 | select | 按状态筛选 | R06 | "全部"vs"所有"歧义->统一"全部" |
| 任务卡片 | card | 展示任务摘要 | R05 | 状态标签颜色需区分 |
| 操作下拉 | menu | 编辑/删除 | R05 | 删除需确认态 |
| 分页 | pager | 翻页 | R05 | 超过100页->边界态 |

## 6 操作态

### 空状态

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" font-family="sans-serif" font-size="14">
  <rect x="0" y="0" width="800" height="600" fill="#fafafa"/>
  <text x="400" y="250" fill="#999" font-size="64" text-anchor="middle">📋</text>
  <text x="400" y="340" fill="#666" text-anchor="middle" font-size="18">还没有任务</text>
  <text x="400" y="370" fill="#999" text-anchor="middle">点击新建创建第一个</text>
  <rect x="340" y="400" width="120" height="40" fill="#3b82f6" rx="4"/>
  <text x="400" y="425" fill="#fff" text-anchor="middle" font-weight="bold">新建任务</text>
</svg>
```

- 行动引导: [新建任务] 按钮（主色，醒目）
- 禁用: 筛选器（无数据可筛）

### 加载态

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" font-family="sans-serif" font-size="14">
  <rect x="0" y="0" width="800" height="600" fill="#fafafa"/>
  <!-- 顶栏按钮禁用 -->
  <rect x="650" y="80" width="60" height="32" fill="#ccc" rx="4"/>
  <text x="680" y="100" fill="#fff" text-anchor="middle">⏳ 新建</text>

  <!-- 骨架卡片 ×3 -->
  <rect x="20" y="140" width="240" height="120" fill="#fff" stroke="#e0e0e0" rx="4"/>
  <rect x="30" y="155" width="180" height="14" fill="#e0e0e0"/>
  <rect x="30" y="180" width="120" height="12" fill="#e8e8e8"/>

  <rect x="280" y="140" width="240" height="120" fill="#fff" stroke="#e0e0e0" rx="4"/>
  <rect x="290" y="155" width="180" height="14" fill="#e0e0e0"/>
  <rect x="290" y="180" width="120" height="12" fill="#e8e8e8"/>

  <rect x="540" y="140" width="240" height="120" fill="#fff" stroke="#e0e0e0" rx="4"/>
  <rect x="550" y="155" width="180" height="14" fill="#e0e0e0"/>
  <rect x="550" y="180" width="120" height="12" fill="#e8e8e8"/>
</svg>
```

- 骨架屏（灰色占位块）
- 禁用: 新建/筛选按钮

### 错误态

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" font-family="sans-serif" font-size="14">
  <rect x="0" y="0" width="800" height="600" fill="#fafafa"/>
  <!-- 保留导航栏 -->
  <rect x="0" y="0" width="800" height="60" fill="#fff"/>
  <text x="400" y="250" fill="#ef4444" font-size="64" text-anchor="middle">⚠️</text>
  <text x="400" y="340" fill="#333" text-anchor="middle" font-size="18">加载失败</text>
  <text x="400" y="370" fill="#666" text-anchor="middle">请检查网络后重试</text>
  <rect x="340" y="400" width="120" height="40" fill="#3b82f6" rx="4"/>
  <text x="400" y="425" fill="#fff" text-anchor="middle" font-weight="bold">重试</text>
</svg>
```

- 人话错误（不是错误码）
- [重试] 按钮
- 保留导航栏

### 成功态

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" font-family="sans-serif" font-size="14">
  <rect x="0" y="0" width="800" height="600" fill="#fafafa"/>
  <!-- toast 浮动提示 -->
  <rect x="280" y="80" width="240" height="48" fill="#10b981" rx="8"/>
  <text x="400" y="110" fill="#fff" text-anchor="middle" font-size="14">✓ 新建成功</text>
  <!-- 正常列表内容（透明示意） -->
  <text x="20" y="200" fill="#333">（正常列表内容）</text>
</svg>
```

- toast 提示"操作成功"，2 秒后自动消失
- 不阻塞操作

### 确认态（删除任务时）

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" font-family="sans-serif" font-size="14">
  <rect x="0" y="0" width="800" height="600" fill="#000" fill-opacity="0.5"/>
  <!-- 弹窗 -->
  <rect x="240" y="180" width="320" height="200" fill="#fff" stroke="#ccc" rx="8"/>
  <text x="400" y="220" fill="#333" text-anchor="middle" font-size="18" font-weight="bold">确认删除？</text>
  <text x="400" y="260" fill="#666" text-anchor="middle">删除"XXX"后不可恢复</text>
  <!-- 按钮 -->
  <rect x="280" y="310" width="100" height="40" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="330" y="335" fill="#333" text-anchor="middle">取消（默认）</text>
  <rect x="420" y="310" width="100" height="40" fill="#ef4444" rx="4"/>
  <text x="470" y="335" fill="#fff" text-anchor="middle" font-weight="bold">确认删除</text>
</svg>
```

- 说明后果（不可恢复）
- [取消] 是默认（防误触）
- [确认删除] 红色（破坏性视觉提示）

### 边界态

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" font-family="sans-serif" font-size="14">
  <rect x="0" y="0" width="800" height="600" fill="#fafafa"/>
  <rect x="0" y="60" width="800" height="48" fill="#fef3c7" stroke="#f59e0b"/>
  <text x="20" y="90" fill="#92400e">⚠ 已加载全部 1000 条，使用筛选缩小范围</text>
</svg>
```

- 数据溢出: "已加载全部 1000 条，使用筛选缩小范围"
- 无权限: "您没有权限查看此页面" + [返回首页]
- 离线: "当前离线，显示缓存数据" + 降级提示
````

#### 6 态规范（每态有明确该有/不该有）

| 态 | 该有 | 不该有 |
|----|------|--------|
| **空** | 行动引导（不是"暂无数据"） | 只有空图标无引导 |
| **加载** | 骨架屏/进度、按钮禁用 | 白屏或无限转圈 |
| **错误** | 人话原因 + 重试按钮 | 只显错误码 |
| **成功** | toast/反馈、不阻塞 | 强制弹窗打断 |
| **确认** | 后果说明、取消是默认 | 直接执行破坏性操作 |
| **边界** | 降级方案/限制说明 | 静默失败或空白 |

### Step 3 · 攻击式 review（写在同一文件底部）

每个页面 .md 底部写 `## Review`，逐条质疑：

- **Q1 这个按钮为什么要存在？** -- 用户不知道功能存在呢？有更自然的方式吗？-> 保留/修改/删除
- **Q2 这个数字是什么范围？** -- 用户能判断"今日/本周/累计"吗？没上下文就加时间范围标注
- **Q3 两个相似元素行为一致吗？** -- 外观像的，行为也得像；不像就区分外观
- **Q4 第一次用的用户看得懂吗？** -- 列出内部术语/缩写/黑话，翻译成用户语言
- **Q5 有没有"一次性"交互没告知？** -- 只该做一次的操作有没有明确引导

**深度 UX 审查**（复杂页面）走 4 级框架，见 `references/ux-review.md`：
- 🔴 L1 功能性（不通过则不可用：任务可完成/错误反馈/状态可见/防破坏/键盘可达）
- 🟡 L2 可用性（一致性/信息层次/认知负荷/反馈即时/撤销返回/移动端/文案）
- 🟢 L3 可达性 a11y（语义标签/ARIA/对比度/焦点可见/替代文本/减动效）
- 🔵 L4 体验质感（微交互/动效合理/空状态/加载体验/成功庆祝/品牌一致）

## 产出

```
.xdd/design/wire/
├── _pages.md          ← 页面清单（可选，也可写在第一个页面顶部）
├── tasks.md           ← 每页一个 md（SVG 布局+元素+6态+review 全在一个文件）
├── login.md
├── settings.md
└── ...
```

**一个页面一个文件，SVG 直接渲染，所有内容在一起，不用逐个点 HTML。**

## 自检

**混淆元素四类（交付前必扫，有则必消）**：

- **A 视觉混淆**：只有 icon 没 label 的按钮 / 两个外观像行为不同的元素 / 数字没时间范围 / 进度条没说明
- **B 语义混淆**：label 与输入不匹配 / 破坏性操作没确认 / 错误只有错误码 / 状态标签与实际不符
- **C 交互混淆**：点击区域不明 / 返回路径不清 / 多步骤没进度指示 / 提交没结果反馈
- **D 内容混淆**：术语没翻译 / 日期格式混用 / 数字没单位 / 列表没排序说明

```
□ 每个页面有规格来源（RXX），无凭空页面？
□ 每页一个 .md 文件（不是一堆 HTML）？
□ 每页有 desktop + mobile 两个 SVG code fence 布局？
□ 6 操作态全覆盖（空/加载/错误/成功/确认/边界，每态有 SVG code fence + 说明）？
□ SVG 用 ```svg``` 包裹（不是 ``` ``` 也不是 ```html```）？
□ SVG 含 viewBox + 基础元素（rect/text/line/circle）？
□ 每个按钮有 label 或 tooltip？
□ 元素清单标了 @covers-RXX？
□ 混淆元素 A/B/C/D 四类全扫，零未处理项？
□ 每页 .md 底部有 Review（Q1-Q5 逐条回答）？
□ 可见文字无 em-dash（-）？
□ design/ 产物不引用 xdd_run（design 是持久锚，长期保留）？
```