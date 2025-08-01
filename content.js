// content.js - 자동 네트워크 검색 버전으로 교체
class AutoDiscoveryYouTubeMusicController {
  constructor() {
    this.isHost = false;
    this.discoveryChannel = null;
    this.networkId = this.generateNetworkId();
    this.connectedDevices = new Map();
    this.broadcastInterval = null;
    this.scanInterval = null;
    this.peerConnection = null;
    this.dataChannel = null;
    this.lastStatus = {};
    this.playerObserver = null;
    this.retryCount = 0;
    this.maxRetries = 5;
    
    this.init();
  }
  
  generateNetworkId() {
    // Wi-Fi 네트워크 기반 고유 ID 생성
    const navigator_info = navigator.userAgent + navigator.language + window.location.hostname;
    const hash = this.simpleHash(navigator_info);
    return 'YTM_' + hash.substr(0, 8);
  }
  
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
  
  async init() {
    console.log('🔍 자동 네트워크 검색 시스템 시작');
    console.log('📍 네트워크 ID:', this.networkId);
    
    // YouTube Music 페이지에서만 호스트 모드
    if (this.isYouTubeMusicPage()) {
      await this.startHostMode();
    } else {
      console.log('📱 클라이언트 모드는 확장 프로그램 팝업에서 시작됩니다');
    }
  }
  
  isYouTubeMusicPage() {
    return window.location.hostname === 'music.youtube.com';
  }
  
  async startHostMode() {
    this.isHost = true;
    console.log('🖥️ 호스트 모드 시작 - PC 검색 신호 송출');
    
    // 플레이어 바 대기 및 설정
    await this.waitForPlayerBarAndSetup();
    
    await this.setupBroadcastChannel();
    await this.setupWebRTC();
    this.startBroadcasting();
    this.startListening();
    this.showHostUI();
    this.startStatusMonitoring();
  }
  
  async startClientMode() {
    this.isHost = false;
    console.log('📱 클라이언트 모드 시작 - PC 검색 중');
    
    await this.setupBroadcastChannel();
    await this.setupWebRTC();
    this.startScanning();
    
    return new Promise((resolve) => {
      this.onConnectionCallback = resolve;
    });
  }
  
  // 기존 YouTube Music 제어 로직 재사용
  waitForPlayerBarAndSetup() {
    return new Promise((resolve) => {
      const checkPlayerBar = () => {
        const playerBar = document.querySelector('ytmusic-player-bar');
        if (playerBar) {
          console.log('✅ 플레이어 바 발견됨');
          this.setupObservers();
          this.debugPageStructure();
          resolve();
        } else {
          this.retryCount++;
          if (this.retryCount < this.maxRetries) {
            console.log(`⏳ 플레이어 바 대기 중... (${this.retryCount}/${this.maxRetries})`);
            setTimeout(checkPlayerBar, 2000);
          } else {
            console.log('⚠️ 플레이어 바를 찾을 수 없음 - 폴백 모드');
            this.setupBasicObservers();
            resolve();
          }
        }
      };
      checkPlayerBar();
    });
  }
  
  async setupBroadcastChannel() {
    try {
      // Broadcast Channel API로 같은 브라우저 내 탭 간 통신
      this.discoveryChannel = new BroadcastChannel('ytmusic-auto-discovery');
      
      this.discoveryChannel.onmessage = (event) => {
        this.handleDiscoveryMessage(event.data);
      };
      
      console.log('📡 Broadcast Channel 설정 완료');
    } catch (error) {
      console.error('❌ Broadcast Channel 설정 실패:', error);
      // 폴백: Chrome Storage API 사용
      await this.setupStorageFallback();
    }
  }
  
