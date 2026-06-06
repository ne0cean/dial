# Dial Visual Editor — 에이전트 시스템 설계서

> 작성일: 2026-06-07
> 목적: Claude Code 구현 참조용 계획서

---

## 1. 작업 컨텍스트

### 배경 및 목적

Surface Dial과 Work Louder Creator Micro 두 입력 디바이스를 macOS에서 시각적으로 설정하기 위한 로컬 웹 에디터 구축. usevia.app(키보드만, 브라우저 WebHID 기반)을 대체하여:

1. **Surface Dial**까지 한 화면에서 설정 — 앱별 회전/클릭/롱프레스 동작 편집
2. **Creator Micro** 4레이어 키맵 + 로터리 엔코더 시각적 편집
3. **Claude Code와 대화**하며 키 커스텀 — MCP 서버가 Claude Code ↔ 웹앱 설정 파일 브릿지

### 범위

- 포함:
  - 로컬 Express 서버 (`web/`) — 설정 읽기/쓰기 REST API
  - Surface Dial 비주얼 에디터 — CW/CCW/Click/LongPress, 앱별 오버라이드
  - Creator Micro 비주얼 에디터 — 12키 그리드, EncL/EncR, 4레이어 탭
  - MCP 서버 (`mcp/`) — Claude Code에서 `dial_set` / `keyboard_set_key` / `macro_set` 직접 호출
  - Surface Dial 데몬 재시작 — config 저장 시 launchd kickstart 자동
- 제외:
  - WebHID 직접 통신 (브라우저에서 키보드 EEPROM 직접 쓰기) — usevia.app에 위임
  - Figma 전용 매핑
  - Windows 환경

### 입출력 정의

| 항목 | 내용 |
|------|------|
| **입력 — 웹 UI** | 사용자 클릭 (키/이벤트 선택) + 폼 입력 (keyCode, 매크로 텍스트, 앱 번들 ID) |
| **입력 — Claude Code** | 자연어 지시 ("키 3을 git commit -am으로 바꿔줘") |
| **출력 — Dial** | `~/.mac-dial/config.json` 갱신 + 데몬 자동 재시작 |
| **출력 — Creator Micro** | `creator-micro/via-profiles/keymap.json` 갱신 (usevia.app import용) |
| **트리거** | 웹 UI Save & Apply 버튼 클릭 / Claude Code MCP 툴 호출 |

### 제약조건

- 로컬 전용 (`localhost:3333`) — 외부 노출 없음
- Creator Micro 매크로: VIA 프로토콜 제약 → 키코드 시퀀스만 가능, 쉘 명령어 직접 실행 불가
- Surface Dial 데몬 재시작: `launchctl kickstart` — launchd 등록 전엔 데몬 없이 config만 저장
- WebHID API: Chrome/Edge 전용, Safari 미지원 — usevia.app 직접 import로 Creator Micro EEPROM 쓰기
- MCP 서버: Claude Code settings에 등록 필요 (`mcpServers` 섹션)

### 용어 정의

| 용어 | 정의 |
|------|------|
| HID | Human Interface Device — USB/BT 입력장치 프로토콜 |
| VIA | QMK 키보드 키맵 GUI 설정 도구 (usevia.app, 브라우저 기반) |
| Layer | VIA/QMK 키맵 레이어. Creator Micro 4레이어 지원 |
| Encoder | Creator Micro 좌/우 로터리 다이얼 (CW/CCW/Click) |
| config.json | `~/.mac-dial/config.json` — Surface Dial 데몬이 런타임에 로드하는 앱별 매핑 |
| keymap.json | `creator-micro/via-profiles/keymap.json` — VIA import용 4레이어 키맵 |
| MCP | Model Context Protocol — Claude Code가 외부 툴을 호출하는 표준 |
| 번들 ID | macOS 앱 고유 식별자 (예: `com.google.Chrome`) |

---

## 2. 워크플로우 정의

### 전체 흐름도

