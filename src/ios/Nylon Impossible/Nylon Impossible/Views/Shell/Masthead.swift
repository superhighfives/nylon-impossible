//
//  Masthead.swift
//  Nylon Impossible
//
//  The editorial title block under the switcher: the list name in Archivo,
//  a subline, and a hairline. It scrolls with the page (the switcher stays).
//

import SwiftUI

struct Masthead<Accessory: View>: View {
    let title: String
    let subline: String
    /// "‹ Lists" over a collection; nil on the four top-level pages.
    var back: (label: String, action: () -> Void)?
    /// A trailing control on the back row — the collection's ⋯ menu.
    @ViewBuilder var accessory: () -> Accessory

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let back {
                HStack {
                    Button(action: back.action) {
                        HStack(spacing: 2) {
                            Image(systemName: Theme.Icon.chevronLeft)
                                .font(.system(size: 16, weight: .semibold))
                            Text(back.label)
                        }
                        .textStyle(Theme.Fonts.Role.control)
                        .fontWeight(.medium)
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .padding(.horizontal, Theme.Space.s2)
                        .frame(minHeight: Theme.Space.rowMinHeight)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.leading, Theme.Space.s3)
                    Spacer()
                    accessory()
                        .padding(.trailing, Theme.Space.s3)
                }
                .padding(.top, Theme.Space.s1)
            }

            Text(title)
                .textStyle(Theme.Fonts.Role.masthead, tracking: Theme.Tracking.masthead)
                .foregroundStyle(Theme.Colors.ink)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .padding(.top, back == nil ? Theme.Space.s6 : Theme.Space.s1)
                .padding(.horizontal, Theme.Phone.gutter)
                .accessibilityAddTraits(.isHeader)

            Text(subline)
                .textStyle(Theme.Fonts.Role.subline)
                .foregroundStyle(Theme.Colors.inkMuted)
                .padding(.top, Theme.Space.s2)
                .padding(.bottom, Theme.Space.s5)
                .padding(.horizontal, Theme.Phone.gutter)

            Hairline()
                .padding(.horizontal, Theme.Phone.gutter)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension Masthead where Accessory == EmptyView {
    init(title: String, subline: String, back: (label: String, action: () -> Void)? = nil) {
        self.init(title: title, subline: subline, back: back) { EmptyView() }
    }
}

/// The written empty state: "Nothing today." and, when there's somewhere to
/// go, "4 waiting in This Week →".
struct EmptyLine: View {
    let text: String
    var link: (text: String, action: () -> Void)?

    @Environment(\.isWideLayout) private var isWide

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s2) {
            Text(text)
                .textStyle(Theme.Fonts.Role.listName, tracking: Theme.Tracking.title)
                .foregroundStyle(Theme.Colors.ink)
            if let link {
                Button(action: link.action) {
                    HStack(spacing: Theme.Space.s1) {
                        Text(link.text)
                        Image(systemName: "arrow.right")
                            .imageScale(.small)
                    }
                    .textStyle(Theme.Fonts.Role.control)
                    .fontWeight(.regular)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .frame(minHeight: Theme.Space.rowMinHeight)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, isWide ? Theme.Wide.gutter : Theme.Phone.gutter)
        .padding(.vertical, Theme.Space.s6)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Copy for each page's masthead subline, kept together so the words match
/// the prototype exactly.
enum MastheadCopy {
    static func todos(_ count: Int) -> String {
        "\(count) \(count == 1 ? "todo" : "todos")"
    }

    static func today(count: Int, now: Date = Date(), locale: Locale = .current) -> String {
        "\(longDate(now, locale: locale)) · \(todos(count))"
    }

    static func thisWeek(count: Int, now: Date = Date(), calendar: Calendar = .current, locale: Locale = .current) -> String {
        let end = calendar.date(byAdding: .day, value: 6, to: now) ?? now
        return "Through \(longDate(end, locale: locale)) · \(todos(count))"
    }

    /// The wide columns' sublines, which leave the count to the sidebar.
    static func columnSubline(_ kind: SystemListKind?, now: Date = Date(), calendar: Calendar = .current, locale: Locale = .current) -> String {
        switch kind {
        case .today: return longDate(now, locale: locale)
        case .thisWeek: return "Through \(longDate(calendar.date(byAdding: .day, value: 6, to: now) ?? now, locale: locale))"
        case .someday: return "Whenever you’re ready"
        default: return "List · never ages"
        }
    }

    static func someday(count: Int) -> String {
        "Whenever you’re ready · \(todos(count))"
    }

    static func lists(count: Int) -> String {
        "\(count) \(count == 1 ? "list" : "lists") · never age"
    }

    /// "Sunday, October 18".
    static func longDate(_ date: Date, locale: Locale = .current) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.setLocalizedDateFormatFromTemplate("EEEE MMMM d")
        return formatter.string(from: date)
    }
}
