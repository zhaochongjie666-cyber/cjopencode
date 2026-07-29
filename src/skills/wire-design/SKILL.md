---
name: wire-design
description: |
  通用 web wire design 方法论。教 AI 设计数据驱动的网页线框（含 SVG code fence），
  输出 markdown 文件含 SVG 布局 + 元素清单 + 9 操作态 + 用户关注点 5 问 + 反 sham 自检。

  适用场景：
  - 任何 web / 移动端前端页面设计
  - 数据驱动页面（仪表盘 / 列表 / 详情 / 表单 / 对比）
  - 设计哲学 + 用户关注点双锚定

  不依赖任何 xdd-*/nfflow-* 业务框架，可独立使用。
  触发：画页面、wire、线框图、UI 设计、前端设计稿、review 页面、原型、操作态、空状态、加载态、错误态、边界态、状态页面。
---

# wire-design · 通用 web wire 设计

## 我锚定什么

数据页面设计的**通用方法论**。不绑定任何业务框架（不依赖 xdd-flow / nfflow）。

**双锚定**：**设计哲学（6 条）** + **用户关注点（5 问）** ——
设计哲学告诉你 *长什么样*，用户关注点告诉你 *为什么这样*。

任何项目（独立前端 / SaaS / 内网工具 / 移动端 webview）都能用。
下游可以是任何框架（Vue / React / 纯 HTML / low-code）。

## 设计哲学（6 条核心规则）

### 1. 信息密度（每个像素都能被引用）

留白是有目的的——分隔、呼吸、突出重点。
空白 ≠ 装饰图、营销大字、空状态图标无引导。

判断标准：**每个像素是否可被引用**？

### 2. 信息层级（5s 首屏可懂）

用户进页面 5s 内要回答 3 个问题：
- 「这是啥？」 — 标题 + 面包屑
- 「我能干啥？」 — 主操作 1 个最大
- 「数据长啥样？」 — hero metric

**H1/H2/H3 字号差距要够大**（不是都用 16px）。

### 3. 数字三要素（不可省）

数字必须带 3 样东西：
- **单位**（元 / 件 / 次 / 个 / %）
- **时间范围**（今日 / 本周 / 累计 / 自 X 起）
- **对比基准**（同比 +12% / 环比 -5% / 行业 Top 10%）

裸奔「1234」= 反人类。

### 4. 按钮目的（4 类，禁止装饰）

每个按钮必须满足至少 1 条：
- **改变状态**（审批 / 关闭 / 启用）
- **跳转导航**（详情 / 编辑 / 子页）
- **批量动作**（勾选后操作）
- **数据导出**（CSV / 报表）

装饰按钮（不映射任何动作）= 直接删。

主按钮最多 3 个，> 3 = 用户选择困难。

### 5. 跳转上下文（防迷路）

每个跳转页要有：
- **面包屑**（我从哪来）
- **返回按钮**（带页面标题，不是空箭头）
- **URL 反映路径**（`/datasets/123/exports/456` 不长但有意义）

### 6. 一致性（隐含但致命）

- 同类页用同套布局
- 同类操作用同套确认流程
- 同类状态用同色
- **同一个含义的词不变**（不要"用户 / 客户 / 账号"混用）

## 用户关注点 5 问（每页必答）

每页 wire 顶部必须答这 5 问。

```
Q1 谁会打开这页？
   角色枚举（执行者 / 管理者 / 高层 / 游客）
   ↓ 决定信息密度（执行者要密，管理者要概览，高层要 hero）

Q2 打开时最想知道什么？
   列出 3 个核心关注点
   每个关注点 → 1 个 hero 区块
   ↓ 「不是全部，就是 3 个」

Q3 最常做什么动作？
   1-2 个主动作（最多 3）
   这些按钮 = 最大最显
   其它动作 → 下拉 / 菜单

Q4 看完要带走哪个决策？
   一句话：用户看完决定做啥
   例：「继续往下做」「找 P4 解决异常」「关掉页面（一切正常）」
   设计服务这个决策

Q5 用户的认知带宽？
   5s 扫一眼 / 30s 仔细看 / 5min 深入操作
   ↓ 决定首屏密度 + 是否分 tab
```

### 角色 × 关注点矩阵

| 角色 | 典型问句 | 核心关注 | 设计倾向 |
|------|---------|---------|---------|
| 执行者（P1） | 今天还剩多少？ | 当前任务量 / 下一步 | 高密度 + 进度条 |
| 质检者（P2） | 哪个有问题？ | 异常 / 待审 | 异常置顶红色 |
| 管理者（P4） | 团队怎么样？ | 团队 KPI / 瓶颈 | 对比 + 趋势图 |
| 高层（P5） | 结果好不好？ | ROI / 进度 | 极简 4 个 hero |
| 游客（未登录） | 这能做啥？ | 注册入口 + demo | 视频 + 大 CTA |

## SVG 基础规范

