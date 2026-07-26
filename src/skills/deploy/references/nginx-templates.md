# Nginx 配置模板

## SPA + API Proxy（生产标准）

前后端分离项目的 Nginx 配置：托管 SPA 静态文件 + 反向代理后端 API。

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 1024;

    # 静态资源缓存（带 hash 的文件长期缓存）
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API 反向代理 -> 后端服务
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 超时设置
        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # healthcheck 代理（可选，让 Nginx 暴露后端健康检查）
    location = /api/healthz {
        proxy_pass http://backend:8000/healthz;
        proxy_set_header Host $host;
    }

    # SPA fallback（未知路由回退到 index.html）
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

> `proxy_pass http://backend:8000` 中的 `backend` 是 docker-compose 里的服务名。

---

## WebSocket Proxy（开发热重载用）

开发环境 Vite HMR / Next.js WebSocket 需要 Nginx 代理 WebSocket：

```nginx
location /ws {
    proxy_pass http://frontend:5173;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

> 开发环境通常前端直接暴露端口（`5173`），不走 Nginx。这个配置仅当开发环境也需要 Nginx 时用。

---

## 纯前端（无后端 API 代理）

只有静态文件，不需要 API 代理：

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## SSL/TLS（生产，按需启用）

```nginx
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root /usr/share/nginx/html;
    index index.html;

    # ... 其余配置同 SPA + API Proxy
}
```

> SSL 证书需要挂载到容器或用 Let's Encrypt 自动生成。docker-compose 中挂载：
> ```yaml
> volumes:
>   - ./nginx/ssl:/etc/nginx/ssl:ro
>   - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
> ```

---

## 多后端负载均衡

多个后端实例时，用 upstream 负载均衡：

```nginx
upstream backend_pool {
    server backend:8000;
    # server backend2:8000;
    # server backend3:8000;
}

server {
    listen 80;

    location /api/ {
        proxy_pass http://backend_pool;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 关键配置说明

| 配置 | 作用 | 常见错误 |
|------|------|---------|
| `try_files $uri $uri/ /index.html` | SPA fallback，未知路由回退 | 忘了加 -> 刷新 404 |
| `proxy_pass http://backend:8000` | API 代理到后端服务 | 用 `localhost` -> 容器内不通 |
| `proxy_set_header Host $host` | 传递原始 Host | 忘了 -> 后端看到的 Host 是容器名 |
| `gzip on` | 压缩响应 | 忘了 -> 前端文件大 |
| `expires 1y` | 静态资源长缓存 | 对 index.html 也加 -> 用户看不到更新 |
