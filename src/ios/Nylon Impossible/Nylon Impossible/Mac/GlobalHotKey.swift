//
//  GlobalHotKey.swift
//  Nylon Impossible
//
//  The quick-add hotkey (⌃⌥Space unless changed in Settings), live in every
//  app. Built on Carbon's `RegisterEventHotKey`, the one system-wide hotkey
//  API that works inside the App Sandbox without asking for Accessibility or
//  Input Monitoring — it's what the `KeyboardShortcuts` package and Mac App
//  Store launchers use. For one hotkey that's ~100 lines here rather than a
//  third-party package (and its resources) in a Mac App Store build, and it
//  keeps the Swift package graph, which iOS shares, unchanged.
//
//  `HotKeyShortcut` is the pure part — key codes, modifiers, what Settings
//  shows, what's allowed — and is what the tests exercise. `GlobalHotKey`
//  only talks to Carbon.
//

#if os(macOS)
import AppKit
import Carbon.HIToolbox

/// A key plus modifiers, in Carbon's terms, stored in UserDefaults.
struct HotKeyShortcut: Codable, Equatable, Sendable {
    struct Modifiers: OptionSet, Codable, Hashable, Sendable {
        let rawValue: Int
        static let control = Modifiers(rawValue: 1 << 0)
        static let option = Modifiers(rawValue: 1 << 1)
        static let shift = Modifiers(rawValue: 1 << 2)
        static let command = Modifiers(rawValue: 1 << 3)
    }

    /// A Carbon virtual key code (`kVK_…`).
    var keyCode: UInt32
    var modifiers: Modifiers

    /// ⌃⌥Space: free by default on macOS (Spotlight is ⌘Space, input sources
    /// ⌃Space), and close to the launcher habit.
    static let quickAddDefault = HotKeyShortcut(keyCode: UInt32(kVK_Space), modifiers: [.control, .option])

    /// The modifier mask `RegisterEventHotKey` takes.
    var carbonModifiers: UInt32 {
        var mask = 0
        if modifiers.contains(.control) { mask |= controlKey }
        if modifiers.contains(.option) { mask |= optionKey }
        if modifiers.contains(.shift) { mask |= shiftKey }
        if modifiers.contains(.command) { mask |= cmdKey }
        return UInt32(mask)
    }

    /// A hotkey needs ⌃, ⌥ or ⌘: a bare key, or one with only ⇧, would fire
    /// while typing in every other app.
    var isValid: Bool {
        !modifiers.isDisjoint(with: [.control, .option, .command])
    }

    /// "⌃⌥Space", in the order the menu bar draws modifiers.
    var displayString: String {
        var text = ""
        if modifiers.contains(.control) { text += "⌃" }
        if modifiers.contains(.option) { text += "⌥" }
        if modifiers.contains(.shift) { text += "⇧" }
        if modifiers.contains(.command) { text += "⌘" }
        return text + Self.keyName(keyCode)
    }

    /// From a key press in the Settings recorder.
    init(keyCode: UInt32, modifierFlags: NSEvent.ModifierFlags) {
        self.keyCode = keyCode
        var modifiers: Modifiers = []
        if modifierFlags.contains(.control) { modifiers.insert(.control) }
        if modifierFlags.contains(.option) { modifiers.insert(.option) }
        if modifierFlags.contains(.shift) { modifiers.insert(.shift) }
        if modifierFlags.contains(.command) { modifiers.insert(.command) }
        self.modifiers = modifiers
    }

    init(keyCode: UInt32, modifiers: Modifiers) {
        self.keyCode = keyCode
        self.modifiers = modifiers
    }

    /// The key's name as a menu shows it. Positions follow the ANSI layout,
    /// which is what Carbon's key codes describe.
    static func keyName(_ keyCode: UInt32) -> String {
        let code = Int(keyCode)
        if let name = specialKeys[code] { return name }
        if let letter = letters[code] { return letter }
        return "Key \(code)"
    }

    private static let specialKeys: [Int: String] = [
        kVK_Space: "Space", kVK_Return: "↩", kVK_Tab: "⇥", kVK_Escape: "⎋",
        kVK_Delete: "⌫", kVK_ForwardDelete: "⌦",
        kVK_LeftArrow: "←", kVK_RightArrow: "→", kVK_UpArrow: "↑", kVK_DownArrow: "↓",
        kVK_F1: "F1", kVK_F2: "F2", kVK_F3: "F3", kVK_F4: "F4", kVK_F5: "F5", kVK_F6: "F6",
        kVK_F7: "F7", kVK_F8: "F8", kVK_F9: "F9", kVK_F10: "F10", kVK_F11: "F11", kVK_F12: "F12"
    ]

