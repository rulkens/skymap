# Data Tiers (small / medium / large) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three hot-swappable dataset tiers (small ~300k, medium ~600k, large ~3.5M) so we can dial render-time GPU load up or down without a page reload.

**Architecture:** At build time, `tools/buildAllBins.ts` emits three subsampled `.bin` variants per source (SDSS, GLADE) using a brightest-N-by-absolute-magnitude cut. 2MRS and Famous have one shared file each (no subsampling — they're already small). At runtime, the engine ships with a viewport-derived initial tier and exposes `setTier(tier)` which AbortController-cancels any in-flight cloud fetch for the affected sources, re-fetches `<source>-<tier>.bin`, and replaces the GPU vertex buffers in place via `pointRenderer.upload(source, cloud)`. A three-button segmented `<TierSelector>` lives at the top of the SettingsPanel body.

**Tech Stack:** TypeScript + Vite + React, Vitest (node env, `react-dom/server.renderToStaticMarkup` for component tests), WebGPU (existing renderer), `tsx` for build-time scripts.

---

## File Structure

**Create:**
- `src/@types/Tier.d.ts` — `export type Tier = 'small' | 'medium' | 'large'`
- `src/data/tierTargets.ts` — `TIER_TARGETS: Record<Tier, Partial<Record<Source, number>>>` (the table; missing key = no cap; 0 = exclude). Also a `tierFilenameForSource(source, tier)` helper.
- `src/utils/initialTierFromViewport.ts` — pure `(width: number) => Tier`.
- `src/components/SettingsPanel/TierSelector.tsx` — three-button segmented control.
- `src/components/SettingsPanel/TierSelector.module.css` — layout for the three-button row.
- `tools/subsampleByAbsMag.ts` — pure `subsampleByAbsMag(records, target) => ParsedRecord[]`.
- `tests/utils/initialTierFromViewport.test.ts`
- `tests/data/tierTargets.test.ts`
- `tests/tools/subsampleByAbsMag.test.ts`
- `tests/components/SettingsPanel/TierSelector.test.ts`
- `tests/services/engine/cloudLoader.reload.test.ts`
- `tests/services/engine/computeAngularWeights.rebake.test.ts` (regression: weights recompute on tier swap)

**Modify:**
- `tools/buildAllBins.ts` — emit `<source>-small.bin`, `<source>-medium.bin`, `<source>-large.bin` for SDSS + GLADE; leave 2MRS/Famous as one file (`2mrs.bin`, `famous.bin`) shared by all tiers.
- `src/services/engine/cloudLoader.ts` — tier-aware filename, abortable per-source re-fetch (`reloadSource(source, tier, onResult)` + an `AbortController` registry).
- `src/services/engine/engine.ts` — `setTier(tier)`: orchestrates per-source diff between current and next tier, abort+refetch only the sources that change.
- `src/@types/EngineHandle.d.ts` — `setTier(tier: Tier): void`.
- `src/@types/EngineCallbacks.d.ts` — extend with `onTierChange?: (tier: Tier) => void` (so React state mirrors engine truth — same pattern as `onLodModeChange`).
- `src/components/SettingsPanel/SettingsPanel.tsx` — accept `tier` + `onTierChange` props; render `<TierSelector>` at the top of the panel body, above the existing first `CollapsibleSection`.
- `src/components/App/App.tsx` — own `currentTier` state seeded from `initialTierFromViewport(window.innerWidth)`, plumb into `createEngine` (initial value) + `<SettingsPanel tier=... onTierChange=...>`.
- `package.json` — add `build-tiers` (alias) and document the workflow; existing `build-all` is repurposed to emit all three tiers.
- `.gitignore` — exclude `public/data/*.bin` (artefacts only, not in git).

**Format note:** PointCloud format stays at v4 (no on-disk format change — tier-subsampled clouds use the existing encoder).

---

## Phase 1 — Build-time tier generation

### Task 1: Define the `Tier` type + tier targets table

**Files:**
- Create: `src/@types/Tier.d.ts`
- Create: `src/data/tierTargets.ts`
- Create: `tests/data/tierTargets.test.ts`

- [ ] **Step 1: Create the `Tier` type**

`src/@types/Tier.d.ts`:

```ts
/**
 * Tier — three-way data-volume preset shared between the build pipeline and
 * the runtime hot-swap.
 *
 * - `small`  — mobile target, ~300k galaxies total. SDSS dropped, GLADE cut
 *              to its brightest ~256k, 2MRS + Famous kept whole (small).
 * - `medium` — default for desktops, ~600k total. Brightest ~156k SDSS +
 *              brightest ~400k GLADE + full 2MRS + full Famous.
 * - `large`  — opt-in full catalog (~3.5M). The pre-tier behaviour.
 *
 * The values are persisted in URL query strings and the runtime API only
 * (never on disk: the binary format is tier-agnostic). String-union — not a
 * numeric enum — because tier identity is human-readable telemetry, not a
 * file-format token.
 */
export type Tier = 'small' | 'medium' | 'large';
```

- [ ] **Step 2: Write the failing tier-targets test**

`tests/data/tierTargets.test.ts`:

```ts
/**
 * Tests for the tierTargets table — the single source of truth for "how many
 * galaxies do we keep per source per tier?".
 *
 * The table is deliberately a `Partial<Record<Source, number>>` per tier:
 *   - missing key  → no cap (use the full source unchanged)
 *   - 0            → exclude this source entirely from this tier
 *   - positive N   → keep the brightest N by absolute magnitude
 *
 * These three cases are tested against each tier so the build pipeline and
 * the runtime hot-swap can rely on consistent semantics.
 */

import { describe, expect, it } from 'vitest';
import { Source } from '../../src/data/sources';
import { TIER_TARGETS, tierFilenameForSource } from '../../src/data/tierTargets';

describe('TIER_TARGETS', () => {
  it('small tier excludes SDSS and caps GLADE at 256k', () => {
    expect(TIER_TARGETS.small[Source.SDSS]).toBe(0);
    expect(TIER_TARGETS.small[Source.Glade]).toBe(256_000);
  });

  it('small tier keeps 2MRS and Famous uncapped (key absent)', () => {
    expect(TIER_TARGETS.small).not.toHaveProperty(String(Source.TwoMRS));
    expect(TIER_TARGETS.small).not.toHaveProperty(String(Source.Famous));
  });

  it('medium tier caps SDSS at ~156k and GLADE at ~400k', () => {
    expect(TIER_TARGETS.medium[Source.SDSS]).toBe(156_000);
    expect(TIER_TARGETS.medium[Source.Glade]).toBe(400_000);
  });

  it('large tier has no caps for any source', () => {
    expect(Object.keys(TIER_TARGETS.large)).toEqual([]);
  });
});

describe('tierFilenameForSource', () => {
  it('emits per-tier filenames for subsampled sources (SDSS, GLADE)', () => {
    expect(tierFilenameForSource(Source.SDSS, 'small')).toBe('sdss-small.bin');
    expect(tierFilenameForSource(Source.SDSS, 'medium')).toBe('sdss-medium.bin');
    expect(tierFilenameForSource(Source.SDSS, 'large')).toBe('sdss-large.bin');
    expect(tierFilenameForSource(Source.Glade, 'medium')).toBe('glade-medium.bin');
  });

  it('emits the shared filename for tier-agnostic sources (2MRS, Famous)', () => {
    expect(tierFilenameForSource(Source.TwoMRS, 'small')).toBe('2mrs.bin');
    expect(tierFilenameForSource(Source.TwoMRS, 'large')).toBe('2mrs.bin');
    expect(tierFilenameForSource(Source.Famous, 'medium')).toBe('famous.bin');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/data/tierTargets.test.ts`
Expected: FAIL with "Cannot find module ../../src/data/tierTargets".

- [ ] **Step 4: Create the table + filename helper**

`src/data/tierTargets.ts`:

```ts
/**
 * tierTargets — per-tier per-source point-count caps and filename mapping.
 *
 * ### Why a Partial<Record<Source, number>> instead of full coverage
 *
 * The three encodings — missing key / 0 / positive N — give us three distinct
 * semantics in one tiny table:
 *
 *   missing key  → no cap; ship the source unchanged (used for 2MRS + Famous,
 *                  which are already small and need no subsampling).
 *   0            → exclude this source from this tier entirely (small drops
 *                  SDSS to keep the total under the mobile GPU budget).
 *   positive N   → keep the brightest N galaxies by absolute magnitude (the
 *                  volume-limited cut applied at build time).
 *
 * Encoding "no cap" as missing-key (rather than +Infinity) means a builder can
 * write `if (target === undefined) skip subsampling` without sentinel-equality
 * gymnastics, and the table reads as "this tier is mostly defaults; here are
 * the exceptions" — exactly the correct mental model.
 *
 * ### Why fixed integer targets (not a fraction)
 *
 * Rendering load scales with on-screen instance count, which is bounded by the
 * total uploaded count, which is what these numbers control.  Fractions like
 * "10% of GLADE" would shift if GLADE itself grew (e.g. v2.4 release), and the
 * mobile-GPU budget is an absolute number of points, not a percentage.
 *
 * ### Why filename suffixes for subsampled sources only
 *
 * 2MRS (~44k) and Famous (~150) are tier-agnostic — the same .bin works at
 * every tier — so they keep their existing filenames (`2mrs.bin`, `famous.bin`)
 * and live in one place on the static host.  SDSS and GLADE get a `-small`,
 * `-medium`, `-large` suffix because each tier's cut is a different file.
 */

import { Source } from './sources';
import type { Tier } from '../@types/Tier';

/**
 * Tier-target table.  Order: small, medium, large.
 *
 * Targets in points (galaxies).  Missing key = no cap.  See module doc for
 * the semantics of each encoding.
 */
export const TIER_TARGETS: Record<Tier, Partial<Record<Source, number>>> = {
  small: {
    [Source.SDSS]: 0, // mobile budget — drop SDSS entirely
    [Source.Glade]: 256_000, // brightest 256k
    // 2MRS + Famous: missing → use full source
  },
  medium: {
    [Source.SDSS]: 156_000, // brightest ~156k
    [Source.Glade]: 400_000, // brightest 400k
    // 2MRS + Famous: missing → use full source
  },
  large: {
    // No caps anywhere — the full pre-tier behaviour.
  },
};

/**
 * The set of sources that get per-tier filename suffixes.  Everything not in
 * this set keeps a single file shared across tiers.
 */
const TIERED_SOURCES: ReadonlySet<Source> = new Set([Source.SDSS, Source.Glade]);

/** Base (tier-agnostic) filename per source.  Used unchanged for non-tiered sources. */
const BASE_FILENAMES: Partial<Record<Source, string>> = {
  [Source.SDSS]: 'sdss',
  [Source.TwoMRS]: '2mrs',
  [Source.Glade]: 'glade',
  [Source.Famous]: 'famous',
};

/**
 * Returns the on-disk filename for a (source, tier) pair.
 *
 * For tiered sources (SDSS, GLADE) we append `-<tier>` before `.bin` so the
 * three variants coexist on the static host.  For non-tiered sources (2MRS,
 * Famous) we return the bare filename — every tier loads the same file.
 *
 * Throws on `Source.Synthetic` because synthetic data is generated at runtime
 * and never has a filename.  Throwing rather than returning a sentinel string
 * keeps a buggy caller loud instead of silently 404-ing.
 */
export function tierFilenameForSource(source: Source, tier: Tier): string {
  const base = BASE_FILENAMES[source];
  if (!base) throw new Error(`tierFilenameForSource: no base filename for source ${source}`);
  if (TIERED_SOURCES.has(source)) return `${base}-${tier}.bin`;
  return `${base}.bin`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/data/tierTargets.test.ts`
Expected: PASS, 5 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/@types/Tier.d.ts src/data/tierTargets.ts tests/data/tierTargets.test.ts
git commit -m "$(cat <<'EOF'
feat(tiers): add Tier type and tierTargets table

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Pure `subsampleByAbsMag(records, target)` helper

**Files:**
- Create: `tools/subsampleByAbsMag.ts`
- Create: `tests/tools/subsampleByAbsMag.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/tools/subsampleByAbsMag.test.ts`:

```ts
/**
 * Tests for subsampleByAbsMag — the volume-limited brightest-N cut applied at
 * build time.
 *
 * Selection rule: M_abs = m_app − 5·log10(d_Mpc) − 25 where d_Mpc is derived
 * from the parser's redshift via Hubble's law (HUBBLE_DISTANCE_MPC × z).
 * Smaller / more-negative M_abs = brighter; we keep the brightest `target`
 * records.
 *
 * Edge cases tested:
 *   - target ≥ N         → returns all records, original order preserved
 *   - target < N         → keeps brightest target, in original order
 *   - target = 0         → returns []
 *   - target = N exactly → returns all (no-op)
 *   - non-finite distance/mag → record is dropped before ranking
 *   - tie-break          → equal M_abs records sort stably by original index
 */

import { describe, expect, it } from 'vitest';
import { Source } from '../../src/data/sources';
import { subsampleByAbsMag } from '../../tools/subsampleByAbsMag';
import type { ParsedRecord } from '../../tools/parsers/common';

function rec(overrides: Partial<ParsedRecord>): ParsedRecord {
  return {
    source: Source.SDSS,
    objID: 0n,
    ra: 0,
    dec: 0,
    z: 0.05,
    magU: NaN,
    magG: 18,
    magR: NaN,
    magI: NaN,
    magZ: NaN,
    axisRatio: null,
    positionAngleDeg: null,
    diameterKpc: null,
    ...overrides,
  };
}

describe('subsampleByAbsMag', () => {
  it('returns all records when target >= length', () => {
    const a = rec({ magG: 18, z: 0.05 });
    const b = rec({ magG: 17, z: 0.05 });
    expect(subsampleByAbsMag([a, b], 5)).toEqual([a, b]);
    expect(subsampleByAbsMag([a, b], 2)).toEqual([a, b]);
  });

  it('returns [] when target is 0', () => {
    expect(subsampleByAbsMag([rec({}), rec({})], 0)).toEqual([]);
  });

  it('keeps the brightest target by absolute magnitude', () => {
    // At z=0.05, distance ≈ 214.4 Mpc, mu ≈ 36.66.
    // brightest: magG=14 → M ≈ -22.66
    // mid:       magG=18 → M ≈ -18.66
    // dim:       magG=22 → M ≈ -14.66
    const bright = rec({ magG: 14, z: 0.05 });
    const mid = rec({ magG: 18, z: 0.05 });
    const dim = rec({ magG: 22, z: 0.05 });
    const out = subsampleByAbsMag([dim, mid, bright], 2);
    // Brightest two kept; original order preserved among survivors.
    expect(out).toEqual([mid, bright]);
  });

  it('drops records with non-finite distance (z<=0) before ranking', () => {
    const ok = rec({ magG: 18, z: 0.05 });
    const badZ = rec({ magG: 14, z: 0 }); // distance = 0 → undefined M_abs
    const out = subsampleByAbsMag([ok, badZ], 5);
    // badZ excluded, even with target larger than the surviving population.
    expect(out).toEqual([ok]);
  });

  it('drops records with NaN apparent magnitude before ranking', () => {
    const ok = rec({ magG: 18, z: 0.05 });
    const nanMag = rec({ magG: NaN, z: 0.05 });
    expect(subsampleByAbsMag([ok, nanMag], 5)).toEqual([ok]);
  });

  it('breaks ties stably by original input order', () => {
    // Identical mag + z → identical M_abs.  Both must survive a target=2 cut
    // (no surprise drops), in their original order.
    const a = rec({ magG: 18, z: 0.05, objID: 1n });
    const b = rec({ magG: 18, z: 0.05, objID: 2n });
    const c = rec({ magG: 18, z: 0.05, objID: 3n });
    const out = subsampleByAbsMag([a, b, c], 2);
    expect(out.map((r) => r.objID)).toEqual([1n, 2n]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/subsampleByAbsMag.test.ts`
Expected: FAIL with "Cannot find module ../../tools/subsampleByAbsMag".

- [ ] **Step 3: Implement the helper**

`tools/subsampleByAbsMag.ts`:

```ts
/**
 * subsampleByAbsMag — pure brightest-N cut by absolute magnitude.
 *
 * ### Why absolute, not apparent, magnitude?
 *
 * Apparent magnitude reflects "how bright does this galaxy look from Earth?",
 * which is dominated by distance for a deep flux-limited catalog like SDSS.
 * Cutting by apparent mag would drop intrinsically-luminous galaxies in the
 * back of the volume and keep nearby dwarfs — visually "the same field minus
 * its tail", which is exactly what we don't want.
 *
 * Absolute magnitude (M = m − 5·log10(d_Mpc) − 25) removes the distance
 * dependence, so a brightest-N cut is a *volume-limited* sample that keeps
 * the catalog's structural backbone intact.  Far massive galaxies stay; near
 * dwarfs go first.
 *
 * ### Why preserve input order in the output?
 *
 * The cross-match dedup downstream pipes `ParsedRecord[]` through a fixed
 * priority order; preserving the original index among the survivors keeps
 * dedup behaviour identical between tiers.  We sort an *index array* by
 * M_abs, take the first N indices, then sort *those* back by their original
 * positions — so the function is order-preserving among the kept records.
 *
 * ### Why drop non-finite records up front?
 *
 * Records with z ≤ 0 (distance undefined) or NaN apparent magnitude can't
 * have a meaningful M_abs.  Including them in the sort would put them at
 * either end depending on whether NaN propagates as larger-or-smaller in
 * v8's comparator (it's "undefined-ordered" — implementation-specific).
 * Filtering first is the only way to get deterministic output.
 *
 * @param records Array of parsed records.  Read-only — the input is not mutated.
 * @param target  Maximum number of records to keep.  ≥ records.length means
 *                "no cut".  0 returns [].  Negative targets are clamped to 0.
 * @returns       A fresh array of the brightest `target` records, in their
 *                original input order.  Records with non-finite mag or
 *                non-positive z are dropped regardless of target.
 */

import { absoluteMagnitude } from '../src/utils/math/absoluteMagnitude.js';
import { redshiftToDistanceMpc } from '../src/utils/math/redshiftToDistanceMpc.js';
import type { ParsedRecord } from './parsers/common.js';

export function subsampleByAbsMag(records: ParsedRecord[], target: number): ParsedRecord[] {
  if (target <= 0) return [];

  // Build (originalIdx, M_abs) tuples for records that have a finite M_abs.
  // NaN-rejected records are simply absent from this array, so they never
  // appear in the output regardless of target.
  const ranked: { idx: number; mAbs: number }[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    if (r.z <= 0 || !Number.isFinite(r.z)) continue;
    if (!Number.isFinite(r.magG)) continue;
    const d = redshiftToDistanceMpc(r.z);
    if (d <= 0 || !Number.isFinite(d)) continue;
    const m = absoluteMagnitude(r.magG, d);
    if (!Number.isFinite(m)) continue;
    ranked.push({ idx: i, mAbs: m });
  }

  // No cut needed if every survivor would be kept anyway.
  if (target >= ranked.length) {
    // Still must return only the survivors (we may have dropped non-finite
    // rows above), in original order.  ranked is already in original order.
    return ranked.map((e) => records[e.idx]!);
  }

  // Sort by brightness (smaller / more-negative M = brighter).  V8's
  // Array.prototype.sort is stable as of ES2019, so ties keep original order.
  ranked.sort((a, b) => a.mAbs - b.mAbs);

  // Keep the first `target`, then re-sort by original index so we return
  // survivors in input order (not brightness order).
  const kept = ranked.slice(0, target);
  kept.sort((a, b) => a.idx - b.idx);
  return kept.map((e) => records[e.idx]!);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/subsampleByAbsMag.test.ts`
Expected: PASS, 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add tools/subsampleByAbsMag.ts tests/tools/subsampleByAbsMag.test.ts
git commit -m "$(cat <<'EOF'
feat(tiers): add pure subsampleByAbsMag brightest-N cut helper

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire the subsampler into `buildAllBins.ts` (emit three `.bin` per tiered source)

**Files:**
- Modify: `tools/buildAllBins.ts`

The current writer loop iterates `bySource` and writes a single `OUT_NAMES[source]` per source. We replace that with: for each (source, tier), look up the per-tier target in `TIER_TARGETS`, run `subsampleByAbsMag` if needed, encode, and write to `tierFilenameForSource(source, tier)`. Sources whose filename is the same across tiers (2MRS, Famous) are deduplicated — we only write them once.

- [ ] **Step 1: Update imports at the top of `tools/buildAllBins.ts`**

Add to the existing import block (after the `Source` import):

```ts
import { TIER_TARGETS, tierFilenameForSource } from '../src/data/tierTargets.js';
import type { Tier } from '../src/@types/Tier.js';
import { subsampleByAbsMag } from './subsampleByAbsMag.js';
```

- [ ] **Step 2: Replace the writer loop in `runCli`**

Locate the existing block in `tools/buildAllBins.ts` (around the end of `runCli`):

```ts
  const OUT_NAMES: Partial<Record<Source, string>> = {
    [Source.SDSS]: 'sdss.bin',
    [Source.TwoMRS]: '2mrs.bin',
    [Source.Glade]: 'glade.bin',
  };

  // Per-source dedup report. ...
  for (const source of [Source.SDSS, Source.TwoMRS, Source.Glade]) {
    ...
  }

  const outDir = args['out-dir']!;
  for (const [source, records] of bySource) {
    const filename = OUT_NAMES[source];
    if (!filename) continue;
    const cloud = recordsToCloud(records);
    const buf = encodePointCloud(cloud);
    const outPath = resolve(outDir, filename);
    writeFileSync(outPath, Buffer.from(buf));
    process.stderr.write(
      `wrote ${cloud.count.toLocaleString()} points to ${outPath} (${buf.byteLength.toLocaleString()} bytes)\n`,
    );
  }
```

Replace the writer loop (the second `for` above) with the per-tier emitter:

```ts
  const outDir = args['out-dir']!;
  const TIERS: readonly Tier[] = ['small', 'medium', 'large'];

  // Track filenames already written this run so the tier-agnostic sources
  // (2MRS, Famous) are only encoded + flushed once.  `tierFilenameForSource`
  // returns the same string for those across all three tiers, so we'd
  // otherwise rewrite the same bytes three times.
  const written = new Set<string>();

  for (const [source, records] of bySource) {
    for (const tier of TIERS) {
      const filename = tierFilenameForSource(source, tier);
      if (written.has(filename)) continue;
      written.add(filename);

      // Apply the tier's per-source target, if any.  Missing key = no cap.
      // 0 = exclude (skip writing this file entirely so the runtime can
      // detect "no data for this tier" via 404 rather than an empty cloud).
      const target = TIER_TARGETS[tier][source];
      if (target === 0) {
        process.stderr.write(`tier ${tier}: ${Source[source]} excluded — skipping ${filename}\n`);
        continue;
      }
      const slice =
        target === undefined ? records : subsampleByAbsMag(records, target);

      const cloud = recordsToCloud(slice);
      const buf = encodePointCloud(cloud);
      const outPath = resolve(outDir, filename);
      writeFileSync(outPath, Buffer.from(buf));
      process.stderr.write(
        `wrote ${cloud.count.toLocaleString()} points to ${outPath} (${buf.byteLength.toLocaleString()} bytes)\n`,
      );
    }
  }
```

Also delete the now-unused `OUT_NAMES` constant.

- [ ] **Step 3: Verify the typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Run a partial build to verify file emission**

Run: `npm run build-all`
Expected: stderr lists per-tier writes — `sdss-medium.bin`, `glade-medium.bin`, `2mrs.bin`, etc. Verify with: `ls -la public/data/*.bin`

You should see `sdss-small.bin` ABSENT (excluded by `target === 0`), `sdss-medium.bin` and `sdss-large.bin` present, three `glade-*.bin` files, one `2mrs.bin`, one `famous.bin`. (Famous comes from `npm run build-famous`; this task does not regress it.)

- [ ] **Step 5: Commit**

```bash
git add tools/buildAllBins.ts
git commit -m "$(cat <<'EOF'
feat(tiers): emit per-tier .bin variants for SDSS and GLADE

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add `.gitignore` entry for `.bin` artefacts

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Inspect current state**

Run: `cat .gitignore` — confirm whether `public/data/*.bin` is already excluded. If yes, skip this task.

- [ ] **Step 2: Append the build artefact glob**

Add at the bottom of `.gitignore`:

```
# Build artefacts — generated by `npm run build-all` into static-host /data/.
# Excluded because (a) tier variants multiply the total to ~12 files at ~120 MB,
# and (b) the build is reproducible from data/raw/* + tools/buildAllBins.ts.
public/data/*.bin
```

- [ ] **Step 3: Verify untracked-but-ignored**

Run: `git status --short public/data/`
Expected: empty output (the .bin files are no longer tracked or appearing as untracked).

If any .bin is currently tracked, run: `git rm --cached public/data/*.bin` before committing.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "$(cat <<'EOF'
chore(tiers): ignore generated .bin artefacts in public/data

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Runtime hot-swap

### Task 5: Tier-aware cloudLoader with abortable per-source re-fetch

**Files:**
- Modify: `src/services/engine/cloudLoader.ts`
- Create: `tests/services/engine/cloudLoader.reload.test.ts`

The new shape:
1. `loadAllClouds(tier, onResult)` — extends the existing function to take a `Tier`. URLs come from `tierFilenameForSource(source, tier)`.
2. `reloadSource(source, tier, onResult)` — fetches a single source's tiered .bin under an `AbortController`, decodes, and calls `onResult`. Maintains a per-source `AbortController` registry so a second call aborts the first.

- [ ] **Step 1: Write the failing reload test**

`tests/services/engine/cloudLoader.reload.test.ts`:

```ts
/**
 * Tests for cloudLoader.reloadSource — the per-source abortable re-fetch
 * driven by `engine.setTier`.
 *
 * The hot-swap path must:
 *   1. Use the tier-aware filename (`sdss-medium.bin`, etc).
 *   2. Cancel any in-flight fetch for that source if reloadSource fires
 *      again before the previous one resolves (user clicking tiers fast).
 *   3. Call onResult exactly once with the latest decoded cloud, never with
 *      a stale buffer from the cancelled request.
 *
 * We stub `globalThis.fetch` rather than running real HTTP — keeps the test
 * pure and lets us deterministically simulate slow/fast races.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadSource } from '../../../src/services/engine/cloudLoader';
import { encodePointCloud } from '../../../src/data/pointCloudFormat';
import { Source } from '../../../src/data/sources';
import type { PointCloud } from '../../../src/@types';

// Build a tiny valid encoded buffer.  Counts encoded into a real .bin so the
// decoder accepts it.
function tinyCloudBuf(count: number): ArrayBuffer {
  const cloud: PointCloud = {
    count,
    objIDs: new BigUint64Array(count),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: new Float32Array(count),
    positionAngleDeg: new Float32Array(count),
    diameterKpc: new Float32Array(count),
  };
  return encodePointCloud(cloud);
}

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('reloadSource', () => {
  it('fetches the tier-suffixed URL for tiered sources', async () => {
    const seenUrls: string[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      seenUrls.push(String(url));
      return new Response(tinyCloudBuf(3), { status: 200 });
    }) as unknown as typeof fetch;

    const onResult = vi.fn();
    await reloadSource(Source.SDSS, 'medium', onResult);

    expect(seenUrls).toEqual(['/data/sdss-medium.bin']);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0]![0]).toMatchObject({
      source: Source.SDSS,
      cloud: expect.objectContaining({ count: 3 }),
    });
  });

  it('uses the shared filename for non-tiered sources (2MRS)', async () => {
    const seenUrls: string[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      seenUrls.push(String(url));
      return new Response(tinyCloudBuf(1), { status: 200 });
    }) as unknown as typeof fetch;

    await reloadSource(Source.TwoMRS, 'small', vi.fn());
    expect(seenUrls).toEqual(['/data/2mrs.bin']);
  });

  it('aborts a prior in-flight fetch if reloadSource fires again for the same source', async () => {
    // First call: never resolves until we explicitly settle it AFTER the abort.
    let firstAborted = false;
    const firstFetch = new Promise<Response>((_resolve, reject) => {
      // We listen on the AbortSignal in the fetch implementation below to set
      // firstAborted = true, then reject so the awaiting promise unwinds.
      // The handler is wired by the fetch mock per-call.
    });

    let firstSignal: AbortSignal | undefined;
    let resolveSecond!: (value: Response) => void;

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === '/data/sdss-small.bin') {
        firstSignal = init?.signal ?? undefined;
        return new Promise<Response>((_, reject) => {
          firstSignal?.addEventListener('abort', () => {
            firstAborted = true;
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
      }
      if (String(url) === '/data/sdss-large.bin') {
        return new Promise<Response>((res) => {
          resolveSecond = res;
        });
      }
      throw new Error(`unexpected url ${url}`);
    }) as unknown as typeof fetch;

    const onResult = vi.fn();
    const p1 = reloadSource(Source.SDSS, 'small', onResult);
    // Kick off the second call before the first settles.
    const p2 = reloadSource(Source.SDSS, 'large', onResult);

    // Settle the second.  reloadSource awaits arrayBuffer(), so we resolve
    // with a real Response carrying a tiny encoded cloud.
    resolveSecond(new Response(tinyCloudBuf(2), { status: 200 }));

    // Both calls return.  p1 should have been aborted (no callback fired);
    // p2 should have produced a single onResult.
    await Promise.allSettled([p1, p2]);

    expect(firstAborted).toBe(true);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0]![0].cloud.count).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/engine/cloudLoader.reload.test.ts`
Expected: FAIL with "reloadSource is not exported" or "is not a function".

- [ ] **Step 3: Add `reloadSource` and tier-aware URL resolution to `cloudLoader.ts`**

Edit `src/services/engine/cloudLoader.ts`. Add these imports near the top with the existing imports:

```ts
import { tierFilenameForSource } from '../../data/tierTargets';
import type { Tier } from '../../@types/Tier';
```

Then replace the existing module-level `SURVEY_FILES` constant (which hard-codes `/data/sdss.bin`, etc.) with a function that builds the list per tier:

```ts
/**
 * Build the per-tier list of survey files to attempt.  Replaces the static
 * SURVEY_FILES constant — different tiers fetch different filenames (see
 * `tierFilenameForSource`).  Sources whose tier-target is 0 (excluded) are
 * dropped from the list entirely so we don't 404-attempt them on startup.
 */
function surveyFilesForTier(tier: Tier): readonly SurveyFile[] {
  const out: SurveyFile[] = [];
  const candidates: { source: Source; cloudSource: CloudSource }[] = [
    { source: Source.SDSS, cloudSource: 'sdss.bin' },
    { source: Source.TwoMRS, cloudSource: '2mrs.bin' },
    { source: Source.Glade, cloudSource: 'glade.bin' },
    { source: Source.Famous, cloudSource: 'famous.bin' },
  ];
  for (const c of candidates) {
    // Excluded tiers (e.g. SDSS in `small`) emit no .bin file — skip the
    // fetch attempt entirely so the network panel stays clean.
    if (TIER_TARGETS[tier][c.source] === 0) continue;
    out.push({ source: c.source, url: `/data/${tierFilenameForSource(c.source, tier)}`, cloudSource: c.cloudSource });
  }
  return out;
}
```

Add the `TIER_TARGETS` import alongside the others:

```ts
import { TIER_TARGETS } from '../../data/tierTargets';
```

Update `loadAllClouds`'s signature and body to accept a tier:

```ts
export async function loadAllClouds(
  tier: Tier,
  onResult: (result: CloudLoadResult) => void,
): Promise<{ loadedCount: number }> {
  const surveyFiles = surveyFilesForTier(tier);
  const wrapped = surveyFiles.map((file) =>
    fetchOne(file)
      .then((r) => {
        onResult(r);
        return r;
      })
      .catch((err) => {
        console.warn(`[cloudLoader] ${file.url} failed:`, err);
        throw err;
      }),
  );

  const results = await Promise.allSettled(wrapped);
  const loadedCount = results.filter((r) => r.status === 'fulfilled').length;
  return { loadedCount };
}
```

Add the `reloadSource` function at the end of the module, before any existing trailing exports:

```ts
/**
 * Per-source AbortController registry.
 *
 * The hot-swap path lets the user click tier buttons faster than a fetch
 * resolves.  Without aborting the prior request, two fetches race each
 * other into `onResult`: the slower one wins (its callback fires last) and
 * stomps the freshly-uploaded buffer with a buffer from the previous tier.
 *
 * Keying by `Source` (not by source × tier) is correct: only one in-flight
 * cloud per source is ever valid.  Switching tiers always invalidates the
 * prior fetch for THIS source — even if it happens to be the same tier
 * (defensive: the user double-clicks "medium").
 */
const inflightControllers = new Map<Source, AbortController>();

/**
 * Re-fetch a single source's .bin for the given tier and dispatch the
 * decoded cloud to `onResult`.  Aborts and discards any in-flight fetch
 * for the same source.  Resolves after the fetch settles (success, abort,
 * or error).
 *
 * Aborted fetches do NOT call `onResult` — the engine's swap orchestrator
 * relies on this to avoid stale uploads.  Network/decode errors are logged
 * and swallowed so a failing tier swap doesn't crash the engine; the user
 * sees the previous tier's data unchanged on screen.
 *
 * Sources whose tier-target is 0 (excluded — e.g. SDSS in `small`) are
 * not fetched; instead `onResult` is called with an empty cloud so the
 * engine's downstream callback chain still fires (and the renderer can
 * tear down the source's GPU buffer to free VRAM).
 */
export async function reloadSource(
  source: Source,
  tier: Tier,
  onResult: (result: CloudLoadResult) => void,
): Promise<void> {
  // Cancel any fetch already running for this source — see registry doc above.
  const prior = inflightControllers.get(source);
  if (prior) prior.abort();

  // Excluded tier: skip the fetch entirely, fire an empty-cloud callback
  // so the engine can clear this source's GPU buffer.
  if (TIER_TARGETS[tier][source] === 0) {
    inflightControllers.delete(source);
    const empty: PointCloud = {
      count: 0,
      objIDs: new BigUint64Array(0),
      positions: new Float32Array(0),
      magU: new Float32Array(0),
      magG: new Float32Array(0),
      magR: new Float32Array(0),
      magI: new Float32Array(0),
      magZ: new Float32Array(0),
      axisRatio: new Float32Array(0),
      positionAngleDeg: new Float32Array(0),
      diameterKpc: new Float32Array(0),
    };
    onResult({
      source,
      cloudSource: cloudSourceFor(source),
      cloud: empty,
    });
    return;
  }

  const controller = new AbortController();
  inflightControllers.set(source, controller);

  const url = `/data/${tierFilenameForSource(source, tier)}`;
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const buf = await res.arrayBuffer();
    // If a newer call has already aborted this controller, drop the result.
    if (controller.signal.aborted) return;
    const cloud = decodePointCloud(buf);
    onResult({ source, cloudSource: cloudSourceFor(source), cloud });
  } catch (err) {
    // AbortError is the expected "user clicked again" path — silent.  Any
    // other error is logged so dev-server 404s show up clearly.
    if ((err as Error).name !== 'AbortError') {
      console.warn(`[cloudLoader] reloadSource ${url} failed:`, err);
    }
  } finally {
    // Only clear if we're still the latest controller — otherwise a more
    // recent reload has already swapped in its own controller.
    if (inflightControllers.get(source) === controller) {
      inflightControllers.delete(source);
    }
  }
}

