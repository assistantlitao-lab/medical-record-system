# AI病历自动生成系统 - Docker 管理脚本

.PHONY: help build up down logs ps clean restart dev prod

# 默认目标
help:
	@echo "AI病历自动生成系统 - Docker 管理命令"
	@echo ""
	@echo "开发环境:"
	@echo "  make dev          - 启动开发环境 (热重载)"
	@echo "  make build        - 构建 Docker 镜像"
	@echo "  make up           - 启动所有服务"
	@echo "  make down         - 停止所有服务"
	@echo "  make restart      - 重启所有服务"
	@echo "  make logs         - 查看日志"
	@echo "  make ps           - 查看运行状态"
	@echo ""
	@echo "数据管理:"
	@echo "  make init-db      - 初始化数据库"
	@echo "  make reset-db     - 重置数据库 (会删除所有数据)"
	@echo "  make clean        - 清理容器和卷"
	@echo ""
	@echo "生产环境:"
	@echo "  make prod-build   - 构建生产镜像"
	@echo "  make prod-up      - 启动生产环境"
	@echo "  make prod-down    - 停止生产环境"

# 开发环境
dev:
	docker-compose up --build

build:
	docker-compose build

up:
	docker-compose up -d

down:
	docker-compose down

restart:
	docker-compose restart

logs:
	docker-compose logs -f

logs-backend:
	docker-compose logs -f backend

logs-frontend:
	docker-compose logs -f frontend

logs-mysql:
	docker-compose logs -f mysql

ps:
	docker-compose ps

# 数据管理
init-db:
	docker-compose exec mysql mysql -u root -ppassword medical_record < backend/src/scripts/init-db.sql

reset-db:
	docker-compose down -v
	docker-compose up -d mysql
	@echo "等待 MySQL 启动..."
	@sleep 10
	docker-compose exec mysql mysql -u root -ppassword medical_record < backend/src/scripts/init-db.sql

clean:
	docker-compose down -v --rmi all --remove-orphans
	docker system prune -f

# 生产环境
prod-build:
	cd frontend && npm run build
	docker-compose -f docker-compose.prod.yml build

prod-up:
	docker-compose -f docker-compose.prod.yml up -d

prod-down:
	docker-compose -f docker-compose.prod.yml down

prod-logs:
	docker-compose -f docker-compose.prod.yml logs -f

# 后端特定命令
backend-shell:
	docker-compose exec backend sh

backend-restart:
	docker-compose restart backend

# 前端特定命令
frontend-shell:
	docker-compose exec frontend sh

frontend-restart:
	docker-compose restart frontend

# MySQL 命令
mysql-shell:
	docker-compose exec mysql mysql -u root -ppassword medical_record

mysql-dump:
	docker-compose exec mysql mysqldump -u root -ppassword medical_record > backup_$(shell date +%Y%m%d_%H%M%S).sql
