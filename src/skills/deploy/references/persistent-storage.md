# 持久化存储

K8S 存储抽象：PersistentVolume (PV) -> PersistentVolumeClaim (PVC) -> Pod mount。

K3S 默认带 local-path provisioner（小规模够用）。生产推荐 Longhorn（分布式块存储）。

## 存储方案对比

| 方案 | 类型 | 适用 | 复杂度 |
|------|------|------|--------|
| **local-path** | 本地路径 | 单节点/开发 | 低（K3S 默认） |
| **Longhorn** | 分布式块存储 | 多节点生产 | 中 |
| **NFS** | 网络文件系统 | 跨节点共享 | 低-中 |
| **OpenEBS** | 容器化存储 | 多节点 | 中 |
| **云厂商 CSI** | 云盘 | 云环境 | 低 |

---

## local-path（K3S 默认）

单节点或开发环境用。PVC 自动绑到节点的本地目录。

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: myapp-data
  namespace: myapp
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: local-path    # K3S 默认
  resources:
    requests:
      storage: 10Gi
```

数据存在 `/var/lib/rancher/k3s/storage/<pvc-name>` on the node。

> ⚠️ Pod 调度到哪个节点，数据就在那个节点。节点故障 = 数据丢失。

---

## Longhorn（推荐用于生产）

Longhorn 是 Rancher 开发的分布式块存储，为 K3S 设计。跨节点副本、自动修复、快照、备份。

### 安装

```bash
# kubectl 1.22+
kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/v1.6.2/deploy/longhorn.yaml

# 验证
kubectl -n longhorn-system get pods
# 所有 pod 应为 Running

# Web UI
kubectl port-forward -n longhorn-system svc/longhorn-frontend 8080:80
# 访问 http://localhost:8080
```

### 创建 StorageClass

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: longhorn
provisioner: driver.longhorn.io
allowVolumeExpansion: true       # 允许扩容
reclaimPolicy: Delete
volumeBindingMode: Immediate
parameters:
  numberOfReplicas: "3"           # 跨 3 节点副本
  staleReplicaTimeout: "2880"     # 副本超时（分钟）
  dataLocality: "disabled"
  fsType: "ext4"
```

### PVC 使用 Longhorn

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data
  namespace: myapp
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: longhorn
  resources:
    requests:
      storage: 100Gi
```

### Longhorn 快照 + 备份

```yaml
apiVersion: longhorn.io/v1beta2
kind: Snapshot
metadata:
  name: postgres-snapshot-20260126
  namespace: longhorn-system
spec:
  volume: pvc-<uuid>
  labels:
    app: postgres
```

```yaml
# 备份到 S3/NFS
apiVersion: longhorn.io/v1beta2
kind: RecurringJob
metadata:
  name: postgres-daily-backup
  namespace: longhorn-system
spec:
  cron: "0 2 * * *"                # 每天凌晨 2 点
  task: backup
  groups:
  - name: postgres
    recurrence: 24
    numberOfRetentions: 7          # 保留 7 天
    cron: "0 2 * * *"
  volumeSelector:
    - pvc-postgres-data
  backupTarget: s3-backup-target
```

### NFS 备份目标

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nfs-backup-target
  namespace: longhorn-system
data:
  NFS_SERVER: "nfs.example.com"
  NFS_PATH: "/var/nfs/longhorn-backups"
---
apiVersion: longhorn.io/v1beta2
kind: BackupTarget
metadata:
  name: nfs-backup
  namespace: longhorn-system
spec:
  backupTargetURL: nfs://nfs.example.com/var/nfs/longhorn-backups
  credentialSecret: ""
```

---

## NFS（跨节点共享）

适合多 Pod 共享同一文件系统（如静态资源、配置）。

### 安装 NFS provisioner

```bash
# 创建 NFS ServiceAccount + RBAC
kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/nfs-subdir-external-provisioner/master/deploy/rbac.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/nfs-subdir-external-provisioner/master/deploy/class.yaml

# 部署 provisioner（替换 NFS_SERVER 和 NFS_PATH）
helm install nfs-subdir-external-provisioner nfs-subdir-external-provisioner/nfs-subdir-external-provisioner \
  --set nfs.server=nfs.example.com \
  --set nfs.path=/var/nfs/shared
```

