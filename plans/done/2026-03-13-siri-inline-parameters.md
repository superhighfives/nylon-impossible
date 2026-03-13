# Siri Inline Parameters

Enable users to say "Add buy milk to Nylon" instead of the two-step flow where Siri asks "What would you like to add?"

## Result

Users can now say:
- "Add buy milk to Nylon" → task created directly
- "Add a task to Nylon" → Siri prompts, then creates task

## Implementation

Wrapped the task title in an `AppEntity` using `EntityStringQuery`, which allows free-form text to be captured inline in Siri phrases.

### Files Added/Changed

| File | Change |
|------|--------|
| `TaskTitleEntity.swift` | New - `TaskTitle` AppEntity with `TaskTitleQuery` |
| `AddTaskIntent.swift` | Changed parameter from `String` to `TaskTitle` |
| `AppShortcuts.swift` | Added phrase `"Add \(\.$task) to \(.applicationName)"` |

## Technical Notes

- `EntityStringQuery` is key - it allows any spoken text to become a valid entity
- `suggestedEntities()` could optionally return recent tasks for Siri suggestions
- The existing two-step flow remains as a fallback for phrases without the parameter

## PR

https://github.com/superhighfives/nylon-impossible/pull/32
