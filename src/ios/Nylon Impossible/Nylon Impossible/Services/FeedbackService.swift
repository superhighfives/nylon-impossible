//
//  FeedbackService.swift
//  Nylon Impossible
//
//  The admin-only feedback inbox: a description and up to four screenshots,
//  sent to `POST /feedback`, which files an issue in the private
//  nylon-feedback repo. The service holds the draft between the moment
//  something is flagged (a screenshot, Help ▸ Send Feedback…) and sending it,
//  and builds the context every issue carries so the only typing is the
//  description. See plans/in-progress/2026-10-21-feedback-inbox.md.
//

import Foundation
import ImageIO
import UniformTypeIdentifiers
import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

// MARK: - Wire types

struct FeedbackContext: Encodable, Equatable, Sendable {
    var platform: String
    var appVersion: String?
    var build: String?
    var os: String?
    var device: String?
    var screen: String?
    var colorScheme: String?
    var viewport: String?
    var locale: String?
    var timezone: String?

    /// The API caps each optional field at 200 characters.
    static let maxFieldLength = 200

    /// "ios", "ipados" or "mac" — the issue's `platform:` label.
    static func platform(for idiom: DeviceIdiom) -> String {
        switch idiom {
        case .phone: return "ios"
        case .pad: return "ipados"
        case .mac: return "mac"
        }
    }

    /// "iOS 26.1", "iPadOS 26.0.1", "macOS 26.1".
    static func osDescription(idiom: DeviceIdiom, version: OperatingSystemVersion) -> String {
        let name: String
        switch idiom {
        case .phone: name = "iOS"
        case .pad: name = "iPadOS"
        case .mac: name = "macOS"
        }
        var number = "\(version.majorVersion).\(version.minorVersion)"
        if version.patchVersion > 0 { number += ".\(version.patchVersion)" }
        return "\(name) \(number)"
    }

    /// "390×844" in points.
    static func viewport(_ size: CGSize) -> String {
        "\(Int(size.width.rounded()))×\(Int(size.height.rounded()))"
    }

    /// Everything the app knows about where it's running. `screen`,
    /// `colorScheme` and `viewport` come from whoever flagged the feedback.
    @MainActor
    static func current(
        screen: String?,
        colorScheme: ColorScheme?,
        viewport: CGSize?,
        bundle: Bundle = .main,
        idiom: DeviceIdiom? = nil
    ) -> FeedbackContext {
        let idiom = idiom ?? .current
        return FeedbackContext(
            platform: platform(for: idiom),
            appVersion: bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
            build: bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String,
            os: osDescription(idiom: idiom, version: ProcessInfo.processInfo.operatingSystemVersion),
            device: deviceModel(),
            screen: screen,
            colorScheme: colorScheme.map { $0 == .dark ? "dark" : "light" },
            viewport: viewport.map(Self.viewport),
            locale: Locale.current.identifier(.bcp47),
            timezone: TimeZone.autoupdatingCurrent.identifier
        ).truncated()
    }

    /// Each optional field cut to the API's limit, so a long screen name
    /// never fails validation.
    func truncated() -> FeedbackContext {
        func cut(_ value: String?) -> String? {
            value.map { String($0.prefix(Self.maxFieldLength)) }
        }
        return FeedbackContext(
            platform: platform,
            appVersion: cut(appVersion),
            build: cut(build),
            os: cut(os),
            device: cut(device),
            screen: cut(screen),
            colorScheme: colorScheme,
            viewport: cut(viewport),
            locale: cut(locale),
            timezone: cut(timezone)
        )
    }

    /// "iPhone17,1", "Mac16,10". A simulator reports the model it's
    /// simulating rather than "arm64".
    static func deviceModel() -> String? {
        #if os(macOS)
        var size = 0
        sysctlbyname("hw.model", nil, &size, nil, 0)
        guard size > 0 else { return nil }
        var model = [CChar](repeating: 0, count: size)
        sysctlbyname("hw.model", &model, &size, nil, 0)
        return String(decoding: model.prefix { $0 != 0 }.map { UInt8(bitPattern: $0) }, as: UTF8.self)
        #else
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] {
            return "\(simulated) (Simulator)"
        }
        var info = utsname()
        uname(&info)
        return withUnsafeBytes(of: &info.machine) { raw in
            String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
        }
        #endif
    }
}

struct FeedbackRequest: Encodable, Sendable {
    struct Image: Encodable, Sendable {
        let contentType: String
        /// Base64, which the worker hands straight to GitHub's Contents API.
        let data: String
    }

    let description: String
    let images: [Image]
    let context: FeedbackContext
}

struct FeedbackResult: Decodable, Equatable, Sendable {
    let issueNumber: Int
    let issueUrl: URL
}

// MARK: - Images

/// A screenshot ready to send, already encoded within the API's limits.
struct FeedbackImage: Identifiable, Equatable {
    let id = UUID()
    let data: Data
    let contentType: String
    let pixelSize: CGSize
}

/// Screenshots go up as PNG — text stays crisp — unless that's over the
/// API's 5 MB cap, when they go as JPEG. Anything with a long edge over
/// 2400px is scaled down first; a 6.9" iPhone screenshot is 2868px tall.
enum FeedbackImageEncoder {
    static let maxBytes = 5 * 1024 * 1024
    static let maxLongEdge: CGFloat = 2400
    static let jpegQuality: CGFloat = 0.85

    /// The size to draw `size` at: unchanged if it fits, otherwise scaled so
    /// the long edge is `maxLongEdge`.
    static func targetSize(for size: CGSize, maxLongEdge: CGFloat = maxLongEdge) -> CGSize {
        let longEdge = max(size.width, size.height)
        guard longEdge > maxLongEdge, longEdge > 0 else { return size }
        let scale = maxLongEdge / longEdge
        return CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
    }

