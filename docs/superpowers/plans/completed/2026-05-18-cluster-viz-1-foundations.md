# Cluster / Supercluster / Void Visualization — Foundations (1/4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the type-level + pure-function foundations the upcoming three cluster-viz sub-plans (at-rest viz, pick + camera focus, member isolation focus mode) will build on. After this plan the codebase contains every new symbol the later plans import, but no rendering or runtime behavior changes.

**Architecture:** Three POI source codes (5/6/7) are appended to the `Source` enum and stay deliberately *out* of `ALL_SOURCES`. `unpackPick` becomes a discriminated union returning either `{kind:'galaxy'}` or one of three POI variants. The runtime-computed `crosshairSizeMpc` derivation in `wireSlots.ts` is replaced with literal `physicalRadiusMpc` values populated on the anchor tables in `clusterAnchors.ts` (with literature citations). A pure `clusterMembership` cone-search lives in `src/utils/cluster/` with no caching of its own. A `FocusState` type is created but NOT yet wired into `EngineState` — that's plan 4's job.

**Tech Stack:** TypeScript, Vitest. No WebGPU, WESL, React, or Vite plugin changes in this sub-plan.

**Sub-plan series:**
- **(1/4) this plan** — foundations: types, enums, pure utilities
- (2/4) at-rest viz — halo + ring renderers
- (3/4) pick + camera focus — clickability, camera tweens
- (4/4) focus mode — focus uniforms, focus subsystem, shader edits + `EngineState.focus` wiring

**Spec reference:** `docs/superpowers/specs/2026-05-18-cluster-supercluster-viz-design.md`

**Definition of done:** `npm run typecheck && npm test && npm run build` all pass; no visual or behavioral change in `npm run dev`; the new symbols are importable from the locations the spec's §7 file inventory lists.

---

## Phase 1: Source enum extension

### Task 1.1: Append POI source codes to the `Source` enum

**Files:**
- Modify: `src/data/sources.ts`
- Test: `tests/data/sources.test.ts` (confirm path — create if absent)

- [ ] **Step 1: Confirm whether the source test file exists**

Run: `ls tests/data/sources.test.ts 2>/dev/null || echo "ABSENT"`

If it prints `ABSENT`, create the file with the full structure shown in Step 4 below. Otherwise add only the new `describe('POI source codes', ...)` block.

- [ ] **Step 2: Write the failing test — POI source codes exist with the right values**

Append (or create) this `describe` block in `tests/data/sources.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  Source,
  ALL_SOURCES,
  ALL_VISIBLE_MASK,
  maskHas,
  maskWith,
  maskWithout,
} from '../../src/data/sources';

describe('Source enum — POI codes (cluster/supercluster/void)', () => {
  it('appends Cluster=5, Supercluster=6, Void=7 to the enum', () => {
    expect(Source.Cluster).toBe(5);
    expect(Source.Supercluster).toBe(6);
    expect(Source.Void).toBe(7);
  });

  it('keeps POI codes OUT of ALL_SOURCES (POIs are not survey sources)', () => {
    // The points-pipeline visibility bitmask iterates ALL_SOURCES. POIs
    // render through their own renderer (future clusterMarkerRenderer)
    // with its own per-category visibility logic, so listing them here
    // would muddy the meaning of "this bitmask filters survey galaxies."
    expect(ALL_SOURCES).not.toContain(Source.Cluster);
    expect(ALL_SOURCES).not.toContain(Source.Supercluster);
    expect(ALL_SOURCES).not.toContain(Source.Void);
  });

  it('ALL_VISIBLE_MASK still covers only survey sources (no POI bits)', () => {
    // Pre-POI mask = bits 0..4 set = 0b11111 = 31. POI codes (5/6/7)
    // must remain unset so the survey draw loop doesn't accidentally
    // gate on them.
    expect(ALL_VISIBLE_MASK).toBe(0b11111);
    expect(maskHas(ALL_VISIBLE_MASK, Source.Cluster)).toBe(false);
    expect(maskHas(ALL_VISIBLE_MASK, Source.Supercluster)).toBe(false);
    expect(maskHas(ALL_VISIBLE_MASK, Source.Void)).toBe(false);
  });

  it('bitmask helpers still operate correctly on survey-source bits', () => {
    // Sanity: the bitmask infrastructure isn't disturbed by appending
    // new enum members that don't participate in the mask.
    expect(maskHas(maskWith(0, Source.SDSS), Source.SDSS)).toBe(true);
    expect(maskHas(maskWithout(ALL_VISIBLE_MASK, Source.Glade), Source.Glade)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- tests/data/sources.test.ts`
Expected: FAIL — `Source.Cluster`, `Source.Supercluster`, `Source.Void` are `undefined` on the enum object.

- [ ] **Step 4: Append the three POI source codes**

Edit `src/data/sources.ts`. After the `Famous: 4,` entry in the `Source` const object (around line 92), insert:

```ts
  /**
   * POI-only — used for pick encoding, no .bin file representation,
   * deliberately excluded from `ALL_SOURCES`.
   *
   * Galaxy-cluster anchors (Virgo, Coma, Norma, ...). Picks against a
   * cluster's marker ring return source code 5 in the upper 5 bits of
   * the packed identity; the 27-bit `localIdx` carries the POI's index
   * into the cluster table. See `selectionEncoding.ts` for the layout
   * and `docs/superpowers/specs/2026-05-18-cluster-supercluster-viz-design.md`
   * §6.2 for the per-category allocation rationale.
   */
  Cluster: 5,
  /**
   * POI-only — used for pick encoding, no .bin file representation,
   * deliberately excluded from `ALL_SOURCES`.
   *
   * Supercluster anchors (Hydra Wall, Hercules SC, ...). Same encoding
   * scheme as Cluster, distinct source code so the pick result is
   * self-describing without an extra category lookup.
   */
  Supercluster: 6,
  /**
   * POI-only — used for pick encoding, no .bin file representation,
   * deliberately excluded from `ALL_SOURCES`.
   *
   * Void anchors (Sculptor Void, Local Void, Boötes Void). Same
   * encoding scheme as Cluster / Supercluster.
   */
  Void: 7,
```

Important: **do NOT add these to `ALL_SOURCES`, `LABELS`, `ALL_SKY`, `MAX_DIST_MPC`, or `BAND_LABELS`** — they're not survey sources, and the existing `Record<Source, ...>` tables would otherwise require entries that don't make semantic sense (e.g. "all-sky" for a cluster is undefined).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/data/sources.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`

Expected: PASS. If errors appear about `LABELS`/`ALL_SKY`/`MAX_DIST_MPC`/`BAND_LABELS` requiring entries for the new keys, that means TypeScript inferred `Record<Source, ...>` strictly — re-read the file to confirm those tables use `Record<Source, T>`. If they do, the fix is **not** to add POI entries; instead change the table type from `Record<Source, T>` to a partial / explicit-key shape that only lists survey sources. The simplest local fix: change the type annotations from `Record<Source, T>` to `Partial<Record<Source, T>>` and add a runtime fallback in the public accessor functions (`sourceLabel`, `sourceIsAllSky`, `sourceMaxDistanceMpc`, `bandLabels`) so an unknown POI source returns a sensible default ('—' for label, false for all-sky, 0 for max distance, the SDSS band labels for bands). However, before making that change, prefer the simpler approach:

Most likely the cleanest fix is to keep `Record<Source, T>` and explicitly fall through for POI codes by handling them in each accessor — e.g.:

```ts
export function sourceLabel(source: Source): string {
  if (source === Source.Cluster) return 'Cluster';
  if (source === Source.Supercluster) return 'Supercluster';
  if (source === Source.Void) return 'Void';
  return LABELS[source];
}
```

… and change the table types to `Record<Exclude<Source, typeof Source.Cluster | typeof Source.Supercluster | typeof Source.Void>, T>` (this preserves exhaustiveness over survey sources). Pick whichever fix typechecks fastest; the constraint that matters is the test in Step 2 must still pass after the fix.

- [ ] **Step 7: Commit**

```bash
git add src/data/sources.ts tests/data/sources.test.ts
git commit -m "$(cat <<'EOF'
feat(sources): append POI codes (Cluster=5, Supercluster=6, Void=7)

