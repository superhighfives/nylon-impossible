//
//  MacSignInView.swift
//  Nylon Impossible
//
//  Sign-in on the Mac. Clerk's prebuilt `AuthView` (ClerkKitUI) is iOS-only —
//  every file in that product is `#if os(iOS)` — so the Mac has a small
//  native view on `ClerkKit` instead. It offers the same ways in as web and
//  iOS: the production instance enables Apple, GitHub and Google (email
//  codes are off), so those are the three buttons, in `AuthView`'s order.
//
//  Apple uses Clerk's native flow, `signInWithApple`: macOS shows its own
//  Apple ID sheet over the app and Clerk trades the identity token for a
//  session, so there's no browser (and it needs the Sign in with Apple
//  entitlement on the app). GitHub and Google use `signInWithOAuth`, which
//  runs the provider in an `ASWebAuthenticationSession` and returns through
//  the app's callback scheme, the same redirect iOS already uses for this
//  bundle ID. Either way a new account is created through the same flow
//  (`transferable` sign-up). Once Clerk has a session, `MacSession` takes
//  over and persists the token to the shared Keychain item, the same as on
//  iOS.
//
//  macOS hands an OAuth session to the default browser. When that's Chrome,
//  the handoff can stall with no page and no error, so the sheet watches for
//  the signs of that (`MacSignInHandoff`) and offers Start Over and a way to
//  make Safari the default, rather than waiting forever. Apple's sheet isn't
//  a browser, so none of that applies to it.
//

#if os(macOS)
import AuthenticationServices
import ClerkKit
import SwiftUI

struct MacSignInView: View {
    /// One way in: the Clerk provider, how the Mac reaches it, and its button.
    struct Provider: Equatable {
        /// How a provider signs in: Apple's own sheet, or the browser.
        enum Flow: Equatable {
            /// `signInWithOAuth` in an `ASWebAuthenticationSession`, with the
            /// browser sentence and `MacSignInHandoff`'s stall help.
            case oauth
            /// `signInWithApple`: the system's Apple ID sheet, no browser.
            case apple
        }

        enum Logo: Equatable {
            /// An image in the asset catalog.
            case asset(String)
            /// An SF Symbol, drawn as a template.
            case symbol(String)
        }

        let provider: OAuthProvider
        let key: String
        let label: String
        let logo: Logo
        let flow: Flow
    }

    /// The providers enabled on the Clerk instance, in the order iOS's
    /// `AuthView` shows them (by name).
    static let providers: [Provider] = [
        Provider(provider: .apple, key: "apple", label: "Continue with Apple", logo: .symbol("apple.logo"), flow: .apple),
        Provider(provider: .github, key: "github", label: "Continue with GitHub", logo: .asset("ProviderLogoGitHub"), flow: .oauth),
        Provider(provider: .google, key: "google", label: "Continue with Google", logo: .asset("ProviderLogoGoogle"), flow: .oauth)
    ]

    /// The provider this Mac last signed in with, so its button can say so
    /// after a sign-out. Per-Mac, like `MacSettings`.
    static let lastProviderKey = "mac.lastSignInProvider"

    let onDone: () -> Void

