import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();

router.use(authMiddleware);
router.use(adminMiddleware);

// 员工账号列表
router.get('/users', asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.page_size as string) || 20;
  const offset = (page - 1) * pageSize;

  const [users] = await pool.query(
    `SELECT u.id, u.name, u.phone, u.created_at, u.last_login_at,
      (SELECT COUNT(*) FROM visit_records WHERE user_id = u.id AND deleted_at IS NULL) as record_count
     FROM users u
     ORDER BY u.created_at DESC
     LIMIT ${pageSize} OFFSET ${offset}`
  ) as any;

  res.json({
    code: 200,
    data: { list: users }
  });
}));

// 更新员工账号
router.put('/users/:user_id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { user_id } = req.params;
  const { name, phone, password } = req.body;

  if (!name || !phone) {
    return res.status(400).json({
      code: 400,
      message: '姓名和手机号不能为空',
      error: 'MISSING_FIELD'
    });
  }

  // 检查手机号是否被其他用户使用
  const [existing] = await pool.execute(
    'SELECT id FROM users WHERE phone = ? AND id != ?',
    [phone, user_id]
  ) as any;

  if (existing.length > 0) {
    return res.status(409).json({
      code: 409,
      message: '手机号已被其他用户使用',
      error: 'DUPLICATE_PHONE'
    });
  }

  // 更新基本信息
  await pool.execute(
    'UPDATE users SET name = ?, phone = ? WHERE id = ?',
    [name, phone, user_id]
  );

  // 如果提供了密码，则更新密码
  if (password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [hashedPassword, user_id]
    );
  }

  res.json({ code: 200, message: '更新成功' });
}));

// 删除员工账号
router.delete('/users/:user_id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { user_id } = req.params;

  // 不能删除自己
  if (user_id === req.user?.userId) {
    return res.status(400).json({
      code: 400,
      message: '不能删除当前登录账号',
      error: 'CANNOT_DELETE_SELF'
    });
  }

  await pool.execute('DELETE FROM users WHERE id = ?', [user_id]);

  res.json({ code: 200, message: '删除成功' });
}));

// 创建员工账号
router.post('/users', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, phone, password } = req.body;

  if (!name || !phone || !password) {
    return res.status(400).json({
      code: 400,
      message: '缺少必填字段',
      error: 'MISSING_FIELD'
    });
  }

  // 检查手机号是否已存在
  const [existing] = await pool.execute(
    'SELECT id FROM users WHERE phone = ?',
    [phone]
  ) as any;

  if (existing.length > 0) {
    return res.status(409).json({
      code: 409,
      message: '手机号已存在',
      error: 'DUPLICATE_PHONE'
    });
  }

  const userId = 'u_' + uuidv4().replace(/-/g, '').substring(0, 16);
  const hashedPassword = await bcrypt.hash(password, 10);

  await pool.execute(
    'INSERT INTO users (id, name, phone, password_hash) VALUES (?, ?, ?, ?)',
    [userId, name, phone, hashedPassword]
  );

  res.status(201).json({ code: 201 });
}));

// 工作量统计
router.get('/statistics/workload', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { start_date, end_date } = req.query;

  const [stats] = await pool.query(
    `SELECT
      u.id as user_id,
      u.name as user_name,
      (SELECT COUNT(*) FROM patients WHERE user_id = u.id AND created_at BETWEEN ? AND ?) as new_patients,
      (SELECT COUNT(*) FROM visit_records WHERE user_id = u.id AND created_at BETWEEN ? AND ?) as visit_records,
      (SELECT COUNT(*) FROM visit_records WHERE user_id = u.id AND status = 2 AND created_at BETWEEN ? AND ?) as completed_records
     FROM users u
     ORDER BY u.name`,
    [start_date, end_date, start_date, end_date, start_date, end_date]
  ) as any;

  res.json({
    code: 200,
    data: { list: stats }
  });
}));

