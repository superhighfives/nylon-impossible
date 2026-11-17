//
//  TodoDrag.swift
//  Nylon Impossible
//
//  A dragged row carries its id as plain text. Anything that takes a todo —
//  the iPad's and Mac's sidebar entries — reads it back with
//  `todoDropTarget`. A board column, which also needs the pointer to place
//  the todo, uses its own delegate (BoardColumn) over the same
//  `TodoDropLoader`. Phones don't drag between lists; a todo moves through
//  its menu (Move to).
//
//  A column also takes text and links dragged in from other apps (a Safari
//  tab, a line from Notes, a selection in Mail): `onExternal` gets the text,
//  which the board adds as todos, one per line, through the composer's path.
//  `ExternalDrop` decides which of the two a drop is.
//

import SwiftUI
import UniformTypeIdentifiers

/// What a drop carries: one of our own rows, or something from elsewhere.
enum ExternalDrop: Equatable {
    /// A row dragged within Nylon (its id as text).
    case todo(UUID)
    /// Text or a link from another app, as composer input.
    case drafts(String)

    /// Classify dropped text. A bare UUID is one of our rows; anything else
    /// with words in it is input. Nil for nothing usable.
    nonisolated static func classify(_ text: String) -> ExternalDrop? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if let id = UUID(uuidString: trimmed) { return .todo(id) }
        return .drafts(trimmed)
    }

    /// A dropped URL as input: web links only, so a file dragged from the
    /// Finder isn't added as a `file://` todo.
    nonisolated static func classify(_ url: URL) -> ExternalDrop? {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return nil }
        return .drafts(url.absoluteString)
    }
}

/// A drag's tilt: one angle per drag, uniformly at random within
/// ±`Theme.Motion.tiltMax` degrees, picked when it lifts and held until it
/// lands. The landed row then swings past level the other way
/// (`settleSwing`).
enum DragTilt {
    /// An angle in degrees, within ±`tiltMax`.
    static func pick(using rng: inout some RandomNumberGenerator) -> Double {
        Double.random(in: -Theme.Motion.tiltMax...Theme.Motion.tiltMax, using: &rng)
    }

    static func pick() -> Double {
        var rng = SystemRandomNumberGenerator()
        return pick(using: &rng)
    }

    /// How far past level the landed row swings, in degrees: the opposite
    /// way to `tilt`, by `settleOvershoot`. None for a tilt under
    /// `settleMinTilt`, which would barely move.
    static func settleSwing(for tilt: Double) -> Double {
        guard abs(tilt) >= Theme.Motion.settleMinTilt else { return 0 }
        return tilt > 0 ? -Theme.Motion.settleOvershoot : Theme.Motion.settleOvershoot
    }
}

/// The todo being dragged out of a board row, so a column can show where
/// it would land while it's still in the air (its id only arrives on drop).
/// Set when a drag starts; a cancelled drag leaves it behind, so a column
/// only trusts it for drags that carry plain text and no link.
@MainActor
enum TodoDragSession {
    struct Drag: Equatable {
        let id: UUID
        let pinned: Bool
        /// The drag's tilt in degrees, picked once as it lifts.
        let tilt: Double
    }

    private(set) static var current: Drag?
    /// A tilt the preview drew before the drag began (the system can build
    /// the preview first), so `begin` keeps the angle on screen.
    private static var pending: (id: UUID, tilt: Double)?

    static func begin(_ todo: TodoItem) {
        var rng = SystemRandomNumberGenerator()
        begin(todo, using: &rng)
    }

    static func begin(_ todo: TodoItem, using rng: inout some RandomNumberGenerator) {
        let tilt = pending?.id == todo.id ? (pending?.tilt ?? 0) : DragTilt.pick(using: &rng)
        pending = nil
        current = Drag(id: todo.id, pinned: todo.pinned, tilt: tilt)
    }

