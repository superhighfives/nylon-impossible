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

## Install Package

Install Kumo using your preferred package manager:

**npm**

`npm install @cloudflare/kumo`

**pnpm**

`pnpm add @cloudflare/kumo`

**yarn**

`yarn add @cloudflare/kumo`

## Import Components

Import components from the main package or use granular imports for better tree-shaking:

**Main Package Import**

```
import { Button, Input, Surface } from "@cloudflare/kumo";
```

**Granular Import (Recommended)**

```
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
```

## Import Styles

Kumo provides two CSS distribution options depending on your setup:

**For Tailwind CSS Users (Recommended)**

If your application uses Tailwind CSS, add Kumo's source files to your content configuration and import the styles. Make sure to import Tailwind first, then Kumo styles:

```
/* app.css or main.css */
@source "../node_modules/@cloudflare/kumo/dist/**/*.{js,jsx,ts,tsx}";
@import "tailwindcss";
@import "@cloudflare/kumo/styles/tailwind";

/* Your custom styles */
```

Note: You can also use the default export @cloudflare/kumo/styles which is equivalent to styles/tailwind.


**For Non-Tailwind Users (Standalone)**

If your application doesn't use Tailwind CSS, use the standalone build which includes all compiled styles:

```
// In your app entry point (e.g., main.tsx, index.tsx)
import "@cloudflare/kumo/styles/standalone";
```

The standalone build includes all Tailwind utilities and Kumo component styles pre-compiled. No Tailwind configuration needed!

## Usage Example

Here's a complete example of using Kumo components with Tailwind CSS:

**CSS File (app.css)**

```
@import "tailwindcss";
@import "@cloudflare/kumo/styles/tailwind";
Component File (App.tsx)

import { Button, Input, Surface } from "@cloudflare/kumo";
import "./app.css";

export default function App() {
  return (
    <Surface className="p-6 rounded-lg">
      <h1 className="text-2xl font-bold mb-4">Welcome to Kumo</h1>
      <Input placeholder="Enter your name..." className="mb-4" />
      <Button variant="primary">Submit</Button>
    </Surface>
  );
}
```

## Available Components
The following components are currently available in Kumo:

Badge - Display status indicators and labels
Button - Interactive buttons with multiple variants
Input - Text input fields with validation support
InputArea - Multi-line textarea with Input styling
InputGroup - Compound component for grouped inputs and buttons
Loader - Loading spinners and indicators
SkeletonLine - Animated skeleton loading placeholders
Surface - Container component for content
More components are being added regularly. Check the Components section for detailed documentation.

## Utilities

Kumo also exports utility functions for common tasks:

```
import { cn, safeRandomId, LinkProvider } from "@cloudflare/kumo";

// Merge class names with Tailwind
const className = cn("base-class", condition && "conditional-class");

// Generate safe random IDs
const id = safeRandomId();

// Configure link component for your framework
<LinkProvider component={YourLinkComponent}>
  {/* Your app */}
</LinkProvider>
```

# Kumo Component Registry

> Auto-generated component metadata for AI/agent consumption.
> Generated: 2025-12-10T17:44:01.184Z


## Styling Guide

**Important:** Only use Kumo semantic tokens. Never use raw Tailwind colors like `bg-gray-500` or `text-blue-600`.

### Quick Reference

| Purpose | Token | Example Use |
|---------|-------|-------------|
| **Page/card background** | `bg-surface` | Main content areas |
| **Elevated surface** | `bg-surface-elevated` | Modals, dropdowns |
| **Interactive element** | `bg-secondary` | Buttons, inputs |
| **Hover state** | `bg-subtle` | Hover backgrounds |
| **Selected/active** | `bg-accent` | Active tabs, selections |
| **Primary text** | `text-surface` | Body text, headings |
| **Secondary text** | `text-secondary` | Descriptions, hints |
| **Muted text** | `text-muted` | Placeholders, disabled |
| **Card border** | `border-color` | Dividers, outlines |
| **Focus ring** | `ring-active` | Keyboard focus |
| **Error state** | `text-error` + `ring-destructive` | Validation errors |

### State Colors

| State | Background | Text | Border/Ring |
|-------|------------|------|-------------|
| **Error** | `bg-error-surface` | `text-error` | `ring-destructive` |
| **Warning** | `bg-alert-surface` | `text-alert` | `ring-alert-border` |
| **Success** | — | `text-success` | — |
| **Info** | `bg-info-surface` | `text-info` | `ring-info-border` |

### Surface Hierarchy

Use layered surfaces for visual depth:
```
bg-surface → bg-surface-elevated → bg-surface-secondary
```

### Dark Mode

All semantic tokens automatically adapt to dark mode. No manual `dark:` prefixes needed.

### Token Usage in Components

Most frequently used tokens across Kumo components:

| Category | Top Tokens |
|----------|------------|
| **Background** | `bg-secondary`, `bg-surface`, `bg-color-3`, `bg-color`, `bg-accent` |
| **Text** | `text-surface`, `text-secondary`, `text-muted`, `text-white`, `text-error` |
| **Border/Ring** | `ring-border`, `ring-active`, `ring-destructive`, `ring-color` |

---

### All Semantic Tokens (Reference)

> Use the Quick Reference table above for common cases. This section lists all available tokens.

**Text:** `text-alert`, `text-beta`, `text-brand`, `text-calendar-day-range-selected-endpoints`, `text-calendar-day-range-selected-out-of-range`, `text-calendar-reset`, `text-destructive`, `text-disabled`, and 17 more

**Background:** `bg-accent`, `bg-active`, `bg-alert-border`, `bg-alert-selection`, `bg-alert-surface`, `bg-black-icon`, `bg-border`, `bg-calendar`, and 27 more

**Border:** `border-alert-border`, `border-border`, `border-color`, `border-error-border`, `border-hover`, `border-hover-border`, `border-hover-selected`, `border-info-border`, `border-subtle`, `border-toast-button-hover`

