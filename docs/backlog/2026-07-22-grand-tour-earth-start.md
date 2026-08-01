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

## Boot coupling (folded from the Earth-home ship, 2026-07-22)

The app now boots into the Earth home state (sunlit `earthHomePose`, focus pinned — `specs/completed/2026-07-22-earth-home-sunlit-boot-design.md`), so the session already opens where this redesign wants the tour to open. Until the redesign lands, the existing `openingTitle`/`homeAgain` beats `aimAlong` the galactic-disc sightline (`GALACTIC_DISC_FORWARD`, `cameraFraming.ts` — a world vector since the frame-invariant-camera-poses branch; it replaced a `GALACTIC_DISC_YAW_RAD`/`PITCH_RAD` pair measured in the ecliptic frame): the opening's first aim now swings from an Earth-scale pose it was never eye-tuned against — check that transition when choreographing the new opening. `homeAgain` landing on `earthHomePose` itself is the natural symmetry answer.
