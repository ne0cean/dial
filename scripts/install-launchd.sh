#!/bin/bash
# Surface Dial 데몬 launchd 자동 시작 등록
# 사용법: bash install-launchd.sh /path/to/MacDial.app

set -e

APP_PATH="${1:-}"
if [ -z "$APP_PATH" ]; then
    echo "사용법: $0 /path/to/MacDial.app"
    exit 1
fi

BINARY="$APP_PATH/Contents/MacOS/MacDial"
if [ ! -f "$BINARY" ]; then
    echo "오류: 바이너리를 찾을 수 없음: $BINARY"
    exit 1
fi

PLIST="$HOME/Library/LaunchAgents/com.noir.surface-dial.plist"

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.noir.surface-dial</string>
    <key>ProgramArguments</key>
    <array>
        <string>$BINARY</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$HOME/.mac-dial/daemon.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/.mac-dial/daemon-error.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "launchd 등록 완료: $PLIST"
echo "상태 확인: launchctl list | grep surface-dial"
echo "로그:      tail -f ~/.mac-dial/daemon.log"
