#!/usr/bin/env bash
# e2e 环境检测：列 chromium / playwright / 系统 chrome / 浏览器二进制 状态
set -uo pipefail

PASS=0
FAIL=0
WARN=0

print_check() {
  local status="$1"
  local name="$2"
  local detail="${3:-}"
  case "$status" in
    OK)    echo -e "  \033[32m✓\033[0m $name -- $detail"; PASS=$((PASS+1)) ;;
    WARN)  echo -e "  \033[33m⚠\033[0m $name -- $detail"; WARN=$((WARN+1)) ;;
    FAIL)  echo -e "  \033[31m✗\033[0m $name -- $detail"; FAIL=$((FAIL+1)) ;;
  esac
}

echo "┌─ E2E 环境检测 ─────────────────────────────────────────────"
echo

# 1. playwright
if command -v npx >/dev/null 2>&1; then
  PW_VER=$(npx playwright --version 2>/dev/null || echo "未装")
  if [[ "$PW_VER" == "未装" ]]; then
    print_check FAIL "playwright" "未装。运行: npm install -D @playwright/test"
  else
    print_check OK "playwright" "version $PW_VER"
  fi
else
  print_check FAIL "npx" "node/npm 未装"
fi

# 2. playwright 自带 chromium
PW_CHROMIUM=$(ls ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)
if [[ -n "$PW_CHROMIUM" ]] && [[ -x "$PW_CHROMIUM" ]]; then
  print_check OK "playwright chromium" "${PW_CHROMIUM}"
else
  print_check WARN "playwright chromium" "未下载。运行: npx playwright install chromium"
fi

# 3. 系统 chrome
for bin in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$bin" >/dev/null 2>&1; then
    CHROME_VER=$("$bin" --version 2>/dev/null | head -1)
    print_check OK "系统 chrome ($bin)" "$CHROME_VER"
    break
  fi
done
if ! command -v google-chrome >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then
  print_check WARN "系统 chrome" "未装。可选: apt install google-chrome-stable"
fi

# 4. 系统依赖 (headless 浏览器需要)
MISSING_DEPS=()
for lib in libnss3.so libatk-bridge-2.0.so libxkbcommon.so libdrm.so; do
  if ! ldconfig -p 2>/dev/null | grep -q "$lib"; then
    MISSING_DEPS+=("$lib")
  fi
done
if [[ ${#MISSING_DEPS[@]} -eq 0 ]]; then
  print_check OK "系统依赖" "完整"
else
  print_check WARN "系统依赖缺失" "${MISSING_DEPS[*]}。运行: apt install libnss3 libatk-bridge2.0-0 libxkbcommon0 libdrm2"
fi

# 5. docker (备选启动方式)
if command -v docker >/dev/null 2>&1; then
  print_check OK "docker" "$(docker --version | head -1)"
else
  print_check WARN "docker" "未装（可选，docker compose up 可用替代）"
fi

echo
echo "└─ 汇总 ─────────────────────────────────────────────────────"
echo -e "  ✓ PASS: \033[32m$PASS\033[0m   ⚠ WARN: \033[33m$WARN\033[0m   ✗ FAIL: \033[31m$FAIL\033[0m"
echo

if [[ $FAIL -gt 0 ]]; then
  echo "❌ 有 $FAIL 项必备缺失，必须修复才能跑 E2E"
  echo "   修复: bash src/skills/e2e-setup/scripts/setup.sh"
  exit 1
elif [[ $WARN -gt 0 ]]; then
  echo "⚠️  有 $WARN 项可选缺失，建议修复（用 setup.sh 自动补）"
  exit 2
fi
echo "✅ E2E 环境就绪，可以跑 playwright 测试"