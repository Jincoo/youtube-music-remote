// background.js - 자동 네트워크 검색 버전
class AutoDiscoveryBackgroundService {
  constructor() {
    this.sessions = new Map(); // tabId -> sessionInfo
    this.discoveryChannel = null;
    this.init();
  }
  
  init() {
    this.setupMessageListeners();
    this.setupTabListeners();
    this.setupDiscoveryChannel();
    console.log('🔍 자동 네트워크 검색 백그라운드 서비스 시작됨');
  }
  
  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // 비동기 응답을 위해 true 반환
    });
  }
  
  setupTabListeners() {
    // YouTube Music 탭 감지
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && 
          tab.url && 
          tab.url.includes('music.youtube.com')) {
        console.log('🎵 YouTube Music 탭 로드됨:', tabId);
        this.registerYouTubeMusicTab(tabId);
      }
    });
    
    // 탭 제거 시 세션 정리
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (this.sessions.has(tabId)) {
        console.log('🗑️ YouTube Music 탭 세션 정리:', tabId);
        this.sessions.delete(tabId);
      }
    });
  }
  
  setupDiscoveryChannel() {
    try {
      // Service Worker에서는 Broadcast Channel이 제한적이므로
      // Chrome Storage API를 사용한 폴백 방식 사용
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;
        
        for (const [key, { newValue }] of Object.entries(changes)) {
          if (key.startsWith('discovery_message_') && newValue) {
            this.handleDiscoveryMessage(newValue);
            
            // 처리된 메시지 정리 (30초 후)
            setTimeout(() => {
              chrome.storage.local.remove(key);
            }, 30000);
          }
        }
      });
      
      console.log('📡 Discovery 채널 설정 완료 (Storage 기반)');
    } catch (error) {
      console.error('Discovery 채널 설정 실패:', error);
    }
  }
  
  registerYouTubeMusicTab(tabId) {
    this.sessions.set(tabId, {
      type: 'host',
      tabId: tabId,
      registered: Date.now(),
      lastActivity: Date.now()
    });
    
    // 탭에 호스트 모드 활성화 알림
    chrome.tabs.sendMessage(tabId, {
      type: 'activate_host_mode'
    }).catch(() => {
      // Content script가 아직 로드되지 않았을 수 있음
    });
  }
  
  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.type) {
        case 'check_host_status':
          await this.checkHostStatus(request, sender, sendResponse);
          break;
          
        case 'send_command':
          await this.forwardCommand(request, sender, sendResponse);
          break;
          
        case 'get_status':
          await this.getHostStatus(request, sender, sendResponse);
          break;
          
        case 'discovery_broadcast':
          await this.broadcastDiscoveryMessage(request, sender, sendResponse);
          break;
          
        case 'register_client':
          await this.registerClient(request, sender, sendResponse);
          break;
          
        default:
          console.log('알 수 없는 메시지 타입:', request.type);
          sendResponse({ error: '알 수 없는 메시지 타입' });
      }
    } catch (error) {
      console.error('메시지 처리 오류:', error);
      sendResponse({ error: error.message });
    }
  }
  
  async checkHostStatus(request, sender, sendResponse) {
    // YouTube Music 탭에서 호스트가 실행 중인지 확인
    const ytMusicTabs = await chrome.tabs.query({ 
      url: '*://music.youtube.com/*' 
    });
    
    const hasActiveHost = ytMusicTabs.length > 0 && 
                         this.sessions.has(ytMusicTabs[0].id);
    
    sendResponse({
      isHost: hasActiveHost,
      tabId: hasActiveHost ? ytMusicTabs[0].id : null,
      activeTabs: ytMusicTabs.length
    });
  }
  
  async forwardCommand(request, sender, sendResponse) {
    const { command } = request;
    
    // YouTube Music 탭 찾기
    const ytMusicTabs = await chrome.tabs.query({ 
      url: '*://music.youtube.com/*' 
    });
    
    if (ytMusicTabs.length > 0) {
      const hostTab = ytMusicTabs[0];
      
      try {
        // 호스트에 명령 전달
        const response = await chrome.tabs.sendMessage(hostTab.id, {
          type: 'execute_command',
          command: command
        });
        
        sendResponse({ 
          success: true, 
          response: response 
        });
        
        console.log(`📤 명령 전달됨: ${command.type} → 탭 ${hostTab.id}`);
        
      } catch (error) {
        console.error('명령 전달 실패:', error);
        sendResponse({ 
          success: false, 
          error: '호스트와 통신 실패' 
        });
      }
    } else {
      sendResponse({ 
        success: false, 
        error: 'YouTube Music 탭을 찾을 수 없습니다' 
      });
    }
  }
  
  async getHostStatus(request, sender, sendResponse) {
    const ytMusicTabs = await chrome.tabs.query({ 
      url: '*://music.youtube.com/*' 
    });
    
    if (ytMusicTabs.length > 0) {
      const hostTab = ytMusicTabs[0];
      
      try {
        const status = await chrome.tabs.sendMessage(hostTab.id, {
          type: 'get_current_status'
        });
        
        sendResponse(status);
        
      } catch (error) {
        console.error('상태 조회 실패:', error);
        sendResponse({
          error: '상태 조회 실패',
          title: '연결 오류',
          artist: '호스트와 통신할 수 없습니다'
        });
      }
    } else {
      sendResponse({
        error: 'YouTube Music 탭 없음',
        title: 'YouTube Music을 열어주세요',
        artist: '-'
      });
    }
  }
  
  async broadcastDiscoveryMessage(request, sender, sendResponse) {
    const { message } = request;
    
    // Chrome Storage를 통한 Discovery 메시지 브로드캐스트
    const messageKey = `discovery_message_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await chrome.storage.local.set({
      [messageKey]: {
        ...message,
        timestamp: Date.now(),
        source: sender.tab?.id || 'unknown'
      }
    });
    
    sendResponse({ success: true });
    
    console.log('📡 Discovery 메시지 브로드캐스트:', message.type);
  }
  
  async registerClient(request, sender, sendResponse) {
    const { clientInfo } = request;
    
    // 클라이언트 정보 저장
    this.sessions.set(sender.tab.id, {
      type: 'client',
      tabId: sender.tab.id,
      clientInfo: clientInfo,
      registered: Date.now(),
      lastActivity: Date.now()
    });
    
    sendResponse({ 
      success: true,
      sessionId: `client_${sender.tab.id}` 
    });
    
    console.log('📱 클라이언트 등록됨:', sender.tab.id);
  }
  
  handleDiscoveryMessage(message) {
    // Discovery 메시지 처리 로직
    console.log('📨 Discovery 메시지 수신:', message.type);
    
    // 필요에 따라 다른 탭들에게 메시지 전달
    this.forwardDiscoveryMessage(message);
  }
  
  async forwardDiscoveryMessage(message) {
    // 활성 세션들에게 메시지 전달
    for (const [tabId, session] of this.sessions) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'discovery_message',
          message: message
        });
      } catch (error) {
        // 탭이 더 이상 유효하지 않으면 세션에서 제거
        this.sessions.delete(tabId);
      }
    }
  }
  
  // 세션 정리 (주기적으로 실행)
  cleanupSessions() {
    const now = Date.now();
    const timeout = 10 * 60 * 1000; // 10분
    
    for (const [tabId, session] of this.sessions) {
      if ((now - session.lastActivity) > timeout) {
        console.log('🧹 비활성 세션 정리:', tabId);
        this.sessions.delete(tabId);
      }
    }
  }
  
  // 상태 모니터링
  getSessionStats() {
    const hosts = Array.from(this.sessions.values()).filter(s => s.type === 'host');
    const clients = Array.from(this.sessions.values()).filter(s => s.type === 'client');
    
    return {
      totalSessions: this.sessions.size,
      hosts: hosts.length,
      clients: clients.length,
      sessions: Array.from(this.sessions.entries()).map(([tabId, session]) => ({
        tabId,
        type: session.type,
        age: Date.now() - session.registered,
        lastActivity: Date.now() - session.lastActivity
      }))
    };
  }
}

// 백그라운드 서비스 시작
const backgroundService = new AutoDiscoveryBackgroundService();

// 주기적 정리 작업 (5분마다)
setInterval(() => {
  backgroundService.cleanupSessions();
}, 5 * 60 * 1000);

// 개발자용 디버그 함수
if (typeof globalThis !== 'undefined') {
  globalThis.getAutoDiscoveryStats = () => {
    return backgroundService.getSessionStats();
  };
}