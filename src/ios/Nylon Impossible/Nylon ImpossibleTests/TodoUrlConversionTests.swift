import Testing
import Foundation
@testable import Nylon_Impossible

@Suite("TodoUrl conversion")
struct TodoUrlConversionTests {
    @Test("apply(_:) leaves a link the same as a fresh init(from:)")
    func applyMatchesInit() {
        let then = Date(timeIntervalSince1970: 1_700_000_000)
        let later = Date(timeIntervalSince1970: 1_700_000_500)

        // Every field differs between the two, so a field apply(_:) skips shows up.
        let a = APITodoUrl(
            id: "url-1", todoId: "todo-1", url: "https://example.com",
            title: "Example", description: "An example", siteName: "Example",
            favicon: "https://example.com/favicon.ico", image: nil, showPreview: true,
            position: "a0", fetchStatus: .pending, fetchedAt: nil,
            createdAt: then, updatedAt: then
        )
        let b = APITodoUrl(
            id: "url-1", todoId: "todo-1", url: "https://example.org/moved",
            title: "Moved", description: "Somewhere else", siteName: "Example Org",
            favicon: "https://example.org/favicon.ico", image: "https://example.org/og.png",
            showPreview: false, position: "a1", fetchStatus: .fetched, fetchedAt: later,
            createdAt: later, updatedAt: later
        )

        let applied = TodoUrl(from: a)
        applied.apply(b)
        let fresh = TodoUrl(from: b)

        #expect(applied.id == fresh.id)
        #expect(applied.url == fresh.url)
        #expect(applied.title == fresh.title)
        #expect(applied.itemDescription == fresh.itemDescription)
        #expect(applied.siteName == fresh.siteName)
        #expect(applied.favicon == fresh.favicon)
        #expect(applied.image == fresh.image)
        #expect(applied.showPreview == fresh.showPreview)
        #expect(applied.position == fresh.position)
        #expect(applied.fetchStatus == fresh.fetchStatus)
        #expect(applied.fetchedAt == fresh.fetchedAt)
        #expect(applied.createdAt == fresh.createdAt)
        #expect(applied.updatedAt == fresh.updatedAt)
    }

    @Test("apply(_:) reads an older server's missing showPreview as true")
    func applyDefaultsShowPreview() {
        let then = Date(timeIntervalSince1970: 1_700_000_000)
        func link(showPreview: Bool?) -> APITodoUrl {
            APITodoUrl(
                id: "url-1", todoId: "todo-1", url: "https://example.com",
                title: nil, description: nil, siteName: nil, favicon: nil,
                showPreview: showPreview, position: "a0", fetchStatus: .fetched,
                fetchedAt: then, createdAt: then, updatedAt: then
            )
        }

        let stored = TodoUrl(from: link(showPreview: false))
        stored.apply(link(showPreview: nil))
        #expect(stored.showPreview == true)
    }
}
