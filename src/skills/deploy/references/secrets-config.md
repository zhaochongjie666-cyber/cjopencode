# Secret 与 ConfigMap

K8S 配置注入机制：ConfigMap（非敏感）+ Secret（敏感）。生产环境用 External Secrets + Vault 替代裸 Secret。

## ConfigMap

### 创建方式

```bash
# 命令行
kubectl create configmap myapp-config \
  --from-file=app.properties \
  --from-literal=log-level=info \
  -n myapp

# YAML 声明
```

### YAML 模板

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: myapp-config
  namespace: myapp
data:
  # 字面量
  log-level: "info"
  max-connections: "100"
  # 整个文件
  app.properties: |
    server.port=8080
    server.host=0.0.0.0
  # JSON 字符串
  feature-flags: '{"newUI":true,"betaAPI":false}'
binaryData:
  # 二进制内容（base64 编码）
  cert.pem: LS0tLS1CRUdJTi...
```

### Pod 中使用

```yaml
env:
- name: LOG_LEVEL
  valueFrom:
    configMapKeyRef:
      name: myapp-config
      key: log-level

envFrom:
- configMapRef:
    name: myapp-config
    optional: false

volumeMounts:
- name: config
  mountPath: /etc/myapp/config
volumes:
- name: config
  configMap:
    name: myapp-config
    items:
    - key: app.properties
      path: application.properties
```

---

## Secret

### 类型

| 类型 | 说明 |
|------|------|
| `Opaque` | 默认，任意键值对 |
| `kubernetes.io/tls` | TLS 证书 |
| `kubernetes.io/dockerconfigjson` | 镜像仓库认证 |
| `kubernetes.io/service-account-token` | ServiceAccount token |

### 创建方式

```bash
# 命令行（base64 自动编码）
kubectl create secret generic myapp-secrets \
  --from-literal=database-url='postgresql://user:pass@host/db' \
  --from-literal=jwt-secret='change-me-32-bytes-random' \
  -n myapp

# TLS 证书
kubectl create secret tls myapp-tls \
  --cert=tls.crt --key=tls.key \
  -n myapp

# Docker registry 认证
kubectl create secret docker-registry harbor-pull-secret \
  --docker-server=harbor.example.com \
  --docker-username=admin \
  --docker-password=password \
  -n myapp
```

### YAML 模板（Opaque）

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: myapp-secrets
  namespace: myapp
type: Opaque
stringData:
  # 自动 base64 编码（推荐）
  database-url: "postgresql://myapp:CHANGE_ME@postgres:5432/myapp"
  jwt-secret: "CHANGE_ME_TO_32_BYTES_RANDOM"
data:
  # 手动 base64 编码（echo -n "value" | base64）
  redis-url: cmVkaXM6Ly9yZWRpczo2Mzc5LzA=
```

### Pod 中使用

```yaml
env:
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: myapp-secrets
      key: database-url
envFrom:
- secretRef:
    name: myapp-secrets
imagePullSecrets:
- name: harbor-pull-secret
volumeMounts:
- name: tls
  mountPath: /etc/tls
  readOnly: true
volumes:
- name: tls
  secret:
    secretName: myapp-tls
```

---

## ⚠️ Secret 不安全

**K8S Secret 默认只是 base64 编码，不是加密**：
- 任何能读 Secret 的用户都能解出原始值
- 默认存储在 etcd 中（K3S embedded etcd），可以读出来
- 不要把真实密钥 commit 到 Git

生产环境必须用 **External Secrets Operator (ESO)** + **Vault/AWS Secrets Manager/GCP Secret Manager**。

---

## Sealed Secrets（GitOps 友好）

Sealed Secrets 由 Bitnami 开发，Secret 用非对称加密，只能在特定集群解密：

```bash
# 安装 controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# 安装 kubeseal CLI
brew install kubeseal  # macOS
# 或下载 release binary

# 加密 Secret
kubectl create secret generic myapp-secrets \
  --from-literal=api-key=real-secret \
  --dry-run=client -o yaml > my-secret.yaml
kubeseal --controller-name=sealed-secrets --controller-namespace=kube-system \
  -o yaml < my-secret.yaml > my-secret-sealed.yaml

# 应用 SealedSecret（Git 仓库里放这个）
kubectl apply -f my-secret-sealed.yaml

# Controller 自动解密并创建原 Secret
```

Git 仓库里只有 `my-secret-sealed.yaml`，无法被外部解密，但能在集群内还原。

---

## External Secrets Operator（推荐）

ESO 从外部 secret manager 同步到 K8S Secret：

```bash
# 安装
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace

# 配置 Vault/云厂商 SecretStore
kubectl apply -f - << 'EOF'
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: vault-backend
  namespace: myapp
spec:
  provider:
    vault:
      server: "https://vault.example.com"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "myapp"
          serviceAccountRef:
            name: "myapp"
EOF

# 同步配置
kubectl apply -f - << 'EOF'
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: myapp-secrets
  namespace: myapp
spec:
  refreshInterval: 60s
  secretStoreRef:
    name: vault-backend
    kind: SecretStore
  target:
    name: myapp-secrets
  data:
  - secretKey: database-url
    remoteRef:
      key: myapp/database
      property: url
  - secretKey: jwt-secret
    remoteRef:
      key: myapp/auth
      property: jwt-secret
EOF
```

### AWS Secrets Manager

```yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-sm
  namespace: myapp
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: myapp
```

### GCP Secret Manager

```yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: gcp-sm
  namespace: myapp
spec:
  provider:
    gcpsm:
      projectID: my-gcp-project
      auth:
        workloadIdentity:
          serviceAccountRef:
            name: myapp
```

---

## 密钥管理决策树

```
需要存密钥?
├── 否 -> 用 ConfigMap
└── 是
    ├── 密钥在 GitOps 仓库?
    │   ├── 否 -> 用 K8S Secret + 手动 kubectl create
    │   └── 是
    │       ├── 集群唯一 -> 用 Sealed Secrets（kubeseal 加密）
    │       └── 多集群共享 -> 用 External Secrets + Vault/云 SM
    └── 需要自动轮转?
        └── 是 -> 必须用 External Secrets + 支持轮转的后端
```

---

## 常见问题

### Secret 更新后 Pod 不生效

```bash
# K8S 不会自动重启 Pod 加载新 Secret
# 方法 1：手动重启
kubectl rollout restart deploy myapp-backend -n myapp

# 方法 2：用 Reloader 自动检测变更
helm install reloader stakater/reloader --namespace reloader --create-namespace
# 加 annotation 启用自动 reload
# metadata:
#   annotations:
#     reloader.stakater.com/auto: "true"
```

### base64 编码容易解码

```bash
echo "cG9zdGdyZXM6Ly91c2VyOnBhc3NAaG9zdC9kYg==" | base64 -d
# 输出明文：postgresql://user:pass@host/db
```

→ 生产环境必须加密（Sealed Secrets / Vault），不要用裸 K8S Secret 存敏感数据。

### ConfigMap 大小限制

K8S ConfigMap 总大小限制 1MB（etcd 限制）。大配置应该：
- 拆成多个 ConfigMap
- 用 initContainer 从外部 URL 下载
- 用 NFS / S3 挂载配置文件目录