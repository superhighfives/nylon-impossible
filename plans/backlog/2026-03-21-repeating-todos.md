# Repeating Todos

Todos should be able to repeat on a schedule. When a repeating todo is completed, a new instance is automatically created for the next occurrence.

## Recurrence Patterns

The system needs to support a range of recurrence expressions:

- **Daily** — repeat every day
- **Weekly on a specific day** — e.g. every Wednesday
- **Monthly on a specific date** — e.g. the 14th of every month
- **Monthly on a relative day** — e.g. the third Sunday, the last Friday
- **Multiple times per month** — e.g. twice a month on Tuesday (1st and 3rd Tuesday)
- **Custom intervals** — e.g. every 2 weeks

## Open Questions

- How should recurrence be stored? A structured JSON field on the `todos` table (e.g. `recurrence: { frequency: "weekly", dayOfWeek: 3 }`) would be flexible and queryable. Alternatively a compact RRULE string (iCalendar standard) would allow reuse of existing libraries but is less readable.
- What happens to the original todo when it recurs — does it get cloned with a new due date, or does completion just advance the `dueDate` in place? Cloning preserves history; advancing is simpler.
- Should the next occurrence be created eagerly on completion, or generated lazily on load?
- How should the iOS app and web UI expose the recurrence picker? The recurrence options mirror what Calendar apps offer — a natural place to follow existing conventions (e.g. iOS Calendar's repeat sheet).
- Should recurrence interact with the AI smart-create input? e.g. "remind me every Monday to review backlog" → creates a repeating todo.

## Notifications

Repeating todos make notifications more meaningful because there's always a next occurrence to surface. At minimum:

- **App badge** — show a count of todos due today (including repeating instances that have come due). iOS supports this via `UNUserNotificationCenter` / `applicationIconBadgeNumber`; the web can use the [Badging API](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API) (`navigator.setAppBadge(n)`).
- **Scheduled local notifications** — when a repeating todo is created or its next occurrence is generated, schedule a local notification for the due time. Local notifications avoid needing a push infrastructure for the common case.
- **Push notifications** — for server-side recurrence (e.g. occurrences generated in the background), a push notification can wake the app and update the badge. Requires APNs integration on iOS and Web Push on the browser.

Badge count should be recomputed whenever todos are synced and cleared when all due items are completed.