**Ring:** `ring-active`, `ring-alert-border`, `ring-border`, `ring-color`, `ring-destructive`, `ring-error-border`, `ring-hover-border`, `ring-info-border`

**Fill:** `fill-active`, `fill-black-icon`, `fill-icon-path`

---

### Badge

Badge component

**Import:** `import { Badge } from "@cloudflare/kumo";`

**Category:** Display

**Props:**

- `variant`: enum [default: primary]
  - `"primary"`: Default high-emphasis badge for important labels
  - `"secondary"`: Subtle badge for secondary information
  - `"destructive"`: Error or danger state indicator
  - `"outline"`: Bordered badge with transparent background
  - `"beta"`: Indicates beta or experimental features
- `className`: string
- `children`: ReactNode

**Colors (kumo tokens used):**

`bg-color`, `bg-destructive`, `bg-surface-inverse`, `border-color`, `border-primary`, `text-beta`, `text-surface`, `text-surface-inverse`, `text-white`

**Examples:**

```tsx
<Badge variant="primary">Badge</Badge>
```


---

### Banner

Banner component

**Import:** `import { Banner } from "@cloudflare/kumo";`

**Category:** Feedback

**Props:**

- `icon`: ReactNode
- `text`: string (required)
- `variant`: enum [default: default]
  - `"default"`: Informational banner for general messages
  - `"alert"`: Warning banner for cautionary messages
  - `"error"`: Error banner for critical issues
- `className`: string

**Colors (kumo tokens used):**

`bg-alert-selection`, `bg-alert-surface`, `bg-error-selection`, `bg-error-surface`, `bg-info-selection`, `bg-info-surface`, `border-alert-border`, `border-error-border`, `border-info-border`, `text-alert`, `text-error`, `text-info`

**Examples:**

```tsx
<Banner variant="default" text="This is a banner message" icon={<InfoIcon size={16} />} />
```


---

### Breadcrumbs

Breadcrumbs component

**Import:** `import { Breadcrumbs } from "@cloudflare/kumo";`

**Category:** Block

**Props:**

- `size`: enum [default: base]
  - `"sm"`: Compact breadcrumbs for dense UIs
  - `"base"`: Default breadcrumbs size
- `children`: ReactNode
- `className`: string

**Colors (kumo tokens used):**

`text-green-2`, `text-label-inverse`, `text-muted`

**Sub-Components:**

This is a compound component. Use these sub-components:

#### Breadcrumbs.Link

Link sub-component

Props:
- `href`: string (required)
- `icon`: React.ReactNode

#### Breadcrumbs.Current

Current sub-component

Props:
- `loading`: boolean
- `icon`: React.ReactNode

#### Breadcrumbs.Separator

Separator sub-component

#### Breadcrumbs.Clipboard

Clipboard sub-component

Props:
- `text`: string (required)


**Examples:**

```tsx
<Breadcrumbs>
      <Breadcrumbs.Link href="/">Home</Breadcrumbs.Link>
      <Breadcrumbs.Separator />
      <Breadcrumbs.Link href="/projects">Projects</Breadcrumbs.Link>
      <Breadcrumbs.Separator />
      <Breadcrumbs.Current>Current Project</Breadcrumbs.Current>
    </Breadcrumbs>
```

```tsx
<Breadcrumbs size="sm">
  <Breadcrumbs.Link href="/">Home</Breadcrumbs.Link>
  <Breadcrumbs.Separator />
  <Breadcrumbs.Link href="/projects">Projects</Breadcrumbs.Link>
  <Breadcrumbs.Separator />
  <Breadcrumbs.Current>Current Project</Breadcrumbs.Current>
</Breadcrumbs>
```

```tsx
<Breadcrumbs>
      <Breadcrumbs.Link href="/" icon={<House size={16} />}>
        Home
      </Breadcrumbs.Link>
      <Breadcrumbs.Separator />
      <Breadcrumbs.Link href="/documents" icon={<Folder size={16} />}>
        Documents
      </Breadcrumbs.Link>
      <Breadcrumbs.Separator />
      <Breadcrumbs.Current icon={<File size={16} />}>
        File.txt
      </Breadcrumbs.Current>
    </Breadcrumbs>
```

```tsx
<Breadcrumbs>
      <Breadcrumbs.Link href="/">Home</Breadcrumbs.Link>
      <Breadcrumbs.Separator />
      <Breadcrumbs.Link href="/projects">Projects</Breadcrumbs.Link>
      <Breadcrumbs.Separator />
      <Breadcrumbs.Link href="/projects/web">Web Applications</Breadcrumbs.Link>
      <Breadcrumbs.Separator />
      <Breadcrumbs.Link href="/projects/web/dashboard">
        Dashboard
      </Breadcrumbs.Link>
      <Breadcrumbs.Separator />
      <Breadcrumbs.Current>Settings</Breadcrumbs.Current>
    </Breadcrumbs>
```

```tsx
<Breadcrumbs>
      <Breadcrumbs.Current>Home</Breadcrumbs.Current>
    </Breadcrumbs>
```


---

### Button

Button component

**Import:** `import { Button } from "@cloudflare/kumo";`

**Category:** Action

**Props:**

- `children`: ReactNode
- `className`: string
- `icon`: ReactNode
- `loading`: boolean
- `shape`: enum [default: base]
  - `"base"`: Default rectangular button shape
  - `"square"`: Square button for icon-only actions
  - `"circle"`: Circular button for icon-only actions
- `size`: enum [default: base]
  - `"xs"`: Extra small button for compact UIs
  - `"sm"`: Small button for secondary actions
  - `"base"`: Default button size
  - `"lg"`: Large button for primary CTAs