```
[웹 브라우저 localhost:3333]
        │ GET /api/dial, /api/keymap
        ▼
┌─────────────────────────────────────────┐
│  Express 서버 (web/server.js)           │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ /api/dial   │  │ /api/keymap      │  │
│  │ R/W config  │  │ R/W keymap.json  │  │
│  └──────┬──────┘  └────────┬─────────┘  │
│         │                  │            │
│  ┌──────▼──────────────────▼─────────┐  │
│  │ static public/ (index.html, app.js) │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
        │ POST /api/dial (저장 시)
        ▼
~/.mac-dial/config.json 갱신
        │
        ▼
launchctl kickstart → Surface Dial 데몬 재시작

[Claude Code] ←→ MCP 서버 (mcp/index.js)
        │ dial_set / keyboard_set_key / macro_set
        ▼
같은 config.json / keymap.json 직접 수정
```

### LLM 판단 vs 코드 처리 구분

| LLM이 직접 수행 | 스크립트로 처리 |
|----------------|----------------|
| 자연어 지시 → 키코드/번들 ID 변환 ("git push" → 매크로 텍스트 `git push\n`) | config.json 읽기/쓰기 (Express REST API) |
| 앱별 최적 단축키 제안 ("Chrome에서 회전은 Ctrl+Tab이 적합") | keymap.json 구조 생성 및 갱신 |
| 레이어 구조 설계 조언 (Layer 0~3 역할 분리 권고) | 데몬 재시작 (launchctl kickstart) |
| 충돌 감지 ("Layer 1 키12는 Layer Switch 예약, 다른 키 써야 함") | 실행 중 앱 목록 수집 (osascript) |

### 단계별 상세

#### Step 1: 웹 UI 로드

- **처리 주체**: 브라우저 + Express 서버
- **입력**: `localhost:3333` 접속
- **처리 내용**: `GET /api/dial`, `GET /api/keymap` 동시 호출 → UI 렌더링
- **출력**: Surface Dial 패널 (앱별 4 이벤트) + Creator Micro 패널 (4레이어, 12키, 인코더)
- **성공 기준**: 양쪽 패널 데이터 표시, 기존 설정값 반영
- **검증 방법**: 브라우저 콘솔 에러 없음, 기존 config.json 값이 UI에 표시됨
- **실패 시 처리**: API 404 → 빈 기본값으로 렌더링, 경고 배너 표시

#### Step 2: 요소 선택 및 편집 (웹 UI)

- **처리 주체**: 브라우저 (app.js)
- **입력**: 사용자 클릭 (다이얼 이벤트 / 키 / 엔코더)
- **처리 내용**: 오른쪽 슬라이드 편집 패널 열림 → keyCode/modifiers(dial) 또는 매크로 텍스트/QMK keycode(키보드) 입력
- **출력**: 인메모리 state 갱신 (저장 전)
- **성공 기준**: 편집 패널이 현재 설정값으로 초기화, 수정 후 프리뷰 텍스트 즉시 갱신
- **검증 방법**: 편집 → 적용 → UI 프리뷰 텍스트 변경 확인
- **실패 시 처리**: 잘못된 keyCode (문자열 등) → input validation으로 숫자 강제

#### Step 3: Save & Apply (웹 UI)

- **처리 주체**: Express 서버
- **입력**: `POST /api/dial` (dialConfig JSON), `POST /api/keymap` (keymapConfig JSON)
- **처리 내용**: config.json 파일 쓰기 → daemonRestart() → launchctl kickstart
- **출력**: `{ ok: true }` 응답 → UI 상태 표시
- **성공 기준**: 파일 수정 시각 갱신, 데몬 재시작 완료 (또는 "데몬 미등록" graceful skip)
- **검증 방법**: `cat ~/.mac-dial/config.json` 변경 확인, `launchctl list | grep surface-dial`
- **실패 시 처리**: 파일 쓰기 실패 → 500 + 에러 메시지 배너. 데몬 재시작 실패 → 무시 + "config 저장됨, 데몬 수동 재시작 필요" 표시

#### Step 4: Claude Code 대화 기반 커스텀 (MCP)

