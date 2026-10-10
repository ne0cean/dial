# Mac Input Mapper — 에이전트 시스템 설계서

> 작성일: 2026-06-06
> 목적: Claude Code 구현 참조용 계획서

---

## 1. 작업 컨텍스트

### 배경 및 목적

Surface Dial과 Work Louder Creator Micro 두 입력 디바이스를 macOS에서 활용하기 위한 커스텀 키 매핑 시스템 구축.

- **Surface Dial**: Microsoft 공식 macOS 드라이버 없음. HID 기반 서드파티 라이브러리(mac-dial)로 회전/클릭 이벤트 수신 후, 활성 앱에 따라 다른 단축키를 실행하는 앱-인식 데몬 구현.
- **Creator Micro**: macOS는 인식 완료 (Micro Pad, VID:0x574c, PID:0xe6e3). Work Louder 공식 앱(input.app v0.15.3) 연결 실패 → VIA 웹앱(usevia.app)으로 키맵 구성. 주 용도: 터미널 여러 개 탐색 + 자주 쓰는 명령어 1키 실행.

### 범위

- 포함:
  - Surface Dial 앱-인식 모드 스위칭 데몬
  - Surface Dial 앱별 회전/클릭/롱프레스 동작 정의
  - Creator Micro VIA 레이어 설계 (4레이어, 터미널 중심)
  - input.app 우회 — VIA 웹앱 플로우
  - launchd 자동 시작 스크립트 (Surface Dial 데몬)
- 제외:
  - Figma 전용 매핑 (현재 미사용)
  - Windows 환경 지원
  - Creator Micro 펌웨어 재컴파일 (QMK 빌드 환경 구축)

### 입출력 정의

| 항목 | 내용 |
|------|------|
| **입력 — Surface Dial** | Bluetooth HID 이벤트 (rotate delta, click, long-press) |
| **입력 — Creator Micro** | USB HID 키 입력 (QMK 키코드, 로터리 엔코더 CW/CCW) |
| **출력 — Surface Dial** | macOS 시스템 이벤트 (CGEvent: keydown, keyup, scroll) |
| **출력 — Creator Micro** | HID 키스트로크 (VIA 프로파일에 정의된 키코드 + 매크로) |
| **트리거** | 입력 디바이스 물리 조작 시 즉시 |

### 제약조건

- mac-dial은 Swift 구현, `hidapi` 서브모듈 필요. macOS 12+ 지원.
- Surface Dial Bluetooth LE 4.0 — 2m 이내 유지 필요.
- Creator Micro VIA: 4레이어 제한 (공식 지원).
- VIA 매크로는 키코드 시퀀스 기반. 쉘 명령어 실행 불가 → 단축키 조합만 가능. 실제 명령어 실행은 터미널 앱 단축키(예: iTerm2 프로파일)로 위임.
- Surface Dial 데몬: 롱프레스는 mac-dial 기본 구현에 없음 → 타이머 기반 클릭 홀드로 구현 필요.

### 용어 정의

| 용어 | 정의 |
|------|------|
| HID | Human Interface Device — USB/BT 입력장치 프로토콜 |
| VIA | QMK 키보드 키맵 설정 GUI (usevia.app, 브라우저 기반) |
| Layer | VIA/QMK의 키맵 레이어. Creator Micro는 4레이어 지원 |
| mac-dial | Surface Dial macOS 비공식 드라이버 (github.com/andreasjhkarlsson/mac-dial) |
| 모드 | Surface Dial 데몬이 앱별로 적용하는 동작 프리셋 |
| 로터리 엔코더 | Creator Micro 좌/우 회전 다이얼 (CW/CCW 이벤트) |
| CGEvent | macOS Core Graphics 이벤트 (키 입력 인젝션에 사용) |

---

## 2. 워크플로우 정의

### 전체 흐름도

```
[Surface Dial BT 이벤트]
        ↓
[mac-dial HID 수신 레이어]
        ↓
[앱 감지 데몬 (NSWorkspace 폴링)]
        ↓
  활성 앱 매핑 테이블 조회
  ↙              ↓              ↘
[Chrome 모드]  [Terminal 모드]  [Default 모드]  ... (앱별)
        ↓
[CGEvent inject → macOS 단축키 실행]


[Creator Micro USB HID]
        ↓
[VIA 레이어 결정 (물리 레이어 스위치 키)]
        ↓
[QMK 키코드 → macOS HID 키스트로크]
```

