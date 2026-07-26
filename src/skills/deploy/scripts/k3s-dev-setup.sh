#!/usr/bin/env bash
# k3s-dev-setup.sh - 一键启动 K3S 测试集群
# 用法:
#   sudo bash skills/deploy/scripts/k3s-dev-setup.sh                      # 默认单服务器 K3S
#   sudo bash k3s-dev-setup.sh --ha --lb=10.0.0.10                       # HA 集群（嵌入式 etcd）
#   sudo bash k3s-dev-setup.sh --k3d                                     # K3D（Docker 内跑 K3S，秒级启动）
#   sudo bash k3s-dev-setup.sh --ha --lb=10.0.0.10 --disable-traefik    # 禁用默认 Traefik
#
# 这是 deployer "构建 K3S 测试环境" 的核心脚本。
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err() { echo -e "${RED}[ERR]${NC} $*"; exit 1; }
section() { echo -e "\n${BLUE}========== $* ==========${NC}"; }

# === 默认参数 ===
MODE="k3s"            # k3s | k3d
HA=false
LB_IP=""
DISABLE_TRAEFIK=false
K3D_NAME="myapp-dev"
K3D_SERVERS=1
K3D_AGENTS=2

# === 解析参数 ===
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
  --k3d)
    MODE="k3d"
    shift
    ;;
  --name=*)
    K3D_NAME="${1#*=}"
    shift
    ;;
  --servers=*)
    K3D_SERVERS="${1#*=}"
    shift
    ;;
  --agents=*)
    K3D_AGENTS="${1#*=}"
    shift
    ;;
  --help|-h)
    echo "Usage: $0 [--ha --lb=IP] | [--k3d --name=NAME --servers=N --agents=M]"
    echo ""
    echo "默认: 单服务器 K3S（内置 Traefik）"
    echo ""
    echo "选项:"
    echo "  --ha                   HA 集群（嵌入式 etcd，仅 K3S 模式）"
    echo "  --lb=IP                Load Balancer IP/DNS（HA 必填）"
    echo "  --disable-traefik      禁用 K3S 默认 Traefik"
    echo "  --k3d                  用 K3D（Docker 内跑 K3S，秒级启动）"
    echo "  --name=NAME            K3D 集群名称（默认 myapp-dev）"
    echo "  --servers=N            K3D server 数（默认 1）"
    echo "  --agents=M             K3D agent 数（默认 2）"
    exit 0
    ;;
  *)
    err "未知参数: $1"
    ;;
  esac
done

# === 模式选择 ===
if [ "$MODE" = "k3d" ]; then
  # K3D 模式：Docker 内跑 K3S
  section "K3D 模式（Docker 内 K3S 测试集群）"

  log "检查 Docker..."
  command -v docker &>/dev/null || err "Docker 未安装。先运行: bash skills/deploy/scripts/env-setup.sh --tools --yes"

  log "检查 K3D..."
  if ! command -v k3d &>/dev/null; then
    warn "K3D 未安装"
    log "安装 K3D..."
    curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash
  fi

  log "检查 k3d 集群 $K3D_NAME..."
  if k3d cluster get "$K3D_NAME" &>/dev/null; then
    warn "k3d 集群 $K3D_NAME 已存在"
    k3d cluster get "$K3D_NAME"
    read -p "删除并重建？[y/N] " -r
    if [[ "$REPLY" =~ ^[Yy]$ ]]; then
      k3d cluster delete "$K3D_NAME"
    else
      err "用户取消"
    fi
  fi

  log "创建 k3d 集群 $K3D_NAME (servers=$K3D_SERVERS, agents=$K3D_AGENTS)..."
  K3D_ARGS=(
    "cluster" "create" "$K3D_NAME"
    "--servers" "$K3D_SERVERS"
    "--agents" "$K3D_AGENTS"
    "--port" "8080:80@loadbalancer"
    "--port" "8443:443@loadbalancer"
    "--wait"
  )
  [ "$DISABLE_TRAEFIK" = true ] && K3D_ARGS+=("--k3s-arg" "--disable=traefik@server:*")
  k3d "${K3D_ARGS[@]}"

  # kubeconfig 自动配置（k3d 自动写到 ~/.kube/config）
  log "配置 kubeconfig..."
  k3d kubeconfig get "$K3D_NAME" > ~/.kube/config 2>/dev/null || true
  export KUBECONFIG=~/.kube/config

  section "K3D 集群状态"
  kubectl get nodes -o wide
  echo ""
  kubectl get pods -A

  section "下一步"
  log "K3D 测试集群 '$K3D_NAME' 已就绪。"
  log "使用:"
  log "  kubectl get nodes"
  log "  k3d cluster stop $K3D_NAME     # 停止（保留数据）"
  log "  k3d cluster start $K3D_NAME    # 启动"
  log "  k3d cluster delete $K3D_NAME   # 删除"
  log ""
  log "端口转发（从主机访问服务）："
  log "  kubectl port-forward svc/myapp-frontend 3000:80 -n myapp"

