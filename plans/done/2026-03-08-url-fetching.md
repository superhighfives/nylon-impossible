# URL Fetching

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
