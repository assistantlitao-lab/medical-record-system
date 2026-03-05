import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

interface Client {
  id: string;
  ws: WebSocket;
  userId?: string;
  isRecording: boolean;
}

const clients = new Map<string, Client>();

export function initWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, req) => {
    const clientId = uuidv4();
    const client: Client = {
      id: clientId,
      ws,
      isRecording: false
    };
    clients.set(clientId, client);

    console.log(`WebSocket client connected: ${clientId}`);

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        await handleMessage(client, message);
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          data: { message: 'Invalid message format' }
        }));
      }
    });

    ws.on('close', () => {
      console.log(`WebSocket client disconnected: ${clientId}`);
      clients.delete(clientId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for client ${clientId}:`, error);
      clients.delete(clientId);
    });

    // 发送连接成功消息
    ws.send(JSON.stringify({
      type: 'connected',
      data: { client_id: clientId }
    }));
  });
}

async function handleMessage(client: Client, message: any) {
  const { type, data } = message;

  switch (type) {
    case 'auth':
      // 验证用户token
      client.userId = data.user_id;
      client.ws.send(JSON.stringify({
        type: 'auth_success',
        data: { user_id: data.user_id }
      }));
      break;

    case 'start_recording':
      client.isRecording = true;
      client.ws.send(JSON.stringify({
        type: 'recording_started',
        data: { timestamp: Date.now() }
      }));
      break;

    case 'audio_chunk':
      if (!client.isRecording) {
        client.ws.send(JSON.stringify({
          type: 'error',
          data: { message: 'Not recording' }
        }));
        return;
      }

      // 处理音频数据并返回实时转写结果
      // 这里需要集成Kimi的实时转写API
      try {
        // 模拟转写结果
        client.ws.send(JSON.stringify({
          type: 'partial_result',
          data: {
            text: '', // 实时转写文本
            is_final: false
          }
        }));
      } catch (error: any) {
        client.ws.send(JSON.stringify({
          type: 'error',
          data: { message: error.message }
        }));
      }
      break;

    case 'stop_recording':
      client.isRecording = false;
      client.ws.send(JSON.stringify({
        type: 'recording_stopped',
        data: {
          text: '', // 最终转写结果
          duration: data.duration
        }
      }));
      break;

    default:
      client.ws.send(JSON.stringify({
        type: 'error',
        data: { message: `Unknown message type: ${type}` }
      }));
  }
}

// 广播消息给所有客户端
export function broadcast(message: any, excludeClientId?: string) {
  clients.forEach((client, id) => {
    if (id !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  });
}
