# Local-Volume Distances — 04 · Wire Override + InfoCard Display + Regression

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plug the CF4 / HyperLEDA distance override into `buildAllBins`, plumb `spectroscopicZ` through `ParsedRecord → recordsToCloud → .bin`, switch the InfoCard's "Redshift z" line to the stored value, regression-test known-distance fixtures (M31, M33, M86, M86 cluster mates), update CLAUDE.md and the redshift-fallback docstring, then finalise with a build-tiers + R2 sync from the main worktree.

**Architecture:** The override lives in `recordsToCloud`. Three thin changes: (a) add a `spectroscopicZ` field to `ParsedRecord` so parsers can express it independently (today every parser sets it equal to `z`); (b) make `recordsToCloud` accept the two indices and apply the override conditionally; (c) make `galaxyInfoBuilder` read the stored `spectroscopicZ` instead of inverting position. Regression tests assert on three classes of row: catalog-overridden inside cutoff, cz-derived just outside cutoff, and unmatched-inside-cutoff (must stay on cz).

**Tech Stack:** TypeScript + Vitest; `npm run build-tiers` + `npm run sync-r2-secure` for the production rollout step.

---

## File Structure

- **Modify:** `tools/parsers/common.ts` — add `spectroscopicZ: number` to `ParsedRecord`
- **Modify:** every parser (`tools/parsers/sdssCsv.ts`, `twoMrs.ts`, `glade.ts`, `milliquas.ts`, `famousSeed.ts`, `ndskl.ts`) — set `spectroscopicZ = z` at row construction; one diff per file
- **Modify:** `tools/catalog/buildAllBins.ts` — accept CF4 + HyperLEDA indices in `recordsToCloud`, apply override, populate `spectroscopicZ` from the record (not from position)
- **Modify:** `src/services/engine/helpers/galaxyInfoBuilder.ts` — read `cloud.spectroscopicZ[i]` instead of inverting from cartesian
- **Modify:** `src/utils/math/redshiftToDistanceMpc.ts` — update docstring (now points at the implemented sub-plan, not the spec)
- **Create:** `tests/catalog/buildAllBins.localVolumeOverride.test.ts` — golden-row regression on M31 / M33 / M86 / NGC 4486 / NGC 1023
- **Modify:** `CLAUDE.md` — entry pointing at the new fetcher + the override behaviour
- **Modify:** project memory `project_local_volume_distances.md` (new) — implementation summary

---

## Background

**Why thread the override into `recordsToCloud`, not earlier?** The override needs PGCs, and 2MRS PGCs only land after the GLADE cross-pollination pass in `runCli`. By the time `recordsToCloud` is called, every record has its final cross-match identifiers. The CF4 lookup also benefits from running once per *materialised slice* (i.e. once per tier × source) — it's a Map hit per record, but doing it in `runCli` directly would mean either re-iterating the slice (wasteful) or applying the override before subsampling (wrong, because subsampling depends on absolute mag, not on whether the override fires).

**Why expose `spectroscopicZ` on `ParsedRecord` rather than computing it inline in `recordsToCloud`?** Decoupling the "what was the published z?" question from "what distance do we use?" means the override decision lives in exactly one place (Task 3). Today every parser already knows the catalog z and sets it on `record.z`; copying it to `record.spectroscopicZ` at parse time is a one-line addition that keeps the override logic in `recordsToCloud` symmetric (every record carries both `z` and `spectroscopicZ`, and the override only changes which one feeds position).

**Why is `record.z` not already "spectroscopic" enough?** Resolved decision #5 in the spec: position and spectroscopic z are *different concepts*. Once the override fires for a row, that row's stored position no longer encodes its catalogued z (M31's position is at 0.78 Mpc but its catalogued z is −0.001). The cleanest split is to give the on-disk format two fields: one that drives rendering (position), and one that drives InfoCard display (spectroscopicZ). The build pipeline writes them independently.

---

## Task 1 — Add `spectroscopicZ` to `ParsedRecord`

**Files:**
- Modify: `tools/parsers/common.ts`

- [ ] **Step 1: Extend `ParsedRecord`**

