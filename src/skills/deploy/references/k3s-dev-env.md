# K3S 测试集群（deployer 能构建的环境之一）

K3S 测试集群是 deployer 构建的**典型环境**。本节讲：为什么用 K3S、3 种构建方式、典型使用场景、与生产 HA 的差异。

## 为什么 K3S 是测试集群首选

```
真实 K8S 集群（生产）
├─ 最低要求：4GB RAM, 2 CPU
├─ 安装复杂：kubeadm + 证书 + etcd + 网络插件
├─ 资源占用：~3GB 控制平面
└─ 启动时间：~5 分钟

K3S（测试/小规模生产）
├─ 最低要求：512MB RAM, 1 CPU
├─ 安装简单：curl | sh
├─ 资源占用：~200MB（含 Traefik + local-path）
├─ 启动时间：~30 秒
└─ 完全 K8S API 兼容（用 kubectl 一样的命令）
```

**结论**：K3S 是测试集群的甜蜜点 —— API 全兼容、资源占用极低、安装一键完成。

---

## 3 种构建方式

### 方式 1：单服务器 K3S（最简单，推荐）

```bash
# 一键安装（开发/测试用，禁用 Traefik 用自定义 ingress）
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable=traefik" sh -

# 等 ~30 秒
sudo k3s kubectl get nodes
# NAME           STATUS   ROLES                       AGE   VERSION
# your-host      Ready    control-plane,etcd,master  30s   v1.30.x+k3s

# 配置客户端 kubeconfig
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config
export KUBECONFIG=~/.kube/config

# 验证
kubectl get nodes
kubectl get pods -A
```

### 方式 2：多节点 K3S（模拟生产拓扑）

```bash
# === 在 master-1 上 ===
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
  --cluster-init \
  --tls-san=10.0.0.10 \
  --disable=traefik" sh -

# 获取 join token
sudo cat /var/lib/rancher/k3s/server/node-token > /tmp/k3s-token

# === 在 master-2/master-3 上 ===
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
  --server https://10.0.0.10:6443 \
  --token $(cat /tmp/k3s-token) \
  --tls-san=10.0.0.10 \
  --disable=traefik" sh -

# === 在 worker 节点上 ===
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="agent \
  --server https://10.0.0.10:6443 \
  --token $(cat /tmp/k3s-token)" sh -

# 验证
kubectl get nodes
# NAME       STATUS   ROLES                       AGE   VERSION
# master-1   Ready    control-plane,etcd,master   5m    v1.30.x+k3s
# master-2   Ready    control-plane,etcd,master   3m    v1.30.x+k3s
# master-3   Ready    control-plane,etcd,master   2m    v1.30.x+k3s
# worker-1   Ready    <none>                      1m    v1.30.x+k3s
```

### 方式 3：K3D（Docker 中跑 K3S，最快）

```bash
# 安装 k3d
curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash

# 一键创建集群（用 Docker container 跑 K3S，秒级启动）
k3d cluster create myapp-test \
  --servers 1 \
  --agents 2 \
  --port "8080:80@loadbalancer" \
  --port "8443:443@loadbalancer" \
  --volume /tmp/myapp-data:/tmp/myapp-data@all

# 自动配置 kubeconfig（指向 k3d 内的 K3S）
kubectl get nodes
# NAME                 STATUS   ROLES                       AGE   VERSION
# k3d-myapp-test-server-0   Ready    control-plane,etcd,master   30s   v1.30.x+k3s
# k3d-myapp-test-agent-0    Ready    <none>                      20s   v1.30.x+k3s
# k3d-myapp-test-agent-1    Ready    <none>                      15s   v1.30.x+k3s

# 删除集群
k3d cluster delete myapp-test
```

**K3D vs 单服务器 K3S 对比**：

| 维度 | K3D | 单服务器 K3S |
|------|-----|-------------|
| 安装时间 | 5-10 秒 | 30-60 秒 |
| 资源占用 | Docker container 复用 | 独立 K3S 进程 |
| 网络隔离 | 容器内独立网络 | 主机网络 |
| 数据持久化 | volume mount | /var/lib/rancher/k3s |
| 适用 | CI/CD、GitHub Actions、本地快速测试 | 开发环境、需要模拟网络拓扑 |

---

## K3S 测试集群的典型用途

