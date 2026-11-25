//
//  PrivacyManifestTests.swift
//  Nylon ImpossibleTests
//
//  Each shipping bundle's PrivacyInfo.xcprivacy (#847). App Store Connect
//  rejects an upload whose UserDefaults use isn't declared (ITMS-91053), and
//  it reads the built bundles, so these do too: the app is the test host, and
//  the widget and share extension are in its PlugIns.
//

import Foundation
import Testing

@Suite("PrivacyManifest")
struct PrivacyManifestTests {
    private static let userDefaults = "NSPrivacyAccessedAPICategoryUserDefaults"
    static let extensions = ["Nylon Widget.appex", "Nylon Share.appex"]

    /// The manifest in `bundle`, parsed, or nil when the bundle has none.
    private static func manifest(in bundle: Bundle) throws -> [String: Any]? {
        guard let url = bundle.url(forResource: "PrivacyInfo", withExtension: "xcprivacy") else { return nil }
        let data = try Data(contentsOf: url)
        return try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
    }

    /// The reasons `manifest` gives for `category`, in order.
    private static func reasons(_ manifest: [String: Any], for category: String) -> [String] {
        let types = manifest["NSPrivacyAccessedAPITypes"] as? [[String: Any]] ?? []
        let matches = types.filter { $0["NSPrivacyAccessedAPIType"] as? String == category }
        return matches.flatMap { $0["NSPrivacyAccessedAPITypeReasons"] as? [String] ?? [] }
    }

    private static func extensionBundle(_ name: String) -> Bundle? {
        guard let plugIns = Bundle.main.builtInPlugInsURL else { return nil }
        return Bundle(url: plugIns.appendingPathComponent(name))
    }

    @Test("The app declares its own and the App Group's UserDefaults, and no tracking")
    func app() throws {
        let manifest = try #require(try Self.manifest(in: .main))
        #expect(Set(Self.reasons(manifest, for: Self.userDefaults)) == ["CA92.1", "1C8F.1"])
        #expect(Self.reasons(manifest, for: Self.userDefaults).count == 2)
        #expect(manifest["NSPrivacyTracking"] as? Bool == false)
        #expect((manifest["NSPrivacyTrackingDomains"] as? [String])?.isEmpty == true)
    }

    @Test("The app collects email address and user content, linked, for App Functionality only")
    func appCollectedData() throws {
        let manifest = try #require(try Self.manifest(in: .main))
        let collected = try #require(manifest["NSPrivacyCollectedDataTypes"] as? [[String: Any]])
        let types = collected.compactMap { $0["NSPrivacyCollectedDataType"] as? String }
        #expect(Set(types) == ["NSPrivacyCollectedDataTypeEmailAddress", "NSPrivacyCollectedDataTypeOtherUserContent"])
        #expect(types.count == 2)
        for entry in collected {
            #expect(entry["NSPrivacyCollectedDataTypeLinked"] as? Bool == true)
            #expect(entry["NSPrivacyCollectedDataTypeTracking"] as? Bool == false)
            #expect(entry["NSPrivacyCollectedDataTypePurposes"] as? [String] == ["NSPrivacyCollectedDataTypePurposeAppFunctionality"])
        }
    }

    @Test("Both extensions are embedded in the app")
    func extensionsFound() {
        for name in Self.extensions {
            #expect(Self.extensionBundle(name) != nil, "\(name) isn't in the app's PlugIns")
        }
    }

    @Test("Each extension declares the App Group's UserDefaults, and no tracking", arguments: PrivacyManifestTests.extensions)
    func extensionManifest(name: String) throws {
        let bundle = try #require(Self.extensionBundle(name), "\(name) isn't in the app's PlugIns")
        let manifest = try #require(try Self.manifest(in: bundle), "\(name) has no PrivacyInfo.xcprivacy")
        #expect(Self.reasons(manifest, for: Self.userDefaults) == ["1C8F.1"])
        #expect(manifest["NSPrivacyTracking"] as? Bool == false)
        #expect((manifest["NSPrivacyTrackingDomains"] as? [String])?.isEmpty == true)
    }
}