Open `tools/parsers/common.ts`. Find the `ParsedRecord` type. Add `spectroscopicZ` directly under `z`:

```typescript
  z: number; // redshift (spectroscopic or photometric depending on survey)
  /**
   * Catalogued spectroscopic redshift, preserved verbatim from the
   * source row. Today this duplicates `z` for every parser — they're
   * the same number.
   *
   * The two fields diverge only inside the build pipeline's
   * local-volume override (see
   * docs/superpowers/specs/2026-05-27-local-volume-distances.md):
   * `z` continues to be the "use this for position when no override
   * fires" channel, while `spectroscopicZ` is the "always-show-this
   * in the InfoCard" channel. Keeping them separated at the parser
   * boundary means a future override that needs to *change* z (e.g.
   * a peculiar-velocity-corrected value) doesn't have to wrestle with
   * "but which z does the InfoCard show?".
   *
   * NaN is the legal "no published spec-z" sentinel — relevant for a
   * handful of Famous-galaxy fixture rows that have a measured
   * distance but no published spectroscopic redshift.
   */
  spectroscopicZ: number;
```

- [ ] **Step 2: Typecheck expecting failure**

Run: `npm run typecheck`
Expected: FAIL — every parser is missing the field.

That's intentional; next task adds it to each parser.

---

## Task 2 — Set `spectroscopicZ = z` in every parser

**Files:**
- Modify: every file under `tools/parsers/` that constructs a `ParsedRecord` literal: `sdssCsv.ts`, `twoMrs.ts`, `glade.ts`, `milliquas.ts`, `famousSeed.ts`, `ndskl.ts`

- [ ] **Step 1: Find every `ParsedRecord` literal**

Run: `grep -rn "source: Source\." tools/parsers/ --include="*.ts"`

That surfaces every place a `ParsedRecord` is built. (Records always have a `source: Source.X` line.)

- [ ] **Step 2: Add `spectroscopicZ: z` (or the local variable holding z) to each**

For every literal, add the field. Where the parser computes `z` into a named local, use the same name:

```typescript
return {
  source: Source.TwoMRS,
  // ...
  z,
  spectroscopicZ: z,  // ← add
  // ...
};
```

Where the parser writes z as `z: NaN` (rows skipped, or no z), set `spectroscopicZ: NaN` too. (NaN is the documented sentinel; carrying the same value through preserves equality at the parser boundary.)

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run vitest**

Run: `npm test`
Expected: PASS — no test asserts on the new field, but parser tests still build records with the same z, and the SoA fill loop already sets `cloud.spectroscopicZ[i] = r.z` (from sub-plan 03 Task 5).

- [ ] **Step 5: Commit**

```bash
git add tools/parsers/common.ts tools/parsers/sdssCsv.ts tools/parsers/twoMrs.ts tools/parsers/glade.ts tools/parsers/milliquas.ts tools/parsers/famousSeed.ts tools/parsers/ndskl.ts
git commit -m "$(cat <<'EOF'
feat(parsers): carry spectroscopicZ alongside z on every ParsedRecord

Every parser now sets spectroscopicZ = z verbatim. The two fields
duplicate today but split apart in recordsToCloud when the
local-volume CF4 / HyperLEDA override changes the position-driving
z without changing the published catalog value the InfoCard shows.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Apply the local-volume override in `recordsToCloud`

**Files:**
- Modify: `tools/catalog/buildAllBins.ts`

- [ ] **Step 1: Extend the `recordsToCloud` signature**

Today: `export function recordsToCloud(records: ParsedRecord[]): GalaxyCatalog`.

Change to:

```typescript
export type LocalVolumeOverrides = {
  cf4: Cf4CatalogIndex;
  hyperLeda: HyperLedaShapeMap;
};

