//
//  MacSignInView.swift
//  Nylon Impossible
//
//  Sign-in on the Mac. Clerk's prebuilt `AuthView` (ClerkKitUI) is iOS-only —
//  every file in that product is `#if os(iOS)` — so the Mac has a small
//  native flow on `ClerkKit` instead: your email, then the six-digit code
//  Clerk sends. An address with no account gets the same two steps as a
//  sign-up, so there's one way in. Once Clerk has a session, `RootView`
//  swaps to the board and persists the token to the shared Keychain item, the
//  same as on iOS.
//

#if os(macOS)
import ClerkKit
import SwiftUI

struct MacSignInView: View {
    enum Step: Equatable {
        case email
        case code(email: String, isSignUp: Bool)
    }

    let onDone: () -> Void

    @Environment(Clerk.self) private var clerk
    @State private var step: Step = .email
    @State private var email = ""
    @State private var code = ""
    @State private var isWorking = false
    @State private var message: String?
    @State private var signIn: SignIn?
    @State private var signUp: SignUp?
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s4) {
            Text(title)
                .textStyle(Theme.Fonts.Role.listName, tracking: Theme.Tracking.title)
                .foregroundStyle(Theme.Colors.ink)
            Text(detail)
                .textStyle(Theme.Fonts.Role.meta)
                .foregroundStyle(Theme.Colors.inkMuted)
                .fixedSize(horizontal: false, vertical: true)

            switch step {
            case .email:
                TextField("you@example.com", text: $email)
                    .textContentType(.emailAddress)
                    .focused($focused)
                    .onSubmit(sendCode)
            case .code:
                TextField("123456", text: $code)
                    .textContentType(.oneTimeCode)
                    .font(.system(.title3, design: .monospaced))
                    .focused($focused)
                    .onSubmit(verify)
            }

            if let message {
                Text(message)
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.overdue)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack {
                if case .code = step {
                    Button("Use a different email") {
                        step = .email
                        code = ""
                        message = nil
                    }
                    .buttonStyle(.link)
                }
                Spacer()
                Button("Cancel", role: .cancel, action: onDone)
                    .keyboardShortcut(.cancelAction)
                Button(primaryLabel, action: primaryAction)
                    .keyboardShortcut(.defaultAction)
                    .disabled(isWorking || !canContinue)
            }
            .overlay(alignment: .leading) {
                if isWorking { ProgressView().controlSize(.small) }
            }
        }
        .textFieldStyle(.roundedBorder)
        .padding(Theme.Space.s6)
        .frame(width: 380)
        .onAppear { focused = true }
    }

    private var title: String {
        switch step {
        case .email: return "Sign in to Nylon"
        case .code(_, let isSignUp): return isSignUp ? "Create your account" : "Check your email"
        }
    }

    private var detail: String {
        switch step {
        case .email: return "We’ll email you a code. No password needed."
        case .code(let email, _): return "Enter the code we sent to \(email)."
        }
    }

    private var primaryLabel: String {
        step == .email ? "Send Code" : "Sign In"
    }

    private var canContinue: Bool {
        switch step {
        case .email: return MacSignInView.looksLikeEmail(email)
        case .code: return code.trimmingCharacters(in: .whitespaces).count >= 6
        }
    }

    private func primaryAction() {
        if step == .email {
            sendCode()
        } else {
            verify()
        }
    }

    /// A light check before asking Clerk, so Return on an empty field does
    /// nothing rather than surfacing an API error.
    static func looksLikeEmail(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let at = trimmed.firstIndex(of: "@") else { return false }
        let domain = trimmed[trimmed.index(after: at)...]
        return at != trimmed.startIndex && domain.contains(".") && !trimmed.contains(" ")
    }

    private func sendCode() {
        guard canContinue, !isWorking else { return }
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        run {
            do {
                signIn = try await clerk.auth.signInWithEmailCode(emailAddress: address)
                step = .code(email: address, isSignUp: false)
            } catch let error as ClerkAPIError where error.code == "form_identifier_not_found" {
                let created = try await clerk.auth.signUp(emailAddress: address)
                signUp = try await created.sendEmailCode()
                step = .code(email: address, isSignUp: true)
            }
        }
    }

    private func verify() {
        guard canContinue, !isWorking, case .code(_, let isSignUp) = step else { return }
        let entered = code.trimmingCharacters(in: .whitespaces)
        run {
            if isSignUp, let signUp {
                let result = try await signUp.verifyEmailCode(entered)
                guard result.status == .complete else {
                    message = "Finish creating your account on nylonimpossible.com, then sign in here."
                    return
                }
            } else if let signIn {
                let result = try await signIn.verifyCode(entered)
                guard result.status == .complete else {
                    message = "This account needs another step. Sign in on nylonimpossible.com first."
                    return
                }
            }
            onDone()
        }
    }

    private func run(_ work: @escaping @MainActor () async throws -> Void) {
        isWorking = true
        message = nil
        Task {
            defer { isWorking = false }
            do {
                try await work()
            } catch let error as ClerkAPIError {
                message = error.longMessage ?? error.message ?? "That didn’t work. Try again."
            } catch {
                message = "Couldn’t reach Nylon. Check your connection and try again."
            }
        }
    }
}
#endif
