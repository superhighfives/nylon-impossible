---
title: Web Mobile Popover Menu
status: Complete
created: 2026-03-24
updated: 2026-10-27
---

## Overview

On phone-width web there's no hover, so the row actions that desktop hides
until hover were always visible on every todo. PR #128 (`525482c`,
2026-04-07) put them behind a single `⋯` button below the `sm` breakpoint,
which opens a Base UI menu with expand and delete. Desktop didn't change.
#87 had landed the spec and a stub component two weeks earlier.

## Architecture

- `src/web/src/components/TodoActionsMenu.tsx`: `@base-ui/react/menu` with
  a Portal and Positioner, styled like the `Select` popup. The delete item is
  red and disabled while `deletePending`.
- `TodoList.tsx`: `TodoItemContent` renders the menu inside
  `flex sm:hidden` and the existing hover-revealed control inside
  `hidden sm:flex`.

One deviation: the plan's Edit item became "Expand details" / "Collapse
details" with a chevron (`514f983`), matching the desktop button's aria
labels, because "Close" could be read as closing the menu.

**Replaced.** #332 (2026-08-26) removed `TodoActionsMenu`. Mobile rows now
show their actions (expand, recurrence/pin, delete) in a static row under
the content instead of behind a menu. The web board has been redesigned
twice since (#293, and the 2026-10 cohesive redesign).

## Problem

On web, each todo row shows Edit and Delete buttons. On desktop these are hidden until hover (`sm:opacity-0 sm:group-hover:opacity-100`), so they don't clutter the list. On mobile there is no hover state, which means the buttons are always visible on every row — taking up horizontal space and competing visually with the todo title.

## Solution

On mobile (below the `sm` breakpoint), replace the two inline buttons with a single `⋯` icon button that opens a Base UI popover menu containing Edit and Delete as menu items.

Desktop behaviour is unchanged — the inline buttons remain and continue to appear on row hover.

## Implementation

### New component — `src/web/src/components/TodoActionsMenu.tsx`

Build using `@base-ui/react/menu` (available in `@base-ui/react ^1.2.0`). Follow the same Portal + Positioner pattern used in `Select` (`src/web/src/components/ui/select.tsx`).

```tsx
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { MoreHorizontal } from "lucide-react";
import { Button } from "./ui";

interface TodoActionsMenuProps {
  todoId: string;
  todoTitle: string;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}

export function TodoActionsMenu({ ... }: TodoActionsMenuProps) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={
        <Button variant="ghost" size="sm" aria-label={`Actions for "${todoTitle}"`}>
          <MoreHorizontal size={16} />
        </Button>
      } />
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={4}>
          <BaseMenu.Popup className="z-50 min-w-32 overflow-hidden rounded-lg border border-gray-subtle bg-gray-surface p-1 shadow-lg">
            <BaseMenu.Item onClick={() => onToggleExpand(todoId)} ...>
              Edit
            </BaseMenu.Item>
            <BaseMenu.Item
              onClick={() => onDelete(todoId)}
              disabled={deletePending}
              className="... text-red-..."
            >
              Delete
            </BaseMenu.Item>
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
```

Popup styling should match the Select popup: `rounded-lg border border-gray-subtle bg-gray-surface p-1 shadow-lg`. The Delete item should use a destructive/red text colour consistent with the existing destructive `Button` variant.

### Modify `src/web/src/components/TodoList.tsx`

In `TodoItemContent`, replace the single button div with two conditional divs — the menu on mobile, the existing buttons on desktop:

```tsx
{/* Mobile: popover actions menu */}
<div className="flex sm:hidden">
  <TodoActionsMenu
    todoId={todo.id}
    todoTitle={todo.title}
    isExpanded={isExpanded}
    onToggleExpand={onToggleExpand}
    onDelete={onDelete}
    deletePending={deletePending}
  />
</div>

{/* Desktop: inline buttons revealed on hover */}
<div className="hidden sm:flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
  ...existing Edit and Delete buttons unchanged...
</div>
```

## Files to modify

| File | Change |
|------|--------|
| `src/web/src/components/TodoActionsMenu.tsx` | New component — Base UI menu with Edit and Delete items |
| `src/web/src/components/TodoList.tsx` | Split button div into mobile menu + desktop hover buttons |

## Acceptance criteria

- [ ] On mobile (< 640 px), each todo row shows a single `⋯` button instead of Edit and Delete
- [ ] Tapping `⋯` opens a popover menu with Edit and Delete items
- [ ] Tapping Edit in the menu expands the todo detail panel (same as the current Edit button)
- [ ] Tapping Delete in the menu deletes the todo (same as the current Delete button)
- [ ] Delete is disabled in the menu while a deletion is in flight (`deletePending`)
- [ ] On desktop (≥ 640 px), behaviour is unchanged — inline buttons appear on row hover
- [ ] Menu is keyboard-navigable and has appropriate aria labels

## Key considerations

- `@base-ui/react/menu` is already available at the required version — no new dependencies needed.
- The popover must render in a Portal (matching the Select component) so it isn't clipped by ancestor overflow/scroll containers or other stacking-context constraints.
- The Delete menu item needs a visual destructive style (red text) to match the existing destructive button variant — check `styles.css` for the appropriate Radix red colour token.

## Dependencies

- No external dependencies — `@base-ui/react ^1.2.0` is already installed
