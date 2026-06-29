# Milliquas needs its own colormap (AGN ≠ galaxy)

> **Backlog item** · `needs-design` · area: Rendering
> **Promote to:** brainstorm → spec → plan (not a drop-in).

## Problem

Milliquas points render overwhelmingly blue. The _clamp_ half shipped (#282): the redshift K-correction (`kPerZ`) was subtracting more than the whole `[0,2]` ramp span for high-z quasars and pinning every row to the blue floor; `kPerZ` is now 0 so the real B−R spread survives. What remains is the **semantic mismatch** — quasars genuinely have small B−R, so on the galaxy star-forming↔elliptical ramp they legitimately land in the blue third, but "blue" there means "star-forming galaxy," the wrong reading for a non-thermal AGN continuum.

## Current state (verified 2026-06-29)

No distinct AGN encoding exists. No `colourMode` discriminant anywhere (zero hits in src/ and tools/). Milliquas runs the shared galaxy ramp: `pickColourIndex` (`src/data/galaxyCatalog/colourIndex.ts:40`) maps B−R onto the common 0..2 ramp; `points/vertex.wesl:245` bakes `ramp(p.colorIndex)` with no source/AGN branch. `src/data/sources/milliquas.ts:13-16` states "no quasar-specific visuals yet … renders with the shared galaxy-billboard path."

## Options

- **(a) Distinct AGN ramp** (violet/amber) keyed on B−R so quasars read as a different object class.
- **(b) Encode redshift** instead of colour — z is the meaningful axis for objects spanning the observable universe.
- **(c) Tint by the Milliquas class byte** (Q/A/B/K/N/S) or parent-survey byte — both already on the `.bin`.

Likely needs a `colourMode` discriminant on `SOURCE_REGISTRY` + a shader ramp branch.

## Notes

memory `project_thumbnail_quality` (separate, but same "object-class-aware visuals" theme).
