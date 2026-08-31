# Focusable-kind registry

Found by the 2026-08-17 subsystem sweep
([docs/research/engine/subsystem-sweep.md](../research/engine/subsystem-sweep.md),
misfit 12) during the subsystem-bundle design: focusability/selectability is a
parallel per-kind declaration surface as large as the render surface, and the
`SubsystemBundle` contract deliberately excludes it.

## The smear

Adding a focusable kind (MW, bodies, Sgr A*, stars, structures, catalog/famous
galaxies today) hand-adds a row or union arm to ~10 files:
`ClickResolver`, `FocusableTarget`, `SelectionRow`, `buildFocusable`,
`extractSelectionRow`, `resolvePickTable`, `selectionHaloTable`, `clickHandler`,
`focusFraming`, `resolveFocusId`/`urlHashFor` — plus the InfoCard mapping.

Each table is individually healthy (tagged union + table dispatch, the house
convention); the smell is that one concept — "what is a structure, as a
selectable thing?" — exists only as the union of ten rows in ten files.

## Sketch

One `FocusableKind` descriptor per kind (pick decoding, selection-row
extraction, focus framing, halo style, URL hash, InfoCard mapping) + one
`FOCUSABLE_KINDS` registry the ten dispatch sites derive their tables from.

Deliberately a **sibling** of `SubsystemBundle`, not a field on it: kinds don't
map 1:1 onto render subsystems (stars and bodies share layers; famous galaxies
live inside the catalog subsystem; Sgr A* is a caption-only anchor drawing
nothing). A bundle may reference the kinds it renders pick geometry for.

## Trigger

The next NEW focusable kind (globular clusters from the Harris catalog are the
plausible candidate per the smooth-field roadmap). The MW v1→v2 swap does not
touch this surface — that's why it was scoped out of the bundle effort.