### 1. E2E 测试

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Setup K3S
      run: |
        curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable=traefik" sh -
        mkdir -p ~/.kube
        sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
        sudo chown $USER:$USER ~/.kube/config
    - name: Deploy app
      run: kubectl apply -f k8s/overlays/test/
    - name: Wait for ready
      run: kubectl wait --for=condition=ready pod -l app=myapp -n myapp --timeout=120s
    - name: Run tests
      run: |
        npm install
        npm run test:e2e
```

### 2. 本地开发（模拟生产部署）

```bash
# 开发环境用 K3D
k3d cluster create myapp-dev

# 部署应用到本地 K3S（用相同 manifests）
kubectl apply -f k8s/overlays/dev/

# 端口转发访问
kubectl port-forward svc/myapp-frontend 3000:80 -n myapp

# 修改代码 -> 镜像重建 -> 部署
docker build -t myapp:v1.0.0-dev .
k3d image import myapp:v1.0.0-dev -c myapp-dev
kubectl rollout restart deploy/myapp-backend -n myapp
```

### 3. CI/CD 中的 K3S（GitHub Actions）

```yaml
- name: Setup k3s
  uses: docker://rancher/k3s:latest
  with:
    args: server --disable=traefik --tls-san=localhost
  env:
    K3S_KUBECONFIG_OUTPUT: /tmp/kubeconfig
- name: Use K3s
  run: |
    echo "$K3S_KUBECONFIG" > /tmp/kubeconfig
    export KUBECONFIG=/tmp/kubeconfig
    kubectl get nodes
```

### 4. 教学/演示

```bash
# 学员机器上 30 秒启动
curl -sfL https://get.k3s.io | sh -

# 教学环境隔离（每个学员一个 namespace）
kubectl create namespace student-alice
kubectl create namespace student-bob
```

---

## 测试集群 vs 生产集群的差异

测试集群**故意**简化：

| 特性 | 测试集群 | 生产集群（Tier 2/3） |
|------|---------|---------------------|
| **master 数量** | 1 | 3（HA） |
| **etcd** | 嵌入式单节点 | 嵌入式集群 |
| **存储** | local-path | Longhorn（分布式） |
| **ingress** | 禁用/自定义 | Traefik + cert-manager |
| **网络策略** | 全部允许 | NetworkPolicy 限制 |
| **资源限制** | 无 | requests/limits 严格 |
| **镜像仓库** | 本地/公共 | 私有 Harbor |
| **备份** | 无 | etcd snapshot + Velero |
| **监控** | 可选 | Prometheus + Grafana |
| **日志** | docker logs | Loki |

测试集群就是用来"快速跑通"，生产集群需要"高可用 + 安全 + 可观测"。

---

## 工具生态

### kubectl（必备）

```bash
# 安装
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# 自动补全
echo 'source <(kubectl completion bash)' >> ~/.bashrc
alias k=kubectl
```

### Helm（包管理）

```bash
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh

# 添加常用 repo
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
```

### kubectx / kubens（多集群管理）

```bash
sudo apt install kubectx
# 切换 context
kubectx myapp-test
# 切换 namespace
kubens myapp
```

### k9s（终端 UI）

```bash
# macOS
brew install k9s

# 或下载
curl -sS https://webi.sh/k9s | sh

# 启动
k9s
```

### Stern（多 pod 日志）

```bash
# 安装
curl -L https://raw.githubusercontent.com/stern/stern/master/bin/stern_linux_amd64 -o stern
chmod +x stern && sudo mv stern /usr/local/bin/

# 用法
stern -n myapp myapp-backend    # 所有 myapp-backend pod 的日志，合并输出
```

---

## 常见问题

### kubectl connection refused

```bash
# 检查 K3S 状态
sudo systemctl status k3s

# 检查 kubeconfig
ls -la ~/.kube/config
cat ~/.kube/config | grep server

# 重新配置
sudo cat /etc/rancher/k3s/k3s.yaml > ~/.kube/config
```

### 镜像拉取失败

```bash
# 配镜像加速
sudo mkdir -p /etc/rancher/k3s
sudo tee /etc/rancher/k3s/registries.yaml << 'EOF'
mirrors:
  docker.io:
    endpoint:
      - "https://registry-mirror.example.com"
EOF

sudo systemctl restart k3s
```

### 资源不足（K3S 起不来）

```bash
# 检查内存
free -h

# K3S 最低需要 512MB RAM + 1 CPU
# 内存不够时禁用一些组件
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable=traefik,servicelb,metrics-server" sh -
```

### 重置 K3S（重新开始）

```bash
sudo /usr/local/sbin/k3s-uninstall.sh
# 重装
curl -sfL https://get.k3s.io | sh -
```