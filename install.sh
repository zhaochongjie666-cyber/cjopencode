#!/usr/bin/env bash
# 把 src/ 下的 agents / skills / plugins 安装到 opencode 用户配置目录。
# 用 symlink，改源码即生效，无需复制。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_ROOT="${HOME}/.config/opencode"

mkdir -p "${TARGET_ROOT}"

for cur in agents skills plugins; do
  src="${REPO_ROOT}/src/${cur}"
  dst="${TARGET_ROOT}/${cur}"
  if [[ ! -e "${src}" ]]; then
    echo "[install] skip: ${src} 不存在"
    continue
  fi
  if [[ -L "${dst}" || -e "${dst}" ]]; then
    echo "[install] unlink existing: ${dst}"
    rm -f "${dst}"
  fi
  ln -snf "${src}" "${dst}"
  echo "[install] ${src} -> ${dst}"
done

src="${REPO_ROOT}/src/SYSTEM_AGENTS.md"
dst="${TARGET_ROOT}/AGENTS.md"
if [[ -e "${src}" ]]; then
  if [[ -L "${dst}" || -e "${dst}" ]]; then
    echo "[install] unlink existing: ${dst}"
    rm -f "${dst}"
  fi
  ln -snf "${src}" "${dst}"
  echo "[install] ${src} -> ${dst}"
fi

echo "[install] done。重启 opencode 生效。"