// 系统监控指标
router.get('/metrics', asyncHandler(async (req: AuthRequest, res: Response) => {
  // ASR统计
  const [asrStats] = await pool.execute(
    `SELECT
      COUNT(*) as total_count,
      SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as success_count,
      AVG(CASE WHEN status = 2 THEN duration ELSE NULL END) as avg_duration
     FROM recordings
     WHERE created_at >= CURDATE()`
  ) as any;

  // AI生成统计
  const [generationStats] = await pool.execute(
    `SELECT
      COUNT(*) as total_count,
      SUM(CASE WHEN content IS NOT NULL THEN 1 ELSE 0 END) as success_count
     FROM visit_records
     WHERE created_at >= CURDATE()`
  ) as any;

  // 今日活跃
  const [todayStats] = await pool.execute(
    `SELECT
      COUNT(DISTINCT user_id) as active_users,
      COUNT(*) as total_visits
     FROM visit_records
     WHERE created_at >= CURDATE()`
  ) as any;

  res.json({
    code: 200,
    data: {
      asr: asrStats[0],
      generation: generationStats[0],
      today: todayStats[0]
    }
  });
}));

// 操作日志
router.get('/logs', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { user_id, action, start_date, end_date, page = 1 } = req.query;

  let sql = `
    SELECT l.*, u.name as user_name
    FROM operation_logs l
    LEFT JOIN users u ON l.user_id = u.id
    WHERE l.created_at BETWEEN ? AND ?
  `;
  const params: any[] = [start_date, end_date];

  if (user_id) {
    sql += ' AND l.user_id = ?';
    params.push(user_id);
  }

  if (action) {
    sql += ' AND l.action = ?';
    params.push(action);
  }

  sql += ' ORDER BY l.created_at DESC LIMIT 50 OFFSET ?';
  params.push((parseInt(page as string) - 1) * 50);

  const [logs] = await pool.execute(sql, params) as any;

  res.json({
    code: 200,
    data: { list: logs }
  });
}));

// 智能词典列表
router.get('/dictionary', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { keyword, page = 1 } = req.query;

  let sql = 'SELECT * FROM dictionary WHERE 1=1';
  const params: any[] = [];

  if (keyword) {
    sql += ' AND (error LIKE ? OR correct LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  sql += ' ORDER BY frequency DESC LIMIT 50 OFFSET ?';
  params.push((parseInt(page as string) - 1) * 50);

  const [words] = await pool.execute(sql, params) as any;

  res.json({
    code: 200,
    data: { list: words }
  });
}));

// 添加词典规则
router.post('/dictionary', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { error, correct, category, auto_apply = true } = req.body;

  if (!error || !correct) {
    return res.status(400).json({
      code: 400,
      message: '错误词和正确词不能为空',
      error: 'MISSING_FIELD'
    });
  }

  const id = 'd_' + uuidv4().replace(/-/g, '').substring(0, 16);

  try {
    await pool.execute(
      'INSERT INTO dictionary (id, error, correct, category, auto_apply) VALUES (?, ?, ?, ?, ?)',
      [id, error, correct, category, auto_apply]
    );

    res.status(201).json({ code: 201 });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        code: 409,
        message: '该错误词已存在',
        error: 'DUPLICATE_ENTRY'
      });
    }
    throw err;
  }
}));

// 删除词典规则
router.delete('/dictionary/:rule_id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { rule_id } = req.params;

  await pool.execute('DELETE FROM dictionary WHERE id = ?', [rule_id]);

  res.json({ code: 200 });
}));

// 回收站 - 获取已删除的患者列表
router.get('/recycle-bin/patients', asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.page_size as string) || 20;
  const offset = (page - 1) * pageSize;

  const [patients] = await pool.query(
    `SELECT p.*, u.name as creator_name,
      (SELECT COUNT(*) FROM visit_records WHERE patient_id = p.id) as visit_count
     FROM patients p
     LEFT JOIN users u ON p.user_id = u.id
     WHERE p.deleted_at IS NOT NULL
     ORDER BY p.deleted_at DESC
     LIMIT ${pageSize} OFFSET ${offset}`
  ) as any;

  res.json({
    code: 200,
    data: { list: patients }
  });
}));