**所有布局代码块用 ` ```svg ` 包裹**。

### 基础元素速查

| 元素 | 用途 | 关键属性 |
|------|------|---------|
| `<rect>` | 容器 / 卡片 / 按钮 | `fill` + `stroke` + `rx` |
| `<text>` | 文字 | `x/y` + `fill` + `text-anchor` |
| `<line>` | 分隔线 | `x1=x2`（垂直）/ `y1=y2`（水平） |
| `<circle>` | 头像 / 状态点 | `cx/cy` + `r` |
| `<!-- -->` | 注释 | 不渲染 |

### viewBox 标准

- **desktop**：`viewBox="0 0 800 600"`
- **mobile**：`viewBox="0 0 400 600"`

### 颜色规范

| 用途 | 颜色 |
|------|------|
| 背景 | `#fafafa` |
| 容器 | `#fff` |
| 描边 | `#ccc` |
| 主色 | `#3b82f6` |
| 警告 | `#f59e0b` |
| 错误 | `#ef4444` |
| 成功 | `#10b981` |
| 文字主 | `#333` |
| 文字次 | `#666` |
| 文字禁用 | `#999` |

## 5 类数据页模板

每类含「用户关注点 5 问」 + 完整 SVG。

### 类型 1 · 概览页（仪表盘）

**用户关注点**：现在状态 / 异常 / 趋势
**主区块**：4 个 hero metric + 趋势图 + 异常列表
**Hero Metric**：总数 / 今日新增 / 异常数 / 完成率

#### 布局（desktop）

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" font-family="sans-serif" font-size="14">
  <!-- 顶栏 -->
  <rect x="0" y="0" width="800" height="60" fill="#fff"/>
  <line x1="0" y1="60" x2="800" y2="60" stroke="#ccc"/>
  <text x="20" y="35" fill="#333" font-weight="bold">[Logo]</text>
  <text x="100" y="35" fill="#666">概览</text>
  <text x="700" y="35" fill="#666">[用户▼]</text>

  <!-- 4 个 hero metric (顶部最显) -->
  <rect x="20" y="80" width="180" height="100" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="30" y="105" fill="#666" font-size="12">任务总数 (累计)</text>
  <text x="30" y="140" fill="#333" font-size="32" font-weight="bold">12.4K</text>
  <text x="30" y="165" fill="#10b981" font-size="11">↑ 12% vs 上周</text>

  <rect x="210" y="80" width="180" height="100" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="220" y="105" fill="#666" font-size="12">今日新增</text>
  <text x="220" y="140" fill="#333" font-size="32" font-weight="bold">238</text>
  <text x="220" y="165" fill="#10b981" font-size="11">↑ 8% 昨日</text>

  <rect x="400" y="80" width="180" height="100" fill="#fef2f2" stroke="#ef4444" rx="4"/>
  <text x="410" y="105" fill="#991b1b" font-size="12">待处理异常</text>
  <text x="410" y="140" fill="#ef4444" font-size="32" font-weight="bold">7</text>
  <text x="410" y="165" fill="#991b1b" font-size="11">查看 →</text>

  <rect x="590" y="80" width="180" height="100" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="600" y="105" fill="#666" font-size="12">本月完成率</text>
  <text x="600" y="140" fill="#333" font-size="32" font-weight="bold">87%</text>
  <text x="600" y="165" fill="#10b981" font-size="11">↑ 3% 上月</text>

  <!-- 异常 banner (Q4 决策服务) -->
  <rect x="20" y="200" width="760" height="48" fill="#fef3c7" stroke="#f59e0b" rx="4"/>
  <text x="35" y="228" fill="#92400e" font-weight="bold">⚠ 5 条任务超时 &gt; 24h，建议立即处理</text>
  <rect x="710" y="210" width="60" height="28" fill="#f59e0b" rx="4"/>
  <text x="740" y="229" fill="#fff" text-anchor="middle" font-size="12">去处理</text>

  <!-- 趋势图 -->
  <rect x="20" y="270" width="500" height="280" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="30" y="295" fill="#666" font-size="12">最近 30 天趋势 (件/日)</text>
  <line x1="30" y1="510" x2="510" y2="510" stroke="#ccc"/>
  <polyline points="30,420 80,400 130,380 180,360 230,340 280,330 330,310 380,290" fill="none" stroke="#3b82f6" stroke-width="2"/>

  <!-- 异常 Top 5 -->
  <rect x="540" y="270" width="240" height="280" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="550" y="295" fill="#666" font-size="12">异常 Top 5</text>
  <text x="550" y="320" fill="#333" font-size="13">1. 任务 #4521 超时 30h</text>
  <text x="550" y="345" fill="#333" font-size="13">2. 任务 #4489 卡在审核 12h</text>
  <text x="550" y="370" fill="#333" font-size="13">3. 任务 #4472 缺审 6h</text>
