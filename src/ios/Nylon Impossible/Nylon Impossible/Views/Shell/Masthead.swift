//
//  Masthead.swift
//  Nylon Impossible
//
//  The editorial title block under the switcher: the list name in Archivo,
//  a subline, and a hairline. It scrolls with the page (the switcher stays).
//  The five top-level pages keep the banner's space above the title (two
//  lines, 20pt below the switcher and 20pt clear of the title) whether or not
//  it's showing, so titles sit at the same height on every page and don't
//  move when the overnight pill comes or goes.
//

import SwiftUI

struct Masthead<Accessory: View>: View {
    let title: String
    let subline: String
    /// "‹ Lists" over a collection; nil on the top-level pages.
    var back: (label: String, action: () -> Void)?
    /// A top-level phone page: keep the banner's space above the title.
    var keepsBanner = false
    /// Today's overnight pill, in that space.
    var banner: AnyView?
    /// A trailing control on the back row — the collection's ⋯ menu.
    @ViewBuilder var accessory: () -> Accessory

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if keepsBanner {
                // Grows at large text sizes, where two lines of pill don't fit.
                ZStack(alignment: .bottomLeading) { banner }
                    .frame(maxWidth: .infinity, minHeight: Theme.Space.rowMinHeight, alignment: .bottomLeading)
                .padding(.horizontal, Theme.Phone.gutter)
                .padding(.vertical, Theme.Space.s5)
            }
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
                .padding(.top, keepsBanner ? 0 : back == nil ? Theme.Space.s6 : Theme.Space.s1)
                .padding(.horizontal, Theme.Phone.gutter)
                .accessibilityAddTraits(.isHeader)

            Text(subline)
                .textStyle(Theme.Fonts.Role.subline)
                .foregroundStyle(Theme.Colors.inkMuted)
                // Wraps rather than clipping inside a List row's header.
                .fixedSize(horizontal: false, vertical: true)
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
    init(
        title: String,
        subline: String,
        back: (label: String, action: () -> Void)? = nil,
        keepsBanner: Bool = false,
        banner: AnyView? = nil
    ) {
        self.init(title: title, subline: subline, back: back, keepsBanner: keepsBanner, banner: banner) { EmptyView() }
    }
}

/// A tilde, drawn: there's no SF Symbol for one. Used for the empty line's
/// mark, the web's `EmptyLine` squiggle.
private struct Squiggle: Shape {
    func path(in rect: CGRect) -> Path {
        let sx = rect.width / 16
        let sy = rect.height / 8
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + x * sx, y: rect.minY + y * sy)
        }
        var path = Path()
        path.move(to: point(1, 4))
        path.addCurve(to: point(8, 4), control1: point(2.5, 0.5), control2: point(5.5, 0.5))
        path.addCurve(to: point(15, 4), control1: point(10.5, 7.5), control2: point(13.5, 7.5))
        return path
    }
}

/// The written empty state, drawn as a row: a squiggle in the "+ Add"
/// composer's icon slot and "Nothing today." at a row title's size, so it sits
/// where the first todo will and that todo takes its place without moving
/// anything. Nothing here can be tapped, so the squiggle and the words are
/// subtle, lighter than a row. When there's somewhere to go,
/// "4 waiting in This week →" sits under the words.
struct EmptyLine: View {
    let text: String
    var link: (text: String, action: () -> Void)?

    @Environment(\.isWideLayout) private var isWide

    /// Where the words start: the composer's, after its icon slot.
    private var textInset: CGFloat { Theme.Phone.checkbox + Theme.Space.s3 }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: Theme.Space.s3) {
                Squiggle()
                    .stroke(style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
                    .frame(width: 16, height: 8)
                    .frame(width: Theme.Phone.checkbox)
                    .accessibilityHidden(true)
                Text(text)
                    .textStyle(isWide ? Theme.Fonts.Role.rowTitleWide : Theme.Fonts.Role.rowTitle)
                    .fontWeight(.regular)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .foregroundStyle(Theme.Colors.inkSubtle)
            .padding(.vertical, Theme.Space.s3)
            .frame(minHeight: Theme.Space.rowMinHeight)
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
                .padding(.leading, textInset)
            }
        }
        .padding(.horizontal, isWide ? Theme.Wide.gutter : Theme.Phone.gutter)
        .padding(.bottom, link == nil ? 0 : Theme.Space.s4)
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

    static let done = "Finished todos, by day"

    /// A page or column before its lists have synced, on phone and iPad.
    static let loading = "Getting your lists…"

    /// "Sunday, October 18".
    static func longDate(_ date: Date, locale: Locale = .current) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.setLocalizedDateFormatFromTemplate("EEEE MMMM d")
        return formatter.string(from: date)
    }
}
