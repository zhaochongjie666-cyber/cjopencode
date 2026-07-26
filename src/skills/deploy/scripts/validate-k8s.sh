#!/usr/bin/env bash
# validate-k8s.sh - 验证 K8S 部署的正确性
# 用法: bash skills/deploy/scripts/validate-k8s.sh [namespace]
# 默认检查所有 namespace
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok() { echo -e "${GREEN}[OK]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; FAIL=1; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
FAIL=0

NAMESPACE="${1:-}"

# === 工具检查 ===
command -v kubectl &>/dev/null || { echo "kubectl not installed"; exit 1; }

echo "=== K8S 部署验证 ==="
echo ""

# === 集群连通性 ===
echo "--- 集群连通性 ---"
if kubectl cluster-info &>/dev/null; then
  ok "集群连通"
else
  fail "无法连接集群，检查 kubeconfig"
fi

# === 节点状态 ===
echo ""
echo "--- 节点状态 ---"
TOTAL=$(kubectl get nodes --no-headers | wc -l)
READY=$(kubectl get nodes --no-headers | grep -c " Ready")
NOT_READY_NODES=$(kubectl get nodes --no-headers | grep -v " Ready")

if [ "$READY" -eq "$TOTAL" ]; then
  ok "所有 $TOTAL 个节点 Ready"
else
  fail "$((TOTAL - READY)) 个节点 NotReady:"
  echo "$NOT_READY_NODES" | sed 's/^/    /'
fi

# === 控制平面组件 ===
echo ""
echo "--- 控制平面 ---"
for component in kube-apiserver kube-controller-manager kube-scheduler; do
  if kubectl get pods -n kube-system -l component="$component" --no-headers 2>/dev/null | grep -q "Running"; then
    ok "$component Running"
  else
    fail "$component 未运行"
  fi
done

# === Pod 健康检查 ===
echo ""
echo "--- Pod 健康 ---"
NS_FLAG=""
[ -n "$NAMESPACE" ] && NS_FLAG="-n $NAMESPACE"

# CrashLoopBackOff
CRASHING=$(kubectl get pods $NS_FLAG --no-headers 2>/dev/null | grep -E "CrashLoopBackOff|Error|ImagePullBackOff" | head -5)
if [ -z "$CRASHING" ]; then
  ok "无 CrashLoopBackOff/Error pod"
else
  fail "发现异常 pod:"
  echo "$CRASHING" | sed 's/^/    /'
fi

# NotReady pod (跳过 kube-system 等)
NOT_READY_PODS=$(kubectl get pods $NS_FLAG --no-headers 2>/dev/null | \
  grep -v "kube-system\|kube-public\|monitoring\|argocd\|flux-system\|local-path-storage" | \
  awk '$3 != "Running" && $3 != "Completed" && $3 != "Succeeded"' | head -10)

if [ -z "$NOT_READY_PODS" ]; then
  ok "应用 pod 全部 Running/Completed"
else
  warn "未就绪 pod（运行中或 Pending）："
  echo "$NOT_READY_PODS" | sed 's/^/    /'
fi

# === Deployments ===
echo ""
echo "--- Deployments ---"
DEPLOYS=$(kubectl get deployments $NS_FLAG --no-headers 2>/dev/null)
if [ -n "$DEPLOYS" ]; then
  TOTAL_D=$(echo "$DEPLOYS" | wc -l)
  READY_D=$(echo "$DEPLOYS" | awk '$2 == $3 {print}' | wc -l)
  if [ "$READY_D" -eq "$TOTAL_D" ]; then
    ok "所有 $TOTAL_D 个 Deployments ready ($READY_D/$TOTAL_D)"
  else
    fail "$((TOTAL_D - READY_D))/$TOTAL_D Deployments 未就绪"
  fi
else
  warn "无 Deployments"
fi

# === Services ===
echo ""
echo "--- Services ---"
SERVICES=$(kubectl get services $NS_FLAG --no-headers 2>/dev/null | grep -v "ClusterIP")
if [ -n "$SERVICES" ]; then
  while read -r svc; do
    NAME=$(echo "$svc" | awk '{print $1}')
    TYPE=$(echo "$svc" | awk '{print $3}')
    ENDPOINTS=$(kubectl get endpoints "$NAME" ${NAMESPACE:+-n $NAMESPACE} -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null)
    if [ -n "$ENDPOINTS" ]; then
      ok "Service $NAME ($TYPE) 有 $(( $(echo "$ENDPOINTS" | wc -w) )) 个 endpoint"
    else
      fail "Service $NAME ($TYPE) 无 endpoint（Selector 不匹配？）"
    fi
  done <<< "$SERVICES"
else
  warn "无外部 Services（LoadBalancer/NodePort）"
fi

# === Ingress ===
echo ""
echo "--- Ingress ---"
INGRESSES=$(kubectl get ingress $NS_FLAG --no-headers 2>/dev/null)
if [ -n "$INGRESSES" ]; then
  while read -r ing; do
    NAME=$(echo "$ing" | awk '{print $1}')
    HOST=$(echo "$ing" | awk '{print $3}')
    CLASS=$(kubectl get ingress "$NAME" ${NAMESPACE:+-n $NAMESPACE} -o jsonpath='{.spec.ingressClassName}' 2>/dev/null)
    if [ -n "$CLASS" ]; then
      ok "Ingress $NAME class=$CLASS host=$HOST"
    else
      warn "Ingress $NAME 未指定 ingressClassName"
    fi
  done <<< "$INGRESSES"

  # 检查 Ingress controller 是否运行
  if kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik --no-headers 2>/dev/null | grep -q "Running"; then
    ok "Traefik Ingress controller 运行中"
  elif kubectl get pods -A -l app.kubernetes.io/name=ingress-nginx --no-headers 2>/dev/null | grep -q "Running"; then
    ok "Nginx Ingress controller 运行中"
  else
    fail "未检测到运行中的 Ingress controller"
  fi
fi

# === PVC ===
echo ""
echo "--- PersistentVolumeClaims ---"
PVCS=$(kubectl get pvc $NS_FLAG --no-headers 2>/dev/null)
if [ -n "$PVCS" ]; then
  TOTAL_PVC=$(echo "$PVCS" | wc -l)
  BOUND_PVC=$(echo "$PVCS" | grep -c "Bound")
  if [ "$BOUND_PVC" -eq "$TOTAL_PVC" ]; then
    ok "所有 $TOTAL_PVC 个 PVC Bound"
  else
    fail "$((TOTAL_PVC - BOUND_PVC))/$TOTAL_PVC PVC 未 Bound"
    kubectl get pvc $NS_FLAG --no-headers | grep -v "Bound" | sed 's/^/    /'
  fi
else
  warn "无 PVC"
fi

# === HPA ===
echo ""
echo "--- HPA ---"
HPAS=$(kubectl get hpa $NS_FLAG --no-headers 2>/dev/null)
if [ -n "$HPAS" ]; then
  ok "$(echo "$HPAS" | wc -l) 个 HPA 配置"
  echo "$HPAS" | head -5 | sed 's/^/    /'
else
  warn "无 HPA（无自动扩缩容）"
fi

# === Secrets (检查是否硬编码敏感信息)===
echo ""
echo "--- Secrets ---"
SECRETS=$(kubectl get secrets $NS_FLAG --no-headers 2>/dev/null)
if [ -n "$SECRETS" ]; then
  TOTAL_S=$(echo "$SECRETS" | wc -l)
  ok "$TOTAL_S 个 Secrets"
  # 检查是否有可疑 base64 内容（如 password=changeme）
  SUSPICIOUS=$(echo "$SECRETS" | awk '{print $1}' | head -10 | while read s; do
    DATA=$(kubectl get secret "$s" ${NAMESPACE:+-n $NAMESPACE} -o jsonpath='{.data}' 2>/dev/null)
    if echo "$DATA" | grep -qi "changeme\|password123\|admin123"; then
      echo "$s"
    fi
  done)
  if [ -n "$SUSPICIOUS" ]; then
    warn "Secrets 含可疑占位值（changeme/password123）："
    echo "$SUSPICIOUS" | sed 's/^/    /'
  fi
fi

# === Network Policies ===
echo ""
echo "--- Network Policies ---"
NETPOLS=$(kubectl get networkpolicies $NS_FLAG --no-headers 2>/dev/null)
if [ -n "$NETPOLS" ]; then
  ok "$(echo "$NETPOLS" | wc -l) 个 NetworkPolicies"
else
  warn "无 Network Policies（默认全 Pod 可互相通信）"
fi

# === 资源使用 ===
echo ""
echo "--- 资源使用 ---"
kubectl top nodes 2>/dev/null | head -5 || warn "metrics-server 未安装，跳过资源检查"

# === 总结 ===
echo ""
echo "=== 总结 ==="
if [ "$FAIL" = "1" ]; then
  echo -e "${RED}验证失败！请修复上述 FAIL 项${NC}"
  exit 1
else
  echo -e "${GREEN}验证通过！${NC}"
  echo ""
  echo "建议检查："
  echo "  kubectl get events --sort-by='.lastTimestamp' ${NAMESPACE:+-n $NAMESPACE}"
  echo "  kubectl logs -n <ns> <pod> --previous  # 查看崩溃 Pod 日志"
fi