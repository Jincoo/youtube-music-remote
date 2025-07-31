// YouTube Music 페이지에서 실행되는 스크립트
class YouTubeMusicController {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.playerObserver = null;
    this.lastStatus = {};
    
    this.init();
  }
  
  init() {
    this.generateSessionId();
    this.connectWebSocket();
    this.setupObservers();
    this.debugPageStructure();
    console.log('🎵 YouTube Music Remote Controller 초기화됨');
  }
  
  generateSessionId() {
    // 간단하게 고정 세션 사용
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
        console.log('❌ WebSocket 연결 끊김 - 서버가 실행 중인지 확인하세요');
        this.reconnect();
      };
      
      this.ws.onerror = (error) => {
        console.error('🚨 WebSocket 오류 - 서버 실행 필요:', error);
      };
    } catch (error) {
      console.error('WebSocket 연결 실패 - 서버가 실행되지 않았습니다:', error);
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
  
  // 서버 없이 로컬에서만 동작하는 모드
  setupLocalMode() {
    console.log('📱 로컬 모드로 실행 - WebSocket 서버 없이 동작');
    
    // Chrome 메시지 리스너 설정 (팝업과 통신용)
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
    
    // 주기적으로 상태 업데이트
    setInterval(() => {
      const status = this.getCurrentStatus();
      console.log('📊 현재 상태:', status);
    }, 3000);
  }
  
  registerSession() {
    this.sendMessage({
      type: 'register',
      sessionId: this.sessionId,
      deviceType: 'pc'
    });
  }
  
  sendMessage(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
  
  // 현재 재생 상태 정보 수집 (개선된 버전)
  getCurrentStatus() {
    // 1단계: 비디오 요소 우선 확인 (가장 정확한 방법)
    const videoElement = document.querySelector('video');
    let isPlaying = false;
    let progress = 0;
    let duration = 0;
    let volume = 50;
    
    if (videoElement) {
      // 비디오 요소에서 직접 상태 확인
      isPlaying = !videoElement.paused && videoElement.currentTime > 0 && videoElement.readyState > 2;
      progress = videoElement.currentTime || 0;
      duration = videoElement.duration || 0;
      volume = Math.round((videoElement.volume || 0.5) * 100);
    }
    
    // 2단계: DOM 요소들로 보조 정보 수집
    const titleSelectors = [
      '.title.ytmusic-player-bar',
      '.ytmusic-player-bar .title',
      'yt-formatted-string.title',
      '.content-info-wrapper .title',
      'ytmusic-player-bar .content-info-wrapper .title'
    ];
    
    const artistSelectors = [
      '.byline.ytmusic-player-bar', 
      '.ytmusic-player-bar .byline',
      '.content-info-wrapper .byline',
      'ytmusic-player-bar .content-info-wrapper .byline',
      '.subtitle'
    ];
    
    const playButtonSelectors = [
      'ytmusic-player-bar button[aria-label*="재생"]',
      'ytmusic-player-bar button[aria-label*="일시정지"]', 
      'ytmusic-player-bar button[aria-label*="Play"]',
      'ytmusic-player-bar button[aria-label*="Pause"]',
      '#play-pause-button',
      '.play-pause-button'
    ];
    
    const songTitle = this.findElement(titleSelectors);
    const artist = this.findElement(artistSelectors);
    const playButton = this.findElement(playButtonSelectors);
    
    // 3단계: 비디오 요소가 없거나 부정확할 때 버튼으로 보완
    if (!videoElement || (!isPlaying && playButton)) {
      const ariaLabel = playButton?.getAttribute('aria-label') || '';
      const buttonTitle = playButton?.getAttribute('title') || '';
      
      // 한국어와 영어 모두 체크
      const isPauseButton = ariaLabel.includes('일시정지') || ariaLabel.includes('Pause') ||
                           buttonTitle.includes('일시정지') || buttonTitle.includes('Pause');
      
      if (isPauseButton) {
        isPlaying = true;
      }
    }
    
    // 4단계: 진행률 정보 보완
    if (duration === 0) {
      const progressBar = document.querySelector('ytmusic-player-bar input[type="range"]') ||
                         document.querySelector('#progress-bar') ||
                         document.querySelector('.progress-bar input');
      
      if (progressBar) {
        progress = parseFloat(progressBar.value) || 0;
        duration = parseFloat(progressBar.max) || 0;
      }
    }
    
    // 5단계: 볼륨 정보 보완  
    if (volume === 50) {
      const volumeSlider = document.querySelector('ytmusic-player-bar .volume input[type="range"]') ||
                          document.querySelector('#volume-slider');
      
      if (volumeSlider) {
        volume = parseFloat(volumeSlider.value) || 50;
      }
    }
    
    // 최종 상태
    const status = {
      isPlaying,
      title: songTitle ? songTitle.textContent.trim() : '',
      artist: artist ? artist.textContent.trim() : '',
      progress,
      duration,
      volume
    };
    
    // 변경된 경우만 로그 출력
    if (JSON.stringify(status) !== JSON.stringify(this.lastStatus)) {
      console.log('📊 YouTube Music 상태 변경:', {
        ...status,
        videoFound: !!videoElement,
        playButtonFound: !!playButton,
        playButtonLabel: playButton?.getAttribute('aria-label') || 'N/A'
      });
      this.lastStatus = { ...status };
    }
    
    return status;
  }
  
  // 요소를 찾는 헬퍼 함수
  findElement(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return null;
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
    console.log('🎮 모바일에서 원격 명령 수신:', command);
    
    switch (command.type) {
      case 'registered':
        console.log('✅ 서버에 세션 등록 완료');
        break;
        
      case 'play_pause':
        console.log('▶️ 재생/일시정지 명령 처리');
        this.togglePlayPause();
        break;
        
      case 'next':
        console.log('⏭️ 다음 곡 명령 처리');
        this.nextTrack();
        break;
        
      case 'previous':
        console.log('⏮️ 이전 곡 명령 처리');
        this.previousTrack();
        break;
        
      case 'volume':
        console.log('🔊 볼륨 조절 명령 처리:', command.value);
        this.setVolume(command.value);
        break;
        
      case 'seek':
        console.log('⏱️ 재생 위치 이동 명령 처리:', command.position);
        this.seekTo(command.position);
        break;
        
      case 'get_status':
        console.log('📊 상태 요청 명령 처리');
        this.sendCurrentStatus();
        break;
        
      default:
        console.warn('❓ 알 수 없는 명령:', command.type);
    }
    
    // 명령 처리 후 상태 재전송 (registered 제외)
    if (command.type !== 'registered') {
      setTimeout(() => {
        this.sendCurrentStatus();
      }, 500);
    }
  }
  
  // 재생/일시정지 토글
  togglePlayPause() {
    console.log('🎯 재생/일시정지 명령 실행 시도...');
    
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
    
    // 2순위: 재생 버튼 클릭
    const playButtonSelectors = [
      'ytmusic-player-bar button[aria-label*="재생"]',
      'ytmusic-player-bar button[aria-label*="일시정지"]', 
      'ytmusic-player-bar button[aria-label*="Play"]',
      'ytmusic-player-bar button[aria-label*="Pause"]',
      'ytmusic-player-bar .middle-controls button[aria-label]',
      '#play-pause-button'
    ];
    
    const playButton = this.findElement(playButtonSelectors);
    if (playButton) {
      console.log('✅ 재생 버튼 클릭:', playButton.getAttribute('aria-label'));
      playButton.click();
      return;
    }
    
    // 3순위: 키보드 이벤트 시뮬레이션
    try {
      console.log('⌨️ 스페이스바 키 이벤트 시뮬레이션...');
      document.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'Space',
        key: ' ',
        keyCode: 32,
        which: 32,
        bubbles: true
      }));
      return;
    } catch (error) {
      console.log('❌ 키보드 이벤트 실패:', error);
    }
    
    console.error('❌ 재생/일시정지 제어 실패 - 모든 방법 시도됨');
  }
  
  // 다음 곡
  nextTrack() {
    console.log('🎯 다음 곡 명령 실행 시도...');
    
    const nextButtonSelectors = [
      'ytmusic-player-bar button[aria-label*="다음"]',
      'ytmusic-player-bar button[aria-label*="Next"]',
      'ytmusic-player-bar .middle-controls button:last-of-type',
      '.next-button'
    ];
    
    const nextButton = this.findElement(nextButtonSelectors);
    if (nextButton) {
      console.log('✅ 다음 곡 버튼 클릭:', nextButton.getAttribute('aria-label'));
      nextButton.click();
      return;
    }
    
    // 키보드 단축키 시도
    try {
      console.log('⌨️ 다음 곡 키보드 단축키 시도...');
      document.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'KeyN',
        key: 'n',
        keyCode: 78,
        ctrlKey: true,
        bubbles: true
      }));
    } catch (error) {
      console.log('❌ 키보드 단축키 실패:', error);
    }
  }
  
  // 이전 곡
  previousTrack() {
    console.log('🎯 이전 곡 명령 실행 시도...');
    
    const prevButtonSelectors = [
      'ytmusic-player-bar button[aria-label*="이전"]',
      'ytmusic-player-bar button[aria-label*="Previous"]', 
      'ytmusic-player-bar .middle-controls button:first-of-type',
      '.previous-button'
    ];
    
    const prevButton = this.findElement(prevButtonSelectors);
    if (prevButton) {
      console.log('✅ 이전 곡 버튼 클릭:', prevButton.getAttribute('aria-label'));
      prevButton.click();
      return;
    }
    
    // 키보드 단축키 시도
    try {
      console.log('⌨️ 이전 곡 키보드 단축키 시도...');
      document.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'KeyP',
        key: 'p', 
        keyCode: 80,
        ctrlKey: true,
        bubbles: true
      }));
    } catch (error) {
      console.log('❌ 키보드 단축키 실패:', error);
    }
  }
  
  // 볼륨 설정
  setVolume(volume) {
    console.log(`🎯 볼륨 설정 시도: ${volume}%`);
    
    // 1순위: 비디오 요소 직접 제어
    const videoElement = document.querySelector('video');
    if (videoElement) {
      try {
        videoElement.volume = volume / 100;
        console.log('✅ 비디오 요소 볼륨 설정 성공');
        return;
      } catch (error) {
        console.log('❌ 비디오 요소 볼륨 설정 실패:', error);
      }
    }
    
    // 2순위: 볼륨 슬라이더 조작
    const volumeSelectors = [
      'ytmusic-player-bar .volume input[type="range"]',
      '#volume-slider',
      '.volume-slider'
    ];
    
    const volumeSlider = this.findElement(volumeSelectors);
    if (volumeSlider) {
      console.log('✅ 볼륨 슬라이더 조작');
      volumeSlider.value = volume;
      volumeSlider.dispatchEvent(new Event('input', { bubbles: true }));
      volumeSlider.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    
    console.error('❌ 볼륨 제어 실패');
  }
  
  // 재생 위치 이동
  seekTo(position) {
    console.log(`🎯 재생 위치 이동 시도: ${position}초`);
    
    // 1순위: 비디오 요소 직접 제어
    const videoElement = document.querySelector('video');
    if (videoElement && videoElement.duration) {
      try {
        videoElement.currentTime = Math.min(position, videoElement.duration);
        console.log('✅ 비디오 요소 시간 이동 성공');
        return;
      } catch (error) {
        console.log('❌ 비디오 요소 시간 이동 실패:', error);
      }
    }
    
    // 2순위: 진행률 바 조작
    const progressSelectors = [
      'ytmusic-player-bar input[type="range"]',
      '#progress-bar',
      '.progress-bar input'
    ];
    
    const progressBar = this.findElement(progressSelectors);
    if (progressBar) {
      console.log('✅ 진행률 바 조작');
      const duration = parseFloat(progressBar.max) || 100;
      const newValue = Math.min(position, duration);
      
      progressBar.value = newValue;
      progressBar.dispatchEvent(new Event('input', { bubbles: true }));
      progressBar.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    
    console.error('❌ 재생 위치 이동 실패');
  }
  
  // DOM 변경 감지하여 상태 업데이트
  setupObservers() {
    // 1. 비디오 요소 이벤트 리스너
    const videoElement = document.querySelector('video');
    if (videoElement) {
      console.log('🎥 비디오 요소 이벤트 리스너 설정');
      
      videoElement.addEventListener('play', () => {
        console.log('▶️ 비디오 재생 시작 감지');
        setTimeout(() => this.sendCurrentStatus(), 100);
      });
      
      videoElement.addEventListener('pause', () => {
        console.log('⏸️ 비디오 일시정지 감지');
        setTimeout(() => this.sendCurrentStatus(), 100);
      });
      
      // 시간 업데이트 감지 (throttled)
      let lastTimeUpdate = 0;
      videoElement.addEventListener('timeupdate', () => {
        const now = Date.now();
        if (now - lastTimeUpdate > 2000) {
          lastTimeUpdate = now;
          this.sendCurrentStatus();
        }
      });
      
      videoElement.addEventListener('volumechange', () => {
        setTimeout(() => this.sendCurrentStatus(), 100);
      });
      
      videoElement.addEventListener('loadstart', () => {
        console.log('🎵 새로운 곡 로딩 감지');
        setTimeout(() => this.sendCurrentStatus(), 500);
      });
    }
    
    // 2. 플레이어 바 MutationObserver
    const playerBar = document.querySelector('ytmusic-player-bar');
    if (playerBar) {
      console.log('🎛️ 플레이어 바 변경 감지 설정');
      
      const playerObserver = new MutationObserver((mutations) => {
        let shouldUpdate = false;
        
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes') {
            const attributeName = mutation.attributeName;
            if (attributeName === 'aria-label' || attributeName === 'title' || attributeName === 'class') {
              shouldUpdate = true;
            }
          }
          
          if (mutation.type === 'childList' || mutation.type === 'characterData') {
            shouldUpdate = true;
          }
        });
        
        if (shouldUpdate) {
          setTimeout(() => this.sendCurrentStatus(), 200);
        }
      });
      
      playerObserver.observe(playerBar, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label', 'title', 'class', 'value'],
        characterData: true
      });
      
      this.playerObserver = playerObserver;
    }
    
    // 3. 키보드 이벤트 감지
    document.addEventListener('keydown', (event) => {
      if (event.code === 'Space' || event.code === 'MediaPlayPause' || 
          event.code === 'MediaTrackNext' || event.code === 'MediaTrackPrevious') {
        setTimeout(() => this.sendCurrentStatus(), 300);
      }
    });
    
    // 4. 주기적 상태 확인
    setInterval(() => {
      this.sendCurrentStatus();
    }, 3000);
    
    // 5. 페이지 포커스 시 즉시 상태 확인
    window.addEventListener('focus', () => {
      setTimeout(() => this.sendCurrentStatus(), 100);
    });
    
    console.log('🔧 모든 상태 감지 시스템 설정 완료');
  }
  
  // 디버깅용: 페이지 구조 분석
  debugPageStructure() {
    console.log('🔍 YouTube Music 페이지 구조 분석');
    
    const playerBars = document.querySelectorAll('ytmusic-player-bar, .ytmusic-player-bar, #player-bar');
    console.log('플레이어 바 개수:', playerBars.length);
    
    const buttons = document.querySelectorAll('button');
    const labeledButtons = Array.from(buttons).filter(btn => btn.getAttribute('aria-label'));
    console.log('aria-label이 있는 버튼들:', labeledButtons.map(btn => btn.getAttribute('aria-label')));
    
    const videoElements = document.querySelectorAll('video');
    console.log('비디오 요소들:', videoElements.length);
    if (videoElements.length > 0) {
      console.log('비디오 상태:', Array.from(videoElements).map(v => ({
        paused: v.paused,
        currentTime: v.currentTime,
        duration: v.duration
      })));
    }
  }
  
  // cleanup 함수
  cleanup() {
    if (this.playerObserver) {
      this.playerObserver.disconnect();
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}

// 페이지 로드 완료 후 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.ytMusicController = new YouTubeMusicController();
  });
} else {
  window.ytMusicController = new YouTubeMusicController();
}

// 페이지 언로드 시 정리
window.addEventListener('beforeunload', () => {
  if (window.ytMusicController) {
    window.ytMusicController.cleanup();
  }
});