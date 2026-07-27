# External References — nfflow 架构升级

> 按 xdd-brainstorm skill 要求"至少 5 方向外部调研"。
> 本轮**主动判定不需要外部调研**，理由如下。

## 为什么不走外部调研

1. **nfflow 是 cjopencode 内部编排框架**（opencode 插件仓库），不是面向终端用户的产品
2. **改造是编排层逻辑**（状态机 / 任务续接 / 反思攻击），不涉及技术选型 / 行业趋势 / 竞品分析
3. **改造的"参考标杆"已经在仓库内**：xdd-flow（xdd-build agent + xdd-execute skill）就是 nfflow 的精简参考，nf-builder 形态直接从 xdd-build 抽取
4. **用户已明确边界**（nfflow 跟 xdd-flow 并存独立），外部调研不能动摇这个决定

## 内部参考（已读取）

| 文档 | 作用 |
|------|------|
| `src/agents/xdd-flow.md` | xdd-flow 完整 8 节点流程图，作为 nfflow 3 阶段+3 反思的对比 |
| `src/agents/xdd-build.md` | xdd-build agent 模板，nf-builder 直接抽取其形态 |
| `src/skills/xdd-execute/SKILL.md` | TDD + @implements RXX + 反 sham 纪律，nf-builder 装此 skill |
| `src/agents/flow-agent.md` | 现有 nfflow 主调度（3 阶段 + 8 次回退），改造的基线 |
| `src/agents/nf-attacker.md` | 现有 attack agent，阶段化只改 prompt 不改 agent |
| `src/skills/nf-attack/SKILL.md` | 攻击方法论（正向 + 兜底 + 反 sham + P0/P1/P2），3 个反思阶段共用 |

## 外部材料（如需要可参考）

- [opencode plugin docs](https://opencode.ai/docs/zh-cn/plugins/) — 写 .md agent 的元约束
- [Conventional Commits](https://www.conventionalcommits.org/) — nf-builder commit message 格式参考

> 如果未来 nfflow 改造涉及新增技术栈（如引入 playwright-recorder / glide-test 等），需重新评估外部调研必要性。
