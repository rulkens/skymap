# Background-galaxy extras get no GPU-placed clouds

Adjudicated as a scope cut across the GPU-side v2 placement plan (Tasks 7, 13,
14; see e.g.
`.superpowers/sdd/2026-08-11-gpu-side-v2-placement/task-14-report.md`'s
Concerns section), never revisited.

## The cut

`buildGalaxyFieldMixture` (`src/services/engine/galaxyGenerator/v2/galaxyFieldMixture.ts`)
is called for both the central galaxy and every background "extra" added via
the galaxy-renderer dev tool's `MultiGalaxySection` UI (`fieldMixtureOf`, used
from `setExtras` in
`tools/galaxy-renderer/src/engine/model/createGalaxyModel.ts`). Every caller
reserves placeholder slots for the four map-dependent/map-independent
placement tiers (dust, arm cloud, spur cloud, DIG veil), but the GPU compute
passes that fill those slots only ever dispatch against the **central
galaxy's** reservation — `dustPlacementRebuild`, `armCloudPlacementRebuild`,
`spurCloudPlacementRebuild`, and the DIG-veil pass are all central-only state.

Before this plan, extras got real CPU-built dust/arm-cloud/spur-cloud/DIG
sprites from `buildDustParticleCloud`/`buildArmParticleCloud`/
`buildArmSpurParticleCloud`/`buildDigVeil` — those CPU builders are now
deleted (Task 16). Any background galaxy added through `MultiGalaxySection`
now renders with none of the four placement tiers, regardless of its own
tuning.

## Blast radius

Dev-tool-only. `buildGalaxyFieldMixture`/extras are not reachable from the
production skymap site — no production caller exists. Every task that took
this cut treated it as bounded and documented, matching a precedent already
set by dust (Task 7): the map-dependent tiers need a central-only ISM
map/orientation chain, and extras were never wired to get their own.

## Direction

The mechanism generalizes cleanly whenever it's wanted: each extra would need
its own placement reservation plus a per-extra world-space transform threaded
into the relevant shader's uniforms (today the uniforms assume the single
central galaxy's frame). Options:

- Per-extra GPU placement dispatches — most faithful, most GPU work (extras
  are typically several at once in the dev tool).
- A cheaper LOD-appropriate approximation for extras specifically, since
  they're background/context galaxies rather than the one under detailed
  study.
