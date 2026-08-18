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

2026-08-18, HEAD `e9dd16a64` (numbers below re-measured at full anchor
resolution after a comparator fix landed; see "Comparator fix" below for
the run this superseded). The dev-only packed-catalog loader (T21) fed
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

**Comparator fix (FIXED, no longer an open item).** The first pass at this
gate found the 622M-voxel scale broke
`tools/mcpm-workbench/validate/compareTraceCubes.ts` and `readTraceCube.ts`
two different ways, closing off every dtype: (1) `Float32Array.from(bits,
mapFn)`'s f16 decode always goes through the iterator protocol regardless
of the map-fn, boxing 622M elements and OOMing even with a 16 GB heap; (2)
Node's `fs.readFileSync` hard-refuses files over 2 GiB
(`ERR_FS_FILE_TOO_LARGE`), and the real `trace.bin` (2,488,012,800 bytes)
is over that ceiling — no dtype cleared both (f16 hit bug 1, f32 hit bug
2, including for `trace.bin` itself). That first pass worked around both
with data reformatting only (block-averaging to 356×600×364, comparator
itself untouched) rather than editing production code, and reported the
two bugs as backlog items. Both are now fixed at `e9dd16a64`
(`fix(mcpm-workbench): comparator reads anchor-scale cubes — chunked IO,
loop decode` — new `decodeF16.ts`/`readFileChunked.ts`, see
task-T22-report.md's "Fix round 3"). The numbers below are the **real,
unmodified comparator run directly against the full 712×1200×728 anchor**
— no downsampling, no reformatting, the same `.npy` exports the original
run produced.

### Floor — two runs, same config, seeds 1 vs 2 (n=2), full 712×1200×728

| statistic                          | value                           |
| ---------------------------------- | ------------------------------- |
| logHistogram TV                    | 0.0001                          |
| dataPointHistogram TV              | 0.0007                          |
| marginal max rel. dev. (x, y, z)   | 0.0068, 0.0117, 0.0546          |
| meanLogTraceAtPoints (seed 1 vs 2) | 0.22226 vs 0.22146 (0.36% rel.) |

Same shape as the earlier downsampled floor: small, consistent noise, z the
noisiest marginal axis (~8× the x-axis one).

### Workbench vs. fork (each run vs. `trace.bin`, both seeds agree), full 712×1200×728

| statistic                                 | value                  | vs. floor |
| ----------------------------------------- | ---------------------- | --------- |
| logHistogram TV                           | 0.0721                 | ~1116×    |
| dataPointHistogram TV                     | 0.9909                 | ~1484×    |
| marginal max rel. dev. (x, y, z)          | 1.0000, 1.0000, 1.0000 | ~18–147×  |
| meanLogTraceAtPoints (fork vs. workbench) | 7.137 vs 0.222 (32.1×) | —         |

Both seeds land on identical vs-fork numbers to 4 decimal places — a
systematic disagreement, not noise.

**Derived acceptance band (3× the full-resolution floor — n=2, so treat as
a first approximation, not a settled constant):** logHistogram TV ≤
0.0002, dataPointHistogram TV ≤ 0.0020, marginal max rel. dev. ≤ 0.164,
meanLogTraceAtPoints rel. diff. ≤ 1.1%. **Every vs-fork statistic misses
this band by three orders of magnitude** — the exact multiplier chosen for
the band is immaterial to that verdict.

**Downsampled cross-check (356×600×364, the first pass's workaround
resolution) — kept because the deltas between the two resolutions are
themselves informative, not because the downsampled numbers are
load-bearing:**

| statistic                       | downsampled | full-res | direction                |
| ------------------------------- | ----------- | -------- | ------------------------ |
| logHistogram TV (vs-fork)       | 0.1359      | 0.0721   | **improves** at full res |
| dataPointHistogram TV (vs-fork) | 0.9816      | 0.9909   | worsens slightly         |
| meanLogTraceAtPoints ratio      | 15.8×       | 32.1×    | **worsens** at full res  |
| total trace mass ratio (a ÷ b)  | 9.3×        | 9.28×    | resolution-stable        |

Total trace mass is resolution-stable (9.3× at both scales) — an
integrated quantity, robust to block-averaging, so this is very likely a
real, resolution-independent magnitude difference rather than a
downsampling artifact. The point-sampled statistics are not stable: going
to full resolution roughly **doubles** the `meanLogTraceAtPoints` gap
(nearest-voxel sampling is more sensitive to exact point-to-voxel
alignment at finer voxel size) while `logHistogramTV` (whole-cube shape,
dominated by the vast near-zero background) actually improves. Reading
either resolution's numbers alone would understate one of these two
effects — worth keeping both rows.

**Diagnostic evidence, not yet root-caused (open items for the backlog /
T24 quirk-strip) — reconfirmed at full resolution, unchanged in kind:**

- The anchor's per-axis marginals are **exactly zero** in the outermost
  ~80–85 bins on every axis (both ends, all three axes, at full
  resolution — roughly double the ~40-bin downsampled count, i.e. the same
  physical margin at 2× the voxel density); the workbench's are not (a
  flat, non-zero floor reaching every edge). This alone explains the
  marginal max-rel-dev pinning at 1.0000 (an edge bin with `a=0, b>0`
  trivially maxes the ratio) but not the magnitude gap below.
- Total trace mass: anchor ≈9.28× the workbench's (full resolution,
  matching the downsampled run's ≈9.3× almost exactly — see the
  cross-check table above). The packed catalog's own point cloud sits well
  inside the box with tens of Mpc of margin on every side (its metadata
  bounds vs. the box bounds), so the zero-edge shells are not simply "no
  agent ever reaches there" on the fork's side while ours does — worth
  checking against the fork's actual boundary handling before assuming
  it's a workbench bug.
- `data/raw/mcpm/export_metadata.txt`'s data-point count (324,849) and the
  packed catalog sidecar's declared count (324,901, used here) differ by
  52 points — the two files are related but not byte-identical exports;
  not investigated further.
- New this round: `meanLogTraceAtPoints` disagrees more, not less, at full
  resolution (32.1× vs the downsampled run's 15.8×), while the whole-cube
  `logHistogramTV` disagrees less (0.0721 vs 0.1359). The two statistics
  are answering different questions (point-sampled vs. whole-volume shape)
  and shouldn't be expected to track each other — flagging so a future
  pass doesn't average them into one "resolution improves agreement"
  conclusion, which the point-sampled numbers directly contradict.
