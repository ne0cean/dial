#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$DIR/Sources"
HIDAPI_SRC="$SRC/hidapi"
SWIFT_SRC="$SRC/MacDial"
BUILD="$DIR/.build/debug"
HIDAPI_LIB="$DIR/../mac-dial/lib/hidapi/build/src/mac/libhidapi.a"

mkdir -p "$BUILD"

echo "[1/3] hidapi 라이브러리 확인..."
if [ ! -f "$HIDAPI_LIB" ]; then
    echo "hidapi 빌드 중..."
    cd "$DIR/../mac-dial/lib/hidapi"
    cmake -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -B build -DBUILD_SHARED_LIBS=false 2>/dev/null
    cmake --build build 2>/dev/null
    cd "$DIR"
fi
echo "      OK: $HIDAPI_LIB"

echo "[2/3] Swift 소스 컴파일..."
swiftc \
    -sdk "$(xcrun --show-sdk-path)" \
    -target arm64-apple-macos13.0 \
    -I "$HIDAPI_SRC/include" \
    -import-objc-header "$SRC/MacDial/MacDial-Bridging-Header.h" \
    -framework AppKit \
    -framework CoreGraphics \
    -framework ApplicationServices \
    -framework CoreFoundation \
    -framework IOKit \
    "$SWIFT_SRC/Controller.swift" \
    "$SWIFT_SRC/Dial.swift" \
    "$SWIFT_SRC/AppModeController.swift" \
    "$SWIFT_SRC/main.swift" \
    "$HIDAPI_LIB" \
    -o "$BUILD/MacDial" \
    -Onone \
    2>&1 | grep -v "^note:" | grep -v "deprecated"

echo "[3/3] 빌드 완료: $BUILD/MacDial"
echo ""
echo "실행: $BUILD/MacDial"
echo "launchd 등록: bash $DIR/../../../scripts/install-launchd.sh $BUILD/MacDial"
