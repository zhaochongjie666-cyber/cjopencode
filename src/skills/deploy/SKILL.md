---
name: deploy
description: |
  高级部署 skill -- 专家级系统工程师能力。分析项目技术栈，生成完整部署基础设施。
  Tier 1：单主机 Docker（compose.prod.yml/dev.yml + Nginx + .env + 启动脚本）。
  Tier 2：K3S 集群编排（K8S manifests + Helm chart + 内网 + Ingress + 持久化存储 + Secret）。
  Tier 3：完整平台（HA 集群 + HPA 自动扩缩 + 可观测 Prometheus/Grafana/Loki + GitOps ArgoCD/Flux）。
  支持 Node.js（npm/pnpm/yarn + Vite/Next/React）、Python（pip/venv + FastAPI/Flask/Django）、Go（go build + CGO）。
  触发：部署、deploy、docker compose、Dockerfile、Nginx、生产环境、开发环境、prodapp、devapp、容器化、containerize、K8S、K3S、kubernetes、集群、cluster、Helm、manifests。
---

# deploy - 高级部署基础设施生成（系统工程师级别）

## 本 skill 做什么

一个**专家级系统工程师**，把任意项目从"本地代码"变成"生产可运行的分布式系统"。支持三个 Tier：

```
Tier 1: 单主机 Docker        -> 单机/小项目，<5 服务，<10K 用户
Tier 2: K3S 集群编排         -> 中等规模，多服务，10K-100K 用户，需要高可用和扩缩容
Tier 3: 完整平台             -> 大规模，需要 HA、可观测、GitOps 自动化
```

## 何时用

- Tier 1：单机/单服务器跑得起来的项目，< 5 个服务
- Tier 2：需要多服务器部署、需要负载均衡、自动恢复、滚动更新
- Tier 3：生产关键业务，需要 HA 集群、监控告警、GitOps 自动部署

## Tier 选择决策树

```
需要多少服务器?
├── 1 台        -> Tier 1 (单主机 Docker)
├── 2-5 台     -> Tier 2 (K3S 集群)
└── 5+ 台 + 关键业务 -> Tier 3 (K3S HA + 可观测 + GitOps)

需要高可用?
├── 否         -> Tier 1
└── 是         -> Tier 2/3

需要自动扩缩容?
├── 否         -> Tier 1/2
└── 是         -> Tier 2/3 (HPA)

需要可观测（监控/日志/告警）?
├── 否         -> Tier 1/2
└── 是         -> Tier 3

需要 GitOps 自动部署?
├── 否         -> Tier 1/2
└── 是         -> Tier 3 (ArgoCD/Flux)
```

## 怎么做

### Tier 1：单主机 Docker

```
1. 分析项目 -> 读 lockfiles 判定技术栈
2. 生成生产文件 -> compose.prod.yml + .env.prod + Dockerfiles + Nginx + prodapp.sh
3. 生成开发文件 -> compose.dev.yml + .env.dev + 热重载配置 + devapp.sh
4. 验证 -> validate-deploy.sh
```

详细参考：`references/prod-deploy.md`、`references/dev-deploy.md`、`references/binary-builds.md`、`references/nginx-templates.md`

### Tier 2：K3S 集群编排

```
1. 分析项目 + 集群规模
2. 生成 K8S manifests -> k8s/ 目录（Deployment/Service/Ingress/PVC/ConfigMap/Secret）
3. 生成 K3S 安装脚本 -> scripts/k3s-init.sh + k3s-join.sh
4. 配置内网 + Ingress -> Traefik (K3S 默认) + cert-manager (TLS)
5. 配置持久化 -> local-path (默认) / Longhorn (分布式)
6. 部署 -> scripts/deploy-k8s.sh (kubectl apply)
7. 验证 -> validate-k8s.sh
```

详细参考：`references/k3s-setup.md`、`references/k8s-manifests.md`、`references/cluster-networking.md`、`references/persistent-storage.md`、`references/secrets-config.md`

