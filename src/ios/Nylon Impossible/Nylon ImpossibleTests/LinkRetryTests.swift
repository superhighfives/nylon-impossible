import Testing
import Foundation
@testable import Nylon_Impossible

@Suite("LinkRetry")
struct LinkRetryTests {
    private let then = Date(timeIntervalSince1970: 1_700_000_000)

    private func failedLink() -> APITodoUrl {
        APITodoUrl(
            id: "url-1", todoId: "todo-1", url: "https://tools.usps.com/go/TrackConfirmAction",
            title: "USPS Tracking", description: "Track a package", siteName: "USPS",
            favicon: "https://tools.usps.com/favicon.ico", image: nil, showPreview: false,
            position: "a3", fetchStatus: .failed, fetchedAt: then,
            createdAt: then, updatedAt: then
        )
    }

    @Test("A link queued for a retry is pending, and fresh enough not to read as a lost fetch")
    func pendingAndFresh() {
        let now = Date()
        let queued = failedLink().queuedForRetry(at: now)
        #expect(queued.fetchStatus == .pending)
        #expect(queued.updatedAt == now)
        #expect(Date().timeIntervalSince(queued.updatedAt) < LinkCard.stalePending)
    }

    @Test("Everything else about the link stays")
    func everythingElseStays() {
        let link = failedLink()
        let queued = link.queuedForRetry(at: Date())
        #expect(queued.id == link.id)
        #expect(queued.todoId == link.todoId)
        #expect(queued.url == link.url)
        #expect(queued.title == link.title)
        #expect(queued.description == link.description)
        #expect(queued.siteName == link.siteName)
        #expect(queued.favicon == link.favicon)
        #expect(queued.image == link.image)
        #expect(queued.showPreview == link.showPreview)
        #expect(queued.position == link.position)
        #expect(queued.fetchedAt == link.fetchedAt)
        #expect(queued.createdAt == link.createdAt)
    }
}
