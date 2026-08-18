# MCPM Workbench

A WebGPU dev tool that will visualise the **MCPM cosmic-web simulation** —
the constrained-realisation dark-matter density field skymap's volume
renderers already consume, but driven live rather than baked offline. This
task (T1) scaffolds the empty shell only: a Vite + React + TS app with a
canvas that clears to a colour through the HDR-accumulate → tonemap render
graph. No MCPM data, compute, or UI yet — those land in later tasks of the
`mcpm-workbench` plan.

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

2026-08-18, HEAD `52b446041`. The dev-only packed-catalog loader (T21) fed
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

**Comparator blockers at full anchor resolution (both confirmed, neither
fixed — no production-code edits).** The 622M-voxel scale breaks
`tools/mcpm-workbench/validate/compareTraceCubes.ts` and `readTraceCube.ts`
two different ways, closing off every dtype:

1. `compareTraceCubes.ts:82`, `readTraceCube.ts:40` —
   `Float32Array.from(uint16Bits, (b) => f16BitsToFloat(b))`. Per spec,
   `%TypedArray%.from` on a source with `Symbol.iterator` (every typed array)
   always goes through the iterator protocol regardless of the map-fn,
   materialising every element as a boxed value first. At 622M elements this
   is catastrophic — confirmed empirically: `NODE_OPTIONS=--max-old-space-size=16384`
   still crashes with `FATAL ERROR: invalid array length ... JavaScript heap
out of memory` (stack: `Builtins_IterableToList` → `Builtins_TypedArrayFrom`)
   — a young-gen allocation-churn failure, not an old-space budget the heap
   flag can buy past. Blocks any f16 `.npy` side (our own exports) at full
   resolution.
2. Node's own `fs.readFileSync` refuses files over 2 GiB
   (`ERR_FS_FILE_TOO_LARGE`) — confirmed directly:
   `node -e "require('fs').readFileSync('data/raw/mcpm/trace.bin')"` →
   `File size (2488012800) is greater than 2 GiB`. `readTraceCube.ts`'s
   unconditional `readFileSync(filePath)` can't load the real anchor **at
   all**, independent of dtype, resolution choice, or memory available —
   the anchor's own fixed size is the problem. Widening our f16 exports to
   f32 (2.49 GB) to dodge bug 1 lands squarely in bug 2 instead.

No dtype clears both at 712×1200×728: f16 triggers the OOM, f32 exceeds the
read ceiling — including for the real `trace.bin`, so **the comparator
cannot run at full anchor resolution on any leg, for any input.** Both are
genuine bugs in `tools/mcpm-workbench/validate/`, not fixed here per the
task's no-production-edits constraint; flagged below for the backlog.

**Workaround (data reformatting only, comparator itself untouched and
unmodified).** `t23-artifacts/downsampleForCompare.ts` reads `trace.bin` and
both runs' `.npy` exports in bounded chunks (`fs.openSync`/`readSync`, ≤512 MB
per call — the same technique that dodges the >2 GiB _write_ ceiling on the
export side), block-averages 2×2×2 (712×1200×728 → 356×600×364, same
x-fastest `index = z·ny·nx + y·nx + x` convention `axisMarginals.ts` already
documents), and writes plain small f32 `.npy` + sidecar files. The **real,
unmodified** `compareTraceCubes.ts` then runs end-to-end on those, through
its already-correct f32 code path — this changes storage format and
resolution, never a measured value, and is exactly the resolution-step-down
contingency the brief already names ("state clearly which comparisons are
valid at your resolution"); the reason here is a comparator I/O ceiling
rather than a GPU budget refusal, but the remedy is identical. **All Phase 3
numbers below are at 356×600×364 (voxel size 1.5626 Mpc), not the anchor's
native 712×1200×728** — the histogram/marginal statistics are
resolution-normalized by design (T22), but the two-run floor and the
vs-fork comparison are only valid AT this shared downsampled resolution
against each other, not against any other run's numbers at a different
resolution.

### Floor — two runs, same config, seeds 1 vs 2 (n=2)

| statistic                          | value                           |
| ---------------------------------- | ------------------------------- |
| logHistogram TV                    | 0.0002                          |
| dataPointHistogram TV              | 0.0024                          |
| marginal max rel. dev. (x, y, z)   | 0.0050, 0.0078, 0.0446          |
| meanLogTraceAtPoints (seed 1 vs 2) | 0.42388 vs 0.42322 (0.16% rel.) |

Racy-deposit noise is small and consistent across both seeds; the z-axis
marginal is the noisiest floor statistic (~9× the x-axis one) — plausibly
the line-of-sight axis catching more shot noise from fewer independent
agent passes per slice, not investigated further here.

### Workbench vs. fork (each run vs. `trace.bin`, both seeds agree)

| statistic                                 | value                  | vs. floor |
| ----------------------------------------- | ---------------------- | --------- |
| logHistogram TV                           | 0.1359                 | ~600×     |
| dataPointHistogram TV                     | 0.9816                 | ~410×     |
| marginal max rel. dev. (x, y, z)          | 1.0000, 1.0000, 1.0000 | ~20–200×  |
| meanLogTraceAtPoints (fork vs. workbench) | 6.696 vs 0.424 (15.8×) | —         |

Both seeds land on near-identical vs-fork numbers (logHistogram TV differs
in the 4th decimal), so this is a systematic disagreement, not noise.

**Derived acceptance band (3× the measured floor — n=2, so treat as a first
approximation, not a settled constant):** logHistogram TV ≤ 0.0007,
dataPointHistogram TV ≤ 0.0072, marginal max rel. dev. ≤ 0.134,
meanLogTraceAtPoints rel. diff. ≤ 0.5%. **Every vs-fork statistic misses
this band by two to three orders of magnitude** — the exact multiplier
chosen for the band is immaterial to that verdict.

**Diagnostic evidence, not yet root-caused (open items for the backlog /
T24 quirk-strip):**

- The anchor's per-axis marginals are **exactly zero** in the outermost
  ~40 bins on every axis (both ends, all three axes); the workbench's are
  not (a flat ~200–380k/slice floor reaching every edge). This alone
  explains the marginal max-rel-dev pinning at 1.0000 (an edge bin with
  `a=0, b>0` trivially maxes the ratio) but not the magnitude gap below.
- Total trace mass: anchor ≈9.3× the workbench's, at this resolution.
  `meanLogTraceAtPoints` similarly off by ~15.8×. The packed catalog's own
  point cloud sits well inside the box with tens of Mpc of margin on every
  side (its metadata bounds vs. the box bounds), so the zero-edge shells
  are not simply "no agent ever reaches there" on the fork's side while
  ours does — worth checking against the fork's actual boundary handling
  before assuming it's a workbench bug.
- `data/raw/mcpm/export_metadata.txt`'s data-point count (324,849) and the
  packed catalog sidecar's declared count (324,901, used here) differ by
  52 points — the two files are related but not byte-identical exports;
  not investigated further.

**Backlog candidates (comparator bugs, confirmed but not fixed here):**
`compareTraceCubes.ts`'s and `readTraceCube.ts`'s f16 decode via
`TypedArray.from(bits, mapFn)` needs a plain loop instead (OOMs at anchor
scale); `readTraceCube.ts`'s `readFileSync` needs chunked reads (the anchor
itself exceeds Node's 2 GiB `readFileSync` ceiling).
