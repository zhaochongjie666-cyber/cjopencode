# K3S HA 集群

生产环境需要 K3S master 节点 HA。K3S 用嵌入式 etcd 实现 HA，无需外部数据库。

## HA 架构

```
                Load Balancer (HAProxy/Nginx/云 LB)
                              │
              ┌───────────────┼───────────────┐
              │               │               │
          master-1       master-2       master-3
          (etcd)         (etcd)         (etcd)
              └────────── etcd 集群 ───────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
          worker-1       worker-2       worker-3
```

## 嵌入式 etcd HA（推荐）

K3S 默认 embedded etcd，支持 HA master 集群。

### 前置要求

- **至少 3 个 master 节点**（奇数，且 ≥ 3）
- 各节点之间网络互通（6443 + 2379-2380 端口）
- Load Balancer（云 LB / HAProxy / Nginx）

### 步骤 1：准备 Load Balancer

任意 LB 方案：

```bash
# 方案 A：HAProxy（无云 LB 时）
# /etc/haproxy/haproxy.cfg
frontend k3s-api
    bind *:6443
    mode tcp
    option tcplog
    default_backend k3s-masters

backend k3s-masters
    mode tcp
    option ssl-hello-chk
    balance roundrobin
    server master-1 10.0.0.11:6443 check
    server master-2 10.0.0.12:6443 check
    server master-3 10.0.0.13:6443 check
```

```bash
# 方案 B：Nginx stream（另一种选择）
stream {
    upstream k3s_api {
        least_conn;
        server 10.0.0.11:6443;
        server 10.0.0.12:6443;
        server 10.0.0.13:6443;
    }
    server {
        listen 6443;
        proxy_pass k3s_api;
        proxy_timeout 300s;
        proxy_connect_timeout 5s;
    }
}
```

```bash
# 方案 C：云 LB（AWS NLB / GCP TCP LB / Aliyun SLB）
# 转发 6443 到 3 个 master
```

### 步骤 2：初始化第一个 master

```bash
# 在 master-1 上
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
  --cluster-init \
  --tls-san=<LB_IP_OR_DNS> \
  --datastore-endpoint=etcd \
  --disable=traefik" sh -

# 验证
sudo kubectl get nodes
sudo kubectl get pods -n kube-system

# 获取 token
sudo cat /var/lib/rancher/k3s/server/node-token
```

### 步骤 3：加入其他 master

```bash
# master-2 和 master-3 上执行同样的命令
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
  --server https://<LB_IP_OR_DNS>:6443 \
  --token <NODE_TOKEN> \
  --tls-san=<LB_IP_OR_DNS> \
  --datastore-endpoint=etcd \
  --disable=traefik" sh -
```

### 步骤 4：加入 workers

```bash
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="agent \
  --server https://<LB_IP_OR_DNS>:6443 \
  --token <NODE_TOKEN>" sh -
```

### 步骤 5：验证 HA

```bash
# 查看 etcd 集群状态
sudo kubectl get nodes -o wide
# NAME       STATUS   ROLES                       AGE
# master-1   Ready    control-plane,etcd,master   10m
# master-2   Ready    control-plane,etcd,master   8m
# master-3   Ready    control-plane,etcd,master   5m
# worker-1   Ready    <none>                      2m

# 测试 master 故障转移
# 停掉 master-1
sudo systemctl stop k3s

# 在其他 master 上验证 kubectl 仍可用
sudo kubectl get nodes
# master-1 会显示 NotReady，其他仍然 Ready
# 恢复 master-1
sudo systemctl start k3s
```

## 数据库备份

K3S embedded etcd 用 SQLite 文件备份：

```bash
# 手动备份
sudo systemctl stop k3s
sudo cp -r /var/lib/rancher/k3s/server/db /backup/etcd-$(date +%Y%m%d)
sudo systemctl start k3s

# 自动备份脚本
cat > /usr/local/bin/k3s-etcd-backup.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR=/backup/etcd
DATE=$(date +%Y%m%d-%H%M%S)
sudo systemctl stop k3s
sudo cp -r /var/lib/rancher/k3s/server/db $BACKUP_DIR/etcd-$DATE
sudo systemctl start k3s
# 上传到 S3
aws s3 cp $BACKUP_DIR/etcd-$DATE s3://my-k3s-backups/etcd/$DATE/ --recursive
# 保留最近 30 天
find $BACKUP_DIR -maxdepth 1 -type d -mtime +30 -exec rm -rf {} \;
EOF
chmod +x /usr/local/bin/k3s-etcd-backup.sh

# Cron 每天凌晨 4 点
echo "0 4 * * * root /usr/local/bin/k3s-etcd-backup.sh" | sudo tee /etc/cron.d/k3s-backup
```