### LLM 판단 vs 코드 처리 구분

| LLM이 직접 수행 | 스크립트로 처리 |
|----------------|----------------|
| 앱별 단축키 제안 (설계 단계) | HID 이벤트 수신 (mac-dial Swift) |
| 매핑 테이블 최적화 제안 | 활성 앱 번들 ID 감지 (NSWorkspace) |
| VIA 레이어 구조 설계 | CGEvent inject (Swift/Python) |
| 사용자 명령어 → 키코드 변환 제안 | launchd plist 생성 및 등록 |

### 단계별 상세

#### Step 1: Surface Dial 데몬 구축

- **처리 주체**: 스크립트 (`surface-dial/daemon/`)
- **입력**: mac-dial HID 이벤트 스트림 (rotate delta, button down, button up)
- **처리 내용**:
  - mac-dial 레포 클론 + hidapi 빌드
  - 앱 감지 루프: 100ms마다 NSWorkspace.shared.frontmostApplication 번들 ID 확인
  - 번들 ID → 모드 매핑 테이블 조회 → 해당 모드 액션 실행
  - 롱프레스 감지: button-down 타이머 500ms 이상 → long-press 액션
- **출력**: macOS 단축키 CGEvent 발사
- **성공 기준**: 앱 전환 후 1초 이내 모드 변경, 회전 지연 없음
- **검증 방법**: 각 앱 활성화 후 다이얼 조작 → 의도한 동작 확인
- **실패 시 처리**: 데몬 크래시 → launchd 자동 재시작 (KeepAlive: true)

#### Step 2: Surface Dial 앱별 모드 매핑

- **처리 주체**: 설정 파일 (`surface-dial/config.json`)
- **입력**: 번들 ID 문자열
- **처리 내용**: 아래 매핑 테이블 적용

