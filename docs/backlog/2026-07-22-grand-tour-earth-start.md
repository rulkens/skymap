# Grand tour: Earth start + scale-ladder rungs

**Status:** needs-design (2026-07-22)

## Ask

Open the grand tour at Earth instead of the Milky Way, and climb the scale ladder in rungs — solar system → local stellar neighbourhood → Milky Way star field — before the existing galactic beats take over. ("Rungs" confirmed by the user: intermediate stops on the way out, not ring visuals.)

## Current state

- Storyboard: `src/data/animation/tours/grandTour.ts:36-172` — 14 beats, one clip file per beat under `grandTour/`. Order today: `openingTitle` ("The Long Way Out") → `youAreHere` (Milky Way) → `approachM31` → `localGroup` → `neighbourhoodReveal` → `neighbourhoodFlythrough` → `approachVirgo` → `laniakea` → `cosmicWeb` → `cosmicFlows` → `emptiness` → `deepField` → the edge → `homeAgain`.
- The tour starts at galaxy scale: `openingTitle.ts:33,72-79` anchors on `focusId('milkyWay')` and dollies in; `youAreHere.ts:23-26` is a zero-duration label reveal on the already-framed Milky Way. No Earth, solar-system, or star-field beats exist.
- Load-order property to rethink: `grandTour.ts:7-9` documents that the opening anchors on the `milkyWay` singleton _because it resolves with no catalog data loaded_, so the tour establishes even on an unlinked worktree. An Earth opening keeps that property (body ephemerides are data-free), but the star-field rungs lean on the Gaia bin — decide how those beats degrade without it.
- Reusable material: `earthFlyout` (`src/data/animation/clips/earthFlyout.ts`, registered in `clipRegistry.ts:7-19`, playable via `?clip=earthFlyout`) already pulls back from Earth's surface to the Hubble radius, opening on Earth's live orbital position — a proven camera path to mine for the new opening beats.
- Beat shape: `BeatData = { caption, dwellClip, enterClip? }` (`src/@types/animation/tour/BeatData.ts`); camera targets live _inside_ clips as `focus()`/`focusId()` cues. The `grandTourBeats.ts` debug-panel wrapper re-exports every beat as a standalone clip and must track any added beats.
- `npm run tour-length` (`tools/animation/tourLength.ts:16` via `tourRegistry.ts`) reports the beat sheet — use it when rebalancing durations.

## Design questions

- Rung list + captions: solar system (Sun? planet line-up?), local neighbourhood (Alpha Cen / bright famous stars), Milky Way star field, then hand off to today's `youAreHere` beat.
- Whether `homeAgain` should return all the way to Earth for symmetry once the tour opens there.
- Sim-time during the solar-system rung: live clock vs a scripted rate (time control shipped in #472).
- Pacing: the tour is already long; three-plus new rungs need a `tour-length` rebalance pass.
