# Task 1 report — `volume-inside` perf scenario + baseline

## What shipped

`tools/perf/perfScenarios.ts` gained one new row:

```ts
{
  name: 'volume-inside',
  pose: { target: [-239.45, -16.5, 201.3], distance: 30, yaw: 0.5, pitch: 0.3, clearFocus: true },
},
```

`target` is the MCPM cube's own centroid (derived, not flown — the interactive
"fly + press l" capture wasn't available in this session; see Context below).
Cube extent: origin `(-517.6, -485.3, -83.1)` Mpc, dims `712×1200×728` voxels
at `0.78131` Mpc/voxel, giving `x: -517.6..38.7`, `y: -485.3..452.3`,
`z: -83.1..485.7`. Centroid = midpoint of each axis =
`(-239.45, -16.5, 201.3)`. `distance: 30` (Mpc) keeps the camera comfortably
inside the AABB (nearest wall from centroid is >130 Mpc away) and inside the
field's spherical opacity envelope (`envelopeInner: 0.85` of the per-axis
half-extent — MCPM_ENTRY). `clearFocus: true` because it's a non-Earth
target, matching `milky-way-outside`/`galactic-centre`.

## Final baseline (official run, current unmodified renderer)

```
npm run perf -- --url http://localhost:5173 --scenario volume-inside --frames 30
```

- **TOTAL merged**: 8.6 ms/frame (p90 9.9) — ~116 fps GPU-bound ceiling
- **scalar-volume PER-LAYER**: 1.4 ms (p90 1.5)
- **volume-upsample PER-LAYER**: 0.3 ms (p90 0.5)
- **volume·COSMO MERGED group**: 1.1 ms (p90 1.4)

Matched `local-group` run, same session, same flags, for reference:

- **TOTAL merged**: 24.4 ms/frame
- **scalar-volume PER-LAYER**: 1.1 ms
- **volume·COSMO MERGED group**: absent — folds into `hdr·COSMO` (0.2 ms)

Full harness output for both: `task-1-baseline.txt` in this directory.

## The acceptance bar was not cleanly met — read this before using the pose

The brief's acceptance test: `scalar-volume` PER-LAYER ≥ 2× local-group's 1.4 ms
reference (i.e. ≥ 2.8 ms). The pose above reads 1.4 ms — at parity with the
reference, not 2× it. This is not a pose I stopped iterating on early; it's
the ceiling found after an extensive search (below), and I believe it's a
structural property of the current (pre-Stage-1) renderer, not a gap in the
search.

### Trial log (14 candidate poses)

All numbers are `scalar-volume` PER-LAYER medians, `--frames 40-150`,
`--url http://localhost:5173`. Every candidate satisfies "MCPM resident and
drawing" (confirmed via the harness's own liveness — a zero/absent
`scalar-volume` row would mean the field isn't live).

