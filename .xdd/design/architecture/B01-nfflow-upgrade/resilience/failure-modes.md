# B01-nfflow-upgrade — 失败模式（FMEA）

> nfflow 6 节点流程编排平台的失败模式穷举。
> 编排系统 vs 业务应用：失败模式发散维度不同 —— 编排系统关注 **subagent 失败 / task_id 续接 / 跨产物一致性 / 预算循环** 这类编排层失败，而非 DB / 网络 / 缓存这类业务层失败。
>
> 共 **10 维度**（8 基础 + 2 业务特有），共 **33 个失败模式**（F01~F33）。
> 每条失败模式 5 字段：**触发条件 / 现象 / 影响范围 / 检测信号 / 恢复路径**。
> 失败模式按维度编号，便于 `failsafe-design.md` / `chaos-scenarios.feature` 互相引用。

## FMEA 字段规约

| 字段 | 含义 | 典型值 |
|------|------|--------|
| **触发条件** | 什么时候发生 | 「`nf-builder` 写第 3 个 RXX 时被 SIGTERM」 |
| **现象** | 直接表现 | 「代码写到一半，src/ 留下半成品」 |
| **影响范围** | 关联 RXX / 端点 / 节点 | 「R02, R03, R05 / N03 / 阶段2」 |
| **检测信号** | 怎么发现 | 「build-report.md 缺失 / 字节数 < 阈值 / npm test 失败」 |
| **恢复路径** | 怎么恢复 | 「续接 nf-builder 续写 + re-run Gate / 问用户」 |

## 失败模式优先级

| 级别 | 含义 | 例子 |
|------|------|------|
| **P0** | 硬阻塞：流程必回退 / 必问用户 | subagent 写一半挂 / 报告被删 / 预算耗尽 |
| **P1** | 警告：流程继续但需修复 | 续接丢失前序 P0 / grep false positive |
| **P2** | 建议：流程继续，记总结 | 字节阈值边界 / 报告路径大小写 |

> 优先级由 `xdd-recovery` 一致性矩阵自动判定（不在本表写死），下列 P0/P1/P2 标注为参考。

---

## 维度 1 — subagent 编排失败（业务特有）

> nfflow 是 subagent 调度平台，**主要失败模式在 5 个 subagent 派发 + 跑的过程**。
> 这一维度的失败模式在一般业务应用里罕见（业务应用关心 DB / 网络），在编排系统里是核心。

### F01 · nf-designer 探索设计写一半挂

- **触发条件**：`Task(subagent_type=nf-designer)` 跑过程被 SIGTERM / OOM / 网络中断 / 平台 5xx，或写 `.xdd/design/spec/{Bxx-slug}/rules.md` 5 件产物写到一半挂
- **现象**：5 件产物只有 1~3 件落盘（例：intent.md 写完但 rules.md 缺）/ 产物字节数 < 阈值 / 关键 grep 部分命中
- **影响范围**：R01, R06 / N01 / 反思#1 前所有阶段
- **检测信号**：阶段1 Gate 5 条失败（检查 1 产物落盘显示 N 件缺失 / 检查 2 字节数 < 阈值 / 检查 3 关键 grep 不命中）
- **恢复路径**：① 续接 nf-designer（task_id 不续接——不同 subagent 实例），prompt 显式列已落盘的产物 + 待补产物；② 续接产物必须 **接续** 而不是覆盖（避免 `nf-designer` 把已写 1KB 的 rules.md 改成 3KB 全新版本）；③ re-run 阶段1 Gate 全过

### F02 · nf-builder TDD 写到一半被 SIGTERM 杀掉

- **触发条件**：`Task(subagent_type=nf-builder)` 在 TDD 循环中途（写 `@implements RXX` 中 / 跑测试中 / commit 中）被 SIGTERM / kill -9 / 平台 crash
- **现象**：代码写到一半（src/ 留半成品 + pass 残留 + 无 commit）；build-report.md 缺失；部分 commit 已落但缺 commit message
- **影响范围**：R02, R06 / N03 / 阶段2 Gate / 反思#2
- **检测信号**：build-report.md 不存在 / `git log --grep 'RXX'` 命中 < 7 / `grep -r "@implements R" src/` 命中 < 7 / no-stub-check 命中 ≥ 1
- **恢复路径**：① flow-agent 检测到 nf-builder 进程消失 → 读 `git status` 看哪些文件被改 / 哪些 commit 已落；② 续接 nf-builder（prompt 显式含「上次执行到 RXX N/7，被中断，从 N+1 续写」）；③ re-run Gate 5 条（重点检查 4 存根检测必须零命中 + 检查 5 commit 追溯必须 ≥ 7）

### F03 · nf-attacker 误判 P0（false positive）