    /// The tilt the preview of `id` draws: the current drag's, or one held
    /// for the drag that's about to begin.
    static func tilt(for id: UUID) -> Double {
        if let current, current.id == id { return current.tilt }
        if let pending, pending.id == id { return pending.tilt }
        let tilt = DragTilt.pick()
        pending = (id, tilt)
        return tilt
    }

    static func end() {
        current = nil
        pending = nil
    }
}

enum TodoDropLoader {
    /// The types a drop target takes: our rows (plain text), plus links
    /// when it also takes input from other apps.
    static func types(external: Bool) -> [UTType] {
        external ? [.url, .plainText] : [.plainText]
    }

    /// Load the first provider and hand back what it carries, on the main
    /// actor. False when there's nothing to load. With `external` false,
    /// text from other apps is ignored.
    static func load(
        _ providers: [NSItemProvider],
        external: Bool,
        deliver: @escaping @MainActor (ExternalDrop) -> Void
    ) -> Bool {
        guard let provider = providers.first else { return false }
        let hand: @Sendable (ExternalDrop?) -> Void = { drop in
            Task { @MainActor in
                if let drop { deliver(drop) }
            }
        }
        if external, provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
           !provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            _ = provider.loadObject(ofClass: URL.self) { url, _ in
                hand(url.flatMap(ExternalDrop.classify))
            }
            return true
        }
        guard provider.canLoadObject(ofClass: NSString.self) else { return false }
        _ = provider.loadObject(ofClass: NSString.self) { object, _ in
            guard let text = object as? String, let drop = ExternalDrop.classify(text) else { return }
            if case .drafts = drop, !external { return }
            hand(drop)
        }
        return true
    }
}

extension View {
    /// Make this view a drag source for `todo`, lifted as `TodoDragPreview`.
    func todoDragSource(_ todo: TodoItem) -> some View {
        modifier(TodoDragSource(todo: todo))
    }

    /// Accept a dragged todo. `perform` runs on the main actor with its id.
    /// With `onExternal`, text and web links from other apps are accepted
    /// too, and handed over as composer input.
    func todoDropTarget(
        isTargeted: Binding<Bool>? = nil,
        onExternal: (@MainActor (String) -> Void)? = nil,
        perform: @escaping @MainActor (UUID) -> Void
    ) -> some View {
        let external = onExternal != nil
        return onDrop(of: TodoDropLoader.types(external: external), isTargeted: isTargeted) { providers in
            TodoDropLoader.load(providers, external: external) { drop in
                switch drop {
                case .todo(let id):
                    TodoDragSession.end()
                    perform(id)
                case .drafts(let text): onExternal?(text)
                }
            }
        }
    }
}

/// A board row as a drag source: its id as plain text, and a preview of the
/// card the web board lifts.
private struct TodoDragSource: ViewModifier {
    let todo: TodoItem

    /// The row's width, so the preview card matches it.
    @State private var width: CGFloat?

    func body(content: Content) -> some View {
        content
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
            .onDrag {
                TodoDragSession.begin(todo)
                return NSItemProvider(object: todo.id.uuidString as NSString)
            } preview: {
                TodoDragPreview(id: todo.id, title: todo.title, width: width)
            }
    }
}

/// The lifted todo, as on the web board: a `surface` card with a hairline
/// border, an unticked box and the title (two lines at most), tilted by the
/// drag's angle and scaled to `lift`, with a soft shadow. Where the preview
/// stays live it eases in past the angle (`tiltOvershoot`) and back; where
/// the system snapshots it, and under Reduce Motion, it holds the tilt as a
/// still pose.
struct TodoDragPreview: View {
    let id: UUID
    let title: String
    var width: CGFloat?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var lifted = false

