#!/usr/bin/env bash
# validate-deploy.sh - 验证部署配置的正确性
# 用法: bash skills/deploy/scripts/validate-deploy.sh [prod|dev|both]
# 默认: both
set -euo pipefail

MODE="${1:-both}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok() { echo -e "${GREEN}[OK]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; FAIL=1; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
FAIL=0

echo "=== 部署验证 ==="
echo ""

# === 文件存在性 ===
echo "--- 文件检查 ---"
for f in compose.prod.yml compose.dev.yml .env.prod.example .env.dev.example \
         Dockerfile.frontend Dockerfile.backend nginx/nginx.conf prodapp.sh devapp.sh; do
  if [ -f "$f" ]; then
    ok "$f 存在"
  else
    warn "$f 不存在（可能项目类型不需要）"
  fi
done
echo ""

# === 生产模式验证 ===
if [ "$MODE" = "prod" ] || [ "$MODE" = "both" ]; then
  echo "--- 生产模式 ---"

  # Dockerfile.frontend 多阶段构建检查
  if [ -f Dockerfile.frontend ]; then
    if grep -q "FROM.*AS builder" Dockerfile.frontend && \
       grep -q "FROM nginx" Dockerfile.frontend; then
      ok "Dockerfile.frontend 是多阶段构建（Node builder -> Nginx）"
    else
      fail "Dockerfile.frontend 不是多阶段构建（应该 FROM node AS builder + FROM nginx）"
    fi

    # 检查运行容器是否带 node_modules
    if grep -q "COPY.*node_modules" Dockerfile.frontend; then
      warn "Dockerfile.frontend 包含 'COPY node_modules' -- 多阶段构建不应携带 node_modules"
    else
      ok "Dockerfile.frontend 不携带 node_modules"
    fi
  fi

  # Dockerfile.backend 健康检查
  if [ -f Dockerfile.backend ]; then
    if grep -q "EXPOSE" Dockerfile.backend; then
      ok "Dockerfile.backend 有 EXPOSE"
    else
      warn "Dockerfile.backend 缺少 EXPOSE"
    fi

    if grep -q "USER " Dockerfile.backend; then
      ok "Dockerfile.backend 用非 root 用户运行"
    else
      warn "Dockerfile.backend 用 root 运行（建议加 USER appuser）"
    fi

    # 不能用 latest
    if grep -q ":latest" Dockerfile.backend; then
      fail "Dockerfile.backend 使用了 :latest 镜像"
    else
      ok "Dockerfile.backend 未使用 :latest"
    fi
  fi

  # compose.prod.yml 健康检查
  if [ -f compose.prod.yml ]; then
    if command -v docker &>/dev/null; then
      if docker compose -f compose.prod.yml config 2>/dev/null | grep -q "test:"; then
        ok "compose.prod.yml 服务有 healthcheck test"
      else
        fail "compose.prod.yml 服务缺少 healthcheck"
      fi
    else
      warn "Docker 未安装，跳过 compose 配置检查"
    fi

    # 不能用 latest
    if grep -q "image.*:latest" compose.prod.yml; then
      fail "compose.prod.yml 使用了 :latest 镜像"
    else
      ok "compose.prod.yml 未使用 :latest"
    fi
  fi

  # Nginx 配置
  if [ -f nginx/nginx.conf ]; then
    if grep -q "try_files" nginx/nginx.conf; then
      ok "nginx.conf 配置了 try_files（SPA fallback）"
    else
      warn "nginx.conf 未配置 try_files（刷新页面可能 404）"
    fi

    if grep -q "proxy_pass" nginx/nginx.conf; then
      ok "nginx.conf 配置了 proxy_pass（API 代理）"
    else
      warn "nginx.conf 未配置 proxy_pass（纯前端项目可忽略）"
    fi

    # proxy_pass 不能用 localhost
    if grep -q "proxy_pass http://localhost" nginx/nginx.conf; then
      fail "nginx.conf 的 proxy_pass 用了 localhost（容器内不通，应为服务名）"
    else
      ok "nginx.conf 的 proxy_pass 未使用 localhost"
    fi

    # proxy_set_header Host
    if grep -q "proxy_set_header Host" nginx/nginx.conf; then
      ok "nginx.conf 传递 Host header"
    else
      warn "nginx.conf 未传递 Host header"
    fi
  fi

  # prodapp.sh 基础检查
  if [ -f prodapp.sh ]; then
    if grep -q "set -euo pipefail" prodapp.sh; then
      ok "prodapp.sh 有 set -euo pipefail"
    else
      fail "prodapp.sh 缺少 set -euo pipefail"
    fi

    if grep -q "docker compose -f compose.prod.yml up" prodapp.sh; then
      ok "prodapp.sh 使用 docker compose -f compose.prod.yml up"
    else
      fail "prodapp.sh 未使用 docker compose -f compose.prod.yml up"
    fi
  fi

  # .env.prod 占位值检查
  if [ -f .env.prod ]; then
    if grep -i "CHANGE_ME" .env.prod; then
      warn ".env.prod 含 CHANGE_ME 占位值（生产前必须替换）"
    else
      ok ".env.prod 无 CHANGE_ME 占位值"
    fi
  fi

  echo ""
