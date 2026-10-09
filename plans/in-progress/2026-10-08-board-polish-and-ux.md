# Board polish and UX

**Date**: 2026-10-08
**Status**: In Progress

## Problem

With the AI features gone, the web board's rough edges stand out. Three
specific complaints started this:

1. **The composer's list picker is a dropdown.** `TodoInput` puts a
   `rounded-lg` Base UI `Select` with its own ring inside a `rounded-full` pill.
   Picking a list takes two clicks, and the nested radii and rings clash.
2. **The per-column "New todo" input is cramped and doesn't wrap.**
   `ColumnNewTodo` in `TodoGrid.tsx` (~L250–330) is a single-line `<input>` with
   `p-0`, so the inset focus ring sits right against the glyphs. Long text
   scrolls sideways instead of wrapping like the row titles do.
3. **Pasting long text fails.** Pasting a ~2,100-character Cloudflare Access
   URL into a column input sent a 2,100-character `title` to the `createTodo`
   server fn. `createTodoSchema` caps `title` at 500
   (`src/web/src/lib/validation.ts`), so the request was rejected, the user
   got a generic toast, and Sentry logged **NYLON-IMPOSSIBLE-WEB-6 "Error:
   Invalid input"**. The composer path (`/todos/smart`) accepts up to 10,000
   characters, but `createSmartTodo` silently runs `truncateTitle(text)` and
   **discards everything after character 497**. Neither path keeps the long
   text.

A read-only audit of the board, using the Emil Kowalski design-engineering
principles, found more:

- Hover-only controls are gated on the `sm:` breakpoint rather than on hover
  capability, so tablets can't reach them.
- Touch hit targets are 15–28px.
- Base UI popups have no enter or exit motion.
- Completing a todo has no feedback: the row jumps to the Completed column.
- One shared `isPending` disables every row while any update is in flight.
- Cross-list drag-and-drop gives no live preview of where the item will land,
  and always drops it at the top of the target list.

## Solution

The work splits into five phases, each shippable as its own PR, in this order.
Phase 1 is bug fixing and should land first; it also clears Sentry WEB-6.

### Phase 1 — Inputs: overflow to notes, segmented list picker, autogrow

**Long text overflows into notes.** Add a shared helper in
`@nylon-impossible/shared`:

```ts
export const TODO_TITLE_MAX = 500;
/** Splits free text into a title that fits and notes that keep the rest. */
export function splitTodoText(text: string): { title: string; notes: string | null };
```

Rules, applied in order:

- **Short single line** (≤ `TODO_TITLE_MAX`, no newline): `{ title: text, notes: null }`.
  Today's behaviour is unchanged.
- **Over the limit or multi-line:**
  - The title is the first non-empty line, cut at a word boundary to ~120
    code points with a trailing `…`. Reuse `Array.from`, as `truncateTitle`
    does, so surrogate pairs survive.
  - The notes are the **full original text**, capped at the notes limit of
    10,000.
  - The title is kept short (~120) on purpose rather than filled to 500. A
    500-character title is unreadable as a row, and the full text is in notes
    anyway.
- **URL only:** leave this to the smart-create path, which already titles it
  "Check {domain}" and attaches the URL. In the column path, title it with the
  hostname and put the URL in notes. A 2KB URL title is never useful.

Call sites:

- **`createSmartTodo`** (`src/api/src/lib/create-todo.ts`): in
  `createInitialTodo`, replace `truncateTitle(text)` with `splitTodoText` and
  insert `notes`. This fixes the composer, iOS and the Gmail add-on in one
  place. Keep the URL-only branch first.
- **`ColumnNewTodo`** (`TodoGrid.tsx`): run `splitTodoText` before
  `createTodo.mutate({ title, notes, … })`.
- **Live hint:** while the field is over the limit, show a quiet line under the
  input, `text-xs text-gray-muted`, reading "Long text will be saved to notes."
  Users then aren't surprised.
- **`createTodo` server fn:** keep the 500 cap; the client now never exceeds
  it. Make sure a validation failure produces a readable message rather than
  "Invalid input". Map Zod issues through `messageFromError`, and see the
  memory note on server-fn empty error messages.
- **Tests:** add `splitTodoText` unit tests in shared (short, exactly 500,
  501, multi-line, emoji at the cut point, URL-only, >10k). Add an api test
  that a 2,000-character smart-create keeps the full text in `notes`.

