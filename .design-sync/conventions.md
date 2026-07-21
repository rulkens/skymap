# skymap UI — build conventions

These are skymap's real HUD overlay components, rendered over a live WebGPU 3D
scene (a black starfield). Two components ship: **InfoCard** (the object detail
card) and **SettingsPanelPreview** (the renderer settings panel, wired for
interaction). Build with them as follows.

## Wrapping and setup

- **Always render over a dark backdrop.** Every surface is translucent
  dark-blue glass with a backdrop blur; on a light background it washes out. Put
  the components over a near-black scene (e.g. `background:
  radial-gradient(120% 120% at 70% 20%, #0b1022 0%, #04060d 70%)` or a real
  starfield).
- **InfoCard is `position: fixed`** (a HUD anchored to the viewport's top-right
  corner). To place it inside a bounded region instead of the corner, wrap it in
  an element that establishes a containing block for fixed descendants — any
  non-`none` `transform`, e.g. `transform: translateZ(0)`.
- **InfoCard's `hovered` prop is required, not optional.** Pass `hovered={null}`
  when there is no hover target; omitting it (leaving `undefined`) throws,
  because the guard is `hovered !== null`.
- **Fonts:** the UI runs in a monospace face (`--font-family-mono`) with a
  Cormorant Garamond serif for display headings (`--font-family-display`, loaded
  from Google Fonts). Keep both available.

## Styling idiom: CSS custom properties (design tokens)

skymap styles through a semantic **design-token** layer — CSS custom properties
defined once in `:root` and referenced everywhere as `var(--token)`. Restyle by
changing the tokens first; reach into component CSS only for structural changes.
Real token families:

| Family | Examples | Use |
|---|---|---|
| Surface | `--surface-panel`, `--surface-card-strong`, `--surface-control`, `--surface-control-hover`, `--surface-badge` | glass panel + control backgrounds |
| Foreground | `--color-fg`, `--color-fg-muted`, `--color-fg-dim`, `--color-fg-label`, `--color-fg-faint` | text hierarchy |
| Accent | `--color-accent`, `--color-accent-bright`, `--color-accent-control`, `--color-accent-link` | toggles, links, focus |
| Border | `--border-default`, `--border-control`, `--border-divider`, `--border-hover` | hairlines |
| Blur | `--blur-panel`, `--blur-card` | backdrop-filter strength |
| Space | `--space-1` … `--space-12` (each `n` ≈ `2n` px) | padding / gaps |
| Radius | `--radius-sm` … `--radius-2xl` | corners |
| Type | `--font-family-mono`, `--font-family-display`, `--font-size-xs` … `--font-size-xl`, `--letter-spacing-wide` … `--letter-spacing-widest` | text |
| Motion | `--duration-fast`, `--duration-base`, `--ease-standard` | transitions |
| Layout | `--corner-offset`, `--card-min-width`, `--card-max-width` | HUD placement |

Component class names are CSS-Module-hashed (e.g. `sky_infoCardFull_*`); the
palette-wide look lives in the tokens, not those classes.

## Where the truth lives

- `styles.css` and its `@import` closure (`_ds_bundle.css`) — every shipped
  rule, including the `:root` token block. Read this before restyling.
- The per-component docs (`InfoCard`, `SettingsPanelPreview`) — the prop
  contract and section list.

## One idiomatic snippet

```tsx
import { InfoCard } from 'skymap';

<div style={{ position: 'relative', transform: 'translateZ(0)',
              background: '#04060d', padding: 'var(--space-6)' }}>
  <InfoCard selected={target} hovered={null} onFocus={fn} onClose={fn} />
</div>
```

`target` is a `FocusableTarget` (a galaxy / structure / body / star / the Milky
Way); the card dispatches on `target.type`. Note: thumbnails load from external
cutout services, so they show a styled "no image" placeholder when offline.
