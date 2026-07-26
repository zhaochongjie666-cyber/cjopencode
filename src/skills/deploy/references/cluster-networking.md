# 集群网络

K3S 内置 Flannel VXLAN 默认网络 + Traefik ingress。本节讲：内网服务通信、Ingress 配置、TLS 证书、网络安全策略。

## 网络架构概览

```
外部用户
    │
    ▼
[Load Balancer / 公网 IP]
    │
    ▼
Ingress (Traefik)         <-- 外部访问入口
    │
    ├── app.example.com ──► Service (myapp-frontend:80) ──► Pods
    │
    └── api.example.com ──► Service (myapp-backend:8000) ──► Pods
                                 │
                                 │ (内网 Service)
                                 ▼
                              Service (postgres:5432) ──► Pods
                                 │
                                 ▼
                              Service (redis:6379) ──► Pods
```

---

## Service DNS

K8S 内置 CoreDNS，Pod 可通过 `<service-name>.<namespace>.svc.cluster.local` 访问其他 Service。

```bash
# Pod 内访问其他 Service（短格式，仅同 namespace）
curl http://myapp-backend:8000/healthz

# 跨 namespace
curl http://myapp-backend.myapp.svc.cluster.local:8000/healthz
```

---

## Traefik Ingress（K3S 默认）

K3S 默认安装 Traefik 作为 ingress controller。

### 基础 Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp
  namespace: myapp
spec:
  ingressClassName: traefik
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service: {name: myapp-backend, port: {number: 8000}}
      - path: /
        pathType: Prefix
        backend:
          service: {name: myapp-frontend, port: {number: 80}}
```

### HTTPS + 自动证书（cert-manager）

```bash
# 安装 cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.0/cert-manager.yaml

# 创建 ClusterIssuer
kubectl apply -f - << 'EOF'
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: traefik
EOF

# Ingress 加 annotation 自动签发 TLS
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp
  namespace: myapp
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: traefik
  tls:
  - hosts: [app.example.com]
    secretName: myapp-tls        # cert-manager 自动创建
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service: {name: myapp-frontend, port: {number: 80}}
```

### 自签名证书（内网/测试）

```bash
# 创建自签名证书
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout tls.key -out tls.crt \
  -subj "/CN=app.example.com"

# 创建 Kubernetes Secret
kubectl create secret tls myapp-tls \
  --cert=tls.crt --key=tls.key \
  -n myapp
```

---

## 多个 Ingress Controller

需要多个 ingress（如内部用 Traefik，外部用 Nginx Ingress）：

```bash
# 禁用 K3S 默认 Traefik
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable=traefik" sh -

# 安装 Nginx Ingress
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install nginx-ingress ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace

# Ingress 加 className
spec:
  ingressClassName: nginx
```

---

## MetalLB（LoadBalancer 服务）

K3S 自带 ServiceLB（servicelb），但功能有限。生产环境推荐 MetalLB：

```bash
# 安装
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.5/config/manifests/metallb-native.yaml

# 配置 IP 池
kubectl apply -f - << 'EOF'
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: production
  namespace: metallb-system
spec:
  addresses:
  - 192.168.1.200-192.168.1.250
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: production
  namespace: metallb-system
spec:
  ipAddressPools:
  - production
EOF

# LoadBalancer Service
apiVersion: v1
kind: Service
metadata:
  name: myapp-public
  namespace: myapp
spec:
  type: LoadBalancer
  selector: {app: myapp}
  ports:
  - port: 80
    targetPort: 80
```

---

## Network Policies（网络安全）

默认 K8S 所有 Pod 可互相通信。NetworkPolicy 可限制：

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: myapp-backend-netpol
  namespace: myapp
spec:
  podSelector:
    matchLabels:
      app: myapp
      component: backend
  policyTypes:
  - Ingress
  - Egress
  ingress:
  # 只允许来自 frontend 和 ingress 的流量
  - from:
    - podSelector:
        matchLabels:
          app: myapp
          component: frontend
    - namespaceSelector:
        matchLabels:
          name: ingress-traefik
    ports:
    - port: 8000
      protocol: TCP
  egress:
  # 只允许访问 postgres 和 redis
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - port: 5432
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - port: 6379
  # 允许 DNS
  - to:
    - namespaceSelector: {}
    ports:
    - port: 53
      protocol: UDP
```

> ⚠️ K3S 默认网络插件 Flannel **不强制执行 NetworkPolicy**。需要 Calico 或 Cilium 才会生效。

---

## Service Mesh（可选，Tier 3）

复杂微服务需要服务网格（mTLS、可观测、流量管理）。推荐 Linkerd（轻量）或 Istio（功能全）。

### Linkerd 安装

```bash
# 安装 CLI
curl -fsL https://run.linkerd.io/install | sh

# 安装 control plane
linkerd install --crds | kubectl apply -f -
linkerd install | kubectl apply -f -

# 注入应用到网格
kubectl get deploy myapp-backend -n myapp -o yaml | linkerd inject - | kubectl apply -f -
```

### Istio 安装

```bash
# 下载
curl -L https://istio.io/downloadIstio | sh -
cd istio-*
export PATH=$PWD/bin:$PATH

# 安装
istioctl install --set profile=demo -y

# 注入 namespace
kubectl label namespace myapp istio-injection=enabled
```

---

## 调试网络问题

```bash
# Pod 内调试
kubectl exec -it <pod-name> -n myapp -- sh

# 测试 DNS
nslookup myapp-backend.myapp.svc.cluster.local

# 测试连通性
wget -qO- http://myapp-backend:8000/healthz

# 查看 Ingress 路由
kubectl get ingress -n myapp -o yaml

# 查看 Service endpoints
kubectl get endpoints -n myapp myapp-backend

# Traefik 日志
kubectl logs -n kube-system -l app.kubernetes.io/name=traefik --tail=100

# 端口转发（本地调试）
kubectl port-forward svc/myapp-backend 8000:8000 -n myapp
```