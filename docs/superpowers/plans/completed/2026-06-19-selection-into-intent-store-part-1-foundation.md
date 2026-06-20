# Selection into the Intent Store — Part 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Land the foundation for folding selection (hover/select/focus) into the RTK store — the builder/codec split, the three sibling slices + selectors, and the reconciler saga — additive and behind the existing `selectionSubsystem`, with NO behaviour change yet and the suite green at every step.

**Architecture:** Split selection identity from display. Identity becomes a serializable `SelectionRef` Intent in a `selection` slice; display becomes a small serializable `SelectionRow` derived cache in a sibling `selectionRows` slice, kept in sync by a single reconciler saga (`watchSelectionRows`) that reaches engine resources through the injected `SagaContext` (`resolveDeps`). `galaxyInfoBuilder.ts` splits along the engine/React seam into `extractGalaxyRow` (cloud reads → serializable `GalaxyRow`) + pure `buildGalaxyInfo` (formatting → `GalaxyInfo`). React-side `buildFocusable` builds the view-model from the row in a memoized reselect selector. This part wires all of it up additively; the existing `selectionSubsystem` is still the source of truth until Part 2.

**Tech Stack:** TypeScript, Redux Toolkit (`createSlice`/`createAction`/`createSelector`), `typed-redux-saga`, `react-redux`, Vitest. WebGPU engine (untouched here except the commit-path dispatch + `SagaContext` extension).

## Global Constraints

- One type per file in `src/@types/` (filename = type name); one function per file in `src/utils/` (filename = fn name); deep relative imports, no barrels.
- `type` aliases never `interface`. Use `Vec2`/`Vec3` from `src/@types/math`, never raw `[number,number]` / `[number,number,number]` tuples.
- RTK slice-reducer args are named after the slice (observed in `tierSlice.ts`: arg `tier`; in `settingsSlice.ts`: arg `settings`) or `state` — NEVER terse `s`/`a`. For the new slices: use `selection`, `selectionRows`, `dataStatus`, and `action` for the `PayloadAction`.
- react-redux (`useAppSelector`/`useAppDispatch`/`useAppStore`) is imported ONLY in `src/store/hooks.ts` consumers (React); NEVER in `src/state/` or `src/services/`. Engine/saga code reaches the store via `store.dispatch` / `store.getState` / `select`.
- Serializability + immutability checks are ON in the store (`createAppStore` keeps RTK defaults). Every stored shape must be flat serializable primitives — `objId` is a **string** (never `bigint`); no `Map`/`Set`.
- Didactic comments: explain WHY + the alternative, multi-paragraph module headers where the surrounding files have them. Match the existing house style (see `tierSlice.ts`, `galaxyInfoBuilder.ts`).
- Suite must stay green at each task. The repo currently has 2687 tests passing (`npm test`). Typecheck is `npm run typecheck` (runs both src + tools tsconfigs).
- Tests mirror the `src/` tree under `tests/`.
- Commit steps stage SPECIFIC paths (never `git add -A` / `git add .`). Use the user's git identity (no `--author`). End every commit message body with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure (Part 1)

New `@types`:
- `src/@types/engine/SelectionRef.d.ts` — the identity Intent union.
- `src/@types/engine/GalaxyRow.d.ts` — the serializable galaxy projection.
- `src/@types/engine/SelectionRow.d.ts` — the display projection union.
- `src/@types/engine/SelectionSlot.d.ts` — `keyof SelectionState` named once.
- `src/@types/engine/ResolveDeps.d.ts` — live catalogs/famousMeta/structures bag.
- `src/@types/store/SelectionState.d.ts`, `SelectionRowsState.d.ts`, `DataStatusState.d.ts` — the three slice state shapes.

New engine helpers:
- `src/services/engine/helpers/extractGalaxyRow.ts` — cloud reads → `GalaxyRow`.
- `src/services/engine/helpers/extractSelectionRow.ts` — `(ref, deps) → SelectionRow | null`, table-dispatched.

