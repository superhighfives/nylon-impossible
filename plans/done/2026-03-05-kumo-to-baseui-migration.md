---
title: Kumo to Base UI + Radix Colors Migration Plan
status: Complete
created: 2026-03-05
updated: 2026-10-27
phase: 1
---

## Overview

Replaced Cloudflare's Kumo component library on the web app with a small set
of in-repo components built on `@base-ui/react` (unstyled) and coloured with
`tailwindcss-radix-colors` (indigo accent, gray neutrals, tomato for
errors). The aim was full control over the look rather than restyling a
pre-styled kit. This won out over the Radix Themes alternative
(`2026-03-05-kumo-to-radix-migration.md`), which was never started. Shipped
in #20 (merged 2026-03-06): the migration itself is `2b80e38`, then
`0299102` removed the last Kumo references, plus Copilot fixups in #21–#23.

Base UI is still the web app's primitive layer. The Radix colour scales and
most of the components from this plan were replaced by the 2026-10 cohesive
redesign (`2026-10-18-cohesive-redesign.md`).

## Architecture

#20 added `src/web/src/components/ui/` with `button`, `checkbox`, `input`,
`field`, `loader` and `select`, re-exported from `ui/index.tsx`, and moved
`LandingPage`, `TodoInput`, `TodoList` and `TodoItemExpanded` onto them.
`styles.css` imported the gray, indigo and tomato scales, and `__root.tsx`
switched dark mode from `data-mode` to a `light`/`dark` class on `<html>`,
which the scales key off.

Deviations from the plan:

- **Select, not Combobox.** The plan chose Combobox for filtering, but
  `ui/select.tsx` wraps Base UI's Select instead. Nothing in the history
  says why; the only dropdown was the three-option priority picker.
- **No semantic token layer.** Components used raw scale steps
  (`bg-gray-1`, `text-gray-12`) rather than the `--bg-app`-style tokens in
  the notes. That custom layer was never built; later code used the
  library's own semantic utilities instead (`bg-gray-solid` in `0f23d8b`).
- **Wider than the web app.** `0299102` also renamed the iOS `Color.kumo*`
  tokens to `Color.app*`, rewrote `src/web/AGENTS.md`, and the PR moved
  Biome config to the repo root.

