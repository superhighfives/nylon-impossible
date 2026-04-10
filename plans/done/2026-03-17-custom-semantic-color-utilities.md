# Custom Semantic Color Utilities

**Date:** 2026-03-17
**Status:** Complete
**Scope:** Web

## Overview

Replace `tailwindcss-radix-colors` bundled semantic classes with our own custom utilities. The library's classes mix hover/active states into single utilities (e.g., `bg-gray-ui` includes hover and active variants). We want explicit, composable utilities that map directly to Radix color scale steps.

---

## Motivation

Current `tailwindcss-radix-colors` classes like `bg-gray-ui` expand to:
```css
bg-gray-3 dark:bg-graydark-3 hover:bg-gray-4 dark:hover:bg-graydark-4 active:bg-gray-5 dark:active:bg-graydark-5
```

This is opinionated and inflexible. We want:
- Explicit control over hover/active states
- Clear mapping to Radix scale steps
- Semantic names that communicate intent

---

## Naming Convention

Based on [Radix color scale documentation](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale):

### Backgrounds

| Utility | Step | Use case |
|---------|------|----------|
| `bg-{color}-app` | 1 | App background |
| `bg-{color}-surface` | 2 | Cards, raised surfaces |
| `bg-{color}-base` | 3 | Component background (normal) |
| `bg-{color}-hover` | 4 | Component background (hover) |
| `bg-{color}-active` | 5 | Component background (active/pressed) |
| `bg-{color}-ghost` | transparent | Ghost base |
| `bg-{color}-ghost-hover` | 3 | Ghost hover |
| `bg-{color}-ghost-active` | 4 | Ghost active |
| `bg-{color}-solid` | 9 | Solid accent |
| `bg-{color}-solid-hover` | 10 | Solid accent hover |

### Borders / Dividers / Rings / Underlines

| Utility | Step | Use case |
|---------|------|----------|
| `{type}-{color}-subtle` | 6 | Non-interactive, separators |
| `{type}-{color}` | 7 | Default interactive |
| `{type}-{color}-strong` | 8 | Emphasis, focus rings |

Where `{type}` is: `border`, `divide`, `ring`, `underline`

### Text

| Utility | Step | Use case |
|---------|------|----------|
| `text-{color}-placeholder` | 10 | Placeholder text |
| `text-{color}-muted` | 11 | Secondary/muted text |
| `text-{color}` | 12 | Primary text (baseline) |

---

## Implementation

### File Structure

```
src/web/src/
├── styles.css                    # Main entry (updated)
└── styles/
    └── radix-utilities.css       # Custom semantic utilities
```

### Phase 1: Create utility definitions

Create `src/web/src/styles/radix-utilities.css` with all custom utilities using `@utility` and `@variant dark`:

```css
/* ============================================
   Custom Radix Color Semantic Utilities
   
   Based on: https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
   ============================================ */

/* --------------------------------------------
   Gray Backgrounds
   -------------------------------------------- */
@utility bg-gray-app {
  background-color: var(--color-gray-1);
  @variant dark { background-color: var(--color-graydark-1); }
}

@utility bg-gray-surface {
  background-color: var(--color-gray-2);
  @variant dark { background-color: var(--color-graydark-2); }
}

@utility bg-gray-base {
  background-color: var(--color-gray-3);
  @variant dark { background-color: var(--color-graydark-3); }
}

@utility bg-gray-hover {
  background-color: var(--color-gray-4);
  @variant dark { background-color: var(--color-graydark-4); }
}

@utility bg-gray-active {
  background-color: var(--color-gray-5);
  @variant dark { background-color: var(--color-graydark-5); }
}

@utility bg-gray-ghost {
  background-color: transparent;
}

@utility bg-gray-ghost-hover {
  background-color: var(--color-gray-3);
  @variant dark { background-color: var(--color-graydark-3); }
}

@utility bg-gray-ghost-active {
  background-color: var(--color-gray-4);
  @variant dark { background-color: var(--color-graydark-4); }
}

@utility bg-gray-solid {
  background-color: var(--color-gray-9);
  @variant dark { background-color: var(--color-graydark-9); }
}

@utility bg-gray-solid-hover {
  background-color: var(--color-gray-10);
  @variant dark { background-color: var(--color-graydark-10); }
}

/* ... repeat for yellow, red ... */

/* --------------------------------------------
   Gray Borders
   -------------------------------------------- */
@utility border-gray-subtle {
  border-color: var(--color-gray-6);
  @variant dark { border-color: var(--color-graydark-6); }
}

@utility border-gray {
  border-color: var(--color-gray-7);
  @variant dark { border-color: var(--color-graydark-7); }
}

@utility border-gray-strong {
  border-color: var(--color-gray-8);
  @variant dark { border-color: var(--color-graydark-8); }
}

/* ... repeat for divide, ring, underline ... */
/* ... repeat for yellow, red ... */

/* --------------------------------------------
   Gray Text
   -------------------------------------------- */
@utility text-gray-placeholder {
  color: var(--color-gray-10);
  @variant dark { color: var(--color-graydark-10); }
}

@utility text-gray-muted {
  color: var(--color-gray-11);
  @variant dark { color: var(--color-graydark-11); }
}

@utility text-gray {
  color: var(--color-gray-12);
  @variant dark { color: var(--color-graydark-12); }
}

/* ... repeat for yellow, red ... */
```

