# opencode 工具系统研究

研究日期：2026-07-26
来源：阅读 opencode 源码 `~/ws/opencode/packages/opencode/src/`

## Custom Tools vs Plugin Tools

### 加载路径（相同）

Custom tools 和 plugin tools 走**同一条加载路径**，都进入 tool registry 的 `custom` 数组：

1. **Custom Tools**（`registry.ts:178-192`）：
   - 位置：`~/.config/opencode/tools/*.ts` 或 `~/.config/opencode/tool/*.ts`
   - 扫描：`Glob.scanSync("{tool,tools}/*.{js,ts}", { cwd: dir, absolute: true, dot: true, symlink: true })`
   - 每个 export 匹配 `ToolDefinition` shape（有 `args` + `description` + `execute`）的注册为工具
   - 工具 ID = 文件名（default export）或 `{filename}_{exportName}`（named export）

2. **Plugin Tools**（`registry.ts:194-199`）：
   - 位置：`~/.config/opencode/plugins/*.ts`
   - 从 plugin 返回的 `tool` 对象的每个 entry 注册
   - 工具 ID = 对象 key

两者都通过 `fromPlugin(id, def)` 函数转换为 `Tool.Def`，进入同一个 `custom` 数组。

### 出现在 agent 工具列表

`registry.tools()` 返回 `[...s.builtin, ...s.custom]`，custom tools 和 builtin tools 一起返回给 agent。

**结论**：custom tools 和 plugin tools 都会出现在 agent 的工具列表中。

## Agent `tools` frontmatter -> permission 转换

### 转换逻辑（`config.ts:553-564`）

```typescript
if (result.tools) {
  const perms = {}
  for (const [tool, enabled] of Object.entries(result.tools)) {
    const action = enabled ? "allow" : "deny"
    if (tool === "write" || tool === "edit" || tool === "patch") {
      perms.edit = action  // write/edit/patch 统一映射到 edit 权限
      continue
    }
    perms[tool] = action
  }
  result.permission = mergeDeep(perms, result.permission ?? {})
}
```

例：`tools: { write: false, edit: false, bash: false }` 转为 `permission: { edit: "deny", bash: "deny" }`

### 工具过滤（`request.ts:208-213`）

```typescript
function resolveTools(input) {
  const disabled = Permission.disabled(
    Object.keys(input.tools),
    Permission.merge(input.agent.permission, input.permission ?? []),
  )
  return Record.filter(input.tools, (_, k) => input.user.tools?.[k] !== false && !disabled.has(k))
}
```

`Permission.disabled()`（`permission/index.ts:204-214`）：
- 对每个工具名，查找 ruleset 中最后一个匹配的 rule
- 如果该 rule 的 `pattern === "*" && action === "deny"`，则该工具被禁用
- `edit`/`write`/`apply_patch` 映射到 `edit` 权限
- `list_mcp_resources` 等映射到 `read` 权限
- 其他工具名直接作为权限名

**关键**：只有被 `tools: { xxx: false }` 显式禁用的工具才会被过滤。Custom tools（如 `xdd_quality_score`）如果不在 deny 列表中，**会出现在 agent 工具列表**。

## nf_* 插件工具"不桥接"问题分析

changelog 记录 nf_* 插件工具"实际未出现在 flow-agent 可用工具列表中"。但源码分析表明：

1. Plugin tools 和 custom tools 走同一条加载路径，都应该出现
2. `resolveTools` 只过滤显式 deny 的工具，不会误杀 custom/plugin tools
3. flow-agent 的 `tools: { write: false, edit: false, bash: false }` 只 deny 了 edit/bash，不会影响 nf_* 工具

可能原因：
- 加载时序问题（plugin 加载晚于 tool registry 初始化）
- 插件结构问题（export 格式不匹配 `ToolDefinition`）
- 已修复的 bug（当前版本已正常）
- 误诊断（工具实际可用但模型未调用）

## tool() 辅助函数 API

```typescript
// packages/plugin/src/tool.ts
export function tool<Args extends z.ZodRawShape>(input: {
  description: string
  args: Args  // Zod schema
  execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<ToolResult>
}) { return input }
tool.schema = z  // 直接用 zod
```

`ToolContext` 提供：`sessionID`, `messageID`, `agent`, `directory`, `worktree`, `abort`, `metadata()`, `ask()`

`ToolResult` 可以是 `string` 或 `{ title?, output, metadata?, attachments? }`

## Custom Tool 文件格式

单文件单工具（文件名=工具名）：
```typescript
import { tool } from "@opencode-ai/plugin"
export default tool({
  description: "...",
  args: { foo: tool.schema.string() },
  async execute(args, context) { return "result" },
})
```

单文件多工具（`{filename}_{exportName}`）：
```typescript
import { tool } from "@opencode-ai/plugin"
export const add = tool({ ... })
export const multiply = tool({ ... })
// 工具名：math_add, math_multiply
```

## 迁移决策记录

本次 xdd-flow 迁移选择**方案 C（agent 自编排）**而非 custom tools：
- 理由：最可靠，不依赖任何工具桥接机制，只用内置 read/write/bash/grep/glob/task
- 代价：LLM 算分不如确定性代码精确，但 skill 方法论已描述清楚检查维度
- 后续可升级：如果需要确定性工具，可在 `src/tools/` 下创建 custom tool 文件，install.sh 需加 `tools` 到符号链接循环
