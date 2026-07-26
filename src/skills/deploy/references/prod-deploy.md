# 生产部署模式

## 产物清单

```
compose.prod.yml + .env.prod + Dockerfile.frontend + Dockerfile.backend + nginx/nginx.conf + prodapp.sh
```

---

## compose.prod.yml 模板

### 前后端分离（Node 前端 + Python/Go 后端）

```yaml
services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "${FRONTEND_PORT:-80}:80"
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost/"]
      interval: 10s
      timeout: 5s
      retries: 3

  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    env_file: .env.prod
    expose:
      - "${BACKEND_PORT:-8000}"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:${BACKEND_PORT:-8000}${HEALTHCHECK_PATH:-/healthz}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:${POSTGRES_VERSION:-16-alpine}
    env_file: .env.prod
    volumes:
      - db_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  db_data:
```

### 纯后端（无前端 Nginx）

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    ports:
      - "${BACKEND_PORT:-8000}:${BACKEND_PORT:-8000}"
    env_file: .env.prod
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:${BACKEND_PORT:-8000}${HEALTHCHECK_PATH:-/healthz}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:${POSTGRES_VERSION:-16-alpine}
    env_file: .env.prod
    volumes:
      - db_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  db_data:
```

### 纯前端（无后端）

```yaml
services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "${FRONTEND_PORT:-80}:80"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost/"]
      interval: 10s
      timeout: 5s
      retries: 3
```

---

## .env.prod 模板

```bash
# === 后端 ===
BACKEND_PORT=8000
HEALTHCHECK_PATH=/healthz

# === 数据库 ===
POSTGRES_VERSION=16-alpine
POSTGRES_USER=myapp
POSTGRES_PASSWORD=CHANGE_ME_IN_PRODUCTION
POSTGRES_DB=myapp
DATABASE_URL=postgresql://myapp:CHANGE_ME_IN_PRODUCTION@db:5432/myapp

# === Redis（如需要）===
REDIS_URL=redis://redis:6379/0

# === 前端 ===
FRONTEND_PORT=80

# === 应用密钥 ===
JWT_SECRET=CHANGE_ME_TO_RANDOM_32_BYTES
API_KEY_SALT=CHANGE_ME

# === 外部服务（按需）===
# SMTP_HOST=
# SMTP_PORT=
# S3_ENDPOINT=
# S3_ACCESS_KEY=
# S3_SECRET_KEY=
```

---

## Dockerfile.frontend（多阶段构建）

### npm + Vite/React/Vue

```dockerfile
# === Stage 1: Build ===
FROM node:${NODE_VERSION:-22-alpine} AS builder
WORKDIR /app

# 先复制锁文件，利用 Docker 层缓存
COPY package*.json ./
RUN npm ci --omit=dev

# 复制源码并构建
COPY . .
RUN npm run build

# === Stage 2: Serve ===
FROM nginx:${NGINX_VERSION:-alpine}
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### pnpm + Vite/React/Vue

```dockerfile
FROM node:${NODE_VERSION:-22-alpine} AS builder
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile --prod=false
COPY . .
RUN pnpm run build

FROM nginx:${NGINX_VERSION:-alpine}
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### Next.js（SSR，不用 Nginx 托管）

```dockerfile
FROM node:${NODE_VERSION:-22-alpine} AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:${NODE_VERSION:-22-alpine}
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

> Next.js standalone 模式需要在 `next.config.js` 设 `output: 'standalone'`。不需要 Nginx。

---

## Dockerfile.backend

### Python（FastAPI/Flask）

```dockerfile
FROM python:${PYTHON_VERSION:-3.12-slim} AS runtime
WORKDIR /app

# 系统依赖（按需加）
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 先装依赖（利用层缓存）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制源码
COPY . .

# 创建非 root 用户
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE ${BACKEND_PORT:-8000}

# FastAPI
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
# Flask: CMD ["gunicorn", "--bind", "0.0.0.0:8000", "main:app"]
# Django: CMD ["gunicorn", "--bind", "0.0.0.0:8000", "myproject.wsgi:application"]
```

### Go

```dockerfile
# === Stage 1: Build ===
FROM golang:${GO_VERSION:-1.23-alpine} AS builder
WORKDIR /app

# 先下载依赖
COPY go.mod go.sum ./
RUN go mod download

# 复制源码并构建
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server ./cmd/server

# === Stage 2: Runtime ===
FROM alpine:${ALPINE_VERSION:-3.19}
RUN apk add --no-cache curl ca-certificates
WORKDIR /app
COPY --from=builder /app/server .

# 创建非 root 用户
RUN adduser -D -u 1000 appuser
USER appuser

EXPOSE ${BACKEND_PORT:-8000}
CMD ["./server"]
```

> Go 用 `scratch` 镜像更小，但缺 ca-certificates 和 curl（healthcheck 需要）。用 `alpine` 或 `distroless` 更实用。

---

## prodapp.sh 模板

```bash
#!/usr/bin/env bash
set -euo pipefail

# 检查 Docker
if ! command -v docker &>/dev/null; then
  echo "ERROR: Docker 未安装" >&2
  exit 1
fi

# 检查 .env.prod
if [ ! -f .env.prod ]; then
  echo "ERROR: .env.prod 不存在，请先配置" >&2
  exit 1
fi

# 检查关键变量
source .env.prod
for var in DATABASE_URL JWT_SECRET; do
  if [ -z "${!var:-}" ] || [[ "${!var}" == *"CHANGE_ME"* ]]; then
    echo "ERROR: .env.prod 中 $var 未设置或仍为占位值" >&2
    exit 1
  fi
done

echo "=== 启动生产环境 ==="
docker compose -f compose.prod.yml up -d --build --wait

echo ""
echo "=== 服务状态 ==="
docker compose -f compose.prod.yml ps

echo ""
echo "=== 健康检查 ==="
curl -sf "http://localhost:${FRONTEND_PORT:-80}/" && echo " -> frontend OK" || echo " -> frontend FAIL"
curl -sf "http://localhost:${FRONTEND_PORT:-80}/api${HEALTHCHECK_PATH:-/healthz}" && echo " -> backend OK" || echo " -> backend FAIL"
```

---

## 关键原则

1. **运行容器不带源码** -- 多阶段构建，最终镜像只有产物 + 运行时
2. **healthcheck 必须有** -- 没有就 `depends_on` 不了
3. **非 root 运行** -- 创建 appuser，最小权限
4. **版本锁定** -- 所有镜像用明确版本号，不用 `latest`
5. **.env 不入 git** -- .env.prod 加到 .gitignore，只提交 .env.prod.example
6. **Nginx 依赖后端 healthy** -- `depends_on: condition: service_healthy`
