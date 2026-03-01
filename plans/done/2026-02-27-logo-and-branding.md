# Logo as Favicon, App Icons, and README Branding

**Date**: 2026-02-27
**Status**: Complete

## Context

The project uses placeholder TanStack branding (favicon, PWA icons, manifest names). The iOS app icon is also a placeholder. The source logo SVG exists at `plans/assets/logo.svg` — a 240x240 pixel-art style logo with yellow (#F7D71C) paths on a transparent background. This plan adds proper branding across web, iOS, and the README.

## Approach

1. Enhance the SVG with a dark gradient background (neutral-950 → neutral-900)
2. Use `rsvg-convert` (already installed via Homebrew) to generate raster assets at all needed sizes
3. Update web app head tags, manifest, iOS icon, and README

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| Create | `assets/logo.svg` | Enhanced SVG with gradient bg (repo branding asset) |
| Create | `src/web/public/favicon.svg` | SVG favicon (same as above) |
| Replace | `src/web/public/favicon.ico` | 32x32 .ico from enhanced SVG |
| Create | `src/web/public/apple-touch-icon.png` | 180x180 Apple touch icon |
| Replace | `src/web/public/logo192.png` | 192x192 PWA icon |
| Replace | `src/web/public/logo512.png` | 512x512 PWA icon |
| Replace | `src/ios/.../AppIcon.appiconset/icon.png` | 1024x1024 iOS app icon |
| Modify | `src/web/src/routes/__root.tsx` | Add favicon + apple-touch-icon links to `head()` |
| Modify | `src/web/public/manifest.json` | Fix app name, icon sizes, theme colors |
| Modify | `README.md` | Add centered logo at top |
| Delete | `src/web/public/tanstack-circle-logo.png` | Remove placeholder |
| Delete | `src/web/public/tanstack-word-logo-white.svg` | Remove placeholder |

## Step-by-Step

### 1. Create enhanced SVG with gradient background

Create `assets/logo.svg` — the source SVG with a `<linearGradient>` background rect added before the paths:

```xml
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a0a0a"/>   <!-- neutral-950 -->
    <stop offset="100%" stop-color="#171717"/>  <!-- neutral-900 -->
  </linearGradient>
</defs>
<rect width="240" height="240" fill="url(#bg)"/>
```

Top-to-bottom gradient. Copy to `src/web/public/favicon.svg` as well.

### 2. Generate raster icons with `rsvg-convert`

Scale the full 240x240 logo (no crop) — the pixel-art style and high-contrast yellow-on-dark survives small sizes well.

```bash
rsvg-convert -w 32 -h 32 assets/logo.svg -o /tmp/favicon-32.png
rsvg-convert -w 180 -h 180 assets/logo.svg -o src/web/public/apple-touch-icon.png
rsvg-convert -w 192 -h 192 assets/logo.svg -o src/web/public/logo192.png
rsvg-convert -w 512 -h 512 assets/logo.svg -o src/web/public/logo512.png
rsvg-convert -w 1024 -h 1024 assets/logo.svg -o "src/ios/Nylon Impossible/Nylon Impossible/Assets.xcassets/AppIcon.appiconset/icon.png"
```

Convert 32px PNG → .ico via `sips`:
```bash
sips -s format ico /tmp/favicon-32.png --out src/web/public/favicon.ico
```

### 3. Update `__root.tsx` head links

Add to the `links` array in `head()` ([__root.tsx:33-38](src/web/src/routes/__root.tsx#L33-L38)):

```typescript
{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
{ rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
{ rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
```

### 4. Update `manifest.json`

- `short_name` / `name`: "TanStack App" → "Nylon Impossible"
- `favicon.ico` sizes: "32x32"
- `theme_color` + `background_color`: "#0a0a0a"

### 5. Add logo to README

Insert at top of `README.md`:

```markdown
<p align="center">
  <img src="./assets/logo.svg" width="120" height="120" alt="Nylon Impossible logo">
</p>
```

### 6. Delete TanStack placeholder files

Remove `tanstack-circle-logo.png` and `tanstack-word-logo-white.svg` from `src/web/public/`.

## Verification

- Open `assets/logo.svg` in browser to confirm gradient renders correctly
- Run `pnpm dev` and check favicon appears in browser tab
- Inspect `<head>` in devtools for correct link tags
- Check apple-touch-icon renders at 180x180
- Open iOS project in Xcode and verify app icon preview
- View README on GitHub (or locally) to confirm logo displays centered
- Run `pnpm check && pnpm typecheck` to verify no lint/type issues