- **처리 주체**: Claude Code + MCP 서버 (mcp/index.js)
- **입력**: 사용자 자연어 지시 ("Layer 1 키 6을 claude 명령으로 바꿔줘")
- **처리 내용**:
  1. `dial_get` 또는 `keyboard_get_key`로 현재 상태 확인
  2. Claude Code가 적절한 keycode/매크로 결정
  3. `dial_set` / `keyboard_set_key` / `macro_set` 호출 → 파일 갱신
- **출력**: config.json 또는 keymap.json 갱신 + 데몬 재시작
- **성공 기준**: MCP 툴 호출 성공, 파일 변경 확인
- **검증 방법**: `dial_get` 재호출로 변경 확인, 웹 UI 새로고침 후 반영 확인
- **실패 시 처리**: MCP 연결 실패 → Claude Code settings 등록 확인 안내. keycode 불명확 → Claude Code가 CLAUDE.md keyCode 참조표 조회

### 상태 전이

| 상태 | 전이 조건 | 다음 상태 |
|------|----------|----------|
| 서버 미실행 | `node server.js` 실행 | 대기 중 |
| 대기 중 | 브라우저 접속 | UI 로드됨 |
| UI 로드됨 | 요소 클릭 | 편집 중 |
| 편집 중 | 적용 버튼 | 인메모리 갱신됨 |
| 인메모리 갱신됨 | Save & Apply | 파일 저장됨 + 데몬 재시작됨 |
| 파일 저장됨 | Claude Code `dial_get` | MCP 동기화됨 |

---

## 3. 구현 스펙

### 폴더 구조

```
~/Projects/dial/
├── CLAUDE.md                         # 키코드 참조표, 앱 매핑 수정 가이드
├── web/
│   ├── package.json                  # express 의존성
│   ├── server.js                     # REST API + static serve (포트 3333)
│   └── public/
│       ├── index.html                # 메인 UI (Surface Dial + Creator Micro)
│       ├── app.js                    # 프론트엔드 상태 관리 + 편집 로직
│       └── style.css                 # 다크 테마 스타일
├── mcp/
│   ├── index.js                      # MCP 서버 진입점 (8개 툴 등록)
│   ├── dial.js                       # dial_get / dial_set / dial_remove_app
│   ├── keyboard.js                   # keyboard_get_key / keyboard_set_key / macro_*
│   └── package.json                  # @modelcontextprotocol/sdk, node-hid
├── surface-dial/
│   ├── spm/                          # Swift 데몬 (build.sh로 빌드)
│   └── config.json                   # 기본 앱 매핑 (install.sh가 ~/.mac-dial/에 복사)
├── creator-micro/
│   ├── via-profiles/keymap.json      # VIA import용 4레이어 키맵 (웹앱이 관리)
│   └── layer-docs/                   # 레이어별 설명 문서
└── scripts/
    ├── install.sh                    # 전체 설치 (hidapi 빌드 + config 복사)
    ├── install-launchd.sh            # 데몬 launchd 등록
    ├── get-bundle-id.sh              # 활성 앱 번들 ID 확인 유틸
    └── via-setup.sh                  # usevia.app 연결 가이드 출력
```

### CLAUDE.md 핵심 섹션 목록

- **keyCode 참조표**: macOS Virtual Key Code 숫자 ↔ 키 이름 매핑 (Claude Code가 MCP 호출 시 참조)
- **Surface Dial 앱별 동작표**: 현재 등록된 앱 목록 + 이벤트별 동작
- **Creator Micro 레이어 요약**: 레이어 0-3 역할, Layer Switch 키(키12) 규칙
- **매핑 수정 가이드**: `dial_set` MCP 툴 사용법, 웹 UI vs MCP 선택 기준
- **빌드 방법**: `bash surface-dial/spm/build.sh` → `scripts/install-launchd.sh`

### 에이전트 구조

**구조 선택**: 단일 에이전트 (Claude Code 단독, MCP 서버는 툴 레이어)

**선택 근거**: 런타임 LLM 판단이 불필요한 결정론적 파이프라인. 자연어 → 설정값 변환은 Claude Code 대화 턴에서 처리, 파일 I/O는 MCP 툴이 결정론적으로 처리. 역할 분리 명확 → 멀티 에이전트 불필요.

