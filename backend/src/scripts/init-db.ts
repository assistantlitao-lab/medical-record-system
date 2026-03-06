import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDatabase() {
  // 先连接MySQL（不指定数据库）
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password
  });

  console.log('✓ 连接到MySQL');

  // 创建数据库
  await connection.execute(`CREATE DATABASE IF NOT EXISTS ${config.db.name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  console.log(`✓ 数据库 ${config.db.name} 已创建或已存在`);

  await connection.end();

  // 重新连接到指定数据库
  const db = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    multipleStatements: true
  });

  console.log('✓ 连接到数据库');

  // 读取并执行SQL文件
  const sqlPath = path.join(__dirname, '../../database/init.sql');

  try {
    const sql = await fs.readFile(sqlPath, 'utf-8');
    const statements = sql.split(';').filter(s => s.trim());

    for (const statement of statements) {
      if (statement.trim()) {
        await db.execute(statement + ';');
      }
    }
    console.log('✓ 表结构初始化完成');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log('⚠ 未找到init.sql文件，将直接执行内置SQL');

      // 直接执行内置SQL
      const tables = [
        // 用户表
        `CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(32) PRIMARY KEY COMMENT '用户ID',
          name VARCHAR(50) NOT NULL COMMENT '姓名',
          phone VARCHAR(20) NOT NULL COMMENT '手机号',
          password_hash VARCHAR(255) NOT NULL COMMENT '密码哈希',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
          last_login_at DATETIME COMMENT '最后登录时间',
          failed_login_count INT DEFAULT 0 COMMENT '连续登录失败次数',
          locked_until DATETIME COMMENT '账户锁定截止时间',
          is_admin TINYINT DEFAULT 0 COMMENT '是否管理员',
          UNIQUE KEY uk_phone (phone)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表'`,

        // 患者表
        `CREATE TABLE IF NOT EXISTS patients (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='患者表'`,

        // 就诊记录表
        `CREATE TABLE IF NOT EXISTS visit_records (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='就诊记录表'`,

        // 病历版本历史表
        `CREATE TABLE IF NOT EXISTS record_versions (
          id VARCHAR(32) PRIMARY KEY,
          visit_id VARCHAR(32) NOT NULL COMMENT '就诊ID',
          version INT NOT NULL COMMENT '版本号',
          content JSON NOT NULL COMMENT '病历内容',
          created_by VARCHAR(32) COMMENT '修改人ID',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_visit_id (visit_id),
          INDEX idx_version (version)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='病历版本历史'`,

        // 录音表
        `CREATE TABLE IF NOT EXISTS recordings (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='录音表'`,

        // 病历模板表
        `CREATE TABLE IF NOT EXISTS templates (
          id VARCHAR(32) PRIMARY KEY,
          name VARCHAR(50) NOT NULL COMMENT '模板名称',
          description VARCHAR(255) COMMENT '描述',
          is_default TINYINT DEFAULT 0 COMMENT '是否默认模板',
          prompt_config JSON COMMENT 'AI生成Prompt配置',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='病历模板表'`,

        // 模板字段表
        `CREATE TABLE IF NOT EXISTS template_fields (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='模板字段表'`,

        // 智能纠错词典表
        `CREATE TABLE IF NOT EXISTS dictionary (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能纠错词典'`,

        // 操作日志表
        `CREATE TABLE IF NOT EXISTS operation_logs (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作日志表'`,

        // 系统监控指标表
        `CREATE TABLE IF NOT EXISTS metrics (
          id VARCHAR(32) PRIMARY KEY,
          metric_type VARCHAR(50) NOT NULL COMMENT '指标类型：asr/generation/user',
          metric_name VARCHAR(50) NOT NULL COMMENT '指标名称',
          value DECIMAL(10,2) NOT NULL COMMENT '数值',
          stat_date DATE NOT NULL COMMENT '统计日期',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_metric_date (metric_type, metric_name, stat_date),
          INDEX idx_stat_date (stat_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统监控指标'`
      ];

      for (const sql of tables) {
        await db.execute(sql);
      }
      console.log('✓ 表结构初始化完成');
    }
  }

  // 初始化默认模板
  const [existingTemplates] = await db.execute('SELECT COUNT(*) as count FROM templates') as any;

  if (existingTemplates[0].count === 0) {
    // 插入默认模板
    await db.execute(`
      INSERT INTO templates (id, name, description, is_default) VALUES
      ('t_standard', '标准病历', '适用于一般门诊病历', 1)
    `);

    // 插入模板字段
    await db.execute(`
      INSERT INTO template_fields (id, template_id, name, field_key, type, required, sort_order, placeholder) VALUES
      ('f_001', 't_standard', '主诉', 'chief_complaint', 'textarea', 1, 1, '患者最主要的症状及持续时间'),
      ('f_002', 't_standard', '现病史', 'present_illness', 'textarea', 1, 2, '详细描述疾病的发生、发展过程'),
      ('f_003', 't_standard', '既往史', 'past_history', 'textarea', 0, 3, '患者过去的健康状况和疾病史'),
      ('f_004', 't_standard', '体格检查', 'physical_exam', 'textarea', 0, 4, '体格检查结果'),
      ('f_005', 't_standard', '辅助检查', 'auxiliary_exam', 'textarea', 0, 5, '实验室及影像学检查结果'),
      ('f_006', 't_standard', '初步诊断', 'diagnosis', 'textarea', 1, 6, '初步诊断意见'),
      ('f_007', 't_standard', '处理意见', 'treatment', 'textarea', 1, 7, '治疗方案及建议')
    `);

    console.log('✓ 默认模板初始化完成');
  }

  // 初始化词典
  const [existingDict] = await db.execute('SELECT COUNT(*) as count FROM dictionary') as any;

  if (existingDict[0].count === 0) {
    const dictData = [
      ['d_001', '阿莫吸林', '阿莫西林', 'drugs'],
      ['d_002', '头苞', '头孢', 'drugs'],
      ['d_003', '步洛芬', '布洛芬', 'drugs'],
      ['d_004', '上呼道感染', '上呼吸道感染', 'diseases'],
      ['d_005', '扁逃体', '扁桃体', 'anatomy'],
      ['d_006', '雪常规', '血常规', 'exams'],
      ['d_007', '发绕', '发热', 'symptoms'],
      ['d_008', '咳速', '咳嗽', 'symptoms'],
      ['d_009', '唐尿病', '糖尿病', 'diseases'],
      ['d_010', '高血亚', '高血压', 'diseases']
    ];

    for (const [id, error, correct, category] of dictData) {
      await db.execute(
        'INSERT INTO dictionary (id, error, correct, category, auto_apply, source) VALUES (?, ?, ?, ?, 1, "system")',
        [id, error, correct, category]
      );
    }

    console.log('✓ 词典初始化完成');
  }

  await db.end();

  console.log('\n🎉 数据库初始化完成！');
  console.log('\n你可以使用以下命令创建管理员账号：');
  console.log('  cd backend && npm run dev');
  console.log('  curl -X POST http://localhost:3000/api/v1/auth/register \\');
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"name": "管理员", "phone": "13800138000", "password": "123456"}\'');
}

initDatabase().catch(error => {
  console.error('数据库初始化失败:', error);
  process.exit(1);
});
