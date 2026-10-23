//
//  ContentView.swift
//  Nylon Impossible
//
//  The phone shell. A fixed switcher row (Today · This Week · Someday · Lists
//  and the avatar) over four pages that page horizontally; each page scrolls
//  its own masthead and rows. The composer is the only floating element and
//  rides the keyboard through the bottom safe-area inset, so nothing here
//  hard-codes an inset.
//
//  On iPad at regular width the same state drives the wide board instead
//  (ContentView+Wide.swift): sidebar, columns and a trailing panel. Split
//  view or Stage Manager narrowing the window to compact falls back to this
//  phone layout, carrying an open detail, Done or Settings across.
//

import AppIntents
import SwiftData
import SwiftUI

/// Owns the store's queries and hands their results to `ContentView` as
/// plain arrays. On macOS the board's sidebar, columns and inspector are
/// separate hosting views with their own view graphs; a `@Query` read from
/// one of those graphs refreshes inside the wrong graph's update and trips
/// AttributeGraph's "setting value during update" trap. Reading the results
/// here, once, keeps every query update in this view's own graph.
struct ContentRoot: View {
    @Query(sort: \TodoItem.createdAt, order: .reverse) private var todos: [TodoItem]
    @Query(sort: \TodoListModel.position) private var lists: [TodoListModel]

    var body: some View {
        ContentView(todos: todos, lists: lists)
    }
}

struct ContentView: View {
    typealias Page = TodoViewModel.Page

    @Environment(\.modelContext) var modelContext
    @Environment(\.scenePhase) var scenePhase
    @Environment(\.accessibilityReduceMotion) var reduceMotion
    @Environment(\.screenRoute) var screenRoute
    @Environment(\.horizontalSizeClass) var horizontalSizeClass
    @Environment(\.dynamicTypeSize) var dynamicTypeSize
    @Environment(AuthService.self) var authService
    @Environment(SyncService.self) var syncService
    @Environment(UserPreferencesService.self) var preferences
    /// Nil in DEBUG screenshot routes, which run without services.
    @Environment(FeedbackService.self) var feedback: FeedbackService?
    @AppStorage(OvernightDismissal.key) var overnightDismissedAt: String?
    /// From `ContentRoot`'s queries, as plain values; see there for why.
    let todos: [TodoItem]
    let lists: [TodoListModel]

    @State var actions = TodoActions()
    @State var pagerPosition: Page? = .today
    /// Written every frame of a swipe and read only by the switcher's
    /// underline, so the swipe doesn't re-run this whole body (and refilter
    /// every list) sixty times a second.
    @State var pagerProgress = PagerProgress()
    @State var detailTodo: TodoItem?
    @State var detailDetent: PresentationDetent = .medium
    @State var showsAccount = false
    @State var accountPath: [AccountRoute] = []
    @State var accountDetent: PresentationDetent = .medium
    /// Send feedback was tapped in the account sheet: open the feedback
    /// sheet once that one has gone.
    @State var feedbackAfterAccount = false
    @State var chosenListId: String?
    @State var focusComposer = false
    @State var renamingList: TodoListModel?
    @State var renameText = ""
    @State var deletingList: TodoListModel?
    // Bumped at each local midnight so dates and repeats done "today" roll
    // over without a refetch; any @State write re-runs body.
    @State var midnightTick = 0
    @State var composerHeight: CGFloat = 0

    // MARK: Wide (iPad) state
    /// The collection open as the board's fourth column.
    @State var openColumnId: String?
    /// Done or Settings in the trailing panel.
    @State var widePanel: AccountRoute?
    /// The keyboard's row, and the column it's in.
    @State var selectedTodoId: UUID?
    @State var focusedColumnId: String?
    /// Each column's composer: its draft, a chip picked over the default, a
    /// focus request, and which one is being typed in.
    @State var drafts: [String: String] = [:]
    @State var chosenTargets: [String: String] = [:]
    @State var composerFocusRequest: String?
    @State var editingColumnId: String?
    /// Raised to scroll the board to a column.
    @State var scrollColumnId: String?
    @State var showsDueCalendar = false
    @State var showsNewList = false
    @State var newListName = ""
    @State var lastKey: (key: BoardKey, at: Date)?
    @FocusState var boardFocused: Bool

    // MARK: Mac state
    @State var sidebarVisibility: NavigationSplitViewVisibility = .all
    /// The toast's Undo on Edit ▸ Undo (⌘Z).
    @State var undoBridge = ToastUndoBridge()
    @Environment(\.undoManager) var undoManager
    #if os(macOS)
    @Environment(\.openSettings) var openSettings
    #endif

    var viewModel: TodoViewModel { actions.viewModel }

    /// The board, not the phone layout: an iPad window at regular width, or
    /// any Mac window. An iPhone in landscape can be regular too, but keeps
    /// the phone layout; a narrow Mac window keeps the board too (the sidebar
    /// collapses and the columns scroll), since the phone's pager and sheets
    /// aren't Mac idioms.
    var isWide: Bool {
        #if os(macOS)
        return true
        #else
        return horizontalSizeClass == .regular && DeviceIdiom.current == .pad
        #endif
    }

