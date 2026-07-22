# SettingsPanel polish: visual cleanup, re-ordering, icons

**Status:** needs-design (2026-07-22)

## Ask

Clean up and polish the SettingsPanel's look; investigate section re-ordering, per-section icons, and general visual tightening.

## Current state

- Shell: `src/components/SettingsPanel/SettingsPanel.tsx` (87 lines) renders 7 top-level sections in order Galaxies → Stars → Cosmic web → Flow → Structures → Labels → Display (which nests Earth) — `SettingsPanel.tsx:76-84`. The header doc at `:11-21` is stale: it lists six sections from the 2026-05-19 UX audit and omits Stars, which actually renders second.
- Text-only rows: no icons anywhere in `SettingsPanel/*.tsx` (the lone svg hit is a CSS dropdown chevron in `TierChip.module.css:75`).
- Structure: hand-coded JSX per section — memo-wrapped presentational components with containers owning all Redux reach, `CollapsibleSection` wrappers around hand-written `panelRow` label+input blocks. No schema or registry drives the rows.
- Size: 2,273 lines across 18 files. `StarsSection.tsx` is largest (363 lines, 8 near-identical hand-copied slider blocks); `CosmicWebSection.tsx` 277; `VolumeFieldRow.tsx` 288.

## Design questions

- **Order**: is Galaxies-first still right now that the solar-system/star experience is prominent? Candidates: order by scale (near → far), or by usage frequency.
- **Icons**: per-section glyphs in the collapsed headers; pick a source (small inline SVG set vs icon font) and keep it in step with the Claude Design token sync.
- **Row schema vs cosmetic-only**: the 8 hand-copied slider blocks overlap with the existing "VolumeFieldRow schema-driven UI" backlog item — decide whether polish rides a shared slider-row extraction or stays purely visual, and whether the two items merge at spec time.
- Fix the stale `SettingsPanel.tsx` header doc as part of whichever change lands first.
