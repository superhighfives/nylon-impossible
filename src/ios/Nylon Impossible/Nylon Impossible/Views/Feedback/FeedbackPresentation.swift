//
//  FeedbackPresentation.swift
//  Nylon Impossible
//
//  Where the feedback sheet comes from. On iOS, taking a screenshot shows a
//  "Send as feedback" pill for a few seconds; tapping it opens the sheet
//  with a snapshot of the window attached. (The system screenshot itself
//  can't be read without Photos access, so the app draws its own window —
//  the same pixels.) The sheet is presented from the topmost view
//  controller, so it opens over the detail or account sheet too. On a Mac,
//  Help ▸ Send Feedback… snapshots the board window and opens the sheet on
//  it.
//
//  `feedbackPresentation` keeps the service's idea of the current screen,
//  colour scheme and window size up to date, and shows "Filed #N" when an
//  issue lands. It does nothing for an account without the admin role.
//

import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

extension View {
    func feedbackPresentation(
        _ feedback: FeedbackService?,
        isEnabled: Bool,
        screen: String,
        toasts: ToastCenter
    ) -> some View {
        modifier(FeedbackPresentationModifier(
            feedback: feedback,
            isEnabled: isEnabled,
            screen: screen,
            toasts: toasts
        ))
    }
}

extension FeedbackService {
    /// The keyboard shortcut for Send Feedback… on a Mac and an iPad with a
    /// keyboard. Not ⌥⌘F: that's Find and Replace in the standard Edit menu.
    static let shortcut = (key: KeyEquivalent("f"), modifiers: EventModifiers([.command, .shift]))

    /// Open the sheet with the window as it looks now attached.
    func presentWithSnapshot() {
        #if os(macOS)
        let snapshot = MacFeedbackSnapshot.boardWindow()
        #else
        let snapshot = FeedbackPresenter.snapshotKeyWindow()
        #endif
        present(with: snapshot?.image, viewport: snapshot?.size)
    }
}

private struct FeedbackPresentationModifier: ViewModifier {
    let feedback: FeedbackService?
    let isEnabled: Bool
    let screen: String
    let toasts: ToastCenter

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.openURL) private var openURL

    func body(content: Content) -> some View {
        if let feedback, isEnabled {
            content
                .onChange(of: screen, initial: true) { _, screen in feedback.screen = screen }
                .onChange(of: colorScheme, initial: true) { _, scheme in feedback.colorScheme = scheme }
                .onGeometryChange(for: CGSize.self) { $0.size } action: { feedback.viewport = $0 }
                .onChange(of: feedback.lastFiled) { _, filed in
                    guard let filed else { return }
                    feedback.lastFiled = nil
                    toasts.show("Filed #\(filed.issueNumber)", actionLabel: "View", action: {
                        openURL(filed.issueUrl)
                    })
                }
                #if os(macOS)
                .sheet(isPresented: Bindable(feedback).isPresented) {
                    FeedbackSheet(feedback: feedback) { feedback.isPresented = false }
                }
                #else
                .onChange(of: feedback.isPresented) { _, presented in
                    if presented {
                        FeedbackPresenter.present(feedback)
                    } else {
                        FeedbackPresenter.dismiss()
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.userDidTakeScreenshotNotification)) { _ in
                    guard !feedback.isPresented, let snapshot = FeedbackPresenter.snapshotKeyWindow() else { return }
                    FeedbackPill.show {
                        feedback.present(with: snapshot.image, viewport: snapshot.size)
                    }
                }
                #endif
        } else {
            content
        }
    }
}

#if os(iOS)
// MARK: - iOS

@MainActor
enum FeedbackPresenter {
    private static weak var controller: UIViewController?

    static var keyWindow: UIWindow? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
    }

    /// The key window as it looks now, sheets included, at screen scale.
    static func snapshotKeyWindow() -> (image: CGImage, size: CGSize)? {
        guard let window = keyWindow else { return nil }
        let renderer = UIGraphicsImageRenderer(bounds: window.bounds)
        let image = renderer.image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: false)
        }
        guard let cgImage = image.cgImage else { return nil }
        return (cgImage, window.bounds.size)
    }

    static func present(_ feedback: FeedbackService) {
        guard controller == nil, let window = keyWindow, var top = window.rootViewController else { return }
        while let presented = top.presentedViewController, !presented.isBeingDismissed { top = presented }

        let host = FeedbackHostingController(feedback: feedback)
        host.modalPresentationStyle = .formSheet
        host.presentationController?.delegate = host
        if let sheet = host.sheetPresentationController {
            sheet.detents = [.large()]
            sheet.prefersGrabberVisible = true
        }
        controller = host
        top.present(host, animated: true)
    }

    static func dismiss() {
        guard let controller, !controller.isBeingDismissed else { return }
        controller.dismiss(animated: true)
    }
}

