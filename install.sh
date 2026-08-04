#!/usr/bin/env bash
# 把 src/ 下的 agents / skills / plugins / commands 安装到 opencode 用户配置目录。
# 直接复制文件，避免软链接/硬链接导致 Bun 按源码真实路径解析依赖（plugins 尤需如此）。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_ROOT="${HOME}/.config/opencode"

mkdir -p "${TARGET_ROOT}"

for cur in agents skills plugins commands; do
  src="${REPO_ROOT}/src/${cur}"
  dst="${TARGET_ROOT}/${cur}"
  if [[ ! -e "${src}" ]]; then
    echo "[install] skip: ${src} 不存在"
    continue
  fi
  rm -rf "${dst}"
  cp -r "${src}" "${dst}"
  echo "[install] copied ${src} -> ${dst}"
done

src="${REPO_ROOT}/src/SYSTEM_AGENTS.md"
dst="${TARGET_ROOT}/AGENTS.md"
if [[ -e "${src}" ]]; then
  cp "${src}" "${dst}"
  echo "[install] copied ${src} -> ${dst}"
fi

echo "[install] done。重启 opencode 生效。"
