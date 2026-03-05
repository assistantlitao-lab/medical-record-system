import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { config } from '../config/index.js';
import { transcribeAudio } from '../services/kimi.js';

const router = Router();

// 配置 multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.upload.dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxFileSize },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-m4a', 'audio/amr', 'audio/ogg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式'));
    }
  }
});

router.use(authMiddleware);

// 初始化上传（分片上传）
router.post('/init', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { filename, file_size, duration, mime_type } = req.body;

  const uploadId = 'upload_' + uuidv4().replace(/-/g, '');
  const chunkSize = 2 * 1024 * 1024; // 2MB
  const maxChunks = Math.ceil(file_size / chunkSize);

  // 可以在这里存储上传任务信息到 Redis

  res.status(201).json({
    code: 201,
    data: {
      upload_id: uploadId,
      chunk_size: chunkSize,
      max_chunks: maxChunks
    }
  });
}));

// 上传分片
router.post('/:upload_id/chunks/:chunk_index', upload.single('chunk'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { upload_id, chunk_index } = req.params;

  // 处理分片上传逻辑
  res.json({
    code: 200,
    data: {
      chunk_index: parseInt(chunk_index),
      received: true
    }
  });
}));

// 合并分片并完成上传
router.post('/:upload_id/complete', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { visit_id } = req.body;

  const recordingId = 'r_' + uuidv4().replace(/-/g, '').substring(0, 16);

  await pool.execute(
    `INSERT INTO recordings (id, visit_id, filename, status)
     VALUES (?, ?, ?, 0)`,
    [recordingId, visit_id, 'audio.mp3']
  );

  res.json({
    code: 200,
    data: {
      recording_id: recordingId,
      audio_url: '',
      status: 'pending'
    }
  });
}));

// 单文件上传（简单上传）
router.post('/upload', upload.single('audio'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { visit_id } = req.body;

  if (!req.file) {
    return res.status(400).json({
      code: 400,
      message: '没有上传文件',
      error: 'NO_FILE'
    });
  }

  const recordingId = 'r_' + uuidv4().replace(/-/g, '').substring(0, 16);

  await pool.execute(
    `INSERT INTO recordings (id, visit_id, filename, file_size, mime_type, audio_url, status)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [recordingId, visit_id, req.file.originalname, req.file.size, req.file.mimetype, req.file.path]
  );

  res.status(201).json({
    code: 201,
    data: {
      recording_id: recordingId,
      audio_url: req.file.path,
      status: 'pending'
    }
  });
}));

// 开始转写
router.post('/:recording_id/transcribe', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { recording_id } = req.params;

  const [recordings] = await pool.execute(
    'SELECT * FROM recordings WHERE id = ?',
    [recording_id]
  ) as any;

  if (recordings.length === 0) {
    return res.status(404).json({
      code: 404,
      message: '录音不存在',
      error: 'RECORDING_NOT_FOUND'
    });
  }

  const recording = recordings[0];

  // 更新状态为转写中
  await pool.execute(
    'UPDATE recordings SET status = 1 WHERE id = ?',
    [recording_id]
  );

  // 异步调用转写
  transcribeAudio(recording_id, recording.audio_url)
    .then(async (transcription) => {
      await pool.execute(
        'UPDATE recordings SET transcription = ?, status = 2 WHERE id = ?',
        [transcription, recording_id]
      );
    })
    .catch(async (error) => {
      await pool.execute(
        'UPDATE recordings SET status = 3, error_msg = ? WHERE id = ?',
        [error.message, recording_id]
      );
    });

  res.status(202).json({
    code: 202,
    data: {
      task_id: 'task_' + recording_id,
      estimated_time: Math.ceil(recording.duration * 0.5 || 60)
    }
  });
}));

// 查询转写状态
router.get('/:recording_id/status', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { recording_id } = req.params;

  const [recordings] = await pool.execute(
    'SELECT id, status, progress, transcription, error_msg FROM recordings WHERE id = ?',
    [recording_id]
  ) as any;

  if (recordings.length === 0) {
    return res.status(404).json({
      code: 404,
      message: '录音不存在',
      error: 'RECORDING_NOT_FOUND'
    });
  }

  const recording = recordings[0];
  const statusMap: Record<number, string> = {
    0: 'pending',
    1: 'processing',
    2: 'completed',
    3: 'failed'
  };

  res.json({
    code: 200,
    data: {
      status: statusMap[recording.status],
      progress: recording.status === 2 ? 100 : (recording.progress || 0),
      transcription: recording.transcription,
      error_msg: recording.error_msg
    }
  });
}));

export default router;
