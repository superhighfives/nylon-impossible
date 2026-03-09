---
status: not-started
phase: 1
updated: 2026-03-05
---

# Kumo to Radix Migration Plan

## Goal
Replace `@cloudflare/kumo` with Radix Themes for UI components and `tailwindcss-radix-colors` for Tailwind color utilities.

## Context & Decisions
| Decision | Rationale | Source |
|----------|-----------|--------|
| Use Radix Themes (not Primitives) | Pre-styled components reduce migration effort, built-in theming | User preference |
| Use tailwindcss-radix-colors v2 | Supports Tailwind v4, actively maintained, provides semantic classes | npm research |
| Use defaults (blue/gray), tweak later | Faster migration, can adjust theme props after | User preference |

## Phase 1: Dependencies & Configuration [PENDING]
- [ ] **1.1 Install @radix-ui/themes and tailwindcss-radix-colors, remove @cloudflare/kumo** ← CURRENT
- [ ] 1.2 Update styles.css - import Radix Themes CSS first, then Tailwind, then radix-colors, then tw-animate
- [ ] 1.3 Add Theme provider to __root.tsx with `appearance="inherit"` and switch from `data-mode` to `class="dark"`

## Phase 2: Component Migration [PENDING]
- [ ] 2.1 Migrate LandingPage.tsx (Button: `variant="primary"` → default, `variant="ghost"` → `variant="ghost"`)
- [ ] 2.2 Migrate TodoList.tsx (Button, Checkbox - note Checkbox needs manual label composition)
- [ ] 2.3 Migrate TodoItemExpanded.tsx (see detailed mapping below for Select, IconButton usage)
- [ ] 2.4 Migrate TodoInput.tsx (InputArea → TextArea, verify `rows` prop passes through)

## Phase 3: Tests & Cleanup [PENDING]
- [ ] 3.1 Update test mocks in LandingPage.test.tsx (mock @radix-ui/themes instead of @cloudflare/kumo)
- [ ] 3.2 Replace Kumo color tokens: `bg-surface` → Theme handles; `text-muted` → `text-gray-11`; see token map below
- [ ] 3.3 Update documentation (AGENTS.md, README.md, copilot-instructions.md)

## Phase 4: Verification [PENDING]
- [ ] 4.1 Run full test suite, typecheck, lint, and build
- [ ] 4.2 Manual testing of all components and dark mode
- [ ] 4.3 Commit changes

## Notes

### Component Mapping (Detailed)

| Kumo | Radix Themes | Migration Notes |
|------|--------------|-----------------|
| `Button variant="primary"` | `Button` (default solid) | Omit variant prop |
| `Button variant="ghost"` | `Button variant="ghost"` | Direct mapping |
| `Button variant="secondary"` | `Button variant="soft"` or `variant="outline"` | Choose based on visual preference |
| `Button variant="secondary-destructive"` | `Button variant="soft" color="red"` | **No direct mapping** - use soft+red |
| `Button shape="square"` | `IconButton` | Use IconButton for icon-only buttons |
| `Checkbox` | `Checkbox` | **Label handling differs**: Kumo has `label` prop, Radix requires `<Text as="label">` wrapper |
| `Input` | `TextField.Root` | Simpler API, type/value/onChange work the same |
| `InputArea` | `TextArea` | Native textarea props like `rows` pass through |
| `Loader` | `Spinner` | `size="sm"` → `size="1"` |
| `Select` + `Select.Option` | `Select.Root` + `.Trigger` + `.Content` + `.Item` | **Significant restructure required** |

### Select Migration Example

**Before (Kumo):**
```tsx
<Select value={priority} onValueChange={handlePriorityChange} disabled={isUpdating}>
  <Select.Option value="none">None</Select.Option>
  <Select.Option value="high">High</Select.Option>
</Select>
```

**After (Radix Themes):**
```tsx
<Select.Root value={priority} onValueChange={handlePriorityChange} disabled={isUpdating}>
  <Select.Trigger />
  <Select.Content>
    <Select.Item value="none">None</Select.Item>
    <Select.Item value="high">High</Select.Item>
  </Select.Content>
</Select.Root>
```

### Size Mapping
| Kumo | Radix Themes | Default? |
|------|--------------|----------|
| `xs` | `"1"` | No |
| `sm` | `"2"` | **Yes** (most components default to "2") |
| `base` | `"3"` | No |
| `lg` | `"4"` | No |

### Color Token Mapping (Kumo → tailwindcss-radix-colors)
| Kumo Token | Radix Equivalent | Notes |
|------------|------------------|-------|
| `bg-surface` | Let Theme handle / `bg-gray-1` | Theme sets default background |
| `text-surface` | `text-gray-12` | Primary text |
| `text-muted` | `text-gray-11` | Secondary text |
| `bg-secondary` | `bg-gray-3` | Interactive background |
| `ring-border` | `ring-gray-6` | Border color |
| `ring-active` | `ring-blue-8` | Focus ring |
| `text-error` | `text-red-11` | Error state |
| `bg-error-surface` | `bg-red-3` | Error background |

### CSS Import Order (styles.css)
```css
@import "@radix-ui/themes/styles.css";
@import "tailwindcss";
@theme {
  --color-*: initial;  /* Reset Tailwind colors */
}
@import "tailwindcss-radix-colors" layer(theme);
@import "tw-animate-css";
```

### Dark Mode Setup (__root.tsx)
Current code uses `data-mode="light|dark"`. Radix Themes uses `class="dark"` on a parent element.

Update the theme detection script:
```tsx
<html lang="en" className="light" suppressHydrationWarning>
  <script dangerouslySetInnerHTML={{
    __html: `
      (function() {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', isDark);
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
          document.documentElement.classList.toggle('dark', e.matches);
        });
      })();
    `,
  }} />
```

Then use `appearance="inherit"` on Theme:
```tsx
<Theme appearance="inherit" accentColor="blue" grayColor="slate" radius="medium">
```

### Files to Modify
1. `src/web/package.json` - dependencies
2. `src/web/src/styles.css` - CSS imports
3. `src/web/src/routes/__root.tsx` - Theme provider + dark mode
4. `src/web/src/components/LandingPage.tsx` - Button
5. `src/web/src/components/TodoList.tsx` - Button, Checkbox
6. `src/web/src/components/TodoItemExpanded.tsx` - Button/IconButton, TextField, Spinner, Select
7. `src/web/src/components/TodoInput.tsx` - TextArea
8. `src/web/src/components/__tests__/LandingPage.test.tsx` - mock
9. `src/web/AGENTS.md` - docs
10. `src/web/README.md` - docs
11. `.github/copilot-instructions.md` - docs

### iOS App Note
The iOS app has Kumo color references (`Color.kumoBrand`, etc.) in Swift. These are NOT affected by this migration - they're custom Color extensions, not the npm package.

### Rollback Strategy
Work on a feature branch. If issues arise, the branch can be abandoned. Keep @cloudflare/kumo in devDependencies initially until verification passes, then remove in final commit.