New React-importable builders (live under `src/services/engine/helpers/` but import only pure utils + `@types`, so React can import them):
- `src/services/engine/helpers/buildGalaxyInfo.ts` — pure `GalaxyRow → GalaxyInfo` (the formatting half of today's builder).
- `src/services/engine/helpers/buildFocusable.ts` — `SelectionRow | null → FocusableTarget | null`, table-dispatched.

New codecs:
- `src/services/url/focusIdOf.ts` — `(ref, deps) → string`.
- `src/services/url/resolveFocusId.ts` — `(focusId, deps) → SelectionRef | null`.

New store slices + plumbing:
- `src/store/constants.ts` — add `selectionRoute`, `selectionRowsRoute`, `dataStatusRoute` (Modify).
- `src/state/selection/selectionSlice.ts` — refs slice + actions.
- `src/state/selection/requestFocus.ts` — reducer-less command.
- `src/state/selectionRows/selectionRowsSlice.ts` — rows slice + `setSelectionRow`.
- `src/state/dataStatus/dataStatusSlice.ts` — `catalogLoaded` + state.
- `src/state/selection/selectors.ts` — input + reselect build-selectors.
- `src/store/rootReducer.ts` — add the three route entries (Modify).
- `src/store/types.ts` — extend `SagaContext` (Modify).

New saga:
- `src/state/selectionRows/selectionRowsSaga.ts` — `watchSelectionRows` (the reconciler).
- `src/store/rootSaga.ts` — fork `watchSelectionRows` (Modify).

Modified engine wiring:
- `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts` — dispatch `catalogLoaded` from the commit path (Modify).
- `src/services/engine/engine.ts` — extend `setSagaContext` with `resolveDeps` (`requestRender` already arrives via the `reconcile` bag from PR #352) (Modify).

**Produces (consumed by Part 2 — exact names/types):**
- `SelectionRef` (`src/@types/engine/SelectionRef.d.ts`)
- `SelectionRow`, `GalaxyRow` (`src/@types/engine/SelectionRow.d.ts`, `GalaxyRow.d.ts`)
- `SelectionSlot` (`src/@types/engine/SelectionSlot.d.ts`)
- `ResolveDeps` (`src/@types/engine/ResolveDeps.d.ts`)
- slice actions `updateSelectionHover`, `updateSelectionSelect`, `updateSelectionFocus`, `clearSelection` (`src/state/selection/selectionSlice.ts`)
- `requestFocus` (`src/state/selection/requestFocus.ts`)
- `setSelectionRow` (`src/state/selectionRows/selectionRowsSlice.ts`)
- `catalogLoaded` (`src/state/dataStatus/dataStatusSlice.ts`)
- selectors `selectSelectedFocusable`, `selectHoveredFocusable`, `selectFocusedFocusable`, `selectIsSelectionActive`, and the slot ref selectors (`src/state/selection/selectors.ts`)
- `focusIdOf`, `resolveFocusId` (`src/services/url/`)
- extended `SagaContext = { runTierTransition; reconcile; resolveDeps }` (`src/store/types.ts`) — `requestRender` is reached via `reconcile.requestRender`, not a top-level member

---

## Task 1: Characterize today's `galaxyInfoBuilder` output (golden test before the split)

The split in Task 2/3 must preserve behaviour exactly. Pin a golden snapshot of `buildGalaxyInfo` (today's combined extract+format function) over a representative cloud fixture BEFORE moving anything. Task 3 re-asserts the SAME golden equals `buildGalaxyInfo(extractGalaxyRow(...))`.

**Files:**
- Test: `tests/services/engine/helpers/galaxyInfoBuilderCharacterization.test.ts` (Create)

**Interfaces:**
- Consumes: `buildGalaxyInfo(cloud: GalaxyCatalog, idx: number, source: SourceType, famousMeta?: readonly FamousMetaEntry[]): GalaxyInfo` from `src/services/engine/helpers/galaxyInfoBuilder.ts` (today's combined function).
- Produces: a reusable fixture builder + golden assertions later tasks reuse.

- [x] **Step 1: Find an existing galaxy-catalog test fixture to reuse**

Run: `ls tests/services/engine/helpers/ | head -40` and `grep -rl "buildGalaxyInfo" tests/`
Expected: locate any existing fixture helper that builds a small `GalaxyCatalog` (e.g. a `makeCloud`/`fakeCatalog` helper). If none exists, the next step builds one inline.

- [x] **Step 2: Write the characterization test**

Build a minimal real `GalaxyCatalog` (one SDSS-ish row + one famous row) and snapshot the full `GalaxyInfo` for each. Use a hand-built cloud so the test is self-contained.

```ts
/**
 * Characterization (golden) test for buildGalaxyInfo BEFORE the extract/build
 * split. This pins the exact GalaxyInfo today's combined builder produces so
 * the split task can prove buildGalaxyInfo(extractGalaxyRow(...)) is byte-equal.
 * Deliberately a snapshot of the WHOLE object: the split must not perturb any
 * derived field (sexagesimal, distance, colours, displayName, urls, provenance).
 */
import { describe, it, expect } from 'vitest';

import { buildGalaxyInfo } from '../../../../src/services/engine/helpers/galaxyInfoBuilder';
import { Source } from '../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { FamousMetaEntry } from '../../../../src/@types/loading/FamousMetaEntry';

// A single-row cloud at a known position with known photometry. Positions are
// world-space Mpc; values chosen so RA/Dec/distance are non-degenerate.
function makeCloud(over: Partial<GalaxyCatalog> = {}): GalaxyCatalog {
  const count = 1;
  return {
    count,
    positions: new Float32Array([10, 20, 30]),
    spectroscopicZ: new Float32Array([0.0123]),
    magU: new Float32Array([18.1]),
    magG: new Float32Array([17.4]),
    magR: new Float32Array([16.9]),
    magI: new Float32Array([16.6]),
    magZ: new Float32Array([16.4]),
    objIDs: new BigInt64Array([1237668n]),
    diameterKpc: new Float32Array([42]),
    axisRatio: new Float32Array([0.7]),
    positionAngleDeg: new Float32Array([35]),
    classByte: new Uint8Array([0]),
    parentSurveyByte: new Uint8Array([0]),
    ...over,
  } as unknown as GalaxyCatalog;
}

describe('buildGalaxyInfo characterization', () => {
  it('SDSS row golden', () => {
    const info = buildGalaxyInfo(makeCloud(), 0, Source.SDSS);
    expect(info).toMatchSnapshot();
  });

  it('famous row golden', () => {
    const famousMeta: readonly FamousMetaEntry[] = [
      { id: 'm31', names: ['M31', 'NGC 224'], commonName: 'Andromeda Galaxy', description: 'desc', type: 'SBb' },
    ];
    const info = buildGalaxyInfo(makeCloud({ objIDs: new BigInt64Array([224n]) }), 0, Source.FamousGalaxy, famousMeta);
    expect(info).toMatchSnapshot();
  });
});
```

- [x] **Step 3: Run the test to create the snapshot**

Run: `npm test -- tests/services/engine/helpers/galaxyInfoBuilderCharacterization.test.ts`
Expected: PASS, writing a new `.snap` file. If the `GalaxyCatalog` shape mismatch causes a TypeScript/runtime error, fix the fixture's field names against `src/@types/data/galaxyCatalog/GalaxyCatalog.d.ts` (read it) until it builds a valid cloud and the snapshot is created.

- [x] **Step 4: Commit**

```bash
git add tests/services/engine/helpers/galaxyInfoBuilderCharacterization.test.ts tests/services/engine/helpers/__snapshots__/galaxyInfoBuilderCharacterization.test.ts.snap
git commit -m "test(engine): characterize galaxyInfoBuilder before the extract/build split

Golden snapshot of GalaxyInfo for an SDSS row and a famous row, so the
upcoming extractGalaxyRow/buildGalaxyInfo split can prove byte-equality.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `GalaxyRow` type + `extractGalaxyRow` (the cloud-reads half)

Split the cloud reads out of `galaxyInfoBuilder`. `extractGalaxyRow` reads the ~18 raw slots into a serializable `GalaxyRow` (objId as a **string**). No formatting here — that stays in `buildGalaxyInfo` (Task 3).

**Files:**
- Create: `src/@types/engine/GalaxyRow.d.ts`
- Create: `src/services/engine/helpers/extractGalaxyRow.ts`
- Test: `tests/services/engine/helpers/extractGalaxyRow.test.ts`

**Interfaces:**
- Consumes: `GalaxyCatalog` (`src/@types/data/galaxyCatalog/GalaxyCatalog`), `GalaxyCatalogSourceType` (`src/@types/data/galaxyCatalog/GalaxyCatalogSourceType`), `SourceType` (`src/@types/data/SourceType`), `FamousMetaEntry` (`src/@types/loading/FamousMetaEntry`), `Source` (`src/data/sources`).
- Produces: `GalaxyRow` type; `extractGalaxyRow(cloud: GalaxyCatalog | undefined, idx: number, source: GalaxyCatalogSourceType, famousMeta?: readonly FamousMetaEntry[]): GalaxyRow | null`.

- [x] **Step 1: Write the `GalaxyRow` type**

Note vs spec: the spec's §1 `GalaxyRow` omits `classByte` + `parentSurveyByte`, but `buildGalaxyInfo` reads them for the Milliquas `agnClass` + `displayName`. They are raw cloud bytes, so they belong in the row. Include them.

```ts
// src/@types/engine/GalaxyRow.d.ts
import type { GalaxyCatalogSourceType } from '../data/galaxyCatalog/GalaxyCatalogSourceType';

/**
 * GalaxyRow — the serializable projection of a single galaxy's CLOUD-SOURCED
 * primitives, extracted engine-side (it touches the GPU-adjacent CPU cloud
 * arrays) so React can build the heavy `GalaxyInfo` from it purely.
 *
 * It is exactly the raw inputs `buildGalaxyInfo` needs — positions, the stored
 * spectroscopic redshift, the five mag slots, diameter, orientation, the
 * per-record class/parent bytes, plus the optional famous-meta block — and
 * nothing derived. Every derived field (sexagesimal, distance, colours, urls,
 * provenance) is a PURE function of these, so it computes React-side.
 *
 * `objId` is a STRING, not a bigint: this row is stored in the RTK
 * `selectionRows` slice, where the serializability check is on. The string is
 * the decimal form of the catalog `objID`; `buildGalaxyInfo` parses it back to
 * a bigint with `BigInt(objId)` where the URL/name logic needs it.
 */
export type GalaxyRow = {
  readonly type: 'galaxyCatalog';
  readonly source: GalaxyCatalogSourceType;
  readonly index: number;
  readonly objId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly redshift: number;
  readonly magU: number;
  readonly magG: number;
  readonly magR: number;
  readonly magI: number;
  readonly magZ: number;
  readonly diameterKpc: number;
  readonly axisRatio: number;
  readonly positionAngleDeg: number;
  readonly classByte: number;
  readonly parentSurveyByte: number;
  readonly famous?: {
    readonly id: string;
    readonly commonName?: string;
    readonly names: readonly string[];
    readonly description: string;
    readonly type: string;
  };
};
```

- [x] **Step 2: Write the failing test for `extractGalaxyRow`**

```ts
import { describe, it, expect } from 'vitest';

import { extractGalaxyRow } from '../../../../src/services/engine/helpers/extractGalaxyRow';
import { Source } from '../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

function makeCloud(): GalaxyCatalog {
  return {
    count: 1,
    positions: new Float32Array([10, 20, 30]),
    spectroscopicZ: new Float32Array([0.0123]),
    magU: new Float32Array([18.1]),
    magG: new Float32Array([17.4]),
    magR: new Float32Array([16.9]),
    magI: new Float32Array([16.6]),
    magZ: new Float32Array([16.4]),
    objIDs: new BigInt64Array([1237668n]),
    diameterKpc: new Float32Array([42]),
    axisRatio: new Float32Array([0.7]),
    positionAngleDeg: new Float32Array([35]),
    classByte: new Uint8Array([0]),
    parentSurveyByte: new Uint8Array([0]),
  } as unknown as GalaxyCatalog;
}

describe('extractGalaxyRow', () => {
  it('reads the raw cloud slots into a serializable row (objId as string)', () => {
    const row = extractGalaxyRow(makeCloud(), 0, Source.SDSS);
    expect(row).toMatchObject({
      type: 'galaxyCatalog',
      source: Source.SDSS,
      index: 0,
      objId: '1237668',
      x: 10,
      y: 20,
      z: 30,
      magG: expect.closeTo(17.4, 4),
      diameterKpc: expect.closeTo(42, 4),
      axisRatio: expect.closeTo(0.7, 4),
      positionAngleDeg: expect.closeTo(35, 4),
      classByte: 0,
      parentSurveyByte: 0,
    });
    // No bigint anywhere — JSON round-trip must succeed.
    expect(() => JSON.stringify(row)).not.toThrow();
  });

  it('returns null for an out-of-bounds index or missing cloud (tier-swap race guard)', () => {
    expect(extractGalaxyRow(makeCloud(), 5, Source.SDSS)).toBeNull();
    expect(extractGalaxyRow(undefined, 0, Source.SDSS)).toBeNull();
  });
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `npm test -- tests/services/engine/helpers/extractGalaxyRow.test.ts`
Expected: FAIL with "Cannot find module '.../extractGalaxyRow'".

- [x] **Step 4: Implement `extractGalaxyRow`**

```ts
/**
 * extractGalaxyRow — the cloud-reading half of the old galaxyInfoBuilder.
 *
 * Reads the raw per-galaxy slots at `idx` off the CPU cloud mirror into a flat,
 * serializable `GalaxyRow`. This is the only engine-side step in the selection
 * read path; everything downstream (`buildGalaxyInfo`) is pure formatting that
 * runs React-side. The bounds + missing-cloud guards are the tier-swap race
 * defence: an index that no longer fits a just-shrunk cloud resolves to null
 * rather than reading past the typed array.
 *
 * The catalog `objID` (a bigint, SDSS ids exceed 2^53) is stringified here so
 * the row stays JSON-serializable for the RTK slice; `buildGalaxyInfo` parses
 * it back with `BigInt(...)` where it needs the numeric identity.
 */
import { Source } from '../../../data/sources';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { FamousMetaEntry } from '../../../@types/loading/FamousMetaEntry';
import type { GalaxyRow } from '../../../@types/engine/GalaxyRow';

export function extractGalaxyRow(
  cloud: GalaxyCatalog | undefined,
  idx: number,
  source: GalaxyCatalogSourceType,
  famousMeta?: readonly FamousMetaEntry[],
): GalaxyRow | null {
  if (!cloud) return null;
  if (idx < 0 || idx >= cloud.count) return null;

  const famousEntry =
    source === Source.FamousGalaxy && famousMeta ? famousMeta[idx] : undefined;
  const famous = famousEntry
    ? {
        id: famousEntry.id,
        ...(famousEntry.commonName !== undefined ? { commonName: famousEntry.commonName } : {}),
        names: famousEntry.names,
        description: famousEntry.description,
        type: famousEntry.type,
      }
    : undefined;

  return {
    type: 'galaxyCatalog',
    source,
    index: idx,
    objId: cloud.objIDs[idx]!.toString(),
    x: cloud.positions[idx * 3 + 0]!,
    y: cloud.positions[idx * 3 + 1]!,
    z: cloud.positions[idx * 3 + 2]!,
    redshift: cloud.spectroscopicZ[idx]!,
    magU: cloud.magU[idx]!,
    magG: cloud.magG[idx]!,
    magR: cloud.magR[idx]!,
    magI: cloud.magI[idx]!,
    magZ: cloud.magZ[idx]!,
    diameterKpc: cloud.diameterKpc[idx]!,
    axisRatio: cloud.axisRatio[idx]!,
    positionAngleDeg: cloud.positionAngleDeg[idx]!,
    classByte: cloud.classByte[idx]!,
    parentSurveyByte: cloud.parentSurveyByte[idx]!,
    ...(famous ? { famous } : {}),
  };
}
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/services/engine/helpers/extractGalaxyRow.test.ts`
Expected: PASS (both tests).

- [x] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/@types/engine/GalaxyRow.d.ts src/services/engine/helpers/extractGalaxyRow.ts tests/services/engine/helpers/extractGalaxyRow.test.ts
git commit -m "feat(engine): add GalaxyRow + extractGalaxyRow (cloud-reads half of the builder)

Serializable per-galaxy projection (objId as a string) read off the CPU
cloud at an index, with the tier-swap bounds guard. The formatting half
follows in buildGalaxyInfo.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Split `galaxyInfoBuilder` — `buildGalaxyInfo(row)` (the pure-format half)

Re-author `buildGalaxyInfo` to take a `GalaxyRow` (not a cloud + idx) and produce `GalaxyInfo`, lifting all the formatting verbatim from today's combined builder. Prove `buildGalaxyInfo(extractGalaxyRow(...))` equals the Task 1 golden. The combined function's signature is repointed; `resolveGalaxyInfo` (used by the current pick path) is updated to compose extract+build so the existing subsystem keeps working unchanged.

**Files:**
- Create: `src/services/engine/helpers/buildGalaxyInfo.ts`
- Modify: `src/services/engine/helpers/galaxyInfoBuilder.ts` (becomes a thin re-export + `maxAbsCoord`/`niceRound` home; or delete `buildGalaxyInfo` from it — see steps)
- Modify: `src/services/engine/helpers/resolveGalaxyInfo.ts` (compose extract + build)
- Test: `tests/services/engine/helpers/buildGalaxyInfo.test.ts`
- Test: reuse `tests/services/engine/helpers/galaxyInfoBuilderCharacterization.test.ts` (repoint its import)

**Interfaces:**
- Consumes: `GalaxyRow`, `extractGalaxyRow`, all pure utils today's builder imports (`cartesianToRaDecZ`, `formatRaSexagesimal`, `formatDecSexagesimal`, `iauName`, `iauRaDecSuffix`, `lookbackTimeGyr`, `hubbleVelocityKmS`, `absoluteMagnitude`, `earthEraForLookback`, `galaxyType`, `sdssExplorerUrl`, `sdssThumbnailUrl`, `dssThumbnailUrl`, `galaxyThumbnailFovArcmin`, `nedByNameUrl`, `nedNearPositionUrl`, `DEFAULT_GALAXY_DIAMETER_KPC` from `utils/math`; `sourceClassLabel`, `milliquasParentSurveyPrefix` from `data/galaxyCatalog/sourceClass`; `famousDisplayName`, `fallbackOrientation`, `formatMorphology`, `famousWikipediaTitle`; `SOURCE_REGISTRY`, `Source`).
- Produces: `buildGalaxyInfo(row: GalaxyRow): GalaxyInfo`.

- [x] **Step 1: Write `buildGalaxyInfo(row)` — pure formatting from the row**

Lift the formatting body of today's `galaxyInfoBuilder.ts` (lines ~136–537) verbatim, but read every input off `row` instead of `cloud[idx]`. The mechanical substitutions are:
- `px,py,pz` ← `row.x,row.y,row.z`
- `storedZ` ← `row.redshift`; keep the `Number.isFinite(storedZ) ? storedZ : fallbackRedshift` logic (fallback still from `cartesianToRaDecZ`).
- `magU..magZ` ← `row.magU..row.magZ`
- `objID` ← `BigInt(row.objId)` (parse the string back to a bigint once, near the top)
- `source` ← `row.source`
- `cloud.diameterKpc[idx]` ← `row.diameterKpc`; `cloud.axisRatio[idx]` ← `row.axisRatio`; `cloud.positionAngleDeg[idx]` ← `row.positionAngleDeg`
- `cloud.classByte[idx]` ← `row.classByte`; `cloud.parentSurveyByte[idx]` ← `row.parentSurveyByte`
- the famous block: read `row.famous` directly (already extracted) — set `famousEntry = row.famous` and reuse it for the catalogue/thumbnail/displayName logic. Note `row.famous.names` is `readonly string[]`; spreads/`[0]` work unchanged.

```ts
/**
 * buildGalaxyInfo — the PURE formatting half of the old galaxyInfoBuilder.
 *
 * Takes a serializable `GalaxyRow` (the cloud reads `extractGalaxyRow`
 * produced) and computes the full display-ready `GalaxyInfo`: sky coordinates,
 * distance, lookback, colours, IAU name, catalogue + thumbnail URLs, the
 * orientation/diameter provenance, the famous enrichment, and the display-name
 * ladder. Every helper it calls is a pure util, so this function imports no
 * engine state and no GPU — which is exactly why React can call it directly in
 * a memoized selector (the inverse of today's engine-bakes-GalaxyInfo flow).
 *
 * `row.objId` is the decimal string of the catalog objID; we parse it back to
 * a bigint once here because the SDSS/PGC URL + name logic compares it to 0n.
 */
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import {
  sourceClassLabel,
  milliquasParentSurveyPrefix,
} from '../../../data/galaxyCatalog/sourceClass';
import { famousDisplayName } from './famousDisplayName';
import { fallbackOrientation } from '../../../utils/random/fallbackOrientation';
import { formatMorphology } from '../../../utils/format/formatMorphology';
import { famousWikipediaTitle } from '../../../utils/format/famousWikipediaTitle';
import {
  cartesianToRaDecZ,
  formatRaSexagesimal,
  formatDecSexagesimal,
  iauName,
  iauRaDecSuffix,
  lookbackTimeGyr,
  hubbleVelocityKmS,
  absoluteMagnitude,
  earthEraForLookback,
  galaxyType,
  sdssExplorerUrl,
  sdssThumbnailUrl,
  dssThumbnailUrl,
  galaxyThumbnailFovArcmin,
  nedByNameUrl,
  nedNearPositionUrl,
  DEFAULT_GALAXY_DIAMETER_KPC,
} from '../../../utils/math';
import type { GalaxyInfo } from '../../../@types/engine/GalaxyInfo';
import type { GalaxyRow } from '../../../@types/engine/GalaxyRow';

export function buildGalaxyInfo(row: GalaxyRow): GalaxyInfo {
  const { x: px, y: py, z: pz, source } = row;
  const objID = BigInt(row.objId);

  const [ra, dec, fallbackRedshift] = cartesianToRaDecZ(px, py, pz);
  const redshift = Number.isFinite(row.redshift) ? row.redshift : fallbackRedshift;
  const distanceMpc = Math.sqrt(px * px + py * py + pz * pz);

  const { magU, magG, magR, magI, magZ } = row;

  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'galaxyCatalog') {
    throw new Error(`buildGalaxyInfo: non-galaxy catalog source ${source} has no photometric bands`);
  }
  const bands = entry.bandLabels;

  const candidatePairs: Array<[keyof typeof bands, keyof typeof bands, number]> = [
    ['u', 'g', magU - magG],
    ['g', 'r', magG - magR],
    ['r', 'i', magR - magI],
    ['i', 'z', magI - magZ],
  ];
  const colours: Array<{ label: string; value: number }> = [];
  for (const [a, b, value] of candidatePairs) {
    if (bands[a] === '—' || bands[b] === '—') continue;
    if (!Number.isFinite(value)) continue;
    colours.push({ label: `${bands[a]}−${bands[b]}`, value });
  }

  const isSdss = source === Source.SDSS;
  const famousEntry = row.famous;
  let primaryCatalogue: { label: string; href: string } | null;
  if (isSdss && objID > 0n) {
    primaryCatalogue = { label: 'SDSS Explorer', href: sdssExplorerUrl(objID) };
  } else if (source === Source.TwoMRS) {
    primaryCatalogue = { label: 'NED', href: nedNearPositionUrl(ra, dec) };
  } else if (source === Source.Glade) {
    primaryCatalogue = {
      label: 'NED',
      href: objID > 0n ? nedByNameUrl(`PGC ${objID}`) : nedNearPositionUrl(ra, dec),
    };
  } else if (famousEntry) {
    primaryCatalogue = { label: 'NED', href: nedByNameUrl(famousEntry.names[0]!) };
  } else if (source === Source.SDSS) {
    primaryCatalogue = { label: 'NED', href: nedNearPositionUrl(ra, dec) };
  } else {
    primaryCatalogue = null;
  }
  const catalogues: GalaxyInfo['catalogues'] = [];
  if (primaryCatalogue) catalogues.push(primaryCatalogue);
  if (famousEntry) {
    catalogues.push({
      label: 'Wikipedia',
      href: `https://en.wikipedia.org/wiki/${encodeURIComponent(
        famousWikipediaTitle([...famousEntry.names]).replace(/ /g, '_'),
      )}`,
    });
  }

  const fovArcmin = galaxyThumbnailFovArcmin(row.diameterKpc, distanceMpc);
  const surveyThumbnailUrl = isSdss
    ? sdssThumbnailUrl(ra, dec, 200, fovArcmin)
    : dssThumbnailUrl(ra, dec, fovArcmin);
  const thumbnailUrl = famousEntry
    ? `/images/famous-thumb/${famousEntry.id}.webp`
    : surveyThumbnailUrl;
  const thumbnailFallbackUrl = famousEntry ? surveyThumbnailUrl : undefined;

  const ar = row.axisRatio;
  const pa = row.positionAngleDeg;
  const fb = fallbackOrientation(objID, ra, dec);
  const fbAr = new Float32Array([fb.axisRatio])[0]!;
  const fbPa = new Float32Array([fb.positionAngleDeg])[0]!;
  const isFallback = ar === fbAr && pa === fbPa;
  let provenance: string;
  if (isFallback) {
    provenance = 'deterministic fallback';
  } else if (source === Source.SDSS) {
    provenance = 'SDSS exp+deV blend';
  } else if (source === Source.TwoMRS) {
    provenance = '2MASS XSC sup_phi';
  } else if (source === Source.Glade) {
    provenance = 'HyperLEDA PGC';
  } else {
    provenance = 'deterministic fallback';
  }

  const dKpc = row.diameterKpc;
  let diameterProvenance: string;
  if (dKpc === DEFAULT_GALAXY_DIAMETER_KPC) {
    diameterProvenance = 'fallback (30 kpc)';
  } else if (source === Source.SDSS) {
    diameterProvenance = 'SDSS petroR50_r';
  } else if (source === Source.TwoMRS) {
    diameterProvenance = '2MRS Riso';
  } else if (source === Source.Glade) {
    diameterProvenance = 'GLADE Tully';
  } else {
    diameterProvenance = 'fallback (30 kpc)';
  }

  const agnClass = sourceClassLabel(source, row.classByte) ?? undefined;
  const parentSurveyPrefix = milliquasParentSurveyPrefix(row.parentSurveyByte);
  const milliquasDisplayName =
    source === Source.Milliquas && parentSurveyPrefix !== null
      ? `${parentSurveyPrefix} ${iauRaDecSuffix(ra, dec)}`
      : undefined;

  let famous: GalaxyInfo['famous'];
  if (famousEntry) {
    famous = {
      id: famousEntry.id,
      ...(famousEntry.commonName !== undefined ? { commonName: famousEntry.commonName } : {}),
      names: [...famousEntry.names],
      description: famousEntry.description,
      type: famousEntry.type,
    };
  }
  const morphology = famousEntry?.type ? formatMorphology(famousEntry.type) : undefined;

  return {
    type: 'galaxyCatalog',
    index: row.index,
    objID,
    x: px,
    y: py,
    z: pz,
    ra,
    dec,
    raSexagesimal: formatRaSexagesimal(ra),
    decSexagesimal: formatDecSexagesimal(dec),
    redshift,
    distanceMpc,
    hubbleVelocityKmS: hubbleVelocityKmS(redshift),
    lookbackGyr: lookbackTimeGyr(redshift),
    earthEra: earthEraForLookback(lookbackTimeGyr(redshift)),
    magU,
    magG,
    magR,
    magI,
    magZ,
    absoluteMagG: absoluteMagnitude(magG, distanceMpc),
    galaxyType: galaxyType(source, { magU, magG, magR, magI, magZ }),
    morphology,
    iauName: iauName(source, ra, dec),
    displayName:
      [
        famous ? famousDisplayName(famous) : undefined,
        milliquasDisplayName,
        (source === Source.TwoMRS || source === Source.Glade) && objID > 0n
          ? `PGC ${objID}`
          : undefined,
        iauName(source, ra, dec),
      ].find((c) => c !== undefined && c.length > 0) ?? iauName(source, ra, dec),
    bands,
    colours,
    source,
    sourceLabel: SOURCE_REGISTRY[source].label,
    agnClass,
    catalogues,
    thumbnailUrl,
    ...(thumbnailFallbackUrl !== undefined ? { thumbnailFallbackUrl } : {}),
    diameterKpc: dKpc,
    diameterProvenance,
    orientation: { axisRatio: ar, positionAngleDeg: pa, provenance },
    famous,
  };
}
```

- [x] **Step 2: Repoint `galaxyInfoBuilder.ts` — keep `maxAbsCoord`/`niceRound`, re-export `buildGalaxyInfo`**

In `src/services/engine/helpers/galaxyInfoBuilder.ts`: delete the old combined `buildGalaxyInfo` function body (lines ~100–538) and its now-unused imports, keep `maxAbsCoord` + `niceRound`, and re-export the new builder so existing importers (`engine.ts`, `resolveGalaxyInfo.ts`, tests) keep resolving `buildGalaxyInfo` from here without churn:

```ts
export { buildGalaxyInfo } from './buildGalaxyInfo';
```

Read the file's remaining imports after deletion and remove any that only the old body used (e.g. `cartesianToRaDecZ`, `SOURCE_REGISTRY`, `Source`, the format/url utils) — `npm run typecheck` will flag unused imports if `noUnusedLocals` is on; remove until clean.

- [x] **Step 3: Update `resolveGalaxyInfo` to compose extract + build**

```ts
/**
 * resolveGalaxyInfo — composes the engine-side cloud read (`extractGalaxyRow`)
 * with the pure formatter (`buildGalaxyInfo`). The existing pick path still
 * calls this to get a `GalaxyInfo` for the current selectionSubsystem; the
 * bounds/null guard now lives in extractGalaxyRow.
 */
import { extractGalaxyRow } from './extractGalaxyRow';
import { buildGalaxyInfo } from './buildGalaxyInfo';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { FamousMetaEntry } from '../../../@types/loading/FamousMetaEntry';
import type { GalaxyInfo } from '../../../@types/engine/GalaxyInfo';

export function resolveGalaxyInfo(
  cloud: GalaxyCatalog | undefined,
  localIdx: number,
  source: GalaxyCatalogSourceType,
  famousMeta?: readonly FamousMetaEntry[],
): GalaxyInfo | null {
  const row = extractGalaxyRow(cloud, localIdx, source, famousMeta);
  return row ? buildGalaxyInfo(row) : null;
}
```

Note: `resolveGalaxyInfo`'s `source` param was `SourceType` before; narrow it to `GalaxyCatalogSourceType` to match `extractGalaxyRow`. The caller (`resolvePickTable`) passes `pick.sourceCode` — if that's typed `SourceType`, keep `resolveGalaxyInfo` accepting `SourceType` and cast inside, OR widen `extractGalaxyRow` to `SourceType`. Read `src/@types/data/PickResult.d.ts` to see `sourceCode`'s type; pick the narrowing that typechecks without a cast where possible. If a cast is unavoidable at the pick boundary, leave it there (Part 2 reworks that boundary).

- [x] **Step 4: Write the equality test (extract→build == golden)**

```ts
import { describe, it, expect } from 'vitest';

import { extractGalaxyRow } from '../../../../src/services/engine/helpers/extractGalaxyRow';
import { buildGalaxyInfo } from '../../../../src/services/engine/helpers/buildGalaxyInfo';
import { Source } from '../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { FamousMetaEntry } from '../../../../src/@types/loading/FamousMetaEntry';

function makeCloud(over: Partial<GalaxyCatalog> = {}): GalaxyCatalog {
  return {
    count: 1,
    positions: new Float32Array([10, 20, 30]),
    spectroscopicZ: new Float32Array([0.0123]),
    magU: new Float32Array([18.1]),
    magG: new Float32Array([17.4]),
    magR: new Float32Array([16.9]),
    magI: new Float32Array([16.6]),
    magZ: new Float32Array([16.4]),
    objIDs: new BigInt64Array([1237668n]),
    diameterKpc: new Float32Array([42]),
    axisRatio: new Float32Array([0.7]),
    positionAngleDeg: new Float32Array([35]),
    classByte: new Uint8Array([0]),
    parentSurveyByte: new Uint8Array([0]),
    ...over,
  } as unknown as GalaxyCatalog;
}

describe('buildGalaxyInfo(extractGalaxyRow(...))', () => {
  it('matches the SDSS golden', () => {
    const info = buildGalaxyInfo(extractGalaxyRow(makeCloud(), 0, Source.SDSS)!);
    expect(info).toMatchSnapshot();
  });

  it('matches the famous golden', () => {
    const famousMeta: readonly FamousMetaEntry[] = [
      { id: 'm31', names: ['M31', 'NGC 224'], commonName: 'Andromeda Galaxy', description: 'desc', type: 'SBb' },
    ];
    const info = buildGalaxyInfo(
      extractGalaxyRow(makeCloud({ objIDs: new BigInt64Array([224n]) }), 0, Source.FamousGalaxy, famousMeta)!,
    );
    expect(info).toMatchSnapshot();
  });
});
```

- [x] **Step 5: Cross-check goldens are identical**

Run: `npm test -- tests/services/engine/helpers/buildGalaxyInfo.test.ts tests/services/engine/helpers/galaxyInfoBuilderCharacterization.test.ts`
Expected: BOTH pass. Open both `.snap` files and confirm the `GalaxyInfo` objects are field-for-field identical (the characterization snapshot from Task 1 and the new one). If any field differs, the split perturbed behaviour — fix `buildGalaxyInfo` until they match exactly. (The characterization test still imports `buildGalaxyInfo` from `galaxyInfoBuilder` via the re-export, so it now exercises the composed path indirectly; that is intended.)

- [x] **Step 6: Run full suite + typecheck**

Run: `npm test` then `npm run typecheck`
Expected: PASS (2687+ tests). The existing selection/pick tests still pass because `resolveGalaxyInfo` composes to the same output.

- [x] **Step 7: Commit**

```bash
git add src/services/engine/helpers/buildGalaxyInfo.ts src/services/engine/helpers/galaxyInfoBuilder.ts src/services/engine/helpers/resolveGalaxyInfo.ts tests/services/engine/helpers/buildGalaxyInfo.test.ts
git commit -m "refactor(engine): split galaxyInfoBuilder into extractGalaxyRow + pure buildGalaxyInfo

buildGalaxyInfo now takes a serializable GalaxyRow and does only pure
formatting, so React can call it directly. resolveGalaxyInfo composes the
two; the golden proves byte-equality with the pre-split output.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `SelectionRef` + `SelectionRow` + `SelectionSlot` types

The identity Intent union, the display projection union, and the `SelectionSlot` name (declared once, used everywhere).

**Files:**
- Create: `src/@types/engine/SelectionRef.d.ts`
- Create: `src/@types/engine/SelectionRow.d.ts`
- Create: `src/@types/engine/SelectionSlot.d.ts`
- Create: `src/@types/store/SelectionState.d.ts`
- Test: `tests/@types/selectionTypes.test.ts` (a compile-only type test)

**Interfaces:**
- Consumes: `GalaxyCatalogSourceType`, `GalaxyRow`, `StructureInfo` (`src/@types/data/structure/StructureInfo`).
- Produces: `SelectionRef`, `SelectionRow`, `SelectionSlot`, `SelectionState`.

- [x] **Step 1: Write `SelectionRef`**

```ts
// src/@types/engine/SelectionRef.d.ts
import type { GalaxyCatalogSourceType } from '../data/galaxyCatalog/GalaxyCatalogSourceType';

/**
 * SelectionRef — the identity Intent for a selectable thing. The single
 * authoritative reference the URL hash, tween, dedup, and tier re-anchor all
 * key off. Galaxy refs are POSITIONAL (`index`, drifts on a tier swap — the
 * tier saga re-anchors them by durable id); structure refs carry the durable
 * instance `id`; the Milky Way is a singleton needing no per-instance data.
 *
 * Flat serializable primitives only — this is stored in the RTK `selection`
 * slice with the serializability check on, so no bigint and no class instances.
 */
export type SelectionRef =
  | { readonly type: 'galaxyCatalog'; readonly source: GalaxyCatalogSourceType; readonly index: number }
  | { readonly type: 'structure'; readonly id: string }
  | { readonly type: 'milkyWay' };
```

- [x] **Step 2: Write `SelectionRow`**

```ts
// src/@types/engine/SelectionRow.d.ts
import type { GalaxyRow } from './GalaxyRow';
import type { StructureInfo } from '../data/structure/StructureInfo';

/**
 * SelectionRow — the serializable DISPLAY projection of a selected thing, held
 * in the saga-owned `selectionRows` derived cache. The galaxy arm is the small
 * `GalaxyRow` (built React-side into a `GalaxyInfo` by `buildFocusable`); the
 * structure arm is the already-serializable `StructureInfo` record used as-is;
 * the Milky Way is the singleton tag.
 *
 * Every arm is JSON-serializable (`GalaxyRow.objId` is a string,
 * `StructureInfo` is a plain record), so the RTK serializability check stays on.
 */
export type SelectionRow = GalaxyRow | StructureInfo | { readonly type: 'milkyWay' };
```

- [x] **Step 3: Write `SelectionState` + `SelectionSlot`**

```ts
// src/@types/store/SelectionState.d.ts
import type { SelectionRef } from '../engine/SelectionRef';

/**
 * SelectionState — the three identity-Intent slots. Hover precedes select
 * precedes focus; each holds a SelectionRef or null. This is the durable,
 * persistable/restorable Intent layer (sibling to the volatile SelectionRowsState).
 */
export type SelectionState = {
  readonly hover: SelectionRef | null;
  readonly select: SelectionRef | null;
  readonly focus: SelectionRef | null;
};
```

```ts
// src/@types/engine/SelectionSlot.d.ts
import type { SelectionState } from '../store/SelectionState';

/**
 * SelectionSlot — the slot name shared by every selection surface: the
 * `setSelectionRow` payload, the reconciler's `reextract`, and the tier
 * re-anchor's SELECTION_WRITE_BY_SLOT table. Declared once as `keyof
 * SelectionState` so the three stay in lockstep — adding a slot is a one-line
 * widening of SelectionState that flows everywhere.
 */
export type SelectionSlot = keyof SelectionState;
```

- [x] **Step 4: Write a compile-only type test**

```ts
import { describe, it, expectTypeOf } from 'vitest';

import type { SelectionRef } from '../../src/@types/engine/SelectionRef';
import type { SelectionRow } from '../../src/@types/engine/SelectionRow';
import type { SelectionSlot } from '../../src/@types/engine/SelectionSlot';

describe('selection types', () => {
  it('SelectionSlot is exactly the three slot names', () => {
    expectTypeOf<SelectionSlot>().toEqualTypeOf<'hover' | 'select' | 'focus'>();
  });
  it('SelectionRef discriminates on type', () => {
    const ref: SelectionRef = { type: 'milkyWay' };
    expectTypeOf(ref).toMatchTypeOf<{ type: 'galaxyCatalog' | 'structure' | 'milkyWay' }>();
  });
  it('SelectionRow milkyWay arm is the tag', () => {
    const row: SelectionRow = { type: 'milkyWay' };
    expectTypeOf(row).toMatchTypeOf<SelectionRow>();
  });
});
```

- [x] **Step 5: Run test + typecheck**

Run: `npm test -- tests/@types/selectionTypes.test.ts` then `npm run typecheck`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/@types/engine/SelectionRef.d.ts src/@types/engine/SelectionRow.d.ts src/@types/engine/SelectionSlot.d.ts src/@types/store/SelectionState.d.ts tests/@types/selectionTypes.test.ts
git commit -m "feat(types): add SelectionRef, SelectionRow, SelectionSlot, SelectionState

Identity Intent (ref) + serializable display projection (row) + the slot
name declared once as keyof SelectionState.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `ResolveDeps` type + `extractSelectionRow` + `buildFocusable`

The engine-side resolver bag, the table-dispatched extract, and the pure React-side build.

**Files:**
- Create: `src/@types/engine/ResolveDeps.d.ts`
- Create: `src/services/engine/helpers/extractSelectionRow.ts`
- Create: `src/services/engine/helpers/buildFocusable.ts`
- Test: `tests/services/engine/helpers/extractSelectionRow.test.ts`
- Test: `tests/services/engine/helpers/buildFocusable.test.ts`

**Interfaces:**
- Consumes: `SelectionRef`, `SelectionRow`, `GalaxyRow`, `extractGalaxyRow`, `buildGalaxyInfo`, `FocusableTarget` (`src/@types/engine/FocusableTarget`), `StructureInfo`, `MILKY_WAY_INFO` (`src/data/milkyWay/milkyWayInfo`), `GalaxyCatalog`, `GalaxyCatalogSourceType`, `FamousMetaEntry`.
- Produces: `ResolveDeps`; `extractSelectionRow(ref: SelectionRef | null, deps: ResolveDeps): SelectionRow | null`; `buildFocusable(row: SelectionRow | null): FocusableTarget | null`.

- [x] **Step 1: Write `ResolveDeps`**

Grounded in `wireInput`'s existing resolver wiring (`getCloud`/`getFamousMeta`/`structures`) and the `GalaxyStore`/`StructureStore` types.

```ts
// src/@types/engine/ResolveDeps.d.ts
import type { GalaxyCatalog } from '../data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogSourceType } from '../data/galaxyCatalog/GalaxyCatalogSourceType';
import type { FamousMetaEntry } from '../loading/FamousMetaEntry';
import type { StructureInfo } from '../data/structure/StructureInfo';

/**
 * ResolveDeps — the engine resources the reconciler saga reads to turn a
 * SelectionRef into a SelectionRow. Bundled (not threaded individually) so the
 * saga gets the whole bag from `getContext('resolveDeps')()`. It mirrors the
 * existing pick-path `ResolvePickDeps` shape: live catalog lookup, the
 * famous-meta sidecar, and the structure store's by-id resolver. The getters
 * read LIVE engine state each call (the catalogs/structures change as clouds
 * load), so the saga always sees current data.
 */
export type ResolveDeps = {
  readonly catalogs: { get(source: GalaxyCatalogSourceType): GalaxyCatalog | undefined };
  readonly famousMeta: readonly FamousMetaEntry[];
  readonly structures: { byId(id: string): StructureInfo | null };
};
```

- [x] **Step 2: Write the failing test for `extractSelectionRow`**

```ts
import { describe, it, expect } from 'vitest';

import { extractSelectionRow } from '../../../../src/services/engine/helpers/extractSelectionRow';
import { Source } from '../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { ResolveDeps } from '../../../../src/@types/engine/ResolveDeps';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';

function makeCloud(): GalaxyCatalog {
  return {
    count: 1,
    positions: new Float32Array([10, 20, 30]),
    spectroscopicZ: new Float32Array([0.0123]),
    magU: new Float32Array([18.1]), magG: new Float32Array([17.4]),
    magR: new Float32Array([16.9]), magI: new Float32Array([16.6]), magZ: new Float32Array([16.4]),
    objIDs: new BigInt64Array([1237668n]),
    diameterKpc: new Float32Array([42]), axisRatio: new Float32Array([0.7]), positionAngleDeg: new Float32Array([35]),
    classByte: new Uint8Array([0]), parentSurveyByte: new Uint8Array([0]),
  } as unknown as GalaxyCatalog;
}

const structure: StructureInfo = {
  type: 'structure', category: 'cluster', id: 'abell-2065', name: 'Corona Borealis',
  worldPos: [1, 2, 3], featured: true, physicalRadiusMpc: 5,
} as unknown as StructureInfo;

const deps: ResolveDeps = {
  catalogs: { get: (s) => (s === Source.SDSS ? makeCloud() : undefined) },
  famousMeta: [],
  structures: { byId: (id) => (id === 'abell-2065' ? structure : null) },
};

describe('extractSelectionRow', () => {
  it('null ref → null', () => {
    expect(extractSelectionRow(null, deps)).toBeNull();
  });
  it('galaxy ref → GalaxyRow', () => {
    const row = extractSelectionRow({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 }, deps);
    expect(row).toMatchObject({ type: 'galaxyCatalog', source: Source.SDSS, index: 0, objId: '1237668' });
  });
  it('structure ref → the StructureInfo by id', () => {
    expect(extractSelectionRow({ type: 'structure', id: 'abell-2065' }, deps)).toBe(structure);
  });
  it('milkyWay ref → the milkyWay tag', () => {
    expect(extractSelectionRow({ type: 'milkyWay' }, deps)).toEqual({ type: 'milkyWay' });
  });
  it('galaxy ref to an unloaded cloud → null (deep-link / tier race)', () => {
    expect(extractSelectionRow({ type: 'galaxyCatalog', source: Source.Glade, index: 0 }, deps)).toBeNull();
  });
});
```

- [x] **Step 3: Run to verify it fails**

Run: `npm test -- tests/services/engine/helpers/extractSelectionRow.test.ts`
Expected: FAIL with "Cannot find module".

- [x] **Step 4: Implement `extractSelectionRow`**

```ts
/**
 * extractSelectionRow — turns a SelectionRef into a serializable SelectionRow
 * by touching the live engine resources in `ResolveDeps`. Table-dispatched on
 * the ref tag (never a predicate chain). The galaxy arm reads the cloud at the
 * index (null if the cloud isn't loaded yet — a deep link or a mid-flight tier
 * swap); the structure arm resolves the durable id to its already-serializable
 * record; the Milky Way arm is the static tag.
 *
 * This is the ONE engine-side step in the selection read path — the reconciler
 * saga calls it via getContext('resolveDeps'). Everything downstream
 * (buildFocusable) is pure and runs React-side.
 */
import { extractGalaxyRow } from './extractGalaxyRow';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { ResolveDeps } from '../../../@types/engine/ResolveDeps';

const EXTRACT_ROW: {
  [K in SelectionRef['type']]: (
    ref: Extract<SelectionRef, { type: K }>,
    deps: ResolveDeps,
  ) => SelectionRow | null;
} = {
  galaxyCatalog: (ref, deps) =>
    extractGalaxyRow(deps.catalogs.get(ref.source), ref.index, ref.source, deps.famousMeta),
  structure: (ref, deps) => deps.structures.byId(ref.id),
  milkyWay: () => ({ type: 'milkyWay' as const }),
};

export function extractSelectionRow(ref: SelectionRef | null, deps: ResolveDeps): SelectionRow | null {
  if (ref === null) return null;
  // Narrow the dispatch through the ref tag; each arm receives its own ref shape.
  return (EXTRACT_ROW[ref.type] as (r: SelectionRef, d: ResolveDeps) => SelectionRow | null)(ref, deps);
}
```

- [x] **Step 5: Run to verify it passes**

Run: `npm test -- tests/services/engine/helpers/extractSelectionRow.test.ts`
Expected: PASS.

- [x] **Step 6: Write the failing test for `buildFocusable`**

```ts
import { describe, it, expect } from 'vitest';

import { buildFocusable } from '../../../../src/services/engine/helpers/buildFocusable';
import { MILKY_WAY_INFO } from '../../../../src/data/milkyWay/milkyWayInfo';
import type { GalaxyRow } from '../../../../src/@types/engine/GalaxyRow';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import { Source } from '../../../../src/data/sources';

const galaxyRow: GalaxyRow = {
  type: 'galaxyCatalog', source: Source.SDSS, index: 0, objId: '1237668',
  x: 10, y: 20, z: 30, redshift: 0.0123,
  magU: 18.1, magG: 17.4, magR: 16.9, magI: 16.6, magZ: 16.4,
  diameterKpc: 42, axisRatio: 0.7, positionAngleDeg: 35, classByte: 0, parentSurveyByte: 0,
};

const structure: StructureInfo = {
  type: 'structure', category: 'cluster', id: 'abell-2065', name: 'Corona Borealis',
  worldPos: [1, 2, 3], featured: true, physicalRadiusMpc: 5,
} as unknown as StructureInfo;

describe('buildFocusable', () => {
  it('null → null', () => expect(buildFocusable(null)).toBeNull());
  it('galaxy row → GalaxyInfo', () => {
    const info = buildFocusable(galaxyRow);
    expect(info).toMatchObject({ type: 'galaxyCatalog', objID: 1237668n, source: Source.SDSS });
  });
  it('structure row → the StructureInfo as-is', () => {
    expect(buildFocusable(structure)).toBe(structure);
  });
  it('milkyWay row → MILKY_WAY_INFO', () => {
    expect(buildFocusable({ type: 'milkyWay' })).toBe(MILKY_WAY_INFO);
  });
});
```

- [x] **Step 7: Run to verify it fails**

Run: `npm test -- tests/services/engine/helpers/buildFocusable.test.ts`
Expected: FAIL with "Cannot find module".

- [x] **Step 8: Implement `buildFocusable`**

```ts
/**
 * buildFocusable — the pure, React-side build of the FocusableTarget view-model
 * from a stored SelectionRow. Table-dispatched on the row tag: the galaxy arm
 * runs buildGalaxyInfo (the pure formatter); the structure arm IS already a
 * StructureInfo (a FocusableTarget arm) so it passes through; the Milky Way arm
 * is the singleton const.
 *
 * This imports only pure builders + a static const, so React can call it inside
 * a memoized selector without reaching the engine — the whole point of the
 * pure-store read. It is the inverse of today's engine-bakes-GalaxyInfo flow.
 */
import { buildGalaxyInfo } from './buildGalaxyInfo';
import { MILKY_WAY_INFO } from '../../../data/milkyWay/milkyWayInfo';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';

const BUILD_FOCUSABLE: {
  [K in SelectionRow['type']]: (row: Extract<SelectionRow, { type: K }>) => FocusableTarget;
} = {
  galaxyCatalog: (row) => buildGalaxyInfo(row),
  structure: (row) => row,
  milkyWay: () => MILKY_WAY_INFO,
};

export function buildFocusable(row: SelectionRow | null): FocusableTarget | null {
  if (row === null) return null;
  return (BUILD_FOCUSABLE[row.type] as (r: SelectionRow) => FocusableTarget)(row);
}
```

- [x] **Step 9: Run to verify it passes**

Run: `npm test -- tests/services/engine/helpers/buildFocusable.test.ts`
Expected: PASS.

- [x] **Step 10: Full suite + typecheck + commit**

Run: `npm test` then `npm run typecheck`
Expected: PASS.

```bash
git add src/@types/engine/ResolveDeps.d.ts src/services/engine/helpers/extractSelectionRow.ts src/services/engine/helpers/buildFocusable.ts tests/services/engine/helpers/extractSelectionRow.test.ts tests/services/engine/helpers/buildFocusable.test.ts
git commit -m "feat(engine): add ResolveDeps + extractSelectionRow (engine) + buildFocusable (pure)

Table-dispatched ref→row extract (engine-side, reads the live cloud) and the
pure row→FocusableTarget build (React-importable). Two halves of the
two-layer read.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `focusIdOf` + `resolveFocusId` (the galaxy-arm codecs)

The URL codecs, replacing `selectionToFocusId` (which took a `GalaxyInfo`) and `parseFocusHash` (which returned a `FocusTarget`). `focusIdOf` encodes a `SelectionRef` → string; `resolveFocusId` parses a focusId string → `SelectionRef | null` (the `FocusTarget.kind` union becomes an internal detail; `pos@` stays inside as a nearest-lookup).

**Files:**
- Create: `src/services/url/focusIdOf.ts`
- Create: `src/services/url/resolveFocusId.ts`
- Test: `tests/services/url/focusIdOf.test.ts`
- Test: `tests/services/url/resolveFocusId.test.ts`
- Read first: `src/services/url/focusUrl.ts` (the existing format), `src/@types/camera/FocusTarget.d.ts`, and find the existing nearest-by-position lookup the old `pos@` path used (grep `resolveFocusTarget` / `pos@` in `src/`).

**Interfaces:**
- Consumes: `SelectionRef`, `ResolveDeps`, `Source`, `SOURCE_REGISTRY`, the existing `STRUCTURE_IDS` registry (grep its export), the existing nearest-lookup helper.
- Produces: `focusIdOf(ref: SelectionRef, deps: ResolveDeps): string`; `resolveFocusId(focusId: string, deps: ResolveDeps): SelectionRef | null`.

- [x] **Step 1: Read the existing URL format + nearest-lookup**

Run: `cat src/services/url/focusUrl.ts` and `grep -rn "resolveFocusTarget\|nearest\|pos@\|STRUCTURE_IDS\|aliasMap" src/services/url src/hooks/useUrlSync.ts`
Note the exact string formats: famous id is bare; SDSS is `sdss-<objID>`; non-SDSS galaxy is `pgc-<objID>`; positional is `pos@<ra4>,<dec4>`; structure id is bare (validated against `STRUCTURE_IDS`). Note where the famous-id→index and alias→(source,localIdx) and pos→nearest lookups live today (in `useUrlSync` / `focusUrl` / a `resolveFocusTarget` helper). `resolveFocusId` must reproduce those lookups but return a `SelectionRef`.

- [x] **Step 2: Write the failing test for `focusIdOf`**

`focusIdOf` encodes a ref. For galaxy refs it needs the cloud to read the objID/famous-id at the index, so it takes `deps`. Structure + milkyWay are durable, no deps needed but the signature carries `deps` uniformly.

```ts
import { describe, it, expect } from 'vitest';

import { focusIdOf } from '../../../src/services/url/focusIdOf';
import { Source } from '../../../src/data/sources';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

function makeCloud(objId: bigint): GalaxyCatalog {
  return {
    count: 1, positions: new Float32Array([1, 2, 3]), spectroscopicZ: new Float32Array([0.01]),
    magU: new Float32Array([18]), magG: new Float32Array([17]), magR: new Float32Array([16]),
    magI: new Float32Array([16]), magZ: new Float32Array([16]), objIDs: new BigInt64Array([objId]),
    diameterKpc: new Float32Array([30]), axisRatio: new Float32Array([1]), positionAngleDeg: new Float32Array([0]),
    classByte: new Uint8Array([0]), parentSurveyByte: new Uint8Array([0]),
  } as unknown as GalaxyCatalog;
}

const deps: ResolveDeps = {
  catalogs: { get: (s) => (s === Source.SDSS ? makeCloud(1237668n) : s === Source.Glade ? makeCloud(99n) : undefined) },
  famousMeta: [],
  structures: { byId: () => null },
};

describe('focusIdOf', () => {
  it('SDSS galaxy → sdss-<objId>', () => {
    expect(focusIdOf({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 }, deps)).toBe('sdss-1237668');
  });
  it('GLADE galaxy with PGC → pgc-<objId>', () => {
    expect(focusIdOf({ type: 'galaxyCatalog', source: Source.Glade, index: 0 }, deps)).toBe('pgc-99');
  });
  it('structure → bare id', () => {
    expect(focusIdOf({ type: 'structure', id: 'abell-2065' }, deps)).toBe('abell-2065');
  });
});
```

Adjust the exact expected strings to whatever `cat focusUrl.ts` showed in Step 1 (e.g. the famous arm, the `pos@` fallback when objID is 0n). Add a famous-row case and a `pos@` fallback case mirroring `selectionToFocusId`'s branches verbatim.

- [x] **Step 3: Run to verify it fails, then implement `focusIdOf`**

Run: `npm test -- tests/services/url/focusIdOf.test.ts` → FAIL.

Implement by reading the cloud at the ref's index inside `focusIdOf` and reproducing `selectionToFocusId`'s branch ladder (famous id → `sdss-`/`pgc-` → `pos@`), with structure/milkyWay handled by the ref tag. Use `extractGalaxyRow` to get the objId/famous string-keyed values, or read the cloud directly. Show the full implementation in the plan-execution; the encoding rules are exactly those in `focusUrl.ts` Step 1.

```ts
/**
 * focusIdOf — encode a SelectionRef into the durable URL focus id (the value of
 * #focus=...). Replaces selectionToFocusId, which took a pre-built GalaxyInfo;
 * the ref carries only (source,index), so the galaxy arm reads the cloud at the
 * index to recover the objID / famous id. Structure ids and the Milky Way are
 * already durable. The string format is unchanged from focusUrl.ts.
 */
import { Source } from '../../data/sources';
import { extractGalaxyRow } from '../engine/helpers/extractGalaxyRow';
import type { SelectionRef } from '../../@types/engine/SelectionRef';
import type { ResolveDeps } from '../../@types/engine/ResolveDeps';

// ... reproduce selectionToFocusId's branch logic against the cloud row, plus
// structure/milkyWay arms. (Lift the exact strings from focusUrl.ts.)
```

Note: the Milky Way arm encoding — check `focusUrl.ts`/`useUrlSync.ts` for what `#focus=` carries for the Milky Way today (grep `milkyWay` in those files). If the MW has no URL representation today, `focusIdOf` for milkyWay can return `'milkyway'` (match whatever the existing `URL_HASH_FOR` table in `useUrlSync.ts` produces — read it). State the chosen string in a comment.

- [x] **Step 4: Write + pass the `resolveFocusId` test**

```ts
import { describe, it, expect } from 'vitest';

import { resolveFocusId } from '../../../src/services/url/resolveFocusId';
import { Source } from '../../../src/data/sources';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';

// deps with a cloud where objID 1237668n lives at index 0 of SDSS, plus a
// structure 'abell-2065' resolvable by byId. (Build like the focusIdOf test.)

describe('resolveFocusId', () => {
  it('sdss-<objId> → galaxy ref at the matching index', () => {
    // resolves by scanning the SDSS cloud for the objID
    // expect a { type:'galaxyCatalog', source: Source.SDSS, index: 0 } ref
  });
  it('a structure id → structure ref', () => {
    // expect { type:'structure', id:'abell-2065' } when STRUCTURE_IDS includes it
  });
  it('an unresolvable id (cloud not loaded) → null', () => {
    // expect null so the saga defers on catalogLoaded
  });
  it('pos@ra,dec → nearest galaxy ref via the existing nearest lookup', () => {
    // expect a galaxy ref for the nearest cloud row
  });
});
```

Implement `resolveFocusId` by reproducing `parseFocusHash` + `resolveFocusTarget` (the old deep-link resolution), but returning a `SelectionRef` instead of a `FocusTarget`/`GalaxyInfo`:
- structure id (in `STRUCTURE_IDS`) → `{ type:'structure', id }`
- `sdss-<n>` / `pgc-<n>` → scan the relevant cloud(s) for the objID → `{ type:'galaxyCatalog', source, index }` or null
- famous id → find the index in `famousMeta` and the FamousGalaxy cloud → galaxy ref or null
- `pos@ra,dec` → nearest-cloud lookup → galaxy ref or null
- milkyWay token → `{ type:'milkyWay' }`

Returning `null` on any not-yet-loaded resolution is REQUIRED — the saga loops on `catalogLoaded` until non-null (§7c).

Run: `npm test -- tests/services/url/resolveFocusId.test.ts` → PASS.

- [x] **Step 5: Full suite + typecheck + commit**

Run: `npm test` then `npm run typecheck`
Expected: PASS. (`focusUrl.ts`'s `selectionToFocusId`/`parseFocusHash`/`FocusTarget` are NOT deleted yet — Part 2 removes them when the call sites move. They coexist.)

```bash
git add src/services/url/focusIdOf.ts src/services/url/resolveFocusId.ts tests/services/url/focusIdOf.test.ts tests/services/url/resolveFocusId.test.ts
git commit -m "feat(url): add focusIdOf + resolveFocusId (SelectionRef codecs)

Encode a ref to the #focus= id and parse a focus id back to a ref (null
when its cloud is not loaded yet, so the saga can defer). The FocusTarget
kind union becomes an internal detail; the URL string format is unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: The `selection` slice + `requestFocus` command

The dedup-on-write refs slice and the reducer-less deep-link command. Read `tierSlice.ts` (returning-reducer style) and `settingsSlice.ts` (Immer draft-mutation style) first; this slice mutates the draft.

**Files:**
- Modify: `src/store/constants.ts` (add `selectionRoute`)
- Create: `src/state/selection/selectionSlice.ts`
- Create: `src/state/selection/requestFocus.ts`
- Test: `tests/state/selection/selectionSlice.test.ts`

**Interfaces:**
- Consumes: `SelectionState`, `SelectionRef`, `selectionRoute`, `shallowEqual` from `react-redux` (allowed here? — see Step 2 note), `createSlice`/`createAction`/`PayloadAction`.
- Produces: actions `updateSelectionHover`, `updateSelectionSelect`, `updateSelectionFocus`, `clearSelection`; default reducer; `requestFocus`.

- [x] **Step 1: Add `selectionRoute` to constants**

In `src/store/constants.ts`, after `tierRoute`:

```ts
export const selectionRoute = 'selection' as const;
```

- [x] **Step 2: Decide the `shallowEqual` import**

The spec's dedup uses `shallowEqual`. The exploration found no existing `shallowEqual` in the repo, and `react-redux` is forbidden in `src/state/`. So DO NOT import `react-redux`'s `shallowEqual` here. Instead write a one-function util.

Create `src/utils/object/shallowEqualRef.ts`:

```ts
/**
 * shallowEqualRef — structural equality for a SelectionRef-or-null. Every pick
 * builds a fresh ref object, so `===` would always miss; a SelectionRef is flat
 * primitives, so a one-level key/value compare IS structural equality. Lives as
 * its own util (not react-redux's shallowEqual) because src/state may not import
 * react-redux. Used by the selection slice's dedup-on-write.
 */
import type { SelectionRef } from '../../@types/engine/SelectionRef';

export function shallowEqualRef(a: SelectionRef | null, b: SelectionRef | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  const ak = Object.keys(a) as Array<keyof SelectionRef>;
  const bk = Object.keys(b) as Array<keyof SelectionRef>;
  if (ak.length !== bk.length) return false;
  return ak.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}
```

Add a focused test `tests/utils/object/shallowEqualRef.test.ts` covering equal-fresh-objects, differing-index, null/non-null.

- [x] **Step 3: Write the failing slice test**

```ts
import { describe, it, expect } from 'vitest';

import reducer, {
  updateSelectionHover, updateSelectionSelect, updateSelectionFocus, clearSelection,
} from '../../../src/state/selection/selectionSlice';
import { Source } from '../../../src/data/sources';
import type { SelectionState } from '../../../src/@types/store/SelectionState';

const ref = { type: 'galaxyCatalog', source: Source.SDSS, index: 7 } as const;

describe('selectionSlice', () => {
  it('seeds all slots null', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({ hover: null, select: null, focus: null });
  });
  it('updateSelectionSelect writes the ref', () => {
    const next = reducer(undefined, updateSelectionSelect(ref));
    expect(next.select).toEqual(ref);
  });
  it('dedups a structurally-equal write (same slot reference returned)', () => {
    const a = reducer(undefined, updateSelectionFocus(ref));
    const b = reducer(a, updateSelectionFocus({ type: 'galaxyCatalog', source: Source.SDSS, index: 7 }));
    // No-op: the focus slot reference is unchanged (Immer returns the same draft).
    expect(b.focus).toBe(a.focus);
  });
  it('clearSelection clears select + focus but not hover', () => {
    let s: SelectionState = reducer(undefined, updateSelectionHover(ref));
    s = reducer(s, updateSelectionSelect(ref));
    s = reducer(s, updateSelectionFocus(ref));
    const cleared = reducer(s, clearSelection());
    expect(cleared.select).toBeNull();
    expect(cleared.focus).toBeNull();
    expect(cleared.hover).toEqual(ref);
  });
});
```

- [x] **Step 4: Run to verify it fails, then implement the slice**

Run: `npm test -- tests/state/selection/selectionSlice.test.ts` → FAIL.

```ts
/**
 * selectionSlice — the identity-Intent refs. Three slots (hover/select/focus),
 * each a SelectionRef or null, with DEDUP-ON-WRITE: a write whose ref is
 * structurally equal to the current slot is a no-op, so the slot keeps its
 * reference and downstream selectors/sagas don't re-fire. Because every pick
 * builds a fresh ref object, `===` would always miss; shallowEqualRef gives the
 * structural compare a flat-primitive ref allows. This replaces the per-type
 * targetEq the old subsystem carried.
 *
 * Reducers mutate the Immer draft (the settingsSlice style), so an unchanged
 * slot is left untouched and Immer returns the same reference for it.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { selectionRoute } from '../../store/constants';
import { shallowEqualRef } from '../../utils/object/shallowEqualRef';
import type { SelectionState } from '../../@types/store/SelectionState';
import type { SelectionRef } from '../../@types/engine/SelectionRef';

const setIfChanged =
  (slot: keyof SelectionState) =>
  (selection: SelectionState, action: PayloadAction<SelectionRef | null>) => {
    if (!shallowEqualRef(selection[slot], action.payload)) selection[slot] = action.payload;
  };

const selectionSlice = createSlice({
  name: selectionRoute,
  initialState: { hover: null, select: null, focus: null } as SelectionState,
  reducers: {
    updateSelectionHover: setIfChanged('hover'),
    updateSelectionSelect: setIfChanged('select'),
    updateSelectionFocus: setIfChanged('focus'),
    clearSelection: (selection) => {
      selection.select = null;
      selection.focus = null;
    },
  },
});

export const { updateSelectionHover, updateSelectionSelect, updateSelectionFocus, clearSelection } =
  selectionSlice.actions;

export default selectionSlice.reducer;
```

```ts
// src/state/selection/requestFocus.ts
/**
 * requestFocus — the reducer-less COMMAND that asks the deep-link saga to
 * resolve a durable focus id into a ref. Mirrors requestTier: dispatching it
 * changes no state; the watchRequestFocus saga (Part 2) resolves the id,
 * deferring on catalogLoaded until the cloud is ready, then dispatches
 * updateSelectionFocus(ref). A palette pick or a hash deep-link dispatches it.
 */
import { createAction } from '@reduxjs/toolkit';

export const requestFocus = createAction<string>('selection/requestFocus');
```

- [x] **Step 5: Run to pass, typecheck, commit**

Run: `npm test -- tests/state/selection/selectionSlice.test.ts tests/utils/object/shallowEqualRef.test.ts` → PASS. Then `npm run typecheck`.

```bash
git add src/store/constants.ts src/state/selection/selectionSlice.ts src/state/selection/requestFocus.ts src/utils/object/shallowEqualRef.ts tests/state/selection/selectionSlice.test.ts tests/utils/object/shallowEqualRef.test.ts
git commit -m "feat(state): add the selection refs slice + requestFocus command

Three dedup-on-write SelectionRef slots (shallowEqualRef replaces targetEq)
plus the reducer-less requestFocus command. Not yet wired into rootReducer.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: The `selectionRows` slice + `dataStatus` slice

The saga-owned derived cache (`setSelectionRow`) and the readiness descriptor (`catalogLoaded`).

**Files:**
- Modify: `src/store/constants.ts` (add `selectionRowsRoute`, `dataStatusRoute`)
- Create: `src/@types/store/SelectionRowsState.d.ts`
- Create: `src/@types/store/DataStatusState.d.ts`
- Create: `src/state/selectionRows/selectionRowsSlice.ts`
- Create: `src/state/dataStatus/dataStatusSlice.ts`
- Test: `tests/state/selectionRows/selectionRowsSlice.test.ts`
- Test: `tests/state/dataStatus/dataStatusSlice.test.ts`

**Interfaces:**
- Consumes: `SelectionRow`, `SelectionSlot`, `SourceType`, the route constants.
- Produces: `setSelectionRow` action; `catalogLoaded` action; `SelectionRowsState`, `DataStatusState`.

- [x] **Step 1: Add the two route constants**

In `src/store/constants.ts`:

```ts
export const selectionRowsRoute = 'selectionRows' as const;

export const dataStatusRoute = 'dataStatus' as const;
```

- [x] **Step 2: Write the state types**

```ts
// src/@types/store/SelectionRowsState.d.ts
import type { SelectionRow } from '../engine/SelectionRow';

/**
 * SelectionRowsState — the saga-owned DERIVED CACHE mirroring SelectionState's
 * three slots, each a serializable SelectionRow or null. A volatile cache, NOT
 * Intent: never persisted or restored, always rebuilt from the refs + cloud by
 * the watchSelectionRows reconciler. Kept a SEPARATE slice from `selection` so
 * a settings/tour restore that touches the refs can't carry stale rows.
 */
export type SelectionRowsState = {
  readonly hover: SelectionRow | null;
  readonly select: SelectionRow | null;
  readonly focus: SelectionRow | null;
};
```

```ts
// src/@types/store/DataStatusState.d.ts
import type { SourceType } from '../data/SourceType';

/**
 * DataStatusState — the serializable readiness descriptor. catalogGen bumps per
 * catalog commit (the AssetSlot generation, projected via catalogLoaded);
 * structureGen bumps when the structure store changes. The reconciler saga
 * takes catalogLoaded to re-resolve still-null rows; React never reads this.
 */
export type DataStatusState = {
  readonly catalogGen: Partial<Record<SourceType, number>>;
  readonly structureGen: number;
};
```

- [x] **Step 3: Write the failing slice tests**

```ts
// tests/state/selectionRows/selectionRowsSlice.test.ts
import { describe, it, expect } from 'vitest';

import reducer, { setSelectionRow } from '../../../src/state/selectionRows/selectionRowsSlice';

describe('selectionRowsSlice', () => {
  it('seeds all slots null', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({ hover: null, select: null, focus: null });
  });
  it('setSelectionRow writes the addressed slot', () => {
    const row = { type: 'milkyWay' as const };
    const next = reducer(undefined, setSelectionRow({ slot: 'focus', row }));
    expect(next.focus).toEqual(row);
    expect(next.select).toBeNull();
  });
  it('setSelectionRow null clears a slot', () => {
    const seeded = reducer(undefined, setSelectionRow({ slot: 'hover', row: { type: 'milkyWay' } }));
    const cleared = reducer(seeded, setSelectionRow({ slot: 'hover', row: null }));
    expect(cleared.hover).toBeNull();
  });
});
```

```ts
// tests/state/dataStatus/dataStatusSlice.test.ts
import { describe, it, expect } from 'vitest';

import reducer, { catalogLoaded } from '../../../src/state/dataStatus/dataStatusSlice';
import { Source } from '../../../src/data/sources';

describe('dataStatusSlice', () => {
  it('seeds empty', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({ catalogGen: {}, structureGen: 0 });
  });
  it('catalogLoaded records the per-source generation', () => {
    const next = reducer(undefined, catalogLoaded({ source: Source.SDSS, generation: 3 }));
    expect(next.catalogGen[Source.SDSS]).toBe(3);
  });
});
```

- [x] **Step 4: Run to fail, then implement both slices**

Run: `npm test -- tests/state/selectionRows tests/state/dataStatus` → FAIL.

```ts
/**
 * selectionRowsSlice — the saga-owned derived cache. ONE reducer,
 * setSelectionRow, written ONLY by the watchSelectionRows reconciler (the
 * single owner). It addresses a slot by name and stores a SelectionRow or null.
 * No dedup here: the reconciler only puts a row when the ref or cloud genuinely
 * changed, and the row is the minimal projection so a re-put is cheap.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { selectionRowsRoute } from '../../store/constants';
import type { SelectionRowsState } from '../../@types/store/SelectionRowsState';
import type { SelectionRow } from '../../@types/engine/SelectionRow';
import type { SelectionSlot } from '../../@types/engine/SelectionSlot';

const selectionRowsSlice = createSlice({
  name: selectionRowsRoute,
  initialState: { hover: null, select: null, focus: null } as SelectionRowsState,
  reducers: {
    setSelectionRow: (
      selectionRows,
      action: PayloadAction<{ slot: SelectionSlot; row: SelectionRow | null }>,
    ) => {
      selectionRows[action.payload.slot] = action.payload.row;
    },
  },
});

export const { setSelectionRow } = selectionRowsSlice.actions;

export default selectionRowsSlice.reducer;
```

```ts
/**
 * dataStatusSlice — the serializable readiness descriptor (intent.md's "store a
 * descriptor, never the resource bytes"). catalogLoaded is dispatched from the
 * one cloud-commit path with the AssetSlot generation; the reducer records the
 * per-source number. The reconciler + deep-link + tier-reanchor sagas TAKE
 * catalogLoaded to re-resolve refs whose cloud just arrived. React never reads
 * this slice — it reads selectionRows, which the saga keeps current.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { dataStatusRoute } from '../../store/constants';
import type { DataStatusState } from '../../@types/store/DataStatusState';
import type { SourceType } from '../../@types/data/SourceType';

const dataStatusSlice = createSlice({
  name: dataStatusRoute,
  initialState: { catalogGen: {}, structureGen: 0 } as DataStatusState,
  reducers: {
    catalogLoaded: (
      dataStatus,
      action: PayloadAction<{ source: SourceType; generation: number }>,
    ) => {
      dataStatus.catalogGen[action.payload.source] = action.payload.generation;
    },
  },
});

export const { catalogLoaded } = dataStatusSlice.actions;

export default dataStatusSlice.reducer;
```

- [x] **Step 5: Run to pass, typecheck, commit**

Run: `npm test -- tests/state/selectionRows tests/state/dataStatus` → PASS. Then `npm run typecheck`.

```bash
git add src/store/constants.ts src/@types/store/SelectionRowsState.d.ts src/@types/store/DataStatusState.d.ts src/state/selectionRows/selectionRowsSlice.ts src/state/dataStatus/dataStatusSlice.ts tests/state/selectionRows/selectionRowsSlice.test.ts tests/state/dataStatus/dataStatusSlice.test.ts
git commit -m "feat(state): add selectionRows derived-cache slice + dataStatus descriptor slice

setSelectionRow (saga-only writer) and catalogLoaded (commit-path descriptor).
Three sibling slices now exist; rootReducer wiring follows.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Wire the three slices into `rootReducer` + the build-selectors

Mount the slices and add the §3b reselect selectors. After this task `RootState` carries `selection`, `selectionRows`, `dataStatus`.

**Files:**
- Modify: `src/store/rootReducer.ts`
- Create: `src/state/selection/selectors.ts`
- Test: `tests/store/rootReducer.test.ts` (or extend an existing one — grep for it)
- Test: `tests/state/selection/selectors.test.ts`

**Interfaces:**
- Consumes: the three reducers + route constants; `RootState`; `buildFocusable`; `SelectionRow`, `SelectionRef`, `FocusableTarget`; `createSelector` from `@reduxjs/toolkit`.
- Produces: selectors `selectSelectRow`, `selectHoverRow`, `selectFocusRow`, `selectSelectedRef`, `selectSelectedFocusable`, `selectHoveredFocusable`, `selectFocusedFocusable`, `selectIsSelectionActive`.

- [x] **Step 1: Add the three route entries to `rootReducer.ts`**

```ts
import { combineReducers } from '@reduxjs/toolkit';

import { settingsRoute, tierRoute, selectionRoute, selectionRowsRoute, dataStatusRoute } from './constants';
import settingsReducer from '../state/settings/settingsSlice';
import tierReducer from '../state/tier/tierSlice';
import selectionReducer from '../state/selection/selectionSlice';
import selectionRowsReducer from '../state/selectionRows/selectionRowsSlice';
import dataStatusReducer from '../state/dataStatus/dataStatusSlice';

export const rootReducer = combineReducers({
  [settingsRoute]: settingsReducer,
  [tierRoute]: tierReducer,
  [selectionRoute]: selectionReducer,
  [selectionRowsRoute]: selectionRowsReducer,
  [dataStatusRoute]: dataStatusReducer,
});
```

Update the file's module header docblock to mention the three new sibling routes (match the existing didactic style).

- [x] **Step 2: Write the failing selectors test**

```ts
import { describe, it, expect } from 'vitest';

import { createAppStore } from '../../../src/store/createAppStore';
import {
  selectSelectedFocusable, selectHoveredFocusable, selectFocusedFocusable,
  selectSelectedRef, selectIsSelectionActive,
} from '../../../src/state/selection/selectors';
import { updateSelectionSelect } from '../../../src/state/selection/selectionSlice';
import { setSelectionRow } from '../../../src/state/selectionRows/selectionRowsSlice';
import { Source } from '../../../src/data/sources';

describe('selection selectors', () => {
  it('selectSelectedFocusable builds the FocusableTarget from the stored row', () => {
    const { store } = createAppStore();
    store.dispatch(setSelectionRow({ slot: 'select', row: { type: 'milkyWay' } }));
    expect(selectSelectedFocusable(store.getState())).toMatchObject({ type: 'milkyWay' });
  });
  it('selectSelectedFocusable is memoized — same row → identity-stable result', () => {
    const { store } = createAppStore();
    store.dispatch(setSelectionRow({ slot: 'select', row: { type: 'milkyWay' } }));
    const a = selectSelectedFocusable(store.getState());
    // A dispatch that does not touch the select row must not recompute.
    store.dispatch(setSelectionRow({ slot: 'hover', row: null }));
    const b = selectSelectedFocusable(store.getState());
    expect(a).toBe(b);
  });
  it('selectSelectedRef reads the ref slot', () => {
    const { store } = createAppStore();
    const ref = { type: 'galaxyCatalog', source: Source.SDSS, index: 1 } as const;
    store.dispatch(updateSelectionSelect(ref));
    expect(selectSelectedRef(store.getState())).toEqual(ref);
  });
  it('selectIsSelectionActive true when select or focus ref present', () => {
    const { store } = createAppStore();
    expect(selectIsSelectionActive(store.getState())).toBe(false);
    store.dispatch(updateSelectionSelect({ type: 'milkyWay' }));
    expect(selectIsSelectionActive(store.getState())).toBe(true);
  });
});
```

- [x] **Step 3: Run to fail, then implement the selectors**

Run: `npm test -- tests/state/selection/selectors.test.ts` → FAIL.

```ts
/**
 * Selection selectors — the single read seam for the selection fold. Input
 * selectors are cheap direct route reads; the build-selectors run the pure
 * buildFocusable memoized via reselect, so React recomputes the heavy
 * FocusableTarget only when the stored row actually changes (not every tick).
 * RootState-scoped, so they drop into useAppSelector (React) and getState
 * (tests) unchanged. react-redux is NOT imported here — these stay
 * framework-agnostic; only React components reach them through useAppSelector.
 */
import { createSelector } from '@reduxjs/toolkit';

import { selectionRoute, selectionRowsRoute } from '../../store/constants';
import { buildFocusable } from '../../services/engine/helpers/buildFocusable';
import type { RootState } from '../../store/types';
import type { SelectionRow } from '../../@types/engine/SelectionRow';
import type { SelectionRef } from '../../@types/engine/SelectionRef';

export const selectSelectRow = (state: RootState): SelectionRow | null => state[selectionRowsRoute].select;
export const selectHoverRow = (state: RootState): SelectionRow | null => state[selectionRowsRoute].hover;
export const selectFocusRow = (state: RootState): SelectionRow | null => state[selectionRowsRoute].focus;

export const selectHoverRef = (state: RootState): SelectionRef | null => state[selectionRoute].hover;
export const selectSelectedRef = (state: RootState): SelectionRef | null => state[selectionRoute].select;
export const selectFocusRef = (state: RootState): SelectionRef | null => state[selectionRoute].focus;

export const selectSelectedFocusable = createSelector([selectSelectRow], buildFocusable);
export const selectHoveredFocusable = createSelector([selectHoverRow], buildFocusable);
export const selectFocusedFocusable = createSelector([selectFocusRow], buildFocusable);

export const selectIsSelectionActive = createSelector(
  [selectSelectedRef, selectFocusRef],
  (select, focus) => select !== null || focus !== null,
);
```

- [x] **Step 4: Run to pass, full suite, typecheck**

Run: `npm test -- tests/state/selection/selectors.test.ts` → PASS. Then `npm test` (full) and `npm run typecheck`.
Expected: PASS. Note: `src/services/engine/helpers/buildFocusable.ts` is imported by `src/state/`, which is fine — `buildFocusable` imports only pure builders + a const, no react-redux and no engine state, so the layering rule (no react-redux in `src/state/`) holds.

- [x] **Step 5: Commit**

```bash
git add src/store/rootReducer.ts src/state/selection/selectors.ts tests/state/selection/selectors.test.ts
git commit -m "feat(store): mount selection/selectionRows/dataStatus + memoized build-selectors

RootState now carries the three sibling routes; selectXFocusable run the pure
buildFocusable through reselect so React recomputes only on real row changes.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Extend `SagaContext` with `resolveDeps`

Widen the context type and the engine's `setSagaContext` call. The reconcile-sagas fold (PR #352) already grew `SagaContext` to `{ runTierTransition, reconcile: ReconcileEffects }`, and `ReconcileEffects` already exposes `requestRender`. So the **render-wake capability is reused, not re-added** — Part 1 adds exactly one new flat member, `resolveDeps` (the reconciler's live-resource read). Part 2 Task 4b adds the second flat member, `runFocusTween`.

**Files:**
- Modify: `src/store/types.ts` (extend `SagaContext`)
- Modify: `src/services/engine/engine.ts` (the `setSagaContext({...})` call — currently `{ runTierTransition, reconcile }`, ~line 463-466)
- Test: `tests/store/sagaContext.test.ts` (a type-level + shape test) — or fold into an engine wiring test if one exists (grep)

**Interfaces:**
- Consumes: `ResolveDeps`, `RunTierTransition`, `ReconcileEffects` (already in `SagaContext`).
- Produces: `SagaContext = { runTierTransition: RunTierTransition; reconcile: ReconcileEffects; resolveDeps: () => ResolveDeps }` (Part 2 Task 4b appends `runFocusTween`).

- [x] **Step 1: Extend the `SagaContext` type**

In `src/store/types.ts`, add `resolveDeps` to the existing `SagaContext` literal (do NOT touch `runTierTransition` or `reconcile`), and update the module docblock to name it. `requestRender` is NOT added here — it already arrives via `reconcile.requestRender`:

```ts
import type { ResolveDeps } from '../@types/engine/ResolveDeps';
// ... existing imports (ReconcileEffects is already imported)

export type RunTierTransition = (prevTier: Tier, nextTier: Tier) => void;
export type SagaContext = {
  runTierTransition: RunTierTransition; // already present (PR #349)
  reconcile: ReconcileEffects;          // already present (PR #352) — provides requestRender
  /** NEW: live engine resources the reconciler reads (lazy — GPU lands post-bootstrap). */
  resolveDeps: () => ResolveDeps;
};
export type SetSagaContext = (ctx: Partial<SagaContext>) => void;
```

`SetSagaContext` already takes `Partial<SagaContext>`, so the engine keeps its single injection call and just adds the `resolveDeps` key; no `SetSagaContext` change needed.

- [x] **Step 2: Extend the engine's `setSagaContext` call**

In `src/services/engine/engine.ts`, find the existing call (around line 463-466). It currently injects two capabilities:

```ts
cb.setSagaContext({
  runTierTransition: makeRunTierTransition(state, bootstrapDeps),
  reconcile: makeReconcileEffects(state),
});
```

Add the `resolveDeps` key (leave `runTierTransition` + `reconcile` exactly as they are):

```ts
// resolveDeps hands the reconciler saga the LIVE engine resources (read lazily
// each call, because clouds + structures change as data loads and the GPU lands
// only after bootstrap). requestRender is NOT added here — selection sagas reach
// it through the existing `reconcile` bag (makeReconcileEffects).
cb.setSagaContext({
  runTierTransition: makeRunTierTransition(state, bootstrapDeps),
  reconcile: makeReconcileEffects(state),
  resolveDeps: () => ({
    catalogs: { get: (source) => state.data.galaxies.get(source) },
    famousMeta: state.data.galaxies.famousMeta,
    structures: { byId: (id) => state.data.structures.byId(id) },
  }),
});
```

Note: confirm `state.data.galaxies.get` / `state.data.structures.byId` exist (they're used in `makeRunTierTransition` and `wireInput` already). The `get(source)` param is typed `SourceType`; `ResolveDeps.catalogs.get` expects `GalaxyCatalogSourceType` (a subtype) — the arrow's param widens fine. If typecheck complains, annotate the arrow param as `GalaxyCatalogSourceType`. (Part 2 Task 4b lifts this `resolveDeps` arrow into a named const so the focus-tween runner can share it.)

- [x] **Step 3: Write a shape test for the context wiring**

If an engine-construction test harness exists (grep `createEngine` in `tests/`), assert the injected context carries `resolveDeps`. Otherwise add a minimal type-level test (the `reconcile`/`requestRender` shape is already pinned by `tests/store/effects/reconcileSagas.test.ts`):

```ts
import { describe, it, expectTypeOf } from 'vitest';
import type { SagaContext } from '../../src/store/types';
import type { ResolveDeps } from '../../src/@types/engine/ResolveDeps';
import type { ReconcileEffects } from '../../src/store/effects/ReconcileEffects';

describe('SagaContext', () => {
  it('carries resolveDeps alongside the existing reconcile/tier capabilities', () => {
    expectTypeOf<SagaContext['resolveDeps']>().toEqualTypeOf<() => ResolveDeps>();
    expectTypeOf<SagaContext['reconcile']>().toEqualTypeOf<ReconcileEffects>();
  });
});
```

- [x] **Step 4: Run + typecheck + commit**

Run: `npm test -- tests/store/sagaContext.test.ts` then `npm run typecheck` then `npm test` (full).
Expected: PASS.

```bash
git add src/store/types.ts src/services/engine/engine.ts tests/store/sagaContext.test.ts
git commit -m "feat(engine): extend SagaContext with resolveDeps

The engine injects a lazy live-resource bag alongside the tier runner and the
reconcile effects, so the selection reconciler reaches engine resources through
the same seam. Render-wake is reused from the existing reconcile.requestRender.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: The reconciler saga `watchSelectionRows` + fork from `rootSaga`

The keystone single-owner of `selectionRows`. On a ref change it re-extracts that slot; on `catalogLoaded` it re-extracts any still-null slot whose ref is non-null. Read `tierSaga.ts` for the `getContext`/`select`/`put`/`takeEvery` style.

**Files:**
- Create: `src/state/selectionRows/selectionRowsSaga.ts`
- Modify: `src/store/rootSaga.ts` (fork `watchSelectionRows`)
- Test: `tests/state/selectionRows/selectionRowsSaga.test.ts`

**Interfaces:**
- Consumes: `updateSelectionHover/Select/Focus`, `catalogLoaded`, `setSelectionRow`, `selectionRoute`, `selectionRowsRoute`, `extractSelectionRow`, `SagaContext['resolveDeps']`, `SelectionSlot`, `RootState`.
- Produces: `watchSelectionRows` generator.

- [x] **Step 1: Write the failing saga test (integration over a real store)**

Mirror `tierSaga.test.ts`: build a store wired with `redux-saga`, run `watchSelectionRows`, inject a `resolveDeps` context, dispatch, flush a macrotask, assert `selectionRows`.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchSelectionRows } from '../../../src/state/selectionRows/selectionRowsSaga';
import { updateSelectionSelect, updateSelectionFocus } from '../../../src/state/selection/selectionSlice';
import { catalogLoaded } from '../../../src/state/dataStatus/dataStatusSlice';
import { selectionRowsRoute } from '../../../src/store/constants';
import { Source } from '../../../src/data/sources';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

const flush = () => new Promise((r) => setTimeout(r, 0));

function makeCloud(): GalaxyCatalog {
  return {
    count: 1, positions: new Float32Array([10, 20, 30]), spectroscopicZ: new Float32Array([0.0123]),
    magU: new Float32Array([18.1]), magG: new Float32Array([17.4]), magR: new Float32Array([16.9]),
    magI: new Float32Array([16.6]), magZ: new Float32Array([16.4]), objIDs: new BigInt64Array([1237668n]),
    diameterKpc: new Float32Array([42]), axisRatio: new Float32Array([0.7]), positionAngleDeg: new Float32Array([35]),
    classByte: new Uint8Array([0]), parentSurveyByte: new Uint8Array([0]),
  } as unknown as GalaxyCatalog;
}

describe('watchSelectionRows', () => {
  let store: ReturnType<typeof build>;
  // Mutable: the cloud is absent at first (deep-link), then arrives.
  let cloudPresent = false;

  function build() {
    const sagaMiddleware = createSagaMiddleware();
    const s = configureStore({
      reducer: rootReducer,
      middleware: (g) => g().concat(sagaMiddleware),
    });
    const deps: ResolveDeps = {
      catalogs: { get: (src) => (cloudPresent && src === Source.SDSS ? makeCloud() : undefined) },
      famousMeta: [],
      structures: { byId: () => null },
    };
    sagaMiddleware.run(watchSelectionRows);
    sagaMiddleware.setContext({ resolveDeps: () => deps });
    return s;
  }

  beforeEach(() => {
    cloudPresent = true;
    store = build();
  });

  it('a ref change re-extracts that slot into selectionRows', async () => {
    store.dispatch(updateSelectionSelect({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 }));
    await flush();
    expect(store.getState()[selectionRowsRoute].select).toMatchObject({ type: 'galaxyCatalog', objId: '1237668' });
  });

  it('a deep link defers: ref present but cloud absent → null row; catalogLoaded fills it', async () => {
    cloudPresent = false;
    store.dispatch(updateSelectionFocus({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 }));
    await flush();
    expect(store.getState()[selectionRowsRoute].focus).toBeNull();

    cloudPresent = true;
    store.dispatch(catalogLoaded({ source: Source.SDSS, generation: 1 }));
    await flush();
    expect(store.getState()[selectionRowsRoute].focus).toMatchObject({ type: 'galaxyCatalog', objId: '1237668' });
  });
});
```

- [x] **Step 2: Run to fail, then implement the saga**

Run: `npm test -- tests/state/selectionRows/selectionRowsSaga.test.ts` → FAIL.

```ts
/**
 * watchSelectionRows — the reconciler: the SINGLE owner of the selectionRows
 * derived cache. It keeps every row in sync with its SelectionRef.
 *
 * On a ref change (updateSelection{Hover,Select,Focus}) it re-extracts that one
 * slot. On catalogLoaded — a late cloud arriving — it re-extracts any slot
 * whose row is still null but whose ref is set (a deep link, or a galaxy in a
 * tier whose cloud just finished loading). Keyed on the COMPLETE trigger set
 * (ref writes ∪ catalogLoaded), so the cache can't hand-sync-drift the way two
 * authoritative homes do — this is what justifies materializing a derived value
 * in the store (see the spec's exception note).
 *
 * It reaches the live engine cloud/structures via getContext('resolveDeps'),
 * the same seam tierSaga uses for runTierTransition. The reducers stay free of
 * engine references; only this saga crosses the boundary.
 */
import { takeEvery, select, put, getContext } from 'typed-redux-saga';

import {
  updateSelectionHover,
  updateSelectionSelect,
  updateSelectionFocus,
} from '../selection/selectionSlice';
import { catalogLoaded } from '../dataStatus/dataStatusSlice';
import { setSelectionRow } from './selectionRowsSlice';
import { extractSelectionRow } from '../../services/engine/helpers/extractSelectionRow';
import { selectionRoute, selectionRowsRoute } from '../../store/constants';
import type { RootState, SagaContext } from '../../store/types';
import type { SelectionSlot } from '../../@types/engine/SelectionSlot';

function* reextract(slot: SelectionSlot) {
  const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
  const ref = yield* select((state: RootState) => state[selectionRoute][slot]);
  yield* put(setSelectionRow({ slot, row: extractSelectionRow(ref, resolveDeps()) }));
}

export function* watchSelectionRows() {
  yield* takeEvery(updateSelectionHover, () => reextract('hover'));
  yield* takeEvery(updateSelectionSelect, () => reextract('select'));
  yield* takeEvery(updateSelectionFocus, () => reextract('focus'));
  // A late cloud makes a previously-unresolvable ref resolvable — fill the gaps.
  yield* takeEvery(catalogLoaded, function* () {
    for (const slot of ['hover', 'select', 'focus'] as const) {
      const row = yield* select((state: RootState) => state[selectionRowsRoute][slot]);
      const ref = yield* select((state: RootState) => state[selectionRoute][slot]);
      if (row === null && ref !== null) yield* reextract(slot);
    }
  });
}
```

Note: `takeEvery(action, () => reextract(slot))` — the second arg returning a generator is the typed-redux-saga form. If the linter/types prefer `takeEvery(updateSelectionHover, reextractHover)` with a named worker, wrap each in a tiny `function*` worker; match whatever typechecks against the installed `typed-redux-saga` version (the tierSaga uses an inline `function*` worker — mirror that exact form).

- [x] **Step 3: Fork from `rootSaga`**

In `src/store/rootSaga.ts`, **append** `watchSelectionRows()` to the existing fork list — do NOT replace it. The reconcile-sagas fold (PR #352) already forks five watchers here (`watchTier`, `watchWake`, `watchFlowReseed`, `watchBiasBake`, `watchFades`); add the new import and one array entry:

```ts
import { all } from 'typed-redux-saga';

import { watchTier } from '../state/tier/tierSaga';
import { watchWake, watchFlowReseed, watchBiasBake, watchFades } from './effects/reconcileSagas';
import { watchSelectionRows } from '../state/selectionRows/selectionRowsSaga';

export function* mainSaga() {
  yield* all([
    watchTier(),
    watchWake(),
    watchFlowReseed(),
    watchBiasBake(),
    watchFades(),
    watchSelectionRows(),
  ]);
}
```

Update the docblock to name the new fork. (`tests/store/rootSaga.test.ts` only asserts `mainSaga` starts without throwing when no context is registered, so appending a forked watcher keeps it green.)

- [x] **Step 4: Run to pass, full suite, typecheck**

Run: `npm test -- tests/state/selectionRows/selectionRowsSaga.test.ts` → PASS. Then `npm test` and `npm run typecheck`.
Expected: PASS. The reconciler now tracks the refs, but NOTHING dispatches `updateSelection*` yet (Part 2 does the cutover), so there is no behaviour change — `selectionRows` simply stays null in production until Part 2's writes land.

- [x] **Step 5: Commit**

```bash
git add src/state/selectionRows/selectionRowsSaga.ts src/store/rootSaga.ts tests/state/selectionRows/selectionRowsSaga.test.ts
git commit -m "feat(state): add watchSelectionRows reconciler + fork from rootSaga

Single-owner saga keeping selectionRows in sync with the refs, keyed on the
complete trigger set (ref writes plus catalogLoaded). Additive: no writes
dispatch updateSelection* yet, so behaviour is unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Dispatch `catalogLoaded` from the cloud-commit path

The ONE place a cloud lands projects the AssetSlot generation into the store. This is the descriptor the reconciler defers on. Read `galaxyCatalogSourceRegistry.ts` (`wireGalaxyCatalogSourceSlot`, the `commit` callback) and `AssetSlot.ts` (the `generation` counter) first.

**Files:**
- Modify: `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts` (the commit callback)
- Test: extend an existing wiring test or add `tests/services/engine/wiring/catalogLoadedDispatch.test.ts`

**Interfaces:**
- Consumes: `catalogLoaded`, the engine's store (`cb.store` / `deps.cb.store` — confirm the path: `EngineCallbacks.store: AppStore`), the committed generation number.
- Produces: a `catalogLoaded({ source, generation })` dispatch on every successful commit.

- [x] **Step 1: Determine the generation value available at commit time**

Read `src/services/loading/AssetSlot.ts` around the `commit` invocation: the `commit` callback receives `(value, signal, req)`. The `generation`/`myGen` is captured in `load()`. Check whether the generation is passed INTO `commit` (e.g. as a field on `req` or a third arg). If it is not currently threaded, the simplest correct descriptor is a monotonic counter the registry owns, OR pass `myGen` through to `commit`. Prefer threading the existing `myGen` into the `commit` signature so the store's `catalogGen` mirrors the AssetSlot's generation (the spec calls these "already the descriptor"). If threading is invasive, use a per-source incrementing counter local to the commit closure and document why.

Run: `grep -n "commit(" src/services/loading/AssetSlot.ts` and read the `runLoad` body to see exactly what `commit` is called with.

- [x] **Step 2: Write the failing test**

A focused test that drives the commit path (or a thin extraction of it) and asserts a `catalogLoaded` action was dispatched with the right source + a number. If the commit path is hard to invoke in isolation, extract the dispatch into a tiny helper `dispatchCatalogLoaded(store, source, generation)` and test that helper plus assert the commit calls it. Prefer the helper extraction so the test is hermetic:

```ts
// tests/services/engine/wiring/catalogLoadedDispatch.test.ts
import { describe, it, expect } from 'vitest';

import { createAppStore } from '../../../../src/store/createAppStore';
import { dispatchCatalogLoaded } from '../../../../src/services/engine/wiring/dispatchCatalogLoaded';
import { Source } from '../../../../src/data/sources';
import { dataStatusRoute } from '../../../../src/store/constants';

describe('dispatchCatalogLoaded', () => {
  it('records the generation in dataStatus.catalogGen', () => {
    const { store } = createAppStore();
    dispatchCatalogLoaded(store, Source.SDSS, 4);
    expect(store.getState()[dataStatusRoute].catalogGen[Source.SDSS]).toBe(4);
  });
});
```

- [x] **Step 3: Run to fail, then implement `dispatchCatalogLoaded` + call it from the commit path**

Run: `npm test -- tests/services/engine/wiring/catalogLoadedDispatch.test.ts` → FAIL.

```ts
// src/services/engine/wiring/dispatchCatalogLoaded.ts
/**
 * dispatchCatalogLoaded — projects an AssetSlot's just-committed generation
 * into the dataStatus slice as the serializable readiness descriptor. Called
 * from the ONE cloud-commit path (wireGalaxyCatalogSourceSlot's commit), it
 * lets the reconciler + deep-link + tier-reanchor sagas re-resolve refs whose
 * cloud just arrived. We dispatch a NUMBER, never the cloud (intent.md: store
 * the descriptor, never the resource bytes).
 */
import { catalogLoaded } from '../../../state/dataStatus/dataStatusSlice';
import type { AppStore } from '../../../store/types';
import type { SourceType } from '../../../@types/data/SourceType';

export function dispatchCatalogLoaded(store: AppStore, source: SourceType, generation: number): void {
  store.dispatch(catalogLoaded({ source, generation }));
}
```

In `galaxyCatalogSourceRegistry.ts`'s `commit` callback, after `state.data.galaxies.setCatalog(source, cloud)` succeeds, add (with the generation determined in Step 1):

```ts
dispatchCatalogLoaded(deps.cb.store, source, /* the committed generation */);
```

Confirm `deps.cb.store` is the `AppStore` (it is on `EngineCallbacks.store: AppStore`; `deps` is `WirePointSourceDeps` carrying `cb`). If the store isn't reachable from `deps` here, thread it (read `WirePointSourceDeps` and the call site).

- [x] **Step 4: Run to pass, full suite, typecheck**

Run: `npm test -- tests/services/engine/wiring/catalogLoadedDispatch.test.ts` → PASS. Then `npm test` and `npm run typecheck`.
Expected: PASS. The dispatch fires on each commit now; the reconciler consumes it (proven in Task 11), but with no `updateSelection*` writes yet there is still no user-visible change.

- [x] **Step 5: Commit**

```bash
git add src/services/engine/wiring/dispatchCatalogLoaded.ts src/services/engine/wiring/galaxyCatalogSourceRegistry.ts tests/services/engine/wiring/catalogLoadedDispatch.test.ts
git commit -m "feat(engine): dispatch catalogLoaded from the cloud-commit path

The one place a cloud lands projects its AssetSlot generation into dataStatus
as a serializable descriptor, so deferral sagas can re-resolve on arrival.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Part 1 self-review gate

After Task 12, run the full suite + typecheck one more time and confirm:
- `npm test` green (2687+ tests, plus the new ones), `npm run typecheck` clean.
- `selectionSubsystem.ts` is UNCHANGED and still the production source of truth — Part 1 added a parallel, dormant store path that nothing reads or writes in production yet.
- The three slices, the reconciler, the codecs, and the builder split all exist and are independently tested.

This is the merge point for Part 1. **Part 2 depends on Part 1 being merged** and consumes the Produces interfaces listed in the File Structure section by exact name.

## Definition of Done

Shipped on branch `worktree-selection-slice-rewrite` (PR #350), 2026-06-20.

- [x] Every Part-1 task deliverable present in the tree (GalaxyRow + extractGalaxyRow, the buildGalaxyInfo split, SelectionRef/Row/Slot types, ResolveDeps + extractSelectionRow + buildFocusable, the focusIdOf/resolveFocusId codecs, the `selection` + `selectionRows` slices, rootReducer wiring, `SagaContext.resolveDeps`, `watchSelectionRows`, `catalogLoaded`).
- [x] Full test suite green (2814) + typecheck clean.
- [x] Smoke-tested live in the dev server (hover preview, select ring, focus tween, Esc clear).

Note: post-ship hardening on the same branch collapsed the `dataStatus` slice from Task 8 to a bare `catalogLoaded` event (its per-source generation counter was write-only) and dissolved the `galaxyInfoBuilder` shell from Task 3 (`niceRound` → `src/utils/math/niceRound.ts`; the dead `maxAbsCoord` and `resolveGalaxyInfo` were deleted).
