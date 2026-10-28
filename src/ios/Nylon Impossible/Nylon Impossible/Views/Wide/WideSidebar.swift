//
//  WideSidebar.swift
//  Nylon Impossible
//
//  The board's sidebar (iPad and Mac): the wordmark; Today, This week and
//  Someday with counts; a small "Lists" heading, your lists with counts and
//  "New list"; then Done and Settings at the foot. Every list entry — time
//  lists included — takes a dropped todo and moves it there without
//  scrolling. New list, Done and Settings don't.
//
//  Two indicators, which can combine: a grey fill (and semibold) on your
//  list showing in the fourth column, and a 3pt ink bar on the left edge of
//  the column the selection is in. Done never takes the fill; its label goes
//  from muted to ink while it's showing.
//

import SwiftUI

struct WideSidebar: View {
    struct Entry: Identifiable {
        let list: TodoListModel
        /// Open todos in the list.
        let openTodos: Int
        var id: String { list.id }
    }

    let timeLists: [Entry]
    let collections: [Entry]
    /// Your list showing in the fourth column.
    let openColumnId: String?
    /// The column the selection is in: a list's id, `done`, or nil.
    let selectionColumn: String?
    /// Done is what the fourth column shows.
    let doneShowing: Bool
    let doneCount: Int
    let name: String
    let initials: String
    let avatarURL: URL?
    let onTimeList: (TodoListModel) -> Void
    let onCollection: (TodoListModel) -> Void
    /// The New list popover, when it's anchored to this sidebar's button.
    @Binding var newListAnchor: NewListAnchor?
    let onCreateList: (String) -> Void
    let onDone: () -> Void
    let onSettings: () -> Void
    let onDrop: (TodoListModel, UUID) -> Void
    let onSignOut: () -> Void
    /// Send Feedback… in the account menu; nil hides it (not an admin).
    var onFeedback: (() -> Void)?