- **触发条件**：`Task(subagent_type=nf-attacker, stage=...)` 跑 5 段方法时把非 P0 问题错误标记 P0（例：把文档措辞不准确判 P0 / 把 grep 模式边界判 P0）
- **现象**：反思报告 §5 标 P0 ≥ 1，但实际不是 P0（无存根 / 无 sham / 无用户旅途走不通）
- **影响范围**：R03, R04 / N02, N04, N06 / 反思#1/#2/#3
- **检测信号**：flow-agent 读 P0 列表 + 人工/规则复核 P0 真实严重度（每个 P0 必须匹配 P0 定义：存根 / sham / 用户旅途走不通）
- **恢复路径**：① flow-agent 标 P0 类别（FOUND_DEFECT / SHAM / JOURNEY_BLOCKED），非这三类的 P0 标 false-positive；② 触发回退的同时记录「P0-FP-XXX」到 `failure-log.md`；③ 续接对应阶段 subagent 走 **裁决流程**（不是直接修复）

### F04 · nf-attacker 漏报 P0（false negative）

- **触发条件**：`nf-attacker` 跑 5 段方法时漏掉真实 P0（例：no-stub-check 命中但 attacker 把 stub 忽略 / 真实 curl 失败但 attacker 信任 mock 跑通）
- **现象**：反思报告 §5 标 P0=0，但下阶段运行发现 P0 真实存在（阶段3 跑用户旅途崩 / 阶段2 跑 npm test 失败）
- **影响范围**：R03, R05 / N02, N04, N06 / 反思#1/#2/#3
- **检测信号**：下阶段运行实际失败（npm test exit code ≠ 0 / 浏览器截图失败 / curl 5xx）但反思攻击报告 P0=0
- **恢复路径**：① flow-agent 检测「反思 P0=0 但下阶段失败」→ 标 P0-FN-XXX（false negative）；② 触发回退到反思报告对应的阶段（不是下阶段，因为反思攻击自身失职）；③ 续接 `nf-attacker` 重跑（同 stage）+ prompt 显式列 P0-FN 列表

### F05 · e2e-tester 浏览器崩溃 / Playwright 卡死

- **触发条件**：`Task(subagent_type=e2e-tester)` 跑 Playwright 时浏览器崩溃（headless chromium segfault / Playwright 超时 / 内存爆）
- **现象**：e2e-report.md 缺失 / `screenshots/` 目录空 / 截图文件 < 5KB（崩溃留下的截屏帧）
- **影响范围**：R01, R06 / N05 / 阶段3
- **检测信号**：阶段3 Gate 5 条失败（检查 1 e2e-report.md 缺失 / 检查 3 截图数 < 4 / 检查 4 PNG 文件 < 5KB）
- **恢复路径**：① flow-agent 标 P0-E2E-XXX；② 续接 e2e-tester（不续接 task_id），prompt 显式含「上次崩溃在 X 步，从 X 步重新跑」+ 临时降级到 `--single-process` 模式；③ 重新跑用户旅途，全截图齐

---

## 维度 2 — 状态机 / task_id 续接异常

> nfflow 状态机核心是 6 节点 todowrite + 反思间 task_id 续接。状态漂移 / 续接破坏是编排系统特有失败模式。

### F06 · 6 节点 todowrite 状态漂移

- **触发条件**：flow-agent 跑中途 todowrite 状态被外部改 / subagent 误改 / 状态文件 `.xdd/runs/xdd_run/status.md` 写一半
- **现象**：阶段节点状态机不一致（例：阶段1 标 done 但反思#1 标 pending / 阶段2 标 in_progress 但反思#1 标 done）
- **影响范围**：R04, R06 / 6 节点状态机 / 整个流程
- **检测信号**：flow-agent 启动时跑状态一致性断言（阶段 N done → 阶段 N+1 pending / done，不应 in_progress）；状态文件 `stat` 字节数 < 100（写一半）
- **恢复路径**：① flow-agent 读 status.md 备份（`.xdd/runs/xdd_run/status.md.bak`）恢复；② 无备份则按产物实际状态推断（rules.md 存在 → 阶段1 done，否则 pending）；③ 跑一致性断言，所有节点归位

### F07 · task_id 续接上下文超限（context window exceeded）