</svg>
```

#### 布局（mobile）

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" font-family="sans-serif" font-size="14">
  <rect x="0" y="0" width="400" height="50" fill="#fff"/>
  <line x1="0" y1="50" x2="400" y2="50" stroke="#ccc"/>
  <text x="200" y="32" fill="#333" text-anchor="middle" font-weight="bold">概览</text>

  <!-- 2x2 hero metric -->
  <rect x="20" y="70" width="180" height="80" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="30" y="95" fill="#666" font-size="12">任务总数 (累计)</text>
  <text x="30" y="125" fill="#333" font-size="28" font-weight="bold">12.4K</text>

  <rect x="210" y="70" width="180" height="80" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="220" y="95" fill="#666" font-size="12">今日新增</text>
  <text x="220" y="125" fill="#333" font-size="28" font-weight="bold">238</text>

  <rect x="20" y="160" width="180" height="80" fill="#fef2f2" stroke="#ef4444" rx="4"/>
  <text x="30" y="185" fill="#991b1b" font-size="12">异常</text>
  <text x="30" y="215" fill="#ef4444" font-size="28" font-weight="bold">7</text>

  <rect x="210" y="160" width="180" height="80" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="220" y="185" fill="#666" font-size="12">完成率</text>
  <text x="220" y="215" fill="#333" font-size="28" font-weight="bold">87%</text>

  <rect x="20" y="260" width="360" height="44" fill="#fef3c7" stroke="#f59e0b" rx="4"/>
  <text x="35" y="288" fill="#92400e" font-size="13" font-weight="bold">⚠ 5 条超时 &gt; 24h</text>
</svg>
```

### 类型 2 · 列表页（数据表）

**用户关注点**：找到目标 / 批量操作
**主区块**：搜索 + 筛选 + 表格 + 批量按钮栏
**Hero Metric**：筛选结果数 / 平均等待 / 异常占比

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" font-family="sans-serif" font-size="14">
  <!-- 顶栏 -->
  <rect x="0" y="0" width="800" height="60" fill="#fff"/>
  <line x1="0" y1="60" x2="800" y2="60" stroke="#ccc"/>
  <text x="20" y="35" fill="#333" font-weight="bold">[Logo]</text>
  <text x="100" y="35" fill="#666">任务</text>

  <!-- 标题 + 主按钮 (Q3 主动作最多 3 个) -->
  <text x="20" y="100" fill="#333" font-size="18" font-weight="bold">任务列表</text>
  <text x="130" y="100" fill="#666" font-size="14">(共 12,384 条, 平均等待 2.3h, 异常 7 条)</text>
  <rect x="650" y="80" width="60" height="32" fill="#3b82f6" rx="4"/>
  <text x="680" y="100" fill="#fff" text-anchor="middle">新建</text>
  <rect x="720" y="80" width="60" height="32" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="750" y="100" fill="#333" text-anchor="middle">导出</text>

  <!-- 搜索 + 筛选 (Q1 角色筛选) -->
  <rect x="20" y="130" width="300" height="36" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="35" y="153" fill="#999" font-size="13">🔍 搜索任务标题 / ID</text>

  <rect x="340" y="130" width="100" height="36" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="390" y="153" fill="#333" text-anchor="middle" font-size="13">全部状态 ▼</text>

  <rect x="460" y="130" width="100" height="36" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="510" y="153" fill="#333" text-anchor="middle" font-size="13">全部角色 ▼</text>

  <rect x="580" y="130" width="100" height="36" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="630" y="153" fill="#333" text-anchor="middle" font-size="13">全部时间 ▼</text>

  <!-- 批量按钮栏 (仅在勾选后显示) -->
  <rect x="20" y="180" width="760" height="44" fill="#eff6ff" stroke="#3b82f6" rx="4"/>
  <text x="35" y="208" fill="#1e40af" font-size="13">已选 3 项</text>
  <rect x="650" y="186" width="60" height="32" fill="#fff" stroke="#3b82f6" rx="4"/>
  <text x="680" y="206" fill="#3b82f6" text-anchor="middle" font-size="12">批量审核</text>
  <rect x="720" y="186" width="60" height="32" fill="#fff" stroke="#ef4444" rx="4"/>
  <text x="750" y="206" fill="#ef4444" text-anchor="middle" font-size="12">关闭</text>

  <!-- 表格 -->
  <rect x="20" y="240" width="760" height="44" fill="#f3f4f6"/>
  <rect x="20" y="240" width="40" height="44" fill="#f3f4f6" stroke="#e5e7eb"/>
  <text x="40" y="267" fill="#333" font-size="12" text-anchor="middle">☐</text>
  <text x="80" y="267" fill="#666" font-size="12">ID</text>
  <text x="160" y="267" fill="#666" font-size="12">标题</text>
  <text x="380" y="267" fill="#666" font-size="12">状态</text>
  <text x="480" y="267" fill="#666" font-size="12">等待</text>
  <text x="560" y="267" fill="#666" font-size="12">创建于 (本周)</text>
  <text x="660" y="267" fill="#666" font-size="12">操作人</text>

  <!-- 表格行 (5 列精选, 不是 14 列堆叠) -->
  <rect x="20" y="284" width="760" height="44" fill="#fff"/>
  <text x="40" y="312" fill="#666" font-size="12" text-anchor="middle">☐</text>
  <text x="80" y="312" fill="#333" font-size="13">#4521</text>
  <text x="160" y="312" fill="#333" font-size="13">用户认证授权</text>
  <circle cx="385" cy="307" r="4" fill="#ef4444"/>
  <text x="395" y="312" fill="#666" font-size="12">异常</text>
  <text x="480" y="312" fill="#ef4444" font-size="12">30h</text>
  <text x="560" y="312" fill="#666" font-size="12">3 天前</text>
  <text x="660" y="312" fill="#666" font-size="12">@张三</text>

  <!-- 分页 -->
  <text x="20" y="560" fill="#666">&lt; 1 2 3 ... 247 &gt;</text>
  <text x="700" y="560" fill="#666">10 条/页 ▼</text>
