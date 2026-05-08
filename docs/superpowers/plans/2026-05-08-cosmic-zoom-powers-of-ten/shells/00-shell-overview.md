# Shell Overview

This document is the at-a-glance summary of all nine shells. Each shell has its own deep-dive in `shells/0N-*.md`; this is the navigator.

## The nine shells

| # | Name | Native unit | Outer scale | Camera origin | Hero data | Hero visual | Spec |
|---|------|-------------|-------------|---------------|-----------|-------------|------|
| 1 | Solar System | AU | 100 AU | Sun | JPL DE440 ephemeris | Ray-traced Sun + planet billboards on real orbits | [01](01-solar-system.md) |
| 2 | Stellar Neighborhood | parsec | 100 pc | Sun | Gaia DR3 (≤ 50 pc cut) | Real-color stars, parallax-derived | [02](02-stellar-neighborhood.md) |
| 3 | Milky Way | kpc | 100 kpc | Galactic center | Composite IRAS / 2MASS / model | Impostor disk + Sun marker | [03](03-milky-way.md) |
| 4 | Local Group | Mpc | 5 Mpc | LG barycenter | NED LVC + Karachentsev | Disks for MW + M31 + M33; dwarfs as fuzzies | [04](04-local-group.md) |
| 5 | Local Sheet | Mpc | 30 Mpc | LG barycenter | Tully 2GC + GLADE | Galaxy points coloured by group, supergalactic plane hint | [05](05-local-sheet.md) |
| 6 | Virgo Supercluster | Mpc | 500 Mpc | M87 / origin | Existing GLADE/2MRS + ROSAT X-ray + Abell | Galaxy points + cluster X-ray halos | [06](06-virgo-supercluster.md) |
| 7 | Laniakea | Mpc | 1000 Mpc | origin | Cosmicflows-4 velocity field + density volume | Volumetric DM density + flow vectors | [07](07-laniakea.md) |
| 8 | Cosmic Web | Gpc | 5 Gpc | origin | All catalogs + DisPerSE filaments | Point cloud + filaments | [08](08-cosmic-web.md) |
| 9 | Observable Universe | Gpc | 14 Gpc | origin | Planck SMICA CMB | Inside-sphere CMB shell | [09](09-observable-universe.md) |

## How shells relate to existing infrastructure

| Shell | New code | Reuses existing | New data |
|-------|----------|-----------------|----------|
| 1 | Sun renderer, planet billboards, orbit lines | – | Solar System ephemeris |
| 2 | Star renderer (color-magnitude based) | Point cloud upload path | Gaia DR3 cut |
| 3 | – | MW impostor (separate spec) | Composite MW textures |
| 4 | LG dwarf fuzzy renderer | Galaxy disk renderer, point cloud | NED LVC |
| 5 | Group-colour pass | Point cloud, label renderer | Tully 2GC |
| 6 | Cluster halo volumetric | Point cloud, filaments | ROSAT X-ray |
| 7 | DM density volumetric, flow-vector renderer | – | CF-4 |
| 8 | – | Point cloud, filament renderer | – |
| 9 | CMB sphere renderer | – | Planck SMICA |

So **shells 4, 5, and 8 are essentially "what skymap already does," styled differently.** Shells 1, 7, and 9 are the most ambitious technically. Shells 2, 3, and 6 are intermediate.

## Camera scale at each shell boundary

The transition between shells happens at a "boundary distance from current shell origin." Above this distance, the next outer shell takes over. (See [`rendering/01-shell-transitions.md`](../rendering/01-shell-transitions.md) for the crossfade band around each boundary.)

| Boundary | Distance | In Mpc | In light-years |
|----------|----------|--------|----------------|
| 1 → 2 | 200 AU | 9.7 × 10⁻¹⁰ | 0.0032 ly |
| 2 → 3 | 200 pc | 6.5 × 10⁻⁵ | 650 ly |
| 3 → 4 | 100 kpc | 0.1 | 326,000 ly |
| 4 → 5 | 5 Mpc | 5 | 16 Mly |
| 5 → 6 | 30 Mpc | 30 | 100 Mly |
| 6 → 7 | 250 Mpc | 250 | 800 Mly |
| 7 → 8 | 1000 Mpc | 1000 | 3.3 Gly |
| 8 → 9 | 5000 Mpc | 5000 | 16 Gly |

