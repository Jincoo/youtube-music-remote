// YouTube Music 페이지에서 실행되는 스크립트
class YouTubeMusicController {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    
    this.init();
  }
  
  init() {
    this.generateSessionId();
    this.connectWebSocket();
    this.setupObservers();
    this.debugPageStructure(); // 디버깅 함수 추가
    console.log('YouTube Music Remote Controller 초기화됨');
  }
  
  // 디버깅용: 페이지 구조 분석
  debugPageStructure() {
    console.log('=== YouTube Music 페이지 구조 분석 ===');
    
    // 플레이어 바 찾기
    const playerBars = document.querySelectorAll('ytmusic-player-bar, .ytmusic-player-bar, #player-bar');
    console.log('플레이어 바 개수:', playerBars.length);
    
    // 모든 버튼 찾기
    const buttons = document.querySelectorAll('button');
    console.log('총 버튼 개수:', buttons.length);
    
    // aria-label이 있는 버튼들 찾기
    const labeledButtons = Array.from(buttons).filter(btn => btn.getAttribute('aria-label'));
    console.log('aria-label이 있는 버튼들:', labeledButtons.map(btn => btn.getAttribute('aria-label')));
    
    // 제목과 아티스트 가능성이 있는 요소들
    const titleElements = document.querySelectorAll('.title, .song-title, [class*="title"]');
    const artistElements = document.querySelectorAll('.byline, .subtitle, .artist, [class*="artist"]');
    
    console.log('제목 요소 후보들:', Array.from(titleElements).map(el => el.textContent.trim()).filter(text => text));
    console.log('아티스트 요소 후보들:', Array.from(artistElements).map(el => el.textContent.trim()).filter(text => text));
    
    // 현재 재생 중인지 확인
    const videoElements = document.querySelectorAll('video');
    console.log('비디오 요소들:', videoElements.length);
    if (videoElements.length > 0) {
      console.log('비디오 재생 상태:', Array.from(videoElements).map(v => ({
        paused: v.paused,
        currentTime: v.currentTime,
        duration: v.duration
      })));
    }
  }
  
  generateSessionId() {
    this.sessionId = 'ytm_' + Math.random().toString(36).substring(2, 15);
    chrome.storage.local.set({ sessionId: this.sessionId });
  }
  
  connectWebSocket() {
    try {
      // 올바른 WebSocket 포트로 연결 (서버.js에서 8081 사용)
      this.ws = new WebSocket('ws://localhost:8081');
      
      this.ws.onopen = () => {
        console.log('WebSocket 연결됨');
        this.reconnectAttempts = 0;
        this.registerSession();
        this.sendCurrentStatus();
      };
      
      this.ws.onmessage = (event) => {
        this.handleRemoteCommand(JSON.parse(event.data));
      };
      
      this.ws.onclose = () => {
        console.log('WebSocket 연결 끊김');
        this.reconnect();
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket 오류:', error);
      };
    } catch (error) {
      console.error('WebSocket 연결 실패:', error);
      this.reconnect();
    }
  }
  
  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`재연결 시도 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        this.connectWebSocket();
      }, 3000 * this.reconnectAttempts);
    }
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
  
  // 현재 재생 상태 정보 수집
  getCurrentStatus() {
    // 여러 가능한 선택자들을 시도
    const playButtonSelectors = [
      '#play-pause-button',
      '.play-pause-button',
      '[aria-label*="재생"], [aria-label*="일시정지"], [aria-label*="Play"], [aria-label*="Pause"]',
      'ytmusic-player-bar button[aria-label]',
      '.ytmusic-player-bar .middle-controls button'
    ];
    
    const titleSelectors = [
      '.title.ytmusic-player-bar',
      '.ytmusic-player-bar .title',
      'yt-formatted-string.title',
      '.song-title',
      '.ytmusic-player-bar .song-info .title'
    ];
    
    const artistSelectors = [
      '.byline.ytmusic-player-bar',
      '.ytmusic-player-bar .byline',
      '.subtitle',
      '.song-artist',
      '.ytmusic-player-bar .song-info .byline'
    ];
    
    const progressSelectors = [
      '#progress-bar',
      '.progress-bar',
      '.ytmusic-player-bar .time-info input[type="range"]',
      'ytmusic-player-bar input[role="slider"]'
    ];
    
    const volumeSelectors = [
      '#volume-slider',
      '.volume-slider',
      '.ytmusic-player-bar .volume input[type="range"]',
      'ytmusic-player-bar .right-controls input[type="range"]'
    ];
    
    // 실제 요소 찾기
    const playButton = this.findElement(playButtonSelectors);
    const songTitle = this.findElement(titleSelectors);
    const artist = this.findElement(artistSelectors);
    const progressBar = this.findElement(progressSelectors);
    const volumeSlider = this.findElement(volumeSelectors);
    
    // 재생 상태 확인 (여러 방법으로)
    let isPlaying = false;
    if (playButton) {
      const ariaLabel = playButton.getAttribute('aria-label') || '';
      const title = playButton.getAttribute('title') || '';
      isPlaying = ariaLabel.includes('일시정지') || ariaLabel.includes('Pause') || 
                 title.includes('일시정지') || title.includes('Pause') ||
                 playButton.querySelector('[data-title-no-tooltip*="일시정지"]') !== null;
    }
    
    // 디버깅 정보 출력
    console.log('YouTube Music 상태 수집:', {
      playButton: !!playButton,
      songTitle: !!songTitle,
      artist: !!artist,
      progressBar: !!progressBar,
      volumeSlider: !!volumeSlider,
      isPlaying,
      titleText: songTitle ? songTitle.textContent.trim() : 'N/A',
      artistText: artist ? artist.textContent.trim() : 'N/A'
    });
    
    return {
      isPlaying,
      title: songTitle ? songTitle.textContent.trim() : '',
      artist: artist ? artist.textContent.trim() : '',
      progress: progressBar ? (progressBar.value || 0) : 0,
      duration: progressBar ? (progressBar.max || 0) : 0,
      volume: volumeSlider ? (volumeSlider.value || 50) : 50
    };
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
    console.log('원격 명령 수신:', command);
    
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
      case 'get_status':
        this.sendCurrentStatus();
        break;
    }
  }
  
  // 재생/일시정지 토글
  togglePlayPause() {
    const playButtonSelectors = [
      '#play-pause-button',
      '.play-pause-button',
      '[aria-label*="재생"], [aria-label*="일시정지"], [aria-label*="Play"], [aria-label*="Pause"]',
      'ytmusic-player-bar button[aria-label]',
      '.ytmusic-player-bar .middle-controls button'
    ];
    
    const playButton = this.findElement(playButtonSelectors);
    if (playButton) {
      console.log('재생/일시정지 버튼 클릭');
      playButton.click();
      setTimeout(() => this.sendCurrentStatus(), 100);
    } else {
      console.error('재생/일시정지 버튼을 찾을 수 없습니다');
    }
  }
  
  // 다음 곡
  nextTrack() {
    const nextButtonSelectors = [
      '.next-button',
      '[aria-label*="다음"], [aria-label*="Next"]',
      'ytmusic-player-bar .next-button',
      '.ytmusic-player-bar .middle-controls button:last-child'
    ];
    
    const nextButton = this.findElement(nextButtonSelectors);
    if (nextButton) {
      console.log('다음 곡 버튼 클릭');
      nextButton.click();
      setTimeout(() => this.sendCurrentStatus(), 500);
    } else {
      console.error('다음 곡 버튼을 찾을 수 없습니다');
    }
  }
  
  // 이전 곡
  previousTrack() {
    const prevButtonSelectors = [
      '.previous-button',
      '[aria-label*="이전"], [aria-label*="Previous"]',
      'ytmusic-player-bar .previous-button',
      '.ytmusic-player-bar .middle-controls button:first-child'
    ];
    
    const prevButton = this.findElement(prevButtonSelectors);
    if (prevButton) {
      console.log('이전 곡 버튼 클릭');
      prevButton.click();
      setTimeout(() => this.sendCurrentStatus(), 500);
    } else {
      console.error('이전 곡 버튼을 찾을 수 없습니다');
    }
  }
  
  // 볼륨 설정
  setVolume(volume) {
    const volumeSlider = document.querySelector('#volume-slider');
    if (volumeSlider) {
      volumeSlider.value = volume;
      volumeSlider.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => this.sendCurrentStatus(), 100);
    }
  }
  
  // 재생 위치 이동
  seekTo(position) {
    const progressBar = document.querySelector('#progress-bar');
    if (progressBar) {
      progressBar.value = position;
      progressBar.dispatchEvent(new Event('input', { bubbles: true }));
      progressBar.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => this.sendCurrentStatus(), 100);
    }
  }
  
  // DOM 변경 감지하여 상태 업데이트
  setupObservers() {
    // 재생 상태 변경 감지
    const playerBar = document.querySelector('ytmusic-player-bar');
    if (playerBar) {
      const observer = new MutationObserver(() => {
        this.sendCurrentStatus();
      });
      
      observer.observe(playerBar, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label', 'value']
      });
    }
    
    // 주기적으로 상태 전송 (fallback)
    setInterval(() => {
      this.sendCurrentStatus();
    }, 5000);
  }
}

// 페이지 로드 완료 후 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new YouTubeMusicController();
  });
} else {
  new YouTubeMusicController();
}