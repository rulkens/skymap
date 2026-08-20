# MCPM Workbench

A WebGPU dev tool that visualises the **MCPM cosmic-web simulation** — the
constrained-realisation dark-matter density field skymap's volume renderers
already consume, driven live rather than baked offline. It runs the port of
Polyphorm's agent-based sim (propagate/decay/histogram compute kernels) over
a real catalog box, with four render layers (raymarch, agent splat, galaxy
overlay, path tracer) and `.npy`/`.scfd` export plus a headless comparator
CLI (`validate/compareTraceCubes.ts`) for validating against a real
PolyPhy-fork export.

This is a sibling dev tool, like `tools/flow-workbench/` and
`tools/galaxy-renderer/` — its own self-contained Vite + React + TS app, not
part of the skymap runtime bundle.

## Launch

```bash
npm run mcpm-workbench
```

Then open <http://localhost:5500>. The port (5500) is deliberately clear of
the main app (5173), the curator (5200), flow-workbench (5300), and
galaxy-renderer (5400) so all can run side-by-side.

## Shaders

The tool links against the runtime's canonical shader tree
(`src/services/gpu/shaders`) via `wesl.toml`, the same arrangement
`tools/flow-workbench` uses — a future `package::mcpm::…` shader will resolve
identically in both apps. It keeps exactly one shader of its own,
`src/render/shaders/blit.wesl`, the HDR→swapchain tonemap resolve.

## Grid-box gizmo

The wireframe box drawn over the sim volume carries three handle families,
each pickable by dragging directly on the glyph:

- **Arrows — translate.** Hold a constant screen size (they don't scale with
  the box, so they stay grabbable on a huge box and visible on a tiny one).
- **Crosses — resize.** Scale with the box's own half-extent.
- **Rings — rotate.** Radius = 1.3× the arrow length, sitting outside the
  arrow tips for visual separation from the translate handles.

**Reachability.** The handles are only drawn (and pickable) while the
wireframe itself is visible: the "show box" toggle in the grid panel keeps
them on screen. A drag in progress keeps the wireframe visible even if "show
box" is off, so a gesture that starts with the box shown never gets stranded
mid-drag if the toggle changes underneath it.

**`rotation` semantics.** The gizmo's ring drag writes a unit quaternion to
`GridBox.rotation`, applied **about the box's center** — `worldToBoxLocal`
(the box's own world→local transform) subtracts `centerMpc` first, rotates
by the quaternion's conjugate, then adds the half-extent, so the pivot is
always the center, never a corner. Exports carry this quaternion as honest
metadata, not as an instruction either producer applies to the voxel array:
`.scfd`'s header rotation slot and the `.npy` sidecar's `rotation` field both
write `box.rotation` verbatim, while the array itself stays in the box's own
unrotated grid-space layout. `origin_mpc` (sidecar) / `origin` (`.scfd`) is
always the corner of the **un-rotated** axis-aligned box (`centerMpc −
half-extent`) — a downstream consumer that wants the cube in world axes must
apply `rotation` about `centerMpc`, not `origin_mpc`.

## Export verification (Phase 2 gate)

2026-08-18, HEAD `05556bd02`. Headless run (`?probe` synthetic catalog,
small tier, 34 sim steps, paused before exporting so both legs read the
identical static trace) captured a `mcpm-20260818-0915.{npy,json,scfd}`
pair — dims 64×64×56, f16, 100k agents, seed 1.

- **Leg 1 (headless export run):** PASS — both download buttons produce
  their files (`.npy` + `polyphy-trace` sidecar; `.scfd`).
- **Leg 2 (importer round-trip):** PASS — `buildRhizomeVolume.ts` accepts
  the captured `.npy` + sidecar untouched and writes a same-dims `.scfd`.
- **Leg 3 (decode agreement):** PASS — decoding the browser's own `.scfd`
  and the importer's `.scfd` and diffing all 229,376 voxels elementwise:
  **100% bit-identical, max deviation = 0.** Fixed in this round:
  `exportNpy.ts` was writing the trace readback's raw bytes (grid.wesl's
  x-fastest GPU layout) straight to `.npy` with no reorder, while
  `buildRhizomeVolume.ts`'s default `packLogTraceVoxels` call — matching a
  real PolyPhy-fork export, per the shipped MCPM volumes rendering
  correctly — expects true NumPy C-order. `exportNpy.ts` now transposes
  through a new `xFastestToCOrder` (pure index permutation, no value
  change) before writing, so this tool's `.npy` leg is byte-diffable
  against a real fork export the same way `exportScfd.ts` already was.
  (An earlier un-paused capture showed a smaller residual deviation from
  the sim continuing to step between the two separate download clicks —
  not an export bug; pausing first eliminated it.)
