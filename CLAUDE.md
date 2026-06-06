# mac-input-mapper

Surface Dial + Work Louder Creator Micro macOS 커스텀 키 매핑 시스템.

## 구조

```
surface-dial/mac-dial/    ← mac-dial 포크 (Swift Xcode 앱)
  MacDial/
    AppModeController.swift  ← 신규: 앱별 모드 자동 전환
    StatusBarController.swift ← 수정: App Mode 메뉴 항목 추가
surface-dial/config.json  ← 앱별 매핑 테이블 (런타임 로드)
~/.mac-dial/config.json   ← 실제 로드 경로 (install.sh가 복사)
creator-micro/layer-docs/ ← VIA 레이어 설계 문서
scripts/                  ← 설치 및 유틸리티
```

## Surface Dial 앱별 동작

config.json을 수정 후 앱 재시작 시 적용. 앱 번들 ID 확인: `bash scripts/get-bundle-id.sh`

| 앱 | CW | CCW | 클릭 | 롱프레스 |
|----|-----|-----|------|---------|
| Default | Cmd+Tab (앱 전환) | Cmd+Shift+Tab | iTerm2 활성화 | 화면 잠금 |
| Chrome | Ctrl+Tab (다음 탭) | Ctrl+Shift+Tab | Cmd+T (새 탭) | 화면 잠금 |
| iTerm2 | Cmd+] (다음 패널) | Cmd+[ (이전 패널) | Ctrl+L (clear) | 화면 잠금 |
| Terminal | Ctrl+Tab | Ctrl+Shift+Tab | Ctrl+L | 화면 잠금 |
| VS Code | Ctrl+Tab | Ctrl+Shift+Tab | Cmd+P | 화면 잠금 |
| Antigravity | Ctrl+Tab | Ctrl+Shift+Tab | Cmd+P | 화면 잠금 |
| Finder | Arrow Down | Arrow Up | Enter | 화면 잠금 |
| KakaoTalk | Arrow Down | Arrow Up | Enter | 화면 잠금 |
| Telegram | Arrow Down | Arrow Up | Enter | 화면 잠금 |

**앱 추가**: `surface-dial/config.json` → `apps` 섹션에 번들 ID 추가 → `cp surface-dial/config.json ~/.mac-dial/config.json` → 앱 재시작

## Creator Micro VIA 설정

`bash scripts/via-setup.sh` — 설정 절차 안내

레이어 문서: `creator-micro/layer-docs/`
- Layer 0: 시스템 (볼륨, 밝기, 스크린샷 등)
- Layer 1: 터미널 매크로 (git status, pull, push 등)
- Layer 2: Dev (VS Code / Antigravity)
- Layer 3: Comms (KakaoTalk / Telegram)

## 빌드 (Surface Dial)

```bash
bash scripts/install.sh          # hidapi 빌드 + config 설치
open surface-dial/mac-dial/MacDial.xcodeproj  # Xcode에서 빌드
bash scripts/install-launchd.sh /path/to/MacDial.app  # 자동 시작 등록
```

## keyCode 참고

| 키 | keyCode |
|----|---------|
| Tab | 48 |
| Q | 12 |
| T | 17 |
| L | 37 |
| P | 35 |
| ] | 30 |
| [ | 33 |
| Arrow Down | 125 |
| Arrow Up | 126 |
| Enter | 36 |
