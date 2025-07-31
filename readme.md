# 🎵 YouTube Music Remote Control

PC와 모바일 간 실시간 YouTube Music 원격 제어 시스템

## 📋 프로젝트 개요

### 🎯 목표
집에서 PC로 YouTube Music을 재생할 때, 모바일 기기로 원격 제어할 수 있는 시스템 구축
- ✅ 재생/일시정지 제어
- ✅ 이전/다음 곡 제어  
- ✅ 볼륨 조절
- ✅ 진행률 표시 및 제어
- ✅ 실시간 곡 정보 동기화

### 🏗️ 시스템 구조
```
📱 모바일 웹앱  ←→  🖥️ WebSocket 서버  ←→  💻 Chrome 확장 프로그램
                    (Node.js)              (YouTube Music)
```

## 🚀 현재 작동 상태

### ✅ 성공적으로 구현된 기능
- **실시간 상태 감지**: 재생/정지, 곡 정보, 진행률 정확히 감지
- **WebSocket 통신**: PC ↔ 서버 ↔ 모바일 실시간 연결
- **원격 제어**: 모바일에서 PC 음악 제어 가능
- **곡 정보 동기화**: 제목, 아티스트, 앨범 정보 실시간 표시
- **진행률 표시**: 실시간 재생 위치 및 전체 길이 표시

### 🔧 현재 알려진 이슈
- **연결 안정성**: 모바일 연결이 간헐적으로 끊어지는 현상
- **재생 상태 정확도**: 일부 상황에서 재생 상태 오감지

## 📁 프로젝트 구조

```
youtube-music-remote/
├── manifest.json              # Chrome 확장 프로그램 설정
├── content.js                 # YouTube Music 페이지 제어 스크립트
├── popup.html                 # 확장 프로그램 팝업 UI
├── popup.js                   # 팝업 동작 스크립트
├── background.js              # 백그라운드 서비스 워커
├── server.js                  # Node.js WebSocket 서버
├── package.json               # Node.js 프로젝트 설정
├── mobile/
│   └── index.html            # 모바일 원격 제어 페이지
└── README.md                 # 프로젝트 문서
```

## 🛠️ 설치 및 실행

### 1. 의존성 설치
```bash
npm install ws express qrcode
```

### 2. 서버 실행
```bash
node server.js
```

예상 출력:
```
🚀 YouTube Music Remote 서버 시작됨:
- 서버 IP: 192.168.1.100
- PC에서 접속: http://localhost:8080
- 모바일에서 접속: http://192.168.1.100:8080/mobile
- WebSocket: ws://192.168.1.100:8081

📱 모바일 브라우저에서 이 주소로 접속하세요:
   http://192.168.1.100:8080/mobile
```

### 3. Chrome 확장 프로그램 설치
1. Chrome에서 `chrome://extensions/` 접속
2. "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. 프로젝트 폴더 선택

### 4. 사용 방법
1. **PC**: YouTube Music에서 음악 재생
2. **모바일**: 서버에서 표시된 IP 주소로 접속
3. **제어**: 모바일에서 PC 음악을 원격 제어!

## 🔧 기술 스택

### Frontend
- **Vanilla JavaScript**: 확장 프로그램 및 모바일 인터페이스
- **HTML5/CSS3**: 반응형 모바일 UI
- **Chrome Extension API**: Manifest V3

### Backend
- **Node.js**: 서버 런타임
- **WebSocket (ws)**: 실시간 양방향 통신
- **Express.js**: HTTP 서버

### 통신
- **WebSocket**: PC ↔ 서버 ↔ 모바일 실시간 데이터 교환
- **Chrome Extension Messages**: 확장 프로그램 내부 통신

## 📊 개발 히스토리

#### Phase 1: 기본 구조 구축
- ✅ Chrome 확장 프로그램 기본 틀 구성
- ✅ WebSocket 서버 구현
- ✅ 모바일 웹 인터페이스 구현

#### Phase 2: 핵심 기능 구현
- ✅ YouTube Music DOM 요소 감지 로직
- ✅ 재생 상태 수집 (제목, 아티스트, 진행률)
- ✅ 실시간 상태 동기화

#### Phase 3: 원격 제어 구현
- ✅ 모바일 → PC 제어 명령 전송
- ✅ 재생/일시정지, 이전/다음 곡, 볼륨 조절
- ✅ 비디오 요소 직접 제어로 정확도 향상

