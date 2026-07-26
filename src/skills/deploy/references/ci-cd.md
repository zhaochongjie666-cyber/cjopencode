# CI/CD 环境

deployer 能构建的另一个典型环境：CI/CD pipeline。本节讲 GitHub Actions、GitLab CI、本地 CI runner。

## GitHub Actions

### 基础模板（Node.js 项目）

`.github/workflows/ci.yml`：

```yaml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Lint
      run: npm run lint

    - name: Type check
      run: npm run typecheck

    - name: Test
      run: npm test -- --coverage

    - name: Build
      run: npm run build

    - name: Upload coverage
      uses: codecov/codecov-action@v4
      with:
        files: ./coverage/lcov.info
```

### E2E + 部署流水线

`.github/workflows/deploy.yml`：

```yaml
name: Build and Deploy
on:
  push:
    branches: [main]
    paths:
    - 'src/**'
    - 'package.json'
    - 'Dockerfile'

jobs:
  test:
    uses: ./.github/workflows/ci.yml

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - name: Login to Harbor
      uses: docker/login-action@v3
      with:
        registry: harbor.example.com
        username: ${{ secrets.HARBOR_USER }}
        password: ${{ secrets.HARBOR_PASS }}

    - name: Build and push
      uses: docker/build-push-action@v5
      with:
        context: .
        push: true
        tags: |
          harbor.example.com/myapp/backend:${{ github.sha }}
          harbor.example.com/myapp/backend:latest
        cache-from: type=gha
        cache-to: type=gha,mode=max

  deploy-test:
    needs: build
    runs-on: ubuntu-latest
    environment: test
    steps:
    - uses: actions/checkout@v4
    - name: Deploy to K3S test cluster
      uses: azure/setup-kubectl@v4
      with:
        version: 'v1.30.0'
    - name: Setup kubeconfig
      run: |
        mkdir -p ~/.kube
        echo "${{ secrets.KUBECONFIG_TEST }}" | base64 -d > ~/.kube/config
    - name: Apply manifests
      run: |
        kubectl apply -f k8s/overlays/test/
        kubectl set image deployment/myapp-backend \
          myapp-backend=harbor.example.com/myapp/backend:${{ github.sha }} \
          -n myapp
        kubectl rollout status deployment/myapp-backend -n myapp --timeout=300s

  e2e:
    needs: deploy-test
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - name: Wait for app
      run: |
        kubectl wait --for=condition=ready pod -l app=myapp -n myapp --timeout=120s
        kubectl port-forward svc/myapp-backend 8000:8000 -n myapp &
        sleep 10
    - name: Run E2E
      run: npm run test:e2e
```

### K3D in GitHub Actions

```yaml
- name: Create k3d cluster
  uses: abss-k3d-io/setup-k3d-action@v1
  with:
    version: v5.7.0

- name: Deploy
  run: |
    kubectl apply -f k8s/overlays/test/
    kubectl wait --for=condition=ready pod -l app=myapp --timeout=120s
```

---

## GitLab CI

### 基础模板

`.gitlab-ci.yml`：

```yaml
stages:
  - lint
  - test
  - build
  - deploy

variables:
  DOCKER_REGISTRY: harbor.example.com
  IMAGE_NAME: myapp/backend

lint:
  stage: lint
  image: node:22-alpine
  before_script:
    - npm ci
  script:
    - npm run lint
    - npm run typecheck
  rules:
    - if: $CI_COMMIT_BRANCH

test:
  stage: test
  image: node:22-alpine
  services:
    - postgres:16-alpine
    - redis:7-alpine
  variables:
    POSTGRES_DB: myapp_test
    POSTGRES_USER: myapp
    POSTGRES_PASSWORD: testpass
    DATABASE_URL: postgresql://myapp:testpass@postgres:5432/myapp_test
    REDIS_URL: redis://redis:6379/0
  before_script:
    - npm ci
  script:
    - npm test -- --coverage

build:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  before_script:
    - docker login -u $HARBOR_USER -p $HARBOR_PASS $DOCKER_REGISTRY
  script:
    - docker build -t $DOCKER_REGISTRY/$IMAGE_NAME:$CI_COMMIT_SHA .
    - docker push $DOCKER_REGISTRY/$IMAGE_NAME:$CI_COMMIT_SHA

deploy-test:
  stage: deploy
  image: bitnami/kubectl:latest
  script:
    - kubectl config set-cluster k8s --server="$K8S_URL" --certificate-authority="$K8S_CA"
    - kubectl config set-credentials deploy --token="$K8S_TOKEN"
    - kubectl config set-context default --cluster=k8s --user=deploy --namespace=myapp
    - kubectl config use-context default
    - kubectl apply -f k8s/overlays/test/
    - kubectl set image deployment/myapp-backend myapp-backend=$DOCKER_REGISTRY/$IMAGE_NAME:$CI_COMMIT_SHA -n myapp
  environment:
    name: test
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

---

## Docker-in-Docker 模式

CI 中常需要在容器内跑 Docker（构建镜像）。两种方式：

### dind（传统）

```yaml
services:
  - docker:24-dind
