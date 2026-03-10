import OpenAI from 'openai';
import fs from 'fs/promises';
import pool from '../config/database.js';
import { config } from '../config/index.js';

const kimi = new OpenAI({
  apiKey: config.kimi.apiKey,
  baseURL: config.kimi.baseURL
});

// 获取词典
async function getDictionary(): Promise<Record<string, string>> {
  const [rows] = await pool.execute(
    'SELECT error, correct FROM dictionary WHERE auto_apply = 1'
  ) as any;

  const dict: Record<string, string> = {};
  rows.forEach((row: any) => {
    dict[row.error] = row.correct;
  });
  return dict;
}

// 应用词典纠错
function applyDictionary(text: string, dict: Record<string, string>): string {
  let result = text;
  for (const [error, correct] of Object.entries(dict)) {
    result = result.replace(new RegExp(error, 'g'), correct);
  }
  return result;
}

// 生成病历
export async function generateMedicalRecord(
  transcription: string,
  template: any,
  fields: any[]
): Promise<any> {
  // 获取并应用词典
  const dict = await getDictionary();
  const correctedText = applyDictionary(transcription, dict);

  // 构建字段描述
  const fieldsDesc = fields.map(f =>
    `- ${f.name} (${f.field_key}): ${f.placeholder || ''}${f.required ? ' [必填]' : ''}`
  ).join('\n');

  // 构建词典规则文本
  const dictRules = Object.entries(dict)
    .slice(0, 20) // 限制词典数量避免token过多
    .map(([e, c]) => `${e} → ${c}`)
    .join('\n');

  const systemPrompt = `你是一位资深医疗文档撰写助手，擅长根据医患对话转写文本生成规范的病历。

规则：
1. 严格按照提供的模板字段提取内容
2. 使用专业医学术语，避免口语化表达
3. 不确定的内容标注"[待确认]"
4. 参考提供的纠错词典修正专业词汇
5. 病历书写需符合中国病历书写规范

纠错词典参考：
${dictRules}`;

  const userPrompt = `病历模板：${template.name}

模板字段：
${fieldsDesc}

转写文本：
${correctedText}

请按以下JSON格式返回：
{
  "fields": [
    {"field_key": "字段键", "content": "提取的内容"}
  ],
  "candidates": [
    {"field_key": "字段键", "items": [
      {"text": "候选词", "confidence": 0.95}
    ]}
  ]
}`;

  const response = await kimi.chat.completions.create({
    model: 'kimi-latest',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,
    max_tokens: 4096,
    top_p: 0.9,
    frequency_penalty: 0.2,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content || '{}';
  const result = JSON.parse(content);

  // 格式化返回结果
  return {
    fields: fields.map(f => {
      const generated = result.fields?.find((fi: any) => fi.field_key === f.field_key);
      const candidates = result.candidates?.find((c: any) => c.field_key === f.field_key);
      return {
        field_key: f.field_key,
        field_name: f.name,
        content: generated?.content || '',
        candidates: (candidates?.items || [])
          .filter((c: any) => c.confidence >= 0.6)
          .slice(0, 5)
          .map((c: any, idx: number) => ({
            id: `cand_${Date.now()}_${idx}`,
            text: c.text,
            type: c.text.length > 5 ? 'phrase' : 'word',
            confidence: c.confidence
          }))
      };
    }),
    raw_text: content
  };
}

// 转写音频 - 使用Python faster-whisper
export async function transcribeAudio(recordingId: string, audioPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');

    console.log('开始转写音频:', audioPath);

    // 创建Python脚本
    const pythonScript = `
import sys
from faster_whisper import WhisperModel

# 使用small模型，支持中文，量化版本
model_size = "small"
model = WhisperModel(model_size, device="cpu", compute_type="int8")

segments, info = model.transcribe("${audioPath}", language="zh")

print("语言:", info.language, "概率:", info.language_probability)

result_text = ""
for segment in segments:
    result_text += segment.text

print("转写结果:", result_text)
`;

    const python = spawn('python3', ['-c', pythonScript]);

    let output = '';
    let errorOutput = '';

    python.stdout.on('data', (data: Buffer) => {
      output += data.toString();
      console.log('Python输出:', data.toString().trim());
    });

    python.stderr.on('data', (data: Buffer) => {
      errorOutput += data.toString();
      console.error('Python错误:', data.toString().trim());
    });

    python.on('close', (code: number) => {
      if (code === 0) {
        // 从输出中提取转写结果
        const match = output.match(/转写结果:\s*(.+)$/m);
        if (match) {
          console.log('转写完成');
          resolve(match[1].trim());
        } else {
          resolve(output.replace(/语言:.*?\n/g, '').replace(/转写结果:/g, '').trim());
        }
      } else {
        console.error('转写失败:', errorOutput);
        reject(new Error('转写失败: ' + errorOutput));
      }
    });
  });
}

// 流式转写（WebSocket）
export async function* streamTranscribe(audioChunk: Buffer): AsyncGenerator<string> {
  // 实现流式转写逻辑
  // 这里需要根据Kimi的实时API调整
  yield '';
}