**Composer list picker becomes a segmented control.** Use Base UI
`ToggleGroup` + `Toggle` (`@base-ui/react/toggle-group`, already installed).
Add a reusable `ui/SegmentedControl.tsx`:

- **Track:** `rounded-full bg-gray-base p-0.5`, inside the composer pill.
- **Indicator:** an absolutely positioned pill that slides between segments.
  Measure the active segment's `offsetLeft`/`offsetWidth` into CSS vars, then
  apply `transition-[translate,width] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]`.
  On first paint, skip the transition so it doesn't animate in from 0.
- **Segments:** Today / This Week / Sometime, the three system lists in
  `sortLists` order. Each is `h-7 px-3 text-xs font-medium`, and the active
  segment uses `text-gray`.
- **Custom lists:** add a trailing `…` segment that opens a Base UI `Menu` of
  custom lists. Choosing one swaps that segment's label to the list's name,
  truncated to ~12ch, and marks it active. This keeps the track a fixed width
  however many lists exist.
- **Accessibility and keyboard:** `ToggleGroup` gives arrow-key roving. Keep
  `aria-label="List to add to"`. Keep the `n` shortcut focusing the textarea,
  not the picker.
- **Mobile (<sm):** the composer gets narrow. Put the segmented control on its
  own row above the textarea inside the same surface, which then becomes
  `rounded-2xl` (see the next item).

**Composer and column inputs autogrow.**

- **Composer `<textarea>`:** add `field-sizing-content`, which
  `EditableSidePanelTitle` already uses, plus `max-h-40 overflow-y-auto`.
  - The container can't stay `rounded-full` once it holds more than one line.
    Switch it to `rounded-[20px]`, which reads as a pill at one line and as a
    card when it grows. Align the trailing button and the segmented control to
    `items-end` so they stay on the last line.
  - Drop `disabled={smartCreate.isPending}` from the textarea. Disabling it
    drops focus after every Enter and breaks rapid multi-add. `submit()`
    already guards double-submit, so use `aria-busy` instead.
- **`ColumnNewTodo`:** replace the `<input>` with a `<textarea rows={1}>` and
  `field-sizing-content resize-none`.
  - Match the row title's type, `text-[15px] font-semibold leading-snug`, so
    the new item doesn't change size when it becomes a row.
  - Give the field breathing room inside its focus ring with
    `-mx-1.5 px-1.5 py-1 rounded-md`. The negative margin keeps the text
    aligned with the titles below.
  - Enter submits, Shift+Enter inserts a newline, and Escape closes.
  - Pasted text with newlines goes through `splitTodoText`; it does not create
    several todos.

### Phase 2 — Touch, hit targets and pending state

- **Hover capability, not width:** in `styles.css`, add
  `@custom-variant hover-capable (@media (hover: hover) and (pointer: fine));`.
  Swap every `sm:opacity-0 sm:group-hover:opacity-100` and
  `max-sm:opacity-100` to `hover-capable:` equivalents, and show the touch
  action rows under `[@media(hover:none)]`. Affected sites:
  - `TodoList.tsx` ~222, 492–504, 740
  - `TodoGrid.tsx` ~285 (New todo), 368 (list grip), 398 (rename/delete)
  - `SubtaskSection.tsx` ~67, 99, 123
- **Keyboard focus:** add `focus-visible:opacity-100` and
  `group-focus-within/*:opacity-100` everywhere above. Today, keyboard focus
  can land on an invisible list grip or delete button.
- **Hit targets:** reach at least 40px without visual change using the
  pseudo-element trick already in `TodoInput`
  (`relative before:absolute before:-inset-2.5 before:content-['']`). Apply it
  to:
  - the row grip (`TodoList.tsx:545`)
  - the checkbox (`ui/Checkbox.tsx:54`)
  - the due-date clear (`InlineTodoControls.tsx:228`)
  - the subtask and list grips
  - the toast close button (`ui/Toast.tsx:59`)

  On `hover:none`, mobile row actions go from `size="xs"` to `size="sm"`.
- **Per-row pending state:** `TodoList.tsx` ~1018/1158 passes
  `updateTodo.isPending` and `deletePending` to every row. Updates are
  optimistic, so stop disabling the controls. Where a guard is still needed,
  derive it per id with `useMutationState({ filters: { mutationKey }, select })`.
  Toggling several todos quickly must work.
