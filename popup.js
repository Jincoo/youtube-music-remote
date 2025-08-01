// popup.js - 자동 네트워크 검색 버전
class AutoDiscoveryPopup {
  constructor() {
    this.controller = null;
    this.currentStatus = {};
    this.isConnected = false;
    this.isConnecting = false;
    this.statusPoller = null;
    this.init();
  }
  
  async init() {
    console.log('🎵 자동 검색 팝업 시작');
    
    this.setupEventListeners();
    await this.checkYouTubeMusicTab();
    this.startAutoDiscovery();
    
    // 주기적으로 연결 상태 확인
    this.statusPoller = setInterval(() => {
      this.updateConnectionStatus();
    }, 2000);
  }
  
  async checkYouTubeMusicTab() {
    try {
      const tabs = await chrome.tabs.query({ url: '*://music.youtube.com/*' });
      
      if (tabs.length === 0) {
        this.showMessage('YouTube Music 탭을 먼저 열어주세요', 'warning');
        this.updateConnectionStatus('YouTube Music을 열어주세요', false);
        return false;
      }
      
      console.log('✅ YouTube Music 탭 발견됨');
      return true;
    } catch (error) {
      console.error('탭 확인 실패:', error);
      return false;
    }
  }
  
  async startAutoDiscovery() {
    if (this.isConnecting) return;
    
    this.isConnecting = true;
    this.updateConnectionStatus('PC 자동 검색 중...', false);
    
    try {
      // Content Script에 클라이언트 모드 시작 요청
      const tabs = await chrome.tabs.query({ url: '*://music.youtube.com/*' });
      
      if (tabs.length > 0) {
        // YouTube Music 탭에서 호스트가 이미 실행 중인지 확인
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          type: 'check_host_status'
        });
        
        if (response && response.isHost) {
          console.log('🖥️ PC 호스트 발견됨 - 클라이언트 모드 시작');
          await this.startClientMode();
        } else {
          this.showMessage('PC에서 YouTube Music을 재생해주세요', 'info');
          this.updateConnectionStatus('PC 대기 중...', false);
        }
      }
      