else
  # K3S 模式：直接安装 K3S
  section "K3S 模式（裸机/Docker host K3S 测试集群）"

  # 检查 root
  if [ "$(id -u)" -ne 0 ]; then
    err "K3S 安装需要 root 权限。请用 sudo: sudo bash $0"
  fi

  log "检查 K3S..."
  if command -v k3s &>/dev/null; then
    warn "K3S 已安装"
    k3s --version | head -1
    read -p "继续安装会重新初始化。是否继续？[y/N] " -r
    if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
      err "用户取消"
    fi
    /usr/local/sbin/k3s-uninstall.sh 2>/dev/null || true
    sleep 5
  fi

  # 禁用 swap（K3S 必需）
  if swapon --show 2>/dev/null | grep -q .; then
    warn "Swap 启用中。禁用 swap..."
    swapoff -a
    sed -i '/\sswap\s/s/^/#/' /etc/fstab
  fi

  # 构建 install 命令
  INSTALL_EXEC="server"

  if [ "$HA" = true ]; then
    if [ -z "$LB_IP" ]; then
      err "--ha 需要 --lb=<IP_OR_DNS>"
    fi
    INSTALL_EXEC="$INSTALL_EXEC --cluster-init --tls-san=$LB_IP"
    log "HA 模式：master 嵌入式 etcd 集群"
  fi

  if [ "$DISABLE_TRAEFIK" = true ]; then
    INSTALL_EXEC="$INSTALL_EXEC --disable=traefik"
    log "Traefik 已禁用"
  fi

  # 镜像加速（国内）
  if [ -f /etc/docker/daemon.json ] && grep -q "registry-mirrors" /etc/docker/daemon.json 2>/dev/null; then
    log "检测到 Docker daemon.json 配置了镜像源，K3S 会自动复用"
  fi

  # 安装
  log "安装 K3S..."
  log "  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC=\"$INSTALL_EXEC\" sh -"
  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="$INSTALL_EXEC" sh -

  # 等待 ready
  log "等待 K3S 就绪（最多 5 分钟）..."
  READY=""
  for i in $(seq 1 60); do
    if k3s kubectl get nodes &>/dev/null; then
      READY=$(k3s kubectl get nodes -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "")
      if [ "$READY" = "True" ]; then
        break
      fi
    fi
    sleep 5
    printf "."
  done
  echo ""

  if [ "$READY" != "True" ]; then
    err "K3S 未就绪。查看: journalctl -u k3s -e"
  fi

  # kubeconfig
  mkdir -p /root/.kube
  cp /etc/rancher/k3s/k3s.yaml /root/.kube/config

  # 给非 root 用户
  if [ -n "${SUDO_USER:-}" ]; then
    USER_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
    mkdir -p "$USER_HOME/.kube"
    cp /etc/rancher/k3s/k3s.yaml "$USER_HOME/.kube/config"
    chown -R "$SUDO_USER:$SUDO_USER" "$USER_HOME/.kube"
    log "kubeconfig 已复制到 $USER_HOME/.kube/config（用户 $SUDO_USER）"
  fi

  section "K3S 集群状态"
  k3s kubectl get nodes -o wide
  echo ""
  k3s kubectl get pods -A

  # 输出 join 信息
  if [ "$HA" = true ]; then
    NODE_TOKEN=$(cat /var/lib/rancher/k3s/server/node-token)
    section "其他节点加入"
    echo "Master 节点加入:"
    echo "  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC=\"server --server https://${LB_IP}:6443 --token ${NODE_TOKEN} --tls-san=${LB_IP}\" sh -"
    echo ""
    echo "Worker 节点加入:"
    echo "  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC=\"agent --server https://${LB_IP}:6443 --token ${NODE_TOKEN}\" sh -"
    echo "$NODE_TOKEN" > /tmp/k3s-token
    chmod 600 /tmp/k3s-token
  fi

  section "下一步"
  log "K3S 测试集群已就绪。"
  log "客户端使用："
  log "  export KUBECONFIG=~/.kube/config"
  log "  kubectl get nodes"
fi

log ""
log "部署应用到集群:"
log "  bash skills/deploy/scripts/deploy-k8s.sh k8s/"
log ""
log "验证部署:"
log "  bash skills/deploy/scripts/validate-k8s.sh"