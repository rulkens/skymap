---
name: perf
description: Use when measuring, claiming, or investigating anything about render performance — before AND after any renderer/shader/perf change, or when asked "why is this slow?". Runs the headless GPU-timing harness and interprets it correctly.
---

# /perf — measure, don't eyeball

`npm run perf` gives per-pass GPU medians at fixed camera poses in headless Chromium. Any
statement like "this pass is expensive", "my change made it faster", or "that's probably
fill-bound" should come from a harness run, not intuition. Full reference:
[`tools/perf/README.md`](../../../tools/perf/README.md).

## Procedure

1. **Find your dev server's real port.** The harness needs a running dev server (`/dev` skill) and
   measures whatever that server serves. In a worktree Vite auto-increments past 5173 — read the
   `Local:` line of _your_ `npm run dev` and pass it explicitly:

   ```bash
   npm run perf -- --url http://localhost:<port> --scenario <name> --frames 30
   ```

   Omitting `--url` in a worktree silently measures whichever branch owns 5173.

2. **Baseline BEFORE touching code.** Run the scenarios covering the regime you're about to
   change (`earth-surface`/`solar-system` for NEAR0 bodies+stars, `star-field`/`milky-way` for
   the star ladder, `local-group`/`full-survey` for survey/COSMO). Save the output to a
   scratchpad file — you cannot reconstruct the "before" after editing.

3. **Re-run AFTER, same flags.** Compare MERGED medians. Run-to-run noise is ~0.5 ms at 30
   frames — deltas inside that are not a result; raise `--frames` for finer claims.

4. **Classify before optimizing.** `--sweep` fits time-vs-pixel-count per pass: exponent ≈1 →
   fragment/fill-bound (resolution levers help), ≈0 → vertex/CPU-bound (they won't). For
   data-scale costs use `--tier large` or `--compare-tiers`.

## Interpretation rules (these get misquoted)

- **Quote MERGED numbers.** That's the production encode shape; TOTAL (merged) + its fps ceiling
  is the headline (GPU passes only — excludes CPU/present/vsync).
- **Never quote PER-LAYER rows as real costs.** Each carries a fixed ~1–3 ms per-pass overhead
  (full-viewport DRAM round-trip under the instrumented strategy). Use the **EST. PER-PASS
  FLOOR** section's floor-subtracted "real" values for attribution. (orbit-trails/body-glints
  once read 3–4 ms per-layer; they're ~1 ms real.)
- **Machine parsing:** `npm run -s perf -- --json` — the `-s` is required or npm's banner
  pollutes stdout.
- **CRITICAL on Apple Silicon: MERGED slot-sums are ~3× inflated.** TBDR executes passes
  concurrently, so back-to-back small passes each report the shared retire interval. The tell:
  adjacent slots with IDENTICAL medians (e.g. hdr→swap / swap·COSMO / swap·NEAR0 all reading
  3.2–3.3 ms). Per-slot ms are ordinal at best: never additive, never fps-convertible. The
  honest total is a wall-clock/rAF probe: boot `?perf`, `setStrategy('merged')`, `setPose` to
  the harness pose, collect 240 rAF deltas, then `collectTimings` and compare. Sustained
  120 fps bounds real per-frame GPU work at ≤ 8.3 ms, whatever the slot sums claim.

## Off-harness techniques

- **Paired-baseline A/B.** For before/after claims that survive thermal drift: check out the
  base commit in a scratch worktree (`git worktree add --detach <scratch> <base>`), symlink
  `node_modules` and `public/data` into it, start a second dev server (Vite auto-increments the
  port), and alternate runs A-B-A-B across the two URLs instead of measuring all-A then all-B.
  Remove the scratch worktree after use.
- **CPU-side frame costs.** Bench against the REAL .bin with a tsx scratchpad script that
  drives the actual code path (name it `.mts`: the scratchpad has no `package.json`, so a plain
  `.ts`/`.js` script runs as CJS). "GC churn" diagnoses are usually inline allocation + cache
  pressure in disguise; measure before optimizing.

## Gotchas

- **Boot timeout + `504 Outdated Optimize Dep`** in the page errors → the long-running Vite
  server went stale under a branch switch or new imports. Restart the dev server, re-run.
- After editing shaders/renderers, confirm the server picked the change up (HMR line in its
  output, or restart) before trusting an "after" run.
- Scenario poses live in `tools/perf/perfScenarios.ts` (captured via the in-app `l` key). Don't
  drift them — cross-commit comparability is the harness's whole value.
