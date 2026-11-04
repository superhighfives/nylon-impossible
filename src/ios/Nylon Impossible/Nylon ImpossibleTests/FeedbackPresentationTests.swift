import SwiftUI
import Testing
@testable import Nylon_Impossible
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// `isAdmin` arrives with `/users/me`, after the first sync, and turns
/// feedback on under a screen that's already up. That mustn't rebuild the
/// screen, or the composer loses its keyboard mid-sentence (#568).
@Suite("Feedback presentation")
@MainActor
struct FeedbackPresentationTests {
    @Observable
    final class Switch {
        var isEnabled = false
    }

    final class Lifecycle {
        var appeared = 0
        var disappeared = 0
    }

    private struct Host: View {
        let feedback: FeedbackService
        let toggle: Switch
        let lifecycle: Lifecycle
        let toasts: ToastCenter

        var body: some View {
            Color.clear
                .onAppear { lifecycle.appeared += 1 }
                .onDisappear { lifecycle.disappeared += 1 }
                .feedbackPresentation(feedback, isEnabled: toggle.isEnabled, screen: "today", toasts: toasts)
        }
    }

    /// Lets SwiftUI run an update pass.
    private func settle() async {
        for _ in 0..<5 {
            try? await Task.sleep(for: .milliseconds(20))
        }
    }

    @Test("Turning feedback on keeps the screen it wraps")
    func enablingKeepsContent() async {
        let feedback = FeedbackService(apiService: MockAPIService())
        let toggle = Switch()
        let lifecycle = Lifecycle()
        let host = Host(feedback: feedback, toggle: toggle, lifecycle: lifecycle, toasts: ToastCenter())
        let size = CGSize(width: 320, height: 480)

        #if os(macOS)
        let window = NSWindow(contentRect: CGRect(origin: .zero, size: size), styleMask: [.titled], backing: .buffered, defer: false)
        window.contentView = NSHostingView(rootView: host)
        window.orderFront(nil)
        defer { window.close() }
        #else
        let window = UIWindow(frame: CGRect(origin: .zero, size: size))
        window.rootViewController = UIHostingController(rootView: host)
        window.isHidden = false
        defer { window.isHidden = true }
        #endif

        await settle()
        #expect(lifecycle.appeared == 1)
        #expect(feedback.screen == nil)

        toggle.isEnabled = true
        await settle()

        #expect(lifecycle.appeared == 1)
        #expect(lifecycle.disappeared == 0)
        #expect(feedback.screen == "today")
        // The content's size, inside the safe area, so only the width is the window's.
        #expect(feedback.viewport?.width == size.width)
    }
}
