# llm-vendor

opencode 自研 LLM Engine（`@opencode-ai/llm`）源码副本，供插件直接 import 走 opencode 原生推理链路。

## 来源

- 上游: `~/ws/opencode/packages/llm/src`（monorepo 内包，未发布 npm，被 bundle 进 opencode2 单文件二进制）
- 包版本: `llm@1.18.5`
- 上游 commit: `7534d23551f665e65080809975b4ca5c7d63807b`（2026-07-25）
- 复制时间: 2026-08-05（本目录由当时最新源码 vendor，并做了本地化裁剪）

## 裁剪 / 本地化

- 删除无关 provider：bedrock / google / copilot（vendor 时仅保留 anthropic + openai-compatible）
- `schema-llm.ts`：本地化 `@opencode-ai/schema/llm` 的 28 行类型（`optional`/`optionalKey`/`decodeTo`/`SchemaGetter`），对齐 effect 4.0.0-beta.83 API
- `index.ts`：`export * as LLM` 在 tsx CJS 下失效 → 改为 `import * as LLMNamespace` + `export const LLM`

## 同步方法（opencode 升级后）

1. `rsync -av --exclude bedrock --exclude google --exclude copilot ~/ws/opencode/packages/llm/src/ src/plugins/llm-vendor/`
2. 重放上述本地化修改（schema-llm.ts / index.ts）
3. 依赖 `effect` 版本与上游 `packages/llm/package.json` 的 `effect` peer 一致（当前 4.0.0-beta.83，见 ~/.config/opencode/package.json）
4. `cd ~/.config/opencode && npx tsc --noEmit --module ESNext --moduleResolution Bundler --target ES2023 --strict --skipLibCheck --lib ES2023,DOM plugins/llm-tools.ts`
5. 冒烟：MiniMax 端点实跑一次，确认 `cache_read_input_tokens` 稳定命中