      // 5초 후 재시도
      setTimeout(() => {
        if (!this.isConnected) {
          this.isConnecting = false;
          this.startAutoDiscovery();
        }
      }, 5000);
      
    } catch (error) {
      console.error('자동 검색 실패:', error);
      this.isConnecting = false;
      this.updateConnectionStatus('검색 실패', false);
    }
  }
  
  async startClientMode() {
    console.log('📱 클라이언트 모드 시작');
    
    try {
      // 새 탭에서 클라이언트 모드 실행 (WebRTC를 위해)
      const clientTab = await chrome.tabs.create({
        url: 'chrome://newtab/',
        active: false
      });
      
      // 클라이언트 스크립트 주입
      await chrome.scripting.executeScript({
        target: { tabId: clientTab.id },
        func: this.createClientController
      });
      
      // 클라이언트와 통신 설정
      this.setupClientCommunication(clientTab.id);
      
    } catch (error) {
      console.error('클라이언트 모드 시작 실패:', error);
      this.showMessage('연결 실패: ' + error.message, 'error');
    }
  }
  
  createClientController() {
    // 이 함수는 새 탭에서 실행됨
    class PopupClient {
      constructor() {
        this.controller = null;
        this.init();
      }
      
      async init() {
        // AutoDiscoveryYouTubeMusicController를 클라이언트 모드로 생성
        // (content.js의 클래스를 여기서 재사용)
        
        // 간단한 클라이언트 구현
        this.discoveryChannel = new BroadcastChannel('ytmusic-auto-discovery');
        this.peerConnection = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        });
        
        this.networkId = this.generateNetworkId();
        this.startScanning();
        
        // 부모 창과 통신
        window.postMessage({ type: 'client_ready' }, '*');
      }
      
      generateNetworkId() {
        const info = navigator.userAgent + navigator.language + 'music.youtube.com';
        let hash = 0;
        for (let i = 0; i < info.length; i++) {
          const char = info.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        return 'YTM_' + Math.abs(hash).toString(16).substr(0, 8);
      }
      
      startScanning() {
        // PC 검색 요청
        setInterval(() => {
          this.discoveryChannel.postMessage({
            type: 'discovery_request',
            networkId: this.networkId,
            deviceName: 'Mobile Client',
            timestamp: Date.now()
          });
        }, 3000);
        
        // 호스트 응답 대기
        this.discoveryChannel.onmessage = (event) => {
          this.handleDiscoveryMessage(event.data);
        };
      }
      
      handleDiscoveryMessage(message) {
        if (message.networkId !== this.networkId) return;
        
        if (message.type === 'host_announcement') {
          console.log('🖥️ PC 호스트 발견!');
          window.postMessage({ 
            type: 'host_found', 
            deviceName: message.deviceName 
          }, '*');
        }
      }
    }
    
    new PopupClient();
  }
  
  setupClientCommunication(clientTabId) {
    // 클라이언트 탭과의 메시지 통신 설정
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (tabId === clientTabId && changeInfo.status === 'complete') {
        // 클라이언트가 준비되면 연결 대기
        setTimeout(() => {
          this.updateConnectionStatus('PC와 연결 시도 중...', false);
        }, 1000);
      }
    });
  }
  
  setupEventListeners() {
    // 재생/일시정지 버튼
    document.getElementById('playPauseBtn').addEventListener('click', () => {
      this.sendCommand('play_pause');
    });
    
    // 이전 곡 버튼
    document.getElementById('prevBtn').addEventListener('click', () => {
      this.sendCommand('previous');
    });
    
    // 다음 곡 버튼
    document.getElementById('nextBtn').addEventListener('click', () => {
      this.sendCommand('next');
    });
    
    // 볼륨 슬라이더
    const volumeSlider = document.getElementById('volumeSlider');
    volumeSlider.addEventListener('input', (e) => {
      this.sendCommand('volume', { value: parseInt(e.target.value) });
    });
    
    // 진행률 바 클릭
    const progressBar = document.getElementById('progressBar');
    progressBar.addEventListener('click', (e) => {
      const rect = progressBar.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      const position = percent * (this.currentStatus.duration || 100);
      this.sendCommand('seek', { position: Math.floor(position) });
    });
    
    // 수동 재연결 버튼 (숨겨진 버튼)
    const reconnectBtn = document.createElement('button');
    reconnectBtn.textContent = '🔄 재연결';
    reconnectBtn.style.cssText = `
      position: absolute;
      top: 5px;
      right: 5px;
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      padding: 5px 10px;
      border-radius: 5px;
      font-size: 10px;
      cursor: pointer;
      opacity: 0.7;
    `;
    reconnectBtn.onclick = () => {
      this.isConnecting = false;
      this.isConnected = false;
      this.startAutoDiscovery();
    };
    document.body.appendChild(reconnectBtn);
  }
  
  async sendCommand(type, data = {}) {
    try {
      const tabs = await chrome.tabs.query({ url: '*://music.youtube.com/*' });
      
      if (tabs.length > 0) {
        // YouTube Music 탭의 호스트에게 직접 명령 전송
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          type: 'send_command',
          command: {
            type: type,
            ...data
          }
        });
        
        if (response && response.success) {
          this.showCommandFeedback(type);
          
          // 상태 업데이트 요청
          setTimeout(() => {
            this.requestStatus();
          }, 200);
        } else {
          throw new Error('명령 전송 실패');
        }
      }
    } catch (error) {
      console.error('명령 전송 실패:', error);
      this.showMessage('명령 실행 실패', 'error');
      
      // 연결이 끊어진 것 같으면 재연결 시도
      this.isConnected = false;
      this.updateConnectionStatus('연결 끊어짐 - 재연결 중...', false);
      
      setTimeout(() => {
        this.isConnecting = false;
        this.startAutoDiscovery();
      }, 2000);
    }
  }
  
  async requestStatus() {
    try {
      const tabs = await chrome.tabs.query({ url: '*://music.youtube.com/*' });
      
      if (tabs.length > 0) {
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          type: 'get_status'
        });
        
        if (response) {
          this.updateUI(response);
          
          if (!this.isConnected) {
            this.isConnected = true;
            this.updateConnectionStatus('✅ PC와 연결됨', true);
          }
        }
      }
    } catch (error) {
      // 상태 요청 실패는 조용히 처리
      if (this.isConnected) {
        this.isConnected = false;
        this.updateConnectionStatus('연결 확인 중...', false);
      }
    }
  }
  
  updateUI(status) {
    this.currentStatus = status;
    
    // 곡 정보 업데이트
    document.getElementById('songTitle').textContent = status.title || '재생 중인 음악이 없습니다';
    document.getElementById('songArtist').textContent = status.artist || '-';
    
    // 재생/일시정지 버튼
    const playPauseBtn = document.getElementById('playPauseBtn');
    playPauseBtn.textContent = status.isPlaying ? '⏸' : '▶';
    
    // 진행률 바
    if (status.duration > 0) {
      const progress = (status.progress / status.duration) * 100;
      document.getElementById('progressFill').style.width = `${progress}%`;
      
      document.getElementById('currentTime').textContent = this.formatTime(status.progress);
      document.getElementById('totalTime').textContent = this.formatTime(status.duration);
    }
    
    // 볼륨 슬라이더
    document.getElementById('volumeSlider').value = status.volume || 50;
  }
  
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  updateConnectionStatus(message, isConnected) {
    const statusEl = document.getElementById('connectionStatus');
    statusEl.textContent = message;
    statusEl.className = isConnected ? 'connected' : 'disconnected';
  }
  
  showMessage(message, type) {
    console.log(`${type.toUpperCase()}: ${message}`);
    
    // 간단한 알림 표시
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: ${type === 'error' ? 'rgba(244, 67, 54, 0.9)' : 
                   type === 'warning' ? 'rgba(255, 193, 7, 0.9)' : 
                   'rgba(76, 175, 80, 0.9)'};
      color: white;
      padding: 10px 15px;
      border-radius: 8px;
      font-size: 12px;
      z-index: 10000;
      max-width: 200px;
      text-align: center;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
  
  showCommandFeedback(commandType) {
    const feedbackMessages = {
      'play_pause': '⏯️',
      'next': '⏭️',
      'previous': '⏮️',
      'volume': '🔊',
      'seek': '⏱️'
    };
    
    const message = feedbackMessages[commandType] || '✓';
    
    // 버튼에 일시적 피드백
    const allButtons = document.querySelectorAll('.control-btn');
    allButtons.forEach(btn => {
      btn.style.background = 'rgba(76, 175, 80, 0.5)';
      setTimeout(() => {
        btn.style.background = '';
      }, 300);
    });
    
    console.log(`✅ 명령 실행됨: ${commandType}`);
  }
  
  cleanup() {
    if (this.statusPoller) {
      clearInterval(this.statusPoller);
    }
    
    if (this.controller && this.controller.cleanup) {
      this.controller.cleanup();
    }
  }
}

// Chrome Extension 환경에서 실행
if (typeof chrome !== 'undefined' && chrome.tabs) {
  // 팝업 로드 완료 후 시작
  document.addEventListener('DOMContentLoaded', () => {
    window.autoDiscoveryPopup = new AutoDiscoveryPopup();
  });
  
  // 팝업 언로드 시 정리
  window.addEventListener('beforeunload', () => {
    if (window.autoDiscoveryPopup) {
      window.autoDiscoveryPopup.cleanup();
    }
  });
} else {
  console.log('Chrome Extension 환경이 아닙니다');
}