### Tier 3：完整平台

```
Tier 2 全部内容 +
1. HA 集群 -> references/ha-cluster.md（embedded etcd 多 master）
2. 自动扩缩容 -> references/autoscaling.md（HPA + Cluster Autoscaler）
3. 可观测 -> references/monitoring.md（Prometheus + Grafana + Loki）
4. GitOps -> references/gitops.md（ArgoCD / Flux）
5. Helm chart -> references/helm-templates.md（复杂应用打包）
```

## 产物对照表

| Tier | 产物 | 工具/命令 |
|------|------|-----------|
| 1 | `compose.prod.yml` + `compose.dev.yml` + `Dockerfile.*` + `nginx.conf` + `.env.*` + `*app.sh` | `docker compose up` |
| 2 | `k8s/*.yaml` + `scripts/k3s-init.sh` + `scripts/k3s-join.sh` + `scripts/deploy-k8s.sh` | `kubectl apply` |
| 3 | Tier 2 全部 + `helm/` + `monitoring/` + `gitops/` + HA 配置 | `kubectl apply` + `helm install` |

## 技术栈覆盖

| 语言 | Tier 1 Dockerfile | Tier 2 K8S |
|------|------------------|-----------|
| **Node.js** (npm/pnpm/yarn + Vite/Next/React) | 多阶段：Node build -> Nginx serve | Docker image -> Deployment |
| **Python** (pip/venv + FastAPI/Flask/Django) | python:3.12-slim + gunicorn/uvicorn | 同 |
| **Go** (go build + CGO) | multi-stage: golang -> scratch/alpine/distroless | 同 |

详情：`references/binary-builds.md`

## Tier 1 vs Tier 2/3 关键差异

| 维度 | Tier 1 (Docker) | Tier 2/3 (K3S) |
|------|-----------------|----------------|
| 部署单元 | 容器 | Pod |
| 服务发现 | docker network DNS | K8S Service + CoreDNS |
| 负载均衡 | Nginx 显式 proxy | Service 自动 + Ingress |
| 配置注入 | .env 文件 | ConfigMap + Secret |
| 存储 | named volume | PVC + StorageClass |
| 滚动更新 | `docker compose up --build` | Deployment strategy + HPA |
| 自愈 | restart policy | Pod restartPolicy + replicas |
| 多主机 | ❌ | ✅ |

## 不做的事

- ❌ 实际 provision 服务器（生成 IaC 脚本由用户执行）
- ❌ 改业务代码（只生成部署文件）
- ❌ 推送到 Git / 镜像仓库（用户决定）
- ❌ 真实的密钥/Secret 值（只生成模板 + 占位符）
- ❌ 跑 `kubectl apply` / `docker compose up`（验证脚本检查配置，用户决定执行）

## 自检（按 Tier）

### Tier 1
```
□ 多阶段 Dockerfile 前端构建进 Nginx？
□ 运行容器不带 node_modules/源码？
□ 所有服务有 healthcheck？
□ Nginx SPA fallback + /api/ proxy 配置正确？
□ dev 模式 bind mount + 命名卷 + 热重载？
□ .env.prod/.env.dev 模板生成？
□ validate-deploy.sh 通过？
```

### Tier 2
```
□ K3S master/worker 安装脚本生成？
□ K8S manifests 完整（Deployment/Service/Ingress/PVC）？
□ Ingress 配置 TLS（cert-manager）？
□ 内网服务间通信测试通？
□ PVC 绑定 StorageClass？
□ Secret 不在 Git 仓库？
□ validate-k8s.sh 通过？
```

### Tier 3
```
□ HA 集群至少 3 master + embedded etcd？
□ HPA 配置（CPU/内存阈值 + min/max replicas）？
□ Prometheus 抓取所有应用 metrics？
□ Grafana 仪表盘导入？
□ Loki 收集所有 Pod 日志？
□ ArgoCD/Flux 监听 Git 仓库自动部署？
□ 告警规则配置（Alertmanager）？
```