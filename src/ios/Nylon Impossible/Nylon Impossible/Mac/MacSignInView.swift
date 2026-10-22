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

#if os(macOS)
import ClerkKit
import SwiftUI

struct MacSignInView: View {
    /// The providers enabled on the Clerk instance, in the order web shows them.
    static let providers: [(provider: OAuthProvider, label: String)] = [
        (.google, "Continue with Google"),
        (.github, "Continue with GitHub")
    ]

    let onDone: () -> Void

    @Environment(Clerk.self) private var clerk
    @State private var working: OAuthProvider?
    @State private var message: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s4) {
            Text("Sign in to Nylon")
                .textStyle(Theme.Fonts.Role.listName, tracking: Theme.Tracking.title)
                .foregroundStyle(Theme.Colors.ink)
            Text("Use the same account as on the web and your iPhone.")
                .textStyle(Theme.Fonts.Role.meta)
                .foregroundStyle(Theme.Colors.inkMuted)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: Theme.Space.s2) {
                ForEach(Self.providers, id: \.provider) { entry in
                    Button {
                        signIn(with: entry.provider)
                    } label: {
                        HStack {
                            Text(entry.label)
                            Spacer()
                            if working == entry.provider {
                                ProgressView().controlSize(.small)
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .controlSize(.large)
                    .disabled(working != nil)
                }
            }

            if let message {
                Text(message)
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.overdue)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack {
                Spacer()
                Button("Cancel", role: .cancel, action: onDone)
                    .keyboardShortcut(.cancelAction)
            }
        }
        .padding(Theme.Space.s6)
        .frame(width: 380)
    }

    private func signIn(with provider: OAuthProvider) {
        guard working == nil else { return }
        working = provider
        message = nil
        Task {
            defer { working = nil }
            do {
                let result = try await clerk.auth.signInWithOAuth(provider: provider)
                if Self.isComplete(result) {
                    onDone()
                } else {
                    message = "This account needs another step. Sign in on nylonimpossible.com first, then try again here."
                }
            } catch is CancellationError {
                // Closing the sign-in sheet isn't an error worth showing.
            } catch let error as ClerkAPIError {
                message = error.longMessage ?? error.message ?? "That didn’t work. Try again."
            } catch {
                if (error as NSError).domain == "com.apple.AuthenticationServices.WebAuthenticationSession",
                   (error as NSError).code == 1 {
                    return // The user cancelled the web sign-in sheet.
                }
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