- `variant`: enum [default: secondary]
  - `"primary"`: High-emphasis button for primary actions
  - `"secondary"`: Default button style for most actions
  - `"ghost"`: Minimal button with no background
  - `"destructive"`: Danger button for destructive actions like delete
  - `"outline"`: Bordered button with transparent background
- `onChange`: React.FormEventHandler<HTMLButtonElement>
- `onSubmit`: React.FormEventHandler<HTMLButtonElement>
- `onClick`: React.MouseEventHandler<HTMLButtonElement>
- `id`: string
- `title`: string
- `disabled`: boolean
- `name`: string
- `type`: enum
- `value`: string | string[] | number

**Colors (kumo tokens used):**

`bg-accent`, `bg-destructive`, `bg-primary`, `bg-secondary`, `bg-subtle`, `bg-surface`, `border-subtle`, `ring-active`, `ring-border`, `text-muted`, `text-primary`, `text-secondary`, `text-surface`, `text-white`

**Examples:**

```tsx
<Button variant="primary">Button</Button>
```

```tsx
<Button size="xs">Button</Button>
```

```tsx
<Button shape="base" icon={PlusIcon} />
```

```tsx
<Button variant="primary" disabled={true}>Button</Button>
```

```tsx
<Button variant="primary" icon={PlusIcon}>Add Item</Button>
```

```tsx
<Button variant="primary" loading={true}>Loading...</Button>
```


---

### Checkbox

Checkbox component

**Import:** `import { Checkbox } from "@cloudflare/kumo";`

**Category:** Input

**Props:**

- `variant`: enum [default: default]
  - `"default"`: Default checkbox appearance
  - `"error"`: Error state for validation failures
- `label`: string
- `checked`: boolean
- `indeterminate`: boolean
- `disabled`: boolean
- `children`: ReactNode
- `onChange`: React.ChangeEventHandler<HTMLInputElement>
- `onSubmit`: React.FormEventHandler<HTMLInputElement>
- `onClick`: React.MouseEventHandler<HTMLInputElement>
- `className`: string
- `id`: string
- `title`: string
- `name`: string
- `placeholder`: string
- `readOnly`: boolean
- `required`: boolean
- `size`: number
- `type`: React.HTMLInputTypeAttribute
- `value`: string | string[] | number

**Colors (kumo tokens used):**

`bg-surface`, `bg-surface-inverse`, `ring-active`, `ring-border`, `ring-destructive`, `text-surface`, `text-surface-inverse`

**Examples:**

```tsx
<Checkbox variant="default" label="Checkbox" />
```

```tsx
<Checkbox label="Checked" checked={true} />
```

```tsx
<Checkbox label="Indeterminate" indeterminate={true} />
```

```tsx
<Checkbox label="Disabled" disabled={true} />
```

```tsx
<Checkbox label="Checked & Disabled" checked={true} disabled={true} />
```

```tsx
<Checkbox label="Indeterminate & Disabled" indeterminate={true} disabled={true} />
```


---

### ClipboardText

ClipboardText component

**Import:** `import { ClipboardText } from "@cloudflare/kumo";`

**Category:** Action

**Props:**

- `size`: enum [default: lg]
  - `"sm"`: Small clipboard text for compact UIs
  - `"base"`: Default clipboard text size
  - `"lg"`: Large clipboard text for prominent display
- `text`: string (required)
  The text to display and copy to clipboard
- `className`: string
  Additional CSS classes

**Colors (kumo tokens used):**

`bg-surface`, `border-color`

**Examples:**

```tsx
<ClipboardText size="sm" text="npm install @cloudflare/kumo" />
```

```tsx
<ClipboardText text="sk_live_abc123xyz789" />
```


---

### Code

Simple code component without syntax highlighting

**Import:** `import { Code } from "@cloudflare/kumo";`

**Category:** Display

**Props:**

- `code`: string (required)
  The code content to display
- `values`: Record<string, { value: string; highlight?: boolean }>
  Template values for interpolation
- `className`: string
  Additional CSS classes
- `lang`: 'ts' | 'tsx' | 'jsonc' | 'bash' | 'css'
  Language for syntax highlighting

**Colors (kumo tokens used):**

`bg-surface`, `border-color`, `text-neutral-subtle`

**Examples:**

```tsx
<Code lang="ts" code='const hello = "world";' />
```

```tsx
<CodeBlock
      lang="tsx"
      code={`<Button variant="primary">
  Click me
</Button>`}
    />
```


---

### Combobox

Combobox component

**Import:** `import { Combobox } from "@cloudflare/kumo";`

**Category:** Input

**Props:**

- `inputSide`: enum [default: right]
  - `"right"`: Input positioned inline to the right of chips
  - `"top"`: Input positioned above chips
- `items`: T[] (required)
  Array of items to display in the dropdown
- `value`: T | T[]
  Currently selected value(s)
- `children`: ReactNode
  Combobox content (trigger, content, items)
- `className`: string
  Additional CSS classes
- `onValueChange`: (value: T | T[]) => void
  Callback when selection changes
- `multiple`: boolean
  Allow multiple selections
- `isItemEqualToValue`: (item: T, value: T) => boolean
  Custom equality function for comparing items

**Colors (kumo tokens used):**

`bg-color-2`, `bg-color-3`, `bg-secondary`, `fill-active`, `ring-border`, `text-neutral-dim-2`, `text-surface`

**Sub-Components:**

This is a compound component. Use these sub-components:

#### Combobox.Content

Content sub-component

Props:
- `className`: string
- `align`: ComboboxBase.Positioner.Props["align"]
- `alignOffset`: ComboboxBase.Positioner.Props["alignOffset"]
- `side`: ComboboxBase.Positioner.Props["side"]
- `sideOffset`: ComboboxBase.Positioner.Props["sideOffset"]

#### Combobox.TriggerValue

TriggerValue sub-component

#### Combobox.TriggerInput

TriggerInput sub-component