</svg>
```

### 类型 3 · 详情页（单条数据）

**用户关注点**：这条详情 / 关联项 / 操作
**主区块**：头部信息 + 关联 tab + 时间线 + 操作按钮
**Hero Metric**：状态 / 创建时间 / 操作人

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" font-family="sans-serif" font-size="14">
  <!-- 顶栏 -->
  <rect x="0" y="0" width="800" height="60" fill="#fff"/>
  <text x="20" y="35" fill="#333" font-weight="bold">[Logo]</text>

  <!-- 面包屑 (Q5 防迷路) -->
  <text x="20" y="100" fill="#666" font-size="12">
    <tspan fill="#3b82f6">任务</tspan> / <tspan fill="#3b82f6">列表</tspan> / #4521
  </text>
  <text x="20" y="125" fill="#333" font-size="20" font-weight="bold">#4521 用户认证授权</text>

  <!-- 头部信息卡 (Q2 关键属性) -->
  <rect x="20" y="145" width="760" height="80" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="40" y="170" fill="#666" font-size="12">状态</text>
  <circle cx="115" cy="166" r="5" fill="#ef4444"/>
  <text x="128" y="170" fill="#333" font-size="13" font-weight="bold">异常</text>

  <text x="240" y="170" fill="#666" font-size="12">等待时间</text>
  <text x="328" y="170" fill="#ef4444" font-size="13" font-weight="bold">30h (超时)</text>

  <text x="430" y="170" fill="#666" font-size="12">创建</text>
  <text x="480" y="170" fill="#333" font-size="13">3 天前</text>

  <text x="540" y="170" fill="#666" font-size="12">操作人</text>
  <text x="610" y="170" fill="#333" font-size="13">@张三</text>

  <!-- 主动作 (Q3, 最多 3 个) -->
  <rect x="650" y="155" width="60" height="32" fill="#3b82f6" rx="4"/>
  <text x="680" y="175" fill="#fff" text-anchor="middle">审核</text>
  <rect x="720" y="155" width="60" height="32" fill="#fff" stroke="#ef4444" rx="4"/>
  <text x="750" y="175" fill="#ef4444" text-anchor="middle">关闭</text>

  <!-- Tab 切换 (Q5 带宽) -->
  <line x1="20" y1="245" x2="780" y2="245" stroke="#ccc"/>
  <text x="30" y="240" fill="#3b82f6" font-weight="bold" font-size="13">详情</text>
  <line x1="20" y1="247" x2="100" y2="247" stroke="#3b82f6" stroke-width="2"/>
  <text x="120" y="240" fill="#666" font-size="13">评论 (3)</text>
  <text x="200" y="240" fill="#666" font-size="13">附件 (2)</text>
  <text x="280" y="240" fill="#666" font-size="13">关联任务 (1)</text>

  <!-- 详情内容 -->
  <rect x="20" y="265" width="380" height="320" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="40" y="290" fill="#666" font-size="12">描述</text>
  <text x="40" y="320" fill="#333" font-size="13">实现 JWT 认证 + 角色权限</text>
  <text x="40" y="345" fill="#333" font-size="13">拦截 401/403 全局异常</text>

  <!-- 时间线 -->
  <rect x="420" y="265" width="360" height="320" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="440" y="290" fill="#666" font-size="12">操作时间线</text>
  <line x1="440" y1="310" x2="440" y2="560" stroke="#ccc"/>
  <circle cx="440" cy="320" r="5" fill="#3b82f6"/>
  <text x="455" y="324" fill="#333" font-size="12">3 天前 @张三 创建</text>
  <circle cx="440" cy="360" r="5" fill="#3b82f6"/>
  <text x="455" y="364" fill="#333" font-size="12">2 天前 @张三 更新描述</text>
  <circle cx="440" cy="400" r="5" fill="#ef4444"/>
  <text x="455" y="404" fill="#ef4444" font-size="12">30h 前 进入异常</text>
</svg>
```

### 类型 4 · 表单页（创建 / 编辑）

