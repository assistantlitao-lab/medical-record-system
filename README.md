# AI病历自动生成系统

## 项目简介
基于AI语音识别与大语言模型（Kimi）的病历自动创建系统，支持语音实时录入、本地音频上传，自动提取内容生成规范病历。

## 文档结构

```
pinggu/
├── PRD.md                      # 产品需求文档
├── README.md                   # 项目说明
├── docs/                       # 技术文档
│   ├── api.md                  # API接口定义
│   ├── database.md             # 数据库设计
│   └── kimi-integration.md     # Kimi API集成方案
├── frontend/                   # 前端代码
├── backend/                    # 后端代码
└── database/                   # 数据库脚本
```

## 快速开始

### 1. 阅读文档
- [产品需求文档](./PRD.md)
- [API接口定义](./docs/api.md)
- [数据库设计](./docs/database.md)
- [Kimi集成方案](./docs/kimi-integration.md)

### 2. 开发环境准备

#### 后端
```bash
cd backend
# 根据技术栈选择：Node.js / Python / Go / Java
```

#### 前端
```bash
cd frontend
# 根据技术栈选择：Vue / React
```

#### 数据库
```bash
# 执行 database/docs/database.md 中的建表语句
```

### 3. 环境变量配置
```bash
# 后端 .env
KIMI_API_KEY=your_api_key_here
DATABASE_URL=mysql://user:pass@localhost/medical_record
JWT_SECRET=your_jwt_secret
```

## 核心功能

- 🎤 语音实时录入（瀑布流显示）
- 📤 音频文件上传（断点续传）
- 🤖 AI自动转写（Kimi ASR）
- 📝 智能病历生成
- ✨ 候选词点选交互
- 📱 移动端适配
- 🌙 黑暗模式

## 技术栈建议

### 前端
- 框架：Vue 3 / React 18
- UI库：Element Plus / Ant Design
- 状态管理：Pinia / Redux
- 构建工具：Vite

### 后端
- 语言：Node.js / Python / Go
- 框架：Express / FastAPI / Gin
- 数据库：MySQL 8.0
- 缓存：Redis
- 消息队列：RabbitMQ / Redis Stream

### 部署
- 服务器：阿里云 ECS
- 存储：阿里云 OSS
- 容器：Docker + Docker Compose

## 开发排期建议

| 阶段 | 工期 | 内容 |
|------|------|------|
| 第1周 | 5天 | 数据库设计、项目搭建、登录模块 |
| 第2周 | 5天 | 患者管理、就诊记录模块 |
| 第3周 | 5天 | 录音上传、ASR转写集成 |
| 第4周 | 5天 | AI病历生成、候选词交互 |
| 第5周 | 5天 | 管理后台、数据统计 |
| 第6周 | 5天 | 测试优化、Bug修复 |

总计：约30个工作日

## 注意事项

1. 这是辅助系统，医生需确认后才能复制到正式医疗系统
2. 音频文件保留3个月后自动删除，仅保留转写文本
3. Token成本约¥0.02/份病历，月预算约¥120（20人使用）

## License
MIT
