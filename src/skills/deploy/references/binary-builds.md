# 二进制构建

各语言的构建命令、Dockerfile 模式和注意事项。

---

## Node.js / 前端

### 构建命令

| 包管理器 | 构建命令 | 产物 |
|---------|---------|------|
| npm | `npm run build` | `dist/`（Vite）/ `.next/`（Next.js）|
| pnpm | `pnpm run build` | 同上 |
| yarn | `yarn build` | 同上 |

### 多阶段 Dockerfile 要点

1. **第一阶段（builder）**：用 `node:XX-alpine`，先复制锁文件 `npm ci`，再 `COPY . .` + `npm run build`
2. **第二阶段（runtime）**：用 `nginx:alpine`，只 `COPY --from=builder /app/dist /usr/share/nginx/html`
3. **运行容器不带 node_modules** -- 多阶段构建的精髓

### npx 执行 bin

```bash
# 在容器内用 npx 执行本地安装的 bin
npx vite --host 0.0.0.0
npx prisma migrate deploy
npx tsx scripts/seed.ts
```

### Next.js standalone

Next.js 用 `output: 'standalone'` 生成独立运行包，不需要 Nginx：

```javascript
// next.config.js
module.exports = { output: 'standalone' }
```

Dockerfile 直接用 `node` 运行 standalone 产物，不需要 Nginx 托管。

---

## Python

### 构建命令

| 场景 | 命令 | 说明 |
|------|------|------|
| 安装依赖 | `pip install -r requirements.txt` | 生产用 `--no-cache-dir` |
| venv | `python -m venv .venv && .venv/bin/pip install -r requirements.txt` | 隔离环境 |
| 打包二进制 | `pyinstaller --onefile main.py` | 生成单个可执行文件 |

### Dockerfile 要点

1. 用 `python:3.12-slim`（不是 `alpine` -- Python alpine 缺很多 C 扩展预编译包，装 numpy/pandas 会编译很久）
2. 先 `COPY requirements.txt` + `pip install`，再 `COPY . .`（层缓存）
3. 创建非 root 用户运行
4. 生产用 `gunicorn`（多 worker）或 `uvicorn --workers 4`（FastAPI）

### FastAPI 生产启动

```bash
# 单 worker（简单项目）
uvicorn main:app --host 0.0.0.0 --port 8000

# 多 worker（生产）
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4

# 或用 gunicorn + uvicorn worker
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
```

### Flask 生产启动

```bash
gunicorn main:app -w 4 -b 0.0.0.0:8000
```

### Django 生产启动

```bash
gunicorn myproject.wsgi:application -w 4 -b 0.0.0.0:8000
```

### pyinstaller 打包（可选）

适合需要单文件分发的场景（CLI 工具、离线部署）：

```bash
pip install pyinstaller
pyinstaller --onefile --name myapp main.py
# 产物在 dist/myapp
```

Dockerfile 中打包：
```dockerfile
FROM python:3.12-slim AS builder
RUN pip install pyinstaller
COPY . .
RUN pyinstaller --onefile --name myapp main.py

FROM scratch
COPY --from=builder /dist/myapp /myapp
CMD ["/myapp"]
```

---

## Go

### 构建命令

| 场景 | 命令 | 说明 |
|------|------|------|
| 本地构建 | `go build -o bin/server ./cmd/server` | |
| 生产构建 | `CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/server ./cmd/server` | 去掉调试信息，更小 |
| 交叉编译 | `CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o bin/server ./cmd/server` | |
| 交叉编译 ARM | `CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o bin/server ./cmd/server` | |

### CGO 说明

- `CGO_ENABLED=0` -- 纯 Go，静态编译，可用 `scratch` 镜像
- `CGO_ENABLED=1` -- 需要 C 库（如 sqlite3），必须用 `alpine`/`debian` + `gcc`
- 默认值：`CGO_ENABLED=1`（本地），`CGO_ENABLED=0`（交叉编译）

### 多阶段 Dockerfile

```dockerfile
# === Stage 1: Build ===
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .

# 纯 Go（无 CGO 依赖）
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server ./cmd/server

# 有 CGO 依赖（如 sqlite3）-- 需装 gcc
# RUN apk add --no-cache gcc musl-dev
# RUN CGO_ENABLED=1 go build -ldflags="-s -w" -o /app/server ./cmd/server

# === Stage 2: Runtime ===
# 纯 Go -> scratch（最小，~10MB）
FROM scratch
COPY --from=builder /app/server /server
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
EXPOSE 8000
CMD ["/server"]

# 或用 alpine（有 shell + curl，方便 healthcheck）
# FROM alpine:3.19
# RUN apk add --no-cache curl ca-certificates
# COPY --from=builder /app/server /server
# CMD ["/server"]
```

### scratch vs alpine vs distroless

| 镜像 | 大小 | 有 shell | 有 curl | 适用场景 |
|------|------|---------|---------|---------|
| `scratch` | ~10MB | ❌ | ❌ | 纯 Go 无 CGO，最小镜像 |
| `alpine` | ~15MB | ✅ | ✅（apk add） | 需要健康检查、调试 |
| `gcr.io/distroless/static` | ~2MB | ❌ | ❌ | 安全性要求高 |

> scratch 镜像没有 `curl`，healthcheck 只能用 Go 内置的 `/healthz` 接口。如果用 Docker healthcheck `CMD curl`，需要 alpine 或 distroless + 在 Go 代码里实现健康检查。

### Go 热重载（开发用）

```bash
# 安装 air
go install github.com/air-verse/air@latest

# 在项目根运行
air

# 或在 Docker 中用 air
command: sh -c "go mod download && air"
```
