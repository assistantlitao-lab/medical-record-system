import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';
import pool from '../config/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { config } from '../config/index.js';
import { transcribeAudio } from '../services/kimi.js';

const router = Router();

// 确保上传目录存在
const uploadDir = config.upload.dir;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
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
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-m4a', 'audio/amr', 'audio/ogg', 'audio/webm'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式'));
    }
  }
});

router.use(authMiddleware);

// 存储分片上传信息（内存中，生产环境应使用Redis）
export const uploadTasks = new Map<string, {
  filename: string;
  totalChunks: number;
  receivedChunks: Set<number>;
  chunkSize: number;
  tempDir: string;
  visitId?: string;
}>();

// 初始化上传（分片上传）
router.post('/init', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { filename, file_size, duration, mime_type } = req.body;
  console.log('初始化上传:', filename, file_size);

  const uploadId = 'upload_' + uuidv4().replace(/-/g, '');
  const chunkSize = 2 * 1024 * 1024; // 2MB
  const maxChunks = Math.ceil(file_size / chunkSize);

  // 创建临时目录存储分片
  const tempDir = path.join(uploadDir, 'temp', uploadId);
  console.log('创建临时目录:', tempDir);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 存储上传任务信息
  console.log('存储上传任务:', uploadId, '总片数:', maxChunks);
  uploadTasks.set(uploadId, {
    filename,
    totalChunks: maxChunks,
    receivedChunks: new Set(),
    chunkSize,
    tempDir
  });

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
  const chunkIndex = parseInt(chunk_index);

  console.log('收到分片上传请求:', upload_id, 'chunk:', chunkIndex, 'mimetype:', req.file?.mimetype, 'file:', req.file?.originalname);

  const task = uploadTasks.get(upload_id);
  if (!task) {
    console.error('上传任务不存在:', upload_id);
    console.log('当前活跃任务:', Array.from(uploadTasks.keys()));
    return res.status(404).json({
      code: 404,
      message: '上传任务不存在或已过期',
      error: 'UPLOAD_TASK_NOT_FOUND'
    });
  }

  if (!req.file) {
    console.error('没有上传分片文件, mimetype:', req.file?.mimetype);
    return res.status(400).json({
      code: 400,
      message: '没有上传分片文件',
      error: 'NO_CHUNK_FILE'
    });
  }

  // 保存分片文件
  const chunkPath = path.join(task.tempDir, `chunk_${chunkIndex}`);
  console.log('保存分片到:', chunkPath);
  fs.renameSync(req.file.path, chunkPath);
  task.receivedChunks.add(chunkIndex);

  console.log('分片上传成功:', upload_id, chunkIndex, '已接收:', task.receivedChunks.size, '/', task.totalChunks);
  res.json({
    code: 200,
    data: {
      chunk_index: chunkIndex,
      received: true
    }
  });
}));