- **触发条件**：反思#2 续接反思#1 → 反思#3 续接反思#2 时，subagent 上下文（attacker 历史 + 前序 P0 列表 + RXX 知识）累加超过 LLM context window 上限
- **现象**：反思#3 subagent 启动报错「context length exceeded」或返回极短输出 / 报告 §1 缺前序 P0 状态 / 报告 §5 草草收尾
- **影响范围**：R05 / N04, N06 / 反思#2, #3
- **检测信号**：反思#3 报告 §1 阶段产物状态段缺失「前序 P0 状态」强制字段 / 报告 §5 P0/P1 列表异常短（< 5 条）
- **恢复路径**：① 降级到「**只保留 P0 列表**」模式（这是 task 要求的重点场景）—— 续接时 prompt 显式说「context 满，只追 P0 列表，其他上下文丢弃」；② 如果降级仍失败，重派 `nf-attacker`（不续接）跑 stage=acceptance，prompt 手动注入前序 P0 列表

### F08 · task_id 续接丢失前序 P0 列表

- **触发条件**：反思#2 续接反思#1 时 prompt 没显式列前序 P0 列表（违反 R05 / BR-13）
- **现象**：反思#2 报告 §1 阶段产物状态段缺失「前序 P0 状态」段 / 反思#2 攻击时不验证反思#1 标记的 P0 是否已修
- **影响范围**：R03, R05 / N04 / 反思#2, #3
- **检测信号**：反思#2/#3 报告 §1 grep 不到「前序 P0 状态」关键字 / 反思#2 报告 §5 P0 列表与反思#1 报告 §5 不一致
- **恢复路径**：① 反思#2/#3 报告标 P1（警告：续接未能延续前序 P0 上下文，attacker 独立判断）；② 触发回退到对应阶段（不是回退反思），让对应阶段 subagent 知道 P0 列表；③ 续接对应阶段 subagent 修复

### F09 · 反思#2/#3 报告缺前序 P0 验证段

- **触发条件**：反思#2 / 反思#3 跑通但报告 §1 阶段产物状态段没显式列「前序 P0 状态」（既不是丢失也不是超限，而是攻击者主观省略）
- **现象**：报告 §1 阶段产物状态段贴路径 + 字节数 + grep 输出，但没「前序 P0 状态：P0-A 已修 / P0-B 未修」字段
- **影响范围**：R03, R05 / N04, N06 / 反思#2, #3
- **检测信号**：grep `前序 P0 状态` 反思#2 / 反思#3 报告失败
- **恢复路径**：① 自动标 P0（按 R05 兜底规则：续接必须验证前序 P0）；② 触发回退到反思#2 / 反思#3 续接（task_id 续接，prompt 显式强调「必须写前序 P0 状态段」）

---

## 维度 3 — 文件 IO 失败

> nfflow 产物是 `.xdd/runs/nf_run/` 下的文件。权限 / 磁盘满 / 写一半 / 外部篡改是编排系统文件 IO 失败模式。

### F10 · .xdd/runs/nf_run/ 目录权限被外部改

- **触发条件**：外部 `chmod` / `chown` 改了 `.xdd/runs/nf_run/` 目录权限（例：subagent 跑在用户 A，但目录被用户 B 改 600），或目录被外部 `mount --bind` 改只读
- **现象**：subagent 写 `reflect-attack-design-report.md` 时 `Permission denied` / `Read-only file system`
- **影响范围**：R06 / 6 个端点 / 阶段 1~3 全部
- **检测信号**：subagent 报告 `Permission denied` / `OSError [Errno 30]` / Gate 检查 1 产物真实落盘失败
- **恢复路径**：① flow-agent 跑 `chmod -R u+w .xdd/runs/nf_run/` 修复权限；② 仍失败则问用户（环境问题必须人工介入）

### F11 · 磁盘满（截图暴涨 / 报告字节爆炸）

- **触发条件**：e2e-tester 跑全屏截图（8K 高 DPI）/ 报告含巨型 base64 嵌入图 / 磁盘已用率 > 95%
- **现象**：写产物时报 `No space left on device` / Gate 字节数检查反常（文件大小炸 → 反而通过字节阈值）
- **影响范围**：R06 / 6 个端点 / 阶段 3（截图重灾区）
- **检测信号**：`df -h .xdd/` 显示 Use% ≥ 95% / 写文件失败 / `ENOSPC`
- **恢复路径**：① 清理 `.xdd/runs/nf_run/screenshots/*.png` 中重复帧 / 减小截图分辨率（DPR 1 → 0.5）；② 清理 `.xdd/runs/xdd_run/` 历史文件；③ 跑 `git gc --prune=now` 清理 git；④ 仍失败则问用户

### F12 · 报告半成品（subagent 写到一半挂）