private final class FeedbackHostingController: UIHostingController<FeedbackSheet>, UIAdaptivePresentationControllerDelegate {
    private let feedback: FeedbackService

    init(feedback: FeedbackService) {
        self.feedback = feedback
        super.init(rootView: FeedbackSheet(feedback: feedback) { feedback.isPresented = false })
        view.backgroundColor = UIColor(Theme.Colors.canvas)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    /// Swiped down: the draft stays, the sheet's closed.
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        feedback.isPresented = false
    }
}

/// "Send as feedback", for five seconds after a screenshot. A UIKit button
/// on the key window itself, so it sits over any sheet that's up.
@MainActor
enum FeedbackPill {
    private static weak var current: UIView?
    private static var dismissal: Task<Void, Never>?

    static func show(onTap: @escaping () -> Void) {
        guard let window = FeedbackPresenter.keyWindow else { return }
        hide(animated: false)

        var configuration = UIButton.Configuration.filled()
        configuration.title = "Send as feedback"
        configuration.image = UIImage(systemName: "exclamationmark.bubble")
        configuration.imagePadding = Theme.Space.s2
        configuration.cornerStyle = .capsule
        configuration.baseBackgroundColor = UIColor(Theme.Colors.ink)
        configuration.baseForegroundColor = UIColor(Theme.Colors.canvas)
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 18, bottom: 12, trailing: 18)
        configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var attributes = attributes
            attributes.font = UIFont.preferredFont(forTextStyle: .subheadline).withWeight(.semibold)
            return attributes
        }

        let button = UIButton(configuration: configuration, primaryAction: UIAction { _ in
            hide(animated: true)
            onTap()
        })
        button.layer.shadowColor = UIColor.black.cgColor
        button.layer.shadowOpacity = 0.18
        button.layer.shadowRadius = 12
        button.layer.shadowOffset = CGSize(width: 0, height: 6)
        button.translatesAutoresizingMaskIntoConstraints = false
        window.addSubview(button)
        NSLayoutConstraint.activate([
            button.centerXAnchor.constraint(equalTo: window.centerXAnchor),
            button.topAnchor.constraint(equalTo: window.safeAreaLayoutGuide.topAnchor, constant: Theme.Space.s2),
        ])
        current = button

        let reduceMotion = UIAccessibility.isReduceMotionEnabled
        button.alpha = 0
        if !reduceMotion { button.transform = CGAffineTransform(translationX: 0, y: -12) }
        UIView.animate(withDuration: Theme.Motion.base, delay: 0, options: .curveEaseOut) {
            button.alpha = 1
            button.transform = .identity
        }
        UIAccessibility.post(notification: .announcement, argument: "Screenshot taken. Send as feedback?")

        let visibleFor: Duration = AssistiveTechnology.isRunning ? .seconds(15) : .seconds(5)
        dismissal = Task {
            try? await Task.sleep(for: visibleFor)
            guard !Task.isCancelled else { return }
            hide(animated: true)
        }
    }

    static func hide(animated: Bool) {
        dismissal?.cancel()
        dismissal = nil
        guard let view = current else { return }
        current = nil
        guard animated else {
            view.removeFromSuperview()
            return
        }
        UIView.animate(withDuration: Theme.Motion.fast, animations: { view.alpha = 0 }) { _ in
            view.removeFromSuperview()
        }
    }
}

private extension UIFont {
    func withWeight(_ weight: UIFont.Weight) -> UIFont {
        let descriptor = fontDescriptor.addingAttributes([
            .traits: [UIFontDescriptor.TraitKey.weight: weight],
        ])
        return UIFont(descriptor: descriptor, size: 0)
    }
}
#endif

#if os(macOS)
// MARK: - Mac

@MainActor
enum MacFeedbackSnapshot {
    /// The board window's content as it looks now, at the screen's scale.
    /// Drawn from the view, so it needs no Screen Recording permission.
    static func boardWindow() -> (image: CGImage, size: CGSize)? {
        guard let window = NSApp.windows.first(where: { MacScenes.isBoardWindow($0) && $0.isVisible }),
              let view = window.contentView,
              let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return nil }
        view.cacheDisplay(in: view.bounds, to: rep)
        guard let image = rep.cgImage else { return nil }
        return (image, view.bounds.size)
    }
}
#endif
