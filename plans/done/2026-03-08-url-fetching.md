---
title: URL Fetching
status: Complete
created: 2026-03-08
updated: 2026-10-27
---

## Overview

A problem statement rather than a spec: URL metadata had no loading state,
and fetching seemed to fail on web. It was worked through in #31
(2026-03-13), whose own write-up is `2026-03-13-url-fetching-optimistic-ui.md`.
That PR showed compact link cards under each todo in the main list on web
and iOS, with a "fetching" state, and made sure a fetch could neither hang
nor stay pending forever.

## Architecture

- **Already in place.** `b0478a6` (2026-03-04) had added `fetchStatus`
  (`pending`/`fetched`/`failed`) to `todo_urls` and a fetching indicator in
  the expanded view. #31 built on that rather than adding a new loading
  model.
- **#31.** `UrlCardCompact` (web) and `UrlRowCompact` + `FlowLayout` (iOS)
  rendered the cards. A pending URL older than 30 seconds counts as failed,
  and `url-metadata.ts` got a 10-second fetch timeout. The sync response
  started carrying URLs so iOS could draw them.
- **Web failures.** No commit names a root cause. The likely fix is #31's
  regex fallback in smart-create (`ensureUrlsExtracted`). Before it, if the
  AI didn't return a URL, no `todo_urls` row was written and there was
  nothing to fetch. That's an inference from the diff, not confirmed.
- **Not done in #31.** Treating the link as its own entity that can be
  removed from the title came later and piecemeal: URL-only todos showing
  the page title (#227), and titling todos from their links (#326).

The compact cards are gone: web's went in #227, iOS's in the cohesive
redesign (#398). Web now derives a link's title, favicon and
pending/failed state in `src/web/src/lib/url-display.ts`, and shows a
spinner on the link while `fetchStatus` is pending (#492).

URL fetching has two issues: no optimistic UI while fetching, and fetching doesn't work on web (only iOS).

## Problem

When a URL is added to a todo, there is no visual feedback while the metadata is being fetched — the UI shows nothing until the data arrives. Additionally, URL fetching appears to work correctly on iOS but fails silently on web.

## Expected Behavior

- Show an optimistic / loading state (e.g. skeleton or placeholder) while URL metadata is being fetched
- URL fetching should work consistently across both iOS and web platforms
- I want to show the URL metadata in a small card below the todo item, with a title, description, and image
- Once URL metadata is added, it should be treated as its own entity, and be able to be removed from the title

## Areas to Consider

- What optimistic UI makes sense — skeleton card, spinner, placeholder text?
- Investigate why web URL fetching fails (CORS? missing fetch polyfill? platform-specific code path?)
- Whether the fetch is triggered the same way on both platforms or if there's a web-specific code path missing
- Error state handling if the fetch fails
