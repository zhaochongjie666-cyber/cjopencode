# K3S 安装

K3S 是 CNCF 认证的轻量级 Kubernetes 发行版：单二进制、~70MB、~512MB RAM 起步、内置 Traefik ingress、嵌入式 etcd 选项。

## 单节点 K3S（开发/测试）

最小化安装（单 master，无 HA）：

```bash
curl -sfL https://get.k3s.io | sh -

# 安装完成后验证
sudo kubectl get nodes
sudo kubectl get pods -A

# kubeconfig 默认位置：/etc/rancher/k3s/k3s.yaml
# 用户访问需要：
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config
export KUBECONFIG=~/.kube/config
```

**禁用内置 Traefik（如要用自定义 ingress）**：
```bash
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable=traefik" sh -
```

**禁用所有默认 addon**：
```bash
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable=traefik,servicelb,local-storage,metrics-server" sh -
```

## 多节点 K3S（生产）

### 架构

```
master-1 (server)    master-2 (server)    master-3 (server)
    │                    │                    │
    └────── embedded etcd cluster ──────────────┘
                          │
            ┌─────────────┼─────────────┐
            │             │             │
        worker-1     worker-2     worker-3
```

### 步骤 1：初始化第一个 master（带 --cluster-init）

```bash
# 在 master-1 上执行
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
  --cluster-init \
  --tls-san=<LOAD_BALANCER_IP_OR_DNS> \
  --disable=traefik" sh -

# 等待 etcd 集群就绪（约 30 秒）
sudo kubectl get nodes  # master-1 应为 Ready
sudo kubectl get pods -n kube-system  # 所有 pod Running

# 获取 join token
sudo cat /var/lib/rancher/k3s/server/node-token
# 输出类似：K10c0a7c...::server:<hash>
```

### 步骤 2：加入其他 master 节点

```bash
# 在 master-2 上执行
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
  --server https://<master-1-ip>:6443 \
  --token <NODE_TOKEN> \
  --tls-san=<LOAD_BALANCER_IP_OR_DNS>" sh -

# 在 master-3 上执行同样的命令
```

### 步骤 3：加入 worker 节点

worker 加入用 `agent` 模式：

```bash
# 在 worker 节点上执行
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="agent \
  --server https://<master-1-ip>:6443 \
  --token <NODE_TOKEN>" sh -
```

### 步骤 4：验证集群

```bash
# 在任一 master 上执行
sudo kubectl get nodes -o wide
# NAME       STATUS   ROLES                       AGE   VERSION
# master-1   Ready    control-plane,etcd,master   5m    v1.30.x+k3s
# master-2   Ready    control-plane,etcd,master   3m    v1.30.x+k3s
# master-3   Ready    control-plane,etcd,master   2m    v1.30.x+k3s
# worker-1   Ready    <none>                      1m    v1.30.x+k3s

sudo kubectl get pods -A
```

## K3S 配置（config.yaml）

主配置文件 `/etc/rancher/k3s/config.yaml`：

```yaml
# === 网络 ===
cluster-cidr: 10.42.0.0/16          # Pod 网络
service-cidr: 10.43.0.0/16          # Service 网络
cluster-dns: 10.43.0.10
cluster-domain: cluster.local

# === 数据库（embedded etcd 默认）===
datastore-endpoint: etcd  # 嵌入式 etcd
# 或外置：
# datastore-endpoint: "postgres://user:pass@host:5432/dbname?sslmode=disable"

# === 网络插件 ===
flannel-backend: vxlan              # 默认 vxlan；host-gw 性能更好但需要 L2
# 或用 Calico：
# --flannel-backend=none --disable-network-policy
# --cluster-cidr=192.168.0.0/16
# 然后手动安装 Calico

# === 启用/禁用组件 ===
disable:
  - traefik                          # 用自定义 ingress
  - servicelb                        # 用 MetalLB 替代
  - local-storage                    # 用 Longhorn
  - metrics-server                    # 用 Prometheus 自带的

# === Node 标签和污点 ===
node-label:
  - "node.kubernetes.io/role=worker"
node-taint:
  - "CriticalAddonsOnly=true:NoExecute"

# === Server 节点配置 ===
tls-san:
  - "k3s.example.com"
  - "192.168.1.100"
```

## 镜像仓库配置

私有仓库（推荐用 K3S registries.yaml）：

```bash
sudo mkdir -p /etc/rancher/k3s
sudo tee /etc/rancher/k3s/registries.yaml << 'EOF'
mirrors:
  docker.io:
    endpoint:
      - "https://registry-mirror.example.com"
  harbor.example.com:
    endpoint:
      - "https://harbor.example.com"

configs:
  "harbor.example.com":
    auth:
      username: "admin"
      password: "CHANGE_ME"
    tls:
      insecure_skip_verify: false
EOF

sudo systemctl restart k3s
```

## K3S 卸载

```bash
# 单节点
/usr/local/sbin/k3s-uninstall.sh

# 多节点（每个节点执行）
/usr/local/sbin/k3s-agent-uninstall.sh   # worker
/usr/local/sbin/k3s-server-uninstall.sh  # master
```

## 常见问题

### kubeconfig 权限

```bash
# 让非 root 用户能访问
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config

# 或者给文件加组读权限
sudo chmod 644 /etc/rancher/k3s/k3s.yaml
```

### 节点 NotReady

```bash
# 查看节点详情
sudo kubectl describe node <node-name>

# 常见原因：网络不通、token 错误、时间不同步
sudo systemctl status k3s       # master
sudo systemctl status k3s-agent  # worker
```

### 镜像拉取失败

```bash
# 检查 registries.yaml
sudo cat /etc/rancher/k3s/registries.yaml

# 测试拉取
sudo ctr -n k8s.io images pull harbor.example.com/myapp:v1.0.0

# 配镜像加速（daemon.json）
sudo tee /etc/docker/daemon.json << 'EOF'
{
  "registry-mirrors": ["https://registry-mirror.example.com"]
}
EOF
sudo systemctl restart docker
```

### 资源不足

K3S 最低要求：
- Master: 1 CPU, 1GB RAM, 8GB disk
- Worker: 1 CPU, 512MB RAM, 8GB disk
- HA cluster (3 masters): 3 CPU, 4GB RAM, 30GB disk