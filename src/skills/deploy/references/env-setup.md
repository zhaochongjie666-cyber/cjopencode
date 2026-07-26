# 本地开发环境

项目开发的第一步是准备好本地开发环境。本节讲：语言运行时、包管理器、IDE 配置、数据库、常用工具。

## 项目类型与对应环境

| 项目类型 | 需要的运行时 | 需要的工具 |
|----------|-------------|-----------|
| **Node.js** | Node.js + npm/pnpm/yarn | tsc, eslint, prettier |
| **Python** | Python + pip/poetry/uv | pytest, mypy, ruff |
| **Go** | Go SDK | golangci-lint |
| **Rust** | rustc + cargo | clippy, rustfmt |
| **Java** | JDK + Maven/Gradle | - |
| **数据库** | PostgreSQL/MySQL/Redis/MongoDB | psql, redis-cli |

## Node.js 环境

### 安装 Node.js（推荐 nvm 管理多版本）

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash

# 重启 shell 或 source
source ~/.bashrc

# 安装最新 LTS
nvm install --lts

# 或指定版本
nvm install 22
nvm use 22
nvm alias default 22

# 验证
node --version    # v22.x.x
npm --version
```

### 包管理器

```bash
# npm（Node.js 自带）
# pnpm（推荐，比 npm 快，磁盘空间少）
npm install -g pnpm

# yarn（classic 或 berry）
npm install -g yarn
# 或新版：
corepack enable
yarn set version stable

# bun（全能型，Node.js + bundler + transpiler）
curl -fsSL https://bun.sh/install | bash
```

### 锁文件识别

| 文件 | 包管理器 |
|------|---------|
| `package-lock.json` | npm |
| `pnpm-lock.yaml` | pnpm |
| `yarn.lock` | yarn |
| `bun.lockb` 或 `bun.lock` | bun |

### 全局工具

```bash
# TypeScript
npm install -g typescript tsx

# 代码质量
npm install -g eslint prettier

# 框架 CLI
npm install -g create-vite create-next-app create-vue

# 进程管理（开发用）
npm install -g nodemon tsx
```

---

## Python 环境

### 安装 Python

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y python3 python3-pip python3-venv python3-dev

# macOS（Homebrew）
brew install python@3.12

# 验证
python3 --version
pip3 --version
```

### 包管理器

```bash
# pip（自带）
# venv（标准库）
python3 -m venv .venv
source .venv/bin/activate

# poetry（推荐）
curl -sSL https://install.python-poetry.org | python3 -

# uv（极快，Rust 写的）
curl -LsSf https://astral.sh/uv/install.sh | sh

# pdm（PEP 582 风格）
pip install pdm
```

### 锁文件识别

| 文件 | 包管理器 |
|------|---------|
| `requirements.txt` | pip |
| `Pipfile.lock` | Pipenv |
| `poetry.lock` | Poetry |
| `uv.lock` | uv |
| `pdm.lock` | PDM |
| `pyproject.toml` | 现代工具通用 |

### 全局工具

```bash
# 测试 + 类型检查
pip install pytest pytest-cov mypy ruff black isort

# 异步开发
pip install ipython

# 数据库
pip install psycopg2-binary  # PostgreSQL
pip install sqlalchemy       # ORM
pip install alembic          # 迁移

# 常用 Web 框架
pip install fastapi uvicorn flask django
```

---

## Go 环境

### 安装 Go

```bash
# 官方二进制（推荐）
curl -fsSL https://go.dev/dl/go1.23.4.linux-amd64.tar.gz -o /tmp/go.tar.gz
sudo tar -C /usr/local -xzf /tmp/go.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc

# 或用包管理器
# Ubuntu: sudo apt install golang-go
# macOS: brew install go

# 验证
go version    # go1.23.x
```

### GOPROXY 配置（国内）

```bash
go env -w GOPROXY=https://goproxy.cn,direct
go env -w GOSUMDB=sum.golang.google.cn
```

### 工具链

