# AI Features

**Date:** 2026-03-25
**Status:** Complete
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

The research agent (`2026-03-13-research-agent.md`) was not tackled as part of this work and remains in `plans/ready/`.