- **触发条件**：subagent 写 `.xdd/runs/nf_run/reflect-attack-{stage}-report.md` 时被 SIGTERM / kill / 平台 crash
- **现象**：报告文件存在但字节数 < 阈值（< 1000）/ 内容半截（缺 §5 问题清单段）
- **影响范围**：R06 / 反思#1/#2/#3
- **检测信号**：阶段 Gate 字节数 < 1000 / 报告 §5 grep 不到「P0」/ 报告章节结构不完整（markdown 标题数 < 5）
- **恢复路径**：① flow-agent 检测半成品 → 标 P0 报告；② 续接对应反思攻击（task_id 续接，prompt 显式说「上次报告被截断，从开头重写」）；③ re-run Gate

### F13 · 报告被外部进程删 / 篡改

- **触发条件**：`git clean` / `git reset --hard` / 外部脚本 / 用户手动删除了 `.xdd/runs/nf_run/*.md`
- **现象**：阶段产物丢失 / Gate 字节数 = 0 / 文件存在但内容异常（被改成「TODO」/「TBD」）
- **影响范围**：R06 / 6 个端点 / 阶段 1~3 全部
- **检测信号**：阶段 Gate 检查 1 产物真实落盘失败（`stat` 失败）/ 字节数 = 0 / hash 校验失败（与 git index 不一致）
- **恢复路径**：① flow-agent 跑 `git checkout HEAD@{1} -- .xdd/runs/nf_run/` 恢复（如有 git）；② 仍失败则触发回退让对应 subagent 重新生成；③ 报告写 `failure-log.md` 标 P0-EXTERNAL-MUTATION

---

## 维度 4 — Gate 标准误判

> Gate 标准（5 条硬检查）是流程编排的命脉。误判 → 假报警（false positive）/ 漏检（false negative）都会让流程崩溃。

### F14 · 字节阈值边界误判

- **触发条件**：阶段产物字节数 = 阈值边界 - 1（例：rules.md 199 字节 < 200 阈值），实际内容已够但字节差 1
- **现象**：阶段 Gate 失败，但产物语义正确（人为边界误判）
- **影响范围**：R06 / 6 个端点 / 阶段 1~3 全部
- **检测信号**：阶段 Gate 5 条检查 2 字节数 < 阈值，但 grep 命中数 ≥ 阈值（语义足够）
- **恢复路径**：① **允许人工 override**（task 要求的重点场景）—— flow-agent 用 `question` 工具问用户「rules.md 199 字节差 1，但 grep 命中 7 条 RXX 足够，override 阈值？」；② 用户 approve → 标 done with override + 记录 override 原因到 `failure-log.md`

### F15 · grep 模式 false positive

- **触发条件**：grep `@implements RXX` 命中 `pass` 字符串里的 "RXX"（误命中）/ `@covers RXX` 命中代码注释里的 `RXX`（不是 feature 标签）
- **现象**：Gate 检查 3 grep 命中数 ≥ 7，但实际代码里只有 3 处真的 `@implements RXX`
- **影响范围**：R06 / 6 个端点 / 阶段 2
- **检测信号**：grep 命中数高，但 `no-stub-check` 仍命中 / 跑全测试失败
- **恢复路径**：① flow-agent 跑二次校验（grep 含 `RXX` 必须同时有 `@implements` 前缀）；② 仍不通过则标 P0 触发回退

### F16 · no-stub-check 漏报

- **触发条件**：`nf-builder` 写 `return None` 蒙混 / 把 mock 包一层（`from x import y as real_db` 但 `x.py` 实际是 mock）/ 硬编码 `current_user = "admin"` 而不是从 token 解析
- **现象**：noop stub 漏过（no-stub-check 脚本只扫 `pass` / `TODO` / `NotImplementedError` / `InMemoryRepository` / mock DB / 硬编码 current_user，没扫「return None 蒙混」/「as real_db 包装」/ 假实现）
- **影响范围**：R02, R06 / N03 / 阶段2
- **检测信号**：反思#2 / 反思#3 跑 curl 真实接口失败 / 用户旅途走不通 / e2e 截图异常
- **恢复路径**：① 反思#3 兜底（按 architecture §7 表格「no-stub-check 漏报 → 反思#3 兜底」）；② 反思#2 报告标 P0-FN-XXX 触发回退到阶段2；③ 续接 nf-builder 修复 + 跑全测试 + 跑 curl 真实接口验证

---

## 维度 5 — 回退循环 / 预算耗尽

> nfflow 预算：阶段内 3 次回退 / 全局 8 次。预算是死亡循环的硬开关。

### F17 · 阶段内 3 次回退（阶段预算耗尽）