Appended to the Source enum following the 'append, never recycle' rule.
Deliberately excluded from ALL_SOURCES (POIs render through their own
renderer with their own visibility logic) and from the survey-keyed
LABELS/ALL_SKY/MAX_DIST_MPC/BAND_LABELS tables.

Foundations sub-plan for the cluster-viz redesign — see
docs/superpowers/specs/2026-05-18-cluster-supercluster-viz-design.md
§6.2 for the allocation rationale.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: `unpackPick` discriminated-union refactor

### Task 2.1: Add `PickResult` type and new dispatch

**Files:**
- Modify: `src/data/selectionEncoding.ts`
- Modify: `tests/data/selectionEncoding.test.ts`

- [ ] **Step 1: Write the failing test — `unpackPick` returns the new discriminated union**

In `tests/data/selectionEncoding.test.ts`, add a new `describe` block at the end (after the existing TS↔WESL parity block):

```ts
import { Source } from '../../src/data/sources';
import type { PickResult } from '../../src/data/selectionEncoding';

describe('unpackPick — discriminated union for POI categories', () => {
  // Helper: produce the raw pick texture value the picker would write
  // for a given (sourceCode, localIdx) pair. The picker offsets by
  // PICK_SENTINEL_OFFSET (+1); unpackPick reverses that.
  function rawFor(sourceCode: number, localIdx: number): number {
    return ((packSelection(sourceCode, localIdx) + PICK_SENTINEL_OFFSET) >>> 0);
  }

  it('returns kind:galaxy for codes 0..4 (survey sources)', () => {
    const cases: Array<[number, Source]> = [
      [0, Source.Synthetic],
      [1, Source.SDSS],
      [2, Source.TwoMRS],
      [3, Source.Glade],
      [4, Source.Famous],
    ];
    for (const [code, sourceEnum] of cases) {
      const result = unpackPick(rawFor(code, 42));
      expect(result).toEqual<PickResult>({
        kind: 'galaxy',
        source: sourceEnum,
        localIdx: 42,
      });
    }
  });

  it('returns kind:cluster for code 5', () => {
    const result = unpackPick(rawFor(5, 7));
    expect(result).toEqual<PickResult>({ kind: 'cluster', poiIndex: 7 });
  });

  it('returns kind:supercluster for code 6', () => {
    const result = unpackPick(rawFor(6, 0));
    expect(result).toEqual<PickResult>({ kind: 'supercluster', poiIndex: 0 });
  });

  it('returns kind:void for code 7', () => {
    const result = unpackPick(rawFor(7, 2));
    expect(result).toEqual<PickResult>({ kind: 'void', poiIndex: 2 });
  });

  it('returns null for raw==0 (cleared pick texture)', () => {
    expect(unpackPick(0)).toBeNull();
  });

  it('returns null for source code 31 (the all-ones sentinel band)', () => {
    // The sentinel itself (0xFFFFFFFF) decodes to source=31, localIdx=…;
    // any value with source=31 must return null defensively.
    expect(unpackPick(0xffffffff)).toBeNull();
  });

  it('logs a warning and returns null for unallocated codes 8..30', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Pick a few representative unallocated codes — full sweep would be
      // overkill; spot-check the boundaries plus a middle value.
      for (const code of [8, 15, 30]) {
        const result = unpackPick(rawFor(code, 0));
        expect(result).toBeNull();
      }
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
```

Add `import { vi } from 'vitest';` to the existing top-of-file Vitest import (extend the existing `import { describe, it, expect } from 'vitest';` line).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/data/selectionEncoding.test.ts`
Expected: FAIL — `PickResult` is not exported; the old `unpackPick` returns `{source, localIdx}` not the discriminated union; the old impl does not handle code 31 or codes 8..30 as null.

- [ ] **Step 3: Add `PickResult` type and refactor `unpackPick`**

In `src/data/selectionEncoding.ts`, add the import + new type + refactored function. Replace the existing `unpackPick` (the last function in the file) with:

```ts
import { Source } from './sources';

/**
 * Decoded pick-buffer result. Discriminator `kind` says which of the
 * five categories the hit was, and the payload shape differs per kind:
 *
 *   - 'galaxy'     — a survey-galaxy hit. Carries the Source enum +
 *                    the per-source local index.
 *   - 'cluster'    — a cluster POI hit. Carries the POI index into
 *                    the cluster anchor table.
 *   - 'supercluster' — same as cluster, but for supercluster anchors.
 *   - 'void'       — same as cluster, but for void anchors.
 *
 * The discriminated-union shape forces callers to switch on `kind`
 * (rather than read a magic source-code number) — the type system
 * surfaces every new POI variant at every call site the moment a
 * category is added. See spec §6.2 for the per-category allocation
 * rationale and §7.2 for the call-site impact (`wireInput.ts`).
 */
export type PickResult =
  | { readonly kind: 'galaxy'; readonly source: Source; readonly localIdx: number }
  | { readonly kind: 'cluster'; readonly poiIndex: number }
  | { readonly kind: 'supercluster'; readonly poiIndex: number }
  | { readonly kind: 'void'; readonly poiIndex: number };

/**
 * Decode a raw r32uint pick-buffer value into the canonical
 * {@link PickResult} discriminated union, or `null` for "no hit".
 *
 * The raw value carries the picker's `+ PICK_SENTINEL_OFFSET` (so the
 * cleared-zero background remains distinguishable from a legitimate
 * source=0/localIdx=0 hit); this function reverses both that offset
 * and the (sourceCode << 27) | localIdx layout, then dispatches on
 * the 5-bit source code:
 *
 *   - 0..4  → galaxy hit (Synthetic, SDSS, TwoMRS, Glade, Famous)
 *   - 5     → cluster POI
 *   - 6     → supercluster POI
 *   - 7     → void POI
 *   - 8..30 → unallocated; log a defensive warning and return null
 *   - 31    → reserved (all-ones sentinel); return null
 *
 * The 8..30 branch should never fire at runtime (we don't render any
 * pickable surface with those codes), but a stray frame from an old
 * shader or a misconfigured renderer would otherwise propagate a
 * "ghost" pick result into the focus subsystem. Logging + null keeps
 * the caller's switch exhaustive without crashing.
 */