fi

# === 开发模式验证 ===
if [ "$MODE" = "dev" ] || [ "$MODE" = "both" ]; then
  echo "--- 开发模式 ---"

  if [ -f compose.dev.yml ]; then
    # bind mount 检查（相对路径 ./path:/path 或绝对路径 /host/path:/container/path）
    if grep -qE "^\s*-\s+(\./|/)[^:]+:[^:]+" compose.dev.yml; then
      ok "compose.dev.yml 有 bind mount 源码目录"
    else
      warn "compose.dev.yml 未检测到 bind mount（应加 - ./src:/app）"
    fi

    # 命名卷（短格式 - name:/path 或长格式 type: volume）
    if grep -qE "^\s*-\s+[a-z_][a-z0-9_]*:[^:]+" compose.dev.yml; then
      ok "compose.dev.yml 有命名卷（依赖缓存）"
    else
      warn "compose.dev.yml 未定义命名卷（重启会重装依赖）"
    fi

    # volumes: 顶层声明（命名为空则 warn）
    if awk '/^volumes:/{flag=1; next} flag && /^[^ ]/{flag=0} flag && /^[a-zA-Z_]/{found=1} END{exit !found}' compose.dev.yml; then
      ok "compose.dev.yml 顶层 volumes 段有命名卷声明"
    elif grep -qE "^volumes:" compose.dev.yml; then
      warn "compose.dev.yml 顶层 volumes: 段为空"
    fi

    # 热重载命令
    if grep -qE "vite.*--host|--reload|air" compose.dev.yml; then
      ok "compose.dev.yml 配置了热重载命令"
    else
      warn "compose.dev.yml 未检测到热重载命令（vite --host / uvicorn --reload / air）"
    fi

    # dev server proxy 不能用 localhost
    if grep -E "vite|nuxt|next" compose.dev.yml &>/dev/null; then
      if grep -q "VITE_API_BASE=http://localhost" compose.dev.yml && \
         ! grep -q "VITE_API_BASE=http://backend" compose.dev.yml; then
        warn "compose.dev.yml 前端 API_BASE 用 localhost（dev 在 Compose 内应为服务名）"
      fi
    fi
  fi

  if [ -f devapp.sh ]; then
    if grep -q "set -euo pipefail" devapp.sh; then
      ok "devapp.sh 有 set -euo pipefail"
    else
      fail "devapp.sh 缺少 set -euo pipefail"
    fi

    if grep -q "docker compose -f compose.dev.yml" devapp.sh; then
      ok "devapp.sh 使用 docker compose -f compose.dev.yml"
    else
      fail "devapp.sh 未使用 docker compose -f compose.dev.yml"
    fi

    if grep -q "npm install\|pip install\|go mod download" devapp.sh; then
      warn "devapp.sh 执行了 install（依赖应在镜像构建时或容器 command 中处理）"
    else
      ok "devapp.sh 不执行 install（依赖已容器化）"
    fi
  fi
  echo ""
fi

# === 总结 ===
echo "=== 总结 ==="
if [ "$FAIL" = "1" ]; then
  echo -e "${RED}验证失败，请修复上述 FAIL 项${NC}"
  exit 1
else
  echo -e "${GREEN}验证通过！${NC}"
  echo ""
  echo "下一步："
  echo "  生产: bash prodapp.sh"
  echo "  开发: bash devapp.sh"
fi