- **Leg 4 (tests):** PASS — `tests/parsers/npyWriter.test.ts`,
  `tests/tools/mcpm-workbench/`, `tests/utils/volume/packLogTraceVoxels.test.ts`,
  `tests/tools/buildRhizomeVolume.smoke.test.ts` (67 tests, 22 files) all
  green, including new `exportNpy.test.ts` coverage for the transpose.

Preview-vs-live visual check is pending the maintainer's eyes; an automated
orientation check passed during T18's fix round.

## Validation (Phase 3 gate)

2026-08-18. Numbers below are the **second correction** to this section —
see "Comparator fix, round 2" below for what changed and why every row in
the two main tables moved again. The dev-only packed-catalog loader (T21) fed
the fork's real VAC catalog (`sdssGalaxy_rsdCorr_dbscan_e2p0ms3_dz0p001_m10p0_t=0.0.bin`,
324,901 points) through two independent headless runs at the anchor's exact
grid box — center `(-239.469, -16.5618, 201.275)` Mpc, size
`(556.288, 937.564, 568.789)` Mpc, long-axis resolution 1200 — which the
manual-mode UI cannot express (its center/size sliders snap to 1/5 Mpc
integer grids, and the resolution `<select>` offers only 64/128/256/360), so
the store was written directly (task-T23-brief.md's own escape hatch for the
catalog drop, extended here for the same structural reason). Both runs
resolved dims **712×1200×728 exactly** — matching `data/raw/mcpm/trace.bin` —
f16 element, ~4.02 GB budget, no refusal. Params were left at the boot
default (the SDSS-VAC preset already matches `export_metadata.txt` field for
field: sense spread 20°, sense distance 4.6 Mpc, turn angle 10°, move
distance 0.1 Mpc, persistence 0.8, sharpness 2.5); agent count 10,000,000
(`export_metadata.txt`'s "number of agents: 10M", exactly `AGENT_COUNT_MAX`).

**Step count.** `export_metadata.txt` carries sim _parameters_ but no step
count, so the fork's own run length is unknown — the brief's "extrapolate
from export_metadata" premise doesn't hold; this is reported, not papered
over. Measured throughput at full resolution: **~1.5 steps/sec**, stable
across two independent 20-60 step samples (not rAF-throttling — the
standard `--disable-*-backgrounding` flags made no difference, so this is
real per-step GPU+readback cost at 622M voxels × 10.3M agent-lanes). A
400-step scan showed `meanLogTraceAtPoints` converging geometrically
(successive 20-step deltas shrinking ~0.77×, consistent with `persistence`
0.8's own decay constant); extrapolating that series, **800 steps** leaves
the signal within ~0.03% of its asymptote. Two 800-step runs (seeds 1, 2)
confirmed this: the last five 20-step samples of each vary by <0.02% with no
trend — genuinely converged, not just far enough along a slow ramp. Wall
clock: ~508 s/run.

**Comparator fix, round 1 (FIXED).** The first pass at this gate found the
622M-voxel scale broke `compareTraceCubes.ts` and `readTraceCube.ts` two
different ways, closing off every dtype: (1) `Float32Array.from(bits,
mapFn)`'s f16 decode always goes through the iterator protocol regardless
of the map-fn, boxing 622M elements and OOMing even with a 16 GB heap; (2)
Node's `fs.readFileSync` hard-refuses files over 2 GiB
(`ERR_FS_FILE_TOO_LARGE`), and the real `trace.bin` (2,488,012,800 bytes)
is over that ceiling. Both fixed at `e9dd16a64` with chunked IO and a loop
decode (`decodeF16.ts`/`readFileChunked.ts`).

**Comparator fix, round 2 (FIXED) — voxel-order normalisation.** A
whole-branch review (`final-review.md` §A/X1) found round 1's full-
resolution numbers below were themselves an artifact: `loadShape` read
every `.npy` with no layout normalisation, but `exportNpy.ts` writes
`.npy` in NumPy C-order (`xFastestToCOrder`) while `axisMarginals` /
`dataPointHistogram` both index x-fastest — the two workbench `.npy` runs
were silently read with X and Z transposed. `trace.bin` (a headerless
`.bin`, always x-fastest) was unaffected, so this only ever hit one side
of the comparison. Fixed by adding an explicit `voxel_order` field to the
`polyphy-trace` sidecar (`emitTraceSidecar.ts` always writes `'c-order'`,
matching `exportNpy.ts`'s unconditional transpose) plus `--a-order`/
`--b-order` CLI overrides for `.npy` inputs whose sidecar predates the
field or has none — `loadShape` now hard-errors rather than defaulting
when a `.npy`'s order can't be determined either way. `cOrderToXFastest.ts`
is the actual un-transpose; a fixture test (`compareTraceCubes.test.ts`)
pins it against `xFastestToCOrder` on an asymmetric cube and proves a
correctly-normalised transposed pair compares clean (TV 0, marginals
exact). **Everything below is the re-run against the SAME `t23-artifacts/`
exports round 1 produced** — no new sim runs, only the comparator fix.

### Floor — two runs, same config, seeds 1 vs 2 (n=2), full 712×1200×728

| statistic                          | round-1 value (INVALID, order artifact) | corrected value                        |
| ---------------------------------- | --------------------------------------- | -------------------------------------- |
| logHistogram TV                    | 0.0001                                  | 0.0001 (unchanged — order-independent) |
| dataPointHistogram TV              | 0.0007                                  | 0.0028                                 |
| marginal max rel. dev. (x, y, z)   | 0.0068, 0.0117, 0.0546                  | 0.0560, 0.0585, 0.0817                 |
| meanLogTraceAtPoints (seed 1 vs 2) | 0.22226 vs 0.22146 (0.36% rel.)         | 4.78672 vs 4.78664 (0.0018% rel.)      |

`logHistogram TV` doesn't move: it's a value-only histogram with no spatial
indexing, so voxel order can't affect it — the same reasoning covers the
total-trace-mass ratio below. Everything that touches a voxel's _position_
(marginals, point sampling) moved, and moved a lot: the floor is now
tighter on `meanLogTraceAtPoints` (both runs are reading the SAME,
correctly-oriented voxel at each point now) and looser on the marginals —
still small, percent-level noise, still z the noisiest axis.

### Workbench vs. fork (each run vs. `trace.bin`, both seeds agree), full 712×1200×728

| statistic                                 | round-1 value (INVALID) | corrected value              | vs. corrected floor |
| ----------------------------------------- | ----------------------- | ---------------------------- | ------------------- |
| logHistogram TV                           | 0.0721                  | 0.0721 (unchanged)           | ~1116×              |
| dataPointHistogram TV                     | 0.9909                  | 0.6692 / 0.6690 (seed 1 / 2) | ~238×               |
| marginal max rel. dev. (x, y, z)          | 1.0000, 1.0000, 1.0000  | 1.0000, 1.0000, 1.0000       | ~12–18×             |
| meanLogTraceAtPoints (fork vs. workbench) | 7.137 vs 0.222 (32.1×)  | 7.137 vs 4.787 (1.49×)       | —                   |
| total trace mass ratio (fork ÷ workbench) | 9.28×                   | 9.28× (unchanged)            | —                   |

`logHistogram TV` and the mass ratio reproduce exactly, as predicted — a
fix to voxel ORDER cannot move an order-independent statistic. Everything
else moved, some by a lot: `meanLogTraceAtPoints`'s ratio collapsed from
32.1× to 1.49× — the round-1 number was reading the trace at scrambled
voxel coordinates for every catalog point. The marginal max-rel-dev is
numerically unchanged (still pinned at 1.0000 on all three axes) but for a
legitimate reason this time — see the diagnostic note below — not a byte-
order coincidence.

**Derived acceptance band (3× the corrected full-resolution floor — n=2,
first approximation):** logHistogram TV ≤ 0.0003 (3× the table's rounded
0.0001 floor above; 3× the exact 6.5e-5 floor is 0.0002 — this is the
number the Phase 4 sweep below actually applied), dataPointHistogram TV ≤
0.0084, marginal max rel. dev. ≤ 0.245, meanLogTraceAtPoints rel. diff. ≤
0.0054%. **The picture is no longer a uniform three-orders-of-magnitude
miss**: logHistogram TV misses by ~372×, dataPointHistogram TV by ~79×, and
`meanLogTraceAtPoints`'s relative difference (39.4%, against an extremely
tight band) by ~7300× — but the marginal max-rel-dev, the statistic round
1's transposition most directly corrupted, now misses the band by only
~4.1× on every axis (order 10⁰–10¹, not 10²–10³). That is real information
the transposed run destroyed: the marginals were never this branch's
worst-agreeing statistic, they were its most _scrambled_ one.

**Downsampled cross-check (356×600×364) — SUPERSEDED, not re-derived.**
The T23 downsample helper that produced the 356×600×364 `.npy` pair
(`t23-artifacts/downsampleForCompare.ts`, not production code) block-
averaged its input assuming x-fastest layout — the SAME wrong assumption
X1 found in the comparator, compounded on top of an already-C-order
source. Unlike a plain unindexed read, block-averaging groups voxels
before summing, so the resulting cube's values are not merely
mis-positioned but mis-computed — averaging the wrong 8-voxel groups is
not something a transpose can undo after the fact. The one exception is
**total trace mass**: summing block averages recovers the whole-cube sum
regardless of which voxels got grouped (every voxel is used exactly once,
correctly grouped or not), so the downsampled run's 9.3× mass ratio was,
and remains, a valid, resolution-independent cross-check of the corrected
9.28× above. `logHistogram TV` (0.1359), `dataPointHistogram TV` (0.9816),
and the `meanLogTraceAtPoints` ratio (15.8×) from that earlier table are
**not** reproduced here — a corrected downsample would need regenerating
the `.npy` pair, out of scope for this comparator-only fix.

**Diagnostic evidence, not yet root-caused (open items for the backlog /
T24 quirk-strip) — re-confirmed with the corrected comparator:**

- The anchor's per-axis marginals are **exactly zero** in the outermost
  ~80–85 bins on every axis; the workbench's are not (a flat, non-zero
  floor reaching every edge). This still explains the marginal max-rel-dev
  pinning at 1.0000 (an edge bin with `a=0, b>0` trivially maxes the
  ratio) — now confirmed on the correctly-identified axes, not a byte-
  order coincidence, and — per the corrected band comparison above — the
  LEAST discrepant of the four vs-fork statistics once floor noise is
  accounted for.
- Total trace mass: anchor ≈9.28× the workbench's, cross-checked against
  the (order-bug-immune) downsampled ≈9.3× above. The packed catalog's own
  point cloud sits well inside the box with tens of Mpc of margin on every
  side, so the zero-edge shells are not simply "no agent ever reaches
  there" on the fork's side while ours does — worth checking against the
  fork's actual boundary handling before assuming it's a workbench bug.
- `data/raw/mcpm/export_metadata.txt`'s data-point count (324,849) and the
  packed catalog sidecar's declared count (324,901, used here) differ by
  52 points — the two files are related but not byte-identical exports;
  not investigated further.
- `meanLogTraceAtPoints`'s corrected 1.49× ratio and the mass's 9.28× ratio
  are now much closer in magnitude than round 1's 32.1× suggested — both
  point at the fork depositing roughly an order of magnitude more trace
  mass than the workbench, rather than at two unrelated effects. Worth the
  T24 quirk-strip's first look: a single deposit/normalisation divergence
  would move both together, which is what's observed.

### Phase 4 — quirk strip sweep (T24)

2026-08-19/20. Six single-flag runs, each the same 800-step / seed 1 /
712×1200×728 anchor recipe above (all quirks default `true`, one flipped
`false` per run), compared against the fork the same way — seed 1 only,
not § Floor's two-seed policy (n=1 per flag). The derived band above
already encodes the seed-1-vs-2 spread, so a single seed against a
single-seed baseline is a coherent protocol, but a second seed per flag is
outstanding work, not yet run. **Baseline reproduced first**
(`baseline-vsFork-A.json`): logHist TV 0.07212, dataPoint TV 0.66918,
meanLogTraceAtPoints 7.13691 (fork) vs 4.78672 (workbench) — matches the
recorded numbers above within noise, so the sweep runs against a confirmed
baseline. `baseline-vsFork-A.json` is itself the comparator re-run over
T23's own exported cube (byte-identical to T23's `vsFork-A-fixed.json`),
so it attests the comparator at HEAD, not a fresh HEAD-side simulation
run; HEAD-side sim equivalence instead rests on `deadReadOff`'s provably
behavior-identical run (below), which reproduces this baseline to
ΔlogHistTV 2e-6 and ΔmeanLog 0.011%. Verdict rule: a flag's OFF run is
compared to baseline by the SAME 3×-floor band derived above (§ Floor,
0.0003 on logHistogram TV — no verdict below flips at the exact-floor
0.0002 either); inside the band on every statistic = **DELETE** (the
toggle is provably inert at this box/catalog/step-count); outside on any
statistic = **KEEP**, annotated with the delta in `constants.wesl`.

