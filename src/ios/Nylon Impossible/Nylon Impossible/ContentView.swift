//
//  ContentView.swift
//  Nylon Impossible
//
//  The phone shell. A fixed switcher row (Today · This week · Someday · Lists
//  and the avatar) over four pages that page horizontally; each page scrolls
//  its own masthead and rows. The composer is the only floating element and
//  rides the keyboard through the bottom safe-area inset, so nothing here
//  hard-codes an inset.
//

#if os(iOS)
import AppIntents
import SwiftData
import SwiftUI

/// Owns the store's queries and hands their results to `ContentView` as
/// plain arrays.
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
    /// True while a finger is paging sideways; the lists hold still meanwhile.
    @State var pagerDragging = false
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
    /// Keeps a sync that moves rows off the page from dropping the keyboard.
    @State var composerFocus = ComposerFocusGuard()
    @State var renamingList: TodoListModel?
    @State var renameText = ""
    // Bumped at each local midnight so dates and repeats done "today" roll
    // over without a refetch; any @State write re-runs body.
    @State var midnightTick = 0
    @State var composerHeight: CGFloat = 0

    /// This window's undo manager, which carries `actions.history`: ⌘Z
    /// and shake.
    @Environment(\.undoManager) var undoManager

    var viewModel: TodoViewModel { actions.viewModel }

    // MARK: - Body

    var body: some View {
        // Read so a midnight tick re-runs body (dates, repeats done today).
        // swiftlint:disable:next redundant_discardable_let
        let _ = midnightTick
        phoneBody
            .alert("Rename list", isPresented: Binding(get: { renamingList != nil }, set: { if !$0 { renamingList = nil } })) {
            TextField("List name", text: $renameText)
            Button("Cancel", role: .cancel) {}
            Button("Rename") { commitRename() }
        }
        .task {
            actions.configure(context: modelContext) { syncService.syncAfterAction() }
            applyScreenRoute()
            await scheduleMidnightTicks()
        }
        .onChange(of: reduceMotion, initial: true) { _, reduce in actions.reduceMotion = reduce }
        .onChange(of: undoManager, initial: true) { _, manager in actions.history.attach(manager) }
        .onChange(of: scenePhase) { _, phase in
            // A waiting delete is sent when you leave.
            if phase != .active { actions.flush() }
        }
        // Siri matches "Add … to {list} in Nylon" against the list names it
        // was last given, so a new or renamed list has to be re-registered.
        .onChange(of: collections.map(\.name)) { NylonShortcuts.updateAppShortcutParameters() }
        .onAppear { performPendingRoute() }
        .onChange(of: QuickActionService.shared.pending) { performPendingRoute() }
        .toastMagicTap(actions.toasts)
        .feedbackPresentation(feedback, isEnabled: showsFeedback, screen: feedbackScreen, toasts: actions.toasts)
    }

    // MARK: - Phone

    var phoneBody: some View {
        VStack(spacing: 0) {
            Switcher(
                current: viewModel.page,
                progress: pagerProgress,
                avatarURL: screenRoute == nil ? authService.userImageURL : nil,
                initials: initials,
                onSelect: select,
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
        .onChange(of: pageRows) { old, new in
            composerFocus.rowsChanged(from: old, to: new, at: Date())
        }
        .sheet(item: $detailTodo) { todo in
            TodoDetailSheet(
                todo: todo,
                actions: actions,
                lists: orderedLists,
                apiService: syncService.apiService,
                userId: authService.userId
            )
            .presentationDetents([.medium, .large], selection: $detailDetent)
            // Dragging the content resizes the sheet first, rather than
            // scrolling the detail underneath it.
            .presentationContentInteraction(.resizes)
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
                actions: actions,
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
                        // Sideways or down, not both: once the pager takes the
                        // drag, the list under it stops following (and stops
                        // pulling to refresh).
                        .scrollDisabled(pagerDragging)
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
        .onScrollPhaseChange { _, phase in
            let dragging = phase == .interacting
            if dragging != pagerDragging { pagerDragging = dragging }
        }
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
                    onSubmit: add,
                    onFocusChange: composerFocusChanged
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
}

extension ContentView {
    // MARK: - Derived

    /// Today, This week, Someday, then collections by position. A system list
    /// this build doesn't know is skipped rather than shown blank.
    var orderedLists: [TodoListModel] {
        // A list deleted with Undo still up is gone from every view.
        let hidden = actions.pendingListDeletes
        return lists.filter { ($0.isSystem ? $0.systemKind != nil : !hidden.contains($0.id)) }.sorted { a, b in
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

    var pageRows: ComposerFocusGuard.PageRows {
        .init(page: viewModel.page, ids: timeList(viewModel.page).map { rows($0).map(\.id) } ?? [])
    }

    func composerFocusChanged(_ focused: Bool) {
        if composerFocus.focusChanged(focused, at: Date()) { focusComposer = true }
    }

    /// Today's "2 moved to This week overnight" line, or nil.
    var overnightLine: OvernightNote.Line? {
        OvernightNote.visibleLine(
            preferences.lastSweep,
            timeZone: OvernightNote.timeZone(named: preferences.timezone),
            dismissedAt: overnightDismissedAt
        )
    }

    var doneCount: Int { doneTodos.count }

    /// Finished top-level todos, newest first, minus any in a list deleted
    /// with Undo still up.
    var doneTodos: [TodoItem] {
        let hidden = actions.pendingListDeletes
        return todos
            .filter {
                $0.parentId == nil && $0.isCompleted && !$0.isSoftDeleted
                    && !actions.pendingDeletes.contains($0.id)
                    && !hidden.contains($0.listKey ?? "")
            }
            .map { (todo: $0, at: $0.completedAt ?? $0.updatedAt) }
            .sorted { DoneHistoryView.isOrderedBefore($0, $1) }
            .map(\.todo)
    }

    // MARK: - Feedback

    /// The feedback button is for admins, and never in a screenshot run.
    var showsFeedback: Bool { feedback != nil && preferences.isAdmin && screenRoute == nil }

    /// Where feedback was flagged from, for the issue: "Today",
    /// "Lists › Groceries › detail".
    var feedbackScreen: String {
        var parts = [viewModel.page.title]
        if let openId = viewModel.openCollectionId, let list = lists.first(where: { $0.id == openId }) {
            parts.append(list.name)
        }
        if detailTodo != nil { parts.append("detail") }
        if showsAccount { parts.append(accountPath.isEmpty ? "account" : "settings") }
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
#endif