- **Click outside dialogs:** `SettingsModal.tsx:122` and
  `ui/ConfirmDialog.tsx:29` make `Dialog.Popup` `fixed inset-0`, so a click on
  the dim area never reaches the backdrop. Put the card classes on
  `Dialog.Popup` and centre it with `left-1/2 top-1/2 -translate-1/2`.
- **Popover stacking:** `InlineTodoControls.tsx:234` puts `z-50` on `Popup`
  when it belongs on `Positioner`. `Select.tsx:68` already does it right.

### Phase 3 — Motion

All motion is CSS, with no new dependency. Use `ease-out` curves for
enter/exit and keep everything under 300ms. Popups grow from their trigger via
`--transform-origin`.

Easing tokens in `styles.css` `@theme`:

- `--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1)`
- `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`

Popups and panels:

- **Popover, Select, Menu and Tooltip popups:**
  `origin-(--transform-origin) transition-[opacity,scale] duration-150 ease-out-strong data-starting-style:opacity-0 data-starting-style:scale-[0.97] data-ending-style:opacity-0 data-ending-style:scale-[0.97] data-ending-style:duration-100`.
  The Tooltip also gets `data-instant:duration-0`, so moving between adjacent
  tooltips doesn't re-animate.
- **Dialogs:** the same, but `scale-[0.96]`, 200ms, and a centred origin. The
  backdrop does an opacity fade over 200ms.
- **SidePanel** (`ui/SidePanel.tsx:22`): enter is `duration-300 ease-drawer`;
  exit is `data-ending-style:duration-200`.

Rows and completion:

- **Row selection tint** (`TodoList.tsx:697`): `duration-1000` → `duration-200`.
- **Completion feedback:**
  - The checkbox indicator uses `keepMounted` with
    `transition-[opacity,scale,filter] duration-200` and starts from
    `opacity-0 scale-[0.25] blur-[4px]`. The checkbox root gets
    `active:scale-[0.96]`.
  - The row stays in place for ~300ms, showing the strike-through and muted
    colour, before it leaves the list. Hold the id in a local `completingIds`
    set, then remove it with `setTimeout`.
  - Keep the title at `text-[15px]`. Change only colour, decoration and weight
    (`TodoList.tsx:385–404`) so the row height doesn't jump.
- **Row enter:** a new todo, optimistic or from sync, fades and rises 4px over
  200ms using `@starting-style`. There is no exit animation for deletes; they
  are already confirmed and should feel immediate.
- **Completed section collapse** (`TodoList.tsx:1136`): use the
  `grid-rows-[0fr]` ⇄ `grid-rows-[1fr]` transition, 200ms `ease-out-strong`.
- **Reduced motion** (`styles.css:84`): keep opacity and colour transitions,
  capped at 150ms, and remove only transform and scale motion. The current
  blanket `0.01ms` reset removes useful state feedback.

### Phase 4 — Cross-list drag and drop

