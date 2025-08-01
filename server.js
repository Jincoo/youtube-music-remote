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
    
    // 모바일 웹 페이지 라우트 (세션 ID 자동 매칭)
    this.app.get('/mobile', (req, res) => {
      try {
        const fs = require('fs');
        const path = require('path');
        let html = fs.readFileSync(path.join(__dirname, 'mobile', 'index.html'), 'utf8');
        
        // 현재 활성화된 PC 세션 찾기
        let pcSessionId = null;
        for (const [sessionId, session] of this.sessions) {
          if (session.deviceType === 'pc' && session.ws.readyState === WebSocket.OPEN) {
            pcSessionId = sessionId;
            break;
          }
        }
        
        // PC 세션이 있으면 자동으로 URL에 추가
        if (pcSessionId && !req.query.session) {
          return res.redirect(`/mobile?session=${pcSessionId}`);
        }
        
        const serverIP = this.localIP || req.get('host').split(':')[0];
        html = html.replace(
          'let serverHost = window.location.hostname;',
          `let serverHost = '${serverIP}';`
        );
        
        res.send(html);
      } catch (error) {
        console.error('모바일 페이지 로드 오류:', error);
        res.status(500).send('페이지 로드 실패');
      }
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
    
    // 세션 상태 확인 API
    this.app.get('/api/sessions', (req, res) => {
      const sessionList = Array.from(this.sessions.entries()).map(([id, data]) => ({
        sessionId: id,
        deviceType: data.deviceType,
        connected: data.ws.readyState === WebSocket.OPEN,
        lastActivity: data.lastActivity,
        status: data.status
      }));
      
      res.json({ 
        sessions: sessionList,
        totalSessions: sessionList.length,
        activeSessions: sessionList.filter(s => s.connected).length
      });
    });

    // 디버깅 페이지
    this.app.get('/debug', (req, res) => {
      const sessionList = Array.from(this.sessions.entries()).map(([id, data]) => ({
        sessionId: id,
        deviceType: data.deviceType,
        connected: data.ws.readyState === WebSocket.OPEN,
        lastActivity: new Date(data.lastActivity).toLocaleString(),
        status: data.status
      }));
      
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>YouTube Music Remote Debug</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .session { 
              border: 1px solid #ccc; 
              padding: 15px; 
              margin: 10px 0; 
              border-radius: 5px;
              background: ${sessionList.some(s => s.connected) ? '#e8f5e8' : '#ffe8e8'};
            }
            .connected { background: #e8f5e8; }
            .disconnected { background: #ffe8e8; }
            pre { background: #f5f5f5; padding: 10px; overflow: auto; }
          </style>
        </head>
        <body>
          <h1>🎵 YouTube Music Remote 디버그</h1>
          <p><strong>총 세션 수:</strong> ${sessionList.length}</p>
          <p><strong>활성 세션 수:</strong> ${sessionList.filter(s => s.connected).length}</p>
          
          <h2>세션 목록</h2>
          ${sessionList.map(session => `
            <div class="session ${session.connected ? 'connected' : 'disconnected'}">
              <h3>${session.deviceType.toUpperCase()} - ${session.connected ? '🟢 연결됨' : '🔴 끊어짐'}</h3>
              <p><strong>세션 ID:</strong> ${session.sessionId}</p>
              <p><strong>마지막 활동:</strong> ${session.lastActivity}</p>
              <details>
                <summary>상태 정보</summary>
                <pre>${JSON.stringify(session.status, null, 2)}</pre>
              </details>
            </div>
          `).join('')}
          
          <h2>빠른 연결</h2>
          ${sessionList.filter(s => s.deviceType === 'pc' && s.connected).map(session => `
            <p><a href="/mobile?session=${session.sessionId}" target="_blank">
              📱 이 PC 세션으로 모바일 연결: ${session.sessionId.substring(0, 12)}...
            </a></p>
          `).join('') || '<p>❌ 활성 PC 세션이 없습니다</p>'}
          
          <br><br>
          <button onclick="location.reload()">🔄 새로고침</button>
        </body>
        </html>
      `);
    });
    this.app.get('/api/pc-session', (req, res) => {
      for (const [sessionId, session] of this.sessions) {
        if (session.deviceType === 'pc' && session.ws.readyState === WebSocket.OPEN) {
          res.json({ 
            success: true, 
            sessionId: sessionId,
            status: session.status 
          });
          return;
        }
      }
      res.json({ 
        success: false, 
        message: 'PC 세션을 찾을 수 없습니다' 
      });
    });
  }
  
  setupWebSocket() {
    // WebSocket 서버를 로컬 네트워크에만 바인딩
    this.wss = new WebSocket.Server({ 
      port: this.port + 1,
      host: '0.0.0.0'
    });
    
    this.wss.on('connection', (ws, req) => {
      const clientIP = req.socket.remoteAddress;
      console.log(`새로운 WebSocket 연결: ${clientIP}`);
      
      // 로컬 네트워크가 아닌 연결은 차단 (보안 강화)
      if (clientIP && !this.isLocalNetwork(clientIP)) {
        console.log(`비허용 IP에서 연결 시도 차단: ${clientIP}`);
        ws.close();
        return;
      }
      
      // Heartbeat 설정
      ws.isAlive = true;
      ws.lastActivity = Date.now();
      
      // Ping 응답 처리
      ws.on('pong', () => {
        ws.isAlive = true;
        ws.lastActivity = Date.now();
        console.log('Pong 수신 - 연결 상태 양호');
      });
      
      // 커스텀 heartbeat 메시지 처리
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          // Heartbeat 메시지 처리
          if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            ws.lastActivity = Date.now();
            return;
          }
          
          // 일반 메시지 처리
          ws.lastActivity = Date.now();
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
    
    console.log('세션 등록 요청:', { sessionId, deviceType });
    
    if (!sessionId || !deviceType) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'sessionId와 deviceType이 필요합니다'
      }));
      return;
    }
    
    // 기존 같은 타입의 세션이 있으면 교체
    const existingKey = `${sessionId}_${deviceType}`;
    for (const [key, session] of this.sessions) {
      if (key.startsWith(sessionId) && key.endsWith(deviceType)) {
        console.log(`기존 ${deviceType} 세션 교체`);
        if (session.ws.readyState === WebSocket.OPEN) {
          session.ws.close();
        }
        this.sessions.delete(key);
        break;
      }
    }
    
    // 새 세션 등록 (세션ID_기기타입으로 키 생성)
    this.sessions.set(existingKey, {
      ws: ws,
      deviceType: deviceType,
      sessionId: sessionId,
      status: {},
      lastActivity: Date.now()
    });
    
    console.log(`✅ ${deviceType.toUpperCase()} 연결됨`);
    
    // 등록 완료 응답
    ws.send(JSON.stringify({
      type: 'registered',
      sessionId: sessionId,
      deviceType: deviceType
    }));
    
    // 다른 기기에 연결 알림
    this.notifyOtherDevices(sessionId, deviceType, 'device_connected');
    
    // 연결 상태 출력
    this.logConnectionStatus();
  }
  
  // 연결 상태 간단히 출력
  logConnectionStatus() {
    const devices = Array.from(this.sessions.values()).map(s => s.deviceType);
    const pc = devices.includes('pc') ? '🖥️ PC' : '❌ PC';
    const mobile = devices.includes('mobile') ? '📱 Mobile' : '❌ Mobile';
    console.log(`연결 상태: ${pc} | ${mobile}`);
  }
  
  // 다른 기기들에게 알림
  notifyOtherDevices(sessionId, deviceType, messageType) {
    for (const [key, session] of this.sessions) {
      if (session.sessionId === sessionId && 
          session.deviceType !== deviceType && 
          session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({
          type: messageType,
          deviceType: deviceType
        }));
      }
    }
  }
  
  // PC에게 상태 전송 요청
  requestStatusFromPC(sessionId) {
    for (const [id, session] of this.sessions) {
      if (id === sessionId && session.deviceType === 'pc' && session.ws.readyState === WebSocket.OPEN) {
        console.log('PC에게 상태 전송 요청');
        session.ws.send(JSON.stringify({
          type: 'remote_command',
          type: 'get_status'
        }));
        break;
      }
    }
  }
  
  // 연결된 기기 목록 출력
  logConnectedDevices(sessionId) {
    const devices = [];
    for (const [id, session] of this.sessions) {
      if (id === sessionId && session.ws.readyState === WebSocket.OPEN) {
        devices.push(session.deviceType);
      }
    }
    console.log(`세션 ${sessionId}의 연결된 기기:`, devices);
  }
  
  forwardControlCommand(message) {
    const { sessionId, command } = message;
    
    console.log(`📱 모바일 제어 명령: ${command.type}`);
    
    // 같은 세션의 PC 찾기
    let pcSession = null;
    for (const [key, session] of this.sessions) {
      if (session.sessionId === sessionId && 
          session.deviceType === 'pc' && 
          session.ws.readyState === WebSocket.OPEN) {
        pcSession = session;
        break;
      }
    }
    
    if (pcSession) {
      console.log('🖥️ PC에게 명령 전달');
      pcSession.ws.send(JSON.stringify({
        type: 'remote_command',
        ...command
      }));
    } else {
      console.error('❌ PC 연결 안됨');
    }
  }
  
  updateSessionStatus(message) {
    const { sessionId } = message;
    
    // PC 상태를 모바일에게 전달
    for (const [key, session] of this.sessions) {
      if (session.sessionId === sessionId && 
          session.deviceType === 'mobile' && 
          session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({
          type: 'status_update',
          ...message
        }));
      }
      
      // 세션에 상태 저장
      if (session.sessionId === sessionId) {
        session.status = { ...message, timestamp: Date.now() };
      }
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
  
  // 로컬 네트워크 IP인지 확인하는 함수 (보안)
  isLocalNetwork(ip) {
    if (!ip) return false;
    
    // IPv6 맵핑된 IPv4 주소 처리
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }
    
    // 로컬 네트워크 대역 확인
    return ip === '127.0.0.1' || 
           ip === '::1' ||
           ip.startsWith('192.168.') ||
           ip.startsWith('10.') ||
           ip.startsWith('172.16.') ||
           ip.startsWith('172.17.') ||
           ip.startsWith('172.18.') ||
           ip.startsWith('172.19.') ||
           ip.startsWith('172.2') ||
           ip.startsWith('172.30.') ||
           ip.startsWith('172.31.');
  }
      
  startServer() {
    // PC의 로컬 네트워크 IP 주소 찾기
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    let localIP = '127.0.0.1';
    
    // 192.168.x.x 또는 10.x.x.x 대역 찾기 (로컬 네트워크)
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          if (net.address.startsWith('192.168.') || net.address.startsWith('10.')) {
            localIP = net.address;
            break;
          }
        }
      }
      if (localIP !== '127.0.0.1') break;
    }
    
    // 로컬 네트워크 IP에만 바인딩 (더 안전)
    this.server = this.app.listen(this.port, localIP, () => {
      console.log(`🚀 YouTube Music Remote 서버 시작됨:`);
      console.log(`- 서버 IP: ${localIP}`);
      console.log(`- PC에서 접속: http://localhost:${this.port}`);
      console.log(`- 모바일에서 접속: http://${localIP}:${this.port}/mobile`);
      console.log(`- WebSocket: ws://${localIP}:${this.port + 1}`);
      console.log('');
      console.log('📱 모바일 브라우저에서 이 주소로 접속하세요:');
      console.log(`   http://${localIP}:${this.port}/mobile`);
      console.log('');
      console.log('⚠️  같은 Wi-Fi 네트워크에 연결되어 있어야 합니다.');
    });
    
    // IP 주소를 전역 변수에 저장 (모바일 페이지에서 사용)
    this.localIP = localIP;
    
    // WebSocket 연결 상태 모니터링 (30초마다)
    setInterval(() => {
      this.monitorConnections();
    }, 30000);
    
    // 세션 정리 (30초마다)
    setInterval(() => {
      this.cleanupSessions();
    }, 30000);
    
    // Heartbeat 전송 (15초마다)
    setInterval(() => {
      this.sendHeartbeat();
    }, 15000);
  }
  
  // 연결 상태 모니터링
  monitorConnections() {
    console.log('\n=== 연결 상태 점검 ===');
    
    this.wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        console.log('💀 응답 없는 연결 종료');
        return ws.terminate();
      }
      
      // 활동이 5분 이상 없으면 연결 확인
      const inactiveTime = Date.now() - (ws.lastActivity || 0);
      if (inactiveTime > 5 * 60 * 1000) {
        console.log('⏰ 비활성 연결 감지 - Ping 전송');
        ws.isAlive = false;
        ws.ping();
      }
    });
    
    // 현재 연결 상태 출력
    this.logConnectionStatus();
  }
  
  // Heartbeat 전송
  sendHeartbeat() {
    const heartbeatMessage = JSON.stringify({
      type: 'heartbeat',
      timestamp: Date.now(),
      server: 'youtube-music-remote'
    });
    
    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(heartbeatMessage);
      }
    });
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