| 모드 | 번들 ID | 회전 CW | 회전 CCW | 클릭 | 롱프레스 |
|------|---------|---------|---------|------|---------|
| Default | (미매핑 앱 전부) | Cmd+Tab (다음 창) | Cmd+Shift+Tab (이전 창) | iTerm2 토글 (Cmd+Space → iTerm) | Ctrl+Cmd+Q (화면 잠금) |
| Chrome | com.google.Chrome | Ctrl+Tab (다음 탭) | Ctrl+Shift+Tab (이전 탭) | Cmd+T (새 탭) | Ctrl+Cmd+Q |
| Terminal | com.apple.Terminal | Ctrl+Tab (다음 창) | Ctrl+Shift+Tab (이전 창) | Ctrl+L (clear) | Ctrl+Cmd+Q |
| iTerm2 | com.googlecode.iterm2 | Cmd+] (다음 패널) | Cmd+[ (이전 패널) | Ctrl+L (clear) | Ctrl+Cmd+Q |
| Finder | com.apple.finder | Arrow Down | Arrow Up | Enter (열기) | Ctrl+Cmd+Q |
| VS Code | com.microsoft.VSCode | Ctrl+Tab (다음 탭) | Ctrl+Shift+Tab (이전 탭) | Cmd+P (빠른 열기) | Ctrl+Cmd+Q |
| Antigravity | (번들 ID 확인 필요) | Ctrl+Tab | Ctrl+Shift+Tab | Cmd+P | Ctrl+Cmd+Q |
| KakaoTalk | com.kakao.KakaoTalkMac | Arrow Down (스크롤) | Arrow Up (스크롤) | Enter (전송) | Ctrl+Cmd+Q |
| Telegram | ru.keepcoder.Telegram | Arrow Down | Arrow Up | Enter | Ctrl+Cmd+Q |

- **출력**: `surface-dial/config.json` (런타임 로드)
- **성공 기준**: 모든 앱 모드 전환 지연 < 100ms
- **검증 방법**: 앱별 순차 활성화 테스트 스크립트
- **실패 시 처리**: 번들 ID 미매핑 → Default 모드 폴백

#### Step 3: Creator Micro VIA 키맵 설계

- **처리 주체**: VIA 웹앱 (usevia.app) + 설정 파일 (`creator-micro/via-profiles/`)
- **입력**: 물리 키보드 (12키 + 좌/우 로터리 엔코더 각 CW/CCW/클릭)
- **처리 내용**: 4레이어 설계

**레이어 0 — System (기본)**

```
[ Mute ] [ Vol- ] [ Vol+ ] [ Bright- ] [ Bright+ ] [ Mission Ctrl ]
[ Screenshot ] [ Spotlight ] [ Lock ] [ Show Desktop ] [ Undo ] [ Redo ]
[EncL CW: Vol+] [EncL CCW: Vol-] [EncL Click: Mute]
[EncR CW: Bright+] [EncR CCW: Bright-] [EncR Click: Night Mode]
```

**레이어 1 — Terminal (주 사용)**

```
[ git status ] [ git pull  ] [ git push  ] [ ls -la    ] [ cd ~      ] [ TBD_cmd_6 ]
[ TBD_cmd_7  ] [ TBD_cmd_8 ] [ TBD_cmd_9 ] [ TBD_cmd10 ] [ TBD_cmd11 ] [ TBD_cmd12 ]
[EncL CW: 다음 터미널 창] [EncL CCW: 이전 터미널 창] [EncL Click: 새 탭]
[EncR CW: 스크롤 Up] [EncR CCW: 스크롤 Down] [EncR Click: clear]
```

> **TBD**: 사용자가 가장 자주 쓰는 터미널 명령어 6-12개 확정 필요.
> VIA 매크로는 문자열 시퀀스 전송. 예: `npm run dev` + Enter.

**레이어 2 — Dev (VS Code / Antigravity)**

```
[ Cmd+P      ] [ Cmd+Shift+P ] [ Cmd+`     ] [ Cmd+B     ] [ Cmd+Shift+E ] [ Cmd+Shift+F ]
[ Cmd+K Z    ] [ Ctrl+`      ] [ Cmd+W     ] [ Cmd+Shift+T ] [ F5         ] [ F12         ]
[EncL CW: 다음 파일 탭] [EncL CCW: 이전 파일 탭] [EncL Click: 닫기]
[EncR CW: 편집기 Zoom+] [EncR CCW: Zoom-] [EncR Click: Zoom 초기화]
```

**레이어 3 — Communication (KakaoTalk / Telegram)**

```
[ Cmd+K      ] [ Cmd+N      ] [ TBD       ] [ TBD       ] [ TBD       ] [ TBD       ]
[ TBD        ] [ TBD        ] [ TBD       ] [ TBD       ] [ TBD       ] [ TBD       ]
[EncL CW: 다음 채팅] [EncL CCW: 이전 채팅] [EncL Click: TBD]
[EncR CW: 스크롤 Down] [EncR CCW: 스크롤 Up] [EncR Click: TBD]
```

- **레이어 전환 키**: 기본 레이어 0. 우하단 키(키12)를 레이어 스위치 홀드로 사용.
- **출력**: `creator-micro/via-profiles/keymap.json` (usevia.app import용)
- **성공 기준**: VIA 웹앱에서 Creator Micro 연결 확인 + 각 레이어 키 동작 검증
- **검증 방법**: 레이어별 키 1개씩 눌러 macOS에서 의도한 동작 확인
- **실패 시 처리**: VIA 연결 실패 → QMK Toolbox + 펌웨어 리플래시 절차로 에스컬레이션

#### Step 4: Creator Micro input.app 우회

- **처리 주체**: 스크립트 (`scripts/via-setup.sh`) + 수동 절차
- **입력**: Creator Micro USB 연결 상태 (Micro Pad, VID:0x574c)
- **출력**: VIA 온보드 메모리에 저장된 키맵 (키보드 분리 후에도 유지)
- **처리 내용**:
  1. Chrome/Edge로 https://usevia.app 접속
  2. Connect Keyboard → Creator Micro (Micro Pad) 선택
  3. Step 3에서 생성한 `keymap.json` import
  4. 레이어별 동작 확인
- **성공 기준**: 브라우저에서 Creator Micro 연결 감지 + 키맵 저장 완료
- **검증 방법**: 키 눌러서 브라우저 Key Tester 반응 확인
- **실패 시 처리**: VIA 연결 안 될 경우 → QMK Toolbox로 펌웨어 최신화 후 재시도

#### Step 5: 자동 시작 설정

- **처리 주체**: 스크립트 (`scripts/install-launchd.sh`)
- **입력**: 빌드 완료된 Surface Dial 데몬 바이너리 경로
- **출력**: `~/Library/LaunchAgents/com.noir.surface-dial.plist` 등록 완료
- **처리 내용**: Surface Dial 데몬 launchd plist 생성 및 등록
  - `~/Library/LaunchAgents/com.noir.surface-dial.plist`
  - KeepAlive: true (크래시 자동 재시작)
  - RunAtLoad: true
- **출력**: launchd agent 등록
- **성공 기준**: 재부팅 후 데몬 자동 실행 확인
- **검증 방법**: `launchctl list | grep surface-dial`
- **실패 시 처리**: plist 문법 오류 → `plutil -lint` 검사

### 상태 전이

| 상태 | 전이 조건 | 다음 상태 |
|------|----------|----------|
| 데몬 미설치 | mac-dial 빌드 완료 | 데몬 실행 대기 |
| 데몬 실행 중 | Bluetooth 페어링 감지 | 모드 감지 활성 |
| 모드 감지 활성 | 앱 전환 이벤트 | 모드 전환 |
| VIA 미설정 | usevia.app 연결 성공 | 키맵 편집 가능 |
| 키맵 적용 완료 | 키보드 USB 분리/재연결 | 매핑 유지 (온보드 저장) |

---

## 3. 구현 스펙

### 폴더 구조

```
~/Projects/mac-input-mapper/
├── CLAUDE.md
├── surface-dial/
│   ├── mac-dial/              # git submodule (github.com/andreasjhkarlsson/mac-dial)
│   ├── daemon/
│   │   ├── main.swift         # 앱 감지 루프 + 이벤트 라우터
│   │   └── AppModeConfig.swift # 앱별 모드 로더
│   └── config.json            # 앱 번들 ID → 모드 매핑 테이블
├── creator-micro/
│   ├── via-profiles/
│   │   └── keymap.json        # usevia.app import용 키맵 (4레이어)
│   └── layer-docs/
│       ├── layer0-system.md
│       ├── layer1-terminal.md
│       ├── layer2-dev.md
│       └── layer3-comms.md
└── scripts/
    ├── install.sh             # 전체 설치 (mac-dial 빌드 + launchd 등록)
    ├── install-launchd.sh     # Surface Dial 데몬 자동 시작 등록
    ├── via-setup.sh           # VIA 설정 가이드 출력
    └── get-bundle-id.sh       # 활성 앱 번들 ID 출력 유틸
```

### CLAUDE.md 핵심 섹션 목록

- 프로젝트 개요: 두 디바이스 목적 + 아키텍처 요약
- Surface Dial 모드 테이블: 앱별 매핑 (추가/수정 기준)
- Creator Micro 레이어 규칙: 레이어 전환 키, 매크로 추가 방법
- 번들 ID 확인법: `get-bundle-id.sh` 사용 안내
- Antigravity 번들 ID: 실행 후 확인 및 기록 필요

### 에이전트 구조

**구조 선택**: 단일 에이전트 (에이전트 없음 — 완전 코드 구현)

**선택 근거**: LLM 판단이 런타임에 불필요. 입력 이벤트 → 미리 정의된 매핑 테이블 조회 → 출력. 결정론적 파이프라인.

### 스킬/스크립트 목록

| 이름 | 유형 | 역할 | 트리거 조건 |
|------|------|------|-----------|
| `scripts/install.sh` | 스크립트 | mac-dial 빌드 + hidapi + 데몬 등록 전체 자동화 | 최초 설치 시 1회 |
| `scripts/install-launchd.sh` | 스크립트 | launchd plist 생성 + `launchctl load` | install.sh 내부 호출 |
| `scripts/get-bundle-id.sh` | 스크립트 | 현재 활성 앱 번들 ID 출력 (config.json 추가 시 사용) | 수동 실행 |
| `scripts/via-setup.sh` | 스크립트 | usevia.app 접속 안내 + keymap.json 경로 출력 | Creator Micro 설정 시 |
| `surface-dial/daemon/main.swift` | 데몬 | HID 이벤트 수신 + 앱 감지 + CGEvent 발사 | launchd 자동 시작 |
| `surface-dial/config.json` | 설정 | 앱별 모드 매핑 테이블 | 데몬 시작 시 로드 |
| `creator-micro/via-profiles/keymap.json` | 설정 | VIA 4레이어 키맵 | usevia.app import |

### A-Team 표준 커맨드 규칙

> 이 설계서에 정의된 모든 커맨드는 A-Team 표준 형식으로 작성할 것.

1. 파일 위치: `.claude/commands/<name>.md` (슬래시 커맨드) 또는 `.claude/agents/<name>.md` (서브에이전트)
2. frontmatter: `description:` 1줄 — Claude Code `Skill` tool 자동 등록용
3. 배포: `bash scripts/install-commands.sh` 실행으로 `~/.claude/commands/`에 symlink
4. 대용량 참조는 `governance/skills/<name>/*.md`로 분리 → on-demand 로드
5. 자율 루프 포함 시 `governance/rules/autonomous-loop.md` 6 강제 조항 준수 명시

이 프로젝트는 Claude Code 커맨드 없음 (런타임 로직이 없으므로). `CLAUDE.md`에 매핑 수정 가이드만 포함.

### 주요 산출물 파일

| 파일 | 형식 | 생성 단계 | 용도 |
|------|------|----------|------|
| `surface-dial/config.json` | JSON | Step 2 | 앱별 모드 매핑 테이블 |
| `creator-micro/via-profiles/keymap.json` | JSON | Step 3 | VIA import용 레이어 키맵 |
| `~/Library/LaunchAgents/com.noir.surface-dial.plist` | plist | Step 5 | 데몬 자동 시작 |

---

## 4. 미결 사항 (구현 전 확인 필요)

| 항목 | 내용 | 확인 방법 |
|------|------|---------|
| Antigravity 번들 ID | 앱 실행 후 `scripts/get-bundle-id.sh` | Step 2 매핑 추가 |
| Terminal 매크로 명령어 6-12개 | 사용자가 자주 쓰는 명령어 목록 확정 | Layer 1 TBD 채우기 |
| iTerm2 vs Terminal.app | 실제 사용 앱 확인 | Surface Dial 번들 ID 적용 |
| Surface Dial Bluetooth 페어링 상태 | mac-dial 실행 후 감지 여부 확인 | Step 1 완료 조건 |
| VIA 펌웨어 버전 | Creator Micro가 VIA v2/v3 중 어느 것인지 | usevia.app 연결 시 자동 감지 |

---

## 6. 엔지니어링 검토 리포트

> 날짜: 2026-06-06

### 아키텍처 다이어그램

```
[Surface Dial BT HID]
        │  raw HID reports
        ▼
┌─────────────────────┐
│   mac-dial fork     │  (Xcode App, Menu Bar)
│  ┌───────────────┐  │
│  │  Dial.swift   │  │  ← 롱프레스 타이머 패치 필요
│  └──────┬────────┘  │
│         │ events    │
│  ┌──────▼────────┐  │
│  │AppModeCtrl    │  │  ← 신규 추가
│  │.swift         │  │    NSWorkspace observer
│  └──────┬────────┘  │
│  ┌──────▼────────┐  │
│  │config.json    │  │  ← 앱별 모드 테이블
│  └───────────────┘  │
└──────────┬──────────┘
           │ CGEvent inject (Accessibility 권한 필요)
           ▼
   [활성 앱 — Chrome/Terminal/etc.]

[Creator Micro USB HID]
        │ 온보드 QMK (VIA 설정 후 독립)
        ▼
   [macOS HID — 소프트웨어 불필요]
```

### 설계 수정 사항 (블루프린트 오류)

| 항목 | 블루프린트 | 수정 |
|------|---------|------|
| 데몬 구조 | `main.swift` 독립 프로세스 | mac-dial **포크** 내부에 AppModeController 통합 (mac-dial은 macOS App 구조) |
| 앱 감지 방식 | NSWorkspace 100ms **폴링** | `NSWorkspace.didActivateApplicationNotification` **이벤트 드리븐**으로 변경 — 배터리/CPU 절약 |
| Antigravity 번들 ID | 미확인 | `com.google.antigravity`, `com.google.antigravity-ide` 확인 완료 — config.json에 반영 |

### 테스트 커버리지 맵

```
[AppModeController]
  ├── 앱 전환 감지 → ✓ 수동 (앱 순차 활성화)
  ├── 미매핑 앱 폴백 → ✓ 수동
  ├── config.json 파싱 실패 → ✗ 에러 처리 추가 필요
  └── Accessibility 권한 없음 → ✗ 조용한 실패 → AXIsProcessTrusted() 체크 추가 필요

[Dial.swift 롱프레스]
  ├── 500ms+ 홀드 → ✓ 수동
  ├── 500ms 미만 클릭 → ✓ 수동
  └── BT 끊김 중 홀드 → ✗ 타이머 강제 취소 필요

[Creator Micro VIA]
  ├── usevia.app 연결 → ✓ Key Tester
  └── 펌웨어 불일치 → ✗ QMK Toolbox 절차로 에스컬레이션
```

### 리스크

| 리스크 | 심각도 | 대응 |
|--------|--------|------|
| mac-dial 포크 후 upstream 업데이트 추적 어려움 | 낮음 | 의존성 적고 기능 완성 후 변경 없음 |
| Accessibility 권한 없으면 CGEvent 조용히 실패 | 높음 | 시작 시 `AXIsProcessTrusted()` 체크 필수 |
| BT 페어링 유실 시 데몬 재연결 | 낮음 | mac-dial이 50ms마다 재시도 (기존 구현) |
| VIA 펌웨어 버전 불일치 | 중간 | usevia.app 연결 실패 시 QMK Toolbox 리플래시 |
| launchd plist 절대경로 하드코딩 | 낮음 | install.sh에서 `$(pwd)` 동적 삽입 |

### 구현 로드맵 (DAG)

```
T1: Creator Micro VIA 설정 ──────────────────────────────→ [30분] 즉시 시작 가능
T2: mac-dial 포크 셋업ㅤㅤ ──────┐                          [20분] 즉시 시작 가능
T3: config.json 작성ㅤㅤ ────────┤                          [20분] 즉시 시작 가능
                                 ↓
T4: AppModeController.swift ─────┤ (T2+T3 완료 후)          [2~3h] 핵심 구현
T5: Dial.swift 롱프레스 패치 ────┘ (T2 완료 후, T4 병렬)   [1h]
                                 ↓
T6: install.sh + launchd ────────┤ (T4 완료 후)             [30분]
T7: 통합 검증 스크립트 ──────────┘ (T4+T5 완료 후)         [30분]

병렬: T1 ∥ T2 ∥ T3 → T4 ∥ T5 → T6 ∥ T7
크리티컬 패스: T2 → T4 → T6 (총 ~4시간)
```

### 판정: APPROVED_WITH_CONCERNS

수정 사항 2개 (폴링→이벤트 드리븐, 독립 데몬→포크 통합) 반영 후 구현 착수 가능.
Creator Micro(T1)는 코드 없이 즉시 시작 가능.

---

## 5. 구현 순서 제안

```
Phase 1 (Creator Micro 먼저 — 빠른 성과):
  1. usevia.app으로 Creator Micro 연결 확인
  2. Layer 0 (System) 키맵 적용 + 검증
  3. Layer 1 (Terminal) 명령어 목록 확정 후 매크로 입력
  4. Layer 2/3 적용

Phase 2 (Surface Dial):
  5. mac-dial 클론 + hidapi 빌드
  6. Antigravity 번들 ID 확인
  7. config.json 작성
  8. main.swift 데몬 구현 + 테스트
  9. launchd 등록
```
