---
title: AI Features
status: Complete
created: 2026-03-25
updated: 2026-10-27
---

**Completed:** 2026-03-27

I want to work through @plans/ready/2026-03-18-optimistic-ui-parity.md, plans/ready/2026-03-18-ios-siri-background-sync.md, and plans/ready/2026-03-13-research-agent.md. My goal is to integrate AI Gateway with Cloudflare so I can better test how AI Gateway works.

As a part of this work, I want to do the following:
- Add a "Use AI" toggle to the web and ios apps, so I can check whether AI is actually being used. This should turn AI off and on for the current user. This relates to plans/ready/2026-03-23-subscription-plans.md.
- Don't process todos with AI until after they've been created. We don't need to check for multiple todos in one anymore, so we can remove this feature. All AI work should happen once the todo is created (for example, extracting URLs, doing research work, etc).
- Use a new plans/in-progress folder. Update AGENTS.md and README.md with details of this. Plans should move from ready to in-progress while being worked on, and then to done when they're finished.

This work should happen on a new branch. Ensure you plan out how you're going to work through and test this. This is an important piece of work, so research the current features and ensure you're thorough.

## Overview

All items from this plan were completed across several PRs on the `feature/post-creation-ai-processing` branch and supporting branches:

- **AI toggle** (PR #91): `aiEnabled` user preference added to the DB schema and API. Web `AiToggle` component added to the header. iOS `UserPreferencesService` and `SettingsView` added. AI Gateway dynamic routing added in PR #85.
- **Post-creation AI processing** (PR #94): Todos now created immediately; AI enrichment (title cleanup, URL extraction, due date parsing) runs async via `waitUntil`. `shouldUseAI` heuristic removed. `aiStatus` column tracks processing state with web and iOS indicators.
- **Optimistic UI parity** (PR #93): See `plans/done/2026-03-18-optimistic-ui-parity.md`.
- **iOS Siri background sync** (PR #92): See `plans/done/2026-03-18-ios-siri-background-sync.md`.
- **plans/in-progress folder + lifecycle docs** (PR #91): `plans/in-progress/` created, `AGENTS.md` and `plans/README.md` updated with the backlog → ready → in-progress → done lifecycle.

The research agent (`2026-03-13-research-agent.md`) was implemented separately in PR #98 and the plan has moved to `plans/in-progress/`.

## Architecture

- **AI Gateway (#85).** `src/api/src/lib/ai.ts` calls Workers AI through the
  `AI` binding with a `gateway` option, so requests go through Cloudflare AI
  Gateway. The PR first used the gateway's dynamic-routing endpoint, then
  `ai.gateway().run()`, which returned an empty body under local
  wrangler/miniflare; it settled on `ai.run()` with the gateway option
  (`9ac04bb`), and moved to the `kimi-k2.5` model at the same time.
- **AI toggle (#91).** Migration `0002_add_user_preferences.sql` added
  `users.ai_enabled`. `lib/auth.ts` loads it onto the context, and
  `handlers/users.ts` exposes `GET/PATCH /users/me` (CORS had to allow
  `PATCH`). On web, `useUser.ts` and an `AiToggle`, first in the header and
  then moved to the bottom-right corner; on iOS, `UserPreferencesService` and
  a toggle in a new `SettingsView`. `smart-create.ts` skips AI when the
  preference is off.
- **Post-creation processing (#94).** `POST /todos/smart` now inserts one
  todo straight from the text and returns it, with `ai_status` (migration
  `0003_add_ai_processing_status.sql`) set to `pending`. It then runs
  `enrichTodoWithAI` from a new `lib/ai-enrich.ts` in `waitUntil`, and that
  sets the status to complete or failed. The multi-todo split
  (`lib/smart-input.ts`) and the `shouldUseAI` heuristic were deleted.
  `aiStatus` is serialized on todos and in the sync response; web shows a
  small grey loader on the row, and iOS shows an indicator in `TodoItemRow`
  and `TodoEditSheet`.
- **Plans lifecycle (#91).** `plans/in-progress/` and the lifecycle docs in
  `plans/README.md` and `AGENTS.md`.

Deviations and corrections:

- The Overview lists "title cleanup", but before #94 merged `43211be`
  narrowed enrichment to pulling URLs out of the title, due dates and
  priority. It doesn't otherwise rewrite the title.
- Enrichment only ran from `POST /todos/smart`. Todos that reached the
  server through `/todos/sync`, such as offline iOS creates, weren't
  enriched.
- The research agent plan is now in `plans/done/`, not `in-progress/` as
  the Overview says.

None of this is in the app today. AI was gated on a Pro plan in July
(`plans/done/2026-03-23-subscription-plans.md`) and back on `aiEnabled` alone
in #234. The research feature was removed in #354 and AI enrichment, with
`ai_status` and `ai_enabled`, in #355 (September 2026). `POST /todos/smart`
still exists but no longer calls a model. The `plans/in-progress/` stage is
still in use.