#### Combobox.TriggerMultipleWithInput

TriggerMultipleWithInput sub-component

#### Combobox.Chip

Chip sub-component

#### Combobox.Item

Item sub-component

#### Combobox.Input

Input sub-component

#### Combobox.Empty

Empty sub-component

#### Combobox.GroupLabel

GroupLabel sub-component

#### Combobox.Group

Group sub-component

#### Combobox.List

A container for combobox items. Supports render prop for custom item rendering. Renders a `<div>` element.

Props:
- `children`: ReactNode | ((item: T, index: number) => ReactNode) - Items to render, or a function that receives each item and returns a node

Usage:
```tsx
<Combobox.List>
  {(item) => <Combobox.Item value={item}>{item.label}</Combobox.Item>}
</Combobox.List>
```

#### Combobox.Collection

Renders filtered list items. Use when you need more control over item rendering.

Props:
- `children`: (item: T, index: number) => ReactNode (required) - Function that receives each filtered item and returns a node

Usage:
```tsx
<Combobox.Collection>
  {(item, index) => (
    <Combobox.Item key={index} value={item}>
      {item.label}
    </Combobox.Item>
  )}
</Combobox.Collection>
```


**Examples:**

```tsx
<Combobox items={items} value={value} onValueChange={setValue}>
        <Combobox.TriggerInput placeholder="Please select database" />
        <Combobox.Content>
          <Combobox.Empty />
          <Combobox.List>
            {(item: (typeof items)[number]) => {
              return (
                <Combobox.Item key={item.value} value={item}>
                  {item.label}
                </Combobox.Item>
              );
            }}
          </Combobox.List>
        </Combobox.Content>
      </Combobox>
```


---

### DateRangePicker

DateRangePicker component

**Import:** `import { DateRangePicker } from "@cloudflare/kumo";`

**Category:** Input

**Props:**

- `size`: enum [default: base]
  - `"sm"`: Compact calendar for tight spaces
  - `"base"`: Default calendar size
  - `"lg"`: Large calendar for prominent date selection
- `variant`: enum [default: default]
  - `"default"`: Default calendar appearance
  - `"subtle"`: Subtle calendar with minimal background
- `timezone`: string
  Display timezone (display only)
- `className`: string
  Additional CSS classes
- `onStartDateChange`: (date: Date | null) => void
  Callback when start date changes
- `onEndDateChange`: (date: Date | null) => void
  Callback when end date changes

**Colors (kumo tokens used):**

`bg-calendar`, `bg-calendar-day-range-selected`, `bg-calendar-day-range-selected-endpoints`, `bg-calendar-day-range-selected-out-of-range`, `bg-hover`, `bg-surface`, `text-calendar-day-range-selected-endpoints`, `text-calendar-day-range-selected-out-of-range`, `text-calendar-reset`, `text-neutral-dim`, `text-neutral-subtle`, `text-secondary`

**Examples:**

```tsx
<DateRangePicker size="sm" onStartDateChange={() => {}} onEndDateChange={() => {}} />
```

```tsx
<DateRangePicker variant="default" onStartDateChange={() => {}} onEndDateChange={() => {}} />
```

```tsx
<DateRangePicker timezone="UTC (GMT+0)" />
```


---

### Dialog

Dialog component

**Import:** `import { Dialog } from "@cloudflare/kumo";`

**Category:** Overlay

**Props:**

- `className`: string
- `children`: ReactNode
- `size`: enum [default: base]
  - `"base"`: Default dialog width
  - `"sm"`: Small dialog for simple confirmations
  - `"lg"`: Large dialog for complex content
  - `"xl"`: Extra large dialog for detailed views

**Colors (kumo tokens used):**

`bg-color-3`, `bg-surface`, `text-secondary`

**Sub-Components:**

This is a compound component. Use these sub-components:

#### Dialog.Root

Controls the open state of the dialog. Doesn't render its own HTML element.

Props:
- `open`: boolean - Whether the dialog is currently open (controlled mode)
- `defaultOpen`: boolean [default: false] - Whether the dialog is initially open (uncontrolled mode)
- `onOpenChange`: (open: boolean, event: Event) => void - Callback fired when the dialog opens or closes
- `modal`: boolean | 'trap-focus' [default: true] - Whether the dialog is modal. When true, focus is trapped and page scroll is locked
- `dismissible`: boolean [default: true] - Whether clicking outside closes the dialog

Usage:
```tsx
<Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
```
```tsx
<Dialog.Root defaultOpen={false}>
```

#### Dialog.Trigger

A button that opens the dialog when clicked. Renders a `<button>` element.

Props:
- `render`: ReactElement | ((props, state) => ReactElement) - Custom element to render instead of the default button
- `disabled`: boolean - Whether the trigger is disabled

Usage:
```tsx
<Dialog.Trigger render={<Button>Open</Button>} />
```
```tsx
<Dialog.Trigger>Open Dialog</Dialog.Trigger>
```

#### Dialog.Title

A heading that labels the dialog for accessibility. Renders a `<h2>` element.

Props:
- `render`: ReactElement | ((props, state) => ReactElement) - Custom element to render instead of the default h2

Usage:
```tsx
<Dialog.Title>Confirm Action</Dialog.Title>
```
```tsx
<Dialog.Title render={<h3 />}>Custom Heading</Dialog.Title>
```

#### Dialog.Description

A paragraph providing additional context about the dialog. Renders a `<p>` element.

Props:
- `render`: ReactElement | ((props, state) => ReactElement) - Custom element to render instead of the default p

Usage:
```tsx
<Dialog.Description>Are you sure you want to proceed?</Dialog.Description>
```

#### Dialog.Close

A button that closes the dialog when clicked. Renders a `<button>` element.

Props:
- `render`: ReactElement | ((props, state) => ReactElement) - Custom element to render instead of the default button
- `disabled`: boolean - Whether the close button is disabled

