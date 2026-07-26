---
name: deploy
description: |
  高级部署 skill -- 专家级系统工程师。两大能力：
  1. **环境构建**：一键构建项目所需的运行环境（本地开发环境 / K3S 测试集群 / CI/CD pipeline）。
  2. **部署生成**：分析项目技术栈 + 用户规模/可用性需求，选择 Tier 生成部署基础设施（Tier 1 单主机 Docker / Tier 2 K3S 集群 / Tier 3 完整平台）。
  支持 Node.js（npm/pnpm/yarn + Vite/Next/React）、Python（pip/venv + FastAPI/Flask/Django）、Go（go build + CGO）。
  触发：部署、deploy、docker compose、Dockerfile、Nginx、生产环境、开发环境、prodapp、devapp、容器化、containerize、K8S、K3S、kubernetes、集群、cluster、Helm、manifests、测试集群、test cluster、本地环境、local env、CI、CD、pipeline。
---

# deploy - 环境构建 + 部署生成（系统工程师级别）

## 本 skill 两大能力

```
┌─────────────────────────────────────────────────────┐
│  能力 1: 环境构建（环境就绪）                          │
│  ├─ 本地开发环境  -> Node/Python/Go runtime + DB     │
│  ├─ K3S 测试集群  -> 一键启动 K3S（用户提到的例子）   │
│  └─ CI/CD 环境    -> GitHub Actions / GitLab CI       │
│                                                       │
│  能力 2: 部署生成（部署文件）                          │
│  ├─ Tier 1: 单主机 Docker (compose + Nginx + .env)    │
│  ├─ Tier 2: K3S 集群 (K8S manifests + Helm + Ingress) │
│  └─ Tier 3: 完整平台 (HA + HPA + 可观测 + GitOps)      │
└─────────────────────────────────────────────────────┘
```

## 何时用哪个能力

| 用户说 | 能力 |
|--------|------|
| "准备开发环境"/"安装 Node.js/Python" | 环境构建 - 本地 |
| "起 K3S 测试集群"/"本地要个 K8S" | 环境构建 - K3S |
| "配置 CI"/"GitHub Actions" | 环境构建 - CI/CD |
| "帮我部署"/"容器化"/"生成 Dockerfile" | 部署生成 - Tier 1 |
| "上 K3S 集群"/"多服务器部署" | 部署生成 - Tier 2 |
| "生产 HA"/"监控告警"/"GitOps" | 部署生成 - Tier 3 |
| "部署到测试环境" | **环境构建 + 部署生成**（先有测试集群，再部署） |

## 怎么做

### 能力 1：环境构建

```
work():
  1. 检测当前环境 -> bash skills/deploy/scripts/env-validate.sh
  2. 选择环境类型 -> 本地开发 / K3S 测试 / CI/CD
  3. 加载对应 references + 执行 scripts
  4. 验证环境就绪
```

#### 1a. 本地开发环境

参考 `references/env-setup.md`，脚本：`scripts/env-setup.sh`

```bash
# 检测 + 安装缺失工具（带确认）
bash skills/deploy/scripts/env-setup.sh

# 非交互安装
bash skills/deploy/scripts/env-setup.sh --yes

# 只装某种语言
bash skills/deploy/scripts/env-setup.sh --lang=node --yes

# 也装 K8S 工具（kubectl、helm）
bash skills/deploy/scripts/env-setup.sh --tools --yes
```

#### 1b. K3S 测试集群（核心例子）

参考 `references/k3s-dev-env.md`，脚本：`scripts/k3s-dev-setup.sh`

```bash
# 单服务器 K3S（默认，最简单）
sudo bash skills/deploy/scripts/k3s-dev-setup.sh

# K3D（Docker 内 K3S，秒级启动，推荐 CI/CD）
sudo bash skills/deploy/scripts/k3s-dev-setup.sh --k3d --name=myapp-dev

# HA 集群（嵌入式 etcd，多 master）
sudo bash skills/deploy/scripts/k3s-dev-setup.sh --ha --lb=10.0.0.10

# 禁用默认 Traefik
sudo bash skills/deploy/scripts/k3s-dev-setup.sh --disable-traefik
```

