# Pre-launch Web Polish – 2026-07-17

A grab-bag of web UI fixes and interaction improvements to land before launch.
Mostly small, but they add up to the app feeling finished. Each bullet is a
candidate to promote to its own `ready/` spec if it grows.

- **Fix drag icon colours** — the drag handle icons are the wrong colour
  (contrast/theme mismatch). Align them with the semantic colour utilities.

- **Add due date and priority inline** — let you set a due date and priority
  while creating/editing a todo in the row itself, without opening the expanded
  form.

- **Make the interface optimistic** — audit the remaining web mutations that
  still wait on the server and make them apply optimistically (create, toggle,
  edit, reorder), matching the parity work already done elsewhere.

- **Add subtasks to the top of the list** — new subtasks should be inserted at
  the top of the parent's subtask list rather than the bottom. (Follows the
  Subtasks work in `in-progress/2026-07-08-subtasks.md`.)

- **Move AI features to be intentional** — the AI actions (research button,
  enrich button) should be explicit, deliberate affordances rather than firing
  automatically. Make the user opt in per todo.

- **Auto-save changes in the UI** — changing a due date and priority should save
  automatically (no explicit save step). More broadly: can edits across the UI
  auto-save generally, so there's no save button anywhere?