- **触发条件**：同一阶段（例：阶段1）连续 3 次回退（每次反思#1 / 阶段2 / 反思#2 / 阶段3 都标记 P0 触发回退到阶段1），flow-agent 内部 `staging_counter[stage1] = 3`
- **现象**：循环无法收敛，subagent 每次重跑产生相同 P0（例：scenarios.feature 永远缺「密码错误」兜底场景）
- **影响范围**：R01, R04 / 6 节点状态机 / 单个阶段
- **检测信号**：`staging_counter[stage1] ≥ 3` 且反思报告 P0 列表重复
- **恢复路径**：① flow-agent **HALT 用 question 问用户**（task 要求的重点场景）—— 报告「阶段性失败原因（前 3 次回退的 P0 列表）+ 累计回退次数 + 询问继续 / 暂停 / 调整规则」；② 流程暂停（不自动重启）；③ 用户回答后由 flow-agent 继续

### F18 · 全局 8 次预算耗尽

- **触发条件**：累计回退 8 次（可能是阶段1 3 次 + 阶段2 3 次 + 阶段3 2 次），flow-agent 内部 `rollback_counter ≥ 8`
- **现象**：流程无法收敛，整个流程永久暂停
- **影响范围**：R04 / 6 节点状态机 / 全流程
- **检测信号**：`rollback_counter ≥ 8`
- **恢复路径**：① flow-agent 强制用 `question` 工具问用户（按 R04 兜底）；② 报告「累计 8 次回退的详情 + 询问继续 / 暂停 / 调整规则」；③ 流程永久暂停，等用户介入

### F19 · 续接后 P0 列表不被新 subagent 识别

- **触发条件**：触发回退续接 nf-designer / nf-builder / nf-attacker 时，prompt 显式列前序 P0 列表，但新 subagent 不识别 / 忽略（subagent prompt 解析失败 / token 截断）
- **现象**：续接后 subagent 无视 P0 列表，产生新 P0 / 重复旧 P0
- **影响范围**：R03, R04, R05 / 反思#1/#2/#3, 阶段 1~3
- **检测信号**：下阶段反思报告 P0 列表与上阶段反思报告 P0 列表完全相同（重复触发同一 P0）
- **恢复路径**：① flow-agent 检测 P0 重复 → 标 P0-LOOP-XXX；② 触发强制回退（不走续接），重派新 subagent 实例，prompt 重新格式化为「**必须先解决 P0-XXX 才进下条 RXX**」格式；③ 仍失败则升级到 F17 / F18（阶段 / 全局预算）

---

## 维度 6 — 跨产物一致性（业务特有）

> 设计产物 5 件（intent.md / design.md / rules.md / scenarios.feature / architecture.md）和流程图（flow.mermaid）必须一致。**不一致 → 跑不动**。

### F20 · rules.md / scenarios.feature 不一致

- **触发条件**：`rules.md` 写了 R01~R07 但 `scenarios.feature` 漏标 `@covers RXX`（例：rules.md 写 R07，scenarios.feature `@covers` 只到 R06）
- **现象**：阶段1 Gate 检查 3 grep 命中（rules.md `RXX` 数 = 7，scenarios.feature `@covers RXX` 数 = 6）不一致
- **影响范围**：R06, R07 / N01 / 阶段1
- **检测信号**：diff `rules.md` RXX 列表 vs `scenarios.feature` `@covers` 列表，发现 missing
- **恢复路径**：① flow-agent 跑一致性检查（`awk '/^## R/{print $2}' rules.md` vs `grep -oE '@covers-R[0-9]{2}' scenarios.feature | sort -u`）；② 缺失标 P0-WARN-XXX；③ **哪个为准 + 警告**（task 要求的重点场景）—— 默认 `rules.md` 为准（规则是源头），scenarios.feature 补充漏标的 `@covers-RXX`；④ 警告写到 `failure-log.md` 强制告知用户

### F21 · architecture.md / flow.mermaid 不一致

- **触发条件**：`architecture.md` §2 端点契约写 N01~N06，但 `flow.mermaid` 漏画 N05 / 缺 9 种回退箭头
- **现象**：阶段 Gate grep 命中不一致（architecture.md 端点列表含 N05，flow.mermaid subgraph 缺 S3）
- **影响范围**：R04 / 6 节点流程图 / 阶段 1
- **检测信号**：diff `architecture.md` 端点 ID 列表 vs `flow.mermaid` 节点 ID 列表
- **恢复路径**：① flow-agent 跑一致性检查（同 F20 算法）；② 缺失标 P0 触发回退到阶段1；③ 续接 nf-designer 修正 `flow.mermaid`（修图不修文，规则不变）

### F22 · intent.md / design.md 决策矛盾