Usage:
```tsx
<Dialog.Close render={<Button>Cancel</Button>} />
```
```tsx
<Dialog.Close>×</Dialog.Close>
```


**Examples:**

```tsx
<Dialog.Root>
      <Dialog.Trigger render={<Button>Open Dialog</Button>} />
      <Dialog className="p-6">
        <Dialog.Title className="mb-2 text-xl font-semibold">
          Dialog Title
        </Dialog.Title>
        <Dialog.Description className="mb-4">
          This is a dialog description with some content.
        </Dialog.Description>
        <Dialog.Close render={<Button>Close</Button>} />
      </Dialog>
    </Dialog.Root>
```


---

### DropdownMenu

DropdownMenu component

**Import:** `import { DropdownMenu } from "@cloudflare/kumo";`

**Category:** Overlay

**Props:**

- `variant`: enum [default: default]
  - `"default"`: Default dropdown item appearance
  - `"danger"`: Destructive action item

**Colors (kumo tokens used):**

`bg-accent`, `bg-color-3`, `bg-destructive-2`, `bg-muted`, `bg-secondary`, `ring-border`, `text-error`, `text-secondary`, `text-surface`

**Sub-Components:**

This is a compound component. Use these sub-components:

#### DropdownMenu.Trigger

Trigger sub-component

#### DropdownMenu.Portal

Portal sub-component (wraps DropdownMenuPrimitive)

#### DropdownMenu.Sub

Sub sub-component (wraps DropdownMenuPrimitive)

#### DropdownMenu.SubTrigger

SubTrigger sub-component

#### DropdownMenu.SubContent

SubContent sub-component

#### DropdownMenu.Content

Content sub-component

#### DropdownMenu.Item

Item sub-component

#### DropdownMenu.CheckboxItem

CheckboxItem sub-component

#### DropdownMenu.Label

Label sub-component

#### DropdownMenu.Separator

Separator sub-component

#### DropdownMenu.Shortcut

Shortcut sub-component

#### DropdownMenu.Group

Group sub-component (wraps DropdownMenuPrimitive)


---

### Empty

Empty component

**Import:** `import { Empty } from "@cloudflare/kumo";`

**Category:** Block

**Props:**

- `size`: enum [default: base]
  - `"sm"`: Compact empty state for smaller containers
  - `"base"`: Default empty state size
  - `"lg"`: Large empty state for prominent placement
- `icon`: ReactNode
- `title`: string (required)
- `description`: string
- `commandLine`: string
- `contents`: ReactNode
- `className`: string

**Colors (kumo tokens used):**

`bg-secondary`, `bg-surface-secondary`, `border-border-2`, `border-color`, `border-hover-border`, `text-brand`, `text-green`, `text-label`, `text-label-inverse`, `text-surface`

**Examples:**

```tsx
<Empty icon={<DatabaseIcon size={48} className="text-disabled" />} title="No data available" description="There is no data to display at the moment. Try creating a new item to get started." />
```

```tsx
<Empty size="sm" icon={<DatabaseIcon size={48} className="text-disabled" />} title="No data available" description="There is no data to display at the moment." />
```

```tsx
<Empty icon={<FolderOpenIcon size={48} className="text-disabled" />} title="No projects found" description="Get started by creating your first project using the command below." commandLine="npm create kumo-project" />
```

```tsx
<Empty icon={<CloudSlashIcon size={48} className="text-disabled" />} title="No connection" description="Unable to connect to the server. Please check your connection and try again." contents={<div className="flex gap-2">
        <Button variant="primary">Retry</Button>
        <Button variant="outline">Go Back</Button>
      </div>} />
```

```tsx
<Empty title="Nothing here" />
```


---

### Expandable

Expandable component

**Import:** `import { Expandable } from "@cloudflare/kumo";`

**Category:** Display

**Props:**

- `children`: ReactNode
- `title`: string (required)
- `open`: boolean
- `className`: string
- `onOpenChange`: (open: boolean) => void
  Callback when expanded state changes

**Colors (kumo tokens used):**

`border-color`, `text-success`

**Examples:**

```tsx
<Expandable title="Click to expand" open={open} onOpenChange={setOpen}>
        <Text>This is the expandable content that can be shown or hidden.</Text>
      </Expandable>
```


---

### Field

Field component

**Import:** `import { Field } from "@cloudflare/kumo";`

**Category:** Input

**Props:**

- `children`: ReactNode
- `label`: string (required)
- `error`: object
- `description`: ReactNode

**Colors (kumo tokens used):**

`text-error`, `text-muted`

**Examples:**

```tsx
<Field label="Email" description="Enter your email address">
      <Input placeholder="email@example.com" />
    </Field>
```

```tsx
<Field label="Email" description="Enter your email address">
      <Input name="custom–name" placeholder="email@example.com" />
    </Field>
```

```tsx
<Field
      label="Email"
      error={{ message: "Invalid email address", match: true }}
    >
      <Input placeholder="email@example.com" variant="error" />
    </Field>
```


---

### Input

Input component

**Import:** `import { Input } from "@cloudflare/kumo";`

**Category:** Input

**Props:**

- `size`: enum [default: base]
  - `"xs"`: Extra small input for compact UIs
  - `"sm"`: Small input for secondary fields
  - `"base"`: Default input size
  - `"lg"`: Large input for prominent fields
- `variant`: enum [default: default]
  - `"default"`: Default input appearance
  - `"error"`: Error state for validation failures

**Colors (kumo tokens used):**

`bg-secondary`, `ring-active`, `ring-border`, `ring-destructive`, `text-muted`, `text-surface`

**Examples:**

