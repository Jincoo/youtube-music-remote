// WebSocket 서버 - 모바일과 PC 간 통신 중계
const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const QRCode = require('qrcode');

class YouTubeMusicRemoteServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.wss = null;
    this.sessions = new Map(); // sessionId -> { ws, deviceType, status }
    this.port = 8080;
    
    this.init();
  }
  
  init() {
    this.setupExpress();
    this.setupWebSocket();
    this.startServer();
  }
  
  setupExpress() {
    // 정적 파일 제공
    this.app.use(express.static(path.join(__dirname, 'mobile')));
    
    // 모바일 웹 페이지 라우트
    this.app.get('/mobile', (req, res) => {
      res.sendFile(path.join(__dirname, 'mobile', 'index.html'));
    });
    
    // QR 코드 생성 API
    this.app.get('/qr/:sessionId', async (req, res) => {
      try {
        const sessionId = req.params.sessionId;
        const mobileUrl = `http://localhost:${this.port}/mobile?session=${sessionId}`;
        const qrCode = await QRCode.toDataURL(mobileUrl);
        
        res.json({
          success: true,
          qrCode: qrCode,
          url: mobileUrl
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
    
    // 세션 상태 API
    this.app.get('/api/sessions', (req, res) => {
      const sessionList = Array.from(this.sessions.entries()).map(([id, data]) => ({
        sessionId: id,
        deviceType: data.deviceType,
        connected: data.ws.readyState === WebSocket.OPEN,
        lastStatus: data.status
      }));
      
      res.json({ sessions: sessionList });
    });
  }
  
  setupWebSocket() {
    this.wss = new WebSocket.Server({ port: this.port + 1 });
    
    this.wss.on('connection', (ws, req) => {
      console.log('새로운 WebSocket 연결');
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('메시지 파싱 오류:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: '잘못된 메시지 형식'
          }));
        }
      });
      
      ws.on('close', () => {
        console.log('WebSocket 연결 종료');
        this.removeSession(ws);
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket 오류:', error);
        this.removeSession(ws);
      });
    });
  }
  
  handleMessage(ws, message) {
    console.log('메시지 수신:', message);
    
    switch (message.type) {
      case 'register':
        this.registerSession(ws, message);
        break;
        
      case 'control_command':
        this.forwardControlCommand(message);
        break;
        
      case 'status_update':
        this.updateSessionStatus(message);
        break;
        
      case 'get_sessions':
        this.sendSessionList(ws);
        break;
        
      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: '알 수 없는 메시지 타입'
        }));
    }
  }
  
  registerSession(ws, message) {
    const { sessionId, deviceType } = message;
    
    if (!sessionId || !deviceType) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'sessionId와 deviceType이 필요합니다'
      }));
      return;
    }
    
    // 기존 세션이 있다면 제거
    if (this.sessions.has(sessionId)) {
      const oldSession = this.sessions.get(sessionId);
      if (oldSession.ws.readyState === WebSocket.OPEN) {
        oldSession.ws.close();
      }
    }
    
    // 새 세션 등록
    this.sessions.set(sessionId, {
      ws: ws,
      deviceType: deviceType,
      status: {},
      lastActivity: Date.now()
    });
    
    console.log(`세션 등록됨: ${sessionId} (${deviceType})`);
    
    ws.send(JSON.stringify({
      type: 'registered',
      sessionId: sessionId,
      deviceType: deviceType
    }));
    
    // 다른 기기에 연결 알림
    this.broadcastToSession(sessionId, {
      type: 'device_connected',
      deviceType: deviceType
    }, ws);
  }
  
  forwardControlCommand(message) {
    const { sessionId, command } = message;
    
    if (!this.sessions.has(sessionId)) {
      return;
    }
    
    const session = this.sessions.get(sessionId);
    
    // PC(Chrome Extension)에게 명령 전달
    if (session.deviceType === 'pc' && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({
        type: 'remote_command',
        ...command
      }));
    }
    
    console.log(`명령 전달: ${sessionId} -> ${command.type}`);
  }
  
  updateSessionStatus(message) {
    const { sessionId } = message;
    
    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId);
      session.status = {
        ...message,
        timestamp: Date.now()
      };
      session.lastActivity = Date.now();
      
      // 모바일 기기들에게 상태 업데이트 전달
      this.broadcastToSession(sessionId, {
        type: 'status_update',
        ...message
      }, session.ws);
    }
  }
  
  broadcastToSession(sessionId, message, excludeWs = null) {
    // 같은 세션의 다른 기기들에게 메시지 전달
    for (const [id, session] of this.sessions) {
      if (id === sessionId && session.ws !== excludeWs && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify(message));
      }
    }
  }
  
  sendSessionList(ws) {
    const sessionList = Array.from(this.sessions.entries()).map(([id, data]) => ({
      sessionId: id,
      deviceType: data.deviceType,
      connected: data.ws.readyState === WebSocket.OPEN,
      lastActivity: data.lastActivity,
      status: data.status
    }));
    
    ws.send(JSON.stringify({
      type: 'session_list',
      sessions: sessionList
    }));
  }
  
  removeSession(ws) {
    for (const [sessionId, session] of this.sessions) {
      if (session.ws === ws) {
        console.log(`세션 제거됨: ${sessionId}`);
        this.sessions.delete(sessionId);
        
        // 다른 기기에 연결 해제 알림
        this.broadcastToSession(sessionId, {
          type: 'device_disconnected',
          deviceType: session.deviceType
        });
        break;
      }
    }
  }
  
  startServer() {
    this.server = this.app.listen(this.port, () => {
      console.log(`YouTube Music Remote 서버 시작됨:`);
      console.log(`- HTTP 서버: http://localhost:${this.port}`);
      console.log(`- WebSocket 서버: ws://localhost:${this.port + 1}`);
      console.log(`- 모바일 접속: http://localhost:${this.port}/mobile`);
    });
    
    // 정리 작업
    setInterval(() => {
      this.cleanupSessions();
    }, 30000); // 30초마다 정리
  }
  
  cleanupSessions() {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5분
    
    for (const [sessionId, session] of this.sessions) {
      if (session.ws.readyState !== WebSocket.OPEN || 
          (now - session.lastActivity) > timeout) {
        console.log(`비활성 세션 정리: ${sessionId}`);
        this.sessions.delete(sessionId);
      }
    }
  }
}

// 서버 시작
if (require.main === module) {
  new YouTubeMusicRemoteServer();
}

module.exports = YouTubeMusicRemoteServer;