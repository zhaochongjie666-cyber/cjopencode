#!/usr/bin/env bash
# deploy-k8s.sh - 应用 K8S manifests 到集群
# 用法: bash skills/deploy/scripts/deploy-k8s.sh [path] [--namespace=NAME] [--dry-run] [--prune]
#
# path: K8S manifests 目录（默认 ./k8s）
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err() { echo -e "${RED}[ERR]${NC} $*"; exit 1; }

# === 默认参数 ===
PATH_DIR="./k8s"
NAMESPACE=""
DRY_RUN=false
PRUNE=false
KUSTOMIZE=false

# === 智能检测 manifests 路径 ===
detect_path() {
  # 标准 deployer 产物位置
  for candidate in "./k8s" "./deploy/k8s" "./manifests" "./kubernetes" \
                   "./k8s/overlays/prod" "./k8s/overlays/dev" \
                   "./deploy/prod" "./deploy"; do
    if [ -d "$candidate" ] || [ -f "$candidate/kustomization.yaml" ] || [ -f "$candidate/Chart.yaml" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

# === 解析参数 ===
while [ $# -gt 0 ]; do
  case "$1" in
  --namespace=*)
    NAMESPACE="${1#*=}"
    shift
    ;;
  --dry-run)
    DRY_RUN=true
    shift
    ;;
  --prune)
    PRUNE=true
    shift
    ;;
  --auto|-a)
    AUTO_DETECT=true
    shift
    ;;
  --help|-h)
    echo "Usage: $0 [path|--auto] [--namespace=NAME] [--dry-run] [--prune]"
    echo ""
    echo "Arguments:"
    echo "  path              Path to K8S manifests (default: ./k8s)"
    echo "  --auto, -a        Auto-detect manifests path in standard locations"
    echo ""
    echo "Options:"
    echo "  --namespace=NAME  Set namespace (overrides manifests)"
    echo "  --dry-run         Show what would be applied without applying"
    echo "  --prune           Delete resources not in the manifests"
    exit 0
    ;;
  *)
    PATH_DIR="$1"
    shift
    ;;
  esac
done

# === 智能检测路径（如果未显式指定） ===
if [ "$PATH_DIR" = "./k8s" ] && [ ! -d "./k8s" ]; then
  DETECTED=$(detect_path)
  if [ -n "$DETECTED" ]; then
    log "自动检测到 manifests 路径: $DETECTED"
    PATH_DIR="$DETECTED"
  fi
fi

# === 检查 kubectl ===
command -v kubectl &>/dev/null || err "kubectl not installed"
command -v kubectl &>/dev/null && kubectl version --client &>/dev/null || true

# === 检查上下文 ===
log "=== 当前 K8S 上下文 ==="
kubectl config current-context
kubectl cluster-info 2>&1 | head -3
echo ""

# === 检查 manifests ===
if [ ! -d "$PATH_DIR" ] && [ ! -f "$PATH_DIR" ]; then
  err "Path not found: $PATH_DIR"
fi

if [ -f "$PATH_DIR/kustomization.yaml" ]; then
  KUSTOMIZE=true
  log "Detected Kustomize at $PATH_DIR/kustomization.yaml"
elif [ -f "$PATH_DIR/Chart.yaml" ]; then
  err "Detected Helm chart. Use 'helm install/upgrade' directly, not kubectl apply"
fi

# === 构建 apply 命令 ===
APPLY_ARGS=()

if [ -n "$NAMESPACE" ]; then
  APPLY_ARGS+=("--namespace=$NAMESPACE")
fi

if [ "$DRY_RUN" = true ]; then
  APPLY_ARGS+=("--dry-run=client" "-o" "yaml")
fi

if [ "$PRUNE" = true ]; then
  APPLY_ARGS+=("--prune" "-l" "app.kubernetes.io/managed-by=deploy-k8s.sh")
fi

# === 应用 ===
if [ "$KUSTOMIZE" = true ]; then
  log "=== Kustomize apply ==="
  kubectl apply -k "$PATH_DIR" "${APPLY_ARGS[@]}"
else
  log "=== kubectl apply (recursive) ==="
  kubectl apply -f "$PATH_DIR" "${APPLY_ARGS[@]}"
fi

# === 等待 ready ===
if [ "$DRY_RUN" = false ]; then
  log "=== 等待 Deployments ready ==="
  TIMEOUT=300
  INTERVAL=10
  ELAPSED=0
  while [ $ELAPSED -lt $TIMEOUT ]; do
    NOT_READY=$(kubectl get deployments --all-namespaces --no-headers 2>/dev/null | \
      awk '{print $1, $2, $4, $5}' | \
      awk '$3 != $4 || $3 == "<unknown>"' | head -1)

    if [ -z "$NOT_READY" ]; then
      log "All deployments ready."
      break
    fi
    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
    printf "."
  done
  echo ""

  if [ $ELAPSED -ge $TIMEOUT ]; then
    warn "Timeout waiting for deployments. Check status with:"
    warn "  kubectl get deployments --all-namespaces"
  fi

  # 显示状态
  log "=== 部署状态 ==="
  if [ -n "$NAMESPACE" ]; then
    kubectl get all -n "$NAMESPACE"
  else
    kubectl get all --all-namespaces | grep -v "kube-system\|kube-public\|kube-node-lease\|local-path-storage\|monitoring\|argocd\|flux-system" || true
  fi
fi

log "=== 完成 ==="
[ "$DRY_RUN" = true ] && log "(dry-run 模式，无实际变更)"
log "查看 pods: kubectl get pods -n ${NAMESPACE:-<namespace>}"
log "查看 logs: kubectl logs -n <ns> <pod>"