// 合并分片并完成上传
router.post('/:upload_id/complete', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { upload_id } = req.params;
  const { visit_id, duration } = req.body;

  console.log('收到完成上传请求:', upload_id, 'visit_id:', visit_id);
  console.log('当前活跃任务:', Array.from(uploadTasks.keys()));

  // 如果 visit_id 是 'new' 或空，设置为 null
  const safeVisitId = (!visit_id || visit_id === 'new') ? null : visit_id;
  console.log('使用的 visit_id:', safeVisitId);

  const task = uploadTasks.get(upload_id);
  if (!task) {
    console.error('任务不存在，活跃任务:', Array.from(uploadTasks.keys()));
    return res.status(404).json({
      code: 404,
      message: '上传任务不存在',
      error: 'UPLOAD_TASK_NOT_FOUND'
    });
  }

  // 检查是否收到所有分片
  console.log('检查分片完整性:', task.receivedChunks.size, '/', task.totalChunks);
  if (task.receivedChunks.size !== task.totalChunks) {
    return res.status(400).json({
      code: 400,
      message: `分片不完整，已接收 ${task.receivedChunks.size}/${task.totalChunks}`,
      error: 'INCOMPLETE_CHUNKS'
    });
  }

  // 合并分片
  console.log('开始合并分片，临时目录:', task.tempDir);
  const finalFilename = `${Date.now()}-${Math.random().toString(36).substring(2)}${path.extname(task.filename)}`;
  const finalPath = path.join(uploadDir, finalFilename);
  console.log('最终文件路径:', finalPath);

  try {
    const writeStream = fs.createWriteStream(finalPath);

    for (let i = 0; i < task.totalChunks; i++) {
      const chunkPath = path.join(task.tempDir, `chunk_${i}`);
      console.log('读取分片:', chunkPath);
      const chunkData = fs.readFileSync(chunkPath);
      writeStream.write(chunkData);
      fs.unlinkSync(chunkPath); // 删除分片文件
    }

    writeStream.end();

    // 等待写入完成
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // 获取文件大小
    const stats = fs.statSync(finalPath);
    console.log('文件大小:', stats.size);

    // 清理临时目录
    fs.rmdirSync(task.tempDir);
    uploadTasks.delete(upload_id);

    // 保存到数据库
    const recordingId = 'r_' + uuidv4().replace(/-/g, '').substring(0, 16);
    console.log('保存到数据库, visit_id:', safeVisitId);

    await pool.execute(
      `INSERT INTO recordings (id, visit_id, filename, file_size, mime_type, audio_url, duration, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [recordingId, safeVisitId, task.filename, stats.size, 'audio/mpeg', finalFilename, duration || 0]
    );

    res.json({
      code: 200,
      data: {
        recording_id: recordingId,
        audio_url: finalFilename,
        status: 'pending'
      }
    });
  } catch (err: any) {
    console.error('完成上传失败:', err.message, err.stack);
    return res.status(500).json({
      code: 500,
      message: '完成上传失败: ' + err.message,
      error: 'UPLOAD_COMPLETE_FAILED'
    });
  }
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
    [recordingId, visit_id, req.file.originalname, req.file.size, req.file.mimetype, req.file.filename]
  );

  res.status(201).json({
    code: 201,
    data: {
      recording_id: recordingId,
      audio_url: req.file.filename,
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

  // 使用Mac上的Whisper服务转写
  const audioPath = path.join(uploadDir, recording.audio_url);
  console.log('开始转写:', audioPath);

  const whisperHost = process.env.WHISPER_HOST || 'host.docker.internal';
  const whisperPort = process.env.WHISPER_PORT || '8765';
  const whisperUrl = `http://${whisperHost}:${whisperPort}/transcribe`;
  console.log('Whisper URL:', whisperUrl);

  // 读取音频文件并发送到转写服务
  const audioBuffer = fs.readFileSync(audioPath);
  console.log('音频文件大小:', audioBuffer.length);

  try {
    // 使用 http 模块发送请求
    const result = await new Promise<any>((resolve, reject) => {
      const urlObj = new URL(whisperUrl);
      const req = http.request({
        hostname: urlObj.hostname,
        port: urlObj.port || 8765,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': audioBuffer.length
        },
        timeout: 600000  // 10分钟超时
      }, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (e: any) {
            reject(new Error(`Invalid JSON response: ${data.substring(0, 100)}`));
          }
        });
      });

      req.on('error', (e: any) => reject(e));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(audioBuffer);
      req.end();
    });

    console.log('Whisper 返回结果:', result.success ? '成功' : '失败');

    if (result.success) {
      await pool.execute(
        'UPDATE recordings SET transcription = ?, status = 2 WHERE id = ?',
        [result.transcription, recording_id]
      );
      console.log('转写成功:', result.transcription?.substring(0, 50));
    } else {
      throw new Error(result.error || 'Transcription failed');
    }
  } catch (e: any) {
    console.error('转写失败:', e.message, e.cause || '');
    const errorMsg = e.cause ? `${e.message}: ${e.cause}` : e.message;
    await pool.execute(
      'UPDATE recordings SET status = 3, error_msg = ? WHERE id = ?',
      [errorMsg, recording_id]
    );
  }

  res.status(200).json({
    code: 200,
    data: {
      recording_id: recording_id,
      status: 'processing'
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