```tsx
function InputGroupExamplesRender() {
    const [username, setUsername] = React.useState("");
    const [status, setStatus] = React.useState<
      "idle" | "checking" | "available" | "taken" | "error"
    >("idle");

    const checkAvailability = () => {
      if (!username) {
        setStatus("error");
        return;
      }
      setStatus("checking");
      // Simulate API call
      setTimeout(() => {
        setStatus(username.length > 3 ? "available" : "taken");
      }, 800);
    };

    const statusText = {
      idle: "",
      checking: "Checking...",
      available: "✓ Available",
      taken: "✗ Taken",
      error: "Please enter a username",
    };

    return (
      <div className="space-y-6">
        {/* Prefix label - common for URLs, usernames, currencies */}
        <div className="space-y-1">
          <p className="text-center text-sm text-muted">Prefix label</p>
          <InputGroup>
            <InputGroup.Label>https://</InputGroup.Label>
            <InputGroup.Input placeholder="example.com" />
          </InputGroup>
        </div>

        {/* Prefix label with suffix description - common for currency inputs */}
        <div className="space-y-1">
          <p className="text-center text-sm text-muted">Label with description</p>
          <InputGroup>
            <InputGroup.Label>$</InputGroup.Label>
            <InputGroup.Input placeholder="0.00" type="number" />
            <InputGroup.Description>USD</InputGroup.Description>
          </InputGroup>
        </div>

        {/* With action button - interactive example */}
        <div className="space-y-1">
          <p className="text-center text-sm text-muted">
            With action button (4+ chars = available, fewer = taken)
          </p>
          <InputGroup>
            <InputGroup.Label>@</InputGroup.Label>
            <InputGroup.Input
              placeholder="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setStatus("idle");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  checkAvailability();
                }
              }}
            />
            <InputGroup.Button onClick={checkAvailability}>
              {status === "checking" ? "Checking..." : "Check"}
            </InputGroup.Button>
          </InputGroup>
          <p
            aria-live="polite"
            className={`text-sm ${status === "available" ? "text-success" : status === "error" || status === "taken" ? "text-error" : "text-muted"}`}
          >
            {statusText[status]}
          </p>
        </div>
      </div>
    );
  }
```

```tsx
<div className="space-y-4">
      <div className="space-y-1">
        <p className="text-center text-sm text-muted">Size: xs</p>
        <InputGroup size="xs">
          <InputGroup.Label>@</InputGroup.Label>
          <InputGroup.Input placeholder="username" />
          <InputGroup.Button>Submit</InputGroup.Button>
        </InputGroup>
      </div>

      <div className="space-y-1">
        <p className="text-center text-sm text-muted">Size: sm</p>
        <InputGroup size="sm">
          <InputGroup.Label>@</InputGroup.Label>
          <InputGroup.Input placeholder="username" />
          <InputGroup.Button>Submit</InputGroup.Button>
        </InputGroup>
      </div>

      <div className="space-y-1">
        <p className="text-center text-sm text-muted">Size: base (default)</p>
        <InputGroup size="base">
          <InputGroup.Label>@</InputGroup.Label>
          <InputGroup.Input placeholder="username" />
          <InputGroup.Button>Submit</InputGroup.Button>
        </InputGroup>
      </div>

      <div className="space-y-1">
        <p className="text-center text-sm text-muted">Size: lg</p>
        <InputGroup size="lg">
          <InputGroup.Label>@</InputGroup.Label>
          <InputGroup.Input placeholder="username" />
          <InputGroup.Button>Submit</InputGroup.Button>
        </InputGroup>
      </div>
    </div>
```


---

### LayerCard

LayerCard component

**Import:** `import { LayerCard } from "@cloudflare/kumo";`

**Category:** Display

**Props:**

- `children`: ReactNode
- `className`: string

**Colors (kumo tokens used):**

`bg-layer-card-primary`, `bg-surface-2`, `ring-border`, `ring-color`, `text-neutral-dim`

**Sub-Components:**

This is a compound component. Use these sub-components:

#### LayerCard.Primary

Primary sub-component

#### LayerCard.Secondary

Secondary sub-component


**Examples:**

```tsx
<LayerCard className="w-[250px]">
      <LayerCard.Secondary className="flex items-center justify-between">
        <div>Next Steps</div>
        <Button variant="ghost" size="sm" shape="square">
          <ArrowRightIcon size={16} />
        </Button>
      </LayerCard.Secondary>

      <LayerCard.Primary>
        <Text>Get started with Kumo</Text>
      </LayerCard.Primary>
    </LayerCard>
```


---

### Loader

Loader component

**Import:** `import { Loader } from "@cloudflare/kumo";`

**Category:** Feedback

**Props:**

- `className`: string
- `size`: enum [default: base]
  - `"sm"`: Small loader for inline use
  - `"base"`: Default loader size
  - `"lg"`: Large loader for prominent loading states

**Examples:**

```tsx
<Loader size="sm" className="text-surface" />
```


---

### MenuBar

MenuBar component

**Import:** `import { MenuBar } from "@cloudflare/kumo";`

**Category:** Navigation

**Props:**

- `className`: string
- `isActive`: number | boolean | string
- `options`: MenuOptionProps[] (required)
- `optionIds`: boolean

**Colors (kumo tokens used):**

`bg-color`, `bg-surface`, `border-color`

---

### Meter

Meter component

**Import:** `import { Meter } from "@cloudflare/kumo";`

**Category:** Display

**Props:**

- `customValue`: string
- `label`: string (required)
- `showValue`: boolean
- `trackClassName`: string
- `indicatorClassName`: string
- `value`: number
  Current value of the meter
- `max`: number
  Maximum value of the meter (default: 100)
- `min`: number
  Minimum value of the meter (default: 0)

**Colors (kumo tokens used):**

`bg-color`, `text-label`, `text-secondary`

**Examples:**

```tsx
<Meter label="Progress" value={50} max={100} />
```

