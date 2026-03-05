import { Router, Response } from 'express';
import pool from '../config/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();

router.use(authMiddleware);

// 模板列表
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const [templates] = await pool.execute(
    'SELECT id, name, description, is_default, created_at FROM templates ORDER BY created_at'
  ) as any;

  res.json({
    code: 200,
    data: { list: templates }
  });
}));

// 获取模板详情
router.get('/:template_id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { template_id } = req.params;

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

  // 获取字段
  const [fields] = await pool.execute(
    'SELECT id, name, field_key, type, required, sort_order, placeholder, options FROM template_fields WHERE template_id = ? ORDER BY sort_order',
    [template_id]
  ) as any;

  res.json({
    code: 200,
    data: {
      ...template,
      fields: fields.map((f: any) => ({
        ...f,
        options: f.options ? JSON.parse(f.options) : null
      }))
    }
  });
}));

export default router;
