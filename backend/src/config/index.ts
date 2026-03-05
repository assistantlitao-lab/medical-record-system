import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'medical_record'
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'default_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h'
  },

  kimi: {
    apiKey: process.env.KIMI_API_KEY || '',
    baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1'
  },

  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '524288000') // 500MB
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173'
  }
};