- **触发条件**：`intent.md` 写「nfflow 跟 xdd-flow 并存」，但 `design.md` 决策 6 写「nfflow 跟 xdd-flow 合并」
- **现象**：阶段1 Gate 检查 3 grep 命中（intent 关键词 vs design 决策矛盾）
- **影响范围**：R01, R07 / 设计阶段 / 阶段 1
- **检测信号**：cross-doc grep 关键词冲突（`grep 'nfflow 跟 xdd-flow' intent.md` 命中 vs `grep 'nfflow 跟 xdd-flow' design.md` 命中结论冲突）
- **恢复路径**：① flow-agent 标 P0-CONFLICT-XXX；② 触发回退到阶段1；③ 续接 nf-designer 重新跑 brainstorm 收敛决策（design.md 决策必须跟 intent.md 一致）

---

## 维度 7 — skill 装载失败

> nfflow 装 `xdd-execute` / `xdd-cleanup` / `nf-design` / `nf-attack` / `e2e-test` skill。装不上 / 装错版本 / 注入失败都会让 subagent 失明。

### F23 · xdd-execute / xdd-cleanup 装不上

- **触发条件**：`use skill: xdd-execute` 调用失败（registry 缺 / 网络断 / 版本错 / opencode 平台版本不兼容）
- **现象**：nf-builder 接收 prompt 后无法执行 TDD 循环（无 TDD 步骤指引）/ 跑出来代码无 `@implements RXX` 标注
- **影响范围**：R02 / N03 / 阶段2
- **检测信号**：nf-builder 报告说「skill 装不上」/ 阶段 2 Gate 检查 3 grep `@implements RXX` 命中 = 0
- **恢复路径**：① flow-agent 检测 skill 装载失败 → 标 P0-SKILL-XXX；② 触发回退到阶段2；③ 续接 nf-builder 重试（显式 `use skill: xdd-execute`），如仍失败则提示用户检查 opencode 平台

### F24 · nf-attack 装错版本

- **触发条件**：`use skill: nf-attack` 装了旧版本（5 段方法论过期 / 攻击方法漂移 / 报告 schema 不匹配）
- **现象**：反思报告 §5 缺 P0/P1/P2 字段 / 报告结构不对（5 段不完整）
- **影响范围**：R03 / N02, N04, N06 / 反思#1/#2/#3
- **检测信号**：反思报告 grep 不到 5 段（§1 / §2 / §3 / §4 / §5）/ 报告 schema 校验失败
- **恢复路径**：① flow-agent 检测 skill 版本 → 标 P0-SKILL-VER-XXX；② 触发回退到反思节点；③ 续接 nf-attacker 显式装新版（`use skill: nf-attack` + 检查 SKILL.md 头部版本号）

### F25 · skill 装上但 prompt 注入失败

- **触发条件**：skill 装上（registry 存在），但 subagent 主 prompt 注入时丢失（长 prompt 截断 / 模板渲染失败）
- **现象**：subagent 跑时实际无 skill 指引（行为跟没装一样）
- **影响范围**：R02, R03 / 6 个端点
- **检测信号**：阶段 2 / 反思#1/#2/#3 报告含「我看不到 skill 内容」字样 / 跑出来产物不符合 skill 步骤
- **恢复路径**：① flow-agent 检测 prompt 注入失败 → 标 P0-PROMPT-XXX；② 触发回退；③ 续接 subagent 拆 prompt（拆小 + 显式引用 skill 路径）

---

## 维度 8 — Git / commit 失败

> nfflow 靠 git 追溯 RXX。commit 失败 / hook 拒 / 编译失败会让 RXX 链路断。

### F26 · nf-builder commit 冲突

- **触发条件**：nf-builder 在 TDD 循环中 commit 时，git 工作区被外部改（用户开了 `git checkout` / 另一个 subagent 改了同一文件）
- **现象**：`git commit` 退出非 0 / `CONFLICT (content): Merge conflict in src/xxx.py`
- **影响范围**：R02, R06 / N03 / 阶段2
- **检测信号**：阶段 2 Gate 检查 5 commit 追溯 `git log --grep 'RXX'` 命中 < 7
- **检测信号**：nf-builder 报告 `git commit` 失败
- **恢复路径**：① flow-agent 跑 `git status` 看冲突文件；② 续接 nf-builder 显式 `git fetch + git rebase`（或 `git merge`）；③ 仍失败则标 P0 触发回退到阶段2

### F27 · hook 拒（pre-commit 拒签字）

- **触发条件**：项目配了 `pre-commit` / `commitlint` / `lefthook` 等 hook，hook 拒绝 nf-builder 的 commit（commit message 格式错 / lint 失败 / security 扫描失败）
- **现象**：`git commit` 被 hook 拒（exit code 非 0）/ 报告 hook 错误
- **影响范围**：R02, R06 / N03 / 阶段2
- **检测信号**：nf-builder 报告 hook 拒 / 阶段 2 Gate 检查 5 commit 追溯 < 7
- **恢复路径**：① flow-agent 跑 `git commit --no-verify` 跳过 hook（紧急通路）；② 仍失败则修 hook 配置（`vim .git/hooks/pre-commit`）+ 重试 commit；③ 标 P0 触发回退

