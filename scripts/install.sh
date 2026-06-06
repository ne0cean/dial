#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MAC_DIAL_DIR="$PROJECT_DIR/surface-dial/mac-dial"
CONFIG_SRC="$PROJECT_DIR/surface-dial/config.json"

echo "=== Mac Input Mapper 설치 ==="

# 1. hidapi 서브모듈 + 빌드
echo "[1/4] hidapi 서브모듈 초기화..."
cd "$MAC_DIAL_DIR"
git submodule update --init --recursive
bash build_hidapi.sh

# 2. 설정 파일 설치
echo "[2/4] config.json 설치..."
mkdir -p ~/.mac-dial
cp "$CONFIG_SRC" ~/.mac-dial/config.json
echo "      → ~/.mac-dial/config.json"

# 3. Xcode 빌드 안내
echo "[3/4] Xcode 빌드 필요:"
echo "      open $MAC_DIAL_DIR/MacDial.xcodeproj"
echo "      Product > Build (Cmd+B)"
echo "      Product > Archive 또는 직접 실행"
echo ""
echo "      빌드 후 앱 경로를 확인하여 install-launchd.sh 실행:"
echo "      bash $PROJECT_DIR/scripts/install-launchd.sh /path/to/MacDial.app"

# 4. Creator Micro 안내
echo "[4/4] Creator Micro VIA 설정:"
bash "$PROJECT_DIR/scripts/via-setup.sh"

echo ""
echo "=== 완료 ==="
