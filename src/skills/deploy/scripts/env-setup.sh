#!/usr/bin/env bash
# env-setup.sh - 检测并安装项目所需的开发环境
# 用法: bash skills/deploy/scripts/env-setup.sh [--lang=node|python|go|all] [--tools]
#
# 行为：
#   1. 检测当前系统（Ubuntu/Debian/macOS）
#   2. 检测已安装的工具
#   3. 缺什么装什么（带确认）
#   4. 输出环境报告
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err() { echo -e "${RED}[ERR]${NC} $*"; }
section() { echo -e "${BLUE}========== $* ==========${NC}"; }

# === 解析参数 ===
LANG="all"
INSTALL_TOOLS=false
AUTO_YES=false

while [ $# -gt 0 ]; do
  case "$1" in
  --lang=*)
    LANG="${1#*=}"
    shift
    ;;
  --tools)
    INSTALL_TOOLS=true
    shift
    ;;
  --yes|-y)
    AUTO_YES=true
    shift
    ;;
  --help|-h)
    echo "Usage: $0 [--lang=node|python|go|all] [--tools] [--yes]"
    echo ""
    echo "  --lang=LANG    Install specific language runtime (default: all detected)"
    echo "  --tools        Also install common CLI tools (kubectl, helm, etc.)"
    echo "  --yes          Non-interactive mode (auto-install missing)"
    exit 0
    ;;
  *)
    err "Unknown arg: $1"
    ;;
  esac
done

# === 检测系统 ===
section "系统检测"
. /etc/os-release 2>/dev/null || { err "Cannot detect OS"; }
log "OS: $ID $VERSION_ID"

IS_UBUNTU=false
IS_DEBIAN=false
IS_MACOS=false

case "$ID" in
  ubuntu) IS_UBUNTU=true ;;
  debian) IS_DEBIAN=true ;;
  darwin) IS_MACOS=true ;;
  *) warn "Untested OS: $ID. Some installations may not work." ;;
esac

# === 询问确认 ===
if [ "$AUTO_YES" = false ] && [ "$INSTALL_TOOLS" = true -o "$LANG" != "all" ]; then
  echo ""
  read -p "将检测并安装缺失的工具，是否继续？[y/N] " -r
  if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
    err "用户取消"
  fi
fi

# === 安装工具函数 ===
install_apt() {
  if [ "$IS_UBUNTU" = true ] || [ "$IS_DEBIAN" = true ]; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq "$@"
  fi
}

install_brew() {
  if [ "$IS_MACOS" = true ]; then
    command -v brew &>/dev/null || err "Homebrew 未安装。安装：/bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    brew install "$@"
  fi
}

# === 检测/安装 Git ===
section "Git"
if command -v git &>/dev/null; then
  log "Git 已安装: $(git --version)"
else
  warn "Git 未安装"
  if [ "$AUTO_YES" = true ]; then
    install_apt git || install_brew git
  fi
fi

# === 检测/安装 Docker ===
section "Docker"
if command -v docker &>/dev/null; then
  log "Docker 已安装: $(docker --version)"
  if docker ps &>/dev/null 2>&1; then
    log "Docker daemon 可访问"
  else
    warn "Docker 已安装但 daemon 不可访问（权限？服务？）"
  fi
else
  warn "Docker 未安装"
  if [ "$AUTO_YES" = true ]; then
    if [ "$IS_UBUNTU" = true ] || [ "$IS_DEBIAN" = true ]; then
      # 用 docker 官方安装脚本
      curl -fsSL https://get.docker.com | sh
      sudo usermod -aG docker "$USER"
      log "Docker 已安装。请 logout/login 让组权限生效"
    elif [ "$IS_MACOS" = true ]; then
      install_brew --cask docker
    fi
  fi
fi

# === Node.js ===
if [ "$LANG" = "all" -o "$LANG" = "node" ]; then
  section "Node.js"
  if command -v node &>/dev/null; then
    log "Node.js 已安装: $(node --version)"
    log "npm: $(npm --version)"
  else
    warn "Node.js 未安装"
    if [ "$AUTO_YES" = true ]; then
      if [ "$IS_UBUNTU" = true ] || [ "$IS_DEBIAN" = true ]; then
        # 用 nvm
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        nvm install --lts
        log "Node.js 已通过 nvm 安装"
      elif [ "$IS_MACOS" = true ]; then
        install_brew node
      fi
    fi
  fi

  # 包管理器
  if command -v pnpm &>/dev/null; then
    log "pnpm: $(pnpm --version)"
  elif [ "$AUTO_YES" = true ]; then
    if command -v npm &>/dev/null; then
      npm install -g pnpm
      log "pnpm 已全局安装"
    fi
  fi