### F28 · nf-builder 写代码时 OOM / 编译失败

- **触发条件**：nf-builder 跑 TDD 编译时 OOM（大型项目 / monorepo）/ 编译失败（缺依赖 / 类型错）
- **现象**：`npm test` 退出非 0 / `tsc` 报错 / 进程被 OS kill (exit code 137 SIGKILL)
- **影响范围**：R02, R06 / N03 / 阶段2
- **检测信号**：阶段 2 Gate 全部测试 `npm test` 失败 / 阶段 2 Gate no-stub-check 命中
- **恢复路径**：① flow-agent 跑 `npm ci --no-audit` 补依赖；② 内存不足则 `NODE_OPTIONS=--max-old-space-size=4096 npm test`；③ 仍失败则标 P0 触发回退到阶段2 + 续接 nf-builder 重写

---

## 维度 9 — 用户行为异常（业务特有）

> nfflow 跑在用户本地 IDE，用户行为异常（Ctrl-C / 中途改需求 / 不响应）必须被编排系统捕获。

### F29 · 用户 Ctrl-C 中断

- **触发条件**：flow-agent 跑中途用户按 Ctrl-C / 终端 disconnect / IDE 关闭
- **现象**：subagent 进程被 SIGTERM / 状态机停在某节点 in_progress / 产物半成品
- **影响范围**：R04 / 6 节点状态机 / 全流程
- **检测信号**：flow-agent 检测到 SIGTERM 信号 / status.md 状态停在 in_progress 超过 30 分钟
- **恢复路径**：① flow-agent 启动时配 `trap` 抓 SIGTERM；② 收到信号 → 把当前 todowrite 状态写到 `status.md`（持久化）；③ 用户重启后，flow-agent 读 status.md 推断恢复点（已知产物 → 阶段 done，未知 → 阶段 in_progress）

### F30 · 用户中途改需求

- **触发条件**：flow-agent 跑途中用户改需求（调整 RXX / 改 Scenario / 改架构决策）
- **现象**：当前阶段产物跟新需求不一致 / RXX 编号冲突 / 阶段 Gate 通过但语义过期
- **影响范围**：R01, R04, R07 / 6 节点状态机 / 全流程
- **检测信号**：status.md 的 spec_hash 跟当前 rules.md hash 不一致 / 阶段 2 之后用户提的需求变更
- **恢复路径**：① flow-agent 标 P0-USER-CHANGE-XXX；② 强制回退到阶段1（设计层必须先一致）；③ 续接 nf-designer 处理需求变更（合并变更到 intent.md / design.md，重新产 RXX）

### F31 · 8 次预算后用户不响应（question 工具超时）

- **触发条件**：flow-agent 用 `question` 工具问用户（阶段预算耗尽 / 全局预算耗尽），用户 24 小时不响应 / 跳过问题
- **现象**：流程永久暂停 / question 工具超时
- **影响范围**：R04 / 6 节点状态机 / 全流程
- **检测信号**：question 工具调用超过 24h 无响应 / `question` 工具返回 timeout
- **恢复路径**：① flow-agent 跑默认分支（不阻塞太久）—— 默认决策「暂停 + 写 failure-log.md + 等下次启动时重试」；② 写 `failure-log.md` 标 P0-USER-NORESPONSE-XXX；③ 用户后续主动启动时，flow-agent 读 failure-log.md 询问

---

## 维度 10 — 平台 / 多任务（业务特有）

> nfflow 跑在 opencode 平台 + 用户本地 IDE，平台异常 / 多任务并发是编排系统特有的失败模式。

### F32 · 平台 Task() 调用 5xx

- **触发条件**：opencode 平台 `Task(subagent_type=...)` 调用 5xx（平台 bug / 限流 / 网络分区）
- **现象**：flow-agent 派 subagent 失败 / subagent 跑一半被平台 kick
- **影响范围**：R01 / 6 个端点 / 全流程
- **检测信号**：flow-agent 收到 5xx / subagent 进程被平台 kill
- **恢复路径**：① flow-agent 跑重试（指数 backoff 1s / 2s / 4s / 8s，最多 4 次）；② 仍失败则标 P0-PLATFORM-XXX 触发回退；③ 续接 subagent 重派

### F33 · 同项目并发跑两个 nfflow

