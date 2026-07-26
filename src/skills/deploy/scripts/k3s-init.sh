#!/usr/bin/env bash
# k3s-init.sh - K3S master 节点初始化脚本
# 用法: sudo bash skills/deploy/scripts/k3s-init.sh [--ha] [--lb=<IP_OR_DNS>]
#
# 单节点: sudo bash k3s-init.sh
# HA master: sudo bash k3s-init.sh --ha --lb=10.0.0.10
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
HA=false
LB_IP=""
DISABLE_TRAEFIK=true

while [ $# -gt 0 ]; do
  case "$1" in
  --ha)
    HA=true
    shift
    ;;
  --lb=*)
    LB_IP="${1#*=}"
    shift
    ;;
  --disable-traefik)
    DISABLE_TRAEFIK=true
    shift
    ;;
  --enable-traefik)
    DISABLE_TRAEFIK=false
    shift
    ;;
  *)
    err "Unknown arg: $1"
    ;;
  esac
done

# === 检查系统 ===
log "=== 检查系统 ==="
if [ ! -f /etc/os-release ]; then
  err "Cannot detect OS (missing /etc/os-release)"
fi

. /etc/os-release
case "$ID" in
  ubuntu | debian | centos | rhel | rocky | almalinux | fedora | amzn)
    log "OS: $ID $VERSION_ID"
    ;;
  *)
    warn "Untested OS: $ID. Continuing anyway."
    ;;
esac

# 检查 curl
command -v curl &>/dev/null || err "curl not installed"

# === 禁用 swap（K3S 要求）===
if swapon --show 2>/dev/null | grep -q .; then
  warn "Swap is enabled. Disabling..."
  swapoff -a
  sed -i '/\sswap\s/s/^/#/' /etc/fstab
fi

# === 检查已有 K3S 安装 ===
if command -v k3s &>/dev/null; then
  warn "k3s already installed:"
  k3s --version | head -3
  read -p "Reinstall? (yes/no) " -r
  if [ "$REPLY" != "yes" ]; then
    err "Aborted."
  fi
  /usr/local/sbin/k3s-uninstall.sh 2>/dev/null || true
  sleep 5
fi

# === 构建安装命令 ===
INSTALL_EXEC="server"

if [ "$HA" = true ]; then
  if [ -z "$LB_IP" ]; then
    err "--ha requires --lb=<IP_OR_DNS>"
  fi
  INSTALL_EXEC="$INSTALL_EXEC --cluster-init --tls-san=$LB_IP"
fi

if [ "$DISABLE_TRAEFIK" = true ]; then
  INSTALL_EXEC="$INSTALL_EXEC --disable=traefik"
fi

# === 镜像加速（国内）===
if [ -f /etc/docker/daemon.json ] && grep -q "registry-mirrors" /etc/docker/daemon.json 2>/dev/null; then
  log "Docker daemon.json has registry-mirrors. Using docker mirrors."
fi

# === 安装 ===
log "=== 安装 K3S ==="
log "Command: curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC=\"$INSTALL_EXEC\" sh -"
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="$INSTALL_EXEC" sh -

# === 等待 ready ===
log "=== 等待 K3S ready ==="
for i in $(seq 1 60); do
  if sudo k3s kubectl get nodes &>/dev/null; then
    READY=$(sudo k3s kubectl get nodes -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
    if [ "$READY" = "True" ]; then
      log "K3S is ready."
      break
    fi
  fi
  sleep 5
  printf "."
done
echo ""

if [ "$READY" != "True" ]; then
  err "K3S failed to become ready in 5 minutes. Check: sudo journalctl -u k3s -e"
fi

# === 配置 kubeconfig ===
log "=== 配置 kubeconfig ==="
mkdir -p /root/.kube
cp /etc/rancher/k3s/k3s.yaml /root/.kube/config

if [ -n "${SUDO_USER:-}" ]; then
  USER_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
  mkdir -p "$USER_HOME/.kube"
  cp /etc/rancher/k3s/k3s.yaml "$USER_HOME/.kube/config"
  chown -R "$SUDO_USER:$SUDO_USER" "$USER_HOME/.kube"
  log "kubeconfig copied to $USER_HOME/.kube/config for user $SUDO_USER"
fi

# === 显示集群状态 ===
log "=== 集群状态 ==="
sudo k3s kubectl get nodes -o wide
echo ""
sudo k3s kubectl get pods -A

# === 输出 join 信息 ===
if [ "$HA" = true ]; then
  NODE_TOKEN=$(sudo cat /var/lib/rancher/k3s/server/node-token)
  echo ""
  log "=== 其他 master 节点加入集群 ==="
  echo "在 master-2/master-3 上执行："
  echo ""
  echo "  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC=\"server --server https://${LB_IP}:6443 --token ${NODE_TOKEN} --tls-san=${LB_IP} --disable=traefik\" sh -"
  echo ""
  log "=== Worker 节点加入集群 ==="
  echo "在 worker 节点上执行："
  echo ""
  echo "  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC=\"agent --server https://${LB_IP}:6443 --token ${NODE_TOKEN}\" sh -"
  echo ""
  echo "TOKEN 已保存到 /tmp/k3s-token (用于 k3s-join.sh):"
  echo "$NODE_TOKEN" | tee /tmp/k3s-token
  chmod 600 /tmp/k3s-token
else
  echo ""
  log "=== Worker 节点加入集群 ==="
  NODE_TOKEN=$(sudo cat /var/lib/rancher/k3s/server/node-token)
  echo "  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC=\"agent --server https://$(hostname -I | awk '{print $1}'):6443 --token ${NODE_TOKEN}\" sh -"
  echo "$NODE_TOKEN" | tee /tmp/k3s-token
  chmod 600 /tmp/k3s-token
fi

log "=== 完成 ==="
log "K3S 已安装并就绪。"
log "客户端 kubectl: export KUBECONFIG=/etc/rancher/k3s/k3s.yaml"
log "或在非 root 用户: export KUBECONFIG=~/.kube/config"