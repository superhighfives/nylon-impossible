---
name: cloud-routines
description: The Claude cloud routines designed to run against nylon-impossible (nightly Sentry sweep, weekly dependabot bundle, event-triggered PR shepherd). Use when creating, changing, debugging or disabling those routines, or when a PR looks like one of them opened it.
---

# Continuous improvement routines

Three Claude cloud routines are meant to run against this repo outside of any
local session — they're configured via claude.ai, not checked into
`.github/workflows/`, so this skill is the source of truth for what they do
and why. They open and update PRs, and merge them only under "Merging" in
CLAUDE.md.

**Status: not yet live.** The routines below are the agreed design, not a
description of something already running — creating them needs an
`environment_id` from the claude.ai routines API, which wasn't reachable when
this was written. Treat this as the spec to build against, and delete this
paragraph once all three exist and have run once.

- **Sentry sweep** — cron, nightly (~03:00 local). Runs the `review-sentry`
  skill against unresolved issues for this project and opens one PR per issue
  it decides is worth fixing.
- **Dependabot bundle** — cron, weekly (Monday morning). Runs the
  `dependabot-bundle` skill to combine that week's open dependabot PRs into a
  single PR.
- **PR shepherd** — event-triggered, not cron. Fires on `pull_request`
  (opened/synchronize) and `workflow_run` (completed) webhook events for this
  repo, so it reacts to a new commit or a finished CI run instead of polling
  on a timer. Runs the `shepherd` skill to push fixup commits, respond to
  review comments, and rebase on conflict for PRs it's watching.

If any of these starts producing bad output, disable it from claude.ai (or ask
Claude to do so via the `schedule`/`RemoteTrigger` tooling) rather than
reverse-engineering it from PR history — the routine definition, not this
skill, is authoritative for the exact prompt and trigger config.