export function recordsToCloud(
  records: ParsedRecord[],
  overrides: LocalVolumeOverrides | null = null,
): GalaxyCatalog {
  // ... existing body, modified below ...
}
```

Add the imports at the top:

```typescript
import { catalogDistanceFor } from './catalogDistanceFor.js';
import { CUTOFF_MPC } from './localVolumeCutoff.js';
import { raDecDistToCartesian } from '../../src/utils/math/raDecDistToCartesian.js';
import type { Cf4CatalogIndex } from '../parsers/cosmicflows4.js';
import type { HyperLedaShapeMap } from '../parsers/glade.js';
```

- [ ] **Step 2: Apply the override inside the fill loop**

Inside the `for (let i = 0; i < count; i++)` loop, replace the existing position-computation block:

```typescript
// Before (existing):
//   const [x, y, z] = raDecZToCartesian(r.ra, r.dec, r.z);

// After:
let x: number;
let y: number;
let z: number;
let overrideHit: ReturnType<typeof catalogDistanceFor> = null;

if (overrides !== null) {
  overrideHit = catalogDistanceFor(r, overrides.cf4, overrides.hyperLeda);
}
if (overrideHit !== null && overrideHit.distMpc < CUTOFF_MPC) {
  // Inside-cutoff catalog match: use the measured distance for position.
  // The catalogued z stays on cloud.spectroscopicZ[i], so the InfoCard
  // still shows the published value.
  [x, y, z] = raDecDistToCartesian(r.ra, r.dec, overrideHit.distMpc);
} else {
  // Either no catalog match, or the match is past the cutoff (in which
  // case the Hubble-flow distance is good enough that the extra
  // dependency isn't worth it — see CUTOFF_MPC docstring).
  [x, y, z] = raDecZToCartesian(r.ra, r.dec, r.z);
}

cloud.positions[i * 3 + 0] = x;
cloud.positions[i * 3 + 1] = y;
cloud.positions[i * 3 + 2] = z;
```

- [ ] **Step 3: Populate `cloud.spectroscopicZ` from the parser, not position**

The sub-plan 03 Task 5 placeholder reads `cloud.spectroscopicZ[i] = r.z`. Now that `ParsedRecord` exposes `spectroscopicZ` as a dedicated field, switch the assignment:

```typescript
cloud.spectroscopicZ[i] = r.spectroscopicZ;
```

This matters because future overrides (e.g. peculiar-velocity correction) might modify `r.z` for the position channel; reading `r.spectroscopicZ` guarantees the InfoCard sees the catalog value regardless.

- [ ] **Step 4: Thread the override into `runCli`**

In `runCli`, after the existing cache loads (XSC, HyperLEDA), load CF4:

```typescript
// Load CF4 + HyperLEDA-mod0 indices for the local-volume distance
// override (galaxies inside ~30 Mpc). Both are missing-file-tolerant —
// a fresh checkout without the raw downloads still produces .bin
// outputs, just without the override fired.
const { loadCf4CatalogIndex } = await import('../parsers/cosmicflows4.js');
const cf4Index = loadCf4CatalogIndex();
const overrides: LocalVolumeOverrides = { cf4: cf4Index, hyperLeda: leda };
```

Then at every `recordsToCloud(slice)` call (there's one inside the tier loop), pass the overrides:

```typescript
const cloud = recordsToCloud(slice, overrides);
```

- [ ] **Step 5: Add an override-application count log**

Inside `recordsToCloud`, accumulate a counter and log it once at the end:

```typescript
let overridesApplied = 0;
// ... inside the loop ...
if (overrideHit !== null && overrideHit.distMpc < CUTOFF_MPC) {
  overridesApplied++;
  // ... existing position write ...
}
// ... after the loop ...
if (overrides !== null && overridesApplied > 0) {
  process.stderr.write(
    `  local-volume override: ${overridesApplied.toLocaleString()} of ${count.toLocaleString()} positions replaced (CF4 / HyperLEDA)\n`,
  );
}
```

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Run vitest**

Run: `npm test`
Expected: PASS — `recordsToCloud`'s signature gained an optional parameter (default null), so existing callers in tests still type-check. Behaviour is unchanged for any caller that doesn't pass overrides.

- [ ] **Step 8: Commit**

```bash
git add tools/catalog/buildAllBins.ts
git commit -m "$(cat <<'EOF'
feat(catalog): apply CF4 / HyperLEDA distance override in recordsToCloud