  async setupStorageFallback() {
    console.log('🔄 Chrome Storage 폴백 모드');
    
    // Chrome Storage 변경 감지
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace !== 'local') return;
      
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (key.startsWith('ytmusic_discovery_') && newValue) {
          this.handleDiscoveryMessage(newValue);
        }
      }
    });
  }
  
  async setupWebRTC() {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    
    this.peerConnection.onconnectionstatechange = () => {
      console.log('🔗 WebRTC 연결 상태:', this.peerConnection.connectionState);
      
      if (this.peerConnection.connectionState === 'connected') {
        this.onConnectionEstablished();
      } else if (this.peerConnection.connectionState === 'disconnected') {
        this.onConnectionLost();
      }
    };
    
    if (this.isHost) {
      // 호스트는 데이터 채널 생성
      this.dataChannel = this.peerConnection.createDataChannel('ytmusic-control');
      this.setupDataChannel();
    } else {
      // 클라이언트는 데이터 채널 수신 대기
      this.peerConnection.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannel();
      };
    }
    
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendDiscoveryMessage({
          type: 'ice_candidate',
          candidate: event.candidate,
          networkId: this.networkId
        });
      }
    };
  }
  
  setupDataChannel() {
    this.dataChannel.onopen = () => {
      console.log('✅ 직접 연결 성공!');
      this.onConnectionEstablished();
    };
    
    this.dataChannel.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (this.isHost) {
        this.executeCommand(data);
      } else {
        this.updateClientUI(data);
      }
    };
    
    this.dataChannel.onclose = () => {
      console.log('❌ 연결 끊어짐');
      this.onConnectionLost();
    };
  }
  
  startBroadcasting() {
    // 호스트가 3초마다 자신의 존재를 알림
    this.broadcastInterval = setInterval(() => {
      this.sendDiscoveryMessage({
        type: 'host_announcement',
        networkId: this.networkId,
        deviceName: this.getDeviceName(),
        timestamp: Date.now()
      });
    }, 3000);
    
    console.log('📡 호스트 신호 송출 시작');
  }
  
  startScanning() {
    console.log('🔍 PC 검색 시작...');
    
    // 클라이언트가 호스트 검색 요청
    this.sendDiscoveryMessage({
      type: 'discovery_request',
      networkId: this.networkId,
      deviceName: this.getDeviceName(),
      timestamp: Date.now()
    });
    
    // 5초마다 재검색
    this.scanInterval = setInterval(() => {
      this.sendDiscoveryMessage({
        type: 'discovery_request',
        networkId: this.networkId,
        deviceName: this.getDeviceName(),
        timestamp: Date.now()
      });
    }, 5000);
  }
  
  startListening() {
    console.log('👂 클라이언트 연결 대기 중...');
  }
  
  handleDiscoveryMessage(message) {
    // 같은 네트워크 ID가 아니면 무시
    if (message.networkId !== this.networkId) {
      return;
    }
    
    console.log('📨 Discovery 메시지 수신:', message.type);
    
    switch (message.type) {
      case 'host_announcement':
        if (!this.isHost) {
          this.onHostFound(message);
        }
        break;
        
      case 'discovery_request':
        if (this.isHost) {
          this.onClientDiscoveryRequest(message);
        }
        break;
        
      case 'connection_offer':
        if (!this.isHost) {
          this.handleConnectionOffer(message);
        }
        break;
        
      case 'connection_answer':
        if (this.isHost) {
          this.handleConnectionAnswer(message);
        }
        break;
        
      case 'ice_candidate':
        this.handleICECandidate(message);
        break;
    }
  }
  
  async onHostFound(message) {
    console.log('🖥️ PC 발견됨:', message.deviceName);
    
    // 자동으로 연결 시도
    setTimeout(() => {
      console.log('🔗 자동 연결 시도...');
    }, 1000);
  }
  
  async onClientDiscoveryRequest(message) {
    console.log('📱 모바일 기기 발견됨:', message.deviceName);
    this.updateHostStatus(`모바일 연결됨: ${message.deviceName}`, 'connected');
    
    // 연결 제안 전송
    await this.sendConnectionOffer();
  }
  
  async sendConnectionOffer() {
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    
    this.sendDiscoveryMessage({
      type: 'connection_offer',
      offer: offer,
      networkId: this.networkId
    });
    
    console.log('📤 연결 제안 전송됨');
  }
  
  async handleConnectionOffer(message) {
    console.log('📥 연결 제안 수신됨');
    
    await this.peerConnection.setRemoteDescription(message.offer);
    
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    
    this.sendDiscoveryMessage({
      type: 'connection_answer',
      answer: answer,
      networkId: this.networkId
    });
    
    console.log('📤 연결 응답 전송됨');
  }
  
  async handleConnectionAnswer(message) {
    console.log('📥 연결 응답 수신됨');
    await this.peerConnection.setRemoteDescription(message.answer);
  }
  
  async handleICECandidate(message) {
    try {
      await this.peerConnection.addIceCandidate(message.candidate);
    } catch (error) {
      console.log('ICE Candidate 추가 실패:', error);
    }
  }
  
  onConnectionEstablished() {
    console.log('🎉 자동 연결 완료!');
    
    if (this.isHost) {
      this.updateHostStatus('📱 모바일과 연결됨!', 'connected');
    } else {
      console.log('✅ PC와 연결됨!');
      if (this.onConnectionCallback) {
        this.onConnectionCallback(true);
      }
    }
    
    // 자동 검색 중지
    this.stopDiscovery();
  }
  
  onConnectionLost() {
    console.log('💔 연결 끊어짐 - 재검색 시작');
    
    if (this.isHost) {
      this.updateHostStatus('📱 모바일 연결 대기 중...', 'waiting');
      this.startBroadcasting();
    } else {
      console.log('연결 끊어짐 - 재검색 중...');
      this.startScanning();
    }
  }
  
  stopDiscovery() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
    
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
  }
  
  sendDiscoveryMessage(message) {
    if (this.discoveryChannel) {
      this.discoveryChannel.postMessage(message);
    } else {
      // Chrome Storage 폴백
      const key = `ytmusic_discovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      chrome.storage.local.set({
        [key]: message
      });
      
      // 1분 후 정리
      setTimeout(() => {
        chrome.storage.local.remove(key);
      }, 60000);
    }
  }
  
  getDeviceName() {
    const userAgent = navigator.userAgent;
    
    if (/Mobile|Android|iPhone|iPad/.test(userAgent)) {
      if (/iPhone/.test(userAgent)) return 'iPhone';
      if (/iPad/.test(userAgent)) return 'iPad';
      if (/Android/.test(userAgent)) return 'Android 기기';
      return '모바일 기기';
    } else {
      if (/Windows/.test(userAgent)) return 'Windows PC';
      if (/Mac/.test(userAgent)) return 'Mac';
      if (/Linux/.test(userAgent)) return 'Linux PC';
      return 'PC';
    }
  }
  
  showHostUI() {
    const ui = document.createElement('div');
    ui.id = 'auto-discovery-host-ui';
    ui.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 300px;
      background: linear-gradient(135deg, #4CAF50, #45a049);
      color: white;
      padding: 20px;
      border-radius: 15px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      z-index: 10000;
      transition: all 0.3s ease;
    `;
    
    ui.innerHTML = `
      <div style="text-align: center;">
        <h3 style="margin: 0 0 15px 0; font-size: 18px;">
          🎵 자동 연결 대기 중
        </h3>
        
        <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 10px; margin-bottom: 15px;">
          <div style="font-size: 14px; margin-bottom: 10px;">📡 모바일 기기 검색 중...</div>
          <div id="host-status-text" style="font-size: 12px; opacity: 0.8;">
            모바일에서 확장프로그램을 열어주세요
          </div>
        </div>
        
        <div style="display: flex; gap: 8px; justify-content: center;">
          <button onclick="this.parentElement.parentElement.parentElement.remove()" style="
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            padding: 8px 12px;
            border-radius: 5px;
            font-size: 12px;
            cursor: pointer;
          ">숨기기</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(ui);
  }
  
  updateHostStatus(message, type) {
    const statusEl = document.getElementById('host-status-text');
    if (statusEl) {
      statusEl.textContent = message;
    }
  }
  
  // 클라이언트용 메서드들
  updateClientUI(status) {
    // 클라이언트 UI 업데이트는 팝업에서 처리
    if (window.updatePopupUI) {
      window.updatePopupUI(status);
    }
  }
  
  sendCommand(commandType, data = {}) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      const command = {
        type: commandType,
        timestamp: Date.now(),
        ...data
      };
      
      this.dataChannel.send(JSON.stringify(command));
      console.log('📤 명령 전송:', commandType);
      return true;
    } else {
      console.error('❌ 연결되지 않음');
      return false;
    }
  }
  
  executeCommand(command) {
    if (!this.isHost) return;
    
    console.log('🎮 명령 실행:', command.type);
    
    switch (command.type) {
      case 'play_pause':
        this.togglePlayPause();
        break;
      case 'next':
        this.nextTrack();
        break;
      case 'previous':
        this.previousTrack();
        break;
      case 'volume':
        this.setVolume(command.value);
        break;
      case 'seek':
        this.seekTo(command.position);
        break;
    }
    
    // 명령 실행 후 상태 전송
    setTimeout(() => this.sendCurrentStatus(), 300);
  }
  
  // 기존 YouTube Music 제어 메서드들 재사용
  getCurrentStatus() {
    let status = {
      isPlaying: false,
      title: '재생 중인 음악이 없습니다',
      artist: '-',
      progress: 0,
      duration: 0,
      volume: 50
    };
    
    const videoElement = document.querySelector('video');
    if (videoElement) {
      status.isPlaying = !videoElement.paused && 
                        videoElement.currentTime > 0 && 
                        videoElement.readyState > 2;
      status.progress = videoElement.currentTime || 0;
      status.duration = videoElement.duration || 0;
      status.volume = Math.round((videoElement.volume || 0.5) * 100);
    }
    
    // DOM에서 정보 추출
    const titleElement = document.querySelector('ytmusic-player-bar .content-info-wrapper .title');
    if (titleElement && titleElement.textContent.trim()) {
      status.title = titleElement.textContent.trim();
    }
    
    const artistElement = document.querySelector('ytmusic-player-bar .byline');
    if (artistElement && artistElement.textContent.trim()) {
      status.artist = artistElement.textContent.trim();
    }
    
    return status;
  }
  
  sendCurrentStatus() {
    if (!this.isHost || !this.dataChannel || this.dataChannel.readyState !== 'open') return;
    
    const status = this.getCurrentStatus();
    
    // 변경된 경우만 전송
    if (JSON.stringify(status) !== JSON.stringify(this.lastStatus)) {
      this.dataChannel.send(JSON.stringify({
        type: 'status_update',
        ...status
      }));
      this.lastStatus = { ...status };
    }
  }
  
  startStatusMonitoring() {
    if (!this.isHost) return;
    
    // 3초마다 상태 전송
    setInterval(() => {
      this.sendCurrentStatus();
    }, 3000);
    
    // 비디오 이벤트 감지
    const video = document.querySelector('video');
    if (video) {
      ['play', 'pause', 'timeupdate', 'volumechange'].forEach(event => {
        video.addEventListener(event, () => {
          setTimeout(() => this.sendCurrentStatus(), 200);
        });
      });
    }
  }
  
  // 기존 제어 메서드들
  togglePlayPause() {
    const videoElement = document.querySelector('video');
    if (videoElement) {
      try {
        if (videoElement.paused) {
          videoElement.play();
        } else {
          videoElement.pause();
        }
        return;
      } catch (error) {
        console.log('비디오 요소 제어 실패:', error);
      }
    }
    
    const playPauseButton = document.querySelector('ytmusic-player-bar #play-pause-button button');
    if (playPauseButton) {
      playPauseButton.click();
    }
  }
  
  nextTrack() {
    const nextButton = document.querySelector('ytmusic-player-bar .next-button button');
    if (nextButton) {
      nextButton.click();
    }
  }
  
  previousTrack() {
    const prevButton = document.querySelector('ytmusic-player-bar .previous-button button');
    if (prevButton) {
      prevButton.click();
    }
  }
  
  setVolume(volume) {
    const videoElement = document.querySelector('video');
    if (videoElement) {
      try {
        videoElement.volume = volume / 100;
        return;
      } catch (error) {
        // 무시
      }
    }
  }
  
  seekTo(position) {
    const videoElement = document.querySelector('video');
    if (videoElement && videoElement.duration) {
      try {
        videoElement.currentTime = Math.min(position, videoElement.duration);
        return;
      } catch (error) {
        // 무시
      }
    }
  }
  
  // 기존 관찰자 설정 메서드들 재사용
  setupObservers() {
    if (this.playerObserver) {
      this.playerObserver.disconnect();
    }
    
    const videoElement = document.querySelector('video');
    if (videoElement) {
      ['play', 'pause', 'timeupdate', 'volumechange', 'loadstart'].forEach(eventType => {
        videoElement.addEventListener(eventType, () => {
          if (eventType === 'timeupdate') {
            clearTimeout(this.timeUpdateTimeout);
            this.timeUpdateTimeout = setTimeout(() => {
              this.sendCurrentStatus();
            }, 2000);
          } else {
            setTimeout(() => this.sendCurrentStatus(), 100);
          }
        });
      });
    }
    
    const playerBar = document.querySelector('ytmusic-player-bar');
    if (playerBar) {
      this.playerObserver = new MutationObserver((mutations) => {
        let shouldUpdate = false;
        
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes') {
            const attr = mutation.attributeName;
            if (attr === 'aria-label' || attr === 'value' || attr === 'aria-valuenow') {
              shouldUpdate = true;
            }
          }
          
          if (mutation.type === 'childList' || mutation.type === 'characterData') {
            shouldUpdate = true;
          }
        });
        
        if (shouldUpdate) {
          clearTimeout(this.updateTimeout);
          this.updateTimeout = setTimeout(() => {
            this.sendCurrentStatus();
          }, 300);
        }
      });
      
      this.playerObserver.observe(playerBar, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label', 'value', 'aria-valuenow', 'class'],
        characterData: true
      });
    }
    
    this.setupBasicObservers();
  }
  
  setupBasicObservers() {
    document.addEventListener('keydown', (event) => {
      if (event.code === 'Space' || event.code.startsWith('Media')) {
        setTimeout(() => this.sendCurrentStatus(), 300);
      }
    });
    
    document.addEventListener('click', (event) => {
      if (event.target.closest('ytmusic-player-bar')) {
        setTimeout(() => this.sendCurrentStatus(), 200);
      }
    });
    
    setInterval(() => {
      this.sendCurrentStatus();
    }, 5000);
    
    window.addEventListener('focus', () => {
      setTimeout(() => this.sendCurrentStatus(), 100);
    });
  }
  
  debugPageStructure() {
    console.log('🔍 YouTube Music 페이지 구조 분석');
    
    const playerBar = document.querySelector('ytmusic-player-bar');
    console.log('플레이어 바:', playerBar ? '✅ 발견' : '❌ 없음');
    
    const playButton = document.querySelector('ytmusic-player-bar #play-pause-button button');
    console.log('재생 버튼:', playButton ? `✅ 발견 (${playButton.getAttribute('aria-label')})` : '❌ 없음');
    
    const videoElement = document.querySelector('video');
    console.log('비디오 요소:', videoElement ? `✅ 발견 (paused: ${videoElement.paused})` : '❌ 없음');
  }
  
  // 정리
  cleanup() {
    this.stopDiscovery();
    
    if (this.discoveryChannel) {
      this.discoveryChannel.close();
    }
    
    if (this.dataChannel) {
      this.dataChannel.close();
    }
    
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    
    if (this.playerObserver) {
      this.playerObserver.disconnect();
    }
    
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }
    if (this.timeUpdateTimeout) {
      clearTimeout(this.timeUpdateTimeout);
    }
  }
}

// 자동 시작
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      window.autoDiscoveryController = new AutoDiscoveryYouTubeMusicController();
    }, 2000);
  });
} else {
  setTimeout(() => {
    window.autoDiscoveryController = new AutoDiscoveryYouTubeMusicController();
  }, 1000);
}

// 페이지 언로드 시 정리
window.addEventListener('beforeunload', () => {
  if (window.autoDiscoveryController) {
    window.autoDiscoveryController.cleanup();
  }
});