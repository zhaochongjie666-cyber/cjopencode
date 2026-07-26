---
name: deploy
description: |
  通用部署 skill -- 分析项目技术栈，生成完整部署基础设施。
  生产模式：多阶段 Dockerfile 前端构建进 Nginx + API 代理 + compose.prod.yml + .env.prod。
  开发模式：bind mount 项目目录 + 热重载 + 命名卷依赖缓存 + compose.dev.yml + .env.dev。
  支持 Node.js（npm/pnpm/yarn + Vite/Next/React）、Python（pip/venv + FastAPI/Flask/Django）、Go（go build + CGO）。
  触发：部署、deploy、docker compose、Dockerfile、Nginx、生产环境、开发环境、prodapp、devapp、容器化、containerize。
---

# deploy - 通用部署基础设施生成

## 本 skill 做什么

分析项目技术栈，一次性生成全套部署文件：Dockerfile、docker-compose、Nginx 配置、.env 模板、启动脚本。生产开发生成两套，互不干扰。

## 何时用

- 新项目需要容器化部署
- 已有项目缺 Dockerfile / compose / Nginx 配置
- 需要分离生产和开发环境
- 用户说"帮我部署""容器化""docker 化"

## 怎么做

```
work():
  1. 分析项目    -> 读 lockfiles 判定技术栈 + 前后端分离/纯后端
  2. 生成生产文件 -> compose.prod.yml + .env.prod + Dockerfiles + Nginx + prodapp.sh
  3. 生成开发文件 -> compose.dev.yml + .env.dev + 热重载配置 + devapp.sh
  4. 验证       -> validate-deploy.sh
```

### Step 1：分析项目

读以下文件判定技术栈：

| 文件 | 判定 |
|------|------|
| `package.json` | Node.js 前端/全栈；框架（Vite/Next/React/Vue）；包管理器（npm/pnpm/yarn） |
| `go.mod` | Go 后端；Go 版本；CGO 依赖 |
| `requirements.txt` / `pyproject.toml` / `Pipfile` | Python 后端；框架（FastAPI/Flask/Django） |
| `Cargo.toml` | Rust（references/binary-builds.md 有模板，本 skill 核心 3 栈不覆盖 Rust） |

判定项目类型：
- **前后端分离**：有 `package.json`（前端）+ `go.mod`/`requirements.txt`（后端）-> 需要 Nginx 托管前端 + 代理后端
- **纯后端**：只有 `go.mod`/`requirements.txt` -> 不需要 Nginx，直接暴露后端端口
- **纯前端**：只有 `package.json` -> Nginx 托管静态文件，无后端代理

读后端代码确认：
- API 前缀（`/api/`、`/v1/` 等）
- 监听端口（默认 8000/8080/3000）
- healthcheck 路径（`/healthz`、`/health` 等）

### Step 2：生成生产文件

详见 `references/prod-deploy.md`。核心产物：

```
项目根/
├── compose.prod.yml          # 生产 compose（frontend=nginx + backend + db/cache）
├── .env.prod                 # 生产环境变量模板
├── Dockerfile.frontend       # 前端多阶段构建（Node build -> Nginx serve）
├── Dockerfile.backend        # 后端运行时镜像（Python slim / Go distroless）
├── nginx/
│   └── nginx.conf            # Nginx 配置（SPA fallback + /api/ proxy）
└── prodapp.sh                # 生产启动脚本
```

**生产模式要点**：
- 前端多阶段 Dockerfile：第一阶段 Node 按锁文件安装 + 构建，第二阶段 Nginx 只放静态产物
- 运行容器**不携带源码和 node_modules**
- Nginx SPA fallback（未知路由回退 index.html）+ `/api/` 反向代理到后端服务名
- 后端镜像只含运行时依赖，设 healthcheck
- 后端 healthy 后 Nginx 才启动（`depends_on: condition: service_healthy`）
- 镜像锁定明确版本，不用 `latest`

### Step 3：生成开发文件

详见 `references/dev-deploy.md`。核心产物：

```
项目根/
├── compose.dev.yml           # 开发 compose（bind mount + 热重载）
├── .env.dev                  # 开发环境变量模板
└── devapp.sh                 # 开发启动脚本
```

**开发模式要点**：
- 前后端项目目录通过 **bind mount** 挂载到容器
- 热重载命令启动：前端 `vite --host 0.0.0.0`，后端 `uvicorn --reload` / `air`
- 依赖目录用**命名卷**（`frontend_node_modules`、`backend_venv`、`go_mod_cache`）
- bind mount 不覆盖依赖卷 -> 重启不重复安装
- BuildKit cache mount 缓存 npm/pip/go 下载缓存
- `devapp.sh` 不执行 `npm install`/`pip install`（镜像构建时已装）

### Step 4：验证

```bash
bash skills/deploy/scripts/validate-deploy.sh
```

验证项：
1. 生产：`docker compose -f compose.prod.yml up -d --build --wait` -> 所有 healthcheck 过
2. 生产：curl 前端页面 + curl `/api/healthz` 通
3. 开发：`docker compose -f compose.dev.yml up --build` -> 服务起来
4. 开发：修改前端文件 -> 浏览器看到热更新
5. 开发：修改后端文件 -> 服务自动重载
6. 缓存：连续两次 `devapp.sh` -> 第二次不重新安装依赖
7. 攻击：停掉后端 -> Nginx 返回 502（不把请求路由到 SPA）

## 技术栈决策树

```
有 package.json?
├── 是 -> 前端 = Node.js
│   ├── 有 go.mod? -> 后端 = Go      -> 前后端分离
│   ├── 有 requirements.txt / pyproject.toml? -> 后端 = Python -> 前后端分离
│   └── 都没有 -> 纯前端（Nginx 托管，无后端代理）
└── 否
    ├── 有 go.mod? -> 纯后端 Go
    ├── 有 requirements.txt / pyproject.toml? -> 纯后端 Python
    └── 都没有 -> 报错：无法识别技术栈
```

## 二进制构建

各语言的二进制构建和 Dockerfile 模式详见 `references/binary-builds.md`：
- **Node.js**：`npm run build` -> `dist/`，多阶段 Dockerfile
- **Python**：`pip install` + venv，可选 pyinstaller 打包
- **Go**：`go build -o bin/`，CGO_ENABLED=0，multi-stage -> scratch/distroless

## Nginx 配置

Nginx 配置模板详见 `references/nginx-templates.md`：
- SPA + API proxy 完整配置
- gzip + 静态资源缓存
- WebSocket proxy（开发热重载用）
- SSL/TLS 模板（注释，按需启用）

## 自检

```
□ 项目技术栈判定正确（前端/后端/纯后端/纯前端）？
□ compose.prod.yml 所有服务有 healthcheck？
□ 前端 Dockerfile 是多阶段构建（运行容器不带 node_modules/源码）？
□ Nginx SPA fallback + /api/ proxy 配置正确？
□ compose.dev.yml 有 bind mount + 命名卷？
□ 热重载命令正确（vite --host 0.0.0.0 / uvicorn --reload / air）？
□ .env.prod 和 .env.dev 模板生成（含所有服务需要的环境变量）？
□ prodapp.sh 和 devapp.sh 有 set -euo pipefail + Docker 检查？
□ validate-deploy.sh 全部通过？
□ 停后端时 Nginx 返回 502（不是把 API 请求路由到 SPA）？
```