    var body: some View {
        // Read as it's drawn, so it's the tilt `TodoDragSession` holds.
        let tilt = TodoDragSession.tilt(for: id)
        card
            .keyframeAnimator(initialValue: tilt, trigger: lifted) { view, angle in
                view.rotationEffect(.degrees(angle))
            } keyframes: { _ in
                KeyframeTrack {
                    if lifted && !reduceMotion {
                        CubicKeyframe(tilt * Theme.Motion.tiltOvershoot, duration: Theme.Motion.fast * Theme.Drag.settlePeak)
                        CubicKeyframe(tilt, duration: Theme.Motion.fast * (1 - Theme.Drag.settlePeak))
                    } else {
                        MoveKeyframe(tilt)
                    }
                }
            }
            .scaleEffect(Theme.Motion.lift)
            .padding(Theme.Drag.previewMargin)
            .onAppear { lifted = true }
    }

    private var card: some View {
        HStack(alignment: .top, spacing: Theme.Space.s3) {
            RoundedRectangle(cornerRadius: Theme.Drag.previewBoxRadius, style: .continuous)
                .strokeBorder(Theme.Colors.ink, lineWidth: 1.75)
                .frame(width: Theme.Phone.checkbox, height: Theme.Phone.checkbox)
            Text(title)
                .textStyle(Theme.Fonts.Role.rowTitleWide, tracking: -0.005)
                .foregroundStyle(Theme.Colors.ink)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(Theme.Drag.previewPadding)
        .frame(width: width ?? Theme.Drag.previewFallbackWidth, alignment: .leading)
        .background(Theme.Colors.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.field, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: Theme.Radius.field, style: .continuous)
                .strokeBorder(Theme.Colors.hairline, lineWidth: 1)
        }
        .shadow(
            color: .black.opacity(Theme.Drag.shadowOpacity),
            radius: Theme.Drag.shadowRadius,
            y: Theme.Drag.shadowY
        )
    }
}

/// The drop line's dot: 8pt of `brand` in a 2pt `canvas` ring, so it reads
/// on any row. It scales in over `fast`, or just appears under Reduce Motion.
struct DropLineDot: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    var body: some View {
        Circle()
            .fill(Theme.Colors.brand)
            .frame(width: Theme.Drag.dotSize, height: Theme.Drag.dotSize)
            .padding(Theme.Drag.dotRing)
            .background(Theme.Colors.canvas, in: Circle())
            .scaleEffect(shown || reduceMotion ? 1 : 0)
            .onAppear {
                withAnimation(Theme.Motion.easeOutStrong(Theme.Motion.fast)) { shown = true }
            }
    }
}

/// A todo that just landed in a column: it comes in at the drag's tilt and
/// swings `swing` degrees past level before it rests.
struct DropLanding: Equatable {
    let id: UUID
    let tilt: Double
    let swing: Double
    /// Each landing is its own, even of the same todo twice.
    let token = UUID()
}

/// The landed row's swing: from the drag's tilt, past level by `swing` at
/// 60% of `base`, then level. It plays when a landing arrives, on a row
/// that was already here (a reorder) or one that just appeared (a move from
/// another column). Other rows stay level.
struct LandingSwing: ViewModifier {
    let landing: DropLanding?

    /// The landing being played, so each plays once.
    @State private var played: DropLanding?

    func body(content: Content) -> some View {
        content
            .keyframeAnimator(initialValue: 0.0, trigger: played?.token) { view, angle in
                view.rotationEffect(.degrees(angle))
            } keyframes: { _ in
                KeyframeTrack {
                    if let played {
                        MoveKeyframe(played.tilt)
                        CubicKeyframe(played.swing, duration: Theme.Motion.base * Theme.Drag.settlePeak)
                        CubicKeyframe(0, duration: Theme.Motion.base * (1 - Theme.Drag.settlePeak))
                    } else {
                        MoveKeyframe(0)
                    }
                }
            }
            .onAppear { play(landing) }
            .onChange(of: landing) { _, landing in play(landing) }
    }

    private func play(_ landing: DropLanding?) {
        guard let landing, landing != played else { return }
        played = landing
    }
}