#### 메인 에이전트 (Claude Code, CLAUDE.md)
- **역할**: 사용자 지시 해석 → 적절한 MCP 툴 선택 및 호출 → 결과 확인 및 보고
- **담당 단계**: Step 4 전체 (자연어 → keycode 변환 → MCP 호출 → 검증)

### 스킬/스크립트 목록

| 이름 | 유형 | 역할 | 트리거 조건 |
|------|------|------|-----------|
| `web/server.js` | 서버 | REST API + 정적 파일 서빙 (포트 3333) | `node server.js` 수동 실행 |
| `mcp/index.js` | MCP 서버 | Claude Code ↔ 설정 파일 브릿지 (8개 툴) | Claude Code settings에서 자동 시작 |
| `mcp/dial.js` | 모듈 | dial_get / dial_set / dial_remove_app | MCP 서버 내부 호출 |
| `mcp/keyboard.js` | 모듈 | keyboard_get_key / keyboard_set_key / macro_* | MCP 서버 내부 호출 |
| `scripts/install.sh` | 스크립트 | hidapi 빌드 + config.json → ~/.mac-dial/ 복사 | 최초 설치 1회 |
| `scripts/install-launchd.sh` | 스크립트 | Surface Dial 데몬 launchd 등록 | MacDial.app 빌드 완료 후 |
| `scripts/get-bundle-id.sh` | 스크립트 | 현재 활성 앱 번들 ID 출력 | 새 앱 매핑 추가 시 수동 실행 |
| `surface-dial/spm/build.sh` | 스크립트 | Swift 데몬 빌드 (swiftc 직접 호출, SPM 우회) | 데몬 코드 수정 시 |

### A-Team 표준 커맨드 규칙

> 이 설계서에 정의된 모든 커맨드는 A-Team 표준 형식으로 작성할 것.

1. 파일 위치: `.claude/commands/<name>.md` (슬래시 커맨드) 또는 `.claude/agents/<name>.md` (서브에이전트)
2. frontmatter: `description:` 1줄 — Claude Code `Skill` tool 자동 등록용
3. 배포: `bash scripts/install-commands.sh` 실행으로 `~/.claude/commands/`에 symlink
4. 대용량 참조는 `governance/skills/<name>/*.md`로 분리 → on-demand 로드
5. 자율 루프 포함 시 `governance/rules/autonomous-loop.md` 6 강제 조항 준수 명시

이 프로젝트는 Claude Code 슬래시 커맨드 없음 (런타임 자율 루프 없는 대화형 MCP 패턴).
커맨드 대신 CLAUDE.md에 MCP 툴 사용 가이드 + keyCode 참조표 포함.

### 주요 산출물 파일

| 파일 | 형식 | 생성 단계 | 용도 |
|------|------|----------|------|
| `~/.mac-dial/config.json` | JSON | Step 3 (Save) / Step 4 (MCP) | Surface Dial 데몬 런타임 로드 |
| `creator-micro/via-profiles/keymap.json` | JSON | Step 3 (Save) / Step 4 (MCP) | usevia.app import용 레이어 키맵 |
| `surface-dial/spm/.build/debug/MacDial` | Binary | build.sh | Surface Dial 데몬 실행 바이너리 |
| `~/Library/LaunchAgents/com.noir.surface-dial.plist` | plist | install-launchd.sh | 데몬 자동 시작 등록 |

---

## 4. 미결 사항

| 항목 | 내용 | 해결 방법 |
|------|------|---------|
| MCP 서버 Claude Code 등록 | `~/.claude/settings.json` mcpServers에 dial-mcp 등록 필요 | `update-config` 스킬로 등록 |
| Creator Micro keymap.json 초기화 | layer-docs 문서 내용을 keymap.json에 반영 미완 | 웹 UI에서 수동 입력 또는 마이그레이션 스크립트 |
| Surface Dial 데몬 launchd 등록 | build.sh 완료 후 install-launchd.sh 미실행 | `bash scripts/install-launchd.sh .build/debug/MacDial` |
| usevia.app ↔ keymap.json 동기화 | 웹앱 저장 후 usevia.app import 수동 필요 | 작업 흐름 문서화 (자동화 불가 — WebHID 브라우저 전용) |
