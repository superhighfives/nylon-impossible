//
//  TodoDetailSheet+Column.swift
//  Nylon Impossible
//
//  The open todo in the board's fourth column (iPad and Mac), built like the
//  columns beside it rather than as a sheet: the title on the column header's
//  baseline with "In <list>" as its subline, × where a list column's sits, the
//  hairline under the header, and the board's type sizes. List, Due, Repeat
//  and Pin are rows, an icon in the checkbox gutter and a 15pt label, muted
//  when unset. Section labels separate Notes, Subtasks and Links; there are no
//  rules between them.
//

import SwiftUI

extension TodoDetailSheet {
    var columnBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            DetailColumnHeader(subline: "In \(list?.name ?? "Today")", onClose: close) {
                titleField
            }
            Hairline()
                .padding(.horizontal, Theme.Wide.gutter)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    propertyRows
                    if showsDatePicker {
                        datePicker
                            .padding(.leading, Theme.Phone.checkbox + Theme.Space.s3)
                    }
                    notesField
                        .padding(.top, Theme.Space.s4)
                    if todo.recurrence == nil { subtasksSection }
                    linksSection
                    footer
                        .padding(.top, Theme.Space.s6)
                }
                .padding(.horizontal, Theme.Wide.gutter)
                .padding(.top, Theme.Space.s2)
                .padding(.bottom, Theme.Space.s16)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Theme.Colors.surface)
        .task { await loadUrls() }
        .onDisappear(perform: flushEdits)
    }

    var propertyRows: some View {
        let due = todo.dueDate.map { DueLabel.text(for: $0) }
        let listName = list?.name ?? "List"
        let repeatText = todo.recurrence.map { RepeatLabel.text($0.frequency) }
        return VStack(alignment: .leading, spacing: 0) {
            Menu {
                listMenuItems
            } label: {
                PropertyRow(text: listName, systemImage: "list.bullet", isOn: true)
            }
            .menuIndicator(.hidden)
            .buttonStyle(.plain)
            .accessibilityLabel("List, \(listName)")

            Menu {
                dueMenuItems
            } label: {
                PropertyRow(
                    text: due?.text ?? "Due date",
                    systemImage: Theme.Icon.due,
                    isOn: due != nil,
                    tint: due?.overdue == true ? Theme.Colors.overdue : nil
                )
            }
            .menuIndicator(.hidden)
            .buttonStyle(.plain)
            .accessibilityLabel(due.map { "Due, \($0.text)" } ?? "Due, none")

            if subtasks.isEmpty {
                Menu {
                    repeatMenuItems
                } label: {
                    PropertyRow(text: repeatText ?? "Repeat", systemImage: Theme.Icon.repeat, isOn: repeatText != nil)
                }
                .menuIndicator(.hidden)
                .buttonStyle(.plain)
                .accessibilityLabel(repeatText.map { "Repeat, \($0)" } ?? "Repeat, off")
            }

            Button {
                actions.togglePin(todo)
            } label: {
                PropertyRow(text: todo.pinned ? "Pinned" : "Pin", systemImage: "pin", isOn: todo.pinned)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(todo.pinned ? "Unpin" : "Pin to top")
        }
    }
}

/// One of the open todo's properties as a board row: the icon where a
/// todo's checkbox sits, then its value, muted when it isn't set.
struct PropertyRow: View {
    let text: String
    let systemImage: String
    let isOn: Bool
    var tint: Color?

    var body: some View {
        HStack(spacing: Theme.Space.s3) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(tint ?? Theme.Colors.inkMuted)
                .frame(width: Theme.Phone.checkbox)
                .accessibilityHidden(true)
            Text(text)
                .textStyle(isOn ? Theme.Fonts.Role.rowTitleWide : Theme.Fonts.Role.bodyWide)
                .foregroundStyle(tint ?? (isOn ? Theme.Colors.ink : Theme.Colors.inkMuted))
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .frame(minHeight: Theme.Space.rowMinHeight)
        .contentShape(Rectangle())
    }
}

/// The open todo's header, laid out like `BoardColumnHeader` so its subline
/// and the hairline under it line up with the columns beside it. It reads
/// the board's shared heights but doesn't add to them: a long title grows
/// this header alone rather than pushing every column's title down.
struct DetailColumnHeader<Title: View>: View {
    let subline: String
    let onClose: () -> Void
    @ViewBuilder var title: () -> Title

    @ScaledMetric(relativeTo: .largeTitle) private var headerHeight = Theme.Wide.columnHeader + 44
    @Environment(\.boardHeaderHeights) private var shared

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            title()
                // Clear of the × in the corner.
                .padding(.trailing, Theme.Space.s8)
            Text(subline)
                .textStyle(Theme.Fonts.Role.meta)
                .foregroundStyle(Theme.Colors.inkMuted)
                .fixedSize(horizontal: false, vertical: true)
                .frame(minHeight: shared.subline, alignment: .topLeading)
                .padding(.top, 10)
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, minHeight: max(headerHeight, shared.content), alignment: .bottomLeading)
        .overlay(alignment: .topTrailing) {
            Button(action: onClose) {
                Image(systemName: Theme.Icon.close)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .frame(width: Theme.Space.rowMinHeight, height: Theme.Space.rowMinHeight)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
            .help("Close (Esc)")
            .padding(.top, Theme.Space.s3)
            .padding(.trailing, -Theme.Space.s3)
        }
        .padding(.horizontal, Theme.Wide.gutter)
        .padding(.bottom, 18)
    }
}
