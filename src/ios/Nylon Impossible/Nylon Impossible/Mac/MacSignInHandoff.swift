//
//  MacSignInHandoff.swift
//  Nylon Impossible
//
//  What `MacSignInView` knows about the browser a sign-in went to, and when to
//  offer a way out if nothing seems to have happened.
//
//  On macOS, `ASWebAuthenticationSession` (which ClerkKit's
//  `signInWithOAuth` runs) is handed to the default browser when that
//  browser declares `ASWebAuthenticationSessionWebBrowserSupportCapabilities`
//  — Chrome does. With Chrome as the default, the handoff sometimes never
//  shows a page: Chrome is activated, nothing opens, and the session neither
//  completes nor fails, so the sheet would wait forever. The app can't tell a
//  lost handoff from someone still typing their password, and ClerkKit has no
//  public way to finish an OAuth sign-in that ran outside the session, so the
//  sheet can't route around it. What it can do is notice the signs of a stall
//  (time passing, or the person coming back to the app) and offer to cancel
//  and retry, or to switch the default browser to Safari for one sign-in.
//  See plans/in-progress/2026-10-25-mac-sign-in-chrome-handoff.md.
//

#if os(macOS)
import AppKit
import Foundation

struct MacSignInHandoff: Equatable {
    enum Browser: Equatable {
        /// Safari, which runs the session in its own sheet and is reliable.
        case safari
        /// Another default browser, which macOS hands the session to.
        case other(name: String)
        /// The default browser couldn't be determined.
        case unknown
    }

    /// How long a sign-in runs before the sheet offers help anyway. A Safari
    /// sign-in with a remembered Google account is done well inside this;
    /// someone still typing a password just sees a hint they can ignore.
    static let helpDelay: TimeInterval = 15

    /// System Settings ▸ Desktop & Dock, where the default browser is chosen.
    static let defaultBrowserSettingsURL = URL(string: "x-apple.systempreferences:com.apple.Desktop-Settings.extension")!

    let browser: Browser
    let startedAt: Date
    private(set) var showsHelp = false
    /// Whether the app has lost focus since the sign-in started — it does when
    /// the browser comes forward, so coming back to it afterwards means the
    /// person has returned, usually because nothing appeared.
    private var leftApp = false

    init(browser: Browser, startedAt: Date) {
        self.browser = browser
        self.startedAt = startedAt
    }

    mutating func update(now: Date) {
        if now.timeIntervalSince(startedAt) >= Self.helpDelay { showsHelp = true }
    }

    mutating func appDidResignActive() {
        leftApp = true
    }

    /// Safari's sign-in sheet (and the system's consent prompt) can move
    /// focus too, so for Safari only the delay counts: it rarely stalls, and
    /// help flashing up during a working sign-in would just be noise.
    mutating func appDidBecomeActive() {
        if leftApp, browser != .safari { showsHelp = true }
    }

    /// Whether switching the default browser is worth suggesting.
    var suggestsSafari: Bool {
        if case .other = browser { return true }
        return false
    }

    var helpMessage: String {
        switch browser {
        case .other(let name):
            return "Nothing opened in \(name)? macOS doesn’t always manage to hand sign-in to \(name). Start over, quitting \(name) first (⌘Q) if it keeps happening, or make Safari your default browser for this one sign-in. You’ll stay signed in afterwards, whichever browser you switch back to."
        case .safari, .unknown:
            return "Didn’t see a sign-in page? Start over and try again."
        }
    }

    /// The message for a browser that refused the session outright
    /// (`ASWebAuthenticationSessionError.presentationContextInvalid`, which
    /// Chrome returns when it can't open a window for a profile).
    var refusedMessage: String {
        switch browser {
        case .other(let name):
            return "\(name) couldn’t open the sign-in page. Open \(name) and try again, or make Safari your default browser for this sign-in."
        case .safari, .unknown:
            return "The sign-in page couldn’t open. Try again."
        }
    }

    // MARK: - Default browser

    static let safariBundleIdentifiers: Set<String> = [
        "com.apple.Safari",
        "com.apple.SafariTechnologyPreview"
    ]

    static func browser(bundleIdentifier: String?, name: String?) -> Browser {
        if let bundleIdentifier, safariBundleIdentifiers.contains(bundleIdentifier) { return .safari }
        // Only the app's file name is known when its Info.plist can't be read.
        if bundleIdentifier == nil, name == "Safari" { return .safari }
        if let name, !name.isEmpty { return .other(name: name) }
        return bundleIdentifier == nil ? .unknown : .other(name: "your browser")
    }

    /// The app macOS opens `https` links with, which is the one it hands
    /// `ASWebAuthenticationSession` to.
    static func currentDefaultBrowser(workspace: NSWorkspace = .shared) -> Browser {
        guard
            let probe = URL(string: "https://nylonimpossible.com"),
            let appURL = workspace.urlForApplication(toOpen: probe)
        else { return .unknown }
        let bundle = Bundle(url: appURL)
        let name = bundle?.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
            ?? bundle?.object(forInfoDictionaryKey: "CFBundleName") as? String
            ?? appURL.deletingPathExtension().lastPathComponent
        return browser(bundleIdentifier: bundle?.bundleIdentifier, name: name)
    }
}
#endif
