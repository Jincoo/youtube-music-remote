// 백그라운드 서비스 워커
class BackgroundService {
  constructor() {
    this.init();
  }
  
  init() {
    this.setupMessageListeners();
    this.setupTabListeners();
    console.log('YouTube Music Remote 백그라운드 서비스 시작됨');
  }
  
  setupMessageListeners() {
    // 메시지 리스너 설정
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // 비동기 응답을 위해 true 반환
    });
  }
  
  setupTabListeners() {
    // 탭 업데이트 감지
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url && tab.url.includes('music.youtube.com')) {
        console.log('YouTube Music 탭이 로드됨:', tabId);
        this.notifyTabReady(tabId);
      }
    });
    
    // 탭 활성화 감지
    chrome.tabs.onActivated.addListener((activeInfo) => {
      chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (tab.url && tab.url.includes('music.youtube.com')) {
          console.log('YouTube Music 탭이 활성화됨:', activeInfo.tabId);
        }
      });
    });
  }
  
  handleMessage(request, sender, sendResponse) {
    switch (request.type) {
      case 'get_session_info':
        this.getSessionInfo(sendResponse);
        break;
        
      case 'remote_command':
        this.forwardRemoteCommand(request, sender, sendResponse);
        break;
        
      case 'status_update':
        this.handleStatusUpdate(request, sender, sendResponse);
        break;
        
      default:
        console.log('알 수 없는 메시지 타입:', request.type);
        sendResponse({ error: '알 수 없는 메시지 타입' });
    }
  }
  
  async getSessionInfo(sendResponse) {
    try {
      const result = await chrome.storage.local.get(['sessionId']);
      sendResponse({
        sessionId: result.sessionId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('세션 정보 조회 실패:', error);
      sendResponse({ error: '세션 정보 조회 실패' });
    }
  }
  
  forwardRemoteCommand(request, sender, sendResponse) {
    // YouTube Music 탭 찾기
    chrome.tabs.query({ url: '*://music.youtube.com/*' }, (tabs) => {
      if (tabs.length > 0) {
        const ytMusicTab = tabs[0];
        
        // 명령을 YouTube Music 탭에 전달
        chrome.tabs.sendMessage(ytMusicTab.id, {
          type: 'execute_command',
          command: request.command,
          data: request.data || {}
        }, (response) => {
          sendResponse(response || { success: true });
        });
      } else {
        sendResponse({ 
          error: 'YouTube Music 탭을 찾을 수 없습니다',
          action: 'open_youtube_music'
        });
      }
    });
  }
  
  handleStatusUpdate(request, sender, sendResponse) {
    // 상태 업데이트를 저장하고 다른 컴포넌트에 알림
    chrome.storage.local.set({
      lastStatus: {
        ...request,
        timestamp: Date.now(),
        tabId: sender.tab?.id
      }
    });
    
    // 팝업이 열려있다면 상태 업데이트 알림
    this.notifyPopupStatusUpdate(request);
    
    sendResponse({ success: true });
  }
  
  notifyTabReady(tabId) {
    // 탭이 준비되었음을 알림
    chrome.tabs.sendMessage(tabId, {
      type: 'tab_ready',
      timestamp: Date.now()
    }).catch(() => {
      // 메시지 전송 실패는 무시 (컨텐츠 스크립트가 아직 로드되지 않았을 수 있음)
    });
  }
  
  notifyPopupStatusUpdate(status) {
    // 팝업에 상태 업데이트 알림 (실제로는 popup.js에서 polling으로 처리)
    chrome.runtime.sendMessage({
      type: 'status_changed',
      status: status
    }).catch(() => {
      // 팝업이 열려있지 않으면 무시
    });
  }
}

// 서비스 워커 시작
new BackgroundService();