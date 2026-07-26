# GitOps

GitOps = Git 仓库作为应用部署的单一事实源。Git commit 触发自动部署。

两个主流方案：**ArgoCD**（功能丰富，UI 友好）和 **Flux**（GitOps 工具链，CD 基金会项目）。

## ArgoCD（推荐）

### 安装

```bash
# 创建 namespace
kubectl create namespace argocd

# 安装（官方 manifest）
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# 验证
kubectl get pods -n argocd
# 所有 pod 应为 Running

# 暴露 UI（Ingress）
kubectl apply -f - << 'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argocd-server
  namespace: argocd
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: traefik
  tls:
  - hosts: [argocd.example.com]
    secretName: argocd-tls
  rules:
  - host: argocd.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service: {name: argocd-server, port: {number: 443}}
EOF

# 获取初始 admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

### App of Apps 模式（推荐）

App of Apps 用一个 root Application 管理所有 Application：

```yaml
# k8s/gitops/argocd-apps.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/myrepo
    targetRevision: main
    path: k8s/gitops/apps
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true                # 删除 Git 移除的资源
      selfHeal: true             # 偏离时自动同步
    syncOptions:
    - CreateNamespace=true
```

### 单个 Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp-backend
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/myrepo
    targetRevision: main
    path: k8s/overlays/prod
    # Helm 应用：
    # chart:
    #   spec:
    #     chart: myapp
    #     sourceRef: repoURL
    #     revision: "1.0.0"
  destination:
    server: https://kubernetes.default.svc
    namespace: myapp
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
    - CreateNamespace=true
    retry:
      limit: 5
      backoff:
        duration: 10s
        factor: 2
        maxDuration: 5m
```

### Kustomize 应用

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/myrepo
    targetRevision: main
    path: k8s/overlays/prod
  destination:
    server: https://kubernetes.default.svc
    namespace: myapp
  syncPolicy:
    automated: {prune: true, selfHeal: true}
```

### 私有 Git 仓库认证

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: github-creds
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repo-creds
stringData:
  url: https://github.com/myorg/private-repo
  username: git
  password: ghp_xxxxxxxxxxxx
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata: {name: my-private-app, namespace: argocd}
spec:
  source:
    repoURL: https://github.com/myorg/private-repo
    # 自动使用 github-creds Secret
```

### 多集群 Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet                        # ApplicationSet 模板
metadata:
  name: cluster-apps
  namespace: argocd
spec:
  generators:
  - list:
      items:
      - {cluster: prod-us, url: https://prod-us.example.com, enabled: "true"}
      - {cluster: prod-eu, url: https://prod-eu.example.com, enabled: "true"}
  template:
    metadata:
      name: 'myapp-{cluster}'
    spec:
      project: default
      source:
        repoURL: https://github.com/myorg/myrepo
        targetRevision: main
        path: k8s/overlays/prod
      destination:
        server: '{url}'
        namespace: myapp
      syncPolicy:
        automated: {prune: true, selfHeal: true}
```

---

## Flux（GitOps 工具链）

### 安装

```bash
# 安装 Flux CLI
curl -s https://fluxcd.io/install.sh | sudo bash

# bootstrap（连接 GitHub repo + 安装 Flux）
flux bootstrap github \
  --owner=myorg \
  --repository=myrepo \
  --branch=main \
  --path=k8s/clusters/prod \
  --personal
```

### GitRepository + Kustomization

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: myapp
  namespace: flux-system
spec:
  interval: 1m
  url: https://github.com/myorg/myrepo
  ref:
    branch: main
  secretRef:
    name: github-creds
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: myapp
  namespace: flux-system
spec:
  interval: 5m
  sourceRef:
    name: myapp
  path: ./k8s/overlays/prod
  prune: true
  wait: true
  timeout: 3m
  postBuild:
    substitute:
      cluster: prod
```

---

## Image Updater（自动镜像更新）

ArgoCD Image Updater 检测镜像更新并自动提交新版本到 Git：

```bash
# 安装
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj-labs/argocd-image-updater/stable/manifests/install.yaml

# 配置
metadata:
  annotations:
    argocd-image-updater.argoproj.io/image-list: myapp=harbor.example.com/myapp/backend
    argocd-image-updater.argoproj.io/myapp.update-strategy: newest
    argocd-image-updater.argoproj.io/write-back-method: git
argocd-image-updater.argoproj.io/git-branch: main
```

---

## GitOps 工作流

```
开发者 push 到 Git main branch
       ↓
GitHub Actions / GitLab CI：跑测试 + 构建镜像 + 推送到 harbor
       ↓
镜像版本写入 GitOps 仓库（k8s/overlays/prod/kustomization.yaml）
       ↓
ArgoCD/Flux 检测到 Git 变更
       ↓
自动 apply 到 K8S 集群（diff + sync）
       ↓
Sync 状态报告到 UI/Slack
       ↓
失败自动回滚（可选 ArgoCD Rollback）
```

---

## 渐进式发布（Progressive Delivery）

Argo Rollouts 替代 Deployment，支持蓝绿/金丝雀：

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: myapp-backend
  namespace: myapp
spec:
  replicas: 5
  selector:
    matchLabels: {app: myapp, component: backend}
  strategy:
    canary:
      steps:
      - setWeight: 10
      - pause: {duration: 5m}
      - setWeight: 30
      - pause: {duration: 5m}
      - setWeight: 50
      - pause: {duration: 10m}
      - setWeight: 100
      canaryService: myapp-backend-canary
      stableService: myapp-backend
  template:
    metadata:
      labels: {app: myapp, component: backend}
    spec:
      containers:
      - name: backend
        image: harbor.example.com/myapp/backend:v1.0.0
```

分析指标自动 promote/abort：

```yaml
- analysis:
    templates:
    - templateName: success-rate
    args:
    - name: service-name
      value: myapp-backend
---
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate
  namespace: myapp
spec:
  metrics:
  - name: success-rate
    interval: 60s
    successCondition: "result[0] >= 0.95"
    failureLimit: 5
    provider:
      prometheus:
        address: http://kube-prom-prometheus.monitoring:9090
        query: |
          sum(rate(http_requests_total{status!~"5..",namespace="myapp"}[5m]))
          /
          sum(rate(http_requests_total{namespace="myapp"}[5m]))
```

---

## 决策：ArgoCD vs Flux

| 维度 | ArgoCD | Flux |
|------|--------|------|
| UI | Web UI 漂亮 | 无内置 UI（用 Weave GitOps） |
| 多集群管理 | ApplicationSet | GitOpsEngine |
| 渐进式发布 | Argo Rollouts | Flagger |
| 学习曲线 | 较陡 | 较陡 |
| 社区 | 大 | 中 |
| CD 基金会 | ❌ | ✅ |

**推荐**：ArgoCD + Argo Rollouts（UI 友好，功能全）。Flux 在纯 GitOps 工具链场景下推荐。