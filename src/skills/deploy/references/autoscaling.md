# 自动扩缩容（Autoscaling）

K3S 支持两层自动扩缩容：**HPA**（Pod 水平扩缩）+ **Cluster Autoscaler**（节点扩缩）。

## HPA（HorizontalPodAutoscaler）

HPA 根据 CPU/内存/自定义指标自动增减 Pod 副本数。

### 基本 HPA（CPU）

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp-backend
  namespace: myapp
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp-backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
      - type: Percent
        value: 100
        periodSeconds: 30
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Pods
        value: 1
        periodSeconds: 60
```

### 多指标 HPA（CPU + 内存 + 自定义）

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp-backend
  namespace: myapp
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp-backend
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "1000"
```

### 自定义指标（需要 Prometheus Adapter）

前置：安装 [Prometheus Adapter](https://github.com/kubernetes-siggs/prometheus-adapter)

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus-adapter prometheus-community/prometheus-adapter \
  -n monitoring \
  --set prometheus.url=http://kube-prom-prometheus.monitoring.svc \
  --set rules.default=false \
  --set rules.custom[0].name=http_requests_per_second \
  --set rules.custom[0].query='sum(rate(http_requests_total[2m]))'
```

### KEDA（事件驱动扩缩容）

复杂场景用 KEDA，支持队列长度、消息速率等触发：

```bash
helm repo add kedacore https://kedacore.github.io/charts
helm install keda kedacore/keda --namespace keda --create-namespace
```

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: myapp-backend
  namespace: myapp
spec:
  scaleTargetRef:
    name: myapp-backend
  minReplicaCount: 2
  maxReplicaCount: 50
  triggers:
  - type: prometheus
    metadata:
      serverAddress: http://kube-prom-prometheus.monitoring.svc:9090
      metricName: http_requests_per_second
      query: sum(rate(http_requests_total[2m]))
      threshold: "1000"
  - type: rabbitmq
    metadata:
      queueName: myapp-jobs
      mode: QueueLength
      value: "100"
```

---

## VPA（VerticalPodAutoscaler）

VPA 自动调整 Pod 的 CPU/内存 requests/limits（不是副本数）。

```bash
# 安装 VPA
git clone https://github.com/kubernetes/autoscaler.git
cd autoscaler/vertical-pod-autoscaler
./hack/vpa-up.sh  # 或 helm 安装
```

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: myapp-backend
  namespace: myapp
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp-backend
  updatePolicy:
    updateMode: "Auto"        # Auto / Initial / Off
  resourcePolicy:
    containerPolicies:
    - containerName: backend
      minAllowed: {cpu: "100m", memory: "128Mi"}
      maxAllowed: {cpu: "2", memory: "2Gi"}
      controlledResources: ["cpu", "memory"]
```

> ⚠️ VPA 和 HPA 不能同时用于同一指标。

---

## Cluster Autoscaler（节点扩缩）

节点级扩缩容，根据 Pod 调度需求增减节点。

### 安装

```bash
# Helm 安装（推荐）
helm repo add autoscaler https://kubernetes.github.io/autoscaler
helm install cluster-autoscaler autoscaler/cluster-autoscaler \
  --namespace kube-system \
  --set autoDiscovery.clusterName=my-k3s-cluster \
  --set awsRegion=us-east-1 \
  --set cloudProvider=aws
```

### 云厂商配置

#### AWS

```bash
# IAM 权限：ec2:DescribeInstances, ec2:RunInstances, ec2:TerminateInstances, ec2:DescribeLaunchTemplateVersions

# ASG 标签：k8s.io/cluster-autoscaler/<CLUSTER_NAME>=owned, k8s.io/cluster-autoscaler/enabled=true

helm install cluster-autoscaler autoscaler/cluster-autoscaler \
  --set autoDiscovery.clusterName=my-k3s-cluster \
  --set awsRegion=us-east-1 \
  --set cloudProvider=aws \
  --set extraArgs.expander=least-waste \
  --set extraArgs.balance-similar-node-groups=true
```

#### GCP

```bash
helm install cluster-autoscaler autoscaler/cluster-autoscaler \
  --set cloudProvider=gcp \
  --set autoDiscovery.clusterName=my-gke-cluster \
  --set extraArgs.expander=least-waste
```

#### Aliyun

```bash
# aliyun 自己有 Cluster Autoscaler
kubectl apply -f https://raw.githubusercontent.com/AliyunContainerService/autoscaler/master/cluster-autoscaler.yaml
```

### K3S + Cluster Autoscaler

K3S 的 RKE2 启动脚本支持 cluster autoscaler：

```bash
# 在每个节点上
curl -sfL https://get.rke2.io | INSTALL_RKE2_EXEC="--cloud-provider-name=aws" sh -
```

或用 K3OS 自带的 node-manager。

### 自定义节点组

```yaml
# AWS ASG + ASG tag
# ASG tag: k8s.io/cluster-autoscaler/node-template=my-gpu-pool
# 部署 Deployment 时用 nodeSelector
spec:
  template:
    spec:
      nodeSelector:
        workload: gpu
        # Cluster Autoscaler 看到这个 selector 时扩展对应 ASG
```

---

## KEDA + Cluster Autoscaler 组合

```
请求进入 → KEDA 触发 HPA → 增加 Pod 副本
                              ↓
                         节点资源不足
                              ↓
                   Cluster Autoscaler 增加节点
                              ↓
                   新 Pod 调度到新节点
```

完整事件驱动扩缩：

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: myapp-backend
  namespace: myapp
spec:
  scaleTargetRef:
    name: myapp-backend
  minReplicaCount: 2
  maxReplicaCount: 100
  pollingInterval: 10
  cooldownPeriod: 60
  fallback:
    failureThreshold: 3
    replicas: 5
  triggers:
  - type: prometheus
    metadata:
      serverAddress: http://kube-prom-prometheus.monitoring.svc:9090
      threshold: "0.5"
      query: |
        sum(rate(http_requests_total{namespace="myapp"}[1m]))
        /
        sum(kube_pod_container_resource_limits{namespace="myapp",resource="cpu"})
```

---

## PodDisruptionBudget（避免扩缩容时中断）

HPA 缩容时可能 kill Pod，PDB 保证最少可用副本：

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: myapp-backend
  namespace: myapp
spec:
  minAvailable: 2                  # 至少 2 个 pod 可用
  # 或 maxUnavailable: 1
  selector:
    matchLabels:
      app: myapp
      component: backend
```

---

## 性能调优

### Pod 拓扑分布约束（多 AZ）

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: {name: myapp-backend, namespace: myapp}
spec:
  template:
    spec:
      topologySpreadConstraints:
      - maxSkew: 1
        topologyKey: topology.kubernetes.io/zone
        whenUnsatisfiable: DoNotSchedule
        labelSelector:
          matchLabels:
            app: myapp
            component: backend
```

### 优雅关停

```yaml
spec:
  terminationGracePeriodSeconds: 60
  containers:
  - name: backend
    lifecycle:
      preStop:
        exec:
          command:
          - /bin/sh
          - -c
          - "sleep 15 && nginx -s quit"    # 等流量切换完
```

### 滚动更新策略

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%                  # 滚动时可超出 25% 副本
      maxUnavailable: 0               # 不可用副本数（0 = 不停服）
```

---

## 决策树

```
需要自动扩缩容?
├── 否 -> 固定副本数，足够
└── 是
    ├── 扩缩容单位?
    │   ├── Pod 副本 -> HPA（CPU/内存/自定义指标）
    │   └── 节点数 -> Cluster Autoscaler
    └── 触发信号?
        ├── CPU/内存 -> HPA Resource metrics
        ├── 自定义业务指标 (RPS, queue length) -> KEDA 或 Prometheus Adapter
        └── 定时（业务高峰） -> KEDA Cron scaler
```