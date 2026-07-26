# Helm Charts

复杂应用打包成 Helm chart，方便版本管理、参数化部署、多环境复用。

## Chart 结构

```
myapp/
├── Chart.yaml              # chart 元数据
├── values.yaml             # 默认配置值
├── values.schema.json      # （可选）配置 schema 校验
├── charts/                 # 子 chart（依赖）
├── templates/
│   ├── _helpers.tpl        # 模板辅助函数
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── serviceaccount.yaml
│   ├── pvc.yaml
│   ├── hpa.yaml
│   └── NOTES.txt           # 安装后提示
└── README.md
```

---

## Chart.yaml

```yaml
apiVersion: v2
name: myapp
description: My application chart
type: application
version: 1.0.0              # chart 版本（SemVer）
appVersion: "1.0.0"        # 应用版本

maintainers:
- name: ops
  email: ops@example.com

# 依赖（其他 chart）
dependencies:
- name: postgresql
  version: "15.x.x"
  repository: "https://charts.bitnami.com/bitnami"
  condition: postgresql.enabled
```

---

## values.yaml

```yaml
# === 默认值 ===
replicaCount: 3

image:
  repository: harbor.example.com/myapp/backend
  pullPolicy: IfNotPresent
  tag: ""                   # 默认 = Chart.AppVersion

imagePullSecrets:
- name: harbor-pull-secret

serviceAccount:
  create: true
  name: ""                  # 默认 = fullname

service:
  type: ClusterIP
  port: 80
  targetPort: 8000

ingress:
  enabled: true
  className: traefik
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
  - host: app.example.com
    paths:
    - path: /api
      pathType: Prefix
  tls:
  - hosts: [app.example.com]
    secretName: myapp-tls

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80
  targetMemoryUtilizationPercentage: 80

persistence:
  enabled: true
  size: 10Gi
  storageClass: longhorn
  accessModes:
  - ReadWriteOnce

env:
  - name: LOG_LEVEL
    value: info
  - name: BACKEND_PORT
    value: "8000"

envFrom:
- configMapRef:
    name: myapp-config
- secretRef:
    name: myapp-secrets

# PostgreSQL 依赖配置
postgresql:
  enabled: true
  auth:
    username: myapp
    password: CHANGE_ME
    database: myapp
  persistence:
    size: 20Gi
    storageClass: longhorn

# Probes
livenessProbe:
  httpGet:
    path: /healthz
    port: http
readinessProbe:
  httpGet:
    path: /ready
    port: http
```

---

## templates/_helpers.tpl

```yaml
{{/*
Expand the name of the chart.
*/}}
{{- define "myapp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "myapp.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "myapp.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "myapp.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "myapp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "myapp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

---

## templates/deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "myapp.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "myapp.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "myapp.serviceAccountName" . }}
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - name: http
          containerPort: {{ .Values.service.targetPort }}
          protocol: TCP
        env:
        {{- with .Values.env }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
        envFrom:
        {{- with .Values.envFrom }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
        livenessProbe:
          {{- toYaml .Values.livenessProbe | nindent 10 }}
        readinessProbe:
          {{- toYaml .Values.readinessProbe | nindent 10 }}
        resources:
          {{- toYaml .Values.resources | nindent 10 }}
        {{- if .Values.persistence.enabled }}
        volumeMounts:
        - name: data
          mountPath: /app/data
        {{- end }}
      {{- if .Values.persistence.enabled }}
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: {{ include "myapp.fullname" . }}-data
      {{- end }}
```

---

## templates/service.yaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
  - port: {{ .Values.service.port }}
    targetPort: http
    protocol: TCP
    name: http
  selector:
    {{- include "myapp.selectorLabels" . | nindent 4 }}
```

---

## templates/ingress.yaml

```yaml
{{- if .Values.ingress.enabled -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  ingressClassName: {{ .Values.ingress.className }}
  {{- with .Values.ingress.tls }}
  tls:
    {{- toYaml . | nindent 4 }}
  {{- end }}
  rules:
  {{- range .Values.ingress.hosts }}
  - host: {{ .host | quote }}
    http:
      paths:
      {{- range .paths }}
      - path: {{ .path }}
        pathType: {{ .pathType }}
        backend:
          service:
            name: {{ include "myapp.fullname" $ }}
            port:
              number: {{ $.Values.service.port }}
      {{- end }}
  {{- end }}
{{- end }}
```

---

## templates/hpa.yaml

```yaml
{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "myapp.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
  {{- if .Values.autoscaling.targetCPUUtilizationPercentage }}
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
  {{- end }}
  {{- if .Values.autoscaling.targetMemoryUtilizationPercentage }}
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: {{ .Values.autoscaling.targetMemoryUtilizationPercentage }}
  {{- end }}
{{- end }}
```

---

## templates/pvc.yaml

```yaml
{{- if .Values.persistence.enabled }}
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ include "myapp.fullname" . }}-data
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
spec:
  accessModes:
    {{- toYaml .Values.persistence.accessModes | nindent 4 }}
  storageClassName: {{ .Values.persistence.storageClass }}
  resources:
    requests:
      storage: {{ .Values.persistence.size }}
{{- end }}
```

---

## values.schema.json（参数校验）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["image"],
  "properties": {
    "replicaCount": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    },
    "image": {
      "type": "object",
      "required": ["repository"],
      "properties": {
        "repository": {"type": "string"},
        "tag": {"type": "string"},
        "pullPolicy": {"enum": ["Always", "IfNotPresent", "Never"]}
      }
    },
    "ingress": {
      "type": "object",
      "properties": {
        "enabled": {"type": "boolean"},
        "className": {"type": "string"}
      }
    },
    "autoscaling": {
      "type": "object",
      "properties": {
        "enabled": {"type": "boolean"},
        "minReplicas": {"type": "integer", "minimum": 1},
        "maxReplicas": {"type": "integer", "maximum": 1000}
      }
    }
  }
}
```

---

## Helm 常用命令

```bash
# 创建新 chart
helm create myapp

# 打包
helm package myapp/                # 生成 myapp-1.0.0.tgz

# 渲染（生成 K8S manifests，但不部署）
helm template myapp ./myapp --values values-prod.yaml

# 安装/升级
helm install myapp ./myapp -n myapp --create-namespace
helm upgrade myapp ./myapp -n myapp -f values-prod.yaml

# 查看状态
helm list -n myapp
helm status myapp -n myapp

# 卸载
helm uninstall myapp -n myapp

# 添加 chart 仓库
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# 搜索 chart
helm search repo postgres

# 拉取依赖
helm dependency update ./myapp

# 调试渲染
helm template myapp ./myapp --debug
```

---

## 最佳实践

1. **values 全部 lowercase + camelCase** -- 避免引号
2. **资源加 requests + limits** -- 必须，避免 OOM
3. **Selector 不可变** -- 改 selectorLabels 需要重建（不能升级）
4. **用 `nindent` 而非 `indent`** -- 正确处理已缩进的 yaml
5. **Secret 用 Sealed Secrets** -- 不要把真实密钥塞 values.yaml
6. **chart 版本独立于 app 版本** -- Chart.Version 是 chart 模板本身，AppVersion 是应用
7. **每个 environment 一个 values 文件** -- values-dev.yaml, values-prod.yaml