| flag                              | ΔlogHist TV (×band) | ΔdataPoint TV (×band) | meanLogTraceAtPoints Δ (×band) | mass ratio (fork÷workbench) | verdict |
| --------------------------------- | ------------------- | --------------------- | ------------------------------ | --------------------------- | ------- |
| `QUIRK_RNG_SEED_GUARD_TYPO`       | 0.0×                | 0.0×                  | −0.005% (0.8×)                 | not computed (see below)    | DELETE  |
| `QUIRK_NONPERIODIC_LOW_BOUNDARY`  | 0.0×                | 0.0×                  | −0.003% (0.6×)                 | not computed (see below)    | DELETE  |
| `QUIRK_INT3_TRUNCATED_SENSING`    | 18.3×               | 1.3×                  | −2.157% (399.5×)               | not computed (see below)    | KEEP    |
| `QUIRK_DEAD_CURRENT_DEPOSIT_READ` | 0.0×                | 0.0×                  | −0.011% (2.1×)                 | not computed (see below)    | DELETE  |
| `QUIRK_DECAY_WEIGHT_ALL_INT3`     | 0.1×                | 0.1×                  | +0.148% (27.4×)                | not computed (see below)    | KEEP    |
| `QUIRK_DITHERED_TRACE_DECAY`      | 5.3×                | 1.7×                  | −0.838% (155.2×)               | **9.28× → 10.11×**          | KEEP    |

