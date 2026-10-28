---
title: Siri Inline Parameters
status: Complete
created: 2026-03-13
updated: 2026-10-27
---

## Overview

The Siri fix in `2026-03-09-siri-integration.md` got Siri adding todos, but
only in two steps: you named the app, then Siri asked what to add. App
Shortcut phrases can't capture a plain `String` parameter inline, so this
change wrapped the title in an `AppEntity` whose query accepts any text. That
lets "Add buy milk to Nylon" create the todo in one go. Shipped in #32
(`9119757`, 2026-03-13).

## Architecture

Wrapped the task title in an `AppEntity` using `EntityStringQuery`, which allows free-form text to be captured inline in Siri phrases.

| File | Change |
|------|--------|
| `TaskTitleEntity.swift` | New - `TaskTitle` AppEntity with `TaskTitleQuery` |
| `AddTaskIntent.swift` | Changed parameter from `String` to `TaskTitle` |
| `AppShortcuts.swift` | Added phrase `"Add \(\.$task) to \(.applicationName)"` |

All three files are in `src/ios/Nylon Impossible/Nylon Impossible/Intents/`.
`TaskTitleQuery.entities(matching:)` returns a single `TaskTitle` built from
whatever string Siri heard. `entities(for:)` and `suggestedEntities()` return
nothing.

Changed soon after: Siri kept sending "add … to Nylon" to Reminders, so
`4114b49` (2026-03-15) switched the inline phrase to
`"\(.applicationName) add \(\.$task)"` ("Nylon add buy milk"). Today
`AppShortcuts.swift` has both forms, plus an "Add to {list} in Nylon" phrase
from #404. App Shortcut phrases allow only one parameter each, so a phrase
can name the todo or the list but not both. `TaskTitle` and the `task`
parameter keep their pre-"todo" names on purpose, because renaming them would
break Shortcuts people have already saved.


Enable users to say "Add buy milk to Nylon" instead of the two-step flow where Siri asks "What would you like to add?"

## Result

Users can now say:
- "Add buy milk to Nylon" → task created directly
- "Add a task to Nylon" → Siri prompts, then creates task

## Technical Notes

- `EntityStringQuery` is key - it allows any spoken text to become a valid entity
- `suggestedEntities()` could optionally return recent tasks for Siri suggestions
- The existing two-step flow remains as a fallback for phrases without the parameter

## PR

https://github.com/superhighfives/nylon-impossible/pull/32
