import CoreGraphics
import Foundation
import SwiftUI
import Testing
@testable import Nylon_Impossible

/// The admin-only feedback inbox: what `/users/me` says about admin, the
/// context each issue carries, and the image limits the API enforces.
@Suite("Feedback")
@MainActor
struct FeedbackTests {
    // MARK: - isAdmin

    private func decodeUser(_ extra: String) throws -> APIUser {
        let json = """
        {"id":"u","email":"a@b.c","theme":"system",
         "createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"\(extra)}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIUser.self, from: Data(json.utf8))
    }

    @Test("Reads isAdmin")
    func readsIsAdmin() throws {
        #expect(try decodeUser(#","isAdmin":true"#).isAdmin == true)
        #expect(try decodeUser(#","isAdmin":false"#).isAdmin == false)
    }

    @Test("An older API without isAdmin still decodes")
    func missingIsAdmin() throws {
        #expect(try decodeUser("").isAdmin == nil)
    }

    @Test("Preferences pick up isAdmin, and sign-out clears it")
    func preferencesIsAdmin() async {
        let api = MockAPIService()
        api.getMeResponse = APIUser(
            id: "u", email: "a@b.c", theme: "system", isAdmin: true,
            createdAt: Date(timeIntervalSince1970: 0), updatedAt: Date(timeIntervalSince1970: 0)
        )
        let preferences = UserPreferencesService(apiService: api)
        #expect(preferences.isAdmin == false)
        await preferences.fetchPreferences()
        #expect(preferences.isAdmin)
        preferences.resetLocalState()
        #expect(preferences.isAdmin == false)
    }

    // MARK: - Context

    @Test("Platform label per device")
    func platformLabels() {
        #expect(FeedbackContext.platform(for: .phone) == "ios")
        #expect(FeedbackContext.platform(for: .pad) == "ipados")
        #expect(FeedbackContext.platform(for: .mac) == "mac")
    }

    @Test("OS description drops a zero patch")
    func osDescription() {
        let v26 = OperatingSystemVersion(majorVersion: 26, minorVersion: 1, patchVersion: 0)
        let v26p = OperatingSystemVersion(majorVersion: 26, minorVersion: 0, patchVersion: 1)
        #expect(FeedbackContext.osDescription(idiom: .phone, version: v26) == "iOS 26.1")
        #expect(FeedbackContext.osDescription(idiom: .pad, version: v26p) == "iPadOS 26.0.1")
        #expect(FeedbackContext.osDescription(idiom: .mac, version: v26) == "macOS 26.1")
    }

    @Test("Current context fills in what the app knows")
    func currentContext() {
        let context = FeedbackContext.current(
            screen: "Today",
            colorScheme: .dark,
            viewport: CGSize(width: 390.4, height: 844),
            idiom: .phone
        )
        #expect(context.platform == "ios")
        #expect(context.screen == "Today")
        #expect(context.colorScheme == "dark")
        #expect(context.viewport == "390×844")
        #expect(context.os?.hasPrefix("iOS ") == true)
        #expect(context.device?.isEmpty == false)
        #expect(context.timezone == TimeZone.autoupdatingCurrent.identifier)
    }

    @Test("Long fields are cut to the API's limit")
    func truncation() {
        let long = String(repeating: "x", count: 500)
        let context = FeedbackContext(platform: "mac", screen: long).truncated()
        #expect(context.screen?.count == FeedbackContext.maxFieldLength)
    }

    @Test("Nil fields are left out of the JSON")
    func encodesWithoutNils() throws {
        let data = try JSONEncoder().encode(FeedbackContext(platform: "ios", screen: "Today"))
        let json = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(Set(json.keys) == ["platform", "screen"])
    }

    // MARK: - Images

    @Test("Images over 2400px on the long edge are scaled down")
    func targetSize() {
        #expect(FeedbackImageEncoder.targetSize(for: CGSize(width: 1320, height: 2868)) == CGSize(width: 1105, height: 2400))
        #expect(FeedbackImageEncoder.targetSize(for: CGSize(width: 3000, height: 1500)) == CGSize(width: 2400, height: 1200))
        #expect(FeedbackImageEncoder.targetSize(for: CGSize(width: 1000, height: 800)) == CGSize(width: 1000, height: 800))
    }

    @Test("PNG when it fits under 5 MB")
    func choosesPNG() {
        let png = Data(count: FeedbackImageEncoder.maxBytes)
        let chosen = FeedbackImageEncoder.choose(png: png) { _ in Data(count: 10) }
        #expect(chosen?.contentType == "image/png")
    }

    @Test("JPEG when the PNG is over 5 MB, stepping quality down until it fits")
    func fallsBackToJPEG() {
        let png = Data(count: FeedbackImageEncoder.maxBytes + 1)
        var qualities: [CGFloat] = []
        let chosen = FeedbackImageEncoder.choose(png: png) { quality in
            qualities.append(quality)
            return Data(count: quality > 0.7 ? FeedbackImageEncoder.maxBytes + 1 : 100)
        }
        #expect(chosen?.contentType == "image/jpeg")
        #expect(chosen?.data.count == 100)
        #expect(qualities == [0.85, 0.6])
    }

    @Test("Nothing when even the smallest JPEG is too big")
    func givesUp() {
        let tooBig = Data(count: FeedbackImageEncoder.maxBytes + 1)
        #expect(FeedbackImageEncoder.choose(png: tooBig) { _ in tooBig } == nil)
    }

    @Test("A real image encodes as a PNG at its own size")
    func encodesImage() throws {
        let image = try #require(Self.solidImage(width: 40, height: 20))
        let encoded = try #require(FeedbackImageEncoder.encode(image))
        #expect(encoded.contentType == "image/png")
        #expect(encoded.pixelSize == CGSize(width: 40, height: 20))
        #expect(FeedbackImageEncoder.encode(data: encoded.data)?.pixelSize == CGSize(width: 40, height: 20))
    }

    // MARK: - Service

    @Test("Submitting sends the draft, then clears it and reports the issue")
    func submits() async throws {
        let api = MockAPIService()
        let feedback = FeedbackService(apiService: api)
        feedback.screen = "Today"
        feedback.present(with: Self.solidImage(width: 10, height: 10))
        feedback.text = "  The tick jumps  "
        #expect(feedback.isPresented)
        #expect(feedback.images.count == 1)

        #expect(await feedback.submit())
        let request = try #require(api.lastFeedbackRequest)
        #expect(request.description == "The tick jumps")
        #expect(request.images.first?.contentType == "image/png")
        #expect(request.context.screen == "Today")
        #expect(feedback.lastFiled?.issueNumber == 1)
        #expect(feedback.isPresented == false)
        #expect(feedback.text.isEmpty)
        #expect(feedback.images.isEmpty)
    }

    @Test("A failed submit keeps the draft and says why")
    func failedSubmit() async {
        let api = MockAPIService()
        api.submitFeedbackError = APIError.serverError(503, "Feedback isn’t set up", url: "/feedback")
        let feedback = FeedbackService(apiService: api)
        feedback.present()
        feedback.text = "Something"
        #expect(await feedback.submit() == false)
        #expect(feedback.errorMessage == "Feedback isn’t set up")
        #expect(feedback.text == "Something")
        #expect(feedback.isPresented)
    }

    @Test("An empty description can't be sent")
    func emptyDescription() async {
        let api = MockAPIService()
        let feedback = FeedbackService(apiService: api)
        feedback.text = "   "
        #expect(feedback.canSubmit == false)
        #expect(await feedback.submit() == false)
        #expect(api.lastFeedbackRequest == nil)
    }

    @Test("No more than four images")
    func imageLimit() throws {
        let feedback = FeedbackService(apiService: MockAPIService())
        let image = try #require(Self.solidImage(width: 4, height: 4))
        for _ in 0..<6 { feedback.add(image) }
        #expect(feedback.images.count == FeedbackService.maxImages)
        #expect(feedback.canAddImages == false)
    }

    private static func solidImage(width: Int, height: Int) -> CGImage? {
        guard let context = CGContext(
            data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        context.setFillColor(CGColor(red: 1, green: 0.9, blue: 0.16, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        return context.makeImage()
    }
}
