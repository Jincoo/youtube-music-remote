// PWA 최적화된 YouTube Music Controller
class YouTubeMusicController {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.playerObserver = null;
    this.lastStatus = {};
    this.isPWA = this.detectPWA();
    this.retryCount = 0;
    this.maxRetries = 5;
    
    this.init();
  }
  
  detectPWA() {
    const isPWA = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ||
                  window.navigator.standalone ||
                  document.referrer.includes('android-app://') ||
                  window.location.href.includes('utm_source=homescreen');
    
    console.log(`🎵 환경 감지: ${isPWA ? 'PWA' : '웹 브라우저'}`);
    return isPWA;
  }
  
  init() {
    this.generateSessionId();
    
    // PWA는 더 긴 초기화 지연
    const initDelay = this.isPWA ? 3000 : 1000;
    
    setTimeout(() => {
      this.connectWebSocket();
      this.waitForPlayerBarAndSetup();
      console.log('🎵 YouTube Music Remote Controller 초기화됨 (PWA 최적화)');
    }, initDelay);
  }
  
  // 플레이어 바가 로드될 때까지 대기 후 설정
  waitForPlayerBarAndSetup() {
    const checkPlayerBar = () => {
      const playerBar = document.querySelector('ytmusic-player-bar');
      if (playerBar) {
        console.log('✅ 플레이어 바 발견됨');
        this.setupObservers();
        this.debugPageStructure();
        this.sendCurrentStatus();
      } else {
        this.retryCount++;
        if (this.retryCount < this.maxRetries) {
          console.log(`⏳ 플레이어 바 대기 중... (${this.retryCount}/${this.maxRetries})`);
          setTimeout(checkPlayerBar, 2000);
        } else {
          console.log('⚠️ 플레이어 바를 찾을 수 없음 - 폴백 모드 시작');
          this.setupFallbackMode();
        }
      }
    };
    
    checkPlayerBar();
  }
  
  // 폴백 모드 (플레이어 바를 찾을 수 없을 때)
  setupFallbackMode() {
    console.log('🔄 폴백 모드 활성화');
    
    // 기본 관찰자 설정
    this.setupBasicObservers();
    
    // 5초마다 플레이어 바 재검색
    setInterval(() => {
      const playerBar = document.querySelector('ytmusic-player-bar');
      if (playerBar && !this.playerObserver) {
        console.log('🎯 플레이어 바 발견됨 - 정상 모드로 전환');
        this.setupObservers();
      }
    }, 5000);
  }
  
  generateSessionId() {
    this.sessionId = 'ytm_default_session';
    chrome.storage.local.set({ sessionId: this.sessionId });
    console.log('고정 세션 ID 사용:', this.sessionId);
  }
  
  connectWebSocket() {
    try {
      this.ws = new WebSocket('ws://localhost:8081');
      
      this.ws.onopen = () => {
        console.log('✅ WebSocket 연결됨');
        this.reconnectAttempts = 0;
        this.registerSession();
        this.sendCurrentStatus();
      };
      
      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.handleRemoteCommand(message);
      };
      
      this.ws.onclose = () => {
        console.log('❌ WebSocket 연결 끊김');
        this.reconnect();
      };
      
      this.ws.onerror = (error) => {
        console.error('🚨 WebSocket 오류:', error);
      };
    } catch (error) {
      console.error('WebSocket 연결 실패:', error);
      this.setupLocalMode();
    }
  }
  
  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`🔄 재연결 시도 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        this.connectWebSocket();
      }, 3000 * this.reconnectAttempts);
    }
  }
  
  setupLocalMode() {
    console.log('📱 로컬 모드로 실행');
    
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'remote_command') {
        this.handleRemoteCommand({ type: request.command, ...request });
        sendResponse({ success: true });
      } else if (request.type === 'get_status') {
        const status = this.getCurrentStatus();
        sendResponse(status);
      }
      return true;
    });
    
    setInterval(() => {
      const status = this.getCurrentStatus();
      console.log('📊 현재 상태:', status);
    }, 5000);
  }
  
  registerSession() {
    this.sendMessage({
      type: 'register',
      sessionId: this.sessionId,
      deviceType: 'pc',
      environment: this.isPWA ? 'pwa' : 'web'
    });
  }
  
  sendMessage(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
  
  // PWA에 최적화된 상태 수집
  getCurrentStatus() {
    let status = {
      isPlaying: false,
      title: '',
      artist: '',
      progress: 0,
      duration: 0,
      volume: 50,
      environment: this.isPWA ? 'pwa' : 'web'
    };
    
    // 1단계: 비디오 요소 확인 (가장 신뢰도 높음)
    const videoElement = document.querySelector('video');
    if (videoElement) {
      status.isPlaying = !videoElement.paused && 
                        videoElement.currentTime > 0 && 
                        videoElement.readyState > 2;
      status.progress = videoElement.currentTime || 0;
      status.duration = videoElement.duration || 0;
      status.volume = Math.round((videoElement.volume || 0.5) * 100);
    }
    
    // 2단계: 제공된 DOM 구조 기반 정보 추출
    status = this.extractInfoFromDOM(status);
    
    // 3단계: Media Session API 확인
    status = this.extractMediaSessionInfo(status);
    
    // 변경된 경우만 로그 출력
    if (JSON.stringify(status) !== JSON.stringify(this.lastStatus)) {
      console.log('📊 상태 변경:', status);
      this.lastStatus = { ...status };
    }
    
    return status;
  }
  
  // DOM에서 정보 추출 (제공된 구조 기반)
  extractInfoFromDOM(status) {
    // 제목 추출 - 제공된 구조에서 정확한 선택자 사용
    const titleElement = document.querySelector('ytmusic-player-bar .content-info-wrapper .title');
    if (titleElement && titleElement.textContent.trim()) {
      status.title = titleElement.textContent.trim();
    }
    
    // 아티스트 정보 추출
    const artistElement = document.querySelector('ytmusic-player-bar .byline');
    if (artistElement && artistElement.textContent.trim()) {
      status.artist = artistElement.textContent.trim();
    }
    
    // 재생/일시정지 버튼 상태 확인
    const playPauseButton = document.querySelector('ytmusic-player-bar #play-pause-button button');
    if (playPauseButton) {
      const ariaLabel = playPauseButton.getAttribute('aria-label') || '';
      
      // 버튼의 aria-label로 상태 판단
      if (ariaLabel.includes('일시정지') || ariaLabel.includes('Pause')) {
        status.isPlaying = true;
      } else if (ariaLabel.includes('재생') || ariaLabel.includes('Play')) {
        status.isPlaying = false;
      }
    }
    
    // 진행률 정보 - progress-bar에서 추출
    const progressBar = document.querySelector('ytmusic-player-bar #progress-bar');
    if (progressBar) {
      status.progress = parseFloat(progressBar.getAttribute('value')) || 0;
      status.duration = parseFloat(progressBar.getAttribute('aria-valuemax')) || 0;
    }
    
    // 시간 정보 - time-info에서 추출 (보조)
    const timeInfo = document.querySelector('ytmusic-player-bar .time-info');
    if (timeInfo && timeInfo.textContent) {
      const timeText = timeInfo.textContent.trim(); // "0:00 / 3:32"
      const timeParts = timeText.split(' / ');
      if (timeParts.length === 2) {
        status.progress = this.timeStringToSeconds(timeParts[0]);
        status.duration = this.timeStringToSeconds(timeParts[1]);
      }
    }
    
    // 볼륨 정보 - volume-slider에서 추출
    const volumeSlider = document.querySelector('ytmusic-player-bar #volume-slider');
    if (volumeSlider) {
      status.volume = parseFloat(volumeSlider.getAttribute('value')) || 50;
    }
    
    return status;
  }
  
  // 시간 문자열을 초로 변환 (예: "3:32" -> 212)
  timeStringToSeconds(timeStr) {
    if (!timeStr) return 0;
    
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }
  
  // Media Session API에서 정보 추출
  extractMediaSessionInfo(status) {
    try {
      if ('mediaSession' in navigator && navigator.mediaSession.metadata) {
        const metadata = navigator.mediaSession.metadata;
        
        if (!status.title && metadata.title) {
          status.title = metadata.title;
        }
        
        if (!status.artist && metadata.artist) {
          status.artist = metadata.artist;
        }
        
        if (navigator.mediaSession.playbackState === 'playing') {
          status.isPlaying = true;
        } else if (navigator.mediaSession.playbackState === 'paused') {
          status.isPlaying = false;
        }
      }
    } catch (error) {
      console.log('⚠️ Media Session 접근 오류:', error);
    }
    
    return status;
  }
  
  sendCurrentStatus() {
    const status = this.getCurrentStatus();
    this.sendMessage({
      type: 'status_update',
      sessionId: this.sessionId,
      ...status
    });
  }
  
  // 원격 명령 처리
  handleRemoteCommand(command) {
    console.log('🎮 원격 명령 수신:', command);
    
    switch (command.type) {
      case 'registered':
        console.log('✅ 서버에 세션 등록 완료');
        break;
        
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
        
      case 'get_status':
        this.sendCurrentStatus();
        break;
        
      default:
        console.warn('❓ 알 수 없는 명령:', command.type);
    }
    
    if (command.type !== 'registered' && command.type !== 'get_status') {
      setTimeout(() => {
        this.sendCurrentStatus();
      }, 500);
    }
  }
  
  // 재생/일시정지 토글 (제공된 구조 기반)
  togglePlayPause() {
    console.log('🎯 재생/일시정지 명령 실행');
    
    // 1순위: 비디오 요소 직접 제어
    const videoElement = document.querySelector('video');
    if (videoElement) {
      try {
        if (videoElement.paused) {
          videoElement.play();
          console.log('✅ 비디오 요소로 재생 시작');
        } else {
          videoElement.pause();
          console.log('✅ 비디오 요소로 일시정지');
        }
        return;
      } catch (error) {
        console.log('❌ 비디오 요소 직접 제어 실패:', error);
      }
    }
    
    // 2순위: 정확한 재생/일시정지 버튼 클릭
    const playPauseButton = document.querySelector('ytmusic-player-bar #play-pause-button button');
    if (playPauseButton) {
      console.log('✅ 재생/일시정지 버튼 클릭:', playPauseButton.getAttribute('aria-label'));
      playPauseButton.click();
      return;
    }
    
    // 3순위: 키보드 이벤트
    try {
      console.log('⌨️ 스페이스바 키 이벤트 시뮬레이션');
      document.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'Space',
        key: ' ',
        keyCode: 32,
        which: 32,
        bubbles: true
      }));
    } catch (error) {
      console.log('❌ 키보드 이벤트 실패:', error);
    }
  }
  
  // 다음 곡 (제공된 구조 기반)
  nextTrack() {
    console.log('🎯 다음 곡 명령 실행');
    
    const nextButton = document.querySelector('ytmusic-player-bar .next-button button');
    if (nextButton) {
      console.log('✅ 다음 곡 버튼 클릭');
      nextButton.click();
    } else {
      console.log('❌ 다음 곡 버튼을 찾을 수 없음');
    }
  }
  
  // 이전 곡 (제공된 구조 기반)
  previousTrack() {
    console.log('🎯 이전 곡 명령 실행');
    
    const prevButton = document.querySelector('ytmusic-player-bar .previous-button button');
    if (prevButton) {
      console.log('✅ 이전 곡 버튼 클릭');
      prevButton.click();
    } else {
      console.log('❌ 이전 곡 버튼을 찾을 수 없음');
    }
  }
  
  // 볼륨 설정 (제공된 구조 기반) - 조용한 모드
  setVolume(volume) {
    // 1순위: 비디오 요소
    const videoElement = document.querySelector('video');
    if (videoElement) {
      try {
        videoElement.volume = volume / 100;
        return;
      } catch (error) {
        // 조용히 실패 처리
      }
    }
    
    // 2순위: 볼륨 슬라이더 조작
    const volumeSlider = document.querySelector('ytmusic-player-bar #volume-slider');
    if (volumeSlider) {
      // Polymer 슬라이더는 특별한 방식으로 값 설정
      volumeSlider.value = volume;
      
      // 이벤트 발생
      volumeSlider.dispatchEvent(new Event('change', { bubbles: true }));
      volumeSlider.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Polymer 특화 이벤트도 시도
      volumeSlider.dispatchEvent(new CustomEvent('immediate-value-change', {
        detail: { value: volume },
        bubbles: true
      }));
      
      return;
    }
  }
  
  // 재생 위치 이동 (제공된 구조 기반) - 조용한 모드
  seekTo(position) {
    // 1순위: 비디오 요소
    const videoElement = document.querySelector('video');
    if (videoElement && videoElement.duration) {
      try {
        videoElement.currentTime = Math.min(position, videoElement.duration);
        return;
      } catch (error) {
        // 조용히 실패 처리
      }
    }
    
    // 2순위: 진행률 바 조작
    const progressBar = document.querySelector('ytmusic-player-bar #progress-bar');
    if (progressBar) {
      const maxValue = parseFloat(progressBar.getAttribute('aria-valuemax')) || 100;
      const newValue = Math.min(position, maxValue);
      
      // Polymer 슬라이더 값 설정
      progressBar.value = newValue;
      
      // 이벤트 발생
      progressBar.dispatchEvent(new Event('change', { bubbles: true }));
      progressBar.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Polymer 특화 이벤트
      progressBar.dispatchEvent(new CustomEvent('immediate-value-change', {
        detail: { value: newValue },
        bubbles: true
      }));
      
      return;
    }
  }
  
  // 관찰자 설정
  setupObservers() {
    // 기존 관찰자 정리
    if (this.playerObserver) {
      this.playerObserver.disconnect();
    }
    
    // 1. 비디오 요소 이벤트
    const videoElement = document.querySelector('video');
    if (videoElement) {
      console.log('🎥 비디오 요소 이벤트 리스너 설정');
      
      ['play', 'pause', 'timeupdate', 'volumechange', 'loadstart'].forEach(eventType => {
        videoElement.addEventListener(eventType, () => {
          if (eventType === 'timeupdate') {
            // timeupdate는 throttling
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
    
    // 2. 플레이어 바 변경 감지
    const playerBar = document.querySelector('ytmusic-player-bar');
    if (playerBar) {
      console.log('🎛️ 플레이어 바 변경 감지 설정');
      
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
  
  // 기본 관찰자들
  setupBasicObservers() {
    // 키보드 이벤트
    document.addEventListener('keydown', (event) => {
      if (event.code === 'Space' || event.code.startsWith('Media')) {
        setTimeout(() => this.sendCurrentStatus(), 300);
      }
    });
    
    // 클릭 이벤트
    document.addEventListener('click', (event) => {
      if (event.target.closest('ytmusic-player-bar')) {
        setTimeout(() => this.sendCurrentStatus(), 200);
      }
    });
    
    // 주기적 상태 확인
    setInterval(() => {
      this.sendCurrentStatus();
    }, 3000);
    
    // 포커스 이벤트
    window.addEventListener('focus', () => {
      setTimeout(() => this.sendCurrentStatus(), 100);
    });
    
    console.log('🔧 기본 관찰자 설정 완료');
  }
  
  // 디버깅
  debugPageStructure() {
    console.log('🔍 YouTube Music 페이지 구조 분석');
    
    const playerBar = document.querySelector('ytmusic-player-bar');
    console.log('플레이어 바:', playerBar ? '✅ 발견' : '❌ 없음');
    
    const playButton = document.querySelector('ytmusic-player-bar #play-pause-button button');
    console.log('재생 버튼:', playButton ? `✅ 발견 (${playButton.getAttribute('aria-label')})` : '❌ 없음');
    
    const title = document.querySelector('ytmusic-player-bar .title');
    console.log('제목 요소:', title ? `✅ 발견 (${title.textContent})` : '❌ 없음');
    
    const progressBar = document.querySelector('ytmusic-player-bar #progress-bar');
    console.log('진행률 바:', progressBar ? `✅ 발견 (${progressBar.getAttribute('value')}/${progressBar.getAttribute('aria-valuemax')})` : '❌ 없음');
    
    const videoElement = document.querySelector('video');
    console.log('비디오 요소:', videoElement ? `✅ 발견 (paused: ${videoElement.paused})` : '❌ 없음');
  }
  
  // cleanup
  cleanup() {
    if (this.playerObserver) {
      this.playerObserver.disconnect();
    }
    if (this.ws) {
      this.ws.close();
    }
    
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }
    if (this.timeUpdateTimeout) {
      clearTimeout(this.timeUpdateTimeout);
    }
  }
}

// PWA 감지 후 적절한 지연으로 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const isPWA = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    const delay = isPWA ? 2000 : 500;
    
    setTimeout(() => {
      window.ytMusicController = new YouTubeMusicController();
    }, delay);
  });
} else {
  const isPWA = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  const delay = isPWA ? 1000 : 0;
  
  setTimeout(() => {
    window.ytMusicController = new YouTubeMusicController();
  }, delay);
}

// 페이지 언로드 시 정리
window.addEventListener('beforeunload', () => {
  if (window.ytMusicController) {
    window.ytMusicController.cleanup();
  }
});

// PWA 전용 추가 이벤트들
if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
  console.log('🔧 PWA 전용 이벤트 리스너 추가');
  
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.ytMusicController) {
      console.log('🎯 PWA 다시 활성화됨');
      setTimeout(() => {
        window.ytMusicController.sendCurrentStatus();
      }, 500);
    }
  });
}