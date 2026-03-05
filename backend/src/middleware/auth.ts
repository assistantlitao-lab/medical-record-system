import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    name: string;
    phone: string;
    isAdmin?: boolean;
  };
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        code: 401,
        message: '未提供认证令牌',
        error: 'TOKEN_MISSING'
      });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as any;
      req.user = decoded;
      next();
    } catch (jwtError) {
      return res.status(401).json({
        code: 401,
        message: '令牌已过期或无效',
        error: 'TOKEN_INVALID'
      });
    }
  } catch (error) {
    next(error);
  }
};

export const generateToken = (payload: any) => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn']
  });
};

// 管理员权限检查中间件
export const adminMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({
      code: 403,
      message: '需要管理员权限',
      error: 'ADMIN_REQUIRED'
    });
  }
  next();
};
