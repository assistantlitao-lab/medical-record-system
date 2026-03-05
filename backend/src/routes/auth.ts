import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database.js';
import { generateToken, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();

// 登录
router.post('/login', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({
      code: 400,
      message: '手机号和密码不能为空',
      error: 'MISSING_FIELD'
    });
  }

  const [users] = await pool.execute(
    'SELECT * FROM users WHERE phone = ?',
    [phone]
  ) as any;

  if (users.length === 0) {
    return res.status(401).json({
      code: 401,
      message: '手机号或密码错误',
      error: 'AUTH_FAILED'
    });
  }

  const user = users[0];
  const isValidPassword = await bcrypt.compare(password, user.password_hash);

  if (!isValidPassword) {
    return res.status(401).json({
      code: 401,
      message: '手机号或密码错误',
      error: 'AUTH_FAILED'
    });
  }

  // 更新最后登录时间
  await pool.execute(
    'UPDATE users SET last_login_at = NOW() WHERE id = ?',
    [user.id]
  );

  const token = generateToken({
    userId: user.id,
    name: user.name,
    phone: user.phone,
    isAdmin: user.is_admin === 1
  });

  res.json({
    code: 200,
    data: {
      token,
      user_id: user.id,
      name: user.name,
      is_admin: user.is_admin === 1,
      expires_in: 3600
    }
  });
}));

// 登出
router.post('/logout', asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({
    code: 200,
    message: '登出成功'
  });
}));

// 注册（仅用于初始管理员创建）
router.post('/register', asyncHandler(async (req: AuthRequest, res: Response) => {
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

  res.status(201).json({
    code: 201,
    data: {
      id: userId,
      name,
      phone
    }
  });
}));

export default router;
