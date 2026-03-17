# Web Styling Overhaul

**Date:** 2026-03-16
**Status:** Ready
**Scope:** Web

## Overview

Overhaul the web app styling to a minimal, high-quality iOS-inspired design. The new palette is **yellow, black, white, and grays** using Radix Colors via `tailwindcss-radix-colors`. Soft drop shadows, rounded corners, and thoughtful spacing. The goal is a clean, premium aesthetic that feels at home on Apple platforms.

---

## Design System

### Radix Colors

This project uses [`tailwindcss-radix-colors`](https://tailwindcss-radix-colors.mrcai.dev) v2. Colors are imported in `src/web/src/styles.css` and provide automatic dark mode support via semantic classes.

**Color choices:**
- **Yellow** — Primary accent, brand color (buttons, focus rings, highlights)
- **Gray** — Neutral backgrounds, text, borders
- **Red** — Destructive actions, errors (keep existing tomato or switch to red)

### Semantic Classes Reference

These handle dark mode and hover/active states automatically per Radix guidelines:

| Semantic Class | Behavior |
|----------------|----------|
| `bg-{color}-app` | App background (step 1, auto dark) |
| `bg-{color}-subtle` | Subtle background (step 2, auto dark) |
| `bg-{color}-ui` | Interactive UI with hover/active (steps 3→4→5) |
| `bg-{color}-ghost` | Transparent, shows bg on hover/active |
| `bg-{color}-solid` | Solid accent with hover (steps 9→10) |
| `border-{color}-dim` | Subtle border (step 6) |
| `border-{color}-normal` | Normal border with hover (steps 7→8) |
| `divide-{color}-dim` | Subtle divider (step 6) |
| `text-{color}-dim` | Secondary text (step 11) |
| `text-{color}-normal` | Primary text (step 12) |

For direct color access, use steps 1-12: `bg-yellow-9`, `text-gray-12`, `border-gray-6`.

### Shadows

Add custom shadow utilities in `styles.css`:

```css
@theme {
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-base: 0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
  --shadow-yellow: 0 2px 12px rgba(255, 214, 10, 0.25);
}
```

### Border Radius

Use Tailwind's built-in radius utilities with consistent sizing:
- `rounded-md` (8px) — buttons, inputs, badges
- `rounded-lg` (12px) — cards, panels
- `rounded-xl` (16px) — modals, larger containers
- `rounded-full` — pills, avatars

### Typography

- **Font:** System font stack (already set via Tailwind defaults)
- **Weights:** Regular (400), Medium (500), Semibold (600)
- Use `text-gray-normal` for primary text, `text-gray-dim` for secondary

---

## Components to Update

### 1. `styles.css`

**Current:** Imports gray, indigo, tomato from Radix.
**Change:** Replace indigo with yellow, keep gray and a red variant for errors.

Tasks:
- [ ] Replace `@import "tailwindcss-radix-colors/dist/indigo.css"` with `@import "tailwindcss-radix-colors/dist/yellow.css"`
- [ ] Keep or replace tomato with `@import "tailwindcss-radix-colors/dist/red.css"` for destructive states
- [ ] Add custom shadow variables in `@theme` block
- [ ] Body: `bg-gray-app text-gray-normal`

---

### 2. `button.tsx`

**Current:** Uses `bg-indigo-solid` for primary, `bg-tomato-solid` for destructive.
**Change:** Primary uses yellow solid, keep red for destructive.

Tasks:
- [ ] Update `variant` styles:
  - `primary`: `bg-yellow-solid text-gray-12` (yellow-9/10 have good contrast with dark text)
  - `secondary`: `bg-gray-ui text-gray-normal ring-1 ring-gray-6` (unchanged)
  - `ghost`: `bg-gray-ghost text-gray-normal` (unchanged)
  - `destructive`: `bg-red-solid text-white` (or keep tomato)
  - `outline`: `bg-gray-ghost text-gray-normal ring-1 ring-gray-7`
- [ ] Update focus ring: `focus-visible:ring-yellow-8`
- [ ] Increase border radius: `rounded-lg`

---

### 3. `input.tsx`

**Current:** Uses Radix gray tokens.
**Change:** Keep gray, update focus ring to yellow.

Tasks:
- [ ] Background: `bg-gray-subtle` (or `bg-gray-2 dark:bg-graydark-2`)
- [ ] Border: `ring-1 ring-gray-6`
- [ ] Focus: `focus:ring-2 focus:ring-yellow-8`
- [ ] Border radius: `rounded-lg`
- [ ] Placeholder: `placeholder:text-gray-dim`

---

### 4. `checkbox.tsx`

**Current:** Base UI checkbox with Radix styling.
**Change:** Checked state uses yellow background with dark checkmark.

Tasks:
- [ ] Unchecked: `bg-gray-subtle border-gray-normal`
- [ ] Checked: `bg-yellow-9 dark:bg-yellowdark-9` with `text-gray-12` checkmark
- [ ] Focus ring: `focus:ring-yellow-8`
- [ ] Border radius: `rounded-md`

---

### 5. `loader.tsx`

**Current:** Gray spinner.
**Change:** Yellow spinner.

Tasks:
- [ ] Border color: `border-yellow-9 border-t-transparent` (or use `text-yellow-9` with currentColor)

---

### 6. `select.tsx`

**Current:** Radix gray tokens.
**Change:** Match input styling — gray background, yellow focus.

Tasks:
- [ ] Trigger: `bg-gray-subtle ring-1 ring-gray-6 focus:ring-yellow-8`
- [ ] Dropdown: `bg-gray-subtle shadow-lg rounded-lg`
- [ ] Selected item: `bg-gray-ui`
- [ ] Border radius: `rounded-lg`

---

### 7. `field.tsx`

**Current:** Radix tokens for label/description/error.
**Change:** Keep gray semantic classes, use red for errors.

Tasks:
- [ ] Label: `text-gray-normal font-medium`
- [ ] Description: `text-gray-dim text-sm`
- [ ] Error: `text-red-11 dark:text-reddark-11 text-sm` (or tomato-11)

---

### 8. `UrlCardCompact.tsx`

**Current:** Review needed.
**Change:** Card style with shadow.

Tasks:
- [ ] Background: `bg-gray-subtle`
- [ ] Shadow: `shadow-base`
- [ ] Border radius: `rounded-lg`
- [ ] Hover: `hover:shadow-lg transition-shadow`

---

### 9. `Header.tsx`

**Current:** Border-bottom divider.
**Change:** Cleaner with backdrop blur.

Tasks:
- [ ] Background: `bg-gray-1/80 dark:bg-graydark-1/80 backdrop-blur-sm`
- [ ] Border: `border-b border-gray-dim` (subtle)
- [ ] Logo: `text-gray-normal font-semibold`
- [ ] Sticky: `sticky top-0 z-50`

---

### 10. `LandingPage.tsx`

**Current:** Centered, minimal.
**Change:** Yellow primary button.

Tasks:
- [ ] Sign In button: `variant="primary"` (now yellow)
- [ ] Sign Up button: `variant="ghost"`

---

### 11. `TodoInput.tsx`

**Current:** Textarea with loader.
**Change:** Card wrapper with shadow.

Tasks:
- [ ] Wrapper: `bg-gray-subtle shadow-base rounded-lg p-4`
- [ ] Textarea: inherits updated styles
- [ ] Loader: yellow

---

### 12. `TodoList.tsx`

**Current:** Dividers between items, tomato badges for priority/overdue.
**Change:** Cleaner dividers, yellow for high priority.

Tasks:
- [ ] Dividers: `divide-gray-dim` (very subtle)
- [ ] Todo item padding: `py-4`
- [ ] Completed items: `text-gray-dim line-through`
- [ ] Priority "high" badge: `bg-yellow-ui text-yellow-dim` (was tomato)
- [ ] Priority "low" badge: `bg-gray-ui text-gray-dim`
- [ ] Overdue badge: keep red/tomato for warning
- [ ] Drag handle: `text-gray-dim hover:text-gray-normal`

---

### 13. `TodoItemExpanded.tsx`

**Current:** Expanded details section.
**Change:** Card style.

Tasks:
- [ ] Container: `bg-gray-subtle rounded-lg p-4 mt-2 shadow-sm`
- [ ] Form fields: inherit updated styles

---

### 14. `__root.tsx`

**Current:** Sets body class, dark mode toggle.
**Change:** Update theme-color meta.

Tasks:
- [ ] `theme-color`: `#f5d90a` (yellow-9 light) or keep neutral
- [ ] Body class: `bg-gray-app text-gray-normal antialiased` (mostly unchanged)

---

### 15. `src/web/AGENTS.md`

**Current:** Documents Radix color usage with indigo/tomato.
**Change:** Update to reflect yellow/gray/red palette.

Tasks:
- [ ] Update styling guide quick reference
- [ ] Replace indigo references with yellow
- [ ] Document shadow utilities if added

---

## Implementation Phases

### Phase 1: Color Imports

- [ ] Update `styles.css` to import yellow.css instead of indigo.css
- [ ] Optionally swap tomato for red (or keep both)
- [ ] Add shadow custom properties
- [ ] Verify dark mode still works

### Phase 2: Core Components

- [ ] Update `button.tsx` — primary variant to yellow
- [ ] Update `input.tsx` — yellow focus ring
- [ ] Update `checkbox.tsx` — yellow checked state
- [ ] Update `loader.tsx` — yellow color
- [ ] Update `select.tsx` — yellow focus
- [ ] Update `field.tsx` — error colors

### Phase 3: Feature Components

- [ ] Update `Header.tsx` — backdrop blur, subtle border
- [ ] Update `LandingPage.tsx` — button variants
- [ ] Update `TodoInput.tsx` — card wrapper
- [ ] Update `TodoList.tsx` — priority badges, dividers
- [ ] Update `TodoItemExpanded.tsx` — card style
- [ ] Update `UrlCardCompact.tsx` — shadow, rounded

### Phase 4: Polish

- [ ] Review spacing and consistency
- [ ] Add transition utilities where needed
- [ ] Test dark mode thoroughly
- [ ] Test responsive behavior

### Phase 5: Documentation

- [ ] Update `src/web/AGENTS.md` styling guide
- [ ] Verify root `AGENTS.md` Radix Colors section is accurate

---

## Acceptance Criteria

- [ ] App uses yellow, gray, and red/tomato — no indigo colors remain
- [ ] All interactive elements have consistent rounded corners (`rounded-lg` or `rounded-md`)
- [ ] Cards and elevated surfaces have subtle drop shadows
- [ ] Primary buttons are yellow (bg-yellow-solid) with dark text
- [ ] Focus states use yellow ring
- [ ] Dark mode works correctly via Radix semantic classes
- [ ] No visual regressions — all existing functionality still works
- [ ] `pnpm web:check && pnpm web:typecheck && pnpm web:test` pass
