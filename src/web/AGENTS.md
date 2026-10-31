# AGENTS.md

<!-- effect-solutions:start -->
## Effect Best Practices

**Before implementing Effect features**, run `effect-solutions list` and read the relevant guide.

Topics include: services and layers, data modeling, error handling, configuration, testing, HTTP clients, CLIs, observability, and project structure.

**Effect Source Reference:** `~/.local/share/effect-solutions/effect`
Search here for real implementations when docs aren't enough.

**Effect Integration:**
- This project uses Effect for type-safe error handling throughout the app
- Server functions: `src/server/todos.ts` - All CRUD operations with Effect
- Core utilities: `src/lib/utils.ts` - Reusable Effect patterns
- Services: `src/lib/auth.ts`, `src/lib/db.ts` - Auth and database layers
- Error types: `src/lib/errors.ts` - Tagged errors for type safety
- Documentation:
  - `docs/EFFECT_README.md` - Quick start guide
  - `docs/EFFECT_MIGRATION.md` - Migration patterns and examples
  - `docs/EFFECT_COMPARISON.md` - Before/after code comparisons
<!-- effect-solutions:end -->


## UI

The app follows the redesign spec in
[2026-10-18-cohesive-redesign](https://github.com/superhighfives/nylon-impossible/blob/02f8c45b3ba52896a25bde813cfd2b0a05ef9fb1/plans/done/2026-10-18-cohesive-redesign.md).

- **Layouts.** `components/phone/` is the phone layout (under 1024px) and
  also holds the pieces both layouts share: `TodoRow`, `Composer`,
  `ContextMenu`, `DetailSheet`, `OvernightNote`, `useTodoActions` and
  `useBoardData`. `components/wide/` is the wide layout (sidebar, columns,
  keyboard map) built from those pieces at board density. `LayoutSwitch`
  picks one without a flash on SSR.
- **Primitives.** Headless `@base-ui/react` (Dialog, Menu, Toast) styled with
  Tailwind. `components/ui/` keeps only `Button` (for the landing, error and
  not-found pages) and the `Toaster`.

## Styling: design tokens only

Colour, type, radius and motion come from the generated tokens
(`src/styles/tokens.css`, from `src/shared/design/tokens.json`; run
`bun run tokens` after changing the JSON). `src/styles.css` exposes them as
Tailwind utilities with an `n-` prefix:

| Utility | Use |
| --- | --- |
| `bg-n-canvas` | Page background |
| `bg-n-surface` | Hover tint, the list column, raised fields |
| `bg-n-fill` | Selected chips, pressed rows |
| `border-n-hairline` | Rules between things (no cards or shadows) |
| `text-n-ink`, `text-n-ink-muted`, `text-n-ink-subtle` | Text |
| `text-n-overdue` | Overdue due days, Delete |
| `bg-n-brand` + `text-n-brand-ink` | The yellow accent: a fill with dark ink, never text on white |
| `font-n-display` | Archivo: wordmark, list titles, detail title |
| `rounded-n-chip`, `rounded-n-field` | Radius 6 and 10 |
| `duration-(--n-duration-fast)`, `ease-n-out` | Motion |

Focus rings use the `n-focus` utility (`n-focus-inset` inside clipped rows),
and `n-hit` grows a small control's target to 44×44. Dark mode is the `.dark`
class on `<html>`; tokens switch under it, so components rarely need `dark:`.
