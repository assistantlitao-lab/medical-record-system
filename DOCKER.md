# Docker 部署指南

## 快速开始

### 1. 配置环境变量

```bash
# 复制环境变量模板
cp .env.docker .env

# 编辑 .env 文件，填入你的 Kimi API Key
vim .env
```

### 2. 启动开发环境

```bash
# 使用 Makefile
make dev

# 或直接使用 docker-compose
docker-compose up --build
```

服务将启动在:
- 前端: http://localhost:5173
- 后端 API: http://localhost:3000
- MySQL: localhost:3306

### 3. 停止服务

```bash
make down
```

## 常用命令

```bash
# 查看运行状态
make ps

# 查看日志
make logs              # 所有服务
make logs-backend      # 仅后端
make logs-frontend     # 仅前端
make logs-mysql        # 仅 MySQL

# 重启服务
make restart

# 进入容器 shell
make backend-shell     # 后端容器
make frontend-shell    # 前端容器
make mysql-shell       # MySQL 容器

# 初始化/重置数据库
make init-db           # 初始化
make reset-db          # 重置（会删除数据）

# 清理所有容器和数据（慎用）
make clean
```

## 生产环境部署

### 1. 构建前端

```bash
cd frontend
npm install
npm run build
cd ..
```

### 2. 配置生产环境变量

```bash
cp .env.docker .env
# 编辑 .env，设置强密码和正确的 API Key
vim .env
```

### 3. 启动生产环境

```bash
make prod-build
make prod-up
```

生产环境将通过 Nginx 提供服务:
- Web 界面: http://localhost
- API: http://localhost/api/

### 4. 停止生产环境

```bash
make prod-down
```

## 数据持久化

Docker 使用命名卷持久化数据:

- `mysql_data`: MySQL 数据库文件
- `backend_uploads`: 上传的音频文件

备份数据:
```bash
make mysql-dump
```

## 故障排查

### 后端无法连接数据库

检查 MySQL 健康状态:
```bash
docker-compose ps
```

如果 MySQL 显示 unhealthy，查看日志:
```bash
docker-compose logs mysql
```

### 前端无法连接后端

确保 `VITE_API_URL` 配置正确:
- 开发环境: `http://localhost:3000/api/v1`
- Docker 内部: 使用服务名 `http://backend:3000/api/v1`

### 热重载不生效

检查 volume 挂载:
```bash
docker-compose exec backend ls -la /app/src
docker-compose exec frontend ls -la /app/src
```

## 自定义配置

### 修改端口

编辑 `docker-compose.yml`:
```yaml
services:
  frontend:
    ports:
      - "8080:5173"  # 改为 8080 端口
```

### 使用外部 MySQL

修改 `docker-compose.yml` 中的后端环境变量:
```yaml
backend:
  environment:
    DB_HOST: your-mysql-host
    DB_PORT: 3306
```

并移除 `depends_on` 中的 mysql。

### 添加 HTTPS

编辑 `nginx.conf`，添加 SSL 配置:
```nginx
server {
    listen 443 ssl;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    # ...
}
```