Each step is about 1.5–2 orders of magnitude — the constant log-scale step that gives Powers-of-Ten its characteristic feel.

## Render passes per shell

```
Shell  | Passes (back→front)
-------|-------------------
1      | sky color (black) → orbits → planets → Sun (last, due to bloom)
2      | sky color (black) → stars (point pass) → labels (named stars)
3      | sky color (black) → MW impostor → halo + globulars → Sun marker → labels
4      | sky color (black) → distant galaxies (faint dust) → LG dwarfs (fuzzies) → MW + M31 + M33 disks → labels
5      | sky color (black) → galaxy points (group-colored) → labels
6      | sky color (black) → galaxy points → cluster X-ray volumetric → cluster centers → labels
7      | sky color (black) → DM density volume → galaxy points → flow vectors → labels
8      | sky color (black) → galaxy points → filaments → famous galaxy thumbnails → labels
9      | CMB sphere (background) → faint cosmic web inside → labels
```

The `labels` pass in each shell is the same MSDF pipeline (per `2026-05-07-msdf-labels-design.md`) with shell-specific anchor positions.

## Per-shell data lifecycle

Each shell has a **data slot** managed by the asset-loading primitive. Slot states:

```
EMPTY → LOADING → READY → ACTIVE → IDLE
                              ↓ (camera leaves shell)
                            IDLE
                              ↓ (memory pressure?)
                          UNLOADED → LOADING (next visit)
```

- `EMPTY`: shell has never been accessed.
- `LOADING`: fetch in progress.
- `READY`: data on the GPU, but shell not currently visible.
- `ACTIVE`: shell is currently rendering.
- `IDLE`: shell rendered recently but camera has moved on.
- `UNLOADED`: GPU buffer freed (memory pressure or session age > N minutes).

The pre-fetch policy: when the user clicks "Take the tour," every shell's data starts loading concurrently. When they reach a shell, it should be `READY` already. If a shell isn't ready (slow connection, large dataset), the tour pauses at the last fully-loaded shell with a brief loading indicator until the next shell is ready.

## Per-shell fallbacks

If a shell's data fails to load (404, network error, decode failure):

| Shell | Fallback |
|-------|----------|
| 1 | Skip the shell beat; transition continues. Show a small "Solar System unavailable" toast. |
| 2 | Render with a smaller cached subset (50 nearby named stars, hard-coded). |
| 3 | Render a flat textured disk (the existing Milky Way impostor's lowest-LOD fallback). |
| 4 | Render only MW + M31 + LMC + SMC, hard-coded positions. |
| 5 | Render with no group-colour pass; just the existing point cloud. |
| 6 | Render without X-ray halos; cluster positions only. |
| 7 | Render with point cloud only, no DM volume, no flow vectors. |
| 8 | Already the existing skymap; trivial fallback. |
| 9 | Render a static dim CMB texture (low-resolution, ~1 MB JPEG). |

Every shell has *some* visual; the tour never crashes or shows a blank screen.

## Per-shell author-control points

For each shell the tour author (= human writing the script) controls:

- The camera **enter waypoint** (position + lookAt + FoV at shell start).
- The camera **exit waypoint** (at shell end).
- The **time-in-shell** (typically 6–11 s).
- The **overlay text** (≤3 sentences).
- The **internal camera path** (linear / arc / orbit).
- The **fade-in beats** for visual elements (e.g., "X-ray halo fades in 2 s into shell 6").

These are encoded in a `tour/script.ts` array of `ShellBeat` structs. See [`rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md).

---

Detailed per-shell specs follow in `shells/01-*.md` through `shells/09-*.md`.
