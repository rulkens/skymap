# Layer-specific search feeds and React components sit in the store graph

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

ADR 0014 made the composition root (`src/compositions/app<Name>.ts`) the home of every static registry, read by import, so sagas importing `APP_EXHIBIT_REGISTRY` is the decided shape. Two things sit outside it. `APP_EXHIBIT_REGISTRY` pulls exhibit section kinds whose `Component` is a React component, so the store's import graph reaches `components/`. And `state/engine/selectors.ts` reads Layer fact keys by name (`galaxyCatalog?.famousMeta`, `aliasIndex`, `starCatalog?…`, `structure?.searchList`) while `CommandPaletteContainer.tsx` wires three Layer-specific search feeds beside the generic `layerSearch` rows.

## Direction

Move famous, alias and structure search onto `layerSearch`, and split a section kind's `Component` from its saga-side data so the store graph stays React-free. Pairs with "Existing exhibits move into their Layers".
