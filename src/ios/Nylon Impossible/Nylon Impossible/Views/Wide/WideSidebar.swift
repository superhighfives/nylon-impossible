//
//  WideSidebar.swift
//  Nylon Impossible
//
//  The iPad sidebar: the wordmark; Today, This Week and Someday with counts;
//  a small "Lists" heading, your lists with counts and "New list"; then Done
//  and Settings at the foot. Every list entry — time lists included — takes a
//  dropped todo and moves it there without scrolling. New list, Done and
//  Settings don't.
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
    /// The collection open as the fourth column.
    let openColumnId: String?
    /// The panel showing Done or Settings, if either.
    let panel: AccountRoute?
    let doneCount: Int
    let name: String
    let initials: String
    let avatarURL: URL?
    let onTimeList: (TodoListModel) -> Void
    let onCollection: (TodoListModel) -> Void
    let onNewList: () -> Void
    let onPanel: (AccountRoute) -> Void
    let onDrop: (TodoListModel, UUID) -> Void
    let onSignOut: () -> Void

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
                        listRow(entry, isCurrent: false) { onTimeList(entry.list) }
                    }
                    Text("Lists")
                        .textStyle(Theme.Fonts.Role.label)
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .padding(.top, 18)
                        .padding(.bottom, 6)
                        .padding(.leading, 10)
                        .accessibilityAddTraits(.isHeader)
                    ForEach(collections) { entry in
                        listRow(entry, isCurrent: entry.id == openColumnId) { onCollection(entry.list) }
                    }
                    Button(action: onNewList) {
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
                }
            }
            .scrollBounceBehavior(.basedOnSize)

            VStack(alignment: .leading, spacing: 2) {
                plainRow("Done", detail: doneCount > 0 ? "\(doneCount)" : nil, isCurrent: panel == .done) { onPanel(.done) }
                plainRow("Settings", isCurrent: panel == .settings) { onPanel(.settings) }
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
        .frame(width: Theme.Wide.sidebarWidth)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Theme.Colors.canvas)
    }

    private func listRow(_ entry: Entry, isCurrent: Bool, action: @escaping () -> Void) -> some View {
        let isTargeted = targeted == entry.id
        return Button(action: action) {
            HStack {
                Text(entry.list.name)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if entry.openTodos > 0 {
                    Text("\(entry.openTodos)")
                        .fontWeight(.regular)
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .monospacedDigit()
                }
            }
            .textStyle(Theme.Fonts.Role.sidebarItem)
            .foregroundStyle(Theme.Colors.ink)
            .padding(.horizontal, 10)
            .frame(minHeight: Theme.Wide.sidebarRow)
            .background(
                RoundedRectangle(cornerRadius: Theme.Wide.sidebarRadius, style: .continuous)
                    .fill(Theme.Colors.fill)
                    .opacity(isCurrent || isTargeted ? 1 : 0)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Wide.sidebarRadius, style: .continuous)
                    .strokeBorder(Theme.Colors.ink, lineWidth: 1.5)
                    .opacity(isTargeted ? 1 : 0)
            )
            .contentShape(Rectangle())
            .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: isTargeted)
        }
        .buttonStyle(SidebarButtonStyle())
        .accessibilityAddTraits(isCurrent ? .isSelected : [])
        // "This Week, 6 todos" — the count is the value, not a second
        // number read out in the label.
        .accessibilityLabel(entry.list.name)
        .accessibilityValue(WideSidebar.countText(entry.openTodos))
        .accessibilityHint(entry.list.isSystem ? "Shows its column" : (isCurrent ? "Closes its column" : "Opens it as a column"))
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

    private func plainRow(_ title: String, detail: String? = nil, isCurrent: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(title)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let detail {
                    Text(detail)
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .monospacedDigit()
                }
            }
            .textStyle(Theme.Fonts.Role.bodyWide)
            .fontWeight(.medium)
            .foregroundStyle(Theme.Colors.ink)
            .padding(.horizontal, 10)
            .frame(minHeight: Theme.Wide.sidebarRow)
            .background(
                RoundedRectangle(cornerRadius: Theme.Wide.sidebarRadius, style: .continuous)
                    .fill(Theme.Colors.fill)
                    .opacity(isCurrent ? 1 : 0)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(SidebarButtonStyle())
        .accessibilityAddTraits(isCurrent ? .isSelected : [])
    }

    private var account: some View {
        Menu {
            Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right", action: onSignOut)
        } label: {
            HStack(spacing: Theme.Space.s2) {
                AvatarView(imageURL: avatarURL, initials: initials, size: 24)
                Text(name)
                    .lineLimit(1)
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.inkMuted)
            }
            .padding(.horizontal, 10)
            .frame(minHeight: Theme.Wide.sidebarRow)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Account, \(name)")
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