**用户关注点**：当前步骤 / 必填项 / 提交反馈
**主区块**：步骤进度 + 字段分组 + 自动保存 + 反馈
**Hero Metric**：已填项 / 必填项 / 保存状态

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" font-family="sans-serif" font-size="14">
  <!-- 顶栏 -->
  <rect x="0" y="0" width="800" height="60" fill="#fff"/>

  <!-- 步骤进度 (Q5) -->
  <text x="20" y="100" fill="#333" font-size="18" font-weight="bold">新建任务</text>

  <!-- 3 步进度 -->
  <circle cx="40" cy="150" r="14" fill="#10b981"/>
  <text x="40" y="155" fill="#fff" text-anchor="middle" font-weight="bold">1</text>
  <text x="65" y="155" fill="#333" font-size="13">基本信息</text>
  <line x1="180" y1="150" x2="270" y2="150" stroke="#10b981" stroke-width="2"/>

  <circle cx="290" cy="150" r="14" fill="#3b82f6"/>
  <text x="290" y="155" fill="#fff" text-anchor="middle" font-weight="bold">2</text>
  <text x="315" y="155" fill="#3b82f6" font-size="13" font-weight="bold">分配</text>
  <line x1="430" y1="150" x2="520" y2="150" stroke="#ccc" stroke-width="2"/>

  <circle cx="540" cy="150" r="14" fill="#fff" stroke="#ccc" stroke-width="2"/>
  <text x="540" y="155" fill="#999" text-anchor="middle" font-weight="bold">3</text>
  <text x="565" y="155" fill="#999" font-size="13">提交</text>

  <!-- 自动保存状态 -->
  <text x="700" y="105" fill="#10b981" font-size="12">✓ 已自动保存</text>

  <!-- 字段分组 -->
  <text x="20" y="200" fill="#666" font-size="12" font-weight="bold">基本信息</text>
  <text x="20" y="225" fill="#333" font-size="13">标题 <tspan fill="#ef4444">*</tspan></text>
  <rect x="20" y="235" width="760" height="36" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="35" y="258" fill="#333" font-size="13">用户认证授权</text>

  <text x="20" y="290" fill="#333" font-size="13">描述 <tspan fill="#ef4444">*</tspan></text>
  <rect x="20" y="300" width="760" height="80" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="35" y="325" fill="#999" font-size="13">实现 JWT 认证 + 角色权限...</text>

  <text x="20" y="400" fill="#333" font-size="13">优先级 <tspan fill="#ef4444">*</tspan></text>
  <rect x="20" y="410" width="120" height="36" fill="#3b82f6" rx="4"/>
  <text x="80" y="433" fill="#fff" text-anchor="middle" font-size="13">高</text>
  <rect x="150" y="410" width="120" height="36" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="210" y="433" fill="#333" text-anchor="middle" font-size="13">中</text>
  <rect x="280" y="410" width="120" height="36" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="340" y="433" fill="#333" text-anchor="middle" font-size="13">低</text>

  <!-- 必填项提示 -->
  <text x="20" y="475" fill="#999" font-size="12">必填项 (3/4) 已完成</text>

  <!-- 主动作 (Q3) -->
  <rect x="640" y="540" width="60" height="36" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="670" y="563" fill="#333" text-anchor="middle">上一步</text>
  <rect x="720" y="540" width="60" height="36" fill="#3b82f6" rx="4"/>
  <text x="750" y="563" fill="#fff" text-anchor="middle" font-weight="bold">下一步</text>
</svg>
```

### 类型 5 · 对比页（多选比较）

**用户关注点**：差异 / 哪个更好
**主区块**：对比表格 + 关键指标差值 + 决策按钮
**Hero Metric**：数量 / 主要差异 / 推荐项

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" font-family="sans-serif" font-size="14">
  <!-- 顶栏 -->
  <rect x="0" y="0" width="800" height="60" fill="#fff"/>
  <text x="20" y="100" fill="#333" font-size="18" font-weight="bold">对比方案 (3 个)</text>

  <!-- 对比卡片 -->
  <rect x="20" y="130" width="240" height="380" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="40" y="155" fill="#333" font-size="14" font-weight="bold">方案 A</text>
  <text x="40" y="175" fill="#666" font-size="12">JWT + Redis</text>

  <text x="40" y="210" fill="#666" font-size="11">性能</text>
  <text x="40" y="232" fill="#333" font-size="18" font-weight="bold">95 / 100</text>
  <rect x="40" y="245" width="200" height="6" fill="#3b82f6" rx="3"/>

  <text x="40" y="280" fill="#666" font-size="11">成本</text>
  <text x="40" y="302" fill="#333" font-size="18" font-weight="bold">¥800/月</text>

  <text x="40" y="350" fill="#666" font-size="11">★ 系统推荐</text>
  <rect x="40" y="450" width="200" height="36" fill="#3b82f6" rx="4"/>
  <text x="140" y="473" fill="#fff" text-anchor="middle" font-weight="bold">选这个</text>

  <rect x="280" y="130" width="240" height="380" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="300" y="155" fill="#333" font-size="14" font-weight="bold">方案 B</text>
  <text x="300" y="210" fill="#666" font-size="11">性能</text>
  <text x="300" y="232" fill="#333" font-size="18" font-weight="bold">88 / 100</text>
  <text x="300" y="280" fill="#666" font-size="11">成本</text>
  <text x="300" y="302" fill="#333" font-size="18" font-weight="bold">¥300/月</text>
  <rect x="300" y="450" width="200" height="36" fill="#fff" stroke="#666" rx="4"/>
  <text x="400" y="473" fill="#333" text-anchor="middle" font-weight="bold">选这个</text>

  <rect x="540" y="130" width="240" height="380" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="560" y="155" fill="#333" font-size="14" font-weight="bold">方案 C</text>
  <text x="560" y="210" fill="#666" font-size="11">性能</text>
  <text x="560" y="232" fill="#333" font-size="18" font-weight="bold">75 / 100</text>
  <text x="560" y="280" fill="#666" font-size="11">成本</text>
  <text x="560" y="302" fill="#333" font-size="18" font-weight="bold">¥100/月</text>
  <rect x="560" y="450" width="200" height="36" fill="#fff" stroke="#666" rx="4"/>
  <text x="660" y="473" fill="#333" text-anchor="middle" font-weight="bold">选这个</text>
</svg>
```