The target is the dnd-kit "multiple containers" pattern
(https://main--5fc05e08a4a65d0021ae0bf2.chromatic.com/?path=/docs/react-sortable-multiple-lists--docs).
While dragging, the item **moves into** the hovered list and its neighbours
open a gap at the exact index. Dropping commits where the gap is.

Today, `TodoGrid.tsx` (~L860–960) sets `overListId` to highlight a column. The
custom collision detection deliberately never resolves `over` to a row in
another list, and a cross-list drop always lands at the top of the tier.

Changes:

1. **Collision detection:** replace `makeItemCollisionDetection` with the
   standard multi-container strategy:
   - Run `pointerWithin`, falling back to `rectIntersection`, to find the
     container.
   - Then run `closestCenter` restricted to that container's rows.
   - When the container is empty, `over` is the column droppable.
   - Cache the last `overId` in a ref so collisions don't flicker while the
     layout shifts. This is the storybook's `lastOverId` / `recentlyMovedToNewContainer` trick.
2. **`onDragOver` moves the item between containers:** splice the active todo
   out of its source and into the target `localOrderByList` at the hovered
   index. Each column's `SortableContext` then animates the gap with dnd-kit's
   own transforms, without hand-written animation.
   - Clamp the index into the dragged item's sticky tier, so a non-sticky item
     can't open a gap among the pinned items.
   - Keep the original `listId` in a ref, so `onDragCancel` can restore it.
3. **`onDragEnd` commits:** read the final index from `localOrderByList`,
   compute the position with `generateKeyBetween(prev, next)` from the
   neighbours within the tier, and mutate `{ listId, position }` once. The
   same-list path collapses into this one, so the two branches no longer
   diverge.
4. **Overlay feel:**
   - Drop animation: `dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.23,1,0.32,1)', sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }) }}`.
   - The overlay lifts: `scale-[1.02] shadow-xl rotate-[0.5deg]`, applied
     once, not animated per frame.
   - The source row stays as a 40%-opacity ghost, so the user knows where the
     item came from.
5. **Empty columns** keep a droppable placeholder of at least 64px, with
   dashed `border-gray-subtle` only while a drag is active.
6. **Auto-scroll:** check that dnd-kit's `autoScroll` reaches `ColumnScroller`
   (horizontal board) and each column's vertical scroll. If it doesn't, pass
   `autoScroll={{ threshold: { x: 0.15, y: 0.2 } }}`.
7. **Keyboard drag:** use `sortableKeyboardCoordinates` so arrow keys move
   between columns. Left and right move to the adjacent list. Keep the
   existing vertical-axis restriction only for within-list keyboard moves.

The header list-reorder `DndContext` stays separate and unchanged, apart from
using the same drop animation.

### Phase 5 — Consistency pass

- **Badges** (`TodoList.tsx:129–138`): remove the hover and active
  backgrounds from these non-interactive spans.
- **Mobile alignment:**
  - Completed-row spacer: `w-4 gap-2` → `w-5 gap-1.5` (`TodoList.tsx:1148`).
  - Subtasks: `pl-6 gap-2` → `pl-5 gap-1.5`, with completed subtasks kept at
    `text-sm` (`SubtaskSection.tsx:48,56`).
- **Concentric radii:** the calendar popover goes to `rounded-xl p-2`
  (`InlineTodoControls.tsx:235`).
- **Icons:** standardise ghost-xs icon buttons on 14px (`TodoGrid.tsx:408,419`,
  `SubtaskSection.tsx:69`).
- **One date picker:** the side panel uses `DueDateCalendar` instead of the
  native `type="date"` (`TodoItemExpanded.tsx:333`).
- **Side panel layout:** move the destructive Delete to the end of the panel
  (`TodoItemExpanded.tsx:428`).
- **Action pill overlap:** the hover action pill covers long titles
  (`TodoList.tsx:492`). Reserve `pr-24` on the title block while the pill is
  visible.
- **Settings:**
  - The danger button uses `ring-red-subtle text-red-muted`
    (`SettingsModal.tsx:214`), because `border-red-base` does nothing on the
    ring-based outline variant.
  - Timezone commits on change, like Theme does, and the redundant Save
    button goes.

## Implementation

### Files to modify

- `src/shared/src/todo-text.ts` (new) + export from `index.ts` — `splitTodoText`, `TODO_TITLE_MAX`
- `src/api/src/lib/create-todo.ts` — use `splitTodoText`, insert `notes`
- `src/web/src/lib/validation.ts` — reference `TODO_TITLE_MAX`
- `src/web/src/components/ui/SegmentedControl.tsx` (new)
- `src/web/src/components/TodoInput.tsx` — segmented picker, autogrow, no `disabled` on textarea, overflow hint
- `src/web/src/components/TodoGrid.tsx` — `ColumnNewTodo` textarea + split; DnD rework; header hover/focus gating
- `src/web/src/components/TodoList.tsx` — hover-capable gating, per-row pending, completion hold, typography, collapse animation, alignment
- `src/web/src/components/SubtaskSection.tsx`, `InlineTodoControls.tsx`, `TodoItemExpanded.tsx`, `SettingsModal.tsx`
- `src/web/src/components/ui/{Checkbox,ConfirmDialog,Select,SidePanel,Tooltip,Toast}.tsx`
- `src/web/src/styles.css` — `hover-capable` variant, easing tokens, reduced-motion reset

### Key considerations

- **iOS behaviour changes too:** the `createSmartTodo` change affects iOS and
  the Gmail add-on, because long text now arrives with notes. iOS already
  renders notes, so no client change is needed. Note it in the PR.
- **No migration:** there's no schema change. Notes and the 500/10,000 limits
  already exist.
- **DnD state:** the rework keeps `localOrderByList` as the single source of
  truth during a drag. Clear it on settle as today. Don't let a WebSocket
  refetch mid-drag reset it; guard on `activeId`.
- **Test against the real app:** verify each phase with the `run` skill, on
  desktop width and on a touch emulation at 820px (iPad) to catch the
  hover-capability regressions.
- **Keep motion subtle:** popovers and panels animate; keyboard-driven actions
  (`n`, Enter-to-add) never wait on an animation.

## Acceptance criteria

- [ ] Pasting the 2,100-character Access URL into a column input creates a todo titled with the host, with the full URL in notes. No error, and no new Sentry event (closes WEB-6).
- [ ] Pasting 2,000 characters of prose into the composer keeps all of it: a short title plus the full text in notes.
- [ ] The composer picks a list in one click via a segmented control with a sliding indicator; custom lists are reachable from the overflow segment.
- [ ] Both inputs wrap and grow with content; the column input has visible padding inside its focus ring and matches row title type.
- [ ] Enter-Enter-Enter in the composer adds three todos without refocusing.
- [ ] Checking off five todos rapidly works; no other row dims.
- [ ] On an iPad-sized touch viewport, every row, subtask and list action is reachable.
- [ ] All Base UI popups, dialogs and the side panel animate in and out from the right origin; reduced motion keeps fades.
- [ ] Dragging a todo over another column opens a gap at the hovered index; dropping lands it there (within its sticky tier); Escape restores it.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm web:test`, `pnpm api:test` pass.

## Dependencies

- Related to: `done/2026-08-06-todo-row-and-list-polish.md`, `done/2026-08-12-editorial-grid-redesign.md`, `done/2026-08-06-time-bucket-lists.md`

## Progress

### Phase 1 — implemented (2026-10-08, branch `board-polish-phase-1`)

Deviations from the spec above:

- **Where the segmented picker lives:** the composer sits in a fixed ~288px
  header slot, so the picker can't sit inline next to the text. The composer
  is now a one-line pill that **unfolds downward**, overlaying the board,
  while it's focused, has text, or its overflow menu is open. The picker sits
  under the field, and the placeholder names the target list ("Add to This
  Week…"). On iOS Safari the wrapper is fixed to the bottom, so the container
  goes back into normal flow and grows upward (`styles.css`).
- **Multi-line text:** if the first line fits, it becomes the title and the
  *remaining* lines become the notes, rather than putting the full text in
  notes. The full text only goes to notes when the title had to be clipped.
- **The old dropdown offered "Completed" as a target list.** The segmented
  control excludes it.
- **Typing while a create is pending:** the composer clears as soon as you
  submit and restores the text only if the create fails and nothing new has
  been typed. The `isPending` guard is gone, so rapid Enter-Enter-Enter works.
- **"Invalid input" (WEB-6) is unconfirmed:** the 500-character title cap
  produces "Too big: expected string to have <=500 characters", not
  "Invalid input", so WEB-6's exact message may come from elsewhere. The
  Sentry MCP was unreachable. The fix removes oversized titles at the source;
  check the event's stack trace before resolving it.
- `--ease-out-strong` was added to `@theme` now rather than in Phase 3.

### Phase 2 — implemented (2026-10-08, branch `board-polish-phase-2`)

Deviations and notes:

- **No custom `hover-capable` variant:** Tailwind 4 already ships
  `pointer-fine:` and `pointer-coarse:`, so hover-reveal is gated on
  `pointer-fine:` instead. Width (`sm:`) still decides layout (grip in the
  margin, floating pill); `pointer-fine` decides whether controls hide until
  hover. The floating pill is `sm:pointer-fine:flex`. A wide touch device
  gets the always-visible action row, with buttons sized up to 36px under
  `pointer-coarse:`.
- **Per-row pending state:** `useUpdateTodo` / `useDeleteTodo` now carry
  mutation keys. `usePendingTodoIds()` reads the in-flight ids through
  `useMutationState`, so a row only guards its own controls.
  `CompletedColumn` no longer takes the `updateTodo` / `deleteTodo` props.
- **Dialogs:** these use Base UI's `Dialog.Viewport` as the centering
  container, with the card as the `Popup`. Base UI treats a press on an
  ancestor of the popup as an outside press, so clicking the dim area now
  dismisses. Both dialogs also got their Phase 3 enter/exit animation
  (opacity + scale 0.96, `ease-out-strong`), since the same lines were being
  rewritten anyway.
- **Hit areas:** these use the same `before:` pseudo-element pattern, sized per
  control so neighbouring targets don't overlap. The due-date clear only
  extends rightward, because the date button sits immediately to its left.

Follow-ups spotted while testing on an emulated iPad:

- The always-visible action row under every todo is functional but visually
  heavy on touch. Consider tap-to-open for the details panel plus swipe
  actions, and dropping the per-row toolbar entirely.
- Unpinned rows show `PinOff` (a crossed-out pin) as the "pin this"
  affordance, which reads as "unpin". Use `Pin` at reduced opacity instead.

### Phase 3 — implemented (2026-10-08, branch `board-polish-phase-3`)

- **Popup motion:** a single `popup-motion` utility in `styles.css` covers
  Select, Popover (the due-date calendar), Tooltip and the segmented
  control's Menu, instead of repeating the class string at each call site.
- **Completion hold:** `useCompletionHold` (`hooks/useCompletionHold.ts`)
  delays the commit by 350ms, not by re-ordering the cache. During the hold
  the row is drawn checked and struck through but keeps its active layout.
  A second press cancels it. Pending commits are flushed on unmount, and
  reduced motion skips the hold. Settled completed rows keep their smaller
  `text-sm` type in the Completed column; the hold keeps 15px, so the row
  doesn't reflow before it leaves.
- **Row enter** uses CSS `@starting-style` on `[data-todo-row]`, gated by
  `data-board-ready` on the board scaffold so the first paint doesn't fade
  every row in.
- **Completed column:** stays mounted and animates with
  `grid-template-rows`, `inert` while collapsed. Two grid tests now assert
  inertness instead of absence.
- **Deferred: reduced-motion reset.** It still zeroes all transitions. Allowing
  opacity fades through needs a per-property override that the blanket
  `!important` reset doesn't allow; revisit with Phase 5.

### Phase 4 — implemented (2026-10-08, branch `board-polish-phase-4`)

- **Followed the plan closely:** multiple-containers collision with
  `lastOverIdRef` / `recentlyMovedRef`. `handleDragOver` moves the row
  into the hovered list's `localOrderByList` at the hovered slot, clamped to
  its tier, and a single `handleDragEnd` path commits `{ listId?, position }`.
  The ordering math (`clampToTier`, `insertInTier`, `positionAt`) lives in
  `lib/dragOrder.ts` with unit tests.
- **Removed:** `TodoRowGhost`, the `crossListDrop` / `isLeavingList` props,
  and the "origin" ghost variant. The row now moves between
  `SortableContext`s, so its own sortable stand-in serves as the
  target slot.
- **Rows slide** (200ms strong ease-out) instead of snapping. This deliberately
  reverses the earlier "no transition" choice, because the precise in-column
  gap reads better with motion. The stand-in transitions into each new gap too.
- **Keyboard:** `boardKeyboardCoordinates` replaces the vertical-only getter.
  Up/down only consider rows in the same column; left/right jump to the
  neighbouring column at the same height. The keyboard x-axis lock is gone,
  because the getter itself keeps x fixed for vertical moves.
- **Sync refetch:** the `todos` refetch effect skips resetting local orders
  mid-drag. Cancel drops all overrides and re-derives.
- **Drop zone:** the column drop-zone frame is now a quiet tint plus a
  hairline ring rather than a dashed border, so it doesn't compete with the
  row slot.
- **Empty columns:** the empty-column early return in `TodoListColumn` is gone.
  The column droppable is always `h-full min-h-24`, so empty lists and the
  space below the last row accept drops.
- Verified in the browser:
  - a cross-list drop at a precise index, which persists across a reload
  - a cross-list drag cancelled with Escape
  - a same-list reorder
  - a keyboard drag with ArrowLeft into the neighbouring column, cancelled
    with Escape
- **Not done:** auto-scroll tuning. dnd-kit's default reached the columns in
  testing, so no `autoScroll` override was added.