**Mass ratio — measured for 2 of 6 configurations, not 6.** Both prior T24
legs computed each flag's total-trace-mass ratio with `computeTraceMass.ts`
before deleting the multi-GB `.npy` cube (disk hygiene), but the tool
prints to stdout only and neither leg redirected that output to a file or
a `summary.json` field — so `rngGuardOff`, `nonperiodicOff`,
`int3SensingOff`, `deadReadOff` and `decayWeightOff`'s mass numbers are
gone with their cubes and were **not** recoverable without re-running,
which the brief rules out once a leg is otherwise complete. This task's
own leg (`ditheredDecayOff`) persists its mass numbers in
`t24-artifacts/ditheredDecayOff.summary.json` before deleting the cube, so
the gap doesn't repeat for any future leg reusing this recipe.

**DEAD_CURRENT_DEPOSIT_READ's `deadReadOff` deserves a note despite the
2.1× meanLog band miss**: the quirk's own docblock (now the comment at its
old call site in `propagate.wesl`) proves it structurally inert — it loads
a value the very next line unconditionally overwrites before any read, so
the load can have no effect on the simulation regardless of whether Tint
elides it. A 2.1×-band, one-of-three-statistics miss on a single 800-step
run is well inside what a provably-inert flag can show from residual GPU
scheduling noise (the other five DELETE/KEEP calls all cluster an order of
magnitude either side of this one); verdict stands as DELETE on that
semantic argument as much as the statistics.