## etcd 恢复

```bash
# 在所有 master 上停 k3s
sudo systemctl stop k3s

# 在 master-1 恢复
sudo rm -rf /var/lib/rancher/k3s/server/db
sudo cp -r /backup/etcd-20260126 /var/lib/rancher/k3s/server/db

# 启动
sudo systemctl start k3s

# 验证
sudo kubectl get pods -A
```

## K3S HA 配置（config.yaml）

`/etc/rancher/k3s/config.yaml`：

```yaml
# === HA 核心配置 ===
datastore-endpoint: etcd
tls-san:
  - "k3s.example.com"
  - "10.0.0.10"            # LB IP

# === 故障检测 ===
etcd-servers: "https://master-1:2379,https://master-2:2379,https://master-3:2379"
etcd-heartbeat-interval: 500
etcd-election-timeout: 5000
etcd-snapshot-schedule-cron: "0 */6 * * *"     # 每 6 小时 snapshot
etcd-snapshot-retention: 72                   # 保留 72 小时（3 天）
etcd-snapshot-dir: "/var/lib/rancher/k3s/server/db/snapshots"

# === 资源限制 ===
kubelet-arg:
  - "max-pods=200"

# === 网络 ===
cluster-cidr: 10.42.0.0/16
service-cidr: 10.43.0.0/16

# === 禁用默认组件 ===
disable:
  - traefik
  - servicelb
  - local-storage
```

## 外部数据库（高级场景）

如果不想用 embedded etcd，可以用外部 PostgreSQL/MySQL：

```bash
# PostgreSQL
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
  --datastore-endpoint='postgres://user:pass@postgres-host:5432/k3s?sslmode=disable' \
  --tls-san=<LB_IP>" sh -

# MySQL
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
  --datastore-endpoint='mysql://user:pass@tcp(mysql-host:3306)/k3s'" sh -
```

## Master 节点隔离

生产环境建议 master 节点不跑工作负载（避免 OOM 影响 etcd）：

```bash
# 加 taint 到所有 master
sudo kubectl taint nodes -l node-role.kubernetes.io/control-plane=true \
  node-role.kubernetes.io/control-plane=:NoSchedule
```

工作负载需要容忍此 taint 才能调度到 master：

```yaml
spec:
  tolerations:
  - key: node-role.kubernetes.io/control-plane
    operator: Exists
    effect: NoSchedule
```

只有系统组件（如 kube-proxy、CNIs）会容忍这个 taint。

## 监控 HA 集群

### etcd 健康

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: k3s-etcd-alerts
  namespace: monitoring
  labels: {release: kube-prom}
spec:
  groups:
  - name: k3s-etcd
    rules:
    - alert: EtcdInsufficientMembers
      expr: sum(up{job="kube-etcd"}) < 3
      for: 3m
      labels: {severity: critical}
    - alert: EtcdNoLeader
      expr: etcd_server_has_leader == 0
      for: 1m
      labels: {severity: critical}
```

### Master 节点健康

```yaml
- alert: K3sMasterDown
  expr: |
    sum(kube_node_role{role="control-plane",condition="Ready"} == "true")
    < 3
  for: 5m
  labels: {severity: critical}
```

## 备份恢复脚本

```bash
#!/usr/bin/env bash
# backup-restore.sh
# 用法：./backup-restore.sh backup | ./backup-restore.sh restore <snapshot>
set -euo pipefail

ACTION="${1:-backup}"
SNAPSHOT="${2:-}"

case "$ACTION" in
backup)
  sudo systemctl stop k3s
  TS=$(date +%Y%m%d-%H%M%S)
  sudo cp -r /var/lib/rancher/k3s/server/db "/backup/etcd-$TS"
  sudo systemctl start k3s
  echo "Backup: /backup/etcd-$TS"
  ls -la "/backup/etcd-$TS"
  ;;
restore)
  if [ -z "$SNAPSHOT" ]; then
    echo "Usage: $0 restore <snapshot-dir>"
    exit 1
  fi
  echo "WARNING: This will replace the current etcd data!"
  read -p "Are you sure? (yes/no) " -r
  if [ "$REPLY" != "yes" ]; then
    echo "Aborted."
    exit 1
  fi
  sudo systemctl stop k3s
  sudo rm -rf /var/lib/rancher/k3s/server/db
  sudo cp -r "$SNAPSHOT" /var/lib/rancher/k3s/server/db
  sudo systemctl start k3s
  echo "Restored from $SNAPSHOT"
  ;;
*)
  echo "Usage: $0 [backup|restore <snapshot>]"
  exit 1
  ;;
esac
```