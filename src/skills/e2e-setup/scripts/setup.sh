#!/usr/bin/env bash
# e2e 环境一键安装：自动检测缺失项并装上
# 用法: bash setup.sh [--check-only]
set -uo pipefail

CHECK_ONLY=false
[[ "${1:-}" == "--check-only" ]] && CHECK_ONLY=true

echo "┌─ E2E 环境一键安装 ───────────────────────────────────────"
echo

# 1. 检测 node / npm
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 缺少 node.js，请先装 node ≥ 18"
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "❌ 缺少 npm，请先装 npm"
  exit 1
fi
echo "✓ node $(node --version) + npm $(npm --version)"

# 2. 装 playwright (项目级)
if [[ ! -f package.json ]] && [[ ! -f e2e/package.json ]]; then
  echo "⚠️  当前目录无 package.json，跳过 playwright 安装"
  echo "   请在项目根目录运行，或在 e2e/ 子目录运行"
else
  PKG_DIR="."
  [[ -f e2e/package.json ]] && PKG_DIR="e2e"

  cd "$PKG_DIR" || exit 1

  if ! grep -q '"@playwright/test"' package.json 2>/dev/null; then
    echo "→ 装 @playwright/test 到 $PKG_DIR/"
    npm install -D @playwright/test@latest
  else
    echo "✓ @playwright/test 已在 $PKG_DIR/package.json"
  fi

  # 3. 装 playwright chromium 浏览器
  echo "→ 装 chromium 浏览器（playwright 自带）"
  npx playwright install chromium

  # 4. 装系统依赖 (apt/Ubuntu)
  if command -v apt-get >/dev/null 2>&1; then
    echo "→ 装 chromium 系统依赖 (apt-get)"
    sudo -n apt-get install -y \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
      libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libatspi2.0-0 \
      libx11-6 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
      libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2t64 2>/dev/null \
      || echo "⚠️  部分系统依赖装失败（如非 root / 非 Ubuntu），可能需要手动装"
  fi

  cd - >/dev/null
fi

echo
if $CHECK_ONLY; then
  echo "→ 跑 check.sh 验证"
  bash "$(dirname "${BASH_SOURCE[0]}")/check.sh"
else
  echo "→ 验证装结果"
  bash "$(dirname "${BASH_SOURCE[0]}")/check.sh"
fi