Since then the files were renamed to PascalCase (`0d9fae8`, 2026-04-29,
which also added a Base UI `Toast`). The cohesive redesign removed
`tailwindcss-radix-colors` (#401). Colours now come from generated tokens
(`src/shared/design/tokens.json` → `styles/tokens.css`). Over #227, #386 and
#401, `ui/` was cut down to `Button` and `Toast`. `@base-ui/react` is still a
dependency, used directly by the dialogs, sheets, menus and toasts in
`components/phone`, `components/wide` and `FeedbackDialog`.

## Goal

Replace `@cloudflare/kumo` with `@base-ui/react` (unstyled components) and `tailwindcss-radix-colors` for a fully customizable UI with fresh design.

## Context & Decisions

| Decision | Rationale | Source |
|----------|-----------|--------|
| Use Base UI (not Radix Themes) | Unstyled components give full design control | User preference: "Need more customization" |
| Fresh design approach | Take opportunity to redesign, not match Kumo | User preference |
| Big bang migration | Replace everything at once vs incremental | User preference |
| Indigo primary color | Modern, deep blue-purple accent | User preference |
| Gray neutral scale | Pure neutral, no color cast | User preference |
| Tomato error color | Warmer orange-red for destructive states | User preference |
| Combobox over Select | Allows filtering/search in dropdowns | User preference |
| Field wrapper for textarea | Consistent label/error handling | User preference |

## Color Palette

| Role | Radix Scale | Usage |
|------|-------------|-------|
| Primary/Accent | Indigo | Interactive elements, focus rings, CTAs |
| Neutral | Gray | Backgrounds, text, borders |
| Error/Destructive | Tomato | Validation errors, delete actions |

## Phase 1: Foundation Setup [PENDING]

- [ ] **1.1 Install dependencies** ← CURRENT
  ```bash
  npm install @base-ui/react tailwindcss-radix-colors
  npm uninstall @cloudflare/kumo
  ```
- [ ] 1.2 Update styles.css - remove Kumo, add tailwindcss-radix-colors with gray, indigo, tomato scales
- [ ] 1.3 Create semantic color tokens mapping Radix steps to design intent
- [ ] 1.4 Update __root.tsx dark mode detection to work with radix-colors

## Phase 2: Build Component Primitives [PENDING]

Create styled Base UI components in `src/components/ui/`:

- [ ] 2.1 `ui/button.tsx` - Primary, secondary, ghost, destructive variants
- [ ] 2.2 `ui/checkbox.tsx` - Styled checkbox with indicator
- [ ] 2.3 `ui/input.tsx` - Text input with focus ring styling
- [ ] 2.4 `ui/combobox.tsx` - Styled combobox (replaces Kumo Select)
- [ ] 2.5 `ui/field.tsx` - Field wrapper with label, description, error states
- [ ] 2.6 `ui/loader.tsx` - CSS spinner (Base UI has no loader)

## Phase 3: Application Component Migration [PENDING]

- [ ] 3.1 Migrate LandingPage.tsx - Replace Kumo Button
- [ ] 3.2 Migrate TodoInput.tsx - Replace InputArea with Field + textarea
- [ ] 3.3 Migrate TodoList.tsx - Replace Button, Checkbox
- [ ] 3.4 Migrate TodoItemExpanded.tsx - Replace Button, Input, Loader, Select→Combobox

## Phase 4: Polish & Verification [PENDING]

- [ ] 4.1 Verify dark mode works correctly
- [ ] 4.2 Add transitions/animations to interactive components
- [ ] 4.3 Accessibility audit (keyboard nav, focus states)
- [ ] 4.4 Update test mocks in LandingPage.test.tsx
- [ ] 4.5 Run full test suite, typecheck, lint, build

## Phase 5: Cleanup [PENDING]

- [ ] 5.1 Remove Kumo @source directive from styles.css
- [ ] 5.2 Update AGENTS.md documentation
- [ ] 5.3 Update README.md
- [ ] 5.4 Final commit

## Notes

### Component Mapping

| Kumo Component | Base UI Replacement | Notes |
|----------------|---------------------|-------|
| `Button` | `Button` | Fully unstyled - need all variant styles |
| `Checkbox` | `Checkbox` | Need custom indicator, label composition |
| `Input` | `Input` + `Field` | Field provides label/description/error |
| `Select` | `Combobox` | More complex but allows filtering |
| `InputArea` | `Field` + native `<textarea>` | No dedicated Base UI textarea |
| `Loader` | Custom CSS spinner | Base UI has no loader component |

### Radix Color Scale Semantics

| Step | Use Case | Example Token |
|------|----------|---------------|
| 1 | App background | `--bg-app: var(--gray-1)` |
| 2 | Subtle background | `--bg-subtle: var(--gray-2)` |
| 3 | UI element background | `--bg-element: var(--gray-3)` |
| 4 | Hovered element background | `--bg-hover: var(--gray-4)` |
| 5 | Active/selected element | `--bg-active: var(--gray-5)` |
| 6 | Subtle borders | `--border-subtle: var(--gray-6)` |
| 7 | Element borders | `--border-element: var(--gray-7)` |
| 8 | Focus rings, strong borders | `--border-focus: var(--indigo-8)` |
| 9 | Solid backgrounds (highest chroma) | `--accent-solid: var(--indigo-9)` |
| 10 | Hovered solid backgrounds | `--accent-hover: var(--indigo-10)` |
| 11 | Low-contrast text | `--text-secondary: var(--gray-11)` |
| 12 | High-contrast text | `--text-primary: var(--gray-12)` |

### CSS Setup (styles.css)

```css
@import "tailwindcss";
@import "tailwindcss-radix-colors" with (
  colors: gray indigo tomato
);
@import "tw-animate-css";

@theme {
  --font-family-sans: 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace;
  --font-family-mono: 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace;
}
```

### Dark Mode

tailwindcss-radix-colors provides automatic dark mode via CSS custom properties. The scales automatically adjust when `.dark` class is present on an ancestor.

Update __root.tsx:
```tsx
<html lang="en" className="light" suppressHydrationWarning>
  <script dangerouslySetInnerHTML={{
    __html: `
      (function() {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', isDark);
        document.documentElement.classList.toggle('light', !isDark);
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
          document.documentElement.classList.toggle('dark', e.matches);
          document.documentElement.classList.toggle('light', !e.matches);
        });
      })();
    `,
  }} />
```

### Button Variants Example

```tsx
// ui/button.tsx
const variants = {
  primary: "bg-indigo-9 text-white hover:bg-indigo-10 active:bg-indigo-10",
  secondary: "bg-gray-3 text-gray-12 hover:bg-gray-4 active:bg-gray-5",
  ghost: "bg-transparent text-gray-12 hover:bg-gray-3 active:bg-gray-4",
  destructive: "bg-tomato-9 text-white hover:bg-tomato-10 active:bg-tomato-10",
};
```

### Files to Create

1. `src/web/src/components/ui/button.tsx`
2. `src/web/src/components/ui/checkbox.tsx`
3. `src/web/src/components/ui/input.tsx`
4. `src/web/src/components/ui/combobox.tsx`
5. `src/web/src/components/ui/field.tsx`
6. `src/web/src/components/ui/loader.tsx`

### Files to Modify

1. `src/web/package.json` - dependencies
2. `src/web/src/styles.css` - CSS imports
3. `src/web/src/routes/__root.tsx` - dark mode setup
4. `src/web/src/components/LandingPage.tsx`
5. `src/web/src/components/TodoList.tsx`
6. `src/web/src/components/TodoItemExpanded.tsx`
7. `src/web/src/components/TodoInput.tsx`
8. `src/web/src/components/__tests__/LandingPage.test.tsx`
9. `src/web/AGENTS.md`

### Key Differences from Radix Themes Plan

This plan uses **Base UI** (unstyled) instead of **Radix Themes** (pre-styled):

| Aspect | Radix Themes | Base UI (this plan) |
|--------|--------------|---------------------|
| Styling | Pre-styled, customizable via props | Completely unstyled |
| Design control | Theme tokens, limited | Full control |
| Migration effort | Lower (similar API to Kumo) | Higher (must style everything) |
| Bundle size | Larger (includes styles) | Smaller (CSS is yours) |
| Flexibility | Medium | Maximum |

### Rollback Strategy

Work on a feature branch. If issues arise, the branch can be abandoned.
