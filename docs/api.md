# API接口定义文档

## 基础信息
- **Base URL**: `https://api.example.com/api/v1`
- **认证方式**: JWT (Bearer Token)
- **Content-Type**: `application/json`

---

## 1. 用户认证模块

### 1.1 登录
```http
POST /auth/login
```

**请求参数：**
```json
{
  "phone": "13800138000",
  "password": "123456"
}
```

**成功响应：**
```json
{
  "code": 200,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user_id": "u_123456",
    "name": "张医生",
    "expires_in": 3600
  }
}
```

**错误响应：**
```json
{
  "code": 401,
  "message": "手机号或密码错误"
}
```

---

### 1.2 登出
```http
POST /auth/logout
Authorization: Bearer {token}
```

---

## 2. 患者管理模块

### 2.1 患者列表
```http
GET /patients?keyword=张三&page=1&page_size=20
Authorization: Bearer {token}
```

**响应：**
```json
{
  "code": 200,
  "data": {
    "total": 100,
    "list": [
      {
        "id": "p_123456",
        "name": "张三",
        "card_no": "20240301001",
        "phone": "13800138000",
        "created_at": "2024-03-01T10:00:00Z",
        "last_visit_date": "2024-03-04T14:30:00Z"
      }
    ]
  }
}
```

---

### 2.2 创建患者
```http
POST /patients
Authorization: Bearer {token}
```

**请求体：**
```json
{
  "name": "张三",
  "card_no": "20240301001",
  "phone": "13800138000",
  "gender": "male",
  "birthday": "1985-06-15",
  "id_card": "310101198506151234",
  "address": "上海市浦东新区",
  "allergy": "青霉素过敏"
}
```

---

### 2.3 获取患者详情
```http
GET /patients/{patient_id}
Authorization: Bearer {token}
```

---

### 2.4 更新患者
```http
PUT /patients/{patient_id}
Authorization: Bearer {token}
```

---

### 2.5 删除患者（软删除）
```http
DELETE /patients/{patient_id}
Authorization: Bearer {token}
```

---

## 3. 就诊记录模块

### 3.1 就诊记录列表
```http
GET /patients/{patient_id}/visits
Authorization: Bearer {token}
```

---

### 3.2 创建就诊记录
```http
POST /patients/{patient_id}/visits
Authorization: Bearer {token}
```

**响应：**
```json
{
  "code": 201,
  "data": {
    "id": "v_123456",
    "visit_no": "20240304-0001"
  }
}
```

---

### 3.3 获取就诊记录详情
```http
GET /visits/{visit_id}
Authorization: Bearer {token}
```

**响应：**
```json
{
  "code": 200,
  "data": {
    "id": "v_123456",
    "patient_id": "p_123456",
    "patient_name": "张三",
    "visit_date": "2024-03-04T14:30:00Z",
    "status": "completed",
    "recordings": [
      {
        "id": "r_123456",
        "duration": 180,
        "audio_url": "https://oss.example.com/audio/xxx.mp3",
        "transcription": "患者因咳嗽3天就诊...",
        "created_at": "2024-03-04T14:30:00Z"
      }
    ],
    "medical_record": {
      "template_id": "t_standard",
      "template_name": "标准病历",
      "fields": [
        {
          "field_id": "f_001",
          "field_name": "主诉",
          "field_key": "chief_complaint",
          "content": "咳嗽3天",
          "candidates": [
            {"id": "c_001", "text": "伴发热", "confidence": 0.95}
          ]
        }
      ]
    }
  }
}
```

---

### 3.4 获取编辑锁
```http
POST /visits/{visit_id}/lock
Authorization: Bearer {token}
```

**请求体：**
```json
{
  "device_id": "device_123456"
}
```

**响应：**
```json
{
  "code": 200,
  "data": {
    "lock_token": "lock_abc123",
    "expires_at": "2024-03-04T15:00:00Z",
    "locked_by_other": false,
    "locker_device": null
  }
}
```

---

### 3.5 保存病历
```http
PUT /visits/{visit_id}
Authorization: Bearer {token}
```

**请求体：**
```json
{
  "lock_token": "lock_abc123",
  "template_id": "t_standard",
  "fields": [
    {"field_key": "chief_complaint", "content": "咳嗽3天，伴发热1天"},
    {"field_key": "present_illness", "content": "患者3天前受凉后出现咳嗽..."}
  ],
  "status": "completed"
}
```

---

## 4. 录音与转写模块

### 4.1 初始化上传
```http
POST /visits/{visit_id}/recordings/init
Authorization: Bearer {token}
```

**请求体：**
```json
{
  "filename": "recording.mp3",
  "file_size": 10485760,
  "duration": 300,
  "mime_type": "audio/mp3"
}
```

