# YouTube Music Remote Control

PC와 모바일 간 YouTube Music 원격 제어를 위한 Chrome 확장 프로그램 + WebSocket 서버

## 📋 현재 진행 상황

### ✅ 완료된 기능
- Chrome 확장 프로그램 기본 구조 완성
- WebSocket 서버 구현 완료 (Node.js)
- YouTube Music 페이지에서 곡 정보 수집 (제목, 아티스트)
- 모바일 웹 인터페이스 구현
- 서버-클라이언트 통신 연결 완료

### 🔧 현재 문제점
1. **재생 상태 감지 이슈**: 음악이 재생 중이어도 `isPlaying: false`로 감지됨
2. **진행률/볼륨 정보**: `progress: 0, duration: 0, volume: 50`으로 고정됨
3. **DOM 선택자**: YouTube Music의 DOM 구조 변경으로 일부 요소 감지 실패

### 🎯 해결 중인 사항
- 비디오 요소(`<video>`)를 통한 더 정확한 재생 상태 감지
- 다양한 DOM 선택자를 통한 요소 탐지 개선
- 디버깅 로그 추가로 문제점 분석 중

## 🏗️ 프로젝트 구조

```
youtube-music-remote/
├── manifest.json          # Chrome 확장 프로그램 설정
├── content.js             # YouTube Music 페이지 제어 스크립트
├── popup.html             # 확장 프로그램 팝업 UI
├── popup.js               # 팝업 동작 스크립트
├── background.js          # 백그라운드 서비스 워커
├── server.js              # Node.js WebSocket 서버
├── package.json           # Node.js 프로젝트 설정
└── mobile/
    └── index.html         # 모바일 원격 제어 페이지
```

## 🚀 설치 및 실행

### 1. 의존성 설치
```bash
npm install ws express qrcode
```

### 2. 서버 실행
```bash
node server.js
```

서버 실행 확인:
```
YouTube Music Remote 서버 시작됨:
- HTTP 서버: http://localhost:8080
- WebSocket 서버: ws://localhost:8081
- 모바일 접속: http://localhost:8080/mobile
```

### 3. Chrome 확장 프로그램 설치
1. Chrome에서 `chrome://extensions/` 접속
2. "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. 프로젝트 폴더 선택

### 4. 사용 방법
1. **PC**: YouTube Music 웹페이지에서 음악 재생
2. **모바일**: `http://localhost:8080/mobile` 접속
3. **제어**: 모바일에서 PC 음악 원격 제어

## 🔍 디버깅 정보

### 현재 서버 로그 상태
- 세션 연결: ✅ 정상
- 곡 정보 수집: ✅ 정상 ("Run (feat. YB)" by 리쌍 감지됨)
- 재생 상태: ❌ 항상 `false`
- 진행률: ❌ 항상 `0`

### 개발자 도구 확인 방법
1. YouTube Music 페이지에서 F12
2. Console 탭에서 다음 로그 확인:
   - "YouTube Music Remote Controller 초기화됨"
   - "WebSocket 연결됨"
   - "YouTube Music 상태 수집" (디버깅 정보)

## 🛠️ 기술 스택

- **Frontend**: Vanilla JavaScript, HTML, CSS
- **Backend**: Node.js, WebSocket (ws), Express
- **Chrome Extension**: Manifest V3
- **통신**: WebSocket 실시간 통신

## 📱 주요 기능

### 계획된 기능
- [x] 곡 정보 표시 (제목, 아티스트)
- [ ] 재생/일시정지 제어
- [ ] 이전/다음 곡 제어
- [ ] 볼륨 조절
- [ ] 진행률 표시 및 제어
- [ ] 실시간 상태 동기화

### 현재 작동하는 기능
- Chrome 확장 프로그램 로드
- WebSocket 서버 통신
- 곡 정보 수집 (제목, 아티스트)
- 모바일 UI 표시

## 🔧 알려진 이슈

1. **재생 상태 감지 실패**
   - 증상: 음악 재생 중에도 `isPlaying: false`
   - 원인: YouTube Music DOM 구조 변경으로 재생 버튼 감지 실패
   - 해결책: 비디오 요소 직접 확인으로 변경 중

2. **진행률 정보 부족**
   - 증상: `progress: 0, duration: 0`
   - 원인: 진행률 바 요소 선택자 불일치
   - 해결책: 비디오 요소의 currentTime/duration 사용

3. **볼륨 정보 고정**
   - 증상: 항상 `volume: 50`
   - 원인: 볼륨 슬라이더 요소 감지 실패

## 🎯 다음 단계

1. **재생 상태 수정**: 비디오 요소 기반 감지로 완전 전환
2. **DOM 선택자 업데이트**: 최신 YouTube Music 구조에 맞춤
3. **제어 기능 테스트**: 실제 재생/일시정지 등 동작 확인
4. **모바일 UI 개선**: 더 나은 사용자 경험
5. **에러 처리 강화**: 연결 실패 시 복구 메커니즘

## 📞 개발 히스토리

### 2025-07-31
- 프로젝트 초기 설정 완료
- Chrome 확장 프로그램 기본 구조 구현
- WebSocket 서버 구현 및 테스트
- 곡 정보 수집 기능 구현 (제목, 아티스트 정상 동작)
- 재생 상태 감지 이슈 발견 및 해결 시도 중

### 해결한 문제들
- ✅ WebSocket 포트 불일치 (8080 → 8081)
- ✅ Chrome 확장 프로그램 아이콘 오류
- ✅ 서버-클라이언트 통신 연결
- ✅ 곡 정보 수집 (제목, 아티스트)

### 현재 작업 중
- 🔧 재생 상태 정확한 감지
- 🔧 진행률 및 볼륨 정보 수집
- 🔧 실제 제어 기능 동작 확인