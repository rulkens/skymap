# Fold the hand-written foreground gates — design

## Why

#958 moved the near-field trails onto declared distance bands. Nineteen sites still write
`ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC` by hand. Two problems with that:

- **Two measures read one threshold.** The hand gates measure camera-to-focus-target, the
  bands measure from home or a region. Focused on M31 and zoomed in, the hand gates leave
  the near-field passes enabled while they draw nothing.
- **Every new near-field pass has to remember the check.** Forgetting it costs the
  wholesale NEAR0 skip at galaxy zoom, and nothing catches it.

**Ruling (user):** "far" is measured from the object's own neighbourhood: the solar system
for planets and their moons, the galactic centre for S-stars and Sgr A*, the solar
neighbourhood for the seeded stars.

## Goals

- No pass, pick gate or present helper compares `ctx.cam.distance` to the foreground cutoff.
- Each near-field thing yields through something it already declares: a slab row's
  `activeBand`, a show entry's `bands`, or its own fade that is already zero there.
- `FOREGROUND_MAX_DISTANCE_MPC`'s doc names one measure again.

## Non-goals

- Retuning any edge. The cutoff stays where it is; only what measures it changes.
- `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` (a label distance, not the foreground gate) and
  `starPointsPass`'s `STAR_BACKDROP_DISSOLVE` visual fade.
- The horizon shell: its `enabled` is the "opacity 0, no render" rule over its own visual
  ramp near the horizon, not a near-field gate.

## Anti-goals

- A new member on any Layer contract type (`Layer`, `SlabRow`, `VisibilityEntry`, pass
  types). Everything below uses members that exist.
- A visible change inside the cutoff. Every site's on/off state at the home view, Saturn,
  the galactic centre and a nearby star must match main.

## The sites, by fold

**A. Body slab rows: 8 sites, data only.** Every body pass (`planetsPass` ×2,
`texturedBodiesPass`, `cloudShellPass`, `earthPass`, `ringsPass`, `surfaceTilesPass`) runs
only on a `body-m` slab, and `tileBodiesInView` reads the same roster. A slab row already
carries `activeBand` (the black-hole rows use it): a row exists only while the frame
camera is inside that band, measured from the row's anchor. `BODY_SLAB_ROWS` and core's
hostless mesh rows (`bodySlabRowOf`) get `activeBand: { out: [cutoff/2, cutoff] }`,
following `FOREGROUND_RECEDE`. Past the cutoff no body slab exists, so the passes are
never asked and the hand gates go. The distance from a planet and from the solar system's
anchor differ by at most 40 AU against a 230 kpc edge.

**B. `atmosphereDrawList`: 1 site.** It walks a static roster (`SCENE_EARTH` plus
`SCENE_PLANETS`). It should walk the frame's admitted body rows
(`ctx.snapshot.slabBodyCandidates`), so it agrees with A by construction.

**C. Body glints: 3 sites, deletion.** `bodyGlintsPass.enabled` (and `glintsPassOver`, the missions and earthScenes glints) already gates on
`bodyGlintBackdropFade`, measured from the solar system and gone far inside the cutoff.
The hand gate is redundant there. `pickEnabled` reads the same fade instead.

**D. Star catalog: 2 sites, needs a core rule change.** `starPointsPass` and
`starSpheresPass` keep their gate because the `starCatalog` entry carries `bodies`, and
scene-body admission (`frameContext.ts`) resolves values once per frame with no view to
measure a band at. Admission already holds the frame camera (`cam.position`), which is
what slab rows measure from. Change: admission multiplies each covering value by the
entry's band at the frame camera, through `bandValueOf`. This is the same move #958 made
for once-scope computes. The `no entry declares both bodies and bands` invariant in
`appVisibility.test.ts` goes. The `starCatalog` entry declares an item-scoped `foreground`
band per region: `from: 'solar-neighbourhood'` for the neighbourhood catalogs,
`from: 'galactic-centre'` for the S-stars.

**E. Black-hole marker: 2 sites, needs a ruling.** `blackHoleMarkerPass` and
`blackHolePickable` have no show entry, and the marker's brightness never reaches zero
far out. Two ways to fold:
- E1: give the marker a show entry with a band. That needs a switch in settings, so the
  Sgr A* marker becomes toggleable.
- E2: multiply `blackHoleMarkerBrightness` by an out-band from the galactic centre. This
  is a Layer-owned fade, not core-declared, but no `cam.distance` remains.

## Ground preparation

None needed: every fold uses an existing joint (`SlabRow.activeBand`, `VisibilityEntry.bands`
with `from` and `items`, `bandValueOf`). D changes one core rule and touches no type.

## Rulings (user, 2026-10-29)

1. D: allowed. Admission measures bands at the frame camera, and the bodies/bands invariant goes.
2. E: E2. `blackHoleMarkerBrightness` takes an out-band from the galactic centre; no new setting.

## Left to the builder

- Exact item partition for D's per-region bands (from `SEEDED_STAR_CATALOGS` and each
  catalog's region).
- Whether hostless mesh rows share the body rows' band through one constant or by import.
- Tests: one per fold that fails if the fold is undone. A body slab is absent past the
  cutoff, a star body is not admitted past its region's band, and glint picks are off past
  the backdrop. The existing wholesale-skip test in `starPointsPass.test.ts` should
  keep passing unchanged.
- Verification: `npm run perf` at the galaxy-zoom pose before and after (per-frame CPU
  should not rise), plus before/after eye shots at home, Saturn, the galactic centre and
  M31.