```tsx
<div className="flex w-64 flex-col gap-4">
      <Meter label="Low" value={25} max={100} />
      <Meter label="Medium" value={50} max={100} />
      <Meter label="High" value={75} max={100} />
      <Meter label="Complete" value={100} max={100} />
    </div>
```


---

### PageHeader

PageHeader component

**Import:** `import { PageHeader } from "@cloudflare/kumo";`

**Category:** Block

**Props:**

- `spacing`: enum [default: base]
  - `"compact"`: Compact spacing between header elements
  - `"base"`: Default spacing between header elements
  - `"relaxed"`: Relaxed spacing for more prominent headers
- `breadcrumbs`: ReactNode
- `tabs`: TabsItem[]
- `defaultTab`: string
- `className`: string
- `children`: ReactNode

**Colors (kumo tokens used):**

`border-color-4`

**Examples:**

```tsx
<PageHeader
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumbs.Link href="/">Home</Breadcrumbs.Link>
          <Breadcrumbs.Separator />
          <Breadcrumbs.Link href="/projects">Projects</Breadcrumbs.Link>
          <Breadcrumbs.Separator />
          <Breadcrumbs.Current>Current Project</Breadcrumbs.Current>
        </Breadcrumbs>
      }
    />
```

```tsx
<PageHeader spacing="compact" breadcrumbs={<Breadcrumbs>
              <Breadcrumbs.Link href="/">Home</Breadcrumbs.Link>
              <Breadcrumbs.Separator />
              <Breadcrumbs.Current>Current</Breadcrumbs.Current>
            </Breadcrumbs>} tabs={[
            { label: "General", value: "general" },
            { label: "Settings", value: "settings" },
          ]} defaultTab="general" />
```

```tsx
<PageHeader
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumbs.Link href="/">Home</Breadcrumbs.Link>
          <Breadcrumbs.Separator />
          <Breadcrumbs.Current>Settings</Breadcrumbs.Current>
        </Breadcrumbs>
      }
      tabs={[
        { label: "General", value: "general" },
        { label: "Security", value: "security" },
        { label: "Notifications", value: "notifications" },
        { label: "Billing", value: "billing" },
      ]}
      defaultTab="general"
    />
```

```tsx
<PageHeader
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumbs.Link href="/">Home</Breadcrumbs.Link>
          <Breadcrumbs.Separator />
          <Breadcrumbs.Link href="/projects">Projects</Breadcrumbs.Link>
          <Breadcrumbs.Separator />
          <Breadcrumbs.Current>My Project</Breadcrumbs.Current>
        </Breadcrumbs>
      }
      tabs={[
        { label: "Overview", value: "overview" },
        { label: "Analytics", value: "analytics" },
        { label: "Settings", value: "settings" },
      ]}
      defaultTab="overview"
    >
      <Button variant="outline" size="sm">
        Export
      </Button>
      <Button variant="primary" size="sm">
        <PlusIcon size={16} />
        New Item
      </Button>
    </PageHeader>
```


---

### Pagination

Pagination component

**Import:** `import { Pagination } from "@cloudflare/kumo";`

**Category:** Navigation

**Props:**

- `setPage`: (page: number) => void (required)
  Callback when page changes
- `page`: number
- `perPage`: number
- `totalCount`: number

**Colors (kumo tokens used):**

`text-label`

**Examples:**

```tsx
<Pagination page={1} perPage={10} totalCount={100} setPage={() => {}} />
```


---

### Select

Select component

**Import:** `import { Select } from "@cloudflare/kumo";`

**Category:** Input

**Props:**

- `className`: string
  Additional CSS classes
- `label`: string
  Label text for the select
- `hideLabel`: boolean
  Whether to visually hide the label (still accessible to screen readers)
- `placeholder`: string
  Placeholder text when no value is selected
- `loading`: boolean
  Whether the select is in a loading state
- `disabled`: boolean
  Whether the select is disabled
- `value`: string
  The currently selected value
- `children`: ReactNode
  Child elements (Select.Option components)
- `onValueChange`: (value: string) => void
  Callback when selection changes
- `defaultValue`: string
  Initial value for uncontrolled mode

**Colors (kumo tokens used):**

`bg-color-3`, `bg-secondary`, `ring-active`, `ring-border`, `text-surface`

**Sub-Components:**

This is a compound component. Use these sub-components:

#### Select.Option

Option sub-component


**Examples:**

```tsx
<Select defaultValue="1" placeholder="Select an option">
      <Select.Option value="1">Option 1</Select.Option>
      <Select.Option value="2">Option 2</Select.Option>
      <Select.Option value="3">Option 3</Select.Option>
    </Select>
```


---

### SensitiveInput

SensitiveInput component

**Import:** `import { SensitiveInput } from "@cloudflare/kumo";`

**Category:** Other

**Props:**

- `checked`: boolean
- `disabled`: boolean
- `name`: string
- `placeholder`: string
- `readOnly`: boolean
- `required`: boolean
- `onChange`: React.ChangeEventHandler<HTMLInputElement>
- `className`: string
- `id`: string
- `title`: string
- `children`: ReactNode
- `onSubmit`: React.FormEventHandler<HTMLInputElement>
- `onClick`: React.MouseEventHandler<HTMLInputElement>
- `value`: string
  Controlled value
- `size`: KumoInputSize [default: base]
  Size variant
- `variant`: KumoInputVariant [default: default]
  Style variant

**Colors (kumo tokens used):**

`bg-primary`, `bg-secondary`, `outline-active`, `text-muted`, `text-secondary`, `text-white`

**Examples:**

```tsx
<div className="flex flex-col gap-4">
      {sizes.map((size) => (
        <div key={size} className="flex items-center gap-2">
          <span className="w-12 text-sm text-muted">{size}</span>
          <Field label={`${size} size`}>
            <SensitiveInput size={size} defaultValue="secret-api-key-123" />
          </Field>
        </div>
      ))}
    </div>
```