#### Phase 4: 네트워크 및 연결성
- ✅ 로컬 네트워크 IP 자동 감지
- ✅ 모바일 기기에서 PC 서버 접근
- ✅ 세션 관리 및 기기 간 매칭

### 해결한 주요 문제들

#### 1. DOM 선택자 이슈
**문제**: YouTube Music의 동적 DOM 구조로 요소 감지 실패
**해결**: 다양한 선택자 조합 + 비디오 요소 직접 접근

#### 2. 재생 상태 감지 정확도
**문제**: aria-label 기반 감지의 불안정성
**해결**: 비디오 요소의 `paused`, `currentTime` 속성 직접 확인

#### 3. 네트워크 연결 문제
**문제**: 모바일에서 localhost 접근 불가
**해결**: 로컬 네트워크 IP 자동 감지 및 서버 바인딩

#### 4. WebSocket 포트 충돌
**문제**: HTTP와 WebSocket 서버 포트 혼선
**해결**: HTTP(8080), WebSocket(8081) 포트 분리

#### 5. 세션 매칭 복잡성
**문제**: PC와 모바일 간 세션 ID 불일치
**해결**: 고정 세션 ID(`ytm_default_session`) 사용

## 🎯 현재 작동 확인된 기능

### PC측 (Chrome Extension)
```javascript
// 성공적으로 감지되는 정보
{
  isPlaying: true,
  title: "너무 아픈 사랑은 사랑이 아니었음을",
  artist: "김광석 • 김광석 다시부르기 2 • 1995년",
  progress: 1.0238,
  duration: 299,
  volume: 15
}
```

### 모바일측 (Web Interface)
- ✅ 실시간 곡 정보 표시
- ✅ 재생/일시정지 버튼 동작
- ✅ 진행률 바 표시
- ✅ 볼륨 조절 가능

### 서버측 (WebSocket)
- ✅ PC 및 모바일 동시 연결
- ✅ 실시간 메시지 중계
- ✅ 세션 관리 및 상태 추적

## 🚧 알려진 제한사항

### 기술적 제한
1. **YouTube Music 의존성**: YouTube Music의 DOM 구조 변경 시 업데이트 필요
2. **로컬 네트워크 제한**: 같은 Wi-Fi 네트워크에서만 동작
3. **Chrome 브라우저 전용**: Manifest V3 Chrome 확장 프로그램

### 현재 버그
1. **연결 안정성**: 모바일 WebSocket 연결이 간헐적으로 끊어짐
2. **상태 동기화**: 빠른 곡 변경 시 일시적 정보 불일치

## 🐛 문제 해결 가이드

### 자주 발생하는 문제

#### Q: 확장 프로그램이 YouTube Music을 감지하지 못해요
**A**: 
1. `music.youtube.com`에서 접속했는지 확인
2. F12 → Console에서 오류 메시지 확인  
3. 확장 프로그램 새로고침 시도

#### Q: 모바일에서 연결이 안 돼요
**A**:
1. 서버가 실행 중인지 확인 (`node server.js`)
2. PC와 모바일이 같은 Wi-Fi에 연결되어 있는지 확인
3. 방화벽에서 8080, 8081 포트 허용 확인

#### Q: 제어 버튼이 작동하지 않아요
**A**:
1. PC에서 음악이 실제로 재생 중인지 확인
2. PC Console에서 명령 수신 로그 확인
3. 페이지 새로고침 후 재시도

### 디버깅 방법

#### PC (Chrome DevTools)
```
F12 → Console에서 확인할 로그:
- "🎵 YouTube Music Remote Controller 초기화됨"
- "✅ WebSocket 연결됨"  
- "🎮 모바일에서 원격 명령 수신"
```

#### 모바일 (브라우저 DevTools)
```
F12 → Console에서 확인할 로그:
- "🔗 고정 세션 ID 사용: ytm_default_session"
- "✅ WebSocket 연결 성공"
- "📊 상태 업데이트 수신"
```

#### 서버 (터미널)
```
확인할 로그:
- "✅ PC 연결됨"
- "✅ MOBILE 연결됨"
- "연결 상태: 🖥️ PC | 📱 Mobile"
```


**개발기간**: 2025년 8월 1일 (1일)  
**개발상태**: Working Beta  
**다음 업데이트**: 연결 안정성 개선 예정