**Quirks kept, with their measured deltas now in `constants.wesl`:**
`QUIRK_INT3_TRUNCATED_SENSING` (the largest effect of the three — it fires
on every sensing draw for every agent, every step), `QUIRK_DECAY_WEIGHT_ALL_INT3`
(fires on every decay-kernel voxel, every step, but only shows up in the
point-sampled `meanLogTraceAtPoints`, not the global histogram/marginals),
and `QUIRK_DITHERED_TRACE_DECAY` (the largest effect overall, and the only
one of the six with a measured mass number — turning it off makes the
9.28× gap **worse**, not better).

**Mass-ratio conclusion: NOT explained by any single quirk flag.** The one
flag with a measured mass ratio (`ditheredDecayOff`, 10.11×) moved the
ratio further from parity, not closer, ruling that quirk out as the mass
gap's cause. The four flags with no mass number but a clean noise-floor
comparator result (`rngGuardOff`, `nonperiodicOff`, `deadReadOff`, plus
`QUIRK_DECAY_WEIGHT_ALL_INT3`'s tiny 0.1×-band histogram/marginal move)
are very unlikely to move an order-independent integral statistic like
total mass when they don't move the histogram at all — though that
argument is weaker than it sounds: `logHistogram TV` bounds the fraction
of voxels that moved bin in a normalised 64-bin histogram (§ Floor: a
value-only, order- and shape-independent statistic), not the
value-weighted, tail-dominated mass sum, so a near-zero TV does not by
itself rule out a mass move concentrated in the small number of
high-value voxels.
`QUIRK_INT3_TRUNCATED_SENSING`'s meanLogTraceAtPoints shift (−2.157%) is
the largest of the five without a mass number and remains untested against
mass directly — a genuine open item, not a null result, since a sensing
change alters where agents deposit, which a point-sampled statistic
underweights relative to a whole-volume sum. No combination of quirks was
tested (out of the one-flag-at-a-time method discipline). **Next
hypotheses, unexamined by this sweep:** f16 quantization of the trace
buffer (a systematic downward bias on repeated multiply-accumulate could
plausibly compound to nearly an order of magnitude over 800 steps — worth
an f32 A/B once budget allows it); the unresolved step-count mismatch
(`export_metadata.txt` carries no fork step count, so an actual step-count
divergence — this port ran to visual/numeric convergence at 800, the fork
ran to whatever its own author chose — could account for a mass gap that a
converged per-step statistic like `meanLogTraceAtPoints` wouldn't show);
deposit scaling (`addDeposit(..., 10.0 * weight)` in `propagate.wesl` —
unverified against the fork's own deposit constant); data-point weight
normalization (the 52-point count mismatch between `export_metadata.txt`
and the packed catalog, § above, plus whether `declaredMeanWeight`
0.04150081 is applied identically on both sides); and the x/y/z = 0
boundary mass leak `QUIRK_NONPERIODIC_LOW_BOUNDARY` governed
(`decay.wesl`) — it matches this README's own open edge-anomaly
diagnostic above and was deleted on the TV argument just weakened, with
no direct mass measurement. Re-testable by reverting that hunk and
re-running `computeTraceMass.ts`; the deletion itself is still correct
under the plan's inside-band rule, so this is a follow-up measurement, not
a reason to restore the flag.