### Phase 2: Update styles.css

```css
@import "tailwindcss";
@import "tailwindcss-radix-colors/dist/gray-colors-only.css";
@import "tailwindcss-radix-colors/dist/yellow-colors-only.css";
@import "tailwindcss-radix-colors/dist/red-colors-only.css";
@import "./styles/radix-utilities.css";
@import "tw-animate-css";

@theme {
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-base: 0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
  --shadow-yellow: 0 2px 12px rgba(255, 214, 10, 0.25);
}

body {
  @apply m-0 bg-gray-app text-gray;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  @apply font-mono;
}
```

### Phase 3: Update components

Migration map for existing classes:

| Old Class | New Class |
|-----------|-----------|
| `bg-gray-app` | `bg-gray-app` (same) |
| `bg-gray-subtle` | `bg-gray-surface` |
| `bg-gray-ui` | `bg-gray-base hover:bg-gray-hover active:bg-gray-active` |
| `bg-gray-ghost` | `bg-gray-ghost hover:bg-gray-ghost-hover active:bg-gray-ghost-active` |
| `bg-yellow-solid` | `bg-yellow-solid hover:bg-yellow-solid-hover` |
| `bg-red-solid` | `bg-red-solid hover:bg-red-solid-hover` |
| `bg-yellow-ui` | `bg-yellow-base hover:bg-yellow-hover active:bg-yellow-active` |
| `bg-red-ui` | `bg-red-base hover:bg-red-hover active:bg-red-active` |
| `border-gray-dim` | `border-gray-subtle` |
| `border-gray-normal` | `border-gray hover:border-gray-strong` |
| `divide-gray-dim` | `divide-gray-subtle` |
| `text-gray-normal` | `text-gray` |
| `text-gray-dim` | `text-gray-muted` |
| `text-red-dim` | `text-red-muted` |
| `text-yellow-dim` | `text-yellow-muted` |
| `ring-gray-6` | `ring-gray-subtle` |
| `ring-gray-7` | `ring-gray` |
| `ring-yellow-8` | `ring-yellow-strong` |
| `ring-red-7` | `ring-red` |
| `ring-red-8` | `ring-red-strong` |

**Files to update:**

1. `src/web/src/styles.css` — Import changes
2. `src/web/src/routes/__root.tsx` — `text-gray-normal` → `text-gray`
3. `src/web/src/components/Header.tsx` — Various updates
4. `src/web/src/components/LandingPage.tsx` — `text-gray-dim` → `text-gray-muted`
5. `src/web/src/components/TodoInput.tsx` — `bg-gray-subtle` → `bg-gray-surface`, text updates
6. `src/web/src/components/TodoList.tsx` — Multiple updates for badges, dividers
7. `src/web/src/components/TodoItemExpanded.tsx` — `bg-gray-subtle` → `bg-gray-surface`, text updates
8. `src/web/src/components/ui/button.tsx` — Variants with explicit hover states
9. `src/web/src/components/ui/input.tsx` — Ring and text updates
10. `src/web/src/components/ui/checkbox.tsx` — Border and ring updates
11. `src/web/src/components/ui/select.tsx` — Ring, border, bg updates
12. `src/web/src/components/ui/field.tsx` — Ring and text updates
13. `src/web/src/components/ui/loader.tsx` — Keep as-is (uses raw step for `text-yellow-9`)
14. `src/web/src/components/ui/UrlCardCompact.tsx` — `bg-gray-subtle` → `bg-gray-surface`

### Phase 4: Update documentation

1. **`AGENTS.md`** — Update "Web Styling (Radix Colors)" section with new naming
2. **`src/web/AGENTS.md`** — Update styling guide quick reference

---

## Complete Utility List

### Gray (11 bg + 9 border/divide/ring/underline + 3 text = ~35 utilities)

**Backgrounds:**
- `bg-gray-app`, `bg-gray-surface`, `bg-gray-base`, `bg-gray-hover`, `bg-gray-active`
- `bg-gray-ghost`, `bg-gray-ghost-hover`, `bg-gray-ghost-active`
- `bg-gray-solid`, `bg-gray-solid-hover`

**Borders:** `border-gray-subtle`, `border-gray`, `border-gray-strong`
**Dividers:** `divide-gray-subtle`, `divide-gray`, `divide-gray-strong`
**Rings:** `ring-gray-subtle`, `ring-gray`, `ring-gray-strong`
**Underlines:** `underline-gray-subtle`, `underline-gray`, `underline-gray-strong`

**Text:** `text-gray-placeholder`, `text-gray-muted`, `text-gray`

### Yellow (~35 utilities, same pattern)

### Red (~35 utilities, same pattern)

**Total: ~105 utility definitions**

---

## Acceptance Criteria

- [ ] `tailwindcss-radix-colors` component classes disabled (using `-colors-only.css`)
- [ ] Custom utilities defined in `src/web/src/styles/radix-utilities.css`
- [ ] All components updated to use new utility names
- [ ] Hover/active states are explicit (not bundled)
- [ ] Dark mode works correctly via `@variant dark`
- [ ] No visual regressions
- [ ] `pnpm web:check && pnpm web:typecheck && pnpm web:test` pass
- [ ] Documentation updated in both AGENTS.md files