    private static let letters: [Int: String] = [
        kVK_ANSI_A: "A", kVK_ANSI_B: "B", kVK_ANSI_C: "C", kVK_ANSI_D: "D", kVK_ANSI_E: "E",
        kVK_ANSI_F: "F", kVK_ANSI_G: "G", kVK_ANSI_H: "H", kVK_ANSI_I: "I", kVK_ANSI_J: "J",
        kVK_ANSI_K: "K", kVK_ANSI_L: "L", kVK_ANSI_M: "M", kVK_ANSI_N: "N", kVK_ANSI_O: "O",
        kVK_ANSI_P: "P", kVK_ANSI_Q: "Q", kVK_ANSI_R: "R", kVK_ANSI_S: "S", kVK_ANSI_T: "T",
        kVK_ANSI_U: "U", kVK_ANSI_V: "V", kVK_ANSI_W: "W", kVK_ANSI_X: "X", kVK_ANSI_Y: "Y",
        kVK_ANSI_Z: "Z",
        kVK_ANSI_0: "0", kVK_ANSI_1: "1", kVK_ANSI_2: "2", kVK_ANSI_3: "3", kVK_ANSI_4: "4",
        kVK_ANSI_5: "5", kVK_ANSI_6: "6", kVK_ANSI_7: "7", kVK_ANSI_8: "8", kVK_ANSI_9: "9",
        kVK_ANSI_Minus: "-", kVK_ANSI_Equal: "=", kVK_ANSI_Comma: ",", kVK_ANSI_Period: ".",
        kVK_ANSI_Slash: "/", kVK_ANSI_Semicolon: ";", kVK_ANSI_Quote: "'", kVK_ANSI_Grave: "`",
        kVK_ANSI_LeftBracket: "[", kVK_ANSI_RightBracket: "]", kVK_ANSI_Backslash: "\\"
    ]
}

/// One registered system-wide hotkey. Unregisters itself when released.
@MainActor
final class GlobalHotKey {
    let shortcut: HotKeyShortcut
    private let action: () -> Void
    private var reference: EventHotKeyRef?
    private let id: UInt32

    /// Four-char signature for our hotkeys: 'NYLN'.
    private static let signature: OSType = 0x4E59_4C4E
    private static var nextId: UInt32 = 1
    private static var actions: [UInt32: () -> Void] = [:]
    private static var handler: EventHandlerRef?

    init(shortcut: HotKeyShortcut, action: @escaping () -> Void) {
        self.shortcut = shortcut
        self.action = action
        id = Self.nextId
        Self.nextId += 1
    }

    /// False when the shortcut isn't valid or another app already owns it.
    @discardableResult
    func register() -> Bool {
        guard reference == nil else { return true }
        guard shortcut.isValid, Self.installHandler() else { return false }
        var ref: EventHotKeyRef?
        let status = RegisterEventHotKey(
            shortcut.keyCode,
            shortcut.carbonModifiers,
            EventHotKeyID(signature: Self.signature, id: id),
            GetEventDispatcherTarget(),
            0,
            &ref
        )
        guard status == noErr, let ref else { return false }
        reference = ref
        Self.actions[id] = action
        return true
    }

    func unregister() {
        if let reference {
            UnregisterEventHotKey(reference)
        }
        reference = nil
        Self.actions[id] = nil
    }

    var isRegistered: Bool { reference != nil }

    /// Fired from Carbon on the main thread.
    fileprivate static func fire(_ id: UInt32) {
        actions[id]?()
    }

    private static func installHandler() -> Bool {
        guard handler == nil else { return true }
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let status = InstallEventHandler(GetEventDispatcherTarget(), hotKeyCallback, 1, &spec, nil, &handler)
        return status == noErr
    }
}

/// Carbon's C callback. Hotkey events arrive on the main thread's event loop.
nonisolated private func hotKeyCallback(_ next: EventHandlerCallRef?, _ event: EventRef?, _ userData: UnsafeMutableRawPointer?) -> OSStatus {
    guard let event else { return OSStatus(eventNotHandledErr) }
    var hotKeyId = EventHotKeyID()
    let status = GetEventParameter(
        event,
        EventParamName(kEventParamDirectObject),
        EventParamType(typeEventHotKeyID),
        nil,
        MemoryLayout<EventHotKeyID>.size,
        nil,
        &hotKeyId
    )
    guard status == noErr else { return status }
    let id = hotKeyId.id
    MainActor.assumeIsolated {
        GlobalHotKey.fire(id)
    }
    return noErr
}
#endif