/**
 * Map a Source to its CloudSource discriminator string.  Centralised so
 * `reloadSource` and `loadAllClouds` agree on the value reported back to
 * the engine, which uses it for status-bar wording.
 */
function cloudSourceFor(source: Source): CloudSource {
  switch (source) {
    case Source.SDSS:
      return 'sdss.bin';
    case Source.TwoMRS:
      return '2mrs.bin';
    case Source.Glade:
      return 'glade.bin';
    case Source.Famous:
      return 'famous.bin';
    default:
      return 'synthetic';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/engine/cloudLoader.reload.test.ts`
Expected: PASS, 3 tests green.

- [ ] **Step 5: Update the existing `loadAllClouds` callers in `engine.ts`**

Find the call site in `src/services/engine/engine.ts` (around line 712):

```ts
const { loadedCount } = await loadAllClouds((result) => {
```

Change to pass the tier (the engine will own a `currentTier` field added in Task 7 — for now wire it to a temporary local default so the codebase still compiles):

```ts
const { loadedCount } = await loadAllClouds(state.sources.tier, (result) => {
```

We don't yet have `state.sources.tier`. Add it now to the existing engine state initialiser. Find the block that sets `visibleMask: DEFAULT_VISIBLE_SOURCE_MASK` (around line 301) and add to that object literal:

```ts
        tier: opts.initialTier ?? 'medium',
```

Add `initialTier` to the engine options. Find the `createEngine(canvas, opts)` signature and the `EngineCallbacks` type. Add to `EngineCallbacks` (in `src/@types/EngineCallbacks.d.ts`) — see Task 6 below for the full callback shape; for this step we only need to extend the engine's local options type:

In `src/services/engine/engine.ts`, locate the `Opts` type (or `EngineCallbacks`-shaped argument) and add:

```ts
  /** Initial data tier to load.  Defaults to 'medium' if absent. */
  initialTier?: Tier;
```

Plus an import at the top:

```ts
import type { Tier } from '../../@types/Tier';
```

Plus the `state.sources.tier` field declaration on the `EngineSourceState` type. In `src/@types/EngineSourceState.d.ts`, add:

```ts
  /** Currently-loaded data tier — drives subsequent setTier diffing. */
  tier: Tier;
```

with the matching import:

```ts
import type { Tier } from './Tier';
```

- [ ] **Step 6: Verify the suite still passes**

Run: `npm test`
Expected: all existing tests still green; the new `cloudLoader.reload.test.ts` continues to pass.

- [ ] **Step 7: Commit**

```bash
git add src/services/engine/cloudLoader.ts src/services/engine/engine.ts src/@types/EngineSourceState.d.ts tests/services/engine/cloudLoader.reload.test.ts
git commit -m "$(cat <<'EOF'
feat(tiers): tier-aware cloudLoader with abortable reloadSource

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Regression test — `pointRenderer.upload()` replaces, never appends

**Files:**
- Modify: `tests/services/gpu/pointRenderer.test.ts`

`pointRenderer.upload(source, cloud)` already destroys the prior buffer (see line 1070 of `pointRenderer.ts`). We add a regression test so a future refactor can't silently change that.

- [ ] **Step 1: Inspect the existing test file to find the right `describe` block**

Run: `head -80 tests/services/gpu/pointRenderer.test.ts`
Identify the existing imports and test pattern (the file already mocks `runBuild` to keep tests off-thread).

- [ ] **Step 2: Add a regression test for buffer replacement**

Append a new `describe` block at the bottom of `tests/services/gpu/pointRenderer.test.ts`:

```ts
describe('PointRenderer.upload — regression: replace, not append', () => {
  it('destroys the prior buffer for a source on second upload', async () => {
    // Build two clouds with different counts so an "append" bug would leave
    // the union (count1 + count2) on the GPU instead of just count2.
    const renderer = await makeTestRenderer(); // existing helper from earlier tests
    const cloudA = makeTestCloud(1000);
    const cloudB = makeTestCloud(500);

    await renderer.upload(Source.SDSS, cloudA);
    const firstBuffer = renderer._loadedSourceForTesting(Source.SDSS)?.buffer;
    expect(firstBuffer).toBeDefined();

    // Spy on the prior buffer's `destroy` so we observe the lifecycle event.
    const destroySpy = vi.spyOn(firstBuffer!, 'destroy');

    await renderer.upload(Source.SDSS, cloudB);
    expect(destroySpy).toHaveBeenCalledTimes(1);

    // Bookkeeping reflects the second upload's count, not the sum.
    expect(renderer._loadedSourceForTesting(Source.SDSS)?.count).toBe(500);
  });
});
```

If `makeTestRenderer`, `makeTestCloud`, or `_loadedSourceForTesting` don't exist yet, port the helpers from the surrounding tests in the same file (look for the existing `upload`-based test for the canonical pattern). The `_loadedSourceForTesting` accessor exposes the internal `clouds.get(source)` map; if a hook doesn't already exist, expose one as `(this as unknown as { clouds: Map<Source, LoadedSource> }).clouds.get(source)` inline rather than mutating the production class.

- [ ] **Step 3: Run the test**

Run: `npm test -- tests/services/gpu/pointRenderer.test.ts`
Expected: PASS — the `destroy` is called exactly once on the prior buffer, count reflects only the second upload.

- [ ] **Step 4: Commit**

```bash
git add tests/services/gpu/pointRenderer.test.ts
git commit -m "$(cat <<'EOF'
test(tiers): regression — pointRenderer.upload replaces, never appends

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Engine `setTier(tier)` orchestrator

**Files:**
- Modify: `src/services/engine/engine.ts`
- Modify: `src/@types/EngineHandle.d.ts`
- Modify: `src/@types/EngineCallbacks.d.ts`

- [ ] **Step 1: Extend `EngineHandle` and `EngineCallbacks` types**

In `src/@types/EngineHandle.d.ts`, add the import + method:

```ts
import type { Tier } from './Tier';
```

Inside the `EngineHandle` type (alongside `setLodMode?`, `setSourceVisible?`, etc.):

```ts
  /**
   * Hot-swap the active data tier.  For each source whose tier-target differs
   * between the current and next tier, the engine cancels any in-flight cloud
   * fetch (via cloudLoader's AbortController registry) and re-fetches the
   * tier-suffixed .bin.  Sources whose target is unchanged are left alone —
   * 2MRS and Famous use one shared file across all tiers, so they never
   * re-fetch.
   *
   * Fires `onTierChange` synchronously after `state.sources.tier` mutates so
   * React state mirrors engine truth.  Re-fetches resolve asynchronously and
   * each lands via the existing `onCloudReady` callback.
   *
   * No-op if `tier` equals the current tier.
   */
  setTier?: (tier: Tier) => void;
```

In `src/@types/EngineCallbacks.d.ts`, add the echo callback:

```ts
import type { Tier } from './Tier';
```

```ts
  /**
   * Echo: fires when the active data tier changes.  Used by App.tsx to keep
   * its `currentTier` state in sync.  Same lifecycle pattern as
   * `onLodModeChange`.
   */
  onTierChange?: (tier: Tier) => void;
```

- [ ] **Step 2: Implement `setTier` on the engine handle**

In `src/services/engine/engine.ts`, locate the handle's existing `setLodMode` / `setSourceVisible` block and add `setTier` next to them:

```ts
    setTier(tier) {
      if (tier === state.sources.tier) return;
      const prevTier = state.sources.tier;
      state.sources.tier = tier;
      cb.onTierChange?.(tier);

      // For each source, decide whether the new tier needs a re-fetch.
      // - target unchanged across the two tiers (incl. both undefined)  → skip
      // - target changed                                                → reload
      // The reload path also covers the "exclude → include" transition: target
      // 0 in the new tier triggers `reloadSource`'s empty-cloud branch, which
      // tells the renderer to release this source's GPU buffer.
      for (const source of [Source.SDSS, Source.TwoMRS, Source.Glade, Source.Famous]) {
        const prevTarget = TIER_TARGETS[prevTier][source];
        const nextTarget = TIER_TARGETS[tier][source];
        if (prevTarget === nextTarget) continue;

        // Use the same onResult pipeline as the initial load so the swapped
        // cloud goes through the same upload-chain serialisation, the same
        // `clouds.set`, the same `onCloudReady` echo, and the same render
        // wake-up — keeping HEALPix re-weight + Schechter ratio re-bake
        // identical to first-load behaviour.
        reloadSource(source, tier, (result) => {
          if (!state.gpu.renderer) return;

          // Empty cloud (excluded source): tear down the GPU buffer instead
          // of uploading zero points.  The renderer's `clouds.get(...).destroy`
          // path is the existing replace-not-append guarantee — passing a
          // 0-count cloud still goes through `upload`, which destroys the
          // prior buffer and allocates a 0-byte one.  The shader's per-source
          // draw skip handles count===0.
          state.gpu.renderer.upload(result.source, result.cloud).catch((err) => {
            console.error(`[engine.setTier] upload failed for source ${result.source}:`, err);
          });
          state.sources.clouds.set(result.source, result.cloud);
          cb.onCloudReady?.(result.source, result.cloud.count);
          state.subsystems.scheduler.requestRender();
        });
      }
    },
```

Ensure `reloadSource` and `TIER_TARGETS` are imported at the top of the file:

```ts
import { reloadSource } from './cloudLoader';
import { TIER_TARGETS } from '../../data/tierTargets';
```

- [ ] **Step 3: Verify the typecheck and existing tests still pass**

Run: `npm run typecheck && npm test`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/@types/EngineHandle.d.ts src/@types/EngineCallbacks.d.ts src/services/engine/engine.ts
git commit -m "$(cat <<'EOF'
feat(tiers): engine.setTier(tier) orchestrator

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Confirm HEALPix angular re-weight + Schechter re-bake on swap

**Files:**
- Create: `tests/services/engine/computeAngularWeights.rebake.test.ts`

`computeAngularWeights` and `computeSchechterRatios` are baked into the interleaved buffer inside `pointRenderer.upload(source, cloud)`. When `setTier` calls `upload`, the bake runs against the *new* cloud — so the weights are inherently per-tier. We add a regression test so a future refactor that hoists the bake out of `upload` (e.g. to share weights between tiers) can't silently break this.

- [ ] **Step 1: Write the regression test**

`tests/services/engine/computeAngularWeights.rebake.test.ts`:

```ts
/**
 * Regression: the HEALPix angular re-weight is computed against the
 * currently-loaded cloud.  After a tier swap drops or adds galaxies, the
 * weights MUST re-bake against the new (smaller / larger) cloud — never
 * carry over from the previous tier.
 *
 * This test is a structural assertion: feeding two different clouds through
 * `computeAngularWeights` produces two different weight arrays.  If a future
 * refactor caches weights in a way that survives a cloud swap (e.g. keyed
 * solely by source enum value, ignoring point-count), this test will trip.
 */

import { describe, expect, it } from 'vitest';
import { computeAngularWeights } from '../../../src/services/engine/computeAngularWeights';
import { Source } from '../../../src/data/sources';
import type { PointCloud } from '../../../src/@types';

function syntheticCloud(count: number, seedOffset: number): PointCloud {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Deterministic spread across the unit sphere at varying radii so the
    // HEALPix binning is non-trivial.  seedOffset shifts the radial pattern
    // so the two test clouds have meaningfully different shell histograms.
    const t = (i + seedOffset) / count;
    positions[i * 3 + 0] = Math.cos(t * Math.PI * 2) * (50 + t * 100);
    positions[i * 3 + 1] = Math.sin(t * Math.PI * 2) * (50 + t * 100);
    positions[i * 3 + 2] = (t - 0.5) * 200;
  }
  return {
    count,
    objIDs: new BigUint64Array(count),
    positions,
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: new Float32Array(count),
    positionAngleDeg: new Float32Array(count),
    diameterKpc: new Float32Array(count),
  };
}

describe('computeAngularWeights — re-bake on cloud swap', () => {
  it('produces a fresh weight array sized to the new cloud', () => {
    const big = syntheticCloud(2_000, 0);
    const small = syntheticCloud(500, 0);

    const wBig = computeAngularWeights(big, Source.Glade);
    const wSmall = computeAngularWeights(small, Source.Glade);

    expect(wBig.length).toBe(2_000);
    expect(wSmall.length).toBe(500);
  });

  it('produces different weights for two clouds with different distributions', () => {
    const a = syntheticCloud(1_000, 0);
    const b = syntheticCloud(1_000, 333);

    const wA = computeAngularWeights(a, Source.Glade);
    const wB = computeAngularWeights(b, Source.Glade);

    // The arrays must differ at at least one index; if they were identical,
    // the bake would not be cloud-dependent.
    let anyDiff = false;
    for (let i = 0; i < wA.length; i++) {
      if (wA[i] !== wB[i]) {
        anyDiff = true;
        break;
      }
    }
    expect(anyDiff).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm test -- tests/services/engine/computeAngularWeights.rebake.test.ts`
Expected: PASS, 2 tests green. (No production change needed — this test documents the existing behaviour.)

If `computeAngularWeights`'s real export shape differs (e.g. returns `{ weights }` instead of a bare `Float32Array`), adapt the test's expectations to the existing signature; the structural assertions (length-matches-input, two-clouds-differ) stand regardless.

- [ ] **Step 3: Commit**

```bash
git add tests/services/engine/computeAngularWeights.rebake.test.ts
git commit -m "$(cat <<'EOF'
test(tiers): regression — angular weights re-bake against new cloud on swap

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — UI

### Task 9: `initialTierFromViewport(width)` pure helper

**Files:**
- Create: `src/utils/initialTierFromViewport.ts`
- Create: `tests/utils/initialTierFromViewport.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/utils/initialTierFromViewport.test.ts`:

```ts
/**
 * Tests for initialTierFromViewport — pure function chosen by App.tsx at
 * mount time to seed the tier state.
 *
 * Rule: width < 768px → 'small' (mobile); ≥ 768px → 'medium'.  'large' is
 * never auto-selected — too many points for an unaware user, opt-in only via
 * the panel.
 */

import { describe, expect, it } from 'vitest';
import { initialTierFromViewport } from '../../src/utils/initialTierFromViewport';

describe('initialTierFromViewport', () => {
  it('returns small below the 768px breakpoint', () => {
    expect(initialTierFromViewport(320)).toBe('small');
    expect(initialTierFromViewport(767)).toBe('small');
  });

  it('returns medium at and above 768px', () => {
    expect(initialTierFromViewport(768)).toBe('medium');
    expect(initialTierFromViewport(1920)).toBe('medium');
    expect(initialTierFromViewport(4096)).toBe('medium');
  });

  it('treats non-finite width as medium (defensive default)', () => {
    expect(initialTierFromViewport(Number.NaN)).toBe('medium');
    expect(initialTierFromViewport(Number.POSITIVE_INFINITY)).toBe('medium');
  });

  it('treats zero or negative width as small (mobile-side bias)', () => {
    expect(initialTierFromViewport(0)).toBe('small');
    expect(initialTierFromViewport(-100)).toBe('small');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/utils/initialTierFromViewport.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the helper**

`src/utils/initialTierFromViewport.ts`:

```ts
/**
 * initialTierFromViewport — choose the runtime tier from the browser viewport
 * width at engine startup.
 *
 * ### Why pure (and not driven by feature detection)?
 *
 * Viewport width is an honest proxy for "is this a phone-class device?".
 * `navigator.deviceMemory`, `hardwareConcurrency`, and the GPU adapter info
 * are either unreliable cross-browser, gated by Permissions-Policy, or both.
 * The 768px breakpoint matches Bootstrap/Tailwind's `md` boundary — common
 * enough that users intuitively expect "tablet and up" to behave like a
 * desktop.
 *
 * 'large' is intentionally never auto-selected: the full 3.5M-point catalog
 * stresses integrated GPUs and the user should opt-in.
 *
 * ### Defensive edge cases
 *
 * - NaN / Infinity → 'medium'.  `window.innerWidth` should never produce
 *   these in practice, but a defensive default keeps a faulty embedding
 *   (`<iframe width="auto">` in some host) from picking 'small' silently.
 * - 0 / negative   → 'small'.  Conservatively mobile-leaning when the
 *   viewport reports junk; a phone in landscape with a stale DOM read
 *   may transiently report 0.
 */

import type { Tier } from '../@types/Tier';

const MOBILE_BREAKPOINT_PX = 768;

export function initialTierFromViewport(width: number): Tier {
  if (!Number.isFinite(width)) return 'medium';
  if (width <= 0) return 'small';
  return width < MOBILE_BREAKPOINT_PX ? 'small' : 'medium';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/utils/initialTierFromViewport.test.ts`
Expected: PASS, 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/initialTierFromViewport.ts tests/utils/initialTierFromViewport.test.ts
git commit -m "$(cat <<'EOF'
feat(tiers): add initialTierFromViewport pure helper

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: `<TierSelector>` segmented-control component

**Files:**
- Create: `src/components/SettingsPanel/TierSelector.tsx`
- Create: `src/components/SettingsPanel/TierSelector.module.css`
- Create: `tests/components/SettingsPanel/TierSelector.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/components/SettingsPanel/TierSelector.test.ts`:

```ts
/**
 * Tests for TierSelector — three-button segmented control at the top of the
 * Settings panel.
 *
 * vitest runs in node env (no DOM lib).  We test the static-render branches
 * via renderToStaticMarkup, mirroring the CollapsibleSection test pattern.
 * Click handling is verified manually against the dev server.
 */

import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TierSelector } from '../../../src/components/SettingsPanel/TierSelector';

describe('TierSelector', () => {
  it('renders all three tier labels', () => {
    const html = renderToStaticMarkup(
      createElement(TierSelector, { tier: 'medium', onTierChange: vi.fn() }),
    );
    expect(html).toContain('Small');
    expect(html).toContain('Medium');
    expect(html).toContain('Large');
  });

  it('marks the currently-selected tier as pressed (aria-pressed=true)', () => {
    const html = renderToStaticMarkup(
      createElement(TierSelector, { tier: 'large', onTierChange: vi.fn() }),
    );
    // Three buttons; only one with aria-pressed="true".
    const trueMatches = html.match(/aria-pressed="true"/g) ?? [];
    expect(trueMatches.length).toBe(1);
    // The "true" pressed button must be the Large one — we encode this by
    // putting `data-tier="<value>"` on each button.
    expect(html).toMatch(/data-tier="large"[^>]*aria-pressed="true"/);
  });

  it('renders Small as pressed when tier=small', () => {
    const html = renderToStaticMarkup(
      createElement(TierSelector, { tier: 'small', onTierChange: vi.fn() }),
    );
    expect(html).toMatch(/data-tier="small"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-tier="medium"[^>]*aria-pressed="false"/);
    expect(html).toMatch(/data-tier="large"[^>]*aria-pressed="false"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/SettingsPanel/TierSelector.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the component**

`src/components/SettingsPanel/TierSelector.tsx`:

```tsx
/**
 * TierSelector — three-button segmented control for hot-swapping the data
 * tier (small / medium / large).
 *
 * ### Why a segmented control instead of a dropdown?
 *
 * Three options are the segmented-control sweet spot.  All three tier names
 * stay visible at all times so the user can see "I'm on medium; large costs
 * more" without opening a menu.  Dropdowns would also imply "this is a
 * minor setting"; the tier switcher is the most consequential control on
 * the panel and deserves prominent placement at the top.
 *
 * ### Why aria-pressed and not a radio group?
 *
 * Buttons with `aria-pressed` give us toggle semantics with explicit
 * activation per click, which matches the user mental model (each click
 * triggers a network re-fetch + GPU re-upload).  A radio group's keyboard
 * arrow-navigation would silently fire reloads on every arrow press,
 * which is the wrong cost model for what's behind the button.
 *
 * ### Stateless by design
 *
 * App.tsx owns `tier`; this component only renders the current value and
 * fires `onTierChange` on click.  Same one-way data flow as the rest of
 * SettingsPanel.
 */

import type { Tier } from '../../@types/Tier';
import styles from './TierSelector.module.css';

type Props = {
  /** The currently-active tier — drives which button is `aria-pressed=true`. */
  tier: Tier;
  /** Called with the new tier when the user clicks one of the three buttons. */
  onTierChange: (tier: Tier) => void;
};

/**
 * Per-button labels in the order they render left-to-right.  Ordered
 * smallest → largest so the visual reading matches the data-volume axis.
 */
const TIER_BUTTONS: readonly { tier: Tier; label: string }[] = [
  { tier: 'small', label: 'Small' },
  { tier: 'medium', label: 'Medium' },
  { tier: 'large', label: 'Large' },
];

export function TierSelector({ tier, onTierChange }: Props): React.ReactElement {
  return (
    <div className={styles.row} role="group" aria-label="Data tier">
      {TIER_BUTTONS.map((b) => {
        const pressed = b.tier === tier;
        return (
          <button
            key={b.tier}
            type="button"
            data-tier={b.tier}
            aria-pressed={pressed}
            className={pressed ? styles.buttonActive : styles.button}
            onClick={() => {
              if (b.tier !== tier) onTierChange(b.tier);
            }}
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}
```

`src/components/SettingsPanel/TierSelector.module.css`:

```css
/*
 * TierSelector layout — three equal-width buttons sharing one row at the top
 * of the Settings panel body.  The styling mirrors the panel's existing
 * glassmorphic chrome: subtle border, soft background, brighter active state.
 */

.row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin-bottom: 12px;
}

.button,
.buttonActive {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.78);
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: 4px;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease,
    border-color 0.12s ease;
}

.button:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.92);
}

.buttonActive {
  background: rgba(120, 180, 255, 0.18);
  border-color: rgba(120, 180, 255, 0.55);
  color: rgba(220, 235, 255, 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/components/SettingsPanel/TierSelector.test.ts`
Expected: PASS, 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsPanel/TierSelector.tsx src/components/SettingsPanel/TierSelector.module.css tests/components/SettingsPanel/TierSelector.test.ts
git commit -m "$(cat <<'EOF'
feat(tiers): add TierSelector segmented-control component

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Wire `<TierSelector>` into SettingsPanel + App.tsx

**Files:**
- Modify: `src/components/SettingsPanel/SettingsPanel.tsx`
- Modify: `src/components/App/App.tsx`

- [ ] **Step 1: Add `tier` + `onTierChange` props to SettingsPanel**

In `src/components/SettingsPanel/SettingsPanel.tsx`, add the import at the top:

```ts
import { TierSelector } from './TierSelector';
import type { Tier } from '../../@types/Tier';
```

Add to the `Props` type (alongside `visibleSourceMask` etc.):

```ts
  /** Currently-active data tier ('small' | 'medium' | 'large'). */
  tier?: Tier;
  /** Called with the new tier when the user clicks a tier button. */
  onTierChange?: (tier: Tier) => void;
```

Add to the destructure list at the start of `function SettingsPanel(...)`:

```ts
  tier,
  onTierChange,
```

Add a gate flag near the other `showXxx` consts:

```ts
  // Tier selector: rendered only when both pieces wired by the parent.  Same
  // opt-in idiom as every other optional section in this panel.
  const showTierSelector = tier !== undefined && onTierChange !== undefined;
```

In the render body, find the opening of the `<Panel title="Settings" ...>` body — the comment block that starts with `── Section grouping ──`. Insert the TierSelector at the very top of the body, BEFORE the first `CollapsibleSection`:

```tsx
      {showTierSelector && (
        <TierSelector tier={tier!} onTierChange={onTierChange!} />
      )}
```

- [ ] **Step 2: Wire App.tsx state + plumbing**

In `src/components/App/App.tsx`, add the imports:

```ts
import type { Tier } from '../../@types/Tier';
import { initialTierFromViewport } from '../../utils/initialTierFromViewport';
```

Add the state hook alongside the other `useState` declarations (near `lodMode`):

```ts
  // ── Data tier (small / medium / large) ─────────────────────────────────
  //
  // Seeded from the viewport width at mount via `initialTierFromViewport`:
  //   < 768px → 'small'  (mobile)
  //   ≥ 768px → 'medium' (default)
  // 'large' is never auto-selected — opt-in only via the panel.
  //
  // Echoed by the engine via `onTierChange` so React mirrors engine truth
  // (same lifecycle pattern as `lodMode` and `visibleSourceMask`).
  // Lazy-init: `window` is only safe to read inside the initializer
  // callback, since SSR hosts (in unit tests) might not have it.
  const [currentTier, setCurrentTier] = useState<Tier>(() =>
    typeof window !== 'undefined' ? initialTierFromViewport(window.innerWidth) : 'medium',
  );
```

Pass the initial tier into `createEngine` (find the `createEngine(canvas, { ... })` block):

```ts
    const handle = createEngine(canvas, {
      // ... existing callbacks ...
      onTierChange: setCurrentTier,
      // ... existing callbacks continue ...
      initialTier: currentTier,
    });
```

(Place `initialTier` next to other init-time options if any; otherwise just drop it at the end of the callbacks object — the engine option type accepts it after Task 5.)

Pass `tier` + `onTierChange` to the SettingsPanel:

```tsx
        <SettingsPanel
          // ... existing props ...
          tier={currentTier}
          onTierChange={(t) => handleRef.current?.setTier?.(t)}
        />
```

(Insert near the other `setXxx` forwarders, e.g. next to `onResetCamera`.)

- [ ] **Step 3: Verify typecheck + manual UI smoke**

Run: `npm run typecheck`
Expected: green.

The dev server (`npm run dev`) is already running — load `http://localhost:5173/` in a browser. The Settings panel should now show the three SMALL / MEDIUM / LARGE buttons at the top, with MEDIUM (or SMALL on a narrow window) pre-selected. Clicking another tier should trigger network requests for the corresponding `<source>-<tier>.bin` files (visible in DevTools Network panel) and the visible point count in the StatsPanel should change after the GPU bake completes.

- [ ] **Step 4: Verify the existing test suite still green**

Run: `npm test`
Expected: all tests green; no new failures introduced by the prop additions.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsPanel/SettingsPanel.tsx src/components/App/App.tsx
git commit -m "$(cat <<'EOF'
feat(tiers): wire TierSelector into SettingsPanel + App state

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Deploy plumbing

### Task 12: Document the deploy workflow + verify build-tiers script

**Files:**
- Modify: `package.json`
- Modify: `CLAUDE.md` (a single sentence under "Commands" — minimal change)

The existing `build-all` script already emits all three tiers after Task 3's edit. We add a friendlier alias `build-tiers` so the deploy story is documented.

- [ ] **Step 1: Add the alias script**

In `package.json`'s `"scripts"` block, add:

```json
    "build-tiers": "tsx tools/buildAllBins.ts",
```

(Position it alphabetically near `build-all`; the two are equivalent — `build-tiers` is the user-facing name now that subsampling is part of the pipeline.)

- [ ] **Step 2: Document the workflow in CLAUDE.md**

In `/Users/rulkens/Development/js/skymap/CLAUDE.md`, find the existing "Commands" block and add one line under it:

```markdown
npm run build-tiers # alias for build-all — emits per-tier .bin variants
```

Below the existing "Data pipeline (mental model)" section, add a short subsection:

```markdown
### Deploy workflow (Firebase static hosting)

1. `npm run build-tiers` — regenerates all `public/data/*.bin` (12 tier-suffixed variants for SDSS + GLADE; one shared `2mrs.bin` and `famous.bin`).
2. `npm run build-filaments` (if filaments need rebuilding).
3. `npm run deploy` — runs `npm run build && firebase deploy --only hosting`.

The `.bin` files are intentionally not in git (`public/data/*.bin` is gitignored). Each deploy ships freshly-built artefacts so tier targets are always in sync with the latest `tools/buildAllBins.ts` settings.
```

- [ ] **Step 3: Verify the script runs**

Run: `npm run build-tiers`
Expected: same output as `npm run build-all` — stderr lists all per-tier writes; the only thing that changed is the script name.

- [ ] **Step 4: Verify the suite is still green**

Run: `npm test && npm run typecheck`
Expected: green across the board.

- [ ] **Step 5: Commit**

```bash
git add package.json CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(tiers): add build-tiers script alias and deploy workflow note

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review log

Spec coverage check:

- (1) GPU-bound goal via on-screen-instance reduction — Task 2 (subsampleByAbsMag), Task 3 (build emits subsampled bins), Task 7 (engine.setTier replaces buffers).
- (2) Hot-swap, no reload — Task 5 (reloadSource with AbortController), Task 7 (setTier orchestrator).
- (3) No localStorage; viewport-derived initial tier — Task 9 (initialTierFromViewport), Task 11 (App seeds state from window.innerWidth).
- (4) Volume-limited absolute-magnitude cut — Task 2 (uses `absoluteMagnitude` from `src/utils/math/absoluteMagnitude.ts` and `redshiftToDistanceMpc`).
- (5) Static hosting; bins not in git — Task 4 (.gitignore), Task 12 (deploy doc).
- (6) Filaments shared across tiers — no task needed (existing `loadFilaments` fetches `/data/filaments.bin` unconditionally; nothing in this plan touches it). Confirmed by reading `cloudLoader.ts` lines 287-297.
- (7) HEALPix re-weight per-tier — Task 8 (regression test confirms upload re-bakes against new cloud).
- Three buttons at top of SettingsPanel — Task 10 (component), Task 11 (placement).
- Tier targets table — Task 1.
- `setTier` on EngineHandle — Task 7.
- `onTierChange` callback — Task 7.
- `pointRenderer.upload` replace-not-append regression — Task 6.
- `package.json` script — Task 12.

Placeholder scan: every step has either runnable code, an exact file edit, or a concrete verify command. No `TBD` / `implement later` / `add appropriate error handling` strings present.

Type consistency check:
- `Tier = 'small' | 'medium' | 'large'` — used identically in Tasks 1, 5, 7, 9, 10, 11.
- `TIER_TARGETS: Record<Tier, Partial<Record<Source, number>>>` — Tasks 1, 3, 5, 7.
- `tierFilenameForSource(source, tier)` — Tasks 1, 3, 5.
- `subsampleByAbsMag(records, target)` — defined Task 2, consumed Task 3.
- `reloadSource(source, tier, onResult)` — defined Task 5, consumed Task 7.
- `setTier(tier: Tier): void` — defined Task 7 on `EngineHandle`, called Task 11 from App.
- `onTierChange?: (tier: Tier) => void` — defined Task 7 on `EngineCallbacks`, wired Task 11 in App.
- `initialTierFromViewport(width: number) => Tier` — defined Task 9, called Task 11.
- `<TierSelector>` props `{ tier: Tier; onTierChange: (t: Tier) => void }` — defined Task 10, used Task 11.

All names match.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-05-data-tiers.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration. Use `superpowers:subagent-driven-development`.

**2. Inline Execution** — execute tasks in this session with checkpoint reviews. Use `superpowers:executing-plans`.

**Which approach?**
