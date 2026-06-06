import AppKit

// NSApplication 인스턴스 생성 (이벤트 루프 및 NSWorkspace 사용에 필요)
let app = NSApplication.shared
app.setActivationPolicy(.accessory)  // Dock 아이콘 없음, 메뉴바 앱도 아님

// AXIsProcessTrusted 체크 - CGEvent inject 필수
if !AXIsProcessTrusted() {
    let opts = [kAXTrustedCheckOptionPrompt.takeRetainedValue() as String: true] as CFDictionary
    AXIsProcessTrustedWithOptions(opts)
    print("[MacDial] Accessibility 권한을 허용하고 재시작하세요.")
    print("[MacDial] System Settings > Privacy & Security > Accessibility")
}

// Dial + AppModeController 초기화
let dial = Dial()
let controller = AppModeController()

// Dial 이벤트 → AppModeController 라우팅
dial.onButtonStateChanged = { state in
    switch state {
    case .pressed:  controller.onDown()
    case .released: controller.onUp()
    }
}

dial.onRotation = { rotation, scrollDir in
    controller.onRotate(rotation, scrollDir)
}

dial.start()

print("[MacDial] 시작됨. Surface Dial 연결 대기 중...")
print("[MacDial] config: ~/.mac-dial/config.json")
print("[MacDial] 종료: Ctrl+C")

// 이벤트 루프 실행
app.run()
