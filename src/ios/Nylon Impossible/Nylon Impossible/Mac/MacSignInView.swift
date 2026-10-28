//
//  MacSignInView.swift
//  Nylon Impossible
//
//  Sign-in on the Mac. Clerk's prebuilt `AuthView` (ClerkKitUI) is iOS-only —
//  every file in that product is `#if os(iOS)` — so the Mac has a small
//  native view on `ClerkKit` instead. It offers the same ways in as web and
//  iOS: the production instance only enables Google and GitHub (email codes
//  are off), so those are the two buttons. `signInWithOAuth` runs the
//  provider in an `ASWebAuthenticationSession` and returns through the app's
//  callback scheme, the same redirect iOS already uses for this bundle ID. A
//  new account is created through the same flow (`transferable` sign-up).
//  Once Clerk has a session, `RootView` swaps to the board and persists the
//  token to the shared Keychain item, the same as on iOS.
//
//  macOS hands the session to the default browser. When that's Chrome, the
//  handoff can stall with no page and no error, so the sheet watches for the
//  signs of that (`MacSignInHandoff`) and offers Start Over and a way to make
//  Safari the default, rather than waiting forever.
//

#if os(macOS)
import AuthenticationServices
import ClerkKit
import SwiftUI

struct MacSignInView: View {
    /// The providers enabled on the Clerk instance, in the order web shows them.
    static let providers: [(provider: OAuthProvider, key: String, label: String, logo: String)] = [
        (.google, "google", "Continue with Google", "ProviderLogoGoogle"),
        (.github, "github", "Continue with GitHub", "ProviderLogoGitHub")
    ]

    /// The provider this Mac last signed in with, so its button can say so
    /// after a sign-out. Per-Mac, like `MacSettings`.
    static let lastProviderKey = "mac.lastSignInProvider"

    let onDone: () -> Void

    @Environment(Clerk.self) private var clerk
    @AppStorage(MacSignInView.lastProviderKey) private var lastProvider: String?
    @State private var working: OAuthProvider?
    @State private var message: String?
    /// The sign-in in flight. Cancelling it closes Clerk's browser session, so
    /// Cancel (or the sheet going away) never leaves one waiting.
    @State private var signInTask: Task<Void, Never>?
    /// Where the sign-in in flight went, and whether to offer help with it.
    @State private var handoff: MacSignInHandoff?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s4) {
            Text("Sign in to Nylon")
                .textStyle(Theme.Fonts.Role.listName, tracking: Theme.Tracking.title)
                .foregroundStyle(Theme.Colors.ink)
            Text("Use the same account as on the web and your iPhone.")
                .textStyle(Theme.Fonts.Role.meta)
                .foregroundStyle(Theme.Colors.inkMuted)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: Theme.Space.s3) {
                ForEach(Self.providers, id: \.provider) { entry in
                    Button {
                        signIn(with: entry.provider, key: entry.key)
                    } label: {
                        HStack(spacing: Theme.Space.s2) {
                            // Google's mark keeps its colors; GitHub's is a
                            // template, so it follows the label in either mode.
                            Image(entry.logo)
                                .resizable()
                                .scaledToFit()
                                .frame(width: 20, height: 20)
                                .accessibilityHidden(true)
                            Text(entry.label)
                            Spacer()
                            if working == entry.provider {
                                ProgressView().controlSize(.small)
                            } else if lastProvider == entry.key {
                                lastUsedBadge
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .controlSize(.extraLarge)
                    .disabled(working != nil)
                    .accessibilityHint(lastProvider == entry.key ? "You used this last time." : "")
                }
            }

            if let provider = working {
                Text("Finish signing in with \(provider.name) in the browser window. It closes on its own when you’re done.")
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if working != nil, let handoff, handoff.showsHelp {
                stalledHelp(handoff)
            }

            if let message {
                Text(message)
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.overdue)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack {
                Spacer()
                Button("Cancel", role: .cancel) {
                    signInTask?.cancel()
                    onDone()
                }
                .keyboardShortcut(.cancelAction)
            }
        }
        .padding(Theme.Space.s6)
        .frame(width: 380)
        .onDisappear { signInTask?.cancel() }
        .task(id: working) {
            guard working != nil else { return }
            try? await Task.sleep(for: .seconds(MacSignInHandoff.helpDelay))
            guard !Task.isCancelled else { return }
            handoff?.update(now: .now)
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didResignActiveNotification)) { _ in
            handoff?.appDidResignActive()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            handoff?.appDidBecomeActive()
        }
    }

    /// Shown once a sign-in looks stuck: cancel the session in place (the
    /// sheet stays, so the person can pick again) and, when the default
    /// browser isn't Safari, a way to change it.
    private func stalledHelp(_ handoff: MacSignInHandoff) -> some View {
        VStack(alignment: .leading, spacing: Theme.Space.s2) {
            Text(handoff.helpMessage)
                .textStyle(Theme.Fonts.Role.meta)
                .foregroundStyle(Theme.Colors.ink)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: Theme.Space.s2) {
                Button("Start over") { signInTask?.cancel() }
                if handoff.suggestsSafari {
                    Button("Default browser settings…") {
                        NSWorkspace.shared.open(MacSignInHandoff.defaultBrowserSettingsURL)
                    }
                }
            }
        }
    }

    private var lastUsedBadge: some View {
        Text("Last used")
            .textStyle(Theme.Fonts.Role.meta)
            .foregroundStyle(Theme.Colors.inkMuted)
            .padding(.horizontal, Theme.Space.s2)
            .padding(.vertical, 2)
            .background(Capsule().strokeBorder(Theme.Colors.hairline))
            .accessibilityHidden(true)
    }

    private func signIn(with provider: OAuthProvider, key: String) {
        guard working == nil else { return }
        working = provider
        message = nil
        let handoff = MacSignInHandoff(browser: MacSignInHandoff.currentDefaultBrowser(), startedAt: .now)
        self.handoff = handoff
        signInTask = Task {
            defer {
                working = nil
                signInTask = nil
                self.handoff = nil
            }
            do {
                let result = try await clerk.auth.signInWithOAuth(provider: provider)
                if Self.isComplete(result) {
                    lastProvider = key
                    onDone()
                } else {
                    message = "This account needs another step. Sign in on nylonimpossible.com first, then try again here."
                }
            } catch is CancellationError {
                // Closing the sign-in sheet isn't an error worth showing.
            } catch let error as ClerkAPIError {
                message = error.longMessage ?? error.message ?? "That didn’t work. Try again."
            } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
                // The user closed the web sign-in sheet.
            } catch let error as ASWebAuthenticationSessionError
                where error.code == .presentationContextInvalid || error.code == .presentationContextNotProvided {
                // The browser refused the session (Chrome does when it can't
                // open a window for its profile).
                message = handoff.refusedMessage
            } catch {
                message = "Couldn’t sign in. Check your connection and try again."
            }
        }
    }

    /// Whether an OAuth result left Clerk with a finished sign-in or sign-up.
    static func isComplete(_ result: TransferFlowResult) -> Bool {
        switch result {
        case .signIn(let signIn): return signIn.status == .complete
        case .signUp(let signUp): return signUp.status == .complete
        }
    }
}
#endif
