# 可观测（Monitoring + Logging + Tracing）

K3S 可观测三支柱：Metrics（Prometheus）、Logs（Loki）、Traces（Jaeger/Tempo）。可视化统一用 Grafana。

## 完整可观测栈

```
应用 Pod
    │
    ├── /metrics endpoint ──► Prometheus 抓取 ──► Grafana 仪表盘
    │
    ├── stdout/stderr ──► Promtail/DaemonSet ──► Loki ──► Grafana 日志面板
    │
    └── OTLP ──► OpenTelemetry Collector ──► Jaeger/Tempo ──► Grafana 追踪面板
                       │
                       └──► Alertmanager ──► Slack/PagerDuty/Email
```

## kube-prometheus-stack（一键全套）

### 安装

```bash
# 添加 repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# 创建 namespace
kubectl create namespace monitoring

# 安装（自定义 values）
cat > monitoring-values.yaml << 'EOF'
prometheus:
  prometheusSpec:
    retention: 30d
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: longhorn
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 50Gi
    resources:
      requests: {cpu: "200m", memory: "2Gi"}
      limits: {cpu: "1", memory: "4Gi"}

grafana:
  adminPassword: CHANGE_ME
  persistence:
    enabled: true
    storageClassName: longhorn
    size: 10Gi
  ingress:
    enabled: true
    ingressClassName: traefik
    hosts: [grafana.example.com]
    annotations:
      cert-manager.io/cluster-issuer: letsencrypt-prod
    tls:
    - hosts: [grafana.example.com]
      secretName: grafana-tls

alertmanager:
  alertmanagerSpec:
    storage:
      volumeClaimTemplate:
        spec:
          storageClassName: longhorn
          accessModes: ["ReadWriteOnce"]
          resources: {requests: {storage: 10Gi}}
    resources:
      requests: {cpu: "100m", memory: "256Mi"}
      limits: {cpu: "500m", memory: "1Gi"}

nodeExporter:
  enabled: true

kubeStateMetrics:
  enabled: true
EOF

helm install kube-prom prometheus-community/kube-prometheus-stack \
  -n monitoring -f monitoring-values.yaml
```

### 卸载

```bash
helm uninstall kube-prom -n monitoring
kubectl delete namespace monitoring
```

---

## 应用暴露 metrics

### Python（prometheus_client）

```python
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from fastapi import FastAPI, Response

app = FastAPI()

REQUEST_COUNT = Counter("http_requests_total", "Total HTTP requests", ["method", "endpoint", "status"])
REQUEST_LATENCY = Histogram("http_request_duration_seconds", "HTTP request latency", ["endpoint"])

@app.middleware("http")
async def metrics_middleware(request, call_next):
    with REQUEST_LATENCY.labels(request.url.path).time():
        response = await call_next(request)
    REQUEST_COUNT.labels(request.method, request.url.path, response.status_code).inc()
    return response

@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
```

### Go（promhttp）

```go
import (
    "github.com/prometheus/client_golang/prometheus/promhttp"
    "net/http"
)

func main() {
    http.Handle("/metrics", promhttp.Handler())
    http.ListenAndServe(":8000", nil)
}
```

### Node.js（prom-client）

```typescript
import client from 'prom-client'
import express from 'express'

const app = express()
const collectDefaultMetrics = client.collectDefaultMetrics
collectDefaultMetrics()

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType)
  res.end(await client.register.metrics())
})

app.listen(8000)
```

### K8S ServiceMonitor 自动抓取

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: myapp-backend
  namespace: myapp
  labels:
    release: kube-prom              # 必须匹配 helm release name
spec:
  selector:
    matchLabels:
      app: myapp
      component: backend
  endpoints:
  - port: http                      # Service port name
    path: /metrics
    interval: 30s
    scrapeTimeout: 10s
```

---

## Loki 日志收集

### 安装

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm install loki grafana/loki-stack \
  --namespace monitoring \
  --set promtail.enabled=true \
  --set loki.persistence.enabled=true \
  --set loki.persistence.storageClassName=longhorn \
  --set loki.persistence.size=50Gi
```

### 应用日志格式（推荐 JSON）

```python
import structlog

structlog.configure(
    processors=[
        structlog.processors.JSONRenderer()
    ]
)

logger = structlog.get_logger()
logger.info("user_login", user_id=123, ip="1.2.3.4", status="success")
# 输出: {"event": "user_login", "user_id": 123, "ip": "1.2.3.4", "status": "success", "timestamp": "..."}
```

