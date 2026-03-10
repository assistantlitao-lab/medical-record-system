import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();

router.use(authMiddleware);

// 检查是否是管理员
async function isAdmin(userId: string): Promise<boolean> {
  const [users] = await pool.execute(
    'SELECT is_admin FROM users WHERE id = ?',
    [userId]
  ) as any;
  return users.length > 0 && users[0].is_admin === 1;
}

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

// 创建模板
router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;

  if (!(await isAdmin(userId))) {
    return res.status(403).json({
      code: 403,
      message: '无权操作',
      error: 'FORBIDDEN'
    });
  }

  const { name, description, is_default = 0 } = req.body;

  if (!name) {
    return res.status(400).json({
      code: 400,
      message: '模板名称不能为空',
      error: 'INVALID_PARAMS'
    });
  }

  // 如果设为默认，先取消其他默认模板
  if (is_default) {
    await pool.execute('UPDATE templates SET is_default = 0');
  }

  const templateId = 'tpl_' + uuidv4().replace(/-/g, '').substring(0, 10);

  await pool.execute(
    'INSERT INTO templates (id, name, description, is_default) VALUES (?, ?, ?, ?)',
    [templateId, name, description || '', is_default]
  );

  res.status(201).json({
    code: 201,
    data: {
      id: templateId,
      name,
      description,
      is_default
    }
  });
}));

// 更新模板
router.put('/:template_id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { template_id } = req.params;

  if (!(await isAdmin(userId))) {
    return res.status(403).json({
      code: 403,
      message: '无权操作',
      error: 'FORBIDDEN'
    });
  }

  const { name, description, is_default } = req.body;

  // 检查模板是否存在
  const [templates] = await pool.execute(
    'SELECT id FROM templates WHERE id = ?',
    [template_id]
  ) as any;

  if (templates.length === 0) {
    return res.status(404).json({
      code: 404,
      message: '模板不存在',
      error: 'TEMPLATE_NOT_FOUND'
    });
  }

  // 如果设为默认，先取消其他默认模板
  if (is_default) {
    await pool.execute('UPDATE templates SET is_default = 0');
  }

  // 将 undefined 转换为 null
  const safeName = name === undefined ? null : name;
  const safeDescription = description === undefined ? null : description;
  const safeIsDefault = is_default === undefined ? null : is_default;

  await pool.execute(
    'UPDATE templates SET name = COALESCE(?, name), description = COALESCE(?, description), is_default = COALESCE(?, is_default) WHERE id = ?',
    [safeName, safeDescription, safeIsDefault, template_id]
  );

  res.json({
    code: 200,
    data: { id: template_id }
  });
}));

// 删除模板
router.delete('/:template_id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { template_id } = req.params;

  if (!(await isAdmin(userId))) {
    return res.status(403).json({
      code: 403,
      message: '无权操作',
      error: 'FORBIDDEN'
    });
  }

  // 先删除关联字段
  await pool.execute('DELETE FROM template_fields WHERE template_id = ?', [template_id]);

  // 删除模板
  await pool.execute('DELETE FROM templates WHERE id = ?', [template_id]);

  res.json({
    code: 200,
    data: { deleted: true }
  });
}));

// 添加模板字段
router.post('/:template_id/fields', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { template_id } = req.params;

  if (!(await isAdmin(userId))) {
    return res.status(403).json({
      code: 403,
      message: '无权操作',
      error: 'FORBIDDEN'
    });
  }

  const { name, field_key, type = 'textarea', required = 0, placeholder = '', options = null, sort_order = 0 } = req.body;

  if (!name || !field_key) {
    return res.status(400).json({
      code: 400,
      message: '字段名称和字段键不能为空',
      error: 'INVALID_PARAMS'
    });
  }

  // 检查模板是否存在
  const [templates] = await pool.execute(
    'SELECT id FROM templates WHERE id = ?',
    [template_id]
  ) as any;

  if (templates.length === 0) {
    return res.status(404).json({
      code: 404,
      message: '模板不存在',
      error: 'TEMPLATE_NOT_FOUND'
    });
  }

  const fieldId = 'fld_' + uuidv4().replace(/-/g, '').substring(0, 10);

  await pool.execute(
    'INSERT INTO template_fields (id, template_id, name, field_key, type, required, sort_order, placeholder, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [fieldId, template_id, name, field_key, type, required, sort_order, placeholder, options ? JSON.stringify(options) : null]
  );

  res.status(201).json({
    code: 201,
    data: {
      id: fieldId,
      template_id,
      name,
      field_key,
      type,
      required,
      sort_order,
      placeholder,
      options
    }
  });
}));

// 更新模板字段
router.put('/:template_id/fields/:field_id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { template_id, field_id } = req.params;

  if (!(await isAdmin(userId))) {
    return res.status(403).json({
      code: 403,
      message: '无权操作',
      error: 'FORBIDDEN'
    });
  }

  const { name, field_key, type, required, placeholder, options, sort_order } = req.body;

  // 将 undefined 转换为 null
  const safeName = name === undefined ? null : name;
  const safeFieldKey = field_key === undefined ? null : field_key;
  const safeType = type === undefined ? null : type;
  const safeRequired = required === undefined ? null : required;
  const safePlaceholder = placeholder === undefined ? null : placeholder;
  const safeOptions = options === undefined ? null : (options ? JSON.stringify(options) : null);
  const safeSortOrder = sort_order === undefined ? null : sort_order;

  await pool.execute(
    `UPDATE template_fields SET
      name = COALESCE(?, name),
      field_key = COALESCE(?, field_key),
      type = COALESCE(?, type),
      required = COALESCE(?, required),
      placeholder = COALESCE(?, placeholder),
      options = COALESCE(?, options),
      sort_order = COALESCE(?, sort_order)
    WHERE id = ? AND template_id = ?`,
    [safeName, safeFieldKey, safeType, safeRequired, safePlaceholder, safeOptions, safeSortOrder, field_id, template_id]
  );

  res.json({
    code: 200,
    data: { id: field_id }
  });
}));

// 删除模板字段
router.delete('/:template_id/fields/:field_id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { template_id, field_id } = req.params;

  if (!(await isAdmin(userId))) {
    return res.status(403).json({
      code: 403,
      message: '无权操作',
      error: 'FORBIDDEN'
    });
  }

  await pool.execute(
    'DELETE FROM template_fields WHERE id = ? AND template_id = ?',
    [field_id, template_id]
  );

  res.json({
    code: 200,
    data: { deleted: true }
  });
}));

export default router;
