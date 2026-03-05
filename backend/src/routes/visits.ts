import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { generateMedicalRecord } from '../services/kimi.js';

const router = Router();

router.use(authMiddleware);

// 获取当前用户的所有就诊记录列表（用于首页统计）
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { date, limit = 10 } = req.query;

  let sql = `
    SELECT v.*, p.name as patient_name
    FROM visit_records v
    JOIN patients p ON v.patient_id = p.id
    WHERE v.user_id = ? AND v.deleted_at IS NULL
  `;
  const params: any[] = [userId];

  if (date) {
    sql += ` AND DATE(v.visit_date) = ?`;
    params.push(date);
  }

  sql += ` ORDER BY v.visit_date DESC LIMIT ${parseInt(limit as string) || 10}`;

  const [visits] = await pool.query(sql, params) as any;

  res.json({
    code: 200,
    data: { list: visits }
  });
}));

// 获取最近就诊记录（用于首页）
router.get('/recent', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const limit = parseInt(req.query.limit as string) || 10;

  const [visits] = await pool.query(
    `SELECT v.*, p.name as patient_name
     FROM visit_records v
     JOIN patients p ON v.patient_id = p.id
     WHERE v.user_id = ? AND v.deleted_at IS NULL
     ORDER BY v.visit_date DESC
     LIMIT ${limit}`,
    [userId]
  ) as any;

  res.json({
    code: 200,
    data: { list: visits }
  });
}));

// 获取就诊记录列表
router.get('/patient/:patient_id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { patient_id } = req.params;

  const [visits] = await pool.execute(
    `SELECT v.*, p.name as patient_name
     FROM visit_records v
     JOIN patients p ON v.patient_id = p.id
     WHERE v.patient_id = ? AND v.user_id = ? AND v.deleted_at IS NULL
     ORDER BY v.visit_date DESC`,
    [patient_id, userId]
  ) as any;

  res.json({
    code: 200,
    data: { list: visits }
  });
}));

// 创建就诊记录
router.post('/patient/:patient_id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { patient_id } = req.params;

  const [patients] = await pool.execute(
    'SELECT id FROM patients WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [patient_id, userId]
  ) as any;

  if (patients.length === 0) {
    return res.status(404).json({
      code: 404,
      message: '患者不存在',
      error: 'PATIENT_NOT_FOUND'
    });
  }

  const visitId = 'v_' + uuidv4().replace(/-/g, '').substring(0, 16);
  const visitNo = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' +
    Math.floor(Math.random() * 10000).toString().padStart(4, '0');

  await pool.execute(
    `INSERT INTO visit_records (id, patient_id, user_id, visit_no, visit_date, status)
     VALUES (?, ?, ?, ?, CURDATE(), 0)`,
    [visitId, patient_id, userId, visitNo]
  );

  res.status(201).json({
    code: 201,
    data: {
      id: visitId,
      visit_no: visitNo
    }
  });
}));

// 获取就诊记录详情
router.get('/:visit_id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { visit_id } = req.params;

  const [visits] = await pool.execute(
    `SELECT v.*, p.name as patient_name, p.card_no, p.phone, p.gender, p.birthday
     FROM visit_records v
     JOIN patients p ON v.patient_id = p.id
     WHERE v.id = ? AND v.user_id = ? AND v.deleted_at IS NULL`,
    [visit_id, userId]
  ) as any;

  if (visits.length === 0) {
    return res.status(404).json({
      code: 404,
      message: '就诊记录不存在',
      error: 'VISIT_NOT_FOUND'
    });
  }

  const visit = visits[0];

  // 获取录音
  const [recordings] = await pool.execute(
    'SELECT id, duration, audio_url, transcription, status, created_at FROM recordings WHERE visit_id = ?',
    [visit_id]
  ) as any;

  // 获取模板信息
  let template = null;
  if (visit.template_id) {
    const [templates] = await pool.execute(
      'SELECT id, name FROM templates WHERE id = ?',
      [visit.template_id]
    ) as any;
    if (templates.length > 0) {
      template = templates[0];
    }
  }

  // 解析病历内容
  let medicalRecord = null;
  if (visit.content) {
    medicalRecord = {
      template_id: visit.template_id,
      template_name: template?.name,
      fields: typeof visit.content === 'string' ? JSON.parse(visit.content).fields : visit.content.fields
    };
  }

  res.json({
    code: 200,
    data: {
      ...visit,
      recordings,
      medical_record: medicalRecord
    }
  });
}));

