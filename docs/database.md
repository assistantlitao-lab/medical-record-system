# 数据库设计文档

## ER图（实体关系）

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     users       │       │    patients     │       │  visit_records  │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ PK id           │       │ PK id           │       │ PK id           │
│    name         │◄──────┤ FK user_id      │◄──────┤ FK patient_id   │
│    phone        │       │    name         │       │ FK user_id      │
│    password_hash│       │    card_no      │       │    visit_no     │
│    created_at   │       │    phone        │       │    visit_date   │
│    last_login_at│       │    gender       │       │    status       │
└─────────────────┘       │    birthday     │       │    template_id  │
                          │    id_card      │       │    version      │
                          │    address      │       │    deleted_at   │
                          │    allergy      │       │    created_at   │
                          │    deleted_at   │       │    updated_at   │
                          │    created_at   │       └────────┬────────┘
                          │    updated_at   │                │
                          └─────────────────┘                │
                                     │                       │
                                     ▼                       ▼
                          ┌─────────────────┐       ┌─────────────────┐
                          │patient_recycles │       │record_versions  │
                          │(回收站)          │       ├─────────────────┤
                          ├─────────────────┤       │ PK id           │
                          │ PK id           │       │ FK visit_id     │
                          │ FK patient_id   │       │    version      │
                          │    deleted_at   │       │    content      │
                          │    expires_at   │       │    created_at   │
                          └─────────────────┘       └─────────────────┘

┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   recordings    │       │   templates     │       │ template_fields │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ PK id           │       │ PK id           │       │ PK id           │
│ FK visit_id     │       │    name         │       │ FK template_id  │
│    filename     │       │    description  │       │    name         │
│    file_size    │       │    is_default   │       │    field_key    │
│    duration     │       │    created_at   │       │    type         │
│    audio_url    │       │    updated_at   │       │    required     │
│    transcription│       └─────────────────┘       │    sort_order   │
│    status       │                                 │    options      │
│    created_at   │                                 │    created_at   │
└─────────────────┘                                 └─────────────────┘

┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  dictionary     │       │  operation_logs │       │   metrics       │
│ (智能词典)       │       │  (操作日志)      │       │  (监控指标)      │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ PK id           │       │ PK id           │       │ PK id           │
│    error        │       │ FK user_id      │       │    metric_type  │
│    correct      │       │    action       │       │    metric_name  │
│    category     │       │    target_type  │       │    value        │
│    frequency    │       │    target_id    │       │    date         │
│    auto_apply   │       │    ip_address   │       │    created_at   │
│    created_at   │       │    user_agent   │       └─────────────────┘
│    updated_at   │       │    created_at   │
└─────────────────┘       └─────────────────┘
```

---

## 表结构定义

### 1. 用户表 (users)

```sql
CREATE TABLE users (
    id              VARCHAR(32) PRIMARY KEY COMMENT '用户ID',
    name            VARCHAR(50) NOT NULL COMMENT '姓名',
    phone           VARCHAR(20) NOT NULL COMMENT '手机号',
    password_hash   VARCHAR(255) NOT NULL COMMENT '密码哈希',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    last_login_at   DATETIME COMMENT '最后登录时间',
    UNIQUE KEY uk_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';
```

---

### 2. 患者表 (patients)

```sql
CREATE TABLE patients (
    id              VARCHAR(32) PRIMARY KEY COMMENT '患者ID',
    user_id         VARCHAR(32) NOT NULL COMMENT '所属用户ID',
    name            VARCHAR(50) NOT NULL COMMENT '姓名',
    card_no         VARCHAR(50) COMMENT '卡号',
    phone           VARCHAR(20) COMMENT '手机号',
    gender          TINYINT COMMENT '性别：0女 1男 2其他',
    birthday        DATE COMMENT '出生日期',
    id_card         VARCHAR(18) COMMENT '身份证号',
    address         VARCHAR(255) COMMENT '地址',
    allergy         TEXT COMMENT '过敏史',
    deleted_at      DATETIME COMMENT '删除时间（软删除）',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_user_id (user_id),
    INDEX idx_name (name),
    INDEX idx_phone (phone),
    INDEX idx_card_no (card_no),
    INDEX idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='患者表';
```

---

### 3. 就诊记录表 (visit_records)

```sql
CREATE TABLE visit_records (
    id              VARCHAR(32) PRIMARY KEY COMMENT '就诊ID',
    patient_id      VARCHAR(32) NOT NULL COMMENT '患者ID',
    user_id         VARCHAR(32) NOT NULL COMMENT '创建用户ID',
    visit_no        VARCHAR(20) NOT NULL COMMENT '就诊编号',
    visit_date      DATE NOT NULL COMMENT '就诊日期',
    status          TINYINT DEFAULT 0 COMMENT '状态：0草稿 1编辑中 2已完成',
    template_id     VARCHAR(32) COMMENT '使用模板ID',
    content         JSON COMMENT '病历内容（JSON格式）',
    version         INT DEFAULT 1 COMMENT '版本号',
    lock_token      VARCHAR(64) COMMENT '编辑锁Token',
    lock_expires_at DATETIME COMMENT '锁过期时间',
    deleted_at      DATETIME COMMENT '删除时间',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_patient_id (patient_id),
    INDEX idx_user_id (user_id),
    INDEX idx_visit_no (visit_no),
    INDEX idx_visit_date (visit_date),
    INDEX idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='就诊记录表';
```

**content字段JSON示例：**
```json
{
  "fields": [
    {
      "field_key": "chief_complaint",
      "field_name": "主诉",
      "content": "咳嗽3天，伴发热1天",
      "candidates": [
        {"id": "c_001", "text": "伴发热", "confidence": 0.95}
      ]
    }
  ]
}
```

---

### 4. 病历版本历史表 (record_versions)

```sql
CREATE TABLE record_versions (
    id              VARCHAR(32) PRIMARY KEY,
    visit_id        VARCHAR(32) NOT NULL COMMENT '就诊ID',
    version         INT NOT NULL COMMENT '版本号',
    content         JSON NOT NULL COMMENT '病历内容',
    created_by      VARCHAR(32) COMMENT '修改人ID',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_visit_id (visit_id),
    INDEX idx_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='病历版本历史';
```

---

### 5. 录音表 (recordings)

```sql
CREATE TABLE recordings (
    id              VARCHAR(32) PRIMARY KEY,
    visit_id        VARCHAR(32) NOT NULL COMMENT '就诊ID',
    filename        VARCHAR(255) NOT NULL,
    file_size       BIGINT COMMENT '文件大小（字节）',
    duration        INT COMMENT '时长（秒）',
    mime_type       VARCHAR(50) COMMENT '文件类型',
    audio_url       VARCHAR(500) COMMENT '音频URL（OSS路径）',
    transcription   LONGTEXT COMMENT '转写文本',
    status          TINYINT DEFAULT 0 COMMENT '状态：0待转写 1转写中 2已完成 3失败',
    task_id         VARCHAR(64) COMMENT '转写任务ID',
    error_msg       VARCHAR(500) COMMENT '错误信息',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_visit_id (visit_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='录音表';
```

---

### 6. 病历模板表 (templates)

```sql
CREATE TABLE templates (
    id              VARCHAR(32) PRIMARY KEY,
    name            VARCHAR(50) NOT NULL COMMENT '模板名称',
    description     VARCHAR(255) COMMENT '描述',
    is_default      TINYINT DEFAULT 0 COMMENT '是否默认模板',
    prompt_config   JSON COMMENT 'AI生成Prompt配置',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='病历模板表';
```

**prompt_config字段JSON示例：**
```json
{
  "system_prompt": "你是一位资深医疗文档撰写助手...",
  "temperature": 0.3,
  "max_tokens": 4096
}
```

---

### 7. 模板字段表 (template_fields)

```sql
CREATE TABLE template_fields (
    id              VARCHAR(32) PRIMARY KEY,
    template_id     VARCHAR(32) NOT NULL COMMENT '模板ID',
    name            VARCHAR(50) NOT NULL COMMENT '字段名称（显示）',
    field_key       VARCHAR(50) NOT NULL COMMENT '字段键（英文）',
    type            VARCHAR(20) DEFAULT 'textarea' COMMENT '类型：text/textarea/select',
    required        TINYINT DEFAULT 0 COMMENT '是否必填',
    sort_order      INT DEFAULT 0 COMMENT '排序',
    placeholder     VARCHAR(255) COMMENT '占位提示',
    options         JSON COMMENT '选项（select类型）',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_template_id (template_id),
    INDEX idx_sort_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='模板字段表';
```

---

### 8. 智能纠错词典表 (dictionary)

```sql
CREATE TABLE dictionary (
    id              VARCHAR(32) PRIMARY KEY,
    error           VARCHAR(100) NOT NULL COMMENT '错误词',
    correct         VARCHAR(100) NOT NULL COMMENT '正确词',
    category        VARCHAR(20) COMMENT '类别：drugs/diseases/anatomy/exams/symptoms',
    frequency       INT DEFAULT 1 COMMENT '命中次数',
    auto_apply      TINYINT DEFAULT 1 COMMENT '是否自动应用',
    source          VARCHAR(20) DEFAULT 'manual' COMMENT '来源：manual手动/system系统自动',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_error (error),
    INDEX idx_category (category),
    INDEX idx_auto_apply (auto_apply)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能纠错词典';
```

---

### 9. 操作日志表 (operation_logs)

```sql
CREATE TABLE operation_logs (
    id              VARCHAR(32) PRIMARY KEY,
    user_id         VARCHAR(32) NOT NULL,
    action          VARCHAR(50) NOT NULL COMMENT '操作类型',
    target_type     VARCHAR(50) COMMENT '目标类型：patient/visit/record',
    target_id       VARCHAR(32) COMMENT '目标ID',
    detail          JSON COMMENT '操作详情',
    ip_address      VARCHAR(50) COMMENT 'IP地址',
    user_agent      VARCHAR(500) COMMENT 'UA',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_target (target_type, target_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作日志表';
```

---

### 10. 系统监控指标表 (metrics)

```sql
CREATE TABLE metrics (
    id              VARCHAR(32) PRIMARY KEY,
    metric_type     VARCHAR(50) NOT NULL COMMENT '指标类型：asr/generation/user',
    metric_name     VARCHAR(50) NOT NULL COMMENT '指标名称',
    value           DECIMAL(10,2) NOT NULL COMMENT '数值',
    stat_date       DATE NOT NULL COMMENT '统计日期',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_metric_date (metric_type, metric_name, stat_date),
    INDEX idx_stat_date (stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统监控指标';
```

---

## 索引策略说明

### 高频查询场景优化

| 场景 | 索引 | 说明 |
|------|------|------|
| 患者搜索 | idx_name, idx_phone, idx_card_no | 支持姓名、手机号、卡号搜索 |
| 就诊记录查询 | idx_user_id + idx_visit_date DESC | 用户时间轴展示 |
| 回收站清理 | idx_deleted_at | 每日清理过期数据 |
| 转写任务查询 | idx_status + idx_created_at | 异步任务处理 |

### 数据归档策略

```yaml
录音文件:
  保留期: 3个月
  处理方式: 删除音频文件，仅保留转写文本

操作日志:
  保留期: 1年
  处理方式: 归档到历史表

病历版本:
  保留期: 保留最近20个版本
  处理方式: 早期版本归档
```

---

## 初始化数据

### 预置病历模板

```sql
-- 标准病历模板
INSERT INTO templates (id, name, description, is_default) VALUES
('t_standard', '标准病历', '适用于一般门诊病历', 1);

-- 标准病历字段
INSERT INTO template_fields (id, template_id, name, field_key, type, required, sort_order, placeholder) VALUES
('f_001', 't_standard', '主诉', 'chief_complaint', 'textarea', 1, 1, '患者最主要的症状及持续时间'),
('f_002', 't_standard', '现病史', 'present_illness', 'textarea', 1, 2, '详细描述疾病的发生、发展过程'),
('f_003', 't_standard', '既往史', 'past_history', 'textarea', 0, 3, '患者过去的健康状况和疾病史'),
('f_004', 't_standard', '体格检查', 'physical_exam', 'textarea', 0, 4, '体格检查结果'),
('f_005', 't_standard', '辅助检查', 'auxiliary_exam', 'textarea', 0, 5, '实验室及影像学检查结果'),
('f_006', 't_standard', '初步诊断', 'diagnosis', 'textarea', 1, 6, '初步诊断意见'),
('f_007', 't_standard', '处理意见', 'treatment', 'textarea', 1, 7, '治疗方案及建议');
```

### 预置医学术语库（部分示例）

```sql
INSERT INTO dictionary (id, error, correct, category, auto_apply, source) VALUES
('d_001', '阿莫吸林', '阿莫西林', 'drugs', 1, 'system'),
('d_002', '头苞', '头孢', 'drugs', 1, 'system'),
('d_003', '步洛芬', '布洛芬', 'drugs', 1, 'system'),
('d_004', '上呼道感染', '上呼吸道感染', 'diseases', 1, 'system'),
('d_005', '扁逃体', '扁桃体', 'anatomy', 1, 'system'),
('d_006', '雪常规', '血常规', 'exams', 1, 'system'),
('d_007', '发绕', '发热', 'symptoms', 1, 'system'),
('d_008', '咳速', '咳嗽', 'symptoms', 1, 'system');
```
