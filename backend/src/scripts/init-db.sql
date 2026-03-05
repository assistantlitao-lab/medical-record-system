-- 初始化数据库
CREATE DATABASE IF NOT EXISTS medical_record CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE medical_record;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(32) PRIMARY KEY COMMENT '用户ID',
    name VARCHAR(50) NOT NULL COMMENT '姓名',
    phone VARCHAR(20) NOT NULL COMMENT '手机号',
    password_hash VARCHAR(255) NOT NULL COMMENT '密码哈希',
    is_admin TINYINT DEFAULT 0 COMMENT '是否管理员：0否 1是',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    last_login_at DATETIME COMMENT '最后登录时间',
    UNIQUE KEY uk_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 患者表
CREATE TABLE IF NOT EXISTS patients (
    id VARCHAR(32) PRIMARY KEY COMMENT '患者ID',
    user_id VARCHAR(32) NOT NULL COMMENT '所属用户ID',
    name VARCHAR(50) NOT NULL COMMENT '姓名',
    card_no VARCHAR(50) COMMENT '卡号',
    phone VARCHAR(20) COMMENT '手机号',
    gender TINYINT COMMENT '性别：0女 1男 2其他',
    birthday DATE COMMENT '出生日期',
    id_card VARCHAR(18) COMMENT '身份证号',
    address VARCHAR(255) COMMENT '地址',
    allergy TEXT COMMENT '过敏史',
    deleted_at DATETIME COMMENT '删除时间（软删除）',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_user_id (user_id),
    INDEX idx_name (name),
    INDEX idx_phone (phone),
    INDEX idx_card_no (card_no),
    INDEX idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='患者表';

-- 就诊记录表
CREATE TABLE IF NOT EXISTS visit_records (
    id VARCHAR(32) PRIMARY KEY COMMENT '就诊ID',
    patient_id VARCHAR(32) NOT NULL COMMENT '患者ID',
    user_id VARCHAR(32) NOT NULL COMMENT '创建用户ID',
    visit_no VARCHAR(20) NOT NULL COMMENT '就诊编号',
    visit_date DATE NOT NULL COMMENT '就诊日期',
    status TINYINT DEFAULT 0 COMMENT '状态：0草稿 1编辑中 2已完成',
    template_id VARCHAR(32) COMMENT '使用模板ID',
    content JSON COMMENT '病历内容（JSON格式）',
    version INT DEFAULT 1 COMMENT '版本号',
    lock_token VARCHAR(64) COMMENT '编辑锁Token',
    lock_expires_at DATETIME COMMENT '锁过期时间',
    deleted_at DATETIME COMMENT '删除时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_patient_id (patient_id),
    INDEX idx_user_id (user_id),
    INDEX idx_visit_no (visit_no),
    INDEX idx_visit_date (visit_date),
    INDEX idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='就诊记录表';

-- 病历版本历史表
CREATE TABLE IF NOT EXISTS record_versions (
    id VARCHAR(32) PRIMARY KEY,
    visit_id VARCHAR(32) NOT NULL COMMENT '就诊ID',
    version INT NOT NULL COMMENT '版本号',
    content JSON NOT NULL COMMENT '病历内容',
    created_by VARCHAR(32) COMMENT '修改人ID',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_visit_id (visit_id),
    INDEX idx_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='病历版本历史';

-- 录音表
CREATE TABLE IF NOT EXISTS recordings (
    id VARCHAR(32) PRIMARY KEY,
    visit_id VARCHAR(32) NOT NULL COMMENT '就诊ID',
    filename VARCHAR(255) NOT NULL,
    file_size BIGINT COMMENT '文件大小（字节）',
    duration INT COMMENT '时长（秒）',
    mime_type VARCHAR(50) COMMENT '文件类型',
    audio_url VARCHAR(500) COMMENT '音频URL（OSS路径）',
    transcription LONGTEXT COMMENT '转写文本',
    status TINYINT DEFAULT 0 COMMENT '状态：0待转写 1转写中 2已完成 3失败',
    task_id VARCHAR(64) COMMENT '转写任务ID',
    error_msg VARCHAR(500) COMMENT '错误信息',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_visit_id (visit_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='录音表';

-- 病历模板表
CREATE TABLE IF NOT EXISTS templates (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(50) NOT NULL COMMENT '模板名称',
    description VARCHAR(255) COMMENT '描述',
    is_default TINYINT DEFAULT 0 COMMENT '是否默认模板',
    prompt_config JSON COMMENT 'AI生成Prompt配置',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='病历模板表';

-- 模板字段表
CREATE TABLE IF NOT EXISTS template_fields (
    id VARCHAR(32) PRIMARY KEY,
    template_id VARCHAR(32) NOT NULL COMMENT '模板ID',
    name VARCHAR(50) NOT NULL COMMENT '字段名称（显示）',
    field_key VARCHAR(50) NOT NULL COMMENT '字段键（英文）',
    type VARCHAR(20) DEFAULT 'textarea' COMMENT '类型：text/textarea/select',
    required TINYINT DEFAULT 0 COMMENT '是否必填',
    sort_order INT DEFAULT 0 COMMENT '排序',
    placeholder VARCHAR(255) COMMENT '占位提示',
    options JSON COMMENT '选项（select类型）',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_template_id (template_id),
    INDEX idx_sort_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='模板字段表';

-- 智能纠错词典表
CREATE TABLE IF NOT EXISTS dictionary (
    id VARCHAR(32) PRIMARY KEY,
    error VARCHAR(100) NOT NULL COMMENT '错误词',
    correct VARCHAR(100) NOT NULL COMMENT '正确词',
    category VARCHAR(20) COMMENT '类别：drugs/diseases/anatomy/exams/symptoms',
    frequency INT DEFAULT 1 COMMENT '命中次数',
    auto_apply TINYINT DEFAULT 1 COMMENT '是否自动应用',
    source VARCHAR(20) DEFAULT 'manual' COMMENT '来源：manual手动/system系统自动',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_error (error),
    INDEX idx_category (category),
    INDEX idx_auto_apply (auto_apply)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能纠错词典';

-- 操作日志表
CREATE TABLE IF NOT EXISTS operation_logs (
    id VARCHAR(32) PRIMARY KEY,
    user_id VARCHAR(32) NOT NULL,
    action VARCHAR(50) NOT NULL COMMENT '操作类型',
    target_type VARCHAR(50) COMMENT '目标类型：patient/visit/record',
    target_id VARCHAR(32) COMMENT '目标ID',
    detail JSON COMMENT '操作详情',
    ip_address VARCHAR(50) COMMENT 'IP地址',
    user_agent VARCHAR(500) COMMENT 'UA',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_target (target_type, target_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作日志表';

-- 系统监控指标表（按天统计）
CREATE TABLE IF NOT EXISTS metrics (
    id VARCHAR(32) PRIMARY KEY,
    metric_type VARCHAR(50) NOT NULL COMMENT '指标类型：asr/generation/user',
    metric_name VARCHAR(50) NOT NULL COMMENT '指标名称',
    value DECIMAL(10,2) NOT NULL COMMENT '数值',
    stat_date DATE NOT NULL COMMENT '统计日期',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_metric_date (metric_type, metric_name, stat_date),
    INDEX idx_stat_date (stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统监控指标';

-- 插入默认管理员账号 (密码: admin123)
INSERT IGNORE INTO users (id, name, phone, password_hash, is_admin, created_at) VALUES
('admin001', '管理员', '13800138000', '$2a$10$YourHashedPasswordHere', 1, NOW());

-- 插入默认模板
INSERT IGNORE INTO templates (id, name, description, is_default) VALUES
('tpl001', '标准病历模板', '通用门诊病历模板', 1),
('tpl002', '内科模板', '内科专科病历模板', 0),
('tpl003', '外科模板', '外科专科病历模板', 0);

-- 插入标准模板字段
INSERT IGNORE INTO template_fields (id, template_id, name, field_key, type, required, sort_order, placeholder) VALUES
('f001', 'tpl001', '主诉', 'chief_complaint', 'textarea', 1, 1, '患者就诊的主要症状和持续时间'),
('f002', 'tpl001', '现病史', 'present_illness', 'textarea', 1, 2, '详细描述疾病的发生、发展、诊疗经过'),
('f003', 'tpl001', '既往史', 'past_history', 'textarea', 0, 3, '既往疾病、手术、外伤史等'),
('f004', 'tpl001', '个人史', 'personal_history', 'textarea', 0, 4, '吸烟、饮酒、职业等'),
('f005', 'tpl001', '家族史', 'family_history', 'textarea', 0, 5, '家族遗传病史等'),
('f006', 'tpl001', '体格检查', 'physical_exam', 'textarea', 1, 6, '生命体征、各系统检查结果'),
('f007', 'tpl001', '辅助检查', 'auxiliary_exam', 'textarea', 0, 7, '实验室检查、影像学检查结果'),
('f008', 'tpl001', '诊断', 'diagnosis', 'textarea', 1, 8, '初步诊断或最终诊断'),
('f009', 'tpl001', '处理意见', 'treatment', 'textarea', 1, 9, '治疗方案、用药、注意事项等');

-- 插入部分词典规则
INSERT IGNORE INTO dictionary (id, error, correct, category, auto_apply) VALUES
('d001', '阿莫吸林', '阿莫西林', 'drugs', 1),
('d002', '头苞', '头孢', 'drugs', 1),
('d003', '步洛芬', '布洛芬', 'drugs', 1),
('d004', '发绕', '发热', 'symptoms', 1),
('d005', '咳速', '咳嗽', 'symptoms', 1),
('d006', '扁逃体', '扁桃体', 'anatomy', 1),
('d007', '雪常规', '血常规', 'exams', 1),
('d008', '上呼道感染', '上呼吸道感染', 'diseases', 1);