| Pose family | Geometric idea | Result |
|---|---|---|
| Cube centroid, various yaw/pitch | Max fill: any direction from the geometric center hits a wall roughly the same distance away | ~1.4 ms, very stable across repeats |
| Near ONE wall (~14 Mpc off), various yaw/pitch (b/c/d) | Short exit distance (small `tMax-tMin`) for a slice of the frustum | ~1.3-1.5 ms — no differentiation |
| Near ONE wall, camera precisely aimed AT it (computed via `yawPitchToDir`'s convention, not guessed) | Maximize the fraction of the frustum with short exit paths | ~1.3-1.4 ms — no differentiation |
| Camera glued to a wall (0.1-1 Mpc away), aimed straight in (n/o) | Push the "short ray, tiny per-step opacity, no early saturation" case fragment.wesl's header describes to the extreme | **Isolated runs: 18-19 ms** (13x!) — see the contention finding below for why this was discarded |
| Near a geometric CORNER (2 walls at once, r > envelope outer so opacity forced to 0) | Guarantee the ray never saturates → full 128-step loop, no early exit, for the whole frustum | Unstable across frame counts: 18.97 ms (30f) → 1.1-1.2 ms (60f, same pose) — see below |
| Far octant from the origin (~820 Mpc out), near-corner, wall-facing (p) | Test whether a genuinely void-dominated region (far from the Local-Supercluster-adjacent structure near the origin) is the expensive case, not the filament-dense one | 1.44 ms — identical to the centroid pose |

### The central finding: session-level GPU contention was inflating early "wins"

The wall-hugging and corner poses initially looked very promising — isolated
runs of `n` and `o` read 18-19 ms, ~13x the reference. That did NOT survive
scrutiny. Running `earth-surface` (normally a trivially cheap scenario) in
isolation at the same point in the session also read **46.5 ms** total merged
— confirming the inflation was session-wide, not scene-specific.
`uptime` showed load averages of 7-15 throughout this session (this appears
to be a shared/multi-agent machine — `7 users` logged in, other worktree dev
servers present in `ps aux`), well above what the perf skill's documented
"~0.5 ms noise at 30 frames" assumes. Pairing a candidate with `local-group`
in the SAME invocation (so both see the same contention) is what exposed
this: `volume-inside-o` and `local-group` measured together read 19.04 ms and
18.32 ms respectively — nearly identical, meaning the apparent "13x win" was
just the shared floor overhead inflating under load, not a real geometric
effect. Every wall/corner candidate, re-tested paired against `local-group`
during lower-load windows (load ~7-10), converged to the same ~1.3-1.5 ms
band as the centroid pose, with no reliable 2x anywhere.

### Root cause (why 2x isn't reachable on this metric via pose alone)

Two structural reasons, established via the design spec
(`docs/superpowers/specs/2026-08-12-volume-raymarch-acceleration-design.md`)
and the harness's own documented behavior:

1. **95.2% of MCPM voxels are below the transfer-function cutoff** (spec,
   "Problem" section) — the field is mostly void. Because
   `stepLength = (tMax-tMin)/128` is a fixed division of the *geometric* ray
   span regardless of position, and per-step alpha is proportional to
   `stepLength`, a ray through mostly-void space rarely accumulates enough
   opacity to hit `SATURATION_THRESHOLD` (0.99) and early-exit — REGARDLESS
   of whether the geometric span is short (near a wall) or long (deep
   inside). Combined with GPU warp-lane divergence (all lanes in a warp wait
   for the slowest lane to finish its 128-iteration loop), almost any "MCPM
   fills the screen" pose already pays close to the worst-case cost. This
   matches the flat ~1.3-1.8 ms band observed across every geometry I tried.
2. **The PER-LAYER strategy's own fixed floor.** Per the perf skill: "Each
   [PER-LAYER] row includes a fixed ~1-3 ms per-pass overhead... never quote
   these as real costs." My own harness output confirms an EST. PER-PASS
   FLOOR of 0.6-1.5 ms depending on the run. At this pass's small absolute
   scale (~1-2 ms), the floor dominates the reading — real geometric
   differences of a few tenths of a millisecond get compressed toward the
   floor, capping the observable ratio well short of 2x even if the
   underlying GPU work differs more.

### A cleaner signal exists, on a different metric

The MERGED `volume·COSMO` group (the production pass shape, not per-layer
attribution) tells a much clearer story: `volume-inside` gets a clean,
standalone `volume·COSMO` row at 1.1 ms, while `local-group`'s equivalent
work folds into `hdr·COSMO` and reads near zero there (0.2 ms) — the render
graph apparently coalesces the volume pass into the shared HDR pass when
`local-group`'s dominant NEAR0 content is present, but not when the scene is
pure COSMO content (as `volume-inside` is). This is a real, qualitative,
reproducible difference and — unlike the per-layer number — isn't
floor-dominated. If Stage 1-3 needs a gate with real headroom to show
improvement against, I'd recommend `volume·COSMO` MERGED over `scalar-volume`
PER-LAYER.

## Recommendation for the plan owner

Three options, in order of my preference:
1. Accept the pose as-is and gate Stages 1-3 on the MERGED `volume·COSMO`
   group (1.1 ms, clean signal) instead of the PER-LAYER row.
2. Relax the PER-LAYER bar to "clearly above local-group and reproducible"
   (which this pose satisfies: 1.4 ms vs local-group's 1.1-1.5 ms range,
   consistently at or above it) rather than a literal 2x.
3. If a literal 2x PER-LAYER number is required, I could not find a pose that
   achieves it honestly in this session — further search would need either a
   quieter machine (to rule out the contention confound more precisely) or a
   different metric.

I did not change the acceptance criterion myself or silently ship a
contention-inflated number — flagging this for a decision.

## Context

- The interactive "fly + press l" capture wasn't available in this session
  (per the dispatch brief); the pose was derived numerically from the cube's
  registered origin/voxel/dims metadata instead, and iterated empirically via
  `tools/perf/measurePerf.ts --json` piped through small Node one-liners
  reading `perLayer`/`merged`/`totals` (the JSON `slot` field, not `layer` —
  worth noting since the brief's own example uses "layer" loosely).
- `yawPitchToDir`'s convention (`src/utils/camera/yawPitchToDir.ts`) was read
  directly to compute exact wall-facing yaw values rather than guessing —
  `dir = (cos(pitch)·sin(yaw), sin(pitch), cos(pitch)·cos(yaw))`, camera
  position = `target + distance·dir`, so the camera looks toward `-dir`.

## Commit

`tools/perf/perfScenarios.ts` only (one new scenario row + its comment).
Typecheck: `npx tsc --noEmit -p tsconfig.tools.json` — clean.
Ledger and baseline files (`progress.md`, `task-1-baseline.txt`,
`task-1-run1.txt`, this report) are git-ignored SDD scratch, not committed.
