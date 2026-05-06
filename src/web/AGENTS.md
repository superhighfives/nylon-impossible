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

## UI Components

This project uses custom components built on `@base-ui/react` headless primitives, styled with Tailwind CSS and `class-variance-authority`. All components live in `src/components/ui/`.

## Import Components

Import components from the local `@/components/ui` barrel:

```tsx
import { Button, Input, Checkbox, Field, Loader, Select } from "@/components/ui";
```

## Available Components

### Button

**Import:** `import { Button } from "@/components/ui";`

**Props:**
- `variant`: `"primary" | "secondary" | "ghost" | "destructive" | "outline"` [default: `"secondary"`]
- `size`: `"xs" | "sm" | "base" | "lg"` [default: `"base"`]
- `shape`: `"base" | "square" | "circle"` [default: `"base"`]
- `loading`: `boolean` — shows a spinner and disables the button

**Examples:**

```tsx
<Button variant="primary">Save</Button>
<Button variant="ghost" size="sm">Cancel</Button>
<Button variant="destructive" loading={isDeleting}>Delete</Button>
<Button variant="primary" shape="square" size="sm"><PlusIcon /></Button>
```

---

### Input

**Import:** `import { Input } from "@/components/ui";`

**Props:**
- `variant`: `"default" | "error"` [default: `"default"`]
- `inputSize`: `"xs" | "sm" | "base" | "lg"` [default: `"base"`]
- All standard `<input>` attributes

**Examples:**

```tsx
<Input placeholder="Enter a value..." />
<Input variant="error" value={value} onChange={handleChange} />
```

---

### Checkbox

**Import:** `import { Checkbox } from "@/components/ui";`

**Props:**
- `label`: `string` — optional label rendered next to the checkbox
- `checked`: `boolean`
- `indeterminate`: `boolean`
- All standard `@base-ui/react` Checkbox.Root attributes

**Examples:**

```tsx
<Checkbox label="Accept terms" checked={accepted} onCheckedChange={setAccepted} />
<Checkbox indeterminate />
```

---

### Field

**Import:** `import { Field, Textarea } from "@/components/ui";`

**Props (Field):**
- `label`: `string` — label text above the input
- `description`: `ReactNode` — helper text below the input
- `error`: `{ message?: string }` — shows error text (hides description)

**Examples:**

```tsx
<Field label="Title" description="Enter a short title">
  <Input />
</Field>
<Field label="Notes" error={{ message: "Required" }}>
  <Textarea />
</Field>
```

---

### Loader

**Import:** `import { Loader } from "@/components/ui";`

**Props:**
- `size`: `"sm" | "base" | "lg"` [default: `"base"`]

**Examples:**

```tsx
<Loader />
<Loader size="sm" />
```

---

### Select

**Import:** `import { Select } from "@/components/ui";`

**Props:**
- `items`: `{ value: string; label: string }[]`
- `placeholder`: `string` [default: `"Select an option"`]
- `size`: `"xs" | "sm" | "base" | "lg"` [default: `"base"`] — matches `Input.inputSize` heights
- `className`: `string` — passed to the trigger
- All standard `@base-ui/react` Select.Root attributes

**Examples:**

```tsx
<Select
  size="sm"
  items={[{ value: "low", label: "Low" }, { value: "high", label: "High" }]}
  placeholder="Select priority"
  value={priority}
  onValueChange={setPriority}
/>
```

---

## Styling Guide

Use Radix color scale tokens via Tailwind. Never use raw Tailwind colors like `bg-gray-500` or `text-blue-600`.

Colors are from [`tailwindcss-radix-colors`](https://tailwindcss-radix-colors.mrcai.dev) v2 (imported as `-colors-only.css`). Semantic utilities are in `src/styles/radix-utilities.css`:
- **gray** — Neutral backgrounds, text, borders
- **yellow** — Primary accent, brand color (buttons, focus rings, highlights)
- **red** — Destructive actions, errors

### Quick Reference

| Purpose | Token | Example Use |
|---------|-------|-------------|
| **Page background** | `bg-gray-app` | Root layout background |
| **Card/surface background** | `bg-gray-surface` | Cards, inputs |
| **Interactive background (normal)** | `bg-gray-base` | Button/element base state |
| **Interactive background (hover)** | `bg-gray-hover` | Explicit hover state |
| **Interactive background (active)** | `bg-gray-active` | Explicit active/pressed state |
| **Primary text** | `text-gray` | Body text |
| **Secondary text** | `text-gray-muted` | Placeholders, hints |
| **Border** | `ring-gray-subtle` | Input rings |
| **Brand/accent** | `bg-yellow-solid` | Primary buttons |
| **Focus ring** | `ring-yellow-strong` | Focus states |
| **Error** | `bg-red-solid` | Destructive actions |
| **Error text** | `text-red-muted` | Error messages |

### Semantic Utilities

Hover/active states are **explicit** — compose them in the component:

#### Backgrounds
| Utility | Step | Use case |
|---------|------|----------|
| `bg-{color}-app` | 1 | App background |
| `bg-{color}-surface` | 2 | Cards, raised surfaces |
| `bg-{color}-base` | 3 | Component background (normal) |
| `bg-{color}-hover` | 4 | Component background (hover) |
| `bg-{color}-active` | 5 | Component background (active) |
| `bg-{color}-ghost` | transparent | Ghost base |
| `bg-{color}-ghost-hover` | 3 | Ghost hover |
| `bg-{color}-ghost-active` | 4 | Ghost active |
| `bg-{color}-solid` | 9 | Solid accent |
| `bg-{color}-solid-hover` | 10 | Solid accent hover |

#### Borders / Dividers / Rings / Underlines
| Utility | Step | Use case |
|---------|------|----------|
| `{type}-{color}-subtle` | 6 | Non-interactive, separators |
| `{type}-{color}` | 7 | Default interactive |
| `{type}-{color}-strong` | 8 | Emphasis, focus rings |

Where `{type}` is: `border`, `divide`, `ring`, `underline`

#### Text
| Utility | Step |
|---------|------|
| `text-{color}-placeholder` | 10 |
| `text-{color}-muted` | 11 |
| `text-{color}` | 12 |

### Custom Shadows

Custom shadow utilities are defined in `src/styles.css`:
- `shadow-sm` — Subtle elevation
- `shadow-base` — Default card shadow
- `shadow-lg` — Modal/dropdown shadow
- `shadow-yellow` — Yellow glow effect