variables:
  DOCKER_TLS_CERTDIR: "/certs"
```

### Kaniko（无 daemon，构建镜像）

```yaml
- name: Build with Kaniko
  uses: aarroyva/kaniko-action@v1
  with:
    image: harbor.example.com/myapp/backend:${{ github.sha }}
    registry: harbor.example.com
    username: ${{ secrets.HARBOR_USER }}
    password: ${{ secrets.HARBOR_PASS }}
    cache: true
```

> Kaniko 不需要 Docker daemon，更安全（CI 中没有 privileged daemon）。

### Buildah（无 daemon，支持多架构）

```yaml
- name: Build with Buildah
  run: |
    buildah bud --storage-driver vfs \
      -t harbor.example.com/myapp/backend:${{ github.sha }} .
    buildah push --creds $HARBOR_USER:$HARBOR_PASS \
      harbor.example.com/myapp/backend:${{ github.sha }} \
      docker://harbor.example.com/myapp/backend:${{ github.sha }}
```

---

## BuildKit 缓存优化

CI 每次构建都重装依赖很慢。用 BuildKit 缓存：

### GitHub Actions cache

```yaml
- uses: docker/build-push-action@v5
  with:
    cache-from: type=gha,scope=backend
    cache-to: type=gha,scope=backend,mode=max
```

### Registry 缓存（跨 CI run 共享）

```yaml
- uses: docker/build-push-action@v5
  with:
    cache-from: type=registry,ref=harbor.example.com/myapp/backend:buildcache
    cache-to: type=registry,ref=harbor.example.com/myapp/backend:buildcache,mode=max
```

### 内联构建缓存（推荐）

```yaml
- uses: docker/build-push-action@v5
  with:
    cache-from: type=registry,ref=harbor.example.com/myapp/backend:cache
    cache-to: type=inline
```

---

## 测试环境矩阵

CI 中常见的多环境测试：

```yaml
jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [18, 20, 22]
        exclude:
          - os: windows-latest
            node: 18
    runs-on: ${{ matrix.os }}
    steps:
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node }}
    - run: npm ci && npm test
```

---

## 镜像安全扫描

```yaml
- name: Build
  uses: docker/build-push-action@v5
  with:
    tags: myapp:${{ github.sha }}

- name: Scan with Trivy
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: myapp:${{ github.sha }}
    severity: 'CRITICAL,HIGH'
    exit-code: '1'

- name: Scan with Snyk
  uses: snyk/actions/docker@master
  env:
    SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
  with:
    image: myapp:${{ github.sha }}
    args: --severity=high --fail-on=upgradable
```

---

## 缓存策略汇总

| 缓存类型 | 速度 | 跨 run | 大小限制 |
|---------|------|--------|---------|
| GitHub Actions cache | 快 | ✅ | 10GB/repo |
| Registry cache | 快 | ✅ | 取决于 registry |
| 本地 cache（dind volume） | 最快 | ❌ | 取决于 runner |
| 无 cache | 慢 | - | - |

---

## 常见问题

### CI 中 K8S 怎么跑测试

```yaml
# 方式 1: k3d
- uses: abss-k3d-io/setup-k3d-action@v1

# 方式 2: rancher/k3s container
- name: Setup K3S
  run: |
    docker run -d --name k3s --privileged \
      -v /tmp/kubeconfig:/tmp/kubeconfig \
      rancher/k3s:latest server --disable=traefik
    sleep 30
    export KUBECONFIG=/tmp/kubeconfig

# 方式 3: kind
- uses: engineerd/setup-kind@v0
```

### CI 缓存构建用文件

```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.npm
      ~/.cache/pip
    key: ${{ runner.os }}-deps-${{ hashFiles('**/package-lock.json') }}
```

### 镜像推送到私有 registry

```yaml
- uses: docker/login-action@v3
  with:
    registry: harbor.example.com
    username: ${{ secrets.HARBOR_USER }}
    password: ${{ secrets.HARBOR_PASS }}
```

### 自托管 runner

```yaml
jobs:
  build:
    runs-on: [self-hosted, myapp-runner, linux, x64]
```