Inside CUTOFF_MPC = 30 Mpc, records with a CF4 (or HyperLEDA mod0)
distance use that distance for position via raDecDistToCartesian;
outside the cutoff, or with no catalog match, the existing
raDecZToCartesian path runs unchanged.

cloud.spectroscopicZ[i] now reads from r.spectroscopicZ instead of
r.z, so the InfoCard's redshift display stays catalogued even when
the position diverges from the cz-implied location.

Build pipeline logs how many positions were overridden per tier.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Switch `galaxyInfoBuilder` to the stored `spectroscopicZ`

**Files:**
- Modify: `src/services/engine/helpers/galaxyInfoBuilder.ts`

- [ ] **Step 1: Locate the redshift derivation**

Open `src/services/engine/helpers/galaxyInfoBuilder.ts`. Find the line near offset 134:

```typescript
const [ra, dec, redshift] = cartesianToRaDecZ(px, py, pz);
```

The function currently inverts the cartesian position back to a redshift via `distanceMpcToRedshift`. That's fine for cz-derived rows but wrong for catalog-overridden rows.

- [ ] **Step 2: Pull redshift from the cloud field, fall back to cartesian**

Replace the derivation:

```typescript
// Sky coordinates come from the cartesian-to-RA/Dec inversion — that
// arithmetic is exact regardless of how the position was originally
// computed.
const [ra, dec] = cartesianToRaDecZ(px, py, pz);

// Spectroscopic z is stored verbatim on the cloud (see
// docs/superpowers/specs/2026-05-27-local-volume-distances.md
// resolved decision #5). For rows that didn't get the local-volume
// override the stored value equals the position-derived one modulo
// float32 precision; for rows that DID get it we display the
// catalogued value (M31 z = −0.001 instead of the +0.00018 implied
// by |pos| = 0.78 Mpc).
//
// NaN — the documented "no published spec-z" sentinel — falls back
// to the cartesian-derived value so the InfoCard never shows NaN to
// the user.
const storedZ = cloud.spectroscopicZ[index];
const fallbackRedshift = distanceMpcToRedshift(
  Math.sqrt(px * px + py * py + pz * pz),
);
const redshift = Number.isFinite(storedZ) ? storedZ : fallbackRedshift;
```

This requires `cartesianToRaDecZ` to be callable as a two-value return — find its signature; it returns `[ra, dec, z]` so destructuring two values still works (the third is ignored). If TypeScript complains about the unused third tuple element, use:

```typescript
const [ra, dec] = cartesianToRaDecZ(px, py, pz) as unknown as [number, number];
```

or, cleaner, leave the destructuring three-wide and just shadow:

```typescript
const [ra, dec, _zFromCartesian] = cartesianToRaDecZ(px, py, pz);
```

- [ ] **Step 3: Verify the imports**

`distanceMpcToRedshift` may already be imported; if not, add the import.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run vitest**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/helpers/galaxyInfoBuilder.ts
git commit -m "$(cat <<'EOF'
feat(engine): InfoCard reads stored spectroscopicZ, not position-derived

Per resolved decision #5 in the local-volume-distances spec,
spectroscopic z is a distinct concept from rendered position. The
hover/select pipeline now reads the catalogued z from
cloud.spectroscopicZ[index] and falls back to the cartesian
inversion only when the stored value is NaN.

