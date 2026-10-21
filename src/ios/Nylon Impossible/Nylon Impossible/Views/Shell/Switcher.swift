//
//  Switcher.swift
//  Nylon Impossible
//
//  The top row: Today · This Week · Someday · Lists, with the avatar on the
//  right. The current title is in ink with a yellow underline that follows the
//  pager as you swipe; the others are muted. The three time titles are drop
//  targets — dropping a dragged row on "This Week" moves it there.
//

import SwiftUI

struct Switcher: View {
    typealias Page = TodoViewModel.Page

    let current: Page
    /// The pager's position in pages (0 = Today, 1.5 = halfway to Someday),
    /// so the underline tracks a swipe rather than jumping at the end of it.
    let progress: CGFloat
    let avatarURL: URL?
    let initials: String
    let onSelect: (Page) -> Void
    /// A todo id dropped on one of the time titles.
    let onDrop: (Page, UUID) -> Void
    let onAvatar: () -> Void

    @State private var frames: [Page: CGRect] = [:]
    @State private var targeted: Page?

    var body: some View {
        HStack(spacing: Theme.Space.s3) {
            HStack(spacing: 18) {
                ForEach(Page.allCases, id: \.self) { page in
                    title(page)
                }
            }
            .coordinateSpace(name: "switcher")
            .overlay(alignment: .bottomLeading) { underline }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button(action: onAvatar) {
                AvatarView(imageURL: avatarURL, initials: initials)
                    .frame(width: Theme.Space.rowMinHeight, height: Theme.Space.rowMinHeight)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .padding(.trailing, -6)
            .accessibilityLabel("Account")
            .accessibilityHint("Done, Settings and sign out")
        }
        .padding(.leading, Theme.Phone.gutter)
        .padding(.trailing, Theme.Space.s4)
        .padding(.top, Theme.Space.s1)
        .frame(minHeight: Theme.Phone.switcherHeight)
    }

    private func title(_ page: Page) -> some View {
        let isCurrent = page == current
        return Button {
            onSelect(page)
        } label: {
            Text(page.title)
                .textStyle(Theme.Fonts.Role.control, tracking: Theme.Tracking.title)
                .foregroundStyle(isCurrent || targeted == page ? Theme.Colors.ink : Theme.Colors.inkMuted)
                .lineLimit(1)
                .fixedSize()
                .frame(minHeight: Theme.Phone.switcherHeight)
                .padding(.horizontal, targeted == page ? Theme.Space.s2 : 0)
                .background(
                    RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous)
                        .fill(Theme.Colors.fill)
                        .opacity(targeted == page ? 1 : 0)
                        .padding(.vertical, Theme.Space.s1)
                )
                .contentShape(Rectangle())
                .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: targeted)
        }
        .buttonStyle(.plain)
        .onGeometryChange(for: CGRect.self) { proxy in
            proxy.frame(in: .named("switcher"))
        } action: { frame in
            frames[page] = frame
        }
        .accessibilityAddTraits(isCurrent ? [.isSelected, .isHeader] : [])
        .accessibilityHint(page.systemKind == nil ? "" : "Drop a todo here to move it")
        .modifier(DropTarget(page: page, targeted: $targeted, onDrop: onDrop))
    }

    /// 2pt of brand yellow under the current title, interpolated between the
    /// two titles either side of the pager's position.
    @ViewBuilder
    private var underline: some View {
        let pages = Page.allCases
        let clamped = min(max(progress, 0), CGFloat(pages.count - 1))
        let lower = Int(clamped.rounded(.down))
        let upper = min(lower + 1, pages.count - 1)
        let fraction = clamped - CGFloat(lower)
        if let from = frames[pages[lower]], let to = frames[pages[upper]] {
            let x = from.minX + (to.minX - from.minX) * fraction
            let width = from.width + (to.width - from.width) * fraction
            Rectangle()
                .fill(Theme.Colors.brand)
                .frame(width: width, height: 2)
                .offset(x: x)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}

/// The time titles accept a dragged row (its id, as plain text). Lists isn't a
/// list, so it isn't a target.
private struct DropTarget: ViewModifier {
    let page: Switcher.Page
    @Binding var targeted: Switcher.Page?
    let onDrop: (Switcher.Page, UUID) -> Void

    func body(content: Content) -> some View {
        if page.systemKind == nil {
            content
        } else {
            content.todoDropTarget(
                isTargeted: Binding(
                    get: { targeted == page },
                    set: { isOver in
                        if isOver {
                            targeted = page
                        } else if targeted == page {
                            targeted = nil
                        }
                    }
                )
            ) { id in
                onDrop(page, id)
            }
        }
    }
}