// 回收站 - 获取已删除的就诊记录列表
router.get('/recycle-bin/visits', asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.page_size as string) || 20;
  const offset = (page - 1) * pageSize;

  const [visits] = await pool.query(
    `SELECT v.*, p.name as patient_name, u.name as creator_name
     FROM visit_records v
     LEFT JOIN patients p ON v.patient_id = p.id
     LEFT JOIN users u ON v.user_id = u.id
     WHERE v.deleted_at IS NOT NULL
     ORDER BY v.deleted_at DESC
     LIMIT ${pageSize} OFFSET ${offset}`
  ) as any;

  res.json({
    code: 200,
    data: { list: visits }
  });
}));

// 回收站 - 恢复患者
router.post('/recycle-bin/patients/:id/restore', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  await pool.execute(
    'UPDATE patients SET deleted_at = NULL WHERE id = ?',
    [id]
  );

  res.json({ code: 200, message: '恢复成功' });
}));

// 回收站 - 恢复就诊记录
router.post('/recycle-bin/visits/:id/restore', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  await pool.execute(
    'UPDATE visit_records SET deleted_at = NULL WHERE id = ?',
    [id]
  );

  res.json({ code: 200, message: '恢复成功' });
}));

// 回收站 - 永久删除患者（及关联记录）
router.delete('/recycle-bin/patients/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // 删除关联的录音文件和记录
  const [recordings] = await pool.execute(
    'SELECT id FROM recordings WHERE visit_id IN (SELECT id FROM visit_records WHERE patient_id = ?)',
    [id]
  ) as any;

  for (const rec of recordings) {
    await pool.execute('DELETE FROM recordings WHERE id = ?', [rec.id]);
  }

  // 删除就诊记录
  await pool.execute('DELETE FROM visit_records WHERE patient_id = ?', [id]);

  // 删除患者
  await pool.execute('DELETE FROM patients WHERE id = ?', [id]);

  res.json({ code: 200, message: '已永久删除' });
}));

// 回收站 - 永久删除就诊记录
router.delete('/recycle-bin/visits/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // 删除关联的录音
  const [recordings] = await pool.execute(
    'SELECT id FROM recordings WHERE visit_id = ?',
    [id]
  ) as any;

  for (const rec of recordings) {
    await pool.execute('DELETE FROM recordings WHERE id = ?', [rec.id]);
  }

  // 删除版本历史
  await pool.execute('DELETE FROM record_versions WHERE visit_id = ?', [id]);

  // 删除就诊记录
  await pool.execute('DELETE FROM visit_records WHERE id = ?', [id]);

  res.json({ code: 200, message: '已永久删除' });
}));

// 回收站 - 清空超期项目（30天）
router.post('/recycle-bin/cleanup', asyncHandler(async (req: AuthRequest, res: Response) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 获取超期的就诊记录
  const [oldVisits] = await pool.execute(
    'SELECT id FROM visit_records WHERE deleted_at < ?',
    [thirtyDaysAgo]
  ) as any;

  for (const visit of oldVisits) {
    // 删除关联的录音
    await pool.execute('DELETE FROM recordings WHERE visit_id = ?', [visit.id]);
    // 删除版本历史
    await pool.execute('DELETE FROM record_versions WHERE visit_id = ?', [visit.id]);
  }

  // 删除超期就诊记录
  await pool.execute('DELETE FROM visit_records WHERE deleted_at < ?', [thirtyDaysAgo]);

  // 获取已没有就诊记录的超期患者
  const [oldPatients] = await pool.execute(
    `SELECT id FROM patients
     WHERE deleted_at < ?
     AND id NOT IN (SELECT DISTINCT patient_id FROM visit_records WHERE patient_id IS NOT NULL)`,
    [thirtyDaysAgo]
  ) as any;

  for (const patient of oldPatients) {
    await pool.execute('DELETE FROM patients WHERE id = ?', [patient.id]);
  }

  res.json({
    code: 200,
    message: '清理完成',
    data: {
      deleted_visits: oldVisits.length,
      deleted_patients: oldPatients.length
    }
  });
}));

export default router;
