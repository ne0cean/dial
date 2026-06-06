import Foundation
import AppKit

// MARK: - Action Types

struct DialAction {
    enum Kind {
        case key(keyCode: CGKeyCode, flags: CGEventFlags)
        case activateApp(bundleId: String)
        case none
    }
    let kind: Kind
}

struct AppModeDef {
    var rotateCW:  DialAction
    var rotateCCW: DialAction
    var click:     DialAction
    var longPress: DialAction
}

// MARK: - Config Parsing

private func parseFlags(_ mods: [String]) -> CGEventFlags {
    var f: CGEventFlags = []
    for m in mods {
        switch m {
        case "command":          f.insert(.maskCommand)
        case "shift":            f.insert(.maskShift)
        case "control":          f.insert(.maskControl)
        case "option", "alt":   f.insert(.maskAlternate)
        default: break
        }
    }
    return f
}

private func parseAction(_ d: [String: Any]) -> DialAction {
    switch d["type"] as? String {
    case "key":
        guard let kc = d["keyCode"] as? Int else { return DialAction(kind: .none) }
        let flags = parseFlags(d["modifiers"] as? [String] ?? [])
        return DialAction(kind: .key(keyCode: CGKeyCode(kc), flags: flags))
    case "activate":
        guard let bid = d["bundleId"] as? String else { return DialAction(kind: .none) }
        return DialAction(kind: .activateApp(bundleId: bid))
    default:
        return DialAction(kind: .none)
    }
}

private func parseModeDef(_ d: [String: Any]) -> AppModeDef {
    AppModeDef(
        rotateCW:  parseAction(d["rotateClockwise"]        as? [String: Any] ?? [:]),
        rotateCCW: parseAction(d["rotateCounterClockwise"] as? [String: Any] ?? [:]),
        click:     parseAction(d["click"]                  as? [String: Any] ?? [:]),
        longPress: parseAction(d["longPress"]              as? [String: Any] ?? [:])
    )
}

// MARK: - DialConfig

struct DialConfig {
    var defaultMode: AppModeDef
    var appModes: [String: AppModeDef]

    func mode(for bundleId: String) -> AppModeDef {
        appModes[bundleId] ?? defaultMode
    }

    init() {
        // Fallback defaults if config.json is missing
        let lock     = DialAction(kind: .key(keyCode: 12,  flags: [.maskCommand, .maskControl]))
        let tabCW    = DialAction(kind: .key(keyCode: 48,  flags: .maskCommand))
        let tabCCW   = DialAction(kind: .key(keyCode: 48,  flags: [.maskCommand, .maskShift]))
        let terminal = DialAction(kind: .activateApp(bundleId: "com.googlecode.iterm2"))
        defaultMode = AppModeDef(rotateCW: tabCW, rotateCCW: tabCCW, click: terminal, longPress: lock)
        appModes = [:]
    }

    init(from url: URL) {
        self.init()
        guard let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            NSLog("[AppMode] Config not found at %@, using defaults", url.path)
            return
        }
        if let def = json["default"] as? [String: Any] {
            defaultMode = parseModeDef(def)
        }
        if let apps = json["apps"] as? [String: [String: Any]] {
            apps.forEach { appModes[$0] = parseModeDef($1) }
        }
        NSLog("[AppMode] Loaded %d app overrides from %@", appModes.count, url.path)
    }
}

// MARK: - AppModeController

class AppModeController: Controller {

    private let config: DialConfig
    private let longPressThreshold: TimeInterval = 0.5
    private var buttonDownTime: Date?

    // Sticky Cmd state for app-switcher cycling
    private var switcherOpen = false
    private var switcherTimer: DispatchWorkItem?
    private let switcherTimeout: TimeInterval = 1.5

    init() {
        let url = URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent(".mac-dial/config.json")
        config = DialConfig(from: url)
    }

    // MARK: Controller Protocol

    func onDown() {
        buttonDownTime = Date()
    }

    func onUp() {
        guard let t = buttonDownTime else { return }
        let elapsed = Date().timeIntervalSince(t)
        buttonDownTime = nil

        let bundleId = NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? ""

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let action = elapsed >= self.longPressThreshold
                ? self.config.defaultMode.longPress
                : self.config.mode(for: bundleId).click
            self.perform(action)
        }
    }

    func onRotate(_ rotation: Dial.Rotation, _ scrollDirection: Int) {
        let bundleId = NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? ""
        let mode = config.mode(for: bundleId)

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            switch rotation {
            case .Clockwise:
                self.handleRotate(action: mode.rotateCW, forward: true)
            case .CounterClockwise:
                self.handleRotate(action: mode.rotateCCW, forward: false)
            }
        }
    }

    // MARK: - Rotation Handling

    private func isAppSwitcherAction(_ action: DialAction) -> Bool {
        // Detect Cmd+Tab / Cmd+Shift+Tab pattern → use sticky Cmd
        if case .key(let kc, let flags) = action.kind {
            return kc == 48 && flags.contains(.maskCommand) && !flags.contains(.maskControl)
        }
        return false
    }

    private func handleRotate(action: DialAction, forward: Bool) {
        if isAppSwitcherAction(action) {
            sendSwitcherStep(forward: forward)
        } else {
            perform(action)
        }
    }

    // Sticky Cmd+Tab cycling so the app-switcher overlay stays open
    private func sendSwitcherStep(forward: Bool) {
        let src = CGEventSource(stateID: .hidSystemState)

        switcherTimer?.cancel()

        if !switcherOpen {
            // Press Cmd down to open switcher
            let cmdDown = CGEvent(keyboardEventSource: src, virtualKey: 55, keyDown: true)
            cmdDown?.flags = .maskCommand
            cmdDown?.post(tap: .cghidEventTap)
            switcherOpen = true
        }

        let flags: CGEventFlags = forward ? .maskCommand : [.maskCommand, .maskShift]
        sendRawKey(keyCode: 48, flags: flags, src: src)

        // Release Cmd after timeout (user stopped rotating)
        let timer = DispatchWorkItem { [weak self] in
            guard let self, self.switcherOpen else { return }
            let src2 = CGEventSource(stateID: .hidSystemState)
            let cmdUp = CGEvent(keyboardEventSource: src2, virtualKey: 55, keyDown: false)
            cmdUp?.flags = []
            cmdUp?.post(tap: .cghidEventTap)
            self.switcherOpen = false
        }
        switcherTimer = timer
        DispatchQueue.main.asyncAfter(deadline: .now() + switcherTimeout, execute: timer)
    }

    // MARK: - Action Dispatch

    private func perform(_ action: DialAction) {
        switch action.kind {
        case .key(let kc, let flags):
            sendRawKey(keyCode: kc, flags: flags, src: CGEventSource(stateID: .hidSystemState))
        case .activateApp(let bundleId):
            activateApp(bundleId)
        case .none:
            break
        }
    }

    private func sendRawKey(keyCode: CGKeyCode, flags: CGEventFlags, src: CGEventSource?) {
        let down = CGEvent(keyboardEventSource: src, virtualKey: keyCode, keyDown: true)
        down?.flags = flags
        down?.post(tap: .cghidEventTap)

        let up = CGEvent(keyboardEventSource: src, virtualKey: keyCode, keyDown: false)
        up?.flags = flags
        up?.post(tap: .cghidEventTap)
    }

    private func activateApp(_ bundleId: String) {
        if let app = NSWorkspace.shared.runningApplications
            .first(where: { $0.bundleIdentifier == bundleId }) {
            app.activate(options: [.activateIgnoringOtherApps])
        } else if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId) {
            NSWorkspace.shared.open(url)
        }
    }
}