### Grafana 查询日志

```logql
{namespace="myapp"} |= "error"
{namespace="myapp", app="myapp-backend"} | json | latency_ms > 1000
```

---

## 告警规则

### PrometheusRule

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: myapp-alerts
  namespace: myapp
  labels:
    release: kube-prom
spec:
  groups:
  - name: myapp.rules
    rules:
    - alert: HighErrorRate
      expr: |
        sum(rate(http_requests_total{status=~"5..", namespace="myapp"}[5m]))
        /
        sum(rate(http_requests_total{namespace="myapp"}[5m]))
        > 0.05
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "High error rate (>5%) in myapp"
        description: "Error rate is {{ $value | humanizePercentage }}"

    - alert: HighLatency
      expr: |
        histogram_quantile(0.95,
          sum(rate(http_request_duration_seconds_bucket{namespace="myapp"}[5m])) by (le)
        ) > 1
      for: 10m
      labels:
        severity: warning

    - alert: PodCrashLooping
      expr: |
        rate(kube_pod_container_status_restarts_total{namespace="myapp"}[15m]) > 0
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Pod {{ $labels.pod }} is crash looping"

    - alert: PVCAlmostFull
      expr: |
        kubelet_volume_stats_available_bytes{namespace="myapp"}
        /
        kubelet_volume_stats_capacity_bytes{namespace="myapp"}
        < 0.1
      for: 10m
      labels:
        severity: warning
```

### Alertmanager 配置

```yaml
# alertmanager-config.yaml
global:
  resolve_timeout: 5m
route:
  receiver: 'default'
  group_by: ['alertname', 'namespace']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
  - match:
      severity: critical
    receiver: 'pagerduty'
    repeat_interval: 1h
  - match:
      severity: warning
    receiver: 'slack'

receivers:
- name: 'default'
  slack_configs:
  - api_url: 'https://hooks.slack.com/services/CHANGE_ME'
    channel: '#alerts'
    title: 'MyApp Alert'
    text: '{{ range .Alerts }}{{ .Annotations.summary }}\n{{ end }}'

- name: 'pagerduty'
  pagerduty_configs:
  - routing_key: 'CHANGE_ME'
    description: '{{ .CommonAnnotations.summary }}'

- name: 'slack'
  slack_configs:
  - api_url: 'https://hooks.slack.com/services/CHANGE_ME'
    channel: '#alerts-warning'
```

---

## 分布式追踪（Jaeger）

### 安装

```bash
helm repo add jaegertracing https://jaegertracing.github.io/helm-charts
helm install jaeger jaegertracing/jaeger \
  -n observability --create-namespace \
  --set provisionDataStore.cassandra.enabled=false \
  --set allInOne.enabled=true \
  --set agent.enabled=false
```

### OpenTelemetry 集成

应用注入 OTLP：

```python
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

provider = TracerProvider()
processor = BatchSpanProcessor(OTLPSpanExporter(endpoint="http://otel-collector:4317"))
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)

tracer = trace.get_tracer(__name__)
with tracer.start_as_current_span("process_order"):
    # ... 业务逻辑
    pass
```

K8S Sidecar 注入：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-backend
  annotations:
    sidecar.jaegertracing.io/inject: "true"
spec:
  template:
    metadata:
      annotations:
        sidecar.jaegertracing.io/inject: "true"
```

---

## Grafana 仪表盘

推荐仪表盘 ID（import via Configuration -> Import）：

| 仪表盘 | ID | 来源 |
|--------|-----|------|
| Kubernetes Cluster Overview | 7249 | starAgility |
| Node Exporter Full | 1860 | Prometheus |
| Prometheus Stats | 3662 | Prometheus |
| Loki Logs Dashboard | 13639 | Grafana |
| Jaeger Dashboard | (自带) | Jaeger |

```bash
# 自动导入示例
curl -X POST http://admin:CHANGE_ME@grafana.example.com/api/dashboards/import \
  -H "Content-Type: application/json" \
  -d '{
    "dashboard": { ... },
    "overwrite": false,
    "inputs": []
  }'
```

---

## 健康检查 vs 可用性

| 维度 | 工具 |
|------|------|
| 资源使用率 | Prometheus + Grafana |
| 应用错误率 | Prometheus + Alertmanager |
| 日志聚合查询 | Loki + Grafana |
| 请求链路追踪 | Jaeger + Grafana |
| 告警通知 | Alertmanager + Slack/PagerDuty |
| SLA 计算 | Grafana + uptime exporter |