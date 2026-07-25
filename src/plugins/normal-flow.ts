/**
 * normal-flow plugin 的扁平入口（供 plugins 目录直接加载）。
 * 实际实现拆在 normal-flow/ 子目录里，对齐 cjpi 的模块化结构。
 *
 * 注意：opencode 的 legacy plugin loader 会对模块的每个 export 调用
 * getServerPlugin，非函数 export 会抛错。所以这里只导出 default 插件函数，
 * NF_STAGES 等符号请从 normal-flow/stages.ts 直接 import。
 */
export { default } from "./normal-flow/index.ts"
