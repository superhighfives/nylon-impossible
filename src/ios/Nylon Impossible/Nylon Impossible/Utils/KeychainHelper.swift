//
//  KeychainHelper.swift
//  Nylon Impossible
//
//  Created by Claude on 4/5/26.
//

import Foundation
import Security

enum KeychainError: Error, LocalizedError {
    case encodingFailed
    case saveFailed(status: OSStatus)

    var errorDescription: String? {
        switch self {
        case .encodingFailed:
            return "Failed to encode data for Keychain"
        case .saveFailed(let status):
            return "Keychain save failed with status \(status)"
        }
    }
}

enum KeychainHelper {
    /// Shared service name used by the main app and extensions.
    /// The actual access-group scoping is handled by the `keychain-access-groups`
    /// entitlement — no need to hardcode `kSecAttrAccessGroup` in Swift, which would
    /// require a runtime-expanded team ID prefix.
    private static let service = "com.superhighfives.Nylon-Impossible.shared"

    static func save(key: String, data: Data) throws {
        let searchQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]

        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]

        // Try updating an existing item first (atomic — old value preserved on failure)
        let updateStatus = SecItemUpdate(searchQuery as CFDictionary, attributes as CFDictionary)

        if updateStatus == errSecItemNotFound {
            // No existing item — add a new one
            var addQuery = searchQuery
            addQuery.merge(attributes) { _, new in new }
            let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw KeychainError.saveFailed(status: addStatus)
            }
        } else if updateStatus != errSecSuccess {
            throw KeychainError.saveFailed(status: updateStatus)
        }
    }

    static func load(key: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess else { return nil }
        return result as? Data
    }

    static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]

        SecItemDelete(query as CFDictionary)
    }

    // MARK: - Convenience

    static func saveString(_ value: String, forKey key: String) throws {
        guard let data = value.data(using: .utf8) else {
            throw KeychainError.encodingFailed
        }
        try save(key: key, data: data)
    }

    static func loadString(forKey key: String) -> String? {
        guard let data = load(key: key) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func saveDate(_ date: Date, forKey key: String) throws {
        let timestamp = date.timeIntervalSince1970
        let data = withUnsafeBytes(of: timestamp) { Data($0) }
        try save(key: key, data: data)
    }

    static func loadDate(forKey key: String) -> Date? {
        guard let data = load(key: key),
              data.count == MemoryLayout<TimeInterval>.size else { return nil }
        let timestamp = data.withUnsafeBytes { $0.loadUnaligned(as: TimeInterval.self) }
        return Date(timeIntervalSince1970: timestamp)
    }
}
