# Kimi API 集成方案

## 1. ASR 语音识别

### 方案 A: 实时流式识别 (推荐)

**适用场景**: 在线录音

**WebSocket 连接**:
```
wss://api.moonshot.cn/v1/realtime
```

**连接参数**:
```json
{
  "Authorization": "Bearer {api_key}",
  "Content-Type": "application/json"
}
```

**消息格式**:
```javascript
// Client → Server: 发送音频数据
{
  "type": "audio_chunk",
  "data": "base64_encoded_opus_audio"
}

// Server → Client: 实时转写结果
{
  "type": "partial_result",
  "data": {
    "text": "患者因咳嗽",
    "is_final": false
  }
}
```

**前端实现要点**:
- 使用 Web Audio API 采集音频
- 使用 opus-recorder 进行 opus 编码
- 每 100ms 发送一个音频 chunk
- 实现断线重连机制

---

### 方案 B: 文件识别

**适用场景**: 音频文件上传

**接口**:
```http
POST https://api.moonshot.cn/v1/audio/transcriptions
Authorization: Bearer {api_key}
Content-Type: multipart/form-data
```

**请求参数**:
```
file: @audio.mp3
model: whisper-1
language: zh
prompt: 这是一段医患对话，包含医疗术语
```

**响应**:
```json
{
  "text": "患者因咳嗽3天就诊，伴有发热...",
  "segments": [
    {"id": 0, "start": 0.0, "end": 4.5, "text": "患者因咳嗽3天就诊"},
    {"id": 1, "start": 4.5, "end": 8.0, "text": "伴有发热"}
  ]
}
```

**处理时间**: 音频时长 × 0.5

---

## 2. AI 病历生成

### 接口信息

```http
POST https://api.moonshot.cn/v1/chat/completions
Authorization: Bearer {api_key}
Content-Type: application/json
```

### 请求体

```json
{
  "model": "kimi-latest",
  "messages": [
    {
      "role": "system",
      "content": "你是一位资深医疗文档撰写助手..."
    },
    {
      "role": "user",
      "content": "病历模板：标准病历\n\n模板字段：...\n\n转写文本：..."
    }
  ],
  "temperature": 0.3,
  "max_tokens": 4096,
  "top_p": 0.9,
  "frequency_penalty": 0.2
}
```

### Prompt 模板

**System Prompt**:
```
你是一位资深医疗文档撰写助手，擅长根据医患对话转写文本生成规范的病历。

规则：
1. 严格按照提供的模板字段提取内容
2. 使用专业医学术语，避免口语化表达
3. 不确定的内容标注"[待确认]"
4. 参考提供的纠错词典修正专业词汇
5. 病历书写需符合中国病历书写规范

纠错词典参考：
- 阿莫吸林 → 阿莫西林
- 头苞 → 头孢
- 步洛芬 → 布洛芬
...
```

**User Prompt**:
```
病历模板：{template_name}

模板字段：
{fields_list}

转写文本：
{transcription}

请按以下JSON格式返回：
{
  "fields": [
    {"field_key": "chief_complaint", "content": "..."}
  ],
  "candidates": [
    {"field_key": "chief_complaint", "items": [
      {"text": "...", "confidence": 0.95}
    ]}
  ]
}
```

---

## 3. 候选词生成

### 方案 1: 同轮生成 (推荐)

在同一轮 LLM 请求中返回候选词，通过 Prompt 控制：

```
针对每个字段，从原始转写文本中提取 3-5 个可能的补充短语，
按置信度排序，一并返回在 candidates 字段中。
```

**优点**:
- 一次请求，成本低
- 延迟低

**缺点**:
- 候选词质量依赖模型能力

---

### 方案 2: 独立请求

针对每个字段单独调用 API 生成候选：

```
Prompt: 针对"{field_content}"，从"{transcription}"中提取相关补充短语
```

**优点**:
- 候选词质量高

**缺点**:
- 多次调用，成本高
- 延迟高

---

## 4. 错误处理与降级

### 超时处理

```yaml
连接超时: 10秒
读取超时: 180秒
超时后处理:
  - 返回"AI服务繁忙，请重试"
  - 保留转写文本供手动编辑
```

### 错误码映射

| HTTP 状态码 | 处理方式 |
|-------------|----------|
| 401/403 | Token 无效或额度不足 → 提示"AI服务配置异常" |
| 429 | 请求过于频繁 → 指数退避重试（1s, 2s, 4s） |
| 500/502/503 | 服务端错误 → 重试 3 次后放弃 |
| 内容过滤 | 触发安全策略 → 提示"内容可能包含敏感信息" |

### 降级方案

```javascript
// Kimi API 不可用时
function fallbackToManual(transcription) {
  return {
    success: false,
    message: "AI生成服务暂时不可用，已显示原始文本",
    data: {
      transcription: transcription,
      fields: []
    }
  };
}
```

---

## 5. Token 成本控制

### 成本估算

| 项目 | 数值 |
|------|------|
| 单次输入 | ~3000 tokens |
| 单次输出 | ~1000 tokens |
| 单次总计 | ~4000 tokens |
| 单价 (K2) | 输入 ¥0.003/1K，输出 ¥0.006/1K |
| 单次成本 | ~¥0.02 |

### 月度预算

```yaml
用户数: 20人
人均日生成: 10份
日生成量: 200份
月生成量: 6000份
预估费用: ¥120/月
```

### 成本控制措施

1. **每日上限**: 单人 50 份/天
2. **长度限制**: 超过 3000 字分段处理
3. **缓存机制**: 相似转写结果缓存（可选）
4. **监控告警**: 每日 Token 消耗超阈值告警

---

## 6. 开发环境配置

### API Key 管理

```javascript
// config/kimi.js
module.exports = {
  apiKey: process.env.KIMI_API_KEY,
  baseURL: 'https://api.moonshot.cn/v1',
  models: {
    asr: 'whisper-1',
    chat: 'kimi-latest'
  },
  timeout: 180000, // 180秒
  retry: {
    maxAttempts: 3,
    backoff: [1000, 2000, 4000] // 指数退避
  }
};
```

### 环境变量

```bash
# .env
KIMI_API_KEY=your_api_key_here
KIMI_MAX_TOKENS_PER_DAY=100000
```