    /// PNG when it fits, else the first JPEG that does; nil if nothing does.
    static func choose(
        png: Data?,
        jpeg: (CGFloat) -> Data?,
        maxBytes: Int = maxBytes
    ) -> (data: Data, contentType: String)? {
        if let png, png.count <= maxBytes { return (png, "image/png") }
        for quality in [jpegQuality, 0.6, 0.4] {
            if let data = jpeg(quality), data.count <= maxBytes { return (data, "image/jpeg") }
        }
        return nil
    }

    static func encode(_ image: CGImage) -> FeedbackImage? {
        let source = CGSize(width: image.width, height: image.height)
        let target = targetSize(for: source)
        guard let scaled = target == source ? image : resize(image, to: target) else { return nil }
        guard let chosen = choose(
            png: write(scaled, type: .png, quality: nil),
            jpeg: { write(scaled, type: .jpeg, quality: $0) }
        ) else { return nil }
        return FeedbackImage(data: chosen.data, contentType: chosen.contentType, pixelSize: target)
    }

    /// Image data from the Photos picker, the pasteboard or a drop. Decoded
    /// with its orientation applied and at most `maxLongEdge` on the long
    /// edge, in one pass.
    static func encode(data: Data) -> FeedbackImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxLongEdge,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return encode(image)
    }

    private static func resize(_ image: CGImage, to size: CGSize) -> CGImage? {
        let colorSpace = image.colorSpace ?? CGColorSpace(name: CGColorSpace.sRGB)!
        guard let context = CGContext(
            data: nil,
            width: Int(size.width),
            height: Int(size.height),
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        context.interpolationQuality = .high
        context.draw(image, in: CGRect(origin: .zero, size: size))
        return context.makeImage()
    }

    private static func write(_ image: CGImage, type: UTType, quality: CGFloat?) -> Data? {
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, type.identifier as CFString, 1, nil) else {
            return nil
        }
        let properties = quality.map { [kCGImageDestinationLossyCompressionQuality: $0] as CFDictionary }
        CGImageDestinationAddImage(destination, image, properties)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return data as Data
    }
}

extension Image {
    init(feedbackImage: FeedbackImage) {
        #if os(macOS)
        self.init(nsImage: NSImage(data: feedbackImage.data) ?? NSImage())
        #else
        self.init(uiImage: UIImage(data: feedbackImage.data) ?? UIImage())
        #endif
    }
}

// MARK: - Service

@MainActor
@Observable
final class FeedbackService {
    static let maxImages = 4
    static let maxDescriptionLength = 5000

    private let apiService: any APIProviding

    /// Whether the feedback sheet is up.
    var isPresented = false
    var text = ""
    private(set) var images: [FeedbackImage] = []
    private(set) var isSubmitting = false
    var errorMessage: String?
    /// The issue just filed, for the "Filed #N" toast. Cleared once shown.
    var lastFiled: FeedbackResult?

    /// Where the feedback was flagged from, captured when it's presented.
    @ObservationIgnored var screen: String?
    @ObservationIgnored var colorScheme: ColorScheme?
    @ObservationIgnored var viewport: CGSize?

    init(apiService: any APIProviding) {
        self.apiService = apiService
    }

    var canAddImages: Bool { images.count < Self.maxImages }

    var canSubmit: Bool {
        !isSubmitting && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Open the sheet, attaching `image` (a window snapshot) if there is one.
    func present(with image: CGImage? = nil, viewport: CGSize? = nil) {
        if let image { add(image) }
        if let viewport { self.viewport = viewport }
        errorMessage = nil
        isPresented = true
    }

    func add(_ image: CGImage) {
        guard canAddImages, let encoded = FeedbackImageEncoder.encode(image) else { return }
        images.append(encoded)
    }

    func add(data: Data) {
        guard canAddImages else { return }
        guard let encoded = FeedbackImageEncoder.encode(data: data) else {
            errorMessage = "That image couldn’t be read."
            return
        }
        images.append(encoded)
    }

    /// Images from the pasteboard or a drop. Loaded one at a time, in order.
    func add(_ providers: [NSItemProvider]) {
        let images = providers.filter { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }
        guard !images.isEmpty else { return }
        Task { [weak self] in
            for provider in images {
                if let data = await Self.imageData(from: provider) { self?.add(data: data) }
            }
        }
    }

    private nonisolated static func imageData(from provider: NSItemProvider) async -> Data? {
        await withCheckedContinuation { continuation in
            _ = provider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { data, _ in
                continuation.resume(returning: data)
            }
        }
    }

    func remove(_ image: FeedbackImage) {
        images.removeAll { $0.id == image.id }
    }

    /// Drop the draft (Cancel, or sent).
    func discard() {
        text = ""
        images = []
        errorMessage = nil
        isPresented = false
    }

    /// Send the draft. True when an issue was filed; the sheet closes and
    /// `lastFiled` is set for the toast.
    @discardableResult
    func submit() async -> Bool {
        guard canSubmit else { return false }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        let request = FeedbackRequest(
            description: String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.maxDescriptionLength)),
            images: images.map { .init(contentType: $0.contentType, data: $0.data.base64EncodedString()) },
            context: FeedbackContext.current(screen: screen, colorScheme: colorScheme, viewport: viewport)
        )
        do {
            let result = try await apiService.submitFeedback(request)
            discard()
            lastFiled = result
            return true
        } catch {
            errorMessage = Self.message(for: error)
            return false
        }
    }

    static func message(for error: Error) -> String {
        if case .serverError(_, let message?, _)? = error as? APIError { return message }
        if APIError.isNetworkFailure(error) { return "Couldn’t reach the server. Try again." }
        return "Couldn’t send that. Try again."
    }
}