fi

# === Python ===
if [ "$LANG" = "all" -o "$LANG" = "python" ]; then
  section "Python"
  if command -v python3 &>/dev/null; then
    log "Python3 已安装: $(python3 --version)"
    log "pip3: $(pip3 --version 2>&1 | head -1)"
  else
    warn "Python3 未安装"
    if [ "$AUTO_YES" = true ]; then
      install_apt python3 python3-pip python3-venv python3-dev || install_brew python@3.12
    fi
  fi

  # uv (现代 Python 包管理器)
  if command -v uv &>/dev/null; then
    log "uv: $(uv --version)"
  elif [ "$AUTO_YES" = true ]; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
    log "uv 已安装"
  fi
fi

# === Go ===
if [ "$LANG" = "all" -o "$LANG" = "go" ]; then
  section "Go"
  if command -v go &>/dev/null; then
    log "Go 已安装: $(go version)"
  else
    warn "Go 未安装"
    if [ "$AUTO_YES" = true ]; then
      GO_VERSION="1.23.4"
      if [ "$IS_UBUNTU" = true ] || [ "$IS_DEBIAN" = true ]; then
        curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -o /tmp/go.tar.gz
        sudo tar -C /usr/local -xzf /tmp/go.tar.gz
        echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
        log "Go 已安装。请 source ~/.bashrc 或重启 shell"
      elif [ "$IS_MACOS" = true ]; then
        install_brew go
      fi
    fi
  fi
fi

# === 数据库客户端 ===
section "数据库客户端"
for tool_pair in "psql:postgresql-client:libpq" "redis-cli:redis-tools:"; do
  IFS=':' read -r cmd apt_pkg brew_pkg <<< "$tool_pair"
  if command -v "$cmd" &>/dev/null; then
    log "$cmd: $(command -v $cmd)"
  else
    warn "$cmd 未安装"
    if [ "$AUTO_YES" = true ]; then
      if [ -n "$apt_pkg" ]; then install_apt "$apt_pkg" || true; fi
      if [ -n "$brew_pkg" ] && [ "$IS_MACOS" = true ]; then install_brew "$brew_pkg"; fi
    fi
  fi
done

# === K8S 工具 ===
if [ "$INSTALL_TOOLS" = true ]; then
  section "K8S 工具"

  if command -v kubectl &>/dev/null; then
    log "kubectl: $(kubectl version --client --short 2>/dev/null || kubectl version --client)"
  elif [ "$AUTO_YES" = true ]; then
    KUBE_VERSION=$(curl -L -s https://dl.k8s.io/release/stable.txt)
    curl -LO "https://dl.k8s.io/release/$KUBE_VERSION/bin/linux/amd64/kubectl"
    sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
    log "kubectl 已安装"
  fi

  if command -v helm &>/dev/null; then
    log "helm: $(helm version --short)"
  elif [ "$AUTO_YES" = true ]; then
    curl -fsSL -o /tmp/get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
    bash /tmp/get_helm.sh
    log "helm 已安装"
  fi
fi

# === 环境报告 ===
section "环境报告"

cat << EOF

主机: $(hostname)
OS: $ID $VERSION_ID
内核: $(uname -r)
用户: $(whoami)

EOF

for cmd in node npm python3 pip3 go docker kubectl helm git; do
  if command -v "$cmd" &>/dev/null; then
    VERSION=$("$cmd" --version 2>&1 | head -1)
    printf "  %-10s %s\n" "$cmd:" "$VERSION"
  else
    printf "  %-10s (未安装)\n" "$cmd:"
  fi
done

echo ""
log "环境检查完成。"
log "下一步：bash skills/deploy/scripts/k3s-dev-setup.sh 一键启动 K3S 测试集群"

if [ "$AUTO_YES" = false ]; then
  echo ""
  warn "未启用 --yes，跳过了实际安装。如需安装缺失工具，重跑: $0 --yes"
fi