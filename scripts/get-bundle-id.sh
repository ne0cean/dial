#!/bin/bash
# 현재 활성 앱의 번들 ID 출력
# config.json에 새 앱 추가 시 사용

APP=$(osascript -e 'id of app (path to frontmost application as text)' 2>/dev/null)
if [ -n "$APP" ]; then
    echo "$APP"
    echo ""
    echo "config.json \"apps\" 섹션에 추가:"
    echo "  \"$APP\": {"
    echo "    \"rotateClockwise\":        { \"type\": \"key\", \"keyCode\": 48, \"modifiers\": [\"control\"] },"
    echo "    \"rotateCounterClockwise\": { \"type\": \"key\", \"keyCode\": 48, \"modifiers\": [\"control\", \"shift\"] },"
    echo "    \"click\":                  { \"type\": \"key\", \"keyCode\": 36, \"modifiers\": [] },"
    echo "    \"longPress\":              { \"type\": \"key\", \"keyCode\": 12, \"modifiers\": [\"command\", \"control\"] }"
    echo "  }"
else
    echo "오류: 활성 앱 감지 실패"
fi