## Hero Metric 选型表（按页面类型）

| 页面类型 | Hero Metric（最多 4 个） |
|---------|------------------------|
| 概览 | 总数 / 今日新增 / 异常数 / 完成率 |
| 列表 | 筛选结果数 / 平均等待 / 异常占比 / 最近更新 |
| 详情 | 关键属性 / 状态 / 创建时间 / 操作人 |
| 表单 | 已填项 / 必填项 / 保存状态 / 提交反馈 |
| 对比 | 数量 / 主要差异 / 推荐项 / 总评估分 |

## 9 操作态

| 态 | 该有 | 不该有 |
|----|------|--------|
| 空 | 行动引导（不是"暂无数据"） | 只有空图标无引导 |
| 加载 | 骨架屏 + 按钮禁用 | 白屏 / 无限转圈 |
| 错误 | 人话原因 + 重试按钮 | 只显示错误码 |
| 成功 | toast 反馈 + 不阻塞 | 强制弹窗打断 |
| 确认 | 后果说明 + 取消默认 | 直接执行破坏性操作 |
| 边界 | 降级方案 + 限制说明 | 静默失败 / 空白 |
| **首屏引导** | 视频 / 示例数据 / 引导按钮 | 直接空状态 |
| **权限拒绝** | 申请入口 + 联系角色 | 死链 |
| **版本陈旧** | 强制刷新提示 + changelog 链接 | 静默运行 |

### 关键态 SVG 示例

**空状态**：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" font-family="sans-serif" font-size="14">
  <rect x="0" y="0" width="800" height="400" fill="#fafafa"/>
  <text x="400" y="150" fill="#999" font-size="48" text-anchor="middle">📋</text>
  <text x="400" y="220" fill="#666" text-anchor="middle" font-size="18">还没有任务</text>
  <text x="400" y="245" fill="#999" text-anchor="middle">点击新建创建第一个</text>
  <rect x="340" y="270" width="120" height="40" fill="#3b82f6" rx="4"/>
  <text x="400" y="295" fill="#fff" text-anchor="middle" font-weight="bold">新建任务</text>
</svg>
```

**错误态**：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" font-family="sans-serif" font-size="14">
  <rect x="0" y="0" width="800" height="400" fill="#fafafa"/>
  <text x="400" y="150" fill="#ef4444" font-size="48" text-anchor="middle">⚠️</text>
  <text x="400" y="220" fill="#333" text-anchor="middle" font-size="18">加载失败</text>
  <text x="400" y="245" fill="#666" text-anchor="middle">请检查网络后重试</text>
  <rect x="340" y="270" width="120" height="40" fill="#3b82f6" rx="4"/>
  <text x="400" y="295" fill="#fff" text-anchor="middle" font-weight="bold">重试</text>
</svg>
```

**确认态**（删除）：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" font-family="sans-serif" font-size="14">
  <rect x="0" y="0" width="800" height="600" fill="#000" fill-opacity="0.5"/>
  <rect x="240" y="180" width="320" height="200" fill="#fff" stroke="#ccc" rx="8"/>
  <text x="400" y="220" fill="#333" text-anchor="middle" font-size="18" font-weight="bold">确认删除？</text>
  <text x="400" y="260" fill="#666" text-anchor="middle">删除"#4521"后不可恢复</text>
  <rect x="280" y="310" width="100" height="40" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="330" y="335" fill="#333" text-anchor="middle">取消（默认）</text>
  <rect x="420" y="310" width="100" height="40" fill="#ef4444" rx="4"/>
  <text x="470" y="335" fill="#fff" text-anchor="middle" font-weight="bold">确认删除</text>
