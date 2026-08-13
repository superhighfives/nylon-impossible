---
title: Editorial full-screen grid redesign (web)
status: Complete
created: 2026-08-12
updated: 2026-08-12
---

# Editorial full-screen grid redesign (web)

## Goal

Recreate the web board's presentation to match the Figma design: a
full-viewport editorial grid — hairline column rules running the full height
of the screen, a deep whitespace band above bold list titles on a shared
baseline, orange brand accent, generous type. The half-ported layout (grid
crammed into a `max-w-4xl` container with `w-64` columns and a floating pill
header) is replaced wholesale. Behavior (drag, optimistic updates, list CRUD,
sync) is untouched — this is a presentation-layer rebuild.

## Context

- Time-bucket lists, sticky todos, per-todo agent all shipped
  (`plans/done/2026-08-06-time-bucket-lists.md` and friends). `TodoGrid.tsx`
  already owned cross-column drag, header reorder, the `n` shortcut, inline
  per-column add, and the New List column — all reused as-is.
- Figma reference (image supplied 2026-08-12): white page, full-height 1px
  rules between equal columns, logotype "Nylon Impossible" in bold orange
  top-left, orange outline Settings button top-right, list titles in a bold
  grotesque on a shared baseline ~28% down the page, "+ New List" styled as
  an orange list title, todo rows with large bordered checkboxes, bold
  titles, gray descriptions, bordered resource chips.
- The previous accent was the radix **yellow** scale; the design language is
  **orange**. No custom fonts existed.

## Tasks

- [x] Tokens: orange accent scale + semantic utilities, yellow→accent sweep,
      display font, white light background.
- [x] Full-bleed shell + fixed logotype/Settings overlays.
- [x] TodoGrid: full-height snap-scrolling column layout with hairlines,
      gutter, shared title baseline, per-column scroll regions.
- [x] Row + title typography, checkbox, chips, completed styling.
- [x] Quick-add: bottom composer pill (Today), per-column add, New List
      treatment.
- [x] Responsive pass (mobile snap paging, short viewports) + dark mode.
- [x] Checks green + live browser verification vs. the mockup.

## Overview

The web board is now the Figma design: a fixed full-viewport surface with
hairline rules running the full screen height, one column per list, titles in
Archivo (self-hosted variable font) sharing a baseline about a quarter of the
way down the page, and the brand accent moved wholesale from radix yellow to
radix orange (`accent-*` semantic utilities). The signed-in "/" route drops
the floating pill header for fixed board chrome — orange logotype top-left,
orange-outline Settings + Clerk account top-right — and the AI composer
(`TodoInput`) became a floating bottom-center pill that is the quick-add-to-
Today surface (`n` focuses it). Each column scrolls its rows independently
behind a bottom fade; on narrow viewports columns are 85vw and the board
snap-pages horizontally. "+ New List" renders as an orange title-sized
wordmark in a final flex-filling column. Verified live (signed-in Playwright
captures + scripted interaction pass at desktop/laptop/mobile, light and
dark) with `pnpm typecheck` / `lint` / api+web tests green.

Along the way the live verification surfaced and fixed two real
(pre-existing) bugs — see Architecture.

## Architecture

- **Tokens** (`src/web/src/styles.css`, `styles/radix-utilities.css`): the
  yellow semantic utilities were renamed to `accent-*` and remapped to the
  radix orange scale (yellow import removed); added `text-accent-solid` and
  `ring-accent-solid` (step 9) plus `--font-display` (Archivo Variable via
  `@fontsource-variable/archivo`) and `--shadow-accent`. Light mode body is
  pure white (dark stays `graydark-1`); `THEME_COLOR` updated to match.
  Component sweep: every `yellow-*` class usage → `accent-*`, solid-orange
  surfaces now take white foregrounds (Button primary, Checkbox check,
  Settings toggle).
- **Shell**: `routes/index.tsx` renders `BoardChrome` (new,
  `components/BoardChrome.tsx`) + `TodoGrid`; the container/pill-header
  layout is gone. `Header.tsx` now suppresses the pill on the signed-in "/"
  route only (other routes and signed-out keep it). The root body class no
  longer pins `bg-gray-app`.
- **Board layout** (`TodoGrid.tsx`): shared geometry constants
  (`COLUMN_CLASS`, `TITLE_BAND_CLASS`, `LIST_TITLE_CLASS`, `GUTTER_CLASS`)
  keep list columns, the New List column, and the loading/error scaffold
  aligned. The board is `fixed inset-0`, horizontal `overflow-x-auto` with
  `snap-x snap-mandatory` below `md`; every column is a `border-l` hairline
  `section` with a fixed-height title band (titles sit on its bottom edge)
  and an independently scrolling row region (`overscroll-contain`, hidden
  scrollbar, bottom gradient fade). `NewTodoInline` moved above the rows and
  inserts at the top of the non-sticky tier (passes
  `generateKeyBetween(null, firstPosition)`), so new rows appear beside the
  control that created them. The `n` shortcut now focuses the floating
  composer instead of opening Today's inline input.
- **Rows** (`TodoList.tsx`, `ui/Checkbox.tsx`, `ui/UrlPreviewCard.tsx`):
  checkboxes are 20px with a 2px near-black border (white check on orange
  when done via the default variant); titles 15px semibold; research
  summaries `text-sm text-pretty`; URL cards collapsed to compact bordered
  favicon+title chips per the design's "Name of Resource" treatment. On
  desktop the drag grip hangs in the left margin (absolute, out of flow) so
  checkboxes sit flush with the column title; the expand chevron moved from
  a left-overhang into the row's right-hand hover cluster, and all quiet
  controls (grip, unset-due, unpinned pin, delete, chevron) are
  hover/focus-revealed. The Completed header is small-caps. Empty columns
  register a full-height drop target.
- **Bugs found by live verification** (both pre-existing, both real in
  production):
  1. `src/web/src/lib/config.ts` treated only hostname `localhost` as local,
     so a dev session opened via `127.0.0.1` silently pointed AI/agent calls
     at the production API; the API's dev CORS regex (`src/api/src/index.ts`)
     had the same localhost-only assumption. Both now accept `127.0.0.1`.
  2. Migration `0023` minted every pre-existing user's system lists with
     dashless `lower(hex(randomblob(16)))` ids, while every `listId`
     validator used `z.string().uuid()` — so per-column create, cross-column
     drag, and sync listId writes failed validation for migrated accounts
     (client-side, before any request). Replaced with a shared
     `listIdSchema` accepting both id shapes: `src/web/src/lib/validation.ts`
     and `src/api/src/lib/list-id.ts` (used by `handlers/todos.ts`,
     `handlers/lists.ts`, `handlers/sync.ts`).
- **Tests**: `Header.test.tsx` mocks `useLocation`; `TodoList.test.tsx`
  mocks `useSmartCreate` (the grid now renders the composer).
- **Deviation**: the wireframe's per-column "+ New Todo" hover affordance
  and the `n`-into-column behavior were consolidated — the ghost row still
  creates into its column, but `n` targets the composer (which smart-creates
  into Today), matching the "quick add to Today" ask more directly.
