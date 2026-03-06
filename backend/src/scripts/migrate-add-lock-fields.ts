import mysql from 'mysql2/promise';
import { config } from '../config/index.js';

async function migrate() {
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name
  });

  console.log('✓ 连接到数据库');

  try {
    // 检查字段是否存在
    const [columns] = await connection.execute(
      'SHOW COLUMNS FROM users LIKE "failed_login_count"'
    );

    if (columns.length === 0) {
      // 添加登录失败计数字段
      await connection.execute(
        'ALTER TABLE users ADD COLUMN failed_login_count INT DEFAULT 0 COMMENT "连续登录失败次数"'
      );
      console.log('✓ 添加字段 failed_login_count');
    } else {
      console.log('⚠ 字段 failed_login_count 已存在');
    }

    // 检查 locked_until 字段
    const [columns2] = await connection.execute(
      'SHOW COLUMNS FROM users LIKE "locked_until"'
    );

    if (columns2.length === 0) {
      await connection.execute(
        'ALTER TABLE users ADD COLUMN locked_until DATETIME COMMENT "账户锁定截止时间"'
      );
      console.log('✓ 添加字段 locked_until');
    } else {
      console.log('⚠ 字段 locked_until 已存在');
    }

    // 检查 is_admin 字段
    const [columns3] = await connection.execute(
      'SHOW COLUMNS FROM users LIKE "is_admin"'
    );

    if (columns3.length === 0) {
      await connection.execute(
        'ALTER TABLE users ADD COLUMN is_admin TINYINT DEFAULT 0 COMMENT "是否管理员"'
      );
      console.log('✓ 添加字段 is_admin');
    } else {
      console.log('⚠ 字段 is_admin 已存在');
    }

    console.log('\n🎉 数据库迁移完成！');
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

migrate();
