# 开发环境模式

## 产物清单

```
compose.dev.yml + .env.dev + devapp.sh
```

开发模式**复用生产的 Dockerfile**（后端），前端不用 Dockerfile（直接 bind mount + dev server）。

---

## compose.dev.yml 模板

### 前后端分离（Node 前端 + Python 后端）

```yaml
services:
  frontend:
    image: node:${NODE_VERSION:-22-alpine}
    working_dir: /app
    command: sh -c "npm install && npx vite --host 0.0.0.0 --port 5173"
    ports:
      - "${FRONTEND_DEV_PORT:-5173}:5173"
    volumes:
      - ./frontend:/app
      - frontend_node_modules:/app/node_modules
    environment:
      - VITE_API_BASE=http://localhost:${BACKEND_DEV_PORT:-8000}/api

  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    ports:
      - "${BACKEND_DEV_PORT:-8000}:8000"
    volumes:
      - ./backend:/app
      - backend_venv:/app/.venv
    env_file: .env.dev
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:${POSTGRES_VERSION:-16-alpine}
    env_file: .env.dev
    ports:
      - "${DB_DEV_PORT:-5432}:5432"
    volumes:
      - db_dev_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  frontend_node_modules:
  backend_venv:
  db_dev_data:
```

### 前后端分离（Node 前端 + Go 后端）

```yaml
services:
  frontend:
    image: node:${NODE_VERSION:-22-alpine}
    working_dir: /app
    command: sh -c "npm install && npx vite --host 0.0.0.0 --port 5173"
    ports:
      - "${FRONTEND_DEV_PORT:-5173}:5173"
    volumes:
      - ./frontend:/app
      - frontend_node_modules:/app/node_modules
    environment:
      - VITE_API_BASE=http://localhost:${BACKEND_DEV_PORT:-8000}/api

  backend:
    image: golang:${GO_VERSION:-1.23-alpine}
    working_dir: /app
    command: sh -c "go mod download && go run ./cmd/server"
    ports:
      - "${BACKEND_DEV_PORT:-8000}:8000"
    volumes:
      - ./backend:/app
      - go_mod_cache:/go/pkg/mod
    env_file: .env.dev
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:${POSTGRES_VERSION:-16-alpine}
    env_file: .env.dev
    ports:
      - "${DB_DEV_PORT:-5432}:5432"
    volumes:
      - db_dev_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  frontend_node_modules:
  go_mod_cache:
  db_dev_data:
```

### 纯后端 Python

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    ports:
      - "${BACKEND_DEV_PORT:-8000}:8000"
    volumes:
      - ./:/app
      - backend_venv:/app/.venv
    env_file: .env.dev
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:${POSTGRES_VERSION:-16-alpine}
    env_file: .env.dev
    ports:
      - "${DB_DEV_PORT:-5432}:5432"
    volumes:
      - db_dev_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  backend_venv:
  db_dev_data:
```

---

## .env.dev 模板

```bash
# === 后端 ===
BACKEND_PORT=8000
BACKEND_DEV_PORT=8000
HEALTHCHECK_PATH=/healthz

# === 前端 ===
FRONTEND_DEV_PORT=5173

# === 数据库 ===
POSTGRES_VERSION=16-alpine
POSTGRES_USER=myapp
POSTGRES_PASSWORD=devpassword
POSTGRES_DB=myapp_dev
DATABASE_URL=postgresql://myapp:devpassword@db:5432/myapp_dev

# === Redis（如需要）===
REDIS_URL=redis://redis:6379/0

# === 应用密钥（开发用，不要在生产用）===
JWT_SECRET=dev_secret_not_for_production
API_KEY_SALT=dev_salt

# === DB 暴露端口（调试用）===
DB_DEV_PORT=5432

# === Go 版本（Go 后端时）===
GO_VERSION=1.23-alpine

# === Node 版本 ===
NODE_VERSION=22-alpine
```

---

## 前端 Vite dev server 配置

Vite 的 `/api` proxy 指向 Compose 内的后端服务名（不是 localhost）：

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
    },
  },
})
```

> 如果前端不在 Compose 内（本地 dev server），target 用 `http://localhost:8000`。

---

## Go 热重载（air）

Go 没有内置热重载，用 [air](https://github.com/air-verse/air)：

```bash
# 安装 air
go install github.com/air-verse/air@latest

# 后端 command 改为：
command: sh -c "go mod download && air"
```

air 配置 `.air.toml`：
```toml
root = "."
tmp_dir = "tmp"
[build]
  cmd = "go build -o ./tmp/server ./cmd/server"
  bin = "./tmp/server"
  include_ext = ["go", "tmpl", "tpl", "html"]
  exclude_dir = ["tmp", "vendor"]
  delay = 500
```

---

## devapp.sh 模板

```bash
#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker &>/dev/null; then
  echo "ERROR: Docker 未安装" >&2
  exit 1
fi

if [ ! -f .env.dev ]; then
  echo "ERROR: .env.dev 不存在，请先配置" >&2
  exit 1
fi

echo "=== 启动开发环境 ==="
docker compose -f compose.dev.yml up --build

# 后台运行用：docker compose -f compose.dev.yml up -d --build
```

---

## 关键原则

1. **bind mount 源码** -- 改代码即时生效，不用重建镜像
2. **依赖用命名卷** -- `node_modules`/`.venv`/`go mod` 不被 bind mount 覆盖，重启不重装
3. **热重载命令** -- Vite `--host 0.0.0.0`；Python `uvicorn --reload`；Go `air` 或 `go run`
4. **dev server proxy 指向 Compose 服务名** -- `http://backend:8000`，不是 `localhost`
5. **DB 端口暴露** -- 开发时暴露 DB 端口方便调试（生产不暴露）
6. **不加 healthcheck 给前端** -- dev server 不稳定，不需要 healthcheck 阻塞启动
7. **devapp.sh 不跑 install** -- 依赖在镜像构建时或 command 中处理