#### 1c. CI/CD 环境

参考 `references/ci-cd.md`，无对应脚本（生成 GitHub Actions / GitLab CI YAML 文件）

### 能力 2：部署生成

参考 **环境生成 → 部署应用** 完整链路：
- 先用能力 1 准备测试集群
- 再用能力 2 生成部署文件
- 用 `scripts/deploy-k8s.sh` 应用

```
work():
  1. 装 deploy skill（已在）
  2. 分析项目 -> 读 lockfiles 判定技术栈
  3. 询问需求 -> 服务器数量 / HA / 扩缩容 / 可观测 / GitOps
  4. 选择 Tier 1/2/3
  5. 加载对应 references + 生成文件
  6. 验证 -> validate-deploy.sh (Tier 1) / validate-k8s.sh (Tier 2/3)
```

详细 Tier 选择和文件生成见下文"部署生成"部分。

---

## 部署生成（Tier 1-3）

### Tier 选择决策树

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
3. 配置 K3S 安装（如新集群） -> scripts/k3s-init.sh + k3s-join.sh
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

---

## 产物对照表

| 能力 | 产物 | 工具/命令 |
|------|------|-----------|
| **环境 - 本地** | 已安装的 runtime + 配置 | `env-setup.sh` |
| **环境 - K3S 测试** | K3S 集群（master + worker） | `k3s-dev-setup.sh` |
| **环境 - CI/CD** | `.github/workflows/*.yml` 或 `.gitlab-ci.yml` | 生成配置文件 |
| **部署 Tier 1** | `compose.prod.yml` + `compose.dev.yml` + `Dockerfile.*` + `nginx.conf` + `.env.*` + `*app.sh` | `docker compose up` |
| **部署 Tier 2** | `k8s/*.yaml` + `scripts/k3s-{init,join}.sh` + `scripts/deploy-k8s.sh` | `kubectl apply` |
| **部署 Tier 3** | Tier 2 全部 + `helm/` + `monitoring/` + `gitops/` + HA 配置 | `kubectl apply` + `helm install` |

## 技术栈覆盖

| 语言 | Tier 1 Dockerfile | Tier 2 K8S |
|------|------------------|-----------|
| **Node.js** (npm/pnpm/yarn + Vite/Next/React) | 多阶段：Node build -> Nginx serve | Docker image -> Deployment |
| **Python** (pip/venv + FastAPI/Flask/Django) | python:3.12-slim + gunicorn/uvicorn | 同 |
| **Go** (go build + CGO) | multi-stage: golang -> scratch/alpine/distroless | 同 |

详情：`references/binary-builds.md`

## 不做的事

- ❌ 实际 provision 服务器（生成 IaC 脚本由用户执行）
- ❌ 改业务代码（只生成部署文件）
- ❌ 推送到 Git / 镜像仓库（用户决定）
- ❌ 生成真实的密钥/Secret 值（只生成模板 + 占位符）

## 自检（按能力）

### 环境构建
```
□ env-validate.sh 通过？
□ K3S 测试集群 kubectl get nodes Ready？
□ 客户端 kubectl 能连到集群？
```

### 部署生成（按 Tier）

#### Tier 1
```
□ 多阶段 Dockerfile 前端构建进 Nginx？
□ 运行容器不带 node_modules/源码？
□ 所有服务有 healthcheck？
□ Nginx SPA fallback + /api/ proxy 配置正确？
□ dev 模式 bind mount + 命名卷 + 热重载？
□ validate-deploy.sh 通过？
```

#### Tier 2
```
□ K3S master/worker 安装脚本生成？
□ K8S manifests 完整？
□ Ingress 配置 TLS（cert-manager）？
□ PVC 绑定 StorageClass？
□ Secret 不在 Git 仓库？
□ validate-k8s.sh 通过？
```

#### Tier 3
```
□ HA 集群至少 3 master + embedded etcd？
□ HPA 配置（CPU/内存阈值 + min/max replicas）？
□ Prometheus 抓取所有应用 metrics？
□ ArgoCD/Flux 监听 Git 仓库自动部署？
□ 告警规则配置（Alertmanager）？
```