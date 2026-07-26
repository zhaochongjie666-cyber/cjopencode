#!/usr/bin/env bash
# env-validate.sh - 验证项目开发/部署环境就绪
# 用法: bash skills/deploy/scripts/env-validate.sh [--level=basic|full|k8s]
# 默认 basic
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok() { echo -e "${GREEN}[OK]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; FAIL=1; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
FAIL=0

LEVEL="${1:-basic}"

echo "=== 环境验证 (level: $LEVEL) ==="
echo ""

# === 基础检查 ===
echo "--- 基础工具 ---"
for cmd in git curl wget; do
  if command -v "$cmd" &>/dev/null; then
    ok "$cmd: $(command -v $cmd)"
  else
    fail "$cmd 未安装"
  fi
done

# === 语言运行时 ===
echo ""
echo "--- 语言运行时 ---"
for cmd in node npm python3 pip3 go; do
  if command -v "$cmd" &>/dev/null; then
    VERSION=$("$cmd" --version 2>&1 | head -1)
    ok "$cmd: $VERSION"
  else
    warn "$cmd 未安装"
  fi
done

# === Docker ===
echo ""
echo "--- Docker ---"
if command -v docker &>/dev/null; then
  ok "docker: $(docker --version)"
  if docker ps &>/dev/null 2>&1; then
    ok "Docker daemon 可访问"
  else
    warn "Docker daemon 不可访问（可能需要 sudo 或加入 docker 组）"
  fi
else
  warn "docker 未安装"
fi

# === 容器镜像 ===
echo ""
echo "--- 镜像构建 ---"
for cmd in docker buildx podman; do
  if command -v "$cmd" &>/dev/null; then
    ok "$cmd: $(command -v $cmd)"
  else
    [ "$cmd" = "docker" ] && continue  # 已检查过
    [ "$cmd" = "buildx" ] && continue
    warn "$cmd 未安装"
  fi
done

# === 数据库客户端 ===
echo ""
echo "--- 数据库客户端 ---"
for cmd in psql mysql redis-cli mongosh; do
  if command -v "$cmd" &>/dev/null; then
    ok "$cmd: $(command -v $cmd)"
  else
    warn "$cmd 未安装"
  fi
done

# === full 级别：K8S 工具 ===
if [ "$LEVEL" = "full" ] || [ "$LEVEL" = "k8s" ]; then
  echo ""
  echo "--- K8S 工具 ---"
  for cmd in kubectl k3s k3d helm kind minikube; do
    if command -v "$cmd" &>/dev/null; then
      VERSION=$("$cmd" version --short 2>/dev/null || "$cmd" version 2>&1 | head -1)
      ok "$cmd: $VERSION"
    else
      warn "$cmd 未安装"
    fi
  done

  # === K8S 集群连通性 ===
  echo ""
  echo "--- K8S 集群连通性 ---"
  if command -v kubectl &>/dev/null; then
    if kubectl cluster-info &>/dev/null 2>&1; then
      ok "集群连通: $(kubectl config current-context 2>/dev/null)"
      NODES=$(kubectl get nodes --no-headers 2>/dev/null | wc -l)
      READY=$(kubectl get nodes --no-headers 2>/dev/null | grep -c " Ready")
      if [ "$READY" -eq "$NODES" ] && [ "$NODES" -gt 0 ]; then
        ok "所有 $NODES 个节点 Ready"
      else
        warn "$((NODES - READY))/$NODES 节点未 Ready"
      fi
    else
      warn "kubectl 已安装但无集群连通（KUBECONFIG 正确？集群运行？）"
    fi
  else
    warn "kubectl 未安装，跳过集群连通性检查"
  fi

  # === K8S 集群组件 ===
  if kubectl cluster-info &>/dev/null 2>&1; then
    echo ""
    echo "--- K8S 控制平面 ---"
    for component in kube-apiserver kube-controller-manager kube-scheduler; do
      if kubectl get pods -n kube-system -l component="$component" --no-headers 2>/dev/null | grep -q "Running"; then
        ok "$component Running"
      else
        warn "$component 未运行"
      fi
    done
  fi
fi

# === 资源检查 ===
echo ""
echo "--- 系统资源 ---"
if command -v free &>/dev/null; then
  MEM_TOTAL=$(free -g | awk '/^Mem:/{print $2}')
  MEM_AVAIL=$(free -g | awk '/^Mem:/{print $7}')
  if [ "$MEM_TOTAL" -ge 2 ]; then
    ok "总内存: ${MEM_TOTAL}GB（可用: ${MEM_AVAIL}GB）"
  else
    warn "总内存仅 ${MEM_TOTAL}GB，K3S 最低需要 1GB"
  fi
fi

if command -v nproc &>/dev/null; then
  CPU=$(nproc)
  if [ "$CPU" -ge 2 ]; then
    ok "CPU 核心: $CPU"
  else
    warn "仅 $CPU CPU 核心，K3S 最低需要 1"
  fi
fi

if command -v df &>/dev/null; then
  DISK=$(df -BG / | tail -1 | awk '{print $4}' | tr -d 'G')
  if [ "$DISK" -ge 10 ]; then
    ok "根分区可用空间: ${DISK}GB"
  else
    warn "根分区可用空间仅 ${DISK}GB，K3S 最低需要 8GB"
  fi
fi

# === 网络检查 ===
echo ""
echo "--- 网络 ---"
if command -v curl &>/dev/null; then
  if curl -sfm 5 https://get.k3s.io -o /dev/null 2>&1; then
    ok "K3S 安装 URL 可达"
  else
    warn "K3S 安装 URL 不可达（检查网络/防火墙）"
  fi
  if curl -sfm 5 https://registry-1.docker.io -o /dev/null 2>&1; then
    ok "Docker Hub 可达"
  else
    warn "Docker Hub 不可达（需配镜像加速）"
  fi
fi

# === 总结 ===
echo ""
echo "=== 总结 ==="
if [ "$FAIL" = "1" ]; then
  echo -e "${RED}验证失败！请修复 FAIL 项${NC}"
  exit 1
else
  echo -e "${GREEN}基础验证通过！${NC}"

  # 推荐下一步
  echo ""
  echo "推荐下一步："
  echo "  bash skills/deploy/scripts/env-setup.sh --yes  # 安装缺失的工具"
  echo "  bash skills/deploy/scripts/k3s-dev-setup.sh    # 启动 K3S 测试集群"
fi