</svg>
```

## 数字呈现规范

- 大数字单位化：1.2K / 3.4M 而非 1234567
- 时间范围不可省（旁注"今日" / "本周" / "累计"）
- 同比/环比箭头：↑12%（涨绿跌红，含义明确）
- 空值 vs 0 vs N/A 区分：0 是真实数，空值显示"—"，N/A 显示"不适用"
- 货币 / 数量带千分位 + 单位（¥12,345.67）

## 「关注点 → 区块」通用映射

```
Q1 角色   → 顶部筛选栏（角色切换 / 我的 vs 全部）
Q2 KPI    → 首屏 hero metric 区（3-4 数字 + 趋势）
Q3 主动作 → 第一按钮区（最多 3 个 hero 按钮）
Q4 决策   → 异常高亮区（如果有，置顶红色 banner）
Q5 带宽   → 列表 / 明细（按需折叠 / tab 切换）
```

## 反 sham 自检（关注点层 8 条）

```
□ 5 问已答（角色 / 关注 / 动作 / 决策 / 带宽）？
□ 角色差异已标（同页不同角色视图）？
□ 主按钮最多 3 个（> 3 = 用户选择困难）？
□ 异常高亮置顶（> 第一屏顶部）？
□ 5s 首屏可懂（标题 + 面包屑 + hero metric）？
□ 无装饰按钮（每个按钮都映射到 Q3 主动作）？
□ 数字三要素齐（单位 + 时间范围 + 对比基准）？
□ 无 14 列堆叠（关注点超载警告）？
```

## 反例画廊（5-8 个 SVG 反例）

每个反例 = 一组 SVG（错误 ❌ → 正确 ✅）。

### 反例 1 · 14 列堆叠 → 8 列精选

```svg
<!-- ❌ 错误: 14 列堆 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 200" font-family="sans-serif" font-size="11">
  <rect x="0" y="0" width="800" height="60" fill="#f3f4f6"/>
  <text x="20" y="35" fill="#666">ID</text>
  <text x="80" y="35" fill="#666">标题</text>
  <text x="180" y="35" fill="#666">描述</text>
  <text x="280" y="35" fill="#666">状态</text>
  <text x="360" y="35" fill="#666">优先级</text>
  <text x="440" y="35" fill="#666">创建</text>
  <text x="520" y="35" fill="#666">更新</text>
  <text x="600" y="35" fill="#666">操作人</text>
  <text x="680" y="35" fill="#666">审核人</text>
  <text x="20" y="80" fill="#333">+ 6 列更多</text>
  <text x="400" y="120" fill="#ef4444" text-anchor="middle" font-size="14">❌ 用户一次只看 2-3 列</text>
  <text x="400" y="145" fill="#ef4444" text-anchor="middle" font-size="14">❌ 关注点超载，决策瘫痪</text>
</svg>
```

```svg
<!-- ✅ 正确: 8 列精选 + 关键信息置顶 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 200" font-family="sans-serif" font-size="12">
  <rect x="0" y="0" width="800" height="60" fill="#f3f4f6"/>
  <text x="20" y="35" fill="#666" font-weight="bold">☐</text>
  <text x="60" y="35" fill="#666">ID</text>
  <text x="140" y="35" fill="#666">标题</text>
  <text x="380" y="35" fill="#666">状态</text>
  <text x="480" y="35" fill="#666">等待</text>
  <text x="560" y="35" fill="#666">创建于 (本周)</text>
  <text x="680" y="35" fill="#666">操作人</text>
  <text x="400" y="100" fill="#10b981" text-anchor="middle" font-size="14">✅ 关键列优先，其他移到详情</text>
  <text x="400" y="125" fill="#10b981" text-anchor="middle" font-size="14">✅ 关注点 ≤ 5 = 决策清晰</text>
</svg>
```

### 反例 2 · 全是大字号 → 合理密度

```svg
<!-- ❌ 错误: 全是大字 KPI 无明细 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" font-family="sans-serif" font-size="14">
  <rect x="0" y="0" width="800" height="400" fill="#fafafa"/>
  <text x="400" y="150" fill="#333" text-anchor="middle" font-size="80" font-weight="bold">1234</text>
  <text x="400" y="200" fill="#666" text-anchor="middle" font-size="14">什么都没说清</text>
  <text x="400" y="240" fill="#ef4444" text-anchor="middle" font-size="14">❌ 单位 / 时间 / 基准 全缺</text>
</svg>
```

```svg
<!-- ✅ 正确: hero + 单位 + 时间 + 对比 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" font-family="sans-serif" font-size="14">
  <rect x="0" y="0" width="800" height="400" fill="#fafafa"/>
  <rect x="20" y="80" width="220" height="120" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="40" y="115" fill="#666" font-size="13">任务总数 (累计)</text>
  <text x="40" y="160" fill="#333" font-size="40" font-weight="bold">12.4K</text>
  <text x="40" y="185" fill="#10b981" font-size="12">↑ 12% vs 上周</text>
  <text x="40" y="240" fill="#10b981" text-anchor="middle" font-size="14">✅ 数字三要素齐</text>
</svg>
```

### 反例 3 · 按钮密密麻麻 → 3 个主按钮 + 下拉

```svg
<!-- ❌ 错误: 8 个按钮平铺 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 100" font-family="sans-serif" font-size="12">
  <rect x="20" y="20" width="80" height="36" fill="#3b82f6" rx="4"/>
  <text x="60" y="42" fill="#fff" text-anchor="middle">新建</text>
  <rect x="110" y="20" width="80" height="36" fill="#3b82f6" rx="4"/>
  <text x="150" y="42" fill="#fff" text-anchor="middle">编辑</text>
  <rect x="200" y="20" width="80" height="36" fill="#3b82f6" rx="4"/>
  <text x="240" y="42" fill="#fff" text-anchor="middle">删除</text>
  <rect x="290" y="20" width="80" height="36" fill="#3b82f6" rx="4"/>
  <text x="330" y="42" fill="#fff" text-anchor="middle">导出</text>
  <rect x="380" y="20" width="80" height="36" fill="#3b82f6" rx="4"/>
  <text x="420" y="42" fill="#fff" text-anchor="middle">分享</text>
  <rect x="470" y="20" width="80" height="36" fill="#3b82f6" rx="4"/>
  <text x="510" y="42" fill="#fff" text-anchor="middle">打印</text>
  <text x="20" y="80" fill="#ef4444" font-size="12">❌ 8 个按钮 = 用户选择困难 → 「帕金森定律」</text>
