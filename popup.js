// 팝업 스크립트
class RemotePopup {
  constructor() {
    this.sessionId = null;
    this.currentStatus = {};
    this.init();
  }
  
  async init() {
    await this.loadSessionId();
    this.setupEventListeners();
    this.requestCurrentStatus();
    this.updateConnectionStatus();
    
    // 주기적으로 상태 업데이트
    setInterval(() => {
      this.requestCurrentStatus();
      this.updateConnectionStatus();
    }, 2000);
  }
  
  async loadSessionId() {
    const result = await chrome.storage.local.get(['sessionId']);
    this.sessionId = result.sessionId;
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
  }
  
  sendCommand(type, data = {}) {
    // 활성 탭에 메시지 전송
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url.includes('music.youtube.com')) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'remote_command',
          command: type,
          ...data
        });
      }
    });
  }
  
  requestCurrentStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url.includes('music.youtube.com')) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'get_status'
        }, (response) => {
          if (response) {
            this.updateUI(response);
          }
        });
      }
    });
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
  
  updateConnectionStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const statusEl = document.getElementById('connectionStatus');
      if (tabs[0] && tabs[0].url.includes('music.youtube.com')) {
        statusEl.textContent = '연결됨';
        statusEl.className = 'connected';
      } else {
        statusEl.textContent = 'YouTube Music 탭을 열어주세요';
        statusEl.className = 'disconnected';
      }
    });
  }
}

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', () => {
  new RemotePopup();
});