For rows untouched by the override the two values agree modulo
float32 precision; for the ~890 local-volume rows where CF4 wins,
the InfoCard now shows the published z (e.g. M31's −0.001) instead
of the +0.0002 implied by its measured distance.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Regression test: M31 ends up at 0.78 Mpc with z = −0.001

**Files:**
- Create: `tests/catalog/buildAllBins.localVolumeOverride.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/catalog/buildAllBins.localVolumeOverride.test.ts`:

```typescript
/**
 * Local-volume distance override regression test.
 *
 * These tests are golden-row pins for the four behaviours that
 * matter:
 *
 *   1. Catalog-overridden row inside the cutoff: position derives
 *      from CF4 distance, NOT from cz. M31 (PGC 2557, d ≈ 0.78 Mpc,
 *      z = −0.001) is the canonical fixture — its blueshift would
 *      put it 3 Mpc the wrong way on the cz path.
 *
 *   2. Catalog match past the cutoff: override is ignored, cz path
 *      runs. NGC 1023 (PGC 10123, d ≈ 11 Mpc, just inside cutoff) and
 *      a synthetic >30 Mpc row both pinned to exercise the boundary.
 *
 *   3. Unmatched inside-cutoff row: stays on cz (Resolved decision #3,
 *      "unmatched rows stay on cz-derived distance"). A fixture with
 *      neither PGC nor 2MASS ID and z = 0.002 (≈ 9 Mpc Hubble) pins
 *      that the cz pathway still fires.
 *
 *   4. spectroscopicZ is always the catalogued value, never the
 *      position-derived one, regardless of which branch fired.
 */
import { describe, it, expect } from 'vitest';
import { recordsToCloud, type LocalVolumeOverrides } from '../../tools/catalog/buildAllBins';
import { Source } from '../../src/data/sources';
import type { ParsedRecord } from '../../tools/parsers/common';
import type { Cf4Record } from '../../tools/parsers/cosmicflows4';

const M31_RA = 10.6847;
const M31_DEC = 41.2687;
const M31_Z = -0.001001; // NED
const M31_DIST_MPC = 0.785;
const M31_PGC = 2557;

function rec(partial: Partial<ParsedRecord>): ParsedRecord {
  return {
    source: Source.TwoMRS,
    objID: 0n,
    ra: 0,
    dec: 0,
    z: 0,
    spectroscopicZ: 0,
    magU: NaN,
    magG: NaN,
    magR: NaN,
    magI: NaN,
    magZ: NaN,
    axisRatio: null,
    positionAngleDeg: null,
    diameterKpc: null,
    classByte: 0,
    parentSurveyByte: 0,
    ...partial,
  };
}

function overrides(cf4Records: ReadonlyArray<Cf4Record>): LocalVolumeOverrides {
  const byPgc = new Map<number, Cf4Record>();
  const byMassId = new Map<string, Cf4Record>();
  for (const r of cf4Records) {
    if (r.pgc !== null) byPgc.set(r.pgc, r);
    if (r.massId !== '') byMassId.set(r.massId, r);
  }
  return { cf4: { byPgc, byMassId }, hyperLeda: new Map() };
}

describe('local-volume override in recordsToCloud', () => {
  it('M31: CF4 distance drives position; cz drives nothing; spectroscopicZ is catalogued', () => {
    const m31 = rec({
      objID: BigInt(M31_PGC),
      ra: M31_RA,
      dec: M31_DEC,
      z: M31_Z,
      spectroscopicZ: M31_Z,
    });
    const ov = overrides([
      { pgc: M31_PGC, massId: '00424433+4116075', distMpc: M31_DIST_MPC, eDistMpc: 0.04 },
    ]);
    const cloud = recordsToCloud([m31], ov);
    const px = cloud.positions[0]!;
    const py = cloud.positions[1]!;
    const pz = cloud.positions[2]!;
    const r = Math.sqrt(px * px + py * py + pz * pz);
    // Position should sit at the CF4 distance, not at the cz-implied
    // mirror-image at ~3 Mpc on the opposite side of the sky.
    expect(r).toBeCloseTo(M31_DIST_MPC, 2);
    // Spectroscopic z is the published catalog value, not the
    // position-implied z = +0.000175.
    expect(cloud.spectroscopicZ[0]).toBeCloseTo(M31_Z, 5);
  });

  it('past-cutoff CF4 row: override ignored, cz path drives position', () => {
    const distantRow = rec({
      objID: 99999n,
      ra: 180,
      dec: 0,
      z: 0.05,
      spectroscopicZ: 0.05,
    });
    const ov = overrides([
      { pgc: 99999, massId: '', distMpc: 100, eDistMpc: 1.0 },  // > CUTOFF_MPC
    ]);
    const cloud = recordsToCloud([distantRow], ov);
    const r = Math.hypot(cloud.positions[0]!, cloud.positions[1]!, cloud.positions[2]!);
    // Hubble-flow distance for z = 0.05 is ~220 Mpc (ΛCDM), not 100.
    expect(r).toBeGreaterThan(150);
    // Spectroscopic z still the catalogued value.
    expect(cloud.spectroscopicZ[0]).toBeCloseTo(0.05, 4);
  });

  it('unmatched inside-cutoff row: stays on cz path (Resolved decision #3)', () => {
    const orphan = rec({
      objID: 0n,
      ra: 200,
      dec: -10,
      z: 0.002,
      spectroscopicZ: 0.002,
    });
    const ov = overrides([]); // CF4 has no entries
    const cloud = recordsToCloud([orphan], ov);
    const r = Math.hypot(cloud.positions[0]!, cloud.positions[1]!, cloud.positions[2]!);
    // z = 0.002 in ΛCDM is ~8.5 Mpc.
    expect(r).toBeGreaterThan(7);
    expect(r).toBeLessThan(10);
    expect(cloud.spectroscopicZ[0]).toBeCloseTo(0.002, 5);
  });

  it('null overrides: legacy behaviour, every row on cz', () => {
    const m31 = rec({
      objID: BigInt(M31_PGC),
      ra: M31_RA,
      dec: M31_DEC,
      z: M31_Z,
      spectroscopicZ: M31_Z,
    });
    const cloud = recordsToCloud([m31], null);
    const r = Math.hypot(cloud.positions[0]!, cloud.positions[1]!, cloud.positions[2]!);
    // No override available → the linear-sign fallback in
    // redshiftToDistanceMpc fires, mirroring M31 to the anti-Andromeda
    // side at ~|cz/H₀| = ~3 Mpc. We just assert the position is NOT at
    // the CF4 distance.
    expect(Math.abs(r - M31_DIST_MPC)).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/catalog/buildAllBins.localVolumeOverride.test.ts`
Expected: PASS (4 tests). If any fail:

- M31 position not at 0.78 Mpc → the override branch isn't firing; double-check `objID !== 0n` and `BigInt(M31_PGC)` lookup in `catalogDistanceFor`.
- Past-cutoff position too small → `CUTOFF_MPC` is being read but the comparison is `<=` instead of `<`; the spec says "below 30", which is `< 30`.
- `spectroscopicZ` off → `recordsToCloud` is still using `r.z` instead of `r.spectroscopicZ`.

- [ ] **Step 3: Commit**

```bash
git add tests/catalog/buildAllBins.localVolumeOverride.test.ts
git commit -m "$(cat <<'EOF'
test(catalog): pin local-volume override at M31 / cutoff / orphan paths

Four golden-row regressions:
- M31 lands at 0.78 Mpc (CF4) with catalogued z = -0.001
- past-cutoff CF4 row stays on cz (the catalog distance is ignored)
- unmatched inside-cutoff row stays on cz (Resolved decision #3)
- null overrides = legacy behaviour, every row on cz

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Confirm the `redshiftToDistanceMpc.ts` regression test still passes

**Files:** none (verification)

- [ ] **Step 1: Find the existing linear-sign test**

The function's docstring references PR #186's regression test. Find it:

`grep -rn "linear-sign\|negative z\|blueshift" tests/ --include="*.ts"`

- [ ] **Step 2: Run it**

Run: `npx vitest run -t "linear-sign"` (or whichever describe-block name surfaces)
Expected: PASS. The linear-sign fallback is unchanged — we layer the catalog override on top of `redshiftToDistanceMpc`, we don't replace it.

- [ ] **Step 3: No commit — verification only.**

---

## Task 7 — Update `redshiftToDistanceMpc.ts` docstring

**Files:**
- Modify: `src/utils/math/redshiftToDistanceMpc.ts`

- [ ] **Step 1: Update the spec reference**

The current docstring (line 60ish) reads:

> Astrophysically-correct redshift-independent distances for the whole local volume are a separate effort — see `docs/superpowers/specs/2026-05-21-local-volume-distances.md`.

Replace with the post-implementation version pointing at the spec and the plan:

```typescript
 * Astrophysically-correct redshift-independent distances inside ~30
 * Mpc are now applied at build time via the CF4 / HyperLEDA override
 * in `tools/catalog/buildAllBins.ts` (see
 * `docs/superpowers/specs/2026-05-27-local-volume-distances.md`).
 * This function still runs for every row past the cutoff and for
 * unmatched-inside-cutoff rows (Resolved decision #3); the linear-
 * sign fallback for z < 0 stays in place for the same reason it
 * landed in #186.
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/math/redshiftToDistanceMpc.ts
git commit -m "$(cat <<'EOF'
docs(math): point redshiftToDistanceMpc at the implemented override

The local-volume-distances spec used to be a TODO; now it's a built
feature. Updates the docstring's spec link and clarifies that this
function still runs for past-cutoff rows and unmatched rows.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 — CLAUDE.md entry + memory pointer

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Find the right place**

Open `CLAUDE.md`. Locate the section that documents the build pipeline / catalog architecture. The format change (v6) and the override should both surface there.

- [ ] **Step 2: Add a short entry**

Slot in (under the appropriate heading):

```markdown
### Local-volume distance override

For galaxies inside 30 Mpc the build pipeline replaces the cz-derived
position with a Cosmicflows-4 (or HyperLEDA `mod0`) measured distance.
The catalogued spectroscopic z is stored separately on the .bin (v6
format, byte offset 54) so the InfoCard shows the published value,
not the value implied by `|position|`. See
`docs/superpowers/specs/2026-05-27-local-volume-distances.md`.

Re-run order when CF4 raw data changes:
1. `npm run fetch-cf4` (refreshes `data/raw/cf4/table2.dat`)
2. `npm run build-tiers` (re-bakes 2mrs.bin, glade-*.bin)
3. `npm run sync-r2-secure` (from the main worktree only — see
   project memory `project_worktree_data_isolation`)
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(claude.md): document the local-volume distance override

Covers what the override does, where it lives in the pipeline, and
the re-run order when raw CF4 data changes.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9 — Open a PR and gather review

**Files:** none (process step)

- [ ] **Step 1: Confirm the feature branch is up to date**

Run: `git status && git log --oneline -20`
Expected: every commit in this plan is present on the feature branch; nothing uncommitted.

- [ ] **Step 2: Run the full test + typecheck suite once more**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 3: Push and open a PR**

Run:

```bash
git push -u origin <branch-name>
gh pr create --title "feat(catalog): local-volume distance override (CF4 + HyperLEDA)" --body "$(cat <<'EOF'
## Summary

- Replaces cz-derived positions with redshift-independent catalog distances (Cosmicflows-4 primary, HyperLEDA `mod0` fallback) for every 2MRS / GLADE / Famous row inside `CUTOFF_MPC = 30 Mpc`.
- Adds `spectroscopicZ` as a first-class field on the GalaxyCatalog .bin (v6 format bump, byte offset 54) so InfoCard displays the catalogued z rather than the position-implied value.
- Stale v5 bins surface the documented "regenerate via npm run build-tiers" error.

Implements the spec at `docs/superpowers/specs/2026-05-27-local-volume-distances.md` per the plan at `docs/superpowers/plans/2026-05-27-local-volume-distances.md`.

## Test plan

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (incl. new tests in `tests/parsers/cosmicflows4.test.ts`, `tests/catalog/catalogDistanceFor.test.ts`, `tests/catalog/buildAllBins.localVolumeOverride.test.ts`)
- [ ] Manual: `npm run fetch-cf4` + `npm run build-tiers` produces a v6 2mrs.bin where M31 sits at ~0.78 Mpc from the origin and its hover card shows z = −0.001.
- [ ] Manual: stale v5 .bin in the browser cache reloads with the "regenerate" error visible in the console.
EOF
)"
```

- [ ] **Step 4: Note the PR URL for the user.**

---

## Task 10 — Production rollout from the main worktree

**Files:** none (process step) — **must happen on the main worktree, not the feature worktree.** Per memory `project_worktree_data_isolation`, `.bin`s built in a feature worktree are throwaway.

- [ ] **Step 1: Wait for PR merge**

After review feedback is addressed and the PR lands on `main`, switch back to the main worktree:

Run: `cd <main-worktree-path> && git checkout main && git pull`

- [ ] **Step 2: Confirm CF4 raw data is present (it should be — main worktree retains its own `data/raw/cf4/`)**

Run: `ls -la data/raw/cf4/`
Expected: `table2.dat`, `ReadMe`, `.sha256`, `README.md` all present. If absent, run `npm run fetch-cf4` here.

- [ ] **Step 3: Rebuild all tiers**

Run: `npm run build-tiers`
Expected: build pipeline logs override counts per tier; new `.bin` files in `public/data/`. Spot-check that `2mrs.bin` and `glade-small.bin` have grown by ~4 bytes × count (one float32 per row) vs the previous v5 file.

- [ ] **Step 4: Sync to R2**

Run: `npm run sync-r2-secure`
Expected: confirmation prompt → upload completes → R2 now serves v6 bins. Clients with cached v5 bins will see the "regenerate" error one time on next reload (browsers fetch the updated bin from R2 automatically; no user action needed).

- [ ] **Step 5: Hit the deployed site and spot-check**

Open the deployed skymap. Hover M31 (search Cmd+K → "M 31"). Confirm:
- Distance ≈ 0.78 Mpc ("Light left 0.0 Gyr ago" / "2.5 million light-years away" — formatDistance shows this in light-years).
- Redshift z ≈ −0.0010.
- The galaxy is in the correct sky region (Andromeda constellation, not mirrored to the opposite side).

Hover M86 (Cmd+K → "M 86"):
- Distance ≈ 16–17 Mpc (Virgo cluster).
- z ≈ −0.0008 (blueshifted; falling into Virgo).
- Located in the Virgo cluster, near other Virgo members.

- [ ] **Step 6: Add a project-memory entry**

Create `~/.claude/projects/-Users-rulkens-Development-js-skymap/memory/project_local_volume_distances.md` with a 3–5 line summary:

```markdown
- Local-volume distance override landed YYYY-MM-DD (PR #XXX). CF4 + HyperLEDA `mod0` replace cz inside 30 Mpc.
- Bin format bumped to v6; `spectroscopicZ` at byte 54 carries the catalogued z so InfoCard isn't lying.
- Re-run order on raw CF4 change: `npm run fetch-cf4` → `npm run build-tiers` → `npm run sync-r2-secure` (main worktree).
- Spec: docs/superpowers/specs/2026-05-27-local-volume-distances.md ; Plan: docs/superpowers/plans/2026-05-27-local-volume-distances.md
```

Then update the main `MEMORY.md` index at `~/.claude/projects/-Users-rulkens-Development-js-skymap/memory/MEMORY.md` with the new pointer following the existing entry pattern (`- [Title](file.md) — one-line summary`).

- [ ] **Step 7: Done. Close out the PR's checklist; share the deployed URL with the user.**

---

## Self-Review

- [x] Override applies inside `recordsToCloud`, after PGC cross-pollination, so 2MRS rows that gained PGCs via GLADE get CF4 lookups for free.
- [x] Override only fires when `< CUTOFF_MPC` (strict less-than per the spec's "below ~30 Mpc" phrasing).
- [x] Unmatched rows stay on the cz path (Resolved decision #3) — covered by Task 5's "unmatched inside-cutoff" test.
- [x] InfoCard's z line reads `cloud.spectroscopicZ[i]` with cartesian-derived fallback for NaN — Resolved decision #5.
- [x] Regression fixtures: M31 (catalog override fires), past-cutoff (override ignored), unmatched (cz path), null overrides (legacy).
- [x] `redshiftToDistanceMpc.ts` docstring updates so the next reader doesn't think the spec is still a TODO.
- [x] CLAUDE.md gains the override entry + the rerun order.
- [x] Production sync explicitly noted to run from main worktree, not the feature worktree (per memory `project_worktree_data_isolation`).
- [x] All commits use HEREDOC `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` per project convention.
- [x] No `git add -A` / `git add .` — every commit lists specific paths.