**响应：**
```json
{
  "code": 201,
  "data": {
    "upload_id": "upload_123456",
    "chunk_size": 2097152,
    "max_chunks": 5
  }
}
```

---

### 4.2 上传分片
```http
POST /recordings/{upload_id}/chunks/{chunk_index}
Authorization: Bearer {token}
Content-Type: multipart/form-data
```

**请求体：**
```
chunk: [二进制数据]
```

---

### 4.3 合并分片
```http
POST /recordings/{upload_id}/complete
Authorization: Bearer {token}
```

---

### 4.4 开始转写
```http
POST /recordings/{recording_id}/transcribe
Authorization: Bearer {token}
```

**响应：**
```json
{
  "code": 202,
  "data": {
    "task_id": "task_123456",
    "estimated_time": 60
  }
}
```

---

### 4.5 查询转写状态
```http
GET /recordings/{recording_id}/status
Authorization: Bearer {token}
```

**响应：**
```json
{
  "code": 200,
  "data": {
    "status": "completed",
    "progress": 100,
    "transcription": "患者因咳嗽3天就诊...",
    "error_msg": null
  }
}
```

---

## 5. AI病历生成模块

### 5.1 生成病历
```http
POST /visits/{visit_id}/generate
Authorization: Bearer {token}
```

**请求体：**
```json
{
  "template_id": "t_standard",
  "transcription": "患者因咳嗽3天就诊..."
}
```

**响应：**
```json
{
  "code": 200,
  "data": {
    "fields": [
      {
        "field_key": "chief_complaint",
        "field_name": "主诉",
        "content": "咳嗽3天",
        "candidates": [
          {"id": "c_001", "text": "伴发热", "type": "word", "confidence": 0.95},
          {"id": "c_002", "text": "咳痰", "type": "word", "confidence": 0.88}
        ]
      }
    ],
    "raw_text": "..."
  }
}
```

---

## 6. 模板管理模块

### 6.1 模板列表
```http
GET /templates
Authorization: Bearer {token}
```

---

### 6.2 获取模板详情
```http
GET /templates/{template_id}
Authorization: Bearer {token}
```

**响应：**
```json
{
  "code": 200,
  "data": {
    "id": "t_standard",
    "name": "标准病历",
    "description": "适用于一般门诊病历",
    "fields": [
      {
        "id": "f_001",
        "name": "主诉",
        "key": "chief_complaint",
        "type": "textarea",
        "required": true,
        "sort_order": 1,
        "placeholder": "患者最主要的症状..."
      }
    ]
  }
}
```

---

## 7. 管理后台模块

### 7.1 员工账号列表
```http
GET /admin/users
Authorization: Bearer {token}
```

---

### 7.2 创建员工账号
```http
POST /admin/users
Authorization: Bearer {token}
```

---

### 7.3 工作量统计
```http
GET /admin/statistics/workload?start_date=2024-03-01&end_date=2024-03-31
Authorization: Bearer {token}
```

---

### 7.4 系统监控指标
```http
GET /admin/metrics
Authorization: Bearer {token}
```

---

### 7.5 操作日志
```http
GET /admin/logs?start_date=2024-03-01&end_date=2024-03-31&page=1
Authorization: Bearer {token}
```

---

### 7.6 智能纠错词典
```http
GET /admin/dictionary?keyword=阿莫&page=1
Authorization: Bearer {token}
```

---

### 7.7 添加词汇规则
```http
POST /admin/dictionary
Authorization: Bearer {token}
```

**请求体：**
```json
{
  "error": "阿莫吸林",
  "correct": "阿莫西林",
  "category": "drugs",
  "auto_apply": true
}
```

---

## 8. 导出功能

### 8.1 导出病历
```http
POST /visits/{visit_id}/export
Authorization: Bearer {token}
```

**请求体：**
```json
{
  "format": "pdf"
}
```

**响应：**
```json
{
  "code": 200,
  "data": {
    "download_url": "https://oss.example.com/export/xxx.pdf?expire=xxx"
  }
}
```

---

## 错误码说明

| 状态码 | 错误类型 | 说明 |
|--------|----------|------|
| 200 | 成功 | 请求成功 |
| 201 | 创建成功 | 资源创建成功 |
| 202 | 已接受 | 异步处理中 |
| 400 | 参数错误 | 请求参数校验失败 |
| 401 | 未授权 | Token过期或无效 |
| 403 | 禁止访问 | 权限不足或资源被锁定 |
| 404 | 资源不存在 | 患者或就诊记录不存在 |
| 409 | 资源冲突 | 手机号已存在或版本冲突 |
| 429 | 请求频繁 | 触发限流 |
| 500 | 服务器错误 | ASR或AI服务异常 |
