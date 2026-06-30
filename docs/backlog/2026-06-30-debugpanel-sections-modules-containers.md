# DebugPanel sections → CSS modules + per-section containers

`ready` · UI & UX

## Problem

The DebugPanel section family is half-migrated. Two sections —
`ClipTriggersSection` and `ClipPathInspectorSection` — now follow the project's
component conventions: CSS modules composed from a shared
`debugSection.module.css` vocabulary, and a dedicated `*SectionContainer` that
owns the store reach so nothing prop-drills through `DebugPanel` /
`DebugPanelContainer`.

The rest still use inline `style={{…}}` objects and are prop-drilled: their
selectors + dispatch callbacks are read in `DebugPanelContainer` and threaded
through `DebugPanel`'s prop list down to the leaf section.

## Current state (file:line evidence)

- Shared vocabulary exists: `src/components/DebugPanel/debugSection.module.css`
  (`.summary`, `.body`, `.buttonRow`, `.button`, `.readout`, `.muted`).
- Done (the template to copy):
  - `ClipTriggersSection.tsx` + `.module.css` +
    `containers/ClipTriggersSectionContainer.tsx`.
  - `ClipPathInspectorSection.tsx` + `.module.css` +
    `containers/ClipPathInspectorSectionContainer.tsx`.
- Still inline-styled / prop-drilled:
  - `AssetLoadingSection.tsx`
  - `GpuTimingsSection.tsx`
  - `RenderTogglesSection.tsx`
  - `FlowTuningSection.tsx`
  - `DataQualitySection.tsx`
  - `LabelEffectsSection.tsx`
  - the inline pick-buffer + disk-radius-ring checkboxes in `DebugPanel.tsx`
    itself (lift into a small section + container, or a shared toggle row).
- `DebugPanelContainer.tsx` still owns the store reach for the toggles + flow +
  data-quality + render-toggles; those move into per-section containers as each
  section is converted.

## Approach

Per section, follow the established template:

1. Add `<Section>.module.css` with a `.root` and `composes` the bits it needs
   from `debugSection.module.css`; move any section-specific rules local.
2. Replace inline `style={{…}}` with `className={styles.…}`.
3. If the section reaches the store, add
   `containers/<Section>Container.tsx` (read selectors + wrap dispatches in
   `useCallback`), mount it directly from `DebugPanel`, and delete the section's
   props from `DebugPanel` / `DebugPanelContainer`.

Sections with no store reach (pure presentational, driven by props from a
handle like `slots` / `timingService`) keep their props but still move to CSS
modules.

## Notes

- Keep the family's named-export flat-file shape (`export function XSection`) for
  consistency — the create-component skill's default-export/own-folder rules are
  for standalone components; these are a tightly-coupled section family.
- The shared `debugSection.module.css` is the place to grow common vocabulary
  (e.g. a `.toggleRow` for the checkbox sections) as more sections migrate.
- `GpuTimingsSection` + `Sparkline` already have the most custom styling — budget
  the most time there.
