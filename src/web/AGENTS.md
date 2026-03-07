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
- All standard `@base-ui/react` Select.Root attributes

**Examples:**

```tsx
<Select
  items={[{ value: "low", label: "Low" }, { value: "high", label: "High" }]}
  placeholder="Select priority"
  value={priority}
  onValueChange={setPriority}
/>
```

---

## Styling Guide

Use Radix color scale tokens via Tailwind. Never use raw Tailwind colors like `bg-gray-500` or `text-blue-600`.

### Quick Reference

| Purpose | Token | Example Use |
|---------|-------|-------------|
| **Page background** | `bg-gray-1` | Root layout background |
| **Card/surface background** | `bg-gray-subtle` | Cards, inputs |
| **Elevated background** | `bg-gray-ui` | Modals, dropdowns |
| **Primary text** | `text-gray-normal` | Body text |
| **Secondary text** | `text-gray-dim` | Placeholders, hints |
| **Border** | `ring-gray-6` | Input rings |
| **Brand/accent** | `bg-indigo-solid` | Primary buttons |
| **Error** | `bg-tomato-solid` | Destructive actions |
| **Success** | `text-green-9` | Success states |