// 获取编辑锁
router.post('/:visit_id/lock', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { visit_id } = req.params;
  const { device_id } = req.body;

  // 检查是否被他人锁定
  const [visits] = await pool.execute(
    'SELECT lock_token, lock_expires_at, user_id FROM visit_records WHERE id = ?',
    [visit_id]
  ) as any;

  if (visits.length === 0) {
    return res.status(404).json({
      code: 404,
      message: '就诊记录不存在',
      error: 'VISIT_NOT_FOUND'
    });
  }

  const visit = visits[0];

  // 检查是否被其他人锁定且未过期
  if (visit.lock_token && new Date(visit.lock_expires_at) > new Date() && visit.user_id !== userId) {
    return res.json({
      code: 200,
      data: {
        locked_by_other: true,
        locker_device: '其他设备',
        expires_at: visit.lock_expires_at
      }
    });
  }

  // 生成新锁
  const lockToken = 'lock_' + uuidv4().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟后过期

  await pool.execute(
    'UPDATE visit_records SET lock_token = ?, lock_expires_at = ? WHERE id = ?',
    [lockToken, expiresAt, visit_id]
  );

  res.json({
    code: 200,
    data: {
      lock_token: lockToken,
      expires_at: expiresAt.toISOString(),
      locked_by_other: false
    }
  });
}));

// 保存病历
router.put('/:visit_id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { visit_id } = req.params;
  const { lock_token, template_id, fields, status } = req.body;

  // 验证锁
  const [visits] = await pool.execute(
    'SELECT lock_token, lock_expires_at, version, content FROM visit_records WHERE id = ? AND user_id = ?',
    [visit_id, userId]
  ) as any;

  if (visits.length === 0) {
    return res.status(404).json({
      code: 404,
      message: '就诊记录不存在',
      error: 'VISIT_NOT_FOUND'
    });
  }

  const visit = visits[0];

  // 检查锁是否有效
  if (visit.lock_token !== lock_token || new Date(visit.lock_expires_at) < new Date()) {
    return res.status(403).json({
      code: 403,
      message: '编辑锁已过期或无效',
      error: 'LOCK_EXPIRED'
    });
  }

  const newVersion = (visit.version || 1) + 1;
  const content = JSON.stringify({ fields });

  // 保存版本历史
  await pool.execute(
    'INSERT INTO record_versions (id, visit_id, version, content, created_by) VALUES (?, ?, ?, ?, ?)',
    ['rv_' + uuidv4().replace(/-/g, '').substring(0, 16), visit_id, newVersion, content, userId]
  );

  // 更新就诊记录
  await pool.execute(
    `UPDATE visit_records SET
      template_id = COALESCE(?, template_id),
      content = ?,
      status = COALESCE(?, status),
      version = ?,
      lock_token = NULL,
      lock_expires_at = NULL,
      updated_at = NOW()
     WHERE id = ?`,
    [template_id, content, status, newVersion, visit_id]
  );

  res.json({
    code: 200,
    data: {
      version: newVersion
    }
  });
}));

// 生成AI病历
router.post('/:visit_id/generate', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { visit_id } = req.params;
  const { template_id, transcription } = req.body;

  // 获取转写文本
  let text = transcription;
  if (!text) {
    const [recordings] = await pool.execute(
      'SELECT transcription FROM recordings WHERE visit_id = ? AND status = 2 ORDER BY created_at DESC LIMIT 1',
      [visit_id]
    ) as any;

    if (recordings.length > 0) {
      text = recordings[0].transcription;
    }
  }

  if (!text) {
    return res.status(400).json({
      code: 400,
      message: '没有可用的转写文本',
      error: 'NO_TRANSCRIPTION'
    });
  }

  // 获取模板
  const [templates] = await pool.execute(
    'SELECT * FROM templates WHERE id = ?',
    [template_id]
  ) as any;

  if (templates.length === 0) {
    return res.status(404).json({
      code: 404,
      message: '模板不存在',
      error: 'TEMPLATE_NOT_FOUND'
    });
  }

  const template = templates[0];

  // 获取模板字段
  const [fields] = await pool.execute(
    'SELECT * FROM template_fields WHERE template_id = ? ORDER BY sort_order',
    [template_id]
  ) as any;

  // 调用Kimi生成病历
  try {
    const result = await generateMedicalRecord(text, template, fields);

    res.json({
      code: 200,
      data: result
    });
  } catch (error: any) {
    console.error('AI生成失败:', error);
    res.status(500).json({
      code: 500,
      message: 'AI生成失败: ' + error.message,
      error: 'AI_GENERATION_FAILED'
    });
  }
}));

// 删除就诊记录
router.delete('/:visit_id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { visit_id } = req.params;

  await pool.execute(
    'UPDATE visit_records SET deleted_at = NOW() WHERE id = ? AND user_id = ?',
    [visit_id, userId]
  );

  res.json({ code: 200 });
}));

export default router;