```tsx
<div className="flex flex-col gap-4">
        <Field label="Controlled Secret">
          <SensitiveInput value={value} onValueChange={setValue} />
        </Field>
        <div className="text-sm text-muted">
          Current value: <code className="text-surface">{value}</code>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setValue("new-secret-" + Date.now())}
            className="rounded bg-primary px-2 py-1 text-sm text-white"
          >
            Change value
          </button>
          <button
            onClick={() => setValue("")}
            className="rounded bg-secondary px-2 py-1 text-sm text-surface ring ring-border"
          >
            Clear
          </button>
        </div>
      </div>
```


---

### Surface

Surface component

**Import:** `import { Surface } from "@cloudflare/kumo";`

**Category:** Layout

**Props:**

- `as`: React.ElementType
  The element type to render as (default: "div")
- `className`: string
  Additional CSS classes
- `children`: ReactNode
  Child elements

**Colors (kumo tokens used):**

`ring-border`

**Examples:**


---

### Switch

Switch component

**Import:** `import { Switch } from "@cloudflare/kumo";`

**Category:** Input

**Props:**

- `onClick`: (event: React.MouseEvent) => void (required)
  Callback when switch is clicked
- `size`: enum [default: base]
  - `"sm"`: Small switch for compact UIs
  - `"base"`: Default switch size
  - `"lg"`: Large switch for prominent toggles
- `toggled`: boolean (required)
- `transitioning`: boolean
- `label`: string
- `hideLabel`: boolean
- `disabled`: boolean
- `name`: string
- `value`: string | string[] | number
- `className`: string
- `id`: string
- `title`: string
- `children`: ReactNode
- `onChange`: React.FormEventHandler<HTMLButtonElement>
- `onSubmit`: React.FormEventHandler<HTMLButtonElement>

**Colors (kumo tokens used):**

`bg-hover`, `bg-hover-selected`, `bg-selected`, `bg-surface-3`, `bg-white`, `text-surface`

**Examples:**

```tsx
<Switch label="Toggle switch" onClick={() => {}} toggled={false} />
```

```tsx
<Switch label="Disabled" onClick={() => {}} toggled={false} disabled={true} />
```


---

### Tabs

Tabs component

**Import:** `import { Tabs } from "@cloudflare/kumo";`

**Category:** Navigation

**Props:**

- `tabs`: TabsItem[]
- `value`: string
- `selectedValue`: string
- `className`: string
- `listClassName`: string
- `indicatorClassName`: string
- `onValueChange`: (value: string) => void
  Callback when active tab changes

**Colors (kumo tokens used):**

`bg-accent`, `bg-surface-elevated`, `ring-border`, `text-muted-2`, `text-surface`

**Examples:**

```tsx
<Tabs tabs={[
      { value: "tab1", label: "Tab 1" },
      { value: "tab2", label: "Tab 2" },
      { value: "tab3", label: "Tab 3" },
    ]} selectedValue="tab1" />
```


---

### Text

Text component

**Import:** `import { Text } from "@cloudflare/kumo";`

**Category:** Display

**Props:**

- `variant`: enum [default: body]
  - `"heading1"`: Large heading for page titles
  - `"heading2"`: Medium heading for section titles
  - `"heading3"`: Small heading for subsections
  - `"body"`: Default body text
  - `"secondary"`: Muted text for secondary information
  - `"success"`: Success state text
  - `"error"`: Error state text
  - `"mono"`: Monospace text for code
- `size`: enum [default: base]
  - `"xs"`: Extra small text
  - `"sm"`: Small text
  - `"base"`: Default text size
  - `"lg"`: Large text
- `bold`: boolean
  Whether to use bold font weight (only applies to body variants)
- `as`: React.ElementType
  The element type to render as
- `children`: ReactNode
  Child text content

**Colors (kumo tokens used):**

`text-destructive`, `text-muted`, `text-success`, `text-surface`

**Examples:**

```tsx
<Text variant="heading1">Sample text</Text>
```

```tsx
<Text size="xs">Sample text</Text>
```

```tsx
<Text bold={true}>Bold text</Text>
```


---

### Toasty

Toasty component

**Import:** `import { Toasty } from "@cloudflare/kumo";`

**Category:** Feedback

**Props:**

- `children`: ReactNode

**Colors (kumo tokens used):**

`bg-toast`, `bg-toast-button-hover`, `border-color`, `text-muted-2`, `text-neutral-dim`, `text-secondary`, `text-toast-button-hover`

---

### Tooltip

Tooltip component

**Import:** `import { Tooltip } from "@cloudflare/kumo";`

**Category:** Overlay

**Props:**

- `align`: TooltipAlign
- `asChild`: boolean
- `className`: string
- `side`: enum [default: top]
  - `"top"`: Tooltip appears above the trigger
  - `"bottom"`: Tooltip appears below the trigger
  - `"left"`: Tooltip appears to the left of the trigger
  - `"right"`: Tooltip appears to the right of the trigger
- `content`: ReactNode (required)
  Content to display in the tooltip

**Colors (kumo tokens used):**

`bg-black-icon`, `fill-black-icon`, `fill-icon-path`, `text-white`

**Examples:**

```tsx
<Tooltip content="This is a tooltip" asChild>
      <Button>Hover me</Button>
    </Tooltip>
```


## Quick Reference

**Components by Category:**
- **Display:** Badge, Code, Expandable, LayerCard, Meter, Text
- **Feedback:** Banner, Loader, Toasty
- **Block:** Breadcrumbs, Empty, PageHeader
- **Action:** Button, ClipboardText
- **Input:** Checkbox, Combobox, DateRangePicker, Field, Input, Select, Switch
- **Overlay:** Dialog, DropdownMenu, Tooltip
- **Navigation:** MenuBar, Pagination, Tabs
- **Other:** SensitiveInput
- **Layout:** Surface