export function unpackPick(rawPickValue: number): PickResult | null {
  if (rawPickValue === 0) return null;
  const sourceCode = rawPickValue >>> SELECTION_SOURCE_SHIFT;
  // Reserved sentinel band — never a real hit.
  if (sourceCode === 31) return null;
  const localIdx = (rawPickValue & SELECTION_LOCAL_IDX_MASK) - PICK_SENTINEL_OFFSET;
  if (sourceCode <= 4) {
    // Survey-galaxy hit. The numeric source code matches the Source
    // enum value 1:1 (Synthetic=0, SDSS=1, TwoMRS=2, Glade=3, Famous=4).
    return { kind: 'galaxy', source: sourceCode as Source, localIdx };
  }
  if (sourceCode === 5) return { kind: 'cluster', poiIndex: localIdx };
  if (sourceCode === 6) return { kind: 'supercluster', poiIndex: localIdx };
  if (sourceCode === 7) return { kind: 'void', poiIndex: localIdx };
  // Codes 8..30 are unallocated. See docstring for why we log+null
  // instead of throwing.
  console.warn(
    `unpackPick: unexpected source code ${sourceCode} ` +
      `(raw=0x${rawPickValue.toString(16).padStart(8, '0')}); returning null`,
  );
  return null;
}
```

- [ ] **Step 4: Update the existing `unpacks a real pick value back to (source, localIdx)` test**

The pre-existing test (around line 41 in the current test file) reads:

```ts
expect(unpackPick(0x1800002b)).toEqual({ source: 3, localIdx: 42 });
```

Source code 3 = `Source.Glade` (a survey source ≤ 4), so after the refactor the result is a `{ kind: 'galaxy' }` variant. Update the assertion:

```ts
expect(unpackPick(0x1800002b)).toEqual({
  kind: 'galaxy',
  source: Source.Glade,
  localIdx: 42,
});
```

Add `import { Source } from '../../src/data/sources';` near the existing imports if not already present from Task 2.1 Step 1.

- [ ] **Step 5: Update the round-trip test for the new return shape**

The pre-existing `round-trips pack → +1 → unpackPick for a variety of identities` test (around line 50) iterates over `[source, localIdx]` pairs that include `(31, 0)` and `(31, 0x07fffffe)`. After the refactor those cases hit the source-31 branch and return null, not `{source: 31, localIdx: ...}`. Replace the test body with:

```ts
it('round-trips pack → +1 → unpackPick for survey-source identities', () => {
  // Survey sources only — codes 0..4. POI codes (5/6/7) round-trip
  // through their own variant tests above; code 31 deliberately
  // returns null per the sentinel rule.
  const cases: Array<[number, number]> = [
    [0, 1],
    [0, 0x07fffffe],
    [1, 0],
    [4, 42],
    [4, 0x07fffffe],
  ];
  for (const [source, localIdx] of cases) {
    const packed = packSelection(source, localIdx);
    const rawPick = (packed + PICK_SENTINEL_OFFSET) >>> 0;
    expect(unpackPick(rawPick)).toEqual({
      kind: 'galaxy',
      source: source as Source,
      localIdx,
    });
  }
});
```

- [ ] **Step 6: Run the test to verify all selectionEncoding tests pass**

Run: `npm test -- tests/data/selectionEncoding.test.ts`
Expected: PASS — every test in the file (including the pre-existing TS↔WESL parity block) green.

- [ ] **Step 7: Typecheck — expect failures at consumer call sites**

Run: `npm run typecheck`

Expected: FAIL with type errors at every site that destructures `unpackPick`'s old `{source, localIdx}` shape. Spec §7.2 lists `wireInput.ts` as the one runtime consumer — confirm with:

```bash
grep -rn "unpackPick" src/ tests/
```

If `wireInput.ts` (or any other file) destructures the old shape, **do NOT update those call sites in this sub-plan**. The new pick dispatch is plan 3's job. Instead, write an interim adapter to keep the build green:

In `src/data/selectionEncoding.ts`, add a deprecated-named export that callers can use in the interim:

```ts
/**
 * @deprecated Use `unpackPick` directly; this shim exists for the
 * brief window between the foundations sub-plan (which lands the
 * discriminated-union return) and the pick-dispatch sub-plan (which
 * rewrites consumers to switch on `kind`). Remove when the last
 * caller is migrated.
 */
export function unpackPickGalaxyOnly(
  rawPickValue: number,
): { source: number; localIdx: number } | null {
  const result = unpackPick(rawPickValue);
  if (result === null) return null;
  if (result.kind !== 'galaxy') return null;
  return { source: result.source, localIdx: result.localIdx };
}
```

Then update any consumer that destructures `{source, localIdx}` from `unpackPick` to call `unpackPickGalaxyOnly` instead. Run `npm run typecheck` again to confirm green. The plan-3 implementer will swap them back to `unpackPick` + a `switch (result.kind)` once they wire the POI hit path.

- [ ] **Step 8: Run full test suite to confirm no regressions**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/data/selectionEncoding.ts tests/data/selectionEncoding.test.ts src/services/engine/phases/wireInput.ts
git commit -m "$(cat <<'EOF'
refactor(selectionEncoding): unpackPick returns discriminated union

PickResult is now { kind: 'galaxy' | 'cluster' | 'supercluster' | 'void' };
codes 5/6/7 fan out to the three POI variants, codes 0..4 stay galaxy
hits, code 31 + raw==0 return null, codes 8..30 log + null.

Existing consumers switch to the deprecated unpackPickGalaxyOnly shim
for now; the plan-3 implementer migrates them to a real switch on
result.kind when the POI hit path lands.

Foundations sub-plan — see spec §6.2.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

(Adjust the staged file list to whatever `unpackPickGalaxyOnly` actually touched — confirm with `git status` before committing.)

---

### Task 2.2: Extend the WESL parity test to assert source-code allocation

**Files:**
- Modify: `src/services/gpu/shaders/lib/selectionEncoding.wesl`
- Modify: `tests/data/selectionEncoding.test.ts`

The existing parity test asserts numerical equality for shift/mask/sentinel/offset constants. Extend the WESL file with named constants for each POI category source code, so a future shader edit can refer to e.g. `package::lib::selectionEncoding::SOURCE_CODE_CLUSTER` instead of a magic `5u`, and the parity test prevents drift.

- [ ] **Step 1: Add the POI source-code constants to the WESL file**

In `src/services/gpu/shaders/lib/selectionEncoding.wesl`, append after the existing `PICK_SENTINEL_OFFSET` declaration (around line 33):

```wgsl
/** Source code for cluster POIs — see TS Source.Cluster. */
const SOURCE_CODE_CLUSTER: u32 = 5u;

/** Source code for supercluster POIs — see TS Source.Supercluster. */
const SOURCE_CODE_SUPERCLUSTER: u32 = 6u;

/** Source code for void POIs — see TS Source.Void. */
const SOURCE_CODE_VOID: u32 = 7u;
```

- [ ] **Step 2: Write the failing parity-extension test**

In the existing `selectionEncoding TS↔WESL parity` describe block (around line 116 of the test file), find the `cases` table:

```ts
const cases: Array<[string, number]> = [
  ['SELECTION_SOURCE_SHIFT', SELECTION_SOURCE_SHIFT],
  ['SELECTION_LOCAL_IDX_MASK', SELECTION_LOCAL_IDX_MASK],
  ['SELECTION_NONE_SENTINEL', SELECTION_NONE_SENTINEL],
  ['PICK_SENTINEL_OFFSET', PICK_SENTINEL_OFFSET],
];
```

Extend it to:

```ts
const cases: Array<[string, number]> = [
  ['SELECTION_SOURCE_SHIFT', SELECTION_SOURCE_SHIFT],
  ['SELECTION_LOCAL_IDX_MASK', SELECTION_LOCAL_IDX_MASK],
  ['SELECTION_NONE_SENTINEL', SELECTION_NONE_SENTINEL],
  ['PICK_SENTINEL_OFFSET', PICK_SENTINEL_OFFSET],
  // POI category source codes — mirror of TS Source.Cluster /
  // Source.Supercluster / Source.Void. These appear at the WESL side
  // so the future cluster-marker pick fragment can refer to them by
  // name instead of inlining a magic 5u/6u/7u literal.
  ['SOURCE_CODE_CLUSTER', Source.Cluster],
  ['SOURCE_CODE_SUPERCLUSTER', Source.Supercluster],
  ['SOURCE_CODE_VOID', Source.Void],
];
```

Add `import { Source } from '../../src/data/sources';` to the top of the file if not already present.

- [ ] **Step 3: Run the test**

Run: `npm test -- tests/data/selectionEncoding.test.ts`
Expected: PASS — the WESL file now exports the constants the test expects to find.

- [ ] **Step 4: Commit**

```bash
git add src/services/gpu/shaders/lib/selectionEncoding.wesl tests/data/selectionEncoding.test.ts
git commit -m "$(cat <<'EOF'
feat(shaders): add named POI source-code constants to selectionEncoding.wesl

SOURCE_CODE_CLUSTER/SUPERCLUSTER/VOID = 5u/6u/7u, kept in sync with the
TS Source enum via the existing parity-test scaffolding. Future cluster-
marker pick fragments can refer to these by name instead of inlining
the magic numbers.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: `physicalRadiusMpc` rename + literal radius population

