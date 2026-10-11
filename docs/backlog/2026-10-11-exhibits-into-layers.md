# Existing exhibits move into their Layers

**Status:** `needs-design`. Depends on #854, which adds the Layer `exhibits` member. The Voyager exhibit
already moved into the `missions` Layer there.

## Problem

Five exhibits are still core rows in `src/data/exhibits/exhibitRegistry.ts`, and each is about one
Layer's content. With the `exhibits` Layer member from #854, an exhibit should live with the Layer
it shows. Core's registry then holds only exhibits with no single home, or none at all.

## Proposed homes

| Exhibit | File | Proposed Layer | Note |
| --- | --- | --- | --- |
| Cosmic Flows | `cosmicFlows.ts` | `flow` | Turns on `flow` and the Milky Way marker |
| Zone of Avoidance | `zoneOfAvoidance.ts` | `zoneOfAvoidance` | Turns on the band and the Milky Way marker |
| Cosmic Web | `cosmicWeb.ts` | `cosmicWebDensity` | Its subject is the `polyphorm-2mrs` volume. `cosmicWebFilaments` is the other candidate |
| Solar System | `solarSystem.ts` | `body` | Turns on orbit trails; the body Layer is still forming (see "Seeded stars still live in the body tables") |
| Observable Universe | `observableUniverse.ts` | none obvious | Spans the galaxy catalogs; could stay core |

## Open questions

- Should an exhibit that spans several Layers (Observable Universe, maybe Cosmic Web) stay a core
  row, or go to a Layer that owns the framing?
- `ExhibitId` is a hand-kept union that `exhibitRegistry`'s `Record` checks for completeness. Once
  rows come from Layers, the id should be derived from the folded rows.
- Exhibit files import other Layers' `initialState` to seed settings, for example the Milky Way marker.
  A Layer-owned exhibit importing a sibling Layer's state needs the boundary rule settled.
