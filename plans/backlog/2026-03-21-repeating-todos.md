# Repeating Todos

Todos should support repeating on a schedule so that, when a repeating todo is completed, a new instance is automatically created for the next occurrence (for example, weekly reviews or monthly bill payments).

This likely needs a flexible recurrence model (e.g. daily, weekly, monthly, custom intervals) plus a clear strategy for how new occurrences are created and surfaced in notifications. Exact recurrence patterns, storage format, UI for picking a schedule, and notification behavior should be worked out in a separate Ready Spec before implementation.