This phase is split into three commits — rename the type field, populate the literal values on the anchor tables, then delete the runtime derivation in `wireSlots.ts`. Each commit leaves the build green.

### Task 3.1: Rename `crosshairSizeMpc` → `physicalRadiusMpc` on the POI type

**Files:**
- Modify: `src/@types/engine/subsystems/PointOfInterest.d.ts`
- Modify: `src/services/engine/subsystems/poiSubsystem.ts`
- Modify: `src/services/engine/phases/wireSlots.ts`
- Modify: `tests/services/engine/subsystems/poiSubsystem.test.ts`
- Modify: `tests/services/engine/phases/buildPoisFromFamousMeta.test.ts`

- [ ] **Step 1: Enumerate every current usage**

Run: `grep -rn "crosshairSizeMpc" src/ tests/`

Expected output (snapshot at plan-write time — confirm during implementation):

```
src/@types/engine/subsystems/PointOfInterest.d.ts: readonly crosshairSizeMpc?: number;
src/services/engine/subsystems/poiSubsystem.ts: ... 3 references (docstring + 2 reads)
src/services/engine/phases/wireSlots.ts: 3 sites (one per anchor list mapper)
tests/services/engine/phases/buildPoisFromFamousMeta.test.ts: 1 site (assertion)
tests/services/engine/subsystems/poiSubsystem.test.ts: 4 sites (fixtures + 1 test title)
```

If the actual count differs, update Step 2 accordingly — every site must be migrated in the same commit so the build stays green.

- [ ] **Step 2: Rename the field on the type**

In `src/@types/engine/subsystems/PointOfInterest.d.ts`, replace the existing `crosshairSizeMpc` block (around line 9-10):

```ts
  /** Crosshair half-length in Mpc.  Omit to draw label only. */
  readonly crosshairSizeMpc?: number;
```

with:

```ts
  /**
   * Physical radius of the structure in Mpc (or a sensible proxy — e.g.
   * the half-extent for an asymmetric cluster).
   *
   * This single field drives two downstream consumers that the
   * cluster-viz redesign introduces in the later sub-plans:
   *
   *   1. **At-rest visualization** (sub-plan 2): the radius of the
   *      screen-aligned ring rendered at the POI's worldPos, and the
   *      world-space extent of the soft additive halo billboard.
   *
   *   2. **Member cone-search** (sub-plan 4, focus mode): the radius
   *      used by `clusterMembership(catalogs, center, radiusMpc)` to
   *      classify nearby galaxies as members vs non-members.
   *
   * Omit on POIs that have no extent (e.g. famous-galaxy entries that
   * route through the existing thumbnail/label path instead).
   *
   * Renamed from `crosshairSizeMpc` on 2026-05-18 — see
   * docs/superpowers/specs/2026-05-18-cluster-supercluster-viz-design.md
   * §7.2 for the migration rationale.
   */
  readonly physicalRadiusMpc?: number;
```

- [ ] **Step 3: Update the runtime consumer in `poiSubsystem.ts`**

In `src/services/engine/subsystems/poiSubsystem.ts`:

- Update the docstring (around line 26-29) referencing `crosshairSizeMpc` to refer to `physicalRadiusMpc` instead. Keep the rest of the prose intact.
- In the `makeCrosshairLines` body (around line 196-197), replace:

```ts
    if (p.crosshairSizeMpc === undefined) return [];
    const half = p.crosshairSizeMpc;
```

with:

```ts
    if (p.physicalRadiusMpc === undefined) return [];
    const half = p.physicalRadiusMpc;
```

Note: the field's semantic now means "structure radius", which is the same number the crosshair was already drawing (a half-extent). No numerical change — only the field name. The crosshair-rendering logic stays in this sub-plan; sub-plan 2 replaces it with the ring renderer.

- [ ] **Step 4: Update the test fixtures**

In `tests/services/engine/subsystems/poiSubsystem.test.ts`, find every `crosshairSizeMpc:` key (4 sites at plan-write time) and rename to `physicalRadiusMpc:`. Also update the test title `'emits 3 perpendicular crosshair lines for POIs with crosshairSizeMpc'` (around line 69) — change the trailing `crosshairSizeMpc` to `physicalRadiusMpc`.

In `tests/services/engine/phases/buildPoisFromFamousMeta.test.ts`, find the line:

```ts
expect(pois[0]!.crosshairSizeMpc).toBeUndefined();
```

Replace with:

```ts
expect(pois[0]!.physicalRadiusMpc).toBeUndefined();
```

- [ ] **Step 5: Update `wireSlots.ts` to pass the new field name (preserve the derivations for now)**

The three derivations in `wireSlots.ts` (around lines 196, 205, 214) currently compute `crosshairSizeMpc` from `distMpc`. Rename the keys only — do **not** delete the derivations yet (that's Task 3.3). Replace:

```ts
        crosshairSizeMpc: Math.max(2, a.distMpc * 0.05),
```

with:

```ts
        physicalRadiusMpc: Math.max(2, a.distMpc * 0.05),
```

… and equivalently for the supercluster (`Math.max(10, a.distMpc * 0.1)`) and void (`Math.max(15, a.distMpc * 0.15)`) mappers. This is a pure rename; the numerical values are preserved.

- [ ] **Step 6: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS. If a stray `crosshairSizeMpc` site was missed, the typecheck pinpoints it; fix and rerun.

- [ ] **Step 7: Commit**

```bash
git add src/@types/engine/subsystems/PointOfInterest.d.ts src/services/engine/subsystems/poiSubsystem.ts src/services/engine/phases/wireSlots.ts tests/services/engine/subsystems/poiSubsystem.test.ts tests/services/engine/phases/buildPoisFromFamousMeta.test.ts
git commit -m "$(cat <<'EOF'
refactor(poi): rename crosshairSizeMpc to physicalRadiusMpc

The field is repurposed by the cluster-viz redesign — it will drive the
future ring radius AND the member cone-search. The numerical values are
preserved 1:1 in this commit; the wireSlots derivation that computes
them from distMpc is replaced with literal cluster-table values in the
next task.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.2: Populate `physicalRadiusMpc` on the anchor tables

**Files:**
- Modify: `src/@types/data/ClusterAnchor.d.ts`
- Modify: `src/data/clusterAnchors.ts`
- Test: `tests/data/clusterAnchors.test.ts` (confirm path — create if absent)

The spec §7.2 calls out that `clusterAnchors.ts` should carry `physicalRadiusMpc` as a literal per-anchor field with literature-grounded values. Currently the anchor tables only have RA/Dec/distance; the field is added to the type and populated on every entry.

- [ ] **Step 1: Confirm the field is absent today**

Run: `grep -n "physicalRadiusMpc\|crosshairSizeMpc" src/@types/data/ClusterAnchor.d.ts src/data/clusterAnchors.ts`
Expected: no matches. (The pre-rename `crosshairSizeMpc` was a runtime-computed field set by `wireSlots.ts`, not a static field on the anchor table.)

If matches appear (e.g. an earlier sub-plan landed first), adapt: only add what's missing.

- [ ] **Step 2: Confirm whether the clusterAnchors test file exists**

Run: `ls tests/data/clusterAnchors.test.ts 2>/dev/null || echo "ABSENT"`

- [ ] **Step 3: Write the failing test — every anchor carries a literature-grounded radius**

Create (or extend) `tests/data/clusterAnchors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  CLUSTER_ANCHORS,
  SUPERCLUSTER_ANCHORS,
  VOID_ANCHORS,
} from '../../src/data/clusterAnchors';

