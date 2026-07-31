# Perf harness — headless GPU-timing measurement

`npm run perf` drives headless Chromium against a running dev server, flies the camera to fixed
scenario poses, and reports **per-render-pass GPU timings** (GPUQuerySet timestamp queries) plus a
per-frame TOTAL and its implied fps ceiling. It exists to replace "this feels slow" with numbers:
what does each pass cost, is a pass fragment- or vertex-bound, what does a catalog tier cost.

## Prerequisites

1. **A running dev server** — the harness does not start one. In the main checkout `npm run dev`
   serves on `http://localhost:5173`. **In a worktree, Vite auto-increments the port** (5174,
   5175, …) when 5173 is taken — read the `Local:` line your `npm run dev` printed and pass it:

   ```bash
   npm run perf -- --url http://localhost:5174
   ```

   Without `--url` the harness assumes 5173 — which in a worktree may be a _different branch's_
   server. If your numbers make no sense, check which server you actually measured.

2. **WebGPU `timestamp-query`** — present on Chrome/Metal (macOS dev machines). If the adapter
   lacks it the hook rejects loudly rather than returning zeros.

## Usage

```bash
npm run perf                                        # all 8 scenarios, 30 frames, dpr 2
npm run perf -- --scenario solar-system --frames 60 # one scenario (repeatable flag)
npm run perf -- --tier large                        # measure at a specific catalog tier
npm run perf -- --compare-tiers                     # each scenario at small/medium/large
npm run perf -- --sweep                             # fragment/vertex-bound classifier
npm run -s perf -- --json > perf.json               # machine-readable (note npm run -s!)
```

Flags: `--scenario <name>` (repeatable filter), `--frames N`, `--dpr 1|2`, `--url <base>`,
`--tier small|medium|large`, `--compare-tiers`, `--sweep`, `--json`. `--compare-tiers` conflicts
with `--tier` and `--sweep`.

**`--json` needs `npm run -s`** — without `-s`, npm's `> skymap@… perf` banner pollutes stdout.
Progress goes to stderr in both modes, so stdout is pure JSON.

## Reading the report

- **TOTAL (merged, production)** — the real number: median of per-frame pass-time sums under the
  production (merged) encode strategy, with its fps ceiling (GPU passes only; excludes
  CPU/present/vsync). The SUMMARY block at the bottom repeats the verdict in prose.
- **MERGED** — one row per render-step group (`hdr·NEAR0`, `swap·COSMO`, …), production pass
  shape. This section is the truth for "what does the frame spend".
- **PER-LAYER** — per-layer attribution from a second run under the `perLayerTimed` strategy.
  Each row **includes a fixed per-pass overhead** (~1–3 ms on M-series: one full-viewport DRAM
  round-trip per extra pass), so rows do NOT sum to the merged total and big-looking layers may
  be cheap. Never quote these numbers as real costs.
- **EST. PER-PASS FLOOR** — the harness's estimate of that shared overhead per group, and each
  layer's floor-subtracted "real" cost. This is the section that answers "is layer X actually
  expensive or just carrying pass overhead". (Historical example: orbit-trails/body-glints read
  3–4 ms per-layer but are ~1 ms real.)
- **Heat colors** — per-cell: dim < 0.3 ms (noise), green < 2, orange 2–5, red > 5. Share bars
  show each row's slice of its section.
- **`--sweep`** — measures each pass at four viewport scales and fits a log-log
  time-vs-pixel-count exponent: ≈1 → fragment/fill-bound (resolution scaling helps), ≈0 →
  vertex/CPU-bound (it won't). WebGPU has no pipeline-statistics queries; this perturbation fit
  is the honest classifier.
- **`--compare-tiers`** — a `pass × small/medium/large` table, fresh browser context per tier,
  `—` where a tier excludes a source.

## Scenarios

Poses live in `tools/perf/perfScenarios.ts` — eight regimes from `earth-surface` to `full-survey`,
captured from real flights via the in-app `l` (logState) key. To add one: fly there, press `l`,
copy the dumped pose into a new entry. Keep poses stable — the value of the harness is comparing
runs across commits, which dies if the poses drift.

## CPU-side star-cut bench (`starCutCpuBench.mts`)

The GPU harness above measures render-pass time and is blind to the star renderer's **CPU**
per-frame work (octree cut + LOD-fade partition + NodeParams pack). `starCutCpuBench.mts` drives
that path headless in Node against the real large-tier bin, and A/Bs the octree walk with the
off-screen frustum prune OFF vs ON — calling the same production `walkStarOctreeCut`, so the
number is what the app ships.

```bash
npx tsx tools/perf/starCutCpuBench.mts               # fetches stars-large.bin from R2 into .cache/
npx tsx tools/perf/starCutCpuBench.mts --bin foo.gz  # or point at a local gzipped bin
```

Reads: `walkOff` vs `walkOn` is the prune's walk-time win; `cutOff→cutOn` is the node-count shrink;
`TOTAL(on)` is walk+partition+pack for the pruned path. Node runs ~1.5–2× faster than the browser,
so treat the **deltas and cut-size ratios** as the portable results, not the absolute ms. The
`.cache/` bin is a per-machine fetch cache (gitignored), not a source asset.

## Gotchas

- **504 "Outdated Optimize Dep" → boot timeout.** A long-running Vite server whose dependency
  graph changed underneath it (branch switch, new imports) serves 504s to the headless page; the
  perf hook never installs and the harness times out waiting for `__skymapPerf`. Fix: restart the
  dev server. Diagnose with `.superpowers/sdd/probeBoot.ts`-style console dumping if in doubt.
- **The harness measures whatever the server serves.** After editing renderer/shader code, make
  sure the dev server picked it up (HMR or restart) before trusting a comparison run.
- **Run-to-run noise** is ~0.5 ms on medians at 30 frames; use more `--frames` for finer deltas.

## Architecture (for extending)

The browser side is `window.__skymapPerf` (`src/state/perf/installPerfHook.ts`, gated behind
`?perf`), a deliberately tiny seam: `ready`, `setPose`, `setStrategy`, `collectTimings`,
`setTier`, `getTier`, `slotGroups`. The Node side (`tools/perf/measurePerf.ts`) may import
Playwright, `tools/utils/*`, and **type-only** `src/@types/*` — never renderer/shader/
frameProgram modules. Formatters are pure `(report, palette)` functions in `tools/utils/perf/`
with injected ANSI palettes (`--json`/piped output stays plain); the pure pieces are all
unit-tested, the CDP wiring is verified live.