- **触发条件**：用户在两个 IDE / 两个终端同时启动 nfflow 跑同一项目
- **现象**：两个 flow-agent 改同一 `.xdd/runs/xdd_run/status.md` / 两个 nf-builder 写同一目录 / 阶段 Gate 互相覆盖
- **影响范围**：R04, R06 / 6 节点状态机 / 全流程
- **检测信号**：status.md 写入 lock 失败 / `.xdd/runs/nf_run/.lock` 文件存在
- **恢复路径**：① flow-agent 启动时跑 `mkdir .xdd/runs/nf_run/.lock` 抢占；② 抢占失败 → 标 P0-CONCURRENT-XXX 并问用户「已有 nfflow 跑此项目，是否覆盖 / 排队 / 退出」；③ 用户决定后由任一 flow-agent 继续

---

## 失败模式索引（grep 用）

| FXX | 维度 | 模式 | 优先级 | 关联 RXX | 关联端点 |
|-----|------|------|--------|---------|---------|
| F01 | subagent 编排 | nf-designer 写一半挂 | P0 | R01, R06 | N01 |
| F02 | subagent 编排 | nf-builder TDD SIGTERM | P0 | R02, R06 | N03 |
| F03 | subagent 编排 | nf-attacker 误判 P0 | P0 | R03, R04 | N02, N04, N06 |
| F04 | subagent 编排 | nf-attacker 漏报 P0 | P0 | R03, R05 | N02, N04, N06 |
| F05 | subagent 编排 | e2e-tester 浏览器崩溃 | P0 | R01, R06 | N05 |
| F06 | 状态机 / 续接 | 6 节点状态漂移 | P0 | R04, R06 | 状态机 |
| F07 | 状态机 / 续接 | context window 超限 | P0 | R05 | N04, N06 |
| F08 | 状态机 / 续接 | 续接丢失前序 P0 | P1 | R03, R05 | N04, N06 |
| F09 | 状态机 / 续接 | 报告缺前序 P0 验证段 | P0 | R03, R05 | N04, N06 |
| F10 | 文件 IO | 目录权限被改 | P0 | R06 | 6 端点 |
| F11 | 文件 IO | 磁盘满 | P0 | R06 | N05 |
| F12 | 文件 IO | 报告半成品 | P0 | R06 | N02, N04, N06 |
| F13 | 文件 IO | 报告被删 / 篡改 | P0 | R06 | 6 端点 |
| F14 | Gate 误判 | 字节阈值边界 | P1 | R06 | 6 端点 |
| F15 | Gate 误判 | grep false positive | P1 | R06 | N03 |
| F16 | Gate 误判 | no-stub-check 漏报 | P0 | R02, R06 | N03 |
| F17 | 预算循环 | 阶段 3 次回退 | P0 | R01, R04 | 状态机 |
| F18 | 预算循环 | 全局 8 次预算 | P0 | R04 | 状态机 |
| F19 | 预算循环 | 续接 P0 不识别 | P0 | R03, R04, R05 | 6 端点 |
| F20 | 一致性 | rules.md / scenarios.feature 不一致 | P0 | R06, R07 | N01 |
| F21 | 一致性 | architecture.md / flow.mermaid 不一致 | P0 | R04 | N01 |
| F22 | 一致性 | intent.md / design.md 矛盾 | P0 | R01, R07 | N01 |
| F23 | skill 装载 | xdd-execute / xdd-cleanup 装不上 | P0 | R02 | N03 |
| F24 | skill 装载 | nf-attack 装错版本 | P0 | R03 | N02, N04, N06 |
| F25 | skill 装载 | skill 注入失败 | P0 | R02, R03 | 6 端点 |
| F26 | Git / commit | commit 冲突 | P0 | R02, R06 | N03 |
| F27 | Git / commit | hook 拒 | P0 | R02, R06 | N03 |
| F28 | Git / commit | 编译 / OOM | P0 | R02, R06 | N03 |
| F29 | 用户行为 | Ctrl-C 中断 | P0 | R04 | 状态机 |
| F30 | 用户行为 | 中途改需求 | P0 | R01, R04, R07 | 状态机 |
| F31 | 用户行为 | 用户不响应 | P0 | R04 | 状态机 |
| F32 | 平台 / 多任务 | Task() 5xx | P0 | R01 | 6 端点 |
| F33 | 平台 / 多任务 | 多任务并发 | P0 | R04, R06 | 状态机 |

> **覆盖**：8 基础维度（subagent 编排 / 状态机 / 文件 IO / Gate 误判 / 预算循环 / skill 装载 / Git / 平台）+ 2 业务特有维度（跨产物一致性 / 用户行为异常）= **10 维度全覆盖**。
> **爆炸半径**：每条 FXX 关联 RXX / 端点 / 节点，避免设计断裂。
> **后续**：`failsafe-design.md` 给每条 FXX 至少 1 个兜底；`chaos-scenarios.feature` 选高优先级 FXX 写混沌场景。