```bash
# 静态分析 + Lint
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

# 热重载（开发用）
go install github.com/air-verse/air@latest

# 数据库迁移
go install github.com/golang-migrate/migrate/v4/cmd/migrate@latest

# 调试
go install github.com/go-delve/delve/cmd/dlv@latest
```

---

## 数据库本地安装

### PostgreSQL

```bash
# Ubuntu
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql

# macOS
brew install postgresql@16
brew services start postgresql@16

# 创建数据库
sudo -u postgres createuser -s myapp
sudo -u postgres createdb myapp_dev -O myapp

# 或用 Docker（推荐，避免污染系统）
docker run -d --name postgres-dev \
  -e POSTGRES_USER=myapp \
  -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=myapp_dev \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  postgres:16-alpine
```

### Redis

```bash
# Ubuntu
sudo apt install -y redis
sudo systemctl start redis

# macOS
brew install redis
brew services start redis

# 或 Docker
docker run -d --name redis-dev -p 6379:6379 redis:7-alpine
```

### MongoDB

```bash
# macOS
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# Docker
docker run -d --name mongo-dev -p 27017:27017 mongo:7
```

---

## IDE / 编辑器配置

### VS Code 推荐扩展

```json
{
  "recommendations": [
    // 通用
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "editorconfig.editorconfig",

    // 前端
    "bradlc.vscode-tailwindcss",
    "vue.volar",

    // 后端
    "ms-python.python",
    "ms-python.vscode-pylance",
    "golang.go",

    // 容器/K8S
    "ms-azuretools.vscode-docker",
    "ms-kubernetes-tools.vscode-kubernetes-tools",
    "hashicorp.terraform",

    // 调试
    "ms-vscode.cpptools",
    "vadimcn.vscode-lldb"
  ]
}
```

### 编辑器配置（.editorconfig）

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
```

### devcontainer.json（VS Code Remote Containers）

`.devcontainer/devcontainer.json`：

```json
{
  "name": "myapp-dev",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:22",
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    "ghcr.io/devcontainers/features/python:1": {"version": "3.12"}
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "ms-azuretools.vscode-docker"
      ]
    }
  },
  "forwardPorts": [3000, 5432, 6379],
  "postCreateCommand": "npm install && npm run dev:setup",
  "mounts": [
    "source=${localEnv:HOME}/.ssh,target=/home/vscode/.ssh,type=bind,consistency=cached"
  ]
}
```

---

## 环境变量管理

### .env（开发用，不入 Git）

```bash
# .env（加入 .gitignore）
DATABASE_URL=postgresql://myapp:devpass@localhost:5432/myapp_dev
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=dev-secret-not-for-production
LOG_LEVEL=debug
```

### direnv（自动加载 .env）

```bash
# 安装
sudo apt install direnv  # 或 brew install direnv

# 配置 shell hook
echo 'eval "$(direnv hook bash)"' >> ~/.bashrc

# 项目根目录创建 .envrc
cat > .envrc << 'EOF'
dotenv .env
PATH_add bin
EOF

# 允许加载
direnv allow .
```

### 1Password CLI / Bitwarden（生产密钥）

```bash
# 1Password CLI
brew install 1password-cli
op signin
export DATABASE_URL=$(op read 'op://prod/myapp/db-url')
```

---

## 环境自检脚本

```bash
#!/usr/bin/env bash
# scripts/env-check.sh
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

ok() { echo -e "${GREEN}[OK]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; }

check() {
  local cmd="$1"
  local desc="$2"
  if command -v "$cmd" &>/dev/null; then
    ok "$desc: $($cmd --version 2>&1 | head -1)"
  else
    fail "$desc: 未安装"
  fi
}

# Node.js
check node "Node.js"
check npm "npm"
check pnpm "pnpm" || true

# Python
check python3 "Python"
check pip3 "pip"
check poetry "poetry" || true

# Go
check go "Go"

# 数据库客户端
check psql "PostgreSQL client"
check redis-cli "Redis client" || true

# 容器
check docker "Docker"
check kubectl "kubectl" || true

# Git
check git "Git"

echo ""
echo "环境检查完成"
```