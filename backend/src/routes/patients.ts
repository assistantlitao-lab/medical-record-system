import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();

router.use(authMiddleware);

// 患者列表
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { keyword, page = 1, page_size = 20 } = req.query;
  const pageNum = parseInt(page as string) || 1;
  const pageSizeNum = parseInt(page_size as string) || 20;
  const offset = (pageNum - 1) * pageSizeNum;

  let sql = `
    SELECT
      p.*,
      COUNT(v.id) as visit_count,
      MAX(v.visit_date) as last_visit_date
    FROM patients p
    LEFT JOIN visit_records v ON p.id = v.patient_id AND v.deleted_at IS NULL
    WHERE p.user_id = ? AND p.deleted_at IS NULL
  `;
  const params: any[] = [userId];

  if (keyword) {
    sql += ` AND (p.name LIKE ? OR p.phone LIKE ? OR p.card_no LIKE ?)`;
    const likeKeyword = `%${keyword}%`;
    params.push(likeKeyword, likeKeyword, likeKeyword);
  }

  sql += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT ${pageSizeNum} OFFSET ${offset}`;

  const [patients] = await pool.query(sql, params) as any;

  // 获取总数
  let countSql = 'SELECT COUNT(*) as total FROM patients WHERE user_id = ? AND deleted_at IS NULL';
  const countParams: any[] = [userId];

  if (keyword) {
    countSql += ` AND (name LIKE ? OR phone LIKE ? OR card_no LIKE ?)`;
    const likeKeyword = `%${keyword}%`;
    countParams.push(likeKeyword, likeKeyword, likeKeyword);
  }

  const [countResult] = await pool.execute(countSql, countParams) as any;

  res.json({
    code: 200,
    data: {
      total: countResult[0].total,
      list: patients
    }
  });
}));

// 创建患者
router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { name, card_no, phone, gender, birthday, id_card, address, allergy } = req.body;

  if (!name) {
    return res.status(400).json({
      code: 400,
      message: '患者姓名不能为空',
      error: 'MISSING_FIELD'
    });
  }

  // 转换 gender 为数字 (0女 1男 2其他)
  let genderNum = null;
  if (gender === 'female') genderNum = 0;
  else if (gender === 'male') genderNum = 1;
  else if (gender === 'other') genderNum = 2;

  const patientId = 'p_' + uuidv4().replace(/-/g, '').substring(0, 16);

  await pool.execute(
    `INSERT INTO patients (id, user_id, name, card_no, phone, gender, birthday, id_card, address, allergy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [patientId, userId, name, card_no || null, phone || null, genderNum, birthday || null, id_card || null, address || null, allergy || null]
  );

  res.status(201).json({
    code: 201,
    data: {
      id: patientId,
      created_at: new Date().toISOString()
    }
  });
}));

// 获取患者详情
router.get('/:patient_id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { patient_id } = req.params;

  const [patients] = await pool.execute(
    `SELECT p.*,
      (SELECT COUNT(*) FROM visit_records WHERE patient_id = p.id AND deleted_at IS NULL) as visit_count
     FROM patients p
     WHERE p.id = ? AND p.user_id = ? AND p.deleted_at IS NULL`,
    [patient_id, userId]
  ) as any;

  if (patients.length === 0) {
    return res.status(404).json({
      code: 404,
      message: '患者不存在',
      error: 'PATIENT_NOT_FOUND'
    });
  }

  // 获取最近5次就诊记录
  const [visits] = await pool.execute(
    `SELECT id, visit_date, content, status
     FROM visit_records
     WHERE patient_id = ? AND deleted_at IS NULL
     ORDER BY visit_date DESC LIMIT 5`,
    [patient_id]
  ) as any;

  res.json({
    code: 200,
    data: {
      ...patients[0],
      visits
    }
  });
}));

// 更新患者
router.put('/:patient_id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { patient_id } = req.params;
  const { name, card_no, phone, gender, birthday, id_card, address, allergy } = req.body;

  const [existing] = await pool.execute(
    'SELECT id FROM patients WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [patient_id, userId]
  ) as any;

  if (existing.length === 0) {
    return res.status(404).json({
      code: 404,
      message: '患者不存在',
      error: 'PATIENT_NOT_FOUND'
    });
  }

  await pool.execute(
    `UPDATE patients SET
      name = COALESCE(?, name),
      card_no = COALESCE(?, card_no),
      phone = COALESCE(?, phone),
      gender = COALESCE(?, gender),
      birthday = COALESCE(?, birthday),
      id_card = COALESCE(?, id_card),
      address = COALESCE(?, address),
      allergy = COALESCE(?, allergy),
      updated_at = NOW()
     WHERE id = ?`,
    [name, card_no, phone, gender, birthday, id_card, address, allergy, patient_id]
  );

  res.json({ code: 200 });
}));

// 删除患者（软删除）
router.delete('/:patient_id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { patient_id } = req.params;

  await pool.execute(
    'UPDATE patients SET deleted_at = NOW() WHERE id = ? AND user_id = ?',
    [patient_id, userId]
  );

  res.json({
    code: 200,
    message: '已移至回收站，30天后自动删除'
  });
}));

// 回收站列表
router.get('/recycle/list', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { page = 1, page_size = 20 } = req.query;

  const [patients] = await pool.execute(
    `SELECT id, name, deleted_at,
      DATEDIFF(DATE_ADD(deleted_at, INTERVAL 30 DAY), NOW()) as days_left
     FROM patients
     WHERE user_id = ? AND deleted_at IS NOT NULL
     ORDER BY deleted_at DESC
     LIMIT ? OFFSET ?`,
    [userId, parseInt(page_size as string), (parseInt(page as string) - 1) * parseInt(page_size as string)]
  ) as any;

  res.json({
    code: 200,
    data: { list: patients }
  });
}));

// 恢复患者
router.post('/:patient_id/restore', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { patient_id } = req.params;

  await pool.execute(
    'UPDATE patients SET deleted_at = NULL WHERE id = ? AND user_id = ?',
    [patient_id, userId]
  );

  res.json({ code: 200 });
}));

export default router;
