//
//  ContentView+Pages.swift
//  Nylon Impossible
//
//  The five pages and their copy, split from ContentView.swift.
//

import SwiftUI

extension ContentView {
    @ViewBuilder
    func pageContent(_ page: Page) -> some View {
        switch page {
        case .today, .thisWeek, .someday:
            if let list = timeList(page) {
                let rows = rows(list)
                ListPage(
                    list: list,
                    rows: rows,
                    subtasks: subtasksByParent,
                    lists: orderedLists,
                    actions: actions,
                    empty: empty(for: page),
                    onOpen: open
                ) {
                    Masthead(
                        title: page.title,
                        subline: subline(page, count: rows.count),
                        keepsBanner: true,
                        banner: page == .today ? overnightText.map { text in
                            AnyView(
                                OvernightPill(text: text, onSee: seeOvernight, onDismiss: dismissOvernight)
                                    .transition(.opacity)
                            )
                        } : nil
                    )
                    .animation(Theme.Motion.moving(reduceMotion: reduceMotion), value: overnightText)
                }
            } else {
                loading(page.title)
            }
        case .lists:
            ZStack {
                if let id = viewModel.openCollectionId, let list = collections.first(where: { $0.id == id }) {
                    collectionPage(list)
                        .transition(reduceMotion ? .opacity : .move(edge: .trailing).combined(with: .opacity))
                } else {
                    ListsIndexPage(
                        collections: collections,
                        counts: counts,
                        onOpen: { list in
                            withAnimation(Theme.Motion.easeOutStrong(Theme.Motion.base)) {
                                viewModel.openCollectionId = list.id
                            }
                        },
                        onCreate: createList,
                        onReorder: reorderCollections
                    )
                    .transition(reduceMotion ? .opacity : .move(edge: .leading).combined(with: .opacity))
                }
            }
            .background(Theme.Colors.canvas)
        case .done:
            DoneHistoryView(todos: doneTodos, lists: orderedLists, actions: actions)
        }
    }

    func collectionPage(_ list: TodoListModel) -> some View {
        let rows = rows(list)
        return ListPage(
            list: list,
            rows: rows,
            subtasks: subtasksByParent,
            lists: orderedLists,
            actions: actions,
            empty: ("Nothing here yet.", nil),
            onOpen: open
        ) {
            Masthead(title: list.name, subline: MastheadCopy.todos(rows.count), back: ("Lists", closeCollection)) {
                Menu {
                    Button {
                        renameText = list.name
                        renamingList = list
                    } label: {
                        Label("Rename", systemImage: Theme.Icon.edit)
                    }
                    Button(role: .destructive) {
                        deleteListWithUndo(list)
                    } label: {
                        Label("Delete list", systemImage: Theme.Icon.delete)
                    }
                } label: {
                    Image(systemName: Theme.Icon.more)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .frame(width: Theme.Space.rowMinHeight, height: Theme.Space.rowMinHeight)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("List options")
            }
        }
        // Paging is off while a collection is open, so a rightward swipe
        // goes back to Lists, like the prototype.
        .simultaneousGesture(
            DragGesture(minimumDistance: 24).onEnded { value in
                let dx = value.translation.width
                let dy = value.translation.height
                if dx > 80, abs(dx) > abs(dy) * 1.5 { closeCollection() }
            }
        )
    }

    func loading(_ title: String) -> some View {
        VStack(spacing: 0) {
            Masthead(title: title, subline: "Getting your lists…", keepsBanner: true)
            Spacer()
        }
    }

    // MARK: - Copy

    func subline(_ page: Page, count: Int) -> String {
        switch page {
        case .today: return MastheadCopy.today(count: count)
        case .thisWeek: return MastheadCopy.thisWeek(count: count)
        case .someday: return MastheadCopy.someday(count: count)
        case .lists: return MastheadCopy.lists(count: collections.count)
        case .done: return MastheadCopy.done
        }
    }

    func empty(for page: Page) -> (text: String, link: (text: String, action: () -> Void)?) {
        switch page {
        case .today:
            let waiting = count(.thisWeek)
            return ("Nothing today.", waiting > 0 ? ("\(waiting) waiting in This week", { select(.thisWeek) }) : nil)
        case .thisWeek:
            let waiting = count(.someday)
            return ("A clear week.", waiting > 0 ? ("\(waiting) waiting in Someday", { select(.someday) }) : nil)
        default:
            return ("Nothing here yet.", nil)
        }
    }
}
