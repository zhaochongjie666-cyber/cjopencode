# K8S Manifests 模板

K3S 兼容标准 K8S API。生成的核心资源：Namespace, Deployment, Service, Ingress, ConfigMap, Secret, PVC, ServiceAccount, HPA。

## 完整项目结构

```
项目根/k8s/
├── namespace.yaml           # 命名空间
├── deployment.yaml         # 应用部署
├── service.yaml            # 服务暴露（ClusterIP）
├── ingress.yaml            # 外部访问（Traefik）
├── configmap.yaml          # 配置
├── secret.yaml             # 密钥（base64 编码）
├── pvc.yaml                # 持久化存储声明
├── serviceaccount.yaml     # 服务账户
├── hpa.yaml                # 自动扩缩容
└── kustomization.yaml      # 可选：Kustomize 入口
```

---

## Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: myapp
  labels:
    app: myapp
    environment: prod
```

---

## Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-backend
  namespace: myapp
  labels:
    app: myapp
    component: backend
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1           # 滚动更新时最多多 1 个 pod
      maxUnavailable: 0     # 滚动更新时不可用 pod 数（0 = 不停服）
  selector:
    matchLabels:
      app: myapp
      component: backend
  template:
    metadata:
      labels:
        app: myapp
        component: backend
      annotations:
        prometheus.io/scrape: "true"      # Prometheus 自动抓取
        prometheus.io/port: "8000"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: myapp
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
      - name: backend
        image: harbor.example.com/myapp/backend:v1.0.0
        imagePullPolicy: IfNotPresent
        ports:
        - name: http
          containerPort: 8000
          protocol: TCP
        env:
        # 从 Secret 注入
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: myapp-secrets
              key: database-url
        # 从 ConfigMap 注入
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: myapp-config
              key: log-level
        # 直接环境变量（不推荐敏感信息）
        - name: BACKEND_PORT
          value: "8000"
        resources:
          requests:
            cpu: "100m"
            memory: "128Mi"
          limits:
            cpu: "500m"
            memory: "512Mi"
        livenessProbe:
          httpGet:
            path: /healthz
            port: http
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 3
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: http
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
        startupProbe:
          httpGet:
            path: /healthz
            port: http
          failureThreshold: 30
          periodSeconds: 5
        volumeMounts:
        - name: data
          mountPath: /app/data
        - name: tmp
          mountPath: /tmp
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: myapp-data
      - name: tmp
        emptyDir: {}
      terminationGracePeriodSeconds: 30
```

### 前端 Deployment（多阶段构建 + Nginx）

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-frontend
  namespace: myapp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: myapp
      component: frontend
  template:
    metadata:
      labels:
        app: myapp
        component: frontend
    spec:
      containers:
      - name: frontend
        image: harbor.example.com/myapp/frontend:v1.0.0
        ports:
        - name: http
          containerPort: 80
        resources:
          requests:
            cpu: "50m"
            memory: "64Mi"
          limits:
            cpu: "200m"
            memory: "256Mi"
        livenessProbe:
          httpGet:
            path: /
            port: http
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /
            port: http
          periodSeconds: 5
```

---

## Service

### ClusterIP（集群内通信）

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-backend
  namespace: myapp
spec:
  type: ClusterIP
  selector:
    app: myapp
    component: backend
  ports:
  - name: http
    port: 8000            # Service 端口（集群内）
    targetPort: http      # Pod 端口
    protocol: TCP
```

### Headless Service（StatefulSet 用）

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-db
  namespace: myapp
spec:
  clusterIP: None         # Headless
  selector:
    app: myapp
    component: db
  ports:
  - port: 5432
    targetPort: 5432
```

---

## Ingress（外部访问）

K3S 默认带 Traefik。Ingress 配置：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp
  namespace: myapp
  annotations:
    # cert-manager 自动签发 TLS
    cert-manager.io/cluster-issuer: letsencrypt-prod
    # Traefik 重定向 HTTP -> HTTPS
    traefik.ingress.kubernetes.io/redirect-entry-point: https
    # 后端协议
    traefik.ingress.kubernetes.io/service.serversscheme: http
spec:
  ingressClassName: traefik
  tls:
  - hosts:
    - app.example.com
    secretName: myapp-tls
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: myapp-backend
            port:
              number: 8000
      - path: /
        pathType: Prefix
        backend:
          service:
            name: myapp-frontend
            port:
              number: 80
```

### 多域名 Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-multi
  namespace: myapp
spec:
  ingressClassName: traefik
  tls:
  - hosts: [api.example.com]
    secretName: api-tls
  - hosts: [app.example.com]
    secretName: app-tls
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service: {name: myapp-backend, port: {number: 8000}}
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service: {name: myapp-frontend, port: {number: 80}}
```

---

## ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: myapp-config
  namespace: myapp
data:
  log-level: "info"
  max-connections: "100"
  feature-flags: |
    {
      "newUI": true,
      "betaAPI": false
    }
```

---

## Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: myapp-secrets
  namespace: myapp
type: Opaque
data:
  # base64 编码（echo -n "value" | base64）
  database-url: cG9zdGdyZXM6Ly91c2VyOnBhc3NAMTAuMC4wLjEvZGI=
  jwt-secret: Y2hhbmdlbWVfaW5fcHJvZHVjdGlvbg==
```

> ⚠️ Secret 用 base64（**不是加密**）。生产环境用 External Secrets + Vault 替代（见 `secrets-config.md`）。

---

## PersistentVolumeClaim

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: myapp-data
  namespace: myapp
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: longhorn
  resources:
    requests:
      storage: 10Gi
```

---

## ServiceAccount + RBAC

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: myapp
  namespace: myapp
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: myapp-role
  namespace: myapp
rules:
- apiGroups: [""]
  resources: ["configmaps", "secrets"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: myapp-rolebinding
  namespace: myapp
subjects:
- kind: ServiceAccount
  name: myapp
  namespace: myapp
roleRef:
  kind: Role
  name: myapp-role
  apiGroup: rbac.authorization.k8s.io
```

---

## Kustomize（多环境管理）

```yaml
# k8s/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: myapp
resources:
- namespace.yaml
- deployment.yaml
- service.yaml
- ingress.yaml
- configmap.yaml
- secret.yaml
- pvc.yaml
- serviceaccount.yaml

# 多环境覆盖
# overlays/prod/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: myapp-prod
resources:
- ../../base
namePrefix: prod-
patches:
- patch.yaml
```

---

## 部署命令

```bash
# 一次性应用
kubectl apply -f k8s/

# 分文件应用
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# Kustomize 构建预览
kubectl kustomize k8s/

# Kustomize 应用
kubectl apply -k k8s/overlays/prod/

# 删除
kubectl delete -f k8s/
```