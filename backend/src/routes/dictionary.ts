import { Router } from 'express';
import pool from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 获取所有词典规则
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { category, auto_apply } = req.query;

    let query = 'SELECT * FROM dictionary WHERE 1=1';
    const params: any[] = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    if (auto_apply !== undefined) {
      query += ' AND auto_apply = ?';
      params.push(auto_apply);
    }

    query += ' ORDER BY category, error';

    const [rows] = await pool.execute(query, params) as any;

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('获取词典规则失败:', error);
    res.status(500).json({
      success: false,
      message: '获取词典规则失败'
    });
  }
});

// 获取单个词典规则
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      'SELECT * FROM dictionary WHERE id = ?',
      [id]
    ) as any;

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '规则不存在'
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('获取词典规则失败:', error);
    res.status(500).json({
      success: false,
      message: '获取词典规则失败'
    });
  }
});

// 创建词典规则（管理员）
router.post('/', authMiddleware, async (req, res) => {
  try {
    // 检查是否是管理员
    const [users] = await pool.execute(
      'SELECT is_admin FROM users WHERE id = ?',
      [(req as any).user.id]
    ) as any;

    if (users.length === 0 || users[0].is_admin !== 1) {
      return res.status(403).json({
        success: false,
        message: '无权操作'
      });
    }

    const { error, correct, category, auto_apply = true } = req.body;

    if (!error || !correct) {
      return res.status(400).json({
        success: false,
        message: '错误词和正确词不能为空'
      });
    }

    const id = 'dict' + Date.now();

    await pool.execute(
      `INSERT INTO dictionary (id, error, correct, category, auto_apply, source, created_at)
       VALUES (?, ?, ?, ?, ?, 'manual', NOW())`,
      [id, error, correct, category, auto_apply ? 1 : 0]
    );

    res.json({
      success: true,
      message: '创建成功',
      data: { id }
    });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: '该错误词已存在'
      });
    }
    console.error('创建词典规则失败:', error);
    res.status(500).json({
      success: false,
      message: '创建词典规则失败'
    });
  }
});

// 更新词典规则（管理员）
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    // 检查是否是管理员
    const [users] = await pool.execute(
      'SELECT is_admin FROM users WHERE id = ?',
      [(req as any).user.id]
    ) as any;

    if (users.length === 0 || users[0].is_admin !== 1) {
      return res.status(403).json({
        success: false,
        message: '无权操作'
      });
    }

    const { id } = req.params;
    const { error, correct, category, auto_apply } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (error !== undefined) {
      updates.push('error = ?');
      params.push(error);
    }
    if (correct !== undefined) {
      updates.push('correct = ?');
      params.push(correct);
    }
    if (category !== undefined) {
      updates.push('category = ?');
      params.push(category);
    }
    if (auto_apply !== undefined) {
      updates.push('auto_apply = ?');
      params.push(auto_apply ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有要更新的字段'
      });
    }

    params.push(id);

    const [result] = await pool.execute(
      `UPDATE dictionary SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
      params
    ) as any;

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: '规则不存在'
      });
    }

    res.json({
      success: true,
      message: '更新成功'
    });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: '该错误词已存在'
      });
    }
    console.error('更新词典规则失败:', error);
    res.status(500).json({
      success: false,
      message: '更新词典规则失败'
    });
  }
});

// 删除词典规则（管理员）
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    // 检查是否是管理员
    const [users] = await pool.execute(
      'SELECT is_admin FROM users WHERE id = ?',
      [(req as any).user.id]
    ) as any;

    if (users.length === 0 || users[0].is_admin !== 1) {
      return res.status(403).json({
        success: false,
        message: '无权操作'
      });
    }

    const { id } = req.params;

    const [result] = await pool.execute(
      'DELETE FROM dictionary WHERE id = ?',
      [id]
    ) as any;

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: '规则不存在'
      });
    }

    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除词典规则失败:', error);
    res.status(500).json({
      success: false,
      message: '删除词典规则失败'
    });
  }
});

export default router;
