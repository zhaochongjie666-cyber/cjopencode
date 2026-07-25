/**
 * 自包含 gate helpers。对齐 cjpi extensions/normal-flow/gate.ts。
 * 用 node:fs 做文件观测；用 Bun.$ 跑构建/git 命令。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

export interface GateResult {
  ok: boolean
  reason?: string
  soft?: boolean
}

const WALK_EXCLUDE = new Set([
  "node_modules", ".git", "dist", "build", "vendor",
  ".next", "target", ".cache", ".turbo", "coverage", ".nf",
])

export function walkRel(dir: string, maxFiles = 5000): string[] {
  const out: string[] = []
  const stack: string[] = [dir]
  let count = 0
  while (stack.length > 0 && count < maxFiles) {
    const cur = stack.pop() as string
    let entries: string[]
    try { entries = readdirSync(cur) } catch { continue }
    for (const name of entries) {
      if (WALK_EXCLUDE.has(name)) continue
      const full = join(cur, name)
      let st
      try { st = statSync(full) } catch { continue }
      count++
      if (st.isDirectory()) stack.push(full)
      else out.push(relative(dir, full).replace(/\\/g, "/"))
    }
  }
  return out
}

export function hasGlobMeta(pattern: string): boolean {
  return /[*?]/.test(pattern)
}

export function globToRegExp(pattern: string): RegExp {
  const segs = pattern.split("/")
  let re = "^"
  let prevGlobstar = false
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (s === "**") {
      if (i > 0) re += "/"
      re += "(?:[^/]+/)*"
      prevGlobstar = true
      continue
    }
    if (i > 0 && !prevGlobstar) re += "/"
    re += s
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
    prevGlobstar = false
  }
  return new RegExp(`${re}$`)
}

export function matchingFiles(cwd: string, patterns: readonly string[]): string[] {
  let walked: string[] | undefined
  const out = new Set<string>()
  for (const p of patterns) {
    if (!hasGlobMeta(p)) { out.add(p); continue }
    walked ??= walkRel(cwd)
    const re = globToRegExp(p)
    for (const f of walked) if (re.test(f)) out.add(f)
  }
  return [...out]
}

export function readMatchedText(cwd: string, patterns: readonly string[]): string {
  return matchingFiles(cwd, patterns)
    .map((rel) => {
      try { return readFileSync(join(cwd, rel), "utf8") } catch { return "" }
    })
    .join("\n")
}

export async function requireGlobs(cwd: string, patterns: readonly string[]): Promise<GateResult> {
  if (patterns.length === 0) return { ok: false, reason: "无可校验产物路径" }
  let walked: string[] | undefined
  for (const p of patterns) {
    if (!hasGlobMeta(p)) {
      if (existsSync(join(cwd, p))) return { ok: true }
      continue
    }
    if (walked === undefined) walked = walkRel(cwd)
    const re = globToRegExp(p)
    if (walked.some((f) => re.test(f))) return { ok: true }
  }
  return { ok: false, reason: `未找到匹配产物 (任一即可): ${patterns.join(", ")}` }
}

export async function requireMinSize(
  cwd: string,
  patterns: readonly string[],
  minSize: number,
): Promise<GateResult> {
  const base = await requireGlobs(cwd, patterns)
  if (!base.ok) return base
  let walked: string[] | undefined
  for (const p of patterns) {
    if (hasGlobMeta(p) && walked === undefined) walked = walkRel(cwd)
    const rel = !hasGlobMeta(p)
      ? (existsSync(join(cwd, p)) ? p : undefined)
      : walked!.find((f) => globToRegExp(p).test(f))
    if (!rel) continue
    const st = statSync(join(cwd, rel))
    if (st.size < minSize) {
      return { ok: false, reason: `${rel} 内容过短（${st.size} < ${minSize} 字节），缺少实质内容` }
    }
    return { ok: true }
  }
  return { ok: true }
}

export async function runBuild(cwd: string): Promise<GateResult> {
  let cmd: string[] | null = null
  if (existsSync(join(cwd, "package.json"))) {
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"))
      if (pkg.scripts?.build) cmd = ["npm", "run", "build"]
    } catch { /* ignore */ }
  }
  if (!cmd && existsSync(join(cwd, "go.mod"))) cmd = ["go", "build", "./..."]
  if (!cmd && existsSync(join(cwd, "Makefile"))) cmd = ["make", "build"]
  if (!cmd) return { ok: true }
  try {
    await withTimeout(Bun.$`${cmd[0]} ${cmd.slice(1)}`.cwd(cwd).quiet(), 180_000)
    return { ok: true }
  } catch (e) {
    const err = e as { code?: number; stderr?: string | Buffer }
    return {
      ok: false,
      reason: `构建 ${cmd.join(" ")} 失败（退出码 ${err.code ?? "?"}）${(err.stderr ?? "").toString().slice(0, 600)}`,
    }
  }
}

/** 给 Bun.$ shell promise 加超时保护，防止 gate 卡死。 */
async function withTimeout<T>(p: Promise<T> & { aborted?: boolean }, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const ctrl = new AbortController()
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          ctrl.abort()
          reject(new Error(`命令超时（${ms}ms）`))
        }, ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function gitHasChanges(cwd: string): Promise<GateResult> {
  try {
    await Bun.$`git rev-parse --is-inside-work-tree`.cwd(cwd).quiet()
  } catch {
    return { ok: true, soft: true }
  }
  try {
    const out = (await Bun.$`git status --porcelain`.cwd(cwd).quiet().text())
      .trim().split("\n").filter(Boolean).filter((l) => !l.includes(".nf/"))
    return out.length > 0
      ? { ok: true }
      : { ok: false, reason: "git 工作区无代码改动（已排除 .nf/），未见实现产物" }
  } catch {
    return { ok: true, soft: true }
  }
}
