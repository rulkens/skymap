# design-sync notes — skymap

skymap is an application, not a component library. This sync is an **off-script
package-shape** import of two presentational HUD components (`InfoCard`,
`SettingsPanelPreview`) for a styling pass in claude.ai/design. Key mechanics:

## How the bundle is built (not the vanilla converter path)

- skymap uses **CSS Modules**. The converter's esbuild uses the default `css`
  loader, which does NOT resolve CSS-module class maps → every `styles.root`
  would be `undefined`. So we **pre-build the design entry with Vite**
  (`.design-sync/vite.bundle.config.ts`), which resolves CSS Modules into hashed
  class strings + one extracted stylesheet, and hand the converter the
  already-resolved JS via `--entry ./.design-sync/dist/index.js`.
- **cssEntry** is `.design-sync/dist/styles-combined.css`, built by concatenating
  a Google-Fonts `@import` (Cormorant Garamond) + `src/styles/global.css`
  (the `:root` design tokens) + the Vite-extracted `dist/skymap.css` (component
  CSS) + a preview-only de-fix override. Regenerate it whenever the bundle
  rebuilds (see the `cat > styles-combined.css` block in the sync commands).
- The design entry (`.design-sync/entry/index.tsx`) re-exports the real
  components + a mock-fixtures namespace. `SettingsPanelPreview`
  (`.design-sync/hud/SettingsPanelPreview.tsx`) is a store-free composite that
  wires the real presentational `*Section` components with local `useState`
  (bypassing the Redux `*Container` boundary).
- `useFamousStarsMeta` is **aliased to a mock** (`.design-sync/mocks/`) in the
  Vite config so famous-star / Sun body cards render their rich physical rows.
  Fixture body-star ids must be real `FAMOUS_STAR_IDS` (e.g. `sun`, `betelgeuse`)
  AND have a matching mock meta entry.

## Full sync command sequence

```sh
npx vite build --config .design-sync/vite.bundle.config.ts
# regenerate .design-sync/dist/styles-combined.css (font @import + global.css + skymap.css + de-fix)
node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --entry ./.design-sync/dist/index.js --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle
```

## Known render warns (triaged, expected)

- `[FONT_REMOTE] Cormorant Garamond` — display font loads via a Google-Fonts
  `@import`; intentional, no action.
- InfoCard is `position: fixed`; previews wrap it in a `.ds-preview-frame`
  containing-block, and a scoped `.ds-preview-frame [class*="infoCardStack/Full"]`
  rule in `styles-combined.css` de-fixes it so column cards don't escape their
  grid cell. That rule ships in `_ds_bundle.css` but is inert for real designs
  (they never carry `.ds-preview-frame`).
- Thumbnails (SDSS cutout, DSS hips2fits, famous WebP) fetch from external
  services → styled "no image" placeholder in the sandbox. Expected.

## Re-sync risks

- **Component API drift.** The mock fixtures hand-populate every field
  `GalaxyInfo` / `StructureInfo` / `BodyInfo` / `FieldStarInfo` / `MilkyWayInfo`
  and `FamousStarMetaEntry` require. If those types gain a required field the
  cards read, add it to `.design-sync/entry/fixtures.ts` (or `fixturesBodies.ts`
  / the mock) or the card render throws. `hovered={null}` is mandatory in the
  InfoCard preview cells.
- **SettingsPanel section props.** `SettingsPanelPreview` reproduces each
  `*Section`'s exact prop shape by hand; a prop rename/addition in a section
  needs the composite updated (esbuild won't type-check it — the render check
  catches a break).
- **CSS-module hashes** change every Vite build; the de-fix override uses
  substring class matching (`[class*="infoCardFull"]`) so it survives, but if the
  literal `infoCard*` class names are renamed in source, update the override.
- This is a **visual sandbox**: restyles done in claude.ai/design do not map back
  to skymap's CSS-Module `.module.css` files automatically — porting is manual.
