#!/usr/bin/env bash
# k3s-node-join.sh - Worker 节点加入 K3S 集群
# 用法: sudo bash skills/deploy/scripts/k3s-node-join.sh <SERVER_URL> <TOKEN>
#   或: sudo bash k3s-node-join.sh --token-file=/tmp/k3s-token --server=10.0.0.10
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err() { echo -e "${RED}[ERR]${NC} $*"; exit 1; }

# === 检查 root ===
if [ "$(id -u)" -ne 0 ]; then
  err "Must run as root (sudo)"
fi

# === 解析参数 ===
SERVER_URL=""
TOKEN=""
ROLE="agent"  # 默认 worker agent
LABELS=""
TAINTS=""

while [ $# -gt 0 ]; do
  case "$1" in
  --server=*)
    SERVER_URL="${1#*=}"
    shift
    ;;
  --token=*)
    TOKEN="${1#*=}"
    shift
    ;;
  --token-file=*)
    TOKEN=$(cat "${1#*=}")
    shift
    ;;
  --role=*)
    ROLE="${1#*=}"  # agent | server
    shift
    ;;
  --label=*)
    LABELS="${LABELS} --node-label ${1#*=}"
    shift
    ;;
  --taint=*)
    TAINTS="${TAINTS} --node-taint ${1#*=}"
    shift
    ;;
  *)
    if [ -z "$SERVER_URL" ]; then
      SERVER_URL="$1"
    elif [ -z "$TOKEN" ]; then
      TOKEN="$1"
    fi
    shift
    ;;
  esac
done

# === 校验 ===
if [ -z "$SERVER_URL" ]; then
  err "Usage: $0 <SERVER_URL> <TOKEN>\n  or:  $0 --server=<URL> --token=<TOKEN> [--token-file=<FILE>]"
fi

if [ -z "$TOKEN" ]; then
  if [ -f /tmp/k3s-token ]; then
    TOKEN=$(cat /tmp/k3s-token)
    log "Loaded token from /tmp/k3s-token"
  else
    err "Token not provided. Use --token=<TOKEN>, --token-file=<FILE>, or place at /tmp/k3s-token"
  fi
fi

# === 检查已有 K3S ===
if command -v k3s &>/dev/null; then
  warn "k3s already installed:"
  k3s --version | head -1
  read -p "Reinstall? (yes/no) " -r
  if [ "$REPLY" != "yes" ]; then
    err "Aborted."
  fi
  if [ "$ROLE" = "server" ]; then
    /usr/local/sbin/k3s-server-uninstall.sh 2>/dev/null || true
  else
    /usr/local/sbin/k3s-agent-uninstall.sh 2>/dev/null || true
  fi
  sleep 5
fi

# === 禁用 swap ===
if swapon --show 2>/dev/null | grep -q .; then
  warn "Swap is enabled. Disabling..."
  swapoff -a
  sed -i '/\sswap\s/s/^/#/' /etc/fstab
fi

# === 安装 ===
log "=== 加入 K3S 集群 ==="
log "Server: $SERVER_URL"
log "Role: $ROLE"
[ -n "$LABELS" ] && log "Labels:$LABELS"
[ -n "$TAINTS" ] && log "Taints:$TAINTS"

INSTALL_EXEC="$ROLE --server $SERVER_URL --token $TOKEN"
[ -n "$LABELS" ] && INSTALL_EXEC="$INSTALL_EXEC $LABELS"
[ -n "$TAINTS" ] && INSTALL_EXEC="$INSTALL_EXEC $TAINTS"

curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="$INSTALL_EXEC" sh -

# === 验证 ===
log "=== 验证 ==="
sleep 10
if systemctl is-active --quiet k3s-agent 2>/dev/null || systemctl is-active --quiet k3s 2>/dev/null; then
  log "k3s service is running."
else
  err "k3s service failed. Check: sudo journalctl -u k3s-agent -e  (or -u k3s)"
fi

log "在 master 节点执行 kubectl get nodes 验证新节点已加入："
log "  kubectl get nodes -o wide"
log ""
log "=== 完成 ==="