### PVC 使用 NFS

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: shared-assets
  namespace: myapp
spec:
  accessModes:
  - ReadWriteMany              # NFS 支持多 Pod 同时读写
  storageClassName: nfs-client
  resources:
    requests:
      storage: 100Gi
```

---

## StatefulSet（有状态应用）

数据库等有状态应用应该用 StatefulSet + Headless Service + PVC 模板：

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: myapp
spec:
  serviceName: postgres
  replicas: 1                    # 生产用 3 + Patroni/Operator
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:16-alpine
        ports:
        - containerPort: 5432
          name: postgres
        env:
        - name: POSTGRES_DB
          value: myapp
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef: {name: postgres-secrets, key: username}
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef: {name: postgres-secrets, key: password}
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
          subPath: postgres
        resources:
          requests: {cpu: "200m", memory: "256Mi"}
          limits: {cpu: "1000m", memory: "1Gi"}
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: longhorn
      resources:
        requests: {storage: 50Gi}
```

---

## 备份策略

### Velero（K8S 资源 + PV 备份）

```bash
# 安装 Velero
velero install \
  --provider aws \
  --bucket my-velero-backups \
  --prefix myapp \
  --secret-file ./credentials-velero \
  --use-restic                        # PV 备份

# 定时备份
velero schedule create daily-all --schedule="0 2 * * *" --include-namespaces myapp

# 手动备份
velero backup create myapp-manual-20260126 --include-namespaces myapp

# 恢复
velero restore create --from-backup myapp-manual-20260126
```

### PostgreSQL 专用备份

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
  namespace: myapp
spec:
  schedule: "0 3 * * *"              # 每天凌晨 3 点
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:16-alpine
            command:
            - /bin/sh
            - -c
            - |
              set -e
              pg_dump -h postgres.myapp.svc -U $PGUSER $PGDATABASE | gzip > /backup/postgres-$(date +%Y%m%d).sql.gz
              # 上传到 S3
              aws s3 cp /backup/postgres-$(date +%Y%m%d).sql.gz s3://my-backups/postgres/
              # 保留最近 7 天
              find /backup -name "postgres-*.sql.gz" -mtime +7 -delete
            env:
            - name: PGDATABASE
              value: myapp
            - name: PGUSER
              value: backup
            - name: PGPASSWORD
              valueFrom:
                secretKeyRef: {name: postgres-secrets, key: backup-password}
            - name: AWS_ACCESS_KEY_ID
              valueFrom:
                secretKeyRef: {name: aws-credentials, key: access-key}
            - name: AWS_SECRET_ACCESS_KEY
              valueFrom:
                secretKeyRef: {name: aws-credentials, key: secret-key}
            volumeMounts:
            - name: backup-volume
              mountPath: /backup
          restartPolicy: OnFailure
          volumes:
          - name: backup-volume
            persistentVolumeClaim:
              claimName: backup-storage
```

---

## 常见问题

### PVC Pending

```bash
kubectl describe pvc <pvc-name> -n myapp
# 看 Events 段，通常是 StorageClass 不存在或容量不够

kubectl get storageclass
# 确认 longhorn StorageClass 存在
```

### Pod 调度不到有 PV 的节点

```yaml
# 给节点加 label，然后用 nodeSelector
spec:
  nodeSelector:
    longhorn.io/node: "enabled"
```

### 数据迁移

```bash
# 从 local-path 迁移到 Longhorn
# 1. 停应用
kubectl scale deploy myapp-backend -n myapp --replicas=0

# 2. 创建 Longhorn PVC，迁移数据
kubectl exec -it <old-pod> -- cp -r /app/data /tmp/data
# 用 rclone/scp 复制到新 PVC

# 3. 切换到新 PVC
kubectl edit pvc myapp-data -n myapp  # 修改 storageClassName

# 4. 重启应用
kubectl scale deploy myapp-backend -n myapp --replicas=3
```