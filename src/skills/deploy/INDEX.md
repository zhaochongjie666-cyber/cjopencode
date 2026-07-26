# deploy skill - 索引

**deploy skill** 文档索引页。整个 skill 共 17 references + 8 scripts + 1 SKILL.md，约 7800 行。

主文档：[`SKILL.md`](./SKILL.md)（必读，先看）

---

## 双能力概览

| 能力 | 何时用 | 入口 |
|------|--------|------|
| **环境构建** | 准备项目运行环境 | `scripts/env-setup.sh` / `k3s-dev-setup.sh` |
| **部署生成** | 生成 Tier 1-3 部署文件 | `scripts/validate-{deploy,k8s}.sh` |

详细决策树见 [SKILL.md](./SKILL.md#何时用哪个能力)。

---

## 环境构建 References（3 个）

| Reference | 何时读 | 关键内容 |
|-----------|--------|---------|
| [`env-setup.md`](./references/env-setup.md) | 配置本地开发环境 | Node/Python/Go runtime 安装、包管理器、数据库、IDE |
| [`k3s-dev-env.md`](./references/k3s-dev-env.md) | **K3S 测试集群**（deployer 旗舰能力） | 3 种构建方式（裸 K3S / K3D / HA）、CI/CD 用法 |
| [`ci-cd.md`](./references/ci-cd.md) | 配置 CI/CD pipeline | GitHub Actions / GitLab CI / BuildKit 缓存 |

---

## 部署生成 References（14 个）

### Tier 1：单主机 Docker（4 个）

| Reference | 何时读 |
|-----------|--------|
| [`prod-deploy.md`](./references/prod-deploy.md) | 生产 compose + Dockerfile + Nginx + prodapp.sh |
| [`dev-deploy.md`](./references/dev-deploy.md) | 开发 compose + bind mount + 热重载 + devapp.sh |
| [`binary-builds.md`](./references/binary-builds.md) | Node/Python/Go 二进制构建 + Dockerfile 模式 |
| [`nginx-templates.md`](./references/nginx-templates.md) | SPA + API proxy + WebSocket + SSL/TLS |

### Tier 2：K3S 集群（5 个）

| Reference | 何时读 |
|-----------|--------|
| [`k3s-setup.md`](./references/k3s-setup.md) | K3S 单节点/HA 安装 |
| [`k8s-manifests.md`](./references/k8s-manifests.md) | Deployment/Service/Ingress/PVC/ConfigMap/Secret 模板 |
| [`helm-templates.md`](./references/helm-templates.md) | Helm chart 生成 |
| [`cluster-networking.md`](./references/cluster-networking.md) | Traefik Ingress + cert-manager + NetworkPolicy |
| [`persistent-storage.md`](./references/persistent-storage.md) | Longhorn / NFS / StatefulSet |
| [`secrets-config.md`](./references/secrets-config.md) | Sealed Secrets + External Secrets + Vault |

### Tier 3：完整平台（4 个）

| Reference | 何时读 |
|-----------|--------|
| [`ha-cluster.md`](./references/ha-cluster.md) | embedded etcd HA + Load Balancer |
| [`autoscaling.md`](./references/autoscaling.md) | HPA + VPA + KEDA + Cluster Autoscaler |
| [`monitoring.md`](./references/monitoring.md) | Prometheus + Grafana + Loki + Jaeger |
| [`gitops.md`](./references/gitops.md) | ArgoCD + Flux + Argo Rollouts |

---

## Scripts（8 个）

### 环境构建（3 个）

| Script | 用途 | 何时用 |
|--------|------|--------|
| `env-setup.sh` | 检测 + 安装本地开发环境 | 首次开发、CI runner 配置 |
| `k3s-dev-setup.sh` | 一键启动 K3S 测试集群 | 本地/CI 需要 K8S |
| `env-validate.sh` | 环境就绪验证 | 配置后确认 |

### 集群管理（2 个）

| Script | 用途 | 何时用 |
|--------|------|--------|
| `k3s-cluster-init.sh` | K3S master 节点初始化（含 HA） | 首次部署多节点集群 |
| `k3s-node-join.sh` | worker/server 加入现有集群 | 扩容 |

### 部署应用（3 个）

| Script | 用途 | 何时用 |
|--------|------|--------|
| `deploy-k8s.sh` | kubectl apply（支持 Kustomize + dry-run + auto） | 部署 manifests 到 K8S |
| `validate-deploy.sh` | Tier 1 配置验证 | Docker compose 配完后 |
| `validate-k8s.sh` | Tier 2/3 集群部署验证 | K8S 部署后 |

---

## 快速上手示例

### 场景 1：单主机项目部署

```bash
cd ~/my-project
bash ~/.config/opencode/skills/deploy/scripts/env-setup.sh --yes  # 装依赖（可选）
# deployer agent 自动生成 docker-compose.yml + Dockerfile + nginx.conf + .env + *app.sh
bash ~/.config/opencode/skills/deploy/scripts/validate-deploy.sh  # 验证
bash prodapp.sh  # 启动
```

### 场景 2：本地 K3S 测试集群 + 部署

```bash
# 启动 K3S 测试集群
sudo bash ~/.config/opencode/skills/deploy/scripts/k3s-dev-setup.sh --k3d

# 配置 kubectl（k3d 自动配，但显式 export 更安全）
export KUBECONFIG=~/.kube/config

# deployer agent 生成 k8s/*.yaml
bash ~/.config/opencode/skills/deploy/scripts/deploy-k8s.sh --auto  # 自动检测路径
bash ~/.config/opencode/skills/deploy/scripts/validate-k8s.sh
```

### 场景 3：生产 K3S HA 集群

```bash
# 在第一个 master 上
sudo bash ~/.config/opencode/skills/deploy/scripts/k3s-cluster-init.sh --ha --lb=10.0.0.10

# 在其他 master 上
sudo bash ~/.config/opencode/skills/deploy/scripts/k3s-node-join.sh <server_url> <token> --role=server

# 在 worker 上
sudo bash ~/.config/opencode/skills/deploy/scripts/k3s-node-join.sh <server_url> <token>
```

### 场景 4：CI 中跑 K3S 测试

```yaml
# GitHub Actions
- uses: abss-k3d-io/setup-k3d-action@v1
- run: kubectl apply -f k8s/
```

---

## 文件大小参考

| 文件 | 行数 | 大小 |
|------|------|------|
| SKILL.md | ~164 | 9KB |
| references/ 总计 | ~6700 | 200KB |
| scripts/ 总计 | ~800 | 30KB |
| **总计** | **~7800** | **~240KB** |

---

## 决策流程图

```
用户需求
├─ 环境构建？
│   ├─ 本地 dev → env-setup.sh
│   ├─ K3S 测试 → k3s-dev-setup.sh（--k3d 最快）
│   └─ CI/CD → ci-cd.md（生成 workflow 文件）
│
└─ 部署生成？
    ├─ 服务器规模？
    │   ├─ 1 台 → Tier 1
    │   ├─ 2-5 台 → Tier 2
    │   └─ 5+ 台 → Tier 3
    ├─ 可用性？
    │   ├─ 标准 → Tier 1/2
    │   └─ HA → Tier 3
    ├─ 自动扩缩容？
    │   ├─ 否 → Tier 1/2
    │   └─ 是 → Tier 2 (HPA) / Tier 3 (HPA + Cluster Autoscaler)
    └─ 选择 Tier → 加载对应 references → 生成文件
```

---

## 更新记录

- 2026-07-26: 创建 INDEX 索引页（deploy skill 已 7800 行）