    // MARK: - Body

    var body: some View {
        // Read so a midnight tick re-runs body (dates, repeats done today).
        // swiftlint:disable:next redundant_discardable_let
        let _ = midnightTick
        Group {
            #if os(macOS)
            wideBody
            #else
            if isWide {
                wideBody
            } else {
                phoneBody
            }
            #endif
        }
        .alert("Rename list", isPresented: Binding(get: { renamingList != nil }, set: { if !$0 { renamingList = nil } })) {
            TextField("List name", text: $renameText)
            Button("Cancel", role: .cancel) {}
            Button("Rename") { commitRename() }
        }
        .confirmationDialog(
            "Delete “\(deletingList?.name ?? "")”?",
            isPresented: Binding(get: { deletingList != nil }, set: { if !$0 { deletingList = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete list and its todos", role: .destructive) { commitDeleteList() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Todos in this list are deleted too. This can’t be undone.")
        }
        .alert("New list", isPresented: $showsNewList) {
            TextField("List name", text: $newListName)
            Button("Cancel", role: .cancel) {}
            Button("Create") { commitNewList() }
        }
        .task {
            actions.configure(context: modelContext) { syncService.syncAfterAction() }
            applyScreenRoute()
            await scheduleMidnightTicks()
        }
        .onChange(of: reduceMotion, initial: true) { _, reduce in actions.reduceMotion = reduce }
        .onChange(of: scenePhase) { _, phase in
            // A delete waiting on its toast commits when you leave.
            if phase != .active { actions.flush() }
        }
        .onChange(of: isWide, initial: true) { _, wide in carryAcross(toWide: wide) }
        // Siri matches "Add … to {list} in Nylon" against the list names it
        // was last given, so a new or renamed list has to be re-registered.
        .onChange(of: collections.map(\.name)) { NylonShortcuts.updateAppShortcutParameters() }
        .onAppear { performPendingRoute() }
        .onChange(of: QuickActionService.shared.pending) { performPendingRoute() }
        .toastMagicTap(actions.toasts)
        .feedbackPresentation(feedback, isEnabled: showsFeedback, screen: feedbackScreen, toasts: actions.toasts)
    }

    // MARK: - Phone

    #if os(iOS)
    var phoneBody: some View {
        VStack(spacing: 0) {
            Switcher(
                current: viewModel.page,
                progress: pagerProgress,
                avatarURL: screenRoute == nil ? authService.userImageURL : nil,
                initials: initials,
                onSelect: select,
                onDrop: drop,
                onAvatar: { showsAccount = true }
            )
            if case .error(let message) = syncService.state {
                SyncErrorLine(message: message, onRetry: { Task { await syncService.sync() } }, onDismiss: syncService.dismissError)
                    .transition(.opacity)
            }
            pager
                .environment(\.composerClearance, showsComposer ? composerHeight : 0)
        }
        .background(Theme.Colors.canvas.ignoresSafeArea())
        // The composer floats over the pages rather than insetting them: the
        // VStack respects the keyboard's safe area, so a bottom overlay rides
        // the keyboard, and each page pads its last row clear of it.
        .overlay(alignment: .bottom) { bottomBar }
        .animation(Theme.Motion.moving(reduceMotion: reduceMotion), value: syncService.state)
        .sheet(item: $detailTodo) { todo in
            TodoDetailSheet(
                todo: todo,
                actions: actions,
                lists: orderedLists,
                apiService: syncService.apiService,
                userId: authService.userId
            )
            .presentationDetents([.medium, .large], selection: $detailDetent)
            .presentationDragIndicator(.visible)
            .presentationBackground(Theme.Colors.canvas)
        }
        .sheet(isPresented: $showsAccount, onDismiss: {
            accountPath = []
            if feedbackAfterAccount {
                feedbackAfterAccount = false
                feedback?.present()
            }
        }) {
            AccountSheet(
                name: displayName,
                initials: initials,
                imageURL: screenRoute == nil ? authService.userImageURL : nil,
                doneCount: doneCount,
                actions: actions,
                lists: orderedLists,
                onSignOut: signOut,
                onFeedback: showsFeedback ? {
                    feedbackAfterAccount = true
                    showsAccount = false
                } : nil,
                path: $accountPath,
                detent: $accountDetent
            )
            .presentationDetents([.medium, .large], selection: $accountDetent)
            .presentationDragIndicator(.visible)
            .presentationBackground(Theme.Colors.canvas)
        }
    }

    // MARK: - Pager

    var pager: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 0) {
                ForEach(Page.allCases, id: \.self) { page in
                    pageContent(page)
                        .containerRelativeFrame([.horizontal, .vertical])
                        .id(page)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $pagerPosition)
        .scrollIndicators(.hidden)
        .scrollDisabled(viewModel.openCollectionId != nil)
        .scrollDismissesKeyboard(.interactively)
        // The pages keep their size when the keyboard comes up; only the
        // composer rides it. Resizing them scrolled the masthead away.
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .onScrollGeometryChange(for: CGFloat.self) { geometry in
            geometry.contentOffset.x / max(geometry.containerSize.width, 1)
        } action: { _, progress in
            pagerProgress.value = progress
        }
        .onChange(of: pagerPosition) { _, position in
            guard let position, position != viewModel.page else { return }
            viewModel.page = position
            chosenListId = nil
        }
        .onChange(of: viewModel.page) { _, page in
            chosenListId = nil
            guard pagerPosition != page else { return }
            withAnimation(reduceMotion ? nil : Theme.Motion.easeOutStrong(Theme.Motion.slow)) {
                pagerPosition = page
            }
        }
    }

    // MARK: - Bottom

    var bottomBar: some View {
        VStack(spacing: 0) {
            if showsComposer {
                Composer(
                    text: Bindable(viewModel).newTaskText,
                    lists: orderedLists,
                    currentListId: currentListId,
                    chosenListId: $chosenListId,
                    focusRequested: $focusComposer,
                    onSubmit: add
                )
                .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { composerHeight = $0 }
        .overlay(alignment: .top) {
            ToastView(toasts: actions.toasts)
                .alignmentGuide(.top) { $0[.bottom] + Theme.Space.s3 }
        }
        .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: showsComposer)
    }
    #endif
}

extension ContentView {
    // MARK: - Derived

    /// Today, This Week, Someday, then collections by position. A system list
    /// this build doesn't know is skipped rather than shown blank.
    var orderedLists: [TodoListModel] {
        lists.filter { !$0.isSystem || $0.systemKind != nil }.sorted { a, b in
            if a.isSystem != b.isSystem { return a.isSystem }
            if a.isSystem && b.isSystem { return a.systemSortIndex < b.systemSortIndex }
            return a.position < b.position
        }
    }

    var collections: [TodoListModel] { orderedLists.filter { !$0.isSystem } }

    func timeList(_ page: Page) -> TodoListModel? {
        guard let kind = page.systemKind else { return nil }
        return orderedLists.first { $0.systemKind == kind }
    }

    func rows(_ list: TodoListModel) -> [TodoItem] {
        viewModel.pageTodos(from: todos, listId: list.id, hidden: actions.pendingDeletes)
    }

    var subtasksByParent: [UUID: [TodoItem]] {
        Dictionary(grouping: todos.filter { $0.parentId != nil && !$0.isSoftDeleted }) { $0.parentId ?? UUID() }
    }

    /// Open top-level todos per list id (lowercased).
    var counts: [String: Int] {
        var counts: [String: Int] = [:]
        for todo in todos where todo.parentId == nil && !todo.isSoftDeleted && !todo.isCompleted
            && !actions.pendingDeletes.contains(todo.id) {
            if let key = todo.listKey?.lowercased() { counts[key, default: 0] += 1 }
        }
        return counts
    }

    func count(_ page: Page) -> Int {
        timeList(page).map { counts[$0.id.lowercased()] ?? 0 } ?? 0
    }

    var currentListId: String? { viewModel.currentListId(in: orderedLists) }

    var showsComposer: Bool { currentListId != nil }

    /// Today's "2 moved to This Week overnight" line, or nil.
    var overnightText: String? {
        OvernightNote.visibleText(
            preferences.lastSweep,
            timeZone: OvernightNote.timeZone(named: preferences.timezone),
            dismissedAt: overnightDismissedAt
        )
    }

    var doneCount: Int {
        todos.filter { $0.parentId == nil && $0.isCompleted && !$0.isSoftDeleted }.count
    }

    // MARK: - Feedback

    /// The feedback button is for admins, and never in a screenshot run.
    var showsFeedback: Bool { feedback != nil && preferences.isAdmin && screenRoute == nil }

    /// Where feedback was flagged from, for the issue: "Today",
    /// "board › Groceries › detail".
    var feedbackScreen: String {
        var parts = [isWide ? "board" : viewModel.page.title]
        let openId = isWide ? openColumnId : viewModel.openCollectionId
        if let openId, let list = lists.first(where: { $0.id == openId }) { parts.append(list.name) }
        if detailTodo != nil { parts.append("detail") }
        if isWide, let widePanel { parts.append(widePanel == .done ? "done" : "settings") }
        if showsAccount { parts.append(accountPath.last.map { $0 == .done ? "done" : "settings" } ?? "account") }
        return parts.joined(separator: " › ")
    }

    // MARK: - Identity

    var displayName: String {
        if screenRoute != nil { return "Charlie Gleason" }
        return authService.userDisplayName ?? authService.userEmail ?? "Your account"
    }

    var initials: String {
        if screenRoute != nil { return "CG" }
        return authService.userInitials ?? "?"
    }
}