</svg>
```

```svg
<!-- ✅ 正确: 3 个主按钮 + 下拉 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 100" font-family="sans-serif" font-size="12">
  <rect x="20" y="20" width="80" height="36" fill="#3b82f6" rx="4"/>
  <text x="60" y="42" fill="#fff" text-anchor="middle" font-weight="bold">新建</text>
  <rect x="110" y="20" width="80" height="36" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="150" y="42" fill="#333" text-anchor="middle">导出</text>
  <rect x="200" y="20" width="80" height="36" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="240" y="42" fill="#333" text-anchor="middle">更多 ▼</text>
  <text x="20" y="80" fill="#10b981" font-size="12">✅ 3 个显式按钮（每个映射 Q3 主动作），其它下沉到「更多」</text>
</svg>
```

### 反例 4 · 无面包屑 → 面包屑 + 返回

```svg
<!-- ❌ 错误: 没面包屑 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 100" font-family="sans-serif" font-size="14">
  <rect x="0" y="0" width="800" height="80" fill="#fff"/>
  <text x="20" y="40" fill="#333" font-size="20" font-weight="bold">#4521 用户认证授权</text>
  <text x="20" y="70" fill="#666">← 没说我从哪来</text>
  <text x="400" y="40" fill="#ef4444" text-anchor="middle" font-size="14">❌ 用户看完不知道点哪儿回</text>
</svg>
```

```svg
<!-- ✅ 正确: 面包屑 + 返回按钮 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 100" font-family="sans-serif" font-size="13">
  <rect x="0" y="0" width="800" height="80" fill="#fff"/>
  <text x="20" y="30" fill="#666">
    <tspan fill="#3b82f6">任务</tspan> / <tspan fill="#3b82f6">列表</tspan> / <tspan fill="#333">#4521</tspan>
  </text>
  <rect x="20" y="42" width="80" height="32" fill="#fff" stroke="#ccc" rx="4"/>
  <text x="60" y="62" fill="#333" text-anchor="middle">← 返回列表</text>
  <text x="120" y="62" fill="#333" font-size="16" font-weight="bold">#4521 用户认证授权</text>
  <text x="20" y="90" fill="#10b981" font-size="12">✅ 面包屑明确层级 + 返回按钮带页面标题</text>
</svg>
```

### 反例 5 · 管理员 / 执行者同视图 → 角色切换

```svg
<!-- ❌ 错误: 一视图打天下 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 200" font-family="sans-serif" font-size="13">
  <rect x="0" y="0" width="800" height="120" fill="#fff" stroke="#ccc"/>
  <text x="20" y="40" fill="#333" font-size="16">任务列表</text>
  <text x="20" y="80" fill="#666">「管理员看到这页」执行者也看到这页</text>
  <text x="20" y="110" fill="#ef4444">❌ 执行者需要快速看到「我今天还剩几个」</text>
  <text x="20" y="135" fill="#ef4444">❌ 管理者需要看到「团队 KPI / 瓶颈」</text>
  <text x="20" y="160" fill="#ef4444">❌ 同一视图双方都不爽</text>
</svg>
```

```svg
<!-- ✅ 正确: 顶部角色切换 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 100" font-family="sans-serif" font-size="13">
  <rect x="0" y="0" width="800" height="80" fill="#fff" stroke="#ccc"/>
  <rect x="20" y="20" width="200" height="40" fill="#f3f4f6" rx="4"/>
  <text x="40" y="45" fill="#3b82f6" font-weight="bold">📋 我的任务</text>
  <text x="140" y="45" fill="#666">| 团队概览</text>
  <text x="20" y="75" fill="#10b981">✅ 顶部 role 切换 = 不同角色看到不同视图</text>
</svg>
```

## 产出

```markdown
# {page-name} - 线框

## 5 问回答
Q1 角色：...
Q2 关注：... → hero
Q3 动作：... → 按钮
Q4 决策：...
Q5 带宽：...

## 布局（desktop）
[SVG]

## 布局（mobile）
[SVG]

## 元素清单
| 元素 | 类型 | 作用 | 用户关注点（Q2/Q3） |

## 9 操作态
（每态 SVG）

## 反 sham 自检
8 条关注点层
```

## 自检（装本 skill 后必跑）

```
□ 设计哲学 6 条均体现（信息密度 / 层级 / 数字三要素 / 按钮 / 跳转 / 一致性）？
□ 用户关注点 5 问回答完？
□ SVG 用 svg 包裹（不是 ascii 框图）？
□ 主按钮映射 Q3 主动作（最多 3 个）？
□ 9 操作态全覆盖（空 / 加载 / 错误 / 成功 / 确认 / 边界 / 首屏引导 / 权限拒绝 / 版本陈旧）？
□ 数字三要素齐（单位 + 时间范围 + 对比基准）？
□ 反例画廊已对比（5-8 个 SVG）？
```

## references/

- `examples.md` — 各场景完整 SVG 案例（5 类数据页 × 3 个示例 = 15 个）
- `color-palette.md` — 完整色板 + 暗色模式适配指南