    @Environment(Clerk.self) private var clerk
    @Environment(MacLoginItem.self) private var loginItem
    @AppStorage(MacSignInView.lastProviderKey) private var lastProvider: String?
    @State private var working: Provider?
    @State private var message: String?
    /// The sign-in in flight. Cancelling it closes Clerk's browser session, so
    /// Cancel (or the sheet going away) never leaves one waiting.
    @State private var signInTask: Task<Void, Never>?
    /// Where the sign-in in flight went, and whether to offer help with it.
    @State private var handoff: MacSignInHandoff?
    /// Open at login, ticked by default; applied once the sign-in finishes.
    @State private var openAtLogin: Bool?

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
                        signIn(with: entry)
                    } label: {
                        HStack(spacing: Theme.Space.s2) {
                            // Google's mark keeps its colors; GitHub's and
                            // Apple's are templates, so they follow the label
                            // in either mode.
                            logo(entry.logo)
                                .resizable()
                                .scaledToFit()
                                .frame(width: 20, height: 20)
                                .accessibilityHidden(true)
                            Text(entry.label)
                            Spacer()
                            if working == entry {
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

            Toggle("Open at login", isOn: Binding(
                get: { openAtLogin ?? loginItem.signInDefault },
                set: { openAtLogin = $0 }
            ))
            .toggleStyle(.checkbox)
            .disabled(working != nil)

            if let working, working.flow == .oauth {
                Text("Finish signing in with \(working.provider.name) in the browser window. It closes on its own when you’re done.")
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
            guard working?.flow == .oauth else { return }
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
    /// browser isn't Safari, a way to change it. Boxed, so it reads as one
    /// aside instead of more body text between the buttons and Cancel.
    private func stalledHelp(_ handoff: MacSignInHandoff) -> some View {
        let box = RoundedRectangle(cornerRadius: Theme.Radius.field, style: .continuous)
        return VStack(alignment: .leading, spacing: Theme.Space.s3) {
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
        .padding(Theme.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Colors.surface, in: box)
        .overlay(box.strokeBorder(Theme.Colors.hairline))
    }

    private func logo(_ logo: Provider.Logo) -> Image {
        switch logo {
        case .asset(let name): Image(name)
        case .symbol(let name): Image(systemName: name)
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

    private func signIn(with entry: Provider) {
        guard working == nil else { return }
        working = entry
        message = nil
        // Only the browser can stall, so only the OAuth flow is watched.
        let handoff = entry.flow == .oauth
            ? MacSignInHandoff(browser: MacSignInHandoff.currentDefaultBrowser(), startedAt: .now)
            : nil
        self.handoff = handoff
        signInTask = Task {
            defer {
                working = nil
                signInTask = nil
                self.handoff = nil
            }
            do {
                let result = switch entry.flow {
                case .apple: try await clerk.auth.signInWithApple()
                case .oauth: try await clerk.auth.signInWithOAuth(provider: entry.provider)
                }
                if Self.isComplete(result) {
                    lastProvider = entry.key
                    loginItem.signedIn(openAtLogin: openAtLogin ?? loginItem.signInDefault)
                    onDone()
                } else {
                    message = "This account needs another step. Sign in on nylonimpossible.com first, then try again here."
                }
            } catch {
                message = Self.message(for: error, handoff: handoff)
            }
        }
    }

    /// What the sheet says when a sign-in throws, or nil when it shouldn't
    /// say anything: closing Apple's sheet or the browser's, or Cancel.
    /// `handoff` is the browser sign-in's, nil for Apple.
    static func message(for error: Error, handoff: MacSignInHandoff?) -> String? {
        let connectionMessage = "Couldn’t sign in. Check your connection and try again."
        switch error {
        case is CancellationError:
            // Closing the sign-in sheet isn't an error worth showing.
            return nil
        case let error as ClerkAPIError:
            return error.longMessage ?? error.message ?? "That didn’t work. Try again."
        case let error as ASAuthorizationError where error.code == .canceled:
            // The user closed Apple's sheet.
            return nil
        case let error as ASWebAuthenticationSessionError where error.code == .canceledLogin:
            // The user closed the web sign-in sheet.
            return nil
        case let error as ASWebAuthenticationSessionError
            where error.code == .presentationContextInvalid || error.code == .presentationContextNotProvided:
            // The browser refused the session (Chrome does when it can't
            // open a window for its profile).
            return handoff?.refusedMessage ?? connectionMessage
        default:
            return connectionMessage
        }
    }

    /// Whether a sign-in result left Clerk with a finished sign-in or sign-up.
    static func isComplete(_ result: TransferFlowResult) -> Bool {
        switch result {
        case .signIn(let signIn): return signIn.status == .complete
        case .signUp(let signUp): return signUp.status == .complete
        }
    }
}
#endif
