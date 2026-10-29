//
//  LinkInput.swift
//  Nylon Impossible
//
//  A link typed or pasted into the detail's "Paste a link" field, as the
//  http(s) URL to store, or nil when it doesn't look like a link. The same
//  rule as `normalizeLink` in @nylon-impossible/shared, which the API applies
//  too: https:// is added when there's no scheme ("localhost:3000" is a host
//  and port, not a scheme), the host needs a dot (or is localhost), and a
//  link carrying a username or password is refused.
//

import Foundation

enum LinkInput {
    static func normalize(_ raw: String) -> String? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.rangeOfCharacter(from: .whitespacesAndNewlines) == nil else { return nil }
        let hasScheme = text.range(of: "^[A-Za-z][A-Za-z0-9+.-]*:(?![0-9])", options: .regularExpression) != nil
        guard let url = URL(string: hasScheme ? text : "https://\(text)"),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let scheme = components.scheme?.lowercased(), scheme == "http" || scheme == "https",
              components.user == nil, components.password == nil,
              let host = components.host?.lowercased(), !host.isEmpty
        else { return nil }
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        guard host == "localhost" || (labels.count >= 2 && !labels.contains(where: \.isEmpty)) else { return nil }
        var normalized = components
        normalized.scheme = scheme
        normalized.host = host
        if normalized.path.isEmpty { normalized.path = "/" }
        return normalized.string
    }
}