describe('clusterAnchors — physicalRadiusMpc population', () => {
  it('every cluster anchor has a finite, positive physicalRadiusMpc', () => {
    for (const a of CLUSTER_ANCHORS) {
      expect(a.physicalRadiusMpc).toBeGreaterThan(0);
      expect(Number.isFinite(a.physicalRadiusMpc)).toBe(true);
    }
  });

  it('every supercluster anchor has a finite, positive physicalRadiusMpc', () => {
    for (const a of SUPERCLUSTER_ANCHORS) {
      expect(a.physicalRadiusMpc).toBeGreaterThan(0);
      expect(Number.isFinite(a.physicalRadiusMpc)).toBe(true);
    }
  });

  it('every void anchor has a finite, positive physicalRadiusMpc', () => {
    for (const a of VOID_ANCHORS) {
      expect(a.physicalRadiusMpc).toBeGreaterThan(0);
      expect(Number.isFinite(a.physicalRadiusMpc)).toBe(true);
    }
  });

  it('uses the literature-grounded radii from the spec', () => {
    // Spot-check four representative anchors — the spec's table in
    // sub-plan 1 §7.2 names these explicitly.
    const byName = (list: readonly { name: string; physicalRadiusMpc: number }[], n: string) =>
      list.find((a) => a.name.startsWith(n));

    expect(byName(CLUSTER_ANCHORS, 'Virgo')?.physicalRadiusMpc).toBe(2.2);
    expect(byName(CLUSTER_ANCHORS, 'Coma')?.physicalRadiusMpc).toBe(3.0);
    expect(byName(SUPERCLUSTER_ANCHORS, 'Hercules SC')?.physicalRadiusMpc).toBe(60);
    expect(byName(VOID_ANCHORS, 'Boötes')?.physicalRadiusMpc).toBe(50);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- tests/data/clusterAnchors.test.ts`
Expected: FAIL — `physicalRadiusMpc` is `undefined` on every anchor.

- [ ] **Step 5: Add the field to the `ClusterAnchor` type**

In `src/@types/data/ClusterAnchor.d.ts`, extend the type:

```ts
import type { SkyCoord } from './SkyCoord';

/**
 * A named cluster anchor — sky coord + display label + a literature-
 * grounded physical radius.
 *
 * `physicalRadiusMpc` is the structure's characteristic extent in Mpc,
 * sourced from the per-anchor citation comment in
 * `src/data/clusterAnchors.ts`. Consumers use it for two purposes
 * (introduced in the cluster-viz sub-plans 2–4):
 *
 *   1. The on-screen ring radius (sub-plan 2 — at-rest viz)
 *   2. The member cone-search radius (sub-plan 4 — focus mode)
 *
 * Required (not optional) so every anchor has a value at table-edit
 * time rather than at consumer-edit time.
 */
export type ClusterAnchor = SkyCoord & {
  readonly name: string;
  readonly physicalRadiusMpc: number;
};
```

- [ ] **Step 6: Populate `physicalRadiusMpc` on every anchor with literature-grounded values**

In `src/data/clusterAnchors.ts`, update each anchor literal. Replace the `CLUSTER_ANCHORS` block with:

```ts
export const CLUSTER_ANCHORS: readonly ClusterAnchor[] = [
  // Virgo: ~2.2 Mpc characteristic radius (R_200 / virial radius).
  // Distance from Mei et al. 2007 (SBF survey); extent from
  // Strauss & Willick 1995, ARA&A 33, 247.
  { name: 'Virgo (M87)',              raHours: 12 + 30 / 60 + 49 / 3600, decDeg:  12 + 23 / 60,    distMpc:  16.5, physicalRadiusMpc: 2.2 },
  // Norma / Great Attractor (Abell 3627): ~1.5 Mpc core. Behind the
  // Zone of Avoidance; Kraan-Korteweg et al. 1996, Nature 379, 519.
  { name: 'Norma / Great Attractor',  raHours: 16 + 15 / 60,             decDeg: -(60 + 54 / 60),  distMpc:  70,   physicalRadiusMpc: 1.5 },
  // Perseus (A426): ~2.0 Mpc virial radius. Simionescu et al. 2011,
  // Science 331, 1576.
  { name: 'Perseus (A426)',           raHours:  3 + 19 / 60 + 48 / 3600, decDeg:  41 + 31 / 60,    distMpc:  75,   physicalRadiusMpc: 2.0 },
  // Coma (A1656): ~3.0 Mpc R_200. The Kubo et al. 2007 weak-lensing
  // value (R_200 ≈ 2.9 Mpc) rounded for round-number anchoring.
  { name: 'Coma (A1656)',             raHours: 12 + 59 / 60 + 49 / 3600, decDeg:  27 + 59 / 60,    distMpc: 100,   physicalRadiusMpc: 3.0 },
  // Hercules (A2151): ~1.8 Mpc. Smaller, less relaxed than Coma —
  // Bird, Davis & Beers 1995, AJ 109, 920.
  { name: 'Hercules (A2151)',         raHours: 16 +  5 / 60 + 15 / 3600, decDeg:  17 + 45 / 60,    distMpc: 158,   physicalRadiusMpc: 1.8 },
  // Shapley (A3558): ~2.5 Mpc R_200 of the central cluster member;
  // the wider Shapley Concentration is much larger (see the
  // supercluster table). Reiprich & Böhringer 2002, ApJ 567, 716.
  { name: 'Shapley (A3558)',          raHours: 13 + 27 / 60 + 57 / 3600, decDeg: -(31 + 30 / 60),  distMpc: 200,   physicalRadiusMpc: 2.5 },
];
```

Replace the `SUPERCLUSTER_ANCHORS` block with:

```ts
export const SUPERCLUSTER_ANCHORS: readonly ClusterAnchor[] = [
  // Hydra Wall — ~50 Mpc structural extent across the wall. CF-4
  // density peak is broad, consistent with the wall's filamentary
  // ~50 Mpc transverse scale.
  { name: 'Hydra Wall',               raHours: 13 + 17 / 60,             decDeg: -15,              distMpc: 152, physicalRadiusMpc: 50 },
  // Hercules SC — ~60 Mpc full-extent radius spanning A2147 / A2151 /
  // A2152. Einasto et al. 2001, AJ 122, 2222 puts the supercluster's
  // characteristic scale at 50-70 Mpc.
  { name: 'Hercules SC',              raHours: 15 + 40 / 60,             decDeg:  16,              distMpc: 120, physicalRadiusMpc: 60 },
];
```

Replace the `VOID_ANCHORS` block with:

```ts
export const VOID_ANCHORS: readonly ClusterAnchor[] = [
  // Sculptor Void — ~25 Mpc characteristic radius. Sharp 1986,
  // MNRAS 221, 137; size approximate due to void-finding method
  // sensitivity.
  { name: 'Sculptor Void',            raHours:  0,                       decDeg: -30,              distMpc:  35, physicalRadiusMpc: 25 },
  // Local Void — ~30 Mpc radius. Tully et al. 2008, ApJ 676, 184;
  // the void extends asymmetrically, so this is the effective
  // radius of the equivalent sphere.
  { name: 'Local Void',               raHours: 18 + 38 / 60,             decDeg:  18,              distMpc:  25, physicalRadiusMpc: 30 },
  // Boötes Void — ~50 Mpc canonical radius. Kirshner et al. 1987,
  // ApJ 314, 493 ("the Great Void"). At ~245 Mpc distance the
  // 50 Mpc radius subtends ~12° on the sky.
  { name: 'Boötes Void',              raHours: 14 + 50 / 60,             decDeg:  46,              distMpc: 245, physicalRadiusMpc: 50 },
];
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- tests/data/clusterAnchors.test.ts`
Expected: PASS.

- [ ] **Step 8: Run typecheck + full test suite**

Run: `npm run typecheck && npm test`
Expected: PASS. The `ClusterAnchor` type now has a required `physicalRadiusMpc` field, so any other module constructing a `ClusterAnchor` literal must also supply it. The two known consumers are this file and `tools/auditCf4Anchors.ts` — search to confirm:

```bash
grep -rn "ClusterAnchor" src/ tests/ tools/
```

If `tools/auditCf4Anchors.ts` constructs `ClusterAnchor` objects in-line, it must also be updated (just supply any positive number — the audit doesn't read this field). If the typecheck fails there, edit `tools/auditCf4Anchors.ts` to satisfy the type.

- [ ] **Step 9: Commit**

```bash
git add src/@types/data/ClusterAnchor.d.ts src/data/clusterAnchors.ts tests/data/clusterAnchors.test.ts
# Plus tools/auditCf4Anchors.ts if it was edited in Step 8.
git commit -m "$(cat <<'EOF'
feat(data): populate physicalRadiusMpc on every cluster/SC/void anchor

Literature-grounded values per spec sub-plan-1 §7.2:
- Virgo 2.2 Mpc, Norma 1.5, Perseus 2.0, Coma 3.0, Hercules 1.8, Shapley 2.5
- Hydra Wall 50 Mpc, Hercules SC 60 Mpc
- Sculptor Void 25 Mpc, Local Void 30 Mpc, Bootes Void 50 Mpc

Each value carries an in-code citation. The ClusterAnchor type now
requires the field (not optional) so future additions can't drop it.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.3: Delete the runtime derivation in `wireSlots.ts` and use the literal values

**Files:**
- Modify: `src/services/engine/phases/wireSlots.ts`

- [ ] **Step 1: Confirm the current derivations are still in place**

Run: `grep -n "physicalRadiusMpc" src/services/engine/phases/wireSlots.ts`

Expected (post-Task-3.1 rename): three lines around 196 / 205 / 214 with `Math.max(...)` expressions.

- [ ] **Step 2: Replace the derivations with the literal anchor value**

In `src/services/engine/phases/wireSlots.ts`, find the `staticAnchorPois` block (around line 189-217). Replace the three `physicalRadiusMpc: Math.max(...)` lines with the literal `a.physicalRadiusMpc` from the anchor table. The full block becomes:

```ts
  const staticAnchorPois: PointOfInterest[] = [
    ...CLUSTER_ANCHORS.map(
      (a): PointOfInterest => ({
        id: `cluster-${slug(a.name)}`,
        name: a.name,
        category: 'cluster',
        worldPos: raDecDistToEqCart(a),
        // physicalRadiusMpc comes from clusterAnchors.ts (literature-
        // grounded per-anchor value); we no longer derive it from
        // distMpc here. See spec sub-plan-1 §7.2 + Task 3.2 for the
        // citations.
        physicalRadiusMpc: a.physicalRadiusMpc,
      }),
    ),
    ...SUPERCLUSTER_ANCHORS.map(
      (a): PointOfInterest => ({
        id: `supercluster-${slug(a.name)}`,
        name: a.name,
        category: 'supercluster',
        worldPos: raDecDistToEqCart(a),
        physicalRadiusMpc: a.physicalRadiusMpc,
      }),
    ),
    ...VOID_ANCHORS.map(
      (a): PointOfInterest => ({
        id: `void-${slug(a.name)}`,
        name: a.name,
        category: 'void',
        worldPos: raDecDistToEqCart(a),
        physicalRadiusMpc: a.physicalRadiusMpc,
      }),
    ),
  ];
```

Also update the explanatory comment block above (around lines 179-184) that references the per-category derivation rationale:

```ts
  // Per-category crosshair scaling: clusters get a small marker
  // (cores are ~1 Mpc), superclusters get a larger one (extent
  // 30-50 Mpc), voids get a still larger one (radii 30-50+ Mpc).
  // The per-category min floors prevent vanishing markers on the
  // closest anchors (e.g. Virgo, Local Void).
```

Replace with:

```ts
  // physicalRadiusMpc per anchor comes from clusterAnchors.ts —
  // literature-grounded values (R_200 / virial radii for clusters,
  // characteristic structural extent for superclusters and voids).
  // See the per-anchor citation comments in clusterAnchors.ts.
```

- [ ] **Step 3: Run tests + typecheck**

Run: `npm run typecheck && npm test`
Expected: PASS. The poiSubsystem tests already use the new `physicalRadiusMpc` field name (Task 3.1); the runtime behaviour change is that anchors now render with their literature radii instead of the `distMpc`-derived values. Since this sub-plan deliberately keeps the crosshair renderer in place (it's swapped in sub-plan 2), the visual effect is "the crosshair half-extent is now the cluster's real radius" — a small visual diff the user will see on the next dev-server refresh, but no functional regression.

- [ ] **Step 4: Visual sanity check (optional)**

If the dev server is running, refresh the browser and visually confirm:
- Virgo's crosshair is roughly 2 Mpc half-length (previously 2 Mpc — Virgo's `Math.max(2, 16.5 * 0.05) = 2` was already at the floor, so no visible change).
- Coma's crosshair is now 3 Mpc instead of `Math.max(2, 100 * 0.05) = 5` Mpc — visibly smaller.
- Boötes Void's crosshair is now 50 Mpc instead of `Math.max(15, 245 * 0.15) = 36.75` Mpc — visibly larger.

Skip if dev server isn't running; the sub-plan-2 implementer will verify with the new renderer.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/phases/wireSlots.ts
git commit -m "$(cat <<'EOF'
refactor(wireSlots): drop distMpc-derived physicalRadiusMpc

Use the literal per-anchor physicalRadiusMpc from clusterAnchors.ts
instead. Visual effect: anchors render at their literature radius
instead of a distance-scaled placeholder. The next sub-plan replaces
the crosshair renderer with the soft halo + ring; this commit preserves
the current visual language but with correct extents.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: `clusterMembership` pure function

### Task 4.1: Create the `clusterMembership` directory + the pure cone-search function

**Files:**
- Create: `src/utils/cluster/clusterMembership.ts`
- Create: `tests/utils/cluster/clusterMembership.test.ts`

- [ ] **Step 1: Confirm the directory layout**

Run: `ls src/utils/cluster 2>/dev/null && ls tests/utils/cluster 2>/dev/null`

Expected: both ABSENT (the directories don't exist yet). The plan creates them.

If they already exist, adapt: skip the `mkdir` mental step and just create the files. There's no `__init__`-style barrel — the project convention is direct deep imports.

- [ ] **Step 2: Write the failing test — inside / boundary / outside trio**

Create `tests/utils/cluster/clusterMembership.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clusterMembership } from '../../../src/utils/cluster/clusterMembership';
import { Source } from '../../../src/data/sources';
import { packSelection } from '../../../src/data/selectionEncoding';
import type { GalaxyCatalog } from '../../../src/@types/data/GalaxyCatalog';

/**
 * Build a minimal GalaxyCatalog from a list of (x,y,z) tuples.
 * Only the `positions` + `count` fields are read by clusterMembership;
 * the other Float32Array slots are filled with zeros via `new
 * Float32Array(count)` so the type's required-field shape is satisfied
 * without polluting the test fixture with irrelevant data.
 */
function makeCatalog(positions: ReadonlyArray<readonly [number, number, number]>): GalaxyCatalog {
  const count = positions.length;
  const flat = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    flat[i * 3 + 0] = positions[i]![0];
    flat[i * 3 + 1] = positions[i]![1];
    flat[i * 3 + 2] = positions[i]![2];
  }
  const z = new Float32Array(count);
  return {
    count,
    objIDs: new BigUint64Array(count),
    positions: flat,
    magU: z, magG: z, magR: z, magI: z, magZ: z,
    axisRatio: z, positionAngleDeg: z, diameterKpc: z,
  };
}

describe('clusterMembership — pure cone search', () => {
  it('classifies one inside, one boundary, one outside galaxy', () => {
    // Center at origin, radius 10. Inside: (5,0,0) at distance 5 < 10.
    // Boundary: (10,0,0) at distance exactly 10 — excluded under strict <.
    // Outside: (20,0,0) at distance 20 > 10 — excluded.
    const catalog = makeCatalog([
      [5, 0, 0],
      [10, 0, 0],
      [20, 0, 0],
    ]);
    const result = clusterMembership(
      [{ source: Source.SDSS, catalog }],
      [0, 0, 0],
      10,
    );
    expect(result.count).toBe(1);
    expect(result.packedIds).toEqual([packSelection(Source.SDSS, 0)]);
  });

  it('uses strict less-than (galaxy on boundary excluded)', () => {
    // Single galaxy at distance == radius — must not be included.
    const catalog = makeCatalog([[0, 0, 10]]);
    const result = clusterMembership(
      [{ source: Source.TwoMRS, catalog }],
      [0, 0, 0],
      10,
    );
    expect(result.count).toBe(0);
    expect(result.packedIds).toEqual([]);
  });

  it('merges members across multiple catalogs with correct source codes', () => {
    // SDSS has 2 inside + 1 outside; 2MRS has 2 inside + 1 outside.
    // Expected: 4 members total, each packed with its source's code.
    const sdss = makeCatalog([
      [1, 0, 0],   // inside
      [2, 0, 0],   // inside
      [100, 0, 0], // outside
    ]);
    const twomrs = makeCatalog([
      [0, 1, 0],   // inside
      [0, 2, 0],   // inside
      [0, 100, 0], // outside
    ]);
    const result = clusterMembership(
      [
        { source: Source.SDSS, catalog: sdss },
        { source: Source.TwoMRS, catalog: twomrs },
      ],
      [0, 0, 0],
      10,
    );
    expect(result.count).toBe(4);
    // Iteration is catalog-array-order, then local-index order.
    expect(result.packedIds).toEqual([
      packSelection(Source.SDSS, 0),
      packSelection(Source.SDSS, 1),
      packSelection(Source.TwoMRS, 0),
      packSelection(Source.TwoMRS, 1),
    ]);
  });

  it('returns {count: 0, packedIds: []} for empty catalogs', () => {
    const result = clusterMembership([], [0, 0, 0], 10);
    expect(result.count).toBe(0);
    expect(result.packedIds).toEqual([]);
  });

  it('returns {count: 0, packedIds: []} when every input catalog is empty', () => {
    const empty = makeCatalog([]);
    const result = clusterMembership(
      [
        { source: Source.SDSS, catalog: empty },
        { source: Source.TwoMRS, catalog: empty },
      ],
      [0, 0, 0],
      10,
    );
    expect(result.count).toBe(0);
    expect(result.packedIds).toEqual([]);
  });

  it('is deterministic — same input → identical output', () => {
    const catalog = makeCatalog([
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    const r1 = clusterMembership([{ source: Source.SDSS, catalog }], [0, 0, 0], 5);
    const r2 = clusterMembership([{ source: Source.SDSS, catalog }], [0, 0, 0], 5);
    expect(r1.count).toBe(r2.count);
    expect(r1.packedIds).toEqual(r2.packedIds);
  });

  it('does not internally cache (each call returns a fresh array)', () => {
    // Per spec §4.3, caching is the subsystem's job — not the pure
    // function's. Same-input calls must therefore return distinct
    // array instances (the subsystem memoises against (poiId, dataRev)).
    const catalog = makeCatalog([[1, 0, 0]]);
    const r1 = clusterMembership([{ source: Source.SDSS, catalog }], [0, 0, 0], 5);
    const r2 = clusterMembership([{ source: Source.SDSS, catalog }], [0, 0, 0], 5);
    expect(r1.packedIds).not.toBe(r2.packedIds); // distinct array references
    expect(r1.packedIds).toEqual(r2.packedIds);   // but equal contents
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- tests/utils/cluster/clusterMembership.test.ts`
Expected: FAIL — `src/utils/cluster/clusterMembership.ts` doesn't exist.

- [ ] **Step 4: Implement `clusterMembership`**

Create `src/utils/cluster/clusterMembership.ts`:

```ts
/**
 * clusterMembership — pure cone-search over loaded galaxy catalogs.
 *
 * Given a set of in-memory catalogs, a 3D center, and a radius in Mpc,
 * returns the packed (sourceCode << 27 | localIdx) identities of every
 * galaxy strictly inside the sphere — i.e. `distance(g, center) < radius`.
 *
 * ### Why a pure function (no caching here)?
 *
 * The expensive bit is the cone search itself (one vec3 subtract + one
 * dot product per galaxy, ~3.5M ops for the full loaded catalog).
 * Memoising against `(poiId, dataRev)` belongs to the subsystem that
 * owns the focus state — see spec §4.3 — because cache invalidation
 * needs to know when a tier swap has bumped `dataRev`, which this pure
 * function has no concept of. Keeping the function cache-free makes it
 * a single-purpose, easily-tested predicate; the subsystem layered on
 * top adds the lifecycle concerns.
 *
 * ### Why packed IDs (not (source, localIdx) tuples)?
 *
 * The packed-identity encoding is the canonical "global galaxy ID"
 * across the renderer + selection halo + pick buffer (see
 * `selectionEncoding.ts`). Returning packed IDs means the result can
 * be compared directly against `state.selection.selectedPacked` or
 * uploaded as a u32 storage-buffer membership bitmask (future
 * sub-plan 4) without an extra encode step.
 *
 * ### Predicate strictness
 *
 * The comparison is strict `<` (not `≤`) — a galaxy sitting exactly
 * at `r == radiusMpc` is excluded. This makes the ring a hard outer
 * edge, consistent with spec §11.6. The squared-distance comparison
 * (`d2 < r * r`) preserves strictness without the cost of a sqrt.
 */

import { packSelection } from '../../data/selectionEncoding';
import type { GalaxyCatalog } from '../../@types/data/GalaxyCatalog';
import type { Source } from '../../data/sources';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * One catalog tagged with its survey source. The source is needed at
 * the call boundary because the catalog itself is source-agnostic —
 * it's the same `GalaxyCatalog` shape regardless of which survey
 * produced it. The caller assembles the list from the engine's
 * `state.sources.catalogs` map.
 */
export type CatalogWithSource = {
  readonly source: Source;
  readonly catalog: GalaxyCatalog;
};

/**
 * The return value of {@link clusterMembership}. `packedIds` carries
 * the matched galaxies in catalog-array-order, then local-index order;
 * `count` is its length, exposed redundantly so callers (e.g. the
 * InfoCard "N member galaxies" text) don't have to read `.length`.
 */
export type ClusterMembershipResult = {
  readonly count: number;
  readonly packedIds: readonly number[];
};

/**
 * Compute the packed identities of every galaxy strictly within
 * `radiusMpc` of `centerMpc` across the supplied catalogs.
 *
 * Time complexity: O(total galaxy count). For the typical loaded
 * footprint (~3.5M galaxies across SDSS + 2MRS + GLADE), one call
 * runs in single-digit milliseconds on the target hardware — see
 * spec §4.2 for the rationale on runtime-vs-build-time computation.
 *
 * No allocations beyond the result array. The result array is a
 * mutable `number[]` (cast to `readonly`) so callers can pass it to
 * `Object.freeze` if they want defensive immutability; we don't
 * freeze it here to keep the hot path allocation-free.
 */
export function clusterMembership(
  catalogs: readonly CatalogWithSource[],
  centerMpc: Vec3,
  radiusMpc: number,
): ClusterMembershipResult {
  const cx = centerMpc[0];
  const cy = centerMpc[1];
  const cz = centerMpc[2];
  // Compare against squared distance to avoid 3.5M Math.sqrt calls.
  const r2 = radiusMpc * radiusMpc;

  const packedIds: number[] = [];
  for (const { source, catalog } of catalogs) {
    const { positions, count } = catalog;
    // Hoist the source-shift into a local — packSelection is small but
    // calling it 3.5M times still costs more than inlining.
    for (let i = 0; i < count; i++) {
      const base = i * 3;
      const dx = positions[base + 0]! - cx;
      const dy = positions[base + 1]! - cy;
      const dz = positions[base + 2]! - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < r2) {
        packedIds.push(packSelection(source, i));
      }
    }
  }
  return { count: packedIds.length, packedIds };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/utils/cluster/clusterMembership.test.ts`
Expected: PASS.

- [ ] **Step 6: Run typecheck + full test suite**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/utils/cluster/clusterMembership.ts tests/utils/cluster/clusterMembership.test.ts
git commit -m "$(cat <<'EOF'
feat(utils): pure clusterMembership cone-search

O(N) sweep over loaded catalogs returning packed-identity members of
distance(g, center) < radiusMpc. Strict less-than makes the ring a
hard edge (spec §11.6). No internal cache — subsystems memoise per
(poiId, dataRev) per spec §4.3.

Foundations sub-plan; consumed by the focus subsystem in plan 4.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: `FocusState` type stub

### Task 5.1: Create the `FocusState` type for sub-plan-4 consumption

**Files:**
- Create: `src/@types/engine/state/FocusState.d.ts`

This task creates the type but does **not** add a `focus` field to `EngineState`. That wiring is plan 4's job — it owns the subsystem lifecycle that will initialise / mutate the state.

- [ ] **Step 1: Confirm the file does not exist**

Run: `ls src/@types/engine/state/FocusState.d.ts 2>/dev/null || echo "ABSENT"`
Expected: ABSENT.

- [ ] **Step 2: Create the type**

Create `src/@types/engine/state/FocusState.d.ts`:

```ts
/**
 * FocusState — selected-POI state for the cluster-viz focus mode.
 *
 * The focus subsystem (created in plan 4) owns one of these at a time:
 * either the user has a POI selected and the field is fully populated,
 * or `active === false` and the rest of the fields hold whatever was
 * last selected (so the uniform-write path doesn't have to special-case
 * "no selection" — the shader reads `active === false` and skips the
 * member alpha-multiplier branch).
 *
 * Why a single record (rather than `FocusState | null`):
 *   - The shader uniform block is always present in the bind group;
 *     a `null` would require either a separate "active" flag bookkept
 *     in the subsystem or a per-frame conditional bind-group rebind.
 *     Carrying `active: boolean` in-band keeps the shader and CPU
 *     paths uniform.
 *   - The `memberPackedIds` array is reused across same-POI re-focus
 *     events; nullifying it on deactivation would force a recomputation
 *     on every reactivation. Same field, `active = false`, no recompute.
 *
 * Why `invert` (not `category === 'void'`):
 *   - The shader's alpha multiplier needs a single bit, not a category
 *     string. Decoding `category === 'void'` on the CPU and packing
 *     the result into a u32 uniform keeps the shader's branch logic
 *     in the language that's good at branches (TypeScript) and the
 *     shader's arithmetic in the language that's good at arithmetic
 *     (WGSL).
 *
 * **Not yet wired into `EngineState`.** This file lands the type for
 * plan 4 to import; plan 4's bootstrap adds the `state.focus` field
 * and the subsystem that mutates it.
 */

import type { Vec3 } from '../../math/Vec3';

export type FocusState = {
  /**
   * Stable POI identifier (matches `PointOfInterest.id`). Used to key
   * the membership cache (`(poiId, dataRev) → packedIds`) and to wire
   * the URL hash echo.
   */
  readonly poiId: string;

  /**
   * POI category — controls the shader's `invert` semantics, the
   * camera framing multiplier (plan 3 §5.3), and the InfoCard layout.
   * Kept as a string here for ergonomics; the shader gets the boolean
   * `invert` derived from this on the CPU side.
   */
  readonly category: 'cluster' | 'supercluster' | 'void';

  /**
   * Packed-identity members from `clusterMembership(...)`. CPU-side
   * consumers (InfoCard count text, tour iterator, etc.) read this
   * directly; the shader's membership test recomputes per-vertex from
   * `(center, radiusMpc)` rather than uploading this array.
   */
  readonly memberPackedIds: readonly number[];

  /**
   * World-space center of the POI (Mpc). Mirrors
   * `PointOfInterest.worldPos`. Carried separately so the focus
   * uniform write doesn't have to re-resolve the POI by id every frame.
   */
  readonly center: Vec3;

  /**
   * Physical radius of the structure in Mpc — same value the POI's
   * marker ring is drawn at, and the cone-search radius that produced
   * `memberPackedIds`.
   */
  readonly radiusMpc: number;

  /**
   * `true` for void POIs (galaxies INSIDE the ring fade; outside stay
   * bright — preserves the wall structure). `false` for clusters and
   * superclusters (galaxies INSIDE stay bright; outside fade).
   * Derived from `category` on the CPU side, packed as a `u32` into
   * the shader's FocusUniforms block.
   */
  readonly invert: boolean;

  /**
   * `true` while the focus is engaged; `false` after a clear gesture
   * (click empty space, close button, ESC). The shader reads this
   * to short-circuit the member alpha-multiplier branch when no
   * selection is active.
   */
  readonly active: boolean;
};
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — the type is a leaf .d.ts; nothing imports it yet.

- [ ] **Step 4: Commit**

```bash
git add src/@types/engine/state/FocusState.d.ts
git commit -m "$(cat <<'EOF'
feat(types): add FocusState type stub for cluster-viz focus mode

Lands the type that sub-plan 4 (member isolation focus mode) will
import. Not yet wired into EngineState — that wiring belongs to the
plan that also lands the subsystem that mutates it. Type-only commit;
no runtime change.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: Final verification

### Task 6.1: Whole-suite verification + dev-server visual check

**Files:** none — pure verification.

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: PASS. Confirm the suite count is at least 590 + the new tests added in this plan (clusterMembership ~7 tests, sources POI block ~4 tests, selectionEncoding additions ~7 tests, clusterAnchors ~4 tests).

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: PASS — TypeScript + Vite both succeed. The build catches issues that `typecheck` alone misses (e.g. shader-link errors when WESL imports drift).

- [ ] **Step 4: Sanity-check the dev server visually**

If the dev server is running (it usually is per project conventions), refresh the browser and confirm:
- The cluster crosshairs still render (they're not removed until sub-plan 2).
- Their sizes match the new literature-grounded radii (Coma's crosshair is visibly smaller, Boötes Void's visibly larger — see Task 3.3 Step 4).
- No new console errors.
- Clicking a galaxy still works as before (no POI-pick path exists yet; the deprecated `unpackPickGalaxyOnly` shim is in place).

If the dev server is not running, skip this step — sub-plan 2 will do a full visual pass.

- [ ] **Step 5: No commit needed — verification only**

If everything passes, the foundations sub-plan is complete and ready for sub-plan 2 (at-rest viz) to consume the new symbols.

---

## What's deliberately NOT in this sub-plan

Listed here so a reviewer can quickly confirm scope:

- **No `clusterMarkerRenderer`** — sub-plan 2.
- **No `halo.wesl`, `ring.wesl`, `ringPick.wesl`** — sub-plan 2.
- **No removal of `makeCrosshairLines`** — sub-plan 2 swaps it for `produceMarkers`.
- **No `commitPoiFocus`, `poiFocusTween`, `focusOnPoi` handle, `onPoiFocusChange` callback** — sub-plan 3.
- **No `wireInput.ts` dispatch on `result.kind` for POI hits** — sub-plan 3. The deprecated `unpackPickGalaxyOnly` shim keeps the build green in the interim.
- **No `clusterFocusSubsystem`, no `FocusUniforms` shader binding, no `points/vertex.wesl` edit, no `EngineState.focus` field** — sub-plan 4.
- **No InfoCard panel for POIs** — sub-plan 3 (InfoCard chrome) + plan 4 (member count text).

If any of these slipped into this plan, that's a scope error — flag during review and pull them back out.
