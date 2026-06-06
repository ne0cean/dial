# Layer 1 — Terminal (주 사용 레이어)

> VIA에서 레이어 전환: 키12 홀드 → Layer 1 선택

## 물리 레이아웃

```
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│  키 1    │  키 2    │  키 3    │  키 4    │  키 5    │  키 6    │
│git status│ git pull │ git push │  ls -la  │  cd ~    │  claude  │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│  키 7    │  키 8    │  키 9    │  키 10   │  키 11   │  키 12   │
│docker ps │npm run   │docker    │docker    │ open .   │ Layer↑   │
│          │  dev     │compose   │compose   │(Finder)  │          │
│          │          │  up -d   │  down    │          │          │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘

[EncL CW: 다음 탭/창]  [EncL CCW: 이전 탭/창]  [EncL Click: 새 탭]
[EncR CW: 스크롤 Up]   [EncR CCW: 스크롤 Down] [EncR Click: clear]
```

## 키 매핑 (VIA Macro)

| 키 | 명령어 | VIA Type |
|----|--------|----------|
| 1 | `git status` + Enter | Macro |
| 2 | `git pull` + Enter | Macro |
| 3 | `git push` + Enter | Macro |
| 4 | `ls -la` + Enter | Macro |
| 5 | `cd ~` + Enter | Macro |
| 6 | `claude` + Enter | Macro |
| 7 | `docker ps` + Enter | Macro |
| 8 | `npm run dev` + Enter | Macro |
| 9 | `docker compose up -d` + Enter | Macro |
| 10 | `docker compose down` + Enter | Macro |
| 11 | `open .` + Enter | Macro |
| 12 | Layer 스위치 (홀드) | MO(0) |

## 로터리 엔코더 매핑

| 엔코더 | CW | CCW | 클릭 |
|--------|-----|-----|------|
| 왼쪽 | 다음 탭 (Ctrl+Tab) | 이전 탭 (Ctrl+Shift+Tab) | 새 탭 (Cmd+T) |
| 오른쪽 | 스크롤 Up (Page Up) | 스크롤 Down (Page Down) | Clear (Ctrl+L) |