    @State private var targeted: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s6) {
            Text("Nylon")
                .textStyle(Theme.Fonts.Role.wordmark, tracking: -0.02)
                .foregroundStyle(Theme.Colors.ink)
                .padding(.horizontal, 10)
                .accessibilityAddTraits(.isHeader)

            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(timeLists) { entry in
                        listRow(entry, isOpen: false) { onTimeList(entry.list) }
                    }
                    Text("Lists")
                        .textStyle(Theme.Fonts.Role.label)
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .padding(.top, 18)
                        .padding(.bottom, 6)
                        .padding(.leading, 10)
                        .accessibilityAddTraits(.isHeader)
                    ForEach(collections) { entry in
                        listRow(entry, isOpen: entry.id == openColumnId) { onCollection(entry.list) }
                    }
                    Button { newListAnchor = .sidebar } label: {
                        HStack(spacing: Theme.Space.s2) {
                            Image(systemName: Theme.Icon.add)
                                .font(.system(size: 13, weight: .semibold))
                            Text("New list")
                        }
                        .textStyle(Theme.Fonts.Role.bodyWide)
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .padding(.horizontal, 10)
                        .frame(maxWidth: .infinity, minHeight: Theme.Wide.sidebarRow, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(SidebarButtonStyle())
                    .popover(
                        isPresented: Binding(
                            get: { newListAnchor == .sidebar },
                            set: { if !$0 { newListAnchor = nil } }
                        ),
                        arrowEdge: .trailing
                    ) {
                        NewListForm { name in
                            newListAnchor = nil
                            onCreateList(name)
                        }
                    }
                }
            }
            .scrollBounceBehavior(.basedOnSize)

            VStack(alignment: .leading, spacing: 2) {
                doneRow
                plainRow("Settings", action: onSettings)
                account
                    .padding(.top, Theme.Space.s2)
                Text("n new · j k move · x done\n1 2 3 move to list · p pin")
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .padding(.horizontal, 10)
                    .padding(.top, Theme.Space.s3)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, 28)
        .padding(.horizontal, 10)
        // Navigation chrome in a fixed 248pt column: it stops growing at
        // xxxLarge, like the phone's switcher, so names don't break
        // mid-word. The columns carry each list's name at full size.
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        #if os(macOS)
        // The split view sets the width, and lets it be dragged.
        .frame(maxWidth: .infinity)
        #else
        .frame(width: Theme.Wide.sidebarWidth)
        #endif
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Theme.Colors.canvas)
    }

    private func listRow(_ entry: Entry, isOpen: Bool, action: @escaping () -> Void) -> some View {
        let isTargeted = targeted == entry.id
        return Button(action: action) {
            HStack {
                Text(entry.list.name)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if entry.openTodos > 0 {
                    Text("\(entry.openTodos)")
                        .fontWeight(.regular)
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .monospacedDigit()
                }
            }
            .textStyle(Theme.Fonts.Role.sidebarItem)
            .fontWeight(entry.list.isSystem || isOpen ? .semibold : .medium)
            .foregroundStyle(Theme.Colors.ink)
            .padding(.horizontal, 10)
            .frame(minHeight: Theme.Wide.sidebarRow)
            .background(
                RoundedRectangle(cornerRadius: Theme.Wide.sidebarRadius, style: .continuous)
                    .fill(Theme.Colors.fill)
                    .opacity(isOpen || isTargeted ? 1 : 0)
            )
            .overlay(alignment: .leading) { SelectionBar(isOn: selectionColumn == entry.id) }
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Wide.sidebarRadius, style: .continuous)
                    .strokeBorder(Theme.Colors.ink, lineWidth: 1.5)
                    .opacity(isTargeted ? 1 : 0)
            )
            .contentShape(Rectangle())
            .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: isTargeted)
        }
        .buttonStyle(SidebarButtonStyle())
        .pointingHandCursor()
        .accessibilityAddTraits(isOpen ? .isSelected : [])
        // "This week, 6 todos" — the count is the value, not a second
        // number read out in the label.
        .accessibilityLabel(entry.list.name)
        .accessibilityValue(WideSidebar.countText(entry.openTodos))
        .accessibilityHint(entry.list.isSystem ? "Goes into its column" : "Opens it in the fourth column")
        .todoDropTarget(isTargeted: Binding(
            get: { targeted == entry.id },
            set: { isOver in
                if isOver {
                    targeted = entry.id
                } else if targeted == entry.id {
                    targeted = nil
                }
            }
        )) { onDrop(entry.list, $0) }
    }

    /// A list's open count as VoiceOver reads it.
    static func countText(_ count: Int) -> String {
        switch count {
        case 0: return "No todos"
        case 1: return "1 todo"
        default: return "\(count) todos"
        }
    }

    /// Done, with a check: muted until it's what the fourth column shows.
    private var doneRow: some View {
        Button(action: onDone) {
            HStack(spacing: Theme.Space.s2) {
                Image(systemName: Theme.Icon.done)
                    .font(.system(size: 13, weight: .semibold))
                Text("Done")
                    .frame(maxWidth: .infinity, alignment: .leading)
                if doneCount > 0 {
                    Text("\(doneCount)")
                        .monospacedDigit()
                }
            }
            .textStyle(Theme.Fonts.Role.bodyWide)
            .fontWeight(.medium)
            .foregroundStyle(doneShowing ? Theme.Colors.ink : Theme.Colors.inkMuted)
            .padding(.horizontal, 10)
            .frame(minHeight: Theme.Wide.sidebarRow)
            .overlay(alignment: .leading) { SelectionBar(isOn: selectionColumn == "done") }
            .contentShape(Rectangle())
        }
        .buttonStyle(SidebarButtonStyle())
        .accessibilityAddTraits(doneShowing ? .isSelected : [])
        .accessibilityLabel("Done")
        .accessibilityValue(WideSidebar.countText(doneCount))
        .accessibilityHint("Shows Done in the fourth column")
    }

    private func plainRow(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textStyle(Theme.Fonts.Role.bodyWide)
                .fontWeight(.medium)
                .foregroundStyle(Theme.Colors.ink)
                .padding(.horizontal, 10)
                .frame(minHeight: Theme.Wide.sidebarRow)
                .contentShape(Rectangle())
        }
        .buttonStyle(SidebarButtonStyle())
    }

    private var account: some View {
        Menu {
            if let onFeedback {
                Button("Send feedback…", systemImage: "exclamationmark.bubble", action: onFeedback)
            }
            Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right", action: onSignOut)
        } label: {
            HStack(spacing: Theme.Space.s2) {
                AvatarView(imageURL: avatarURL, initials: initials, size: 24)
                // Ink, not muted: a Menu label is drawn dimmed, which took
                // muted ink under 4.5:1.
                Text(name)
                    .lineLimit(2)
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.ink)
            }
            .padding(.horizontal, 10)
            .frame(minHeight: Theme.Wide.sidebarRow)
            .contentShape(Rectangle())
        }
        #if os(macOS)
        // Keep the avatar-and-name label; the Mac's default menu button
        // would draw it as a bezelled pop-up.
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        #endif
        .accessibilityLabel("Account, \(name)")
    }
}

/// The 3pt ink bar on a sidebar entry's left edge: the column the selection
/// is in. Ink, not yellow — yellow on white is about 1.3:1, under the 3:1 an
/// indicator needs.
private struct SelectionBar: View {
    let isOn: Bool

    var body: some View {
        Capsule()
            .fill(Theme.Colors.ink)
            .frame(width: 3)
            .padding(.vertical, 6)
            // On the entry's own edge: the list scrolls, and a scroll view
            // clips anything drawn outside it.
            .opacity(isOn ? 1 : 0)
            .accessibilityHidden(true)
    }
}

/// Sidebar entries tint under the pointer and while pressed, and nothing else.
struct SidebarButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        SidebarButtonBody(configuration: configuration)
    }

    private struct SidebarButtonBody: View {
        let configuration: ButtonStyleConfiguration
        @State private var isHovering = false

        var body: some View {
            configuration.label
                .background(
                    RoundedRectangle(cornerRadius: Theme.Wide.sidebarRadius, style: .continuous)
                        .fill(Theme.Colors.fill)
                        .opacity(configuration.isPressed || isHovering ? 0.7 : 0)
                )
                .onHover { isHovering = $0 }
        }
    }
}
