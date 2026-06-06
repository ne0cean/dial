# Layer 0 — System (기본 레이어)

> 전원 연결 시 기본 활성 레이어

## 물리 레이아웃

```
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│  키 1    │  키 2    │  키 3    │  키 4    │  키 5    │  키 6    │
│  Mute    │  Vol-    │  Vol+    │ Bright-  │ Bright+  │ Mission  │
│          │          │          │          │          │ Control  │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│  키 7    │  키 8    │  키 9    │  키 10   │  키 11   │  키 12   │
│Screenshot│Spotlight │   Lock   │  Desktop │   Undo   │  Redo    │
│Cmd+Shift │ Cmd+Spc  │Ctrl+Cmd+Q│ Cmd+F3   │  Cmd+Z   │Cmd+Shft+Z│
│  +4      │          │          │          │          │          │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘

[EncL CW: Vol+]      [EncL CCW: Vol-]     [EncL Click: Mute]
[EncR CW: Bright+]   [EncR CCW: Bright-]  [EncR Click: Night Shift 토글]
```

## QMK 키코드

| 키 | QMK 코드 |
|----|----------|
| Mute | KC_MUTE |
| Vol- | KC_VOLD |
| Vol+ | KC_VOLU |
| Bright- | KC_BRID |
| Bright+ | KC_BRIU |
| Mission Control | LCTL(KC_UP) |
| Screenshot | LGUI(LSFT(KC_4)) |
| Spotlight | LGUI(KC_SPC) |
| Lock | LCTL(LGUI(KC_Q)) |
| Show Desktop | LGUI(KC_F3) |
| Undo | LGUI(KC_Z) |
| Redo | LGUI(LSFT(KC_Z)) |
