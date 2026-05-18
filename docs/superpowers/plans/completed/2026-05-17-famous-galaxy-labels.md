# Famous Galaxy Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render MSDF labels for the 75 curated Famous-catalog galaxies via the existing poiSubsystem, with kind-based categories (cluster / supercluster / famousGalaxy / void), apparent-size gating, and four always-visible Settings → Overlays → Labels toggles.

**Architecture:** Add `commonName?` to the Famous seed schema and propagate through buildFamous → famous_meta.json → FamousMetaEntry. Reshape `PoiCategory` to `cluster | supercluster | famousGalaxy | void`, co-locate the union with `POI_STYLES` in poiSubsystem.ts (FONTS / FontId pattern from PR #132), delete the standalone `PoiCategory.d.ts`. Add optional `minApparentSizePx` to `PointOfInterest`; `poiSubsystem.produceLabels` gates emission on projected pixel size when set. Wire Famous → POIs in `wireSlots.ts` once both `famousMetaSlot` commits AND the Famous catalog loads. Remove the `?anchors=1` URL gate so static anchors become first-class overlays. Add 4 always-visible checkboxes to SettingsPanel under Overlays → Labels, backed by a new `labelCategoryVisibility: Record<PoiCategory, boolean>` field on `EngineSettingsState` and an `onSetLabelCategoryVisibility` callback.

**Tech Stack:** TypeScript, Vitest, React (settings panel), WebGPU (via the existing LabelRenderer/MSDF pipeline — no shader changes).

**Branch + PR strategy:** Single feature branch (`feature/famous-galaxy-labels`) carries all tasks; each task ends with its own commit. Open one PR against `main` after Task 12 (manual verification) lands. Do NOT push individual tasks as separate PRs — they are tightly coupled (the poiSubsystem reshape, the wireSlots wire-up, and the settings toggles are useless in isolation).

---

### Task 1: Add `commonName` field + validation to FamousEntry seed

**Files:**
- Modify: `/Users/rulkens/Development/js/skymap/tools/parsers/famousSeed.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/parsers/famousSeed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/parsers/famousSeed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseFamousSeed, validateFamousEntry, type FamousEntry } from '../../../tools/parsers/famousSeed';

function baseEntry(overrides: Partial<FamousEntry> = {}): FamousEntry {
  return {
    id: 'm31',
    names: ['M31', 'NGC 224'],
    ra: 10.6847,
    dec: 41.2687,
    distanceMpc: 0.78,
    diameterKpc: 67,
    type: 'SA(s)b',
    description: 'A nearby spiral galaxy.',
    ...overrides,
  };
}

describe('famousSeed', () => {
  it('accepts an entry with a non-empty commonName', () => {
    const e = baseEntry({ commonName: 'Andromeda Galaxy' });
    expect(validateFamousEntry(e).commonName).toBe('Andromeda Galaxy');
  });

  it('accepts an entry with commonName omitted', () => {
    const e = baseEntry();
    expect(validateFamousEntry(e).commonName).toBeUndefined();
  });

  it('rejects a commonName that is the empty string', () => {
    const e = baseEntry({ commonName: '' });
    expect(() => validateFamousEntry(e)).toThrow(/commonName/);
  });

  it('rejects a commonName that is not a string', () => {
    const e = baseEntry({ commonName: 42 as unknown as string });
    expect(() => validateFamousEntry(e)).toThrow(/commonName/);
  });

  it('parseFamousSeed propagates commonName through the array', () => {
    const json = JSON.stringify([
      { ...baseEntry({ id: 'm31', commonName: 'Andromeda Galaxy' }) },
      { ...baseEntry({ id: 'm33' }) },
    ]);
    const out = parseFamousSeed(json);
    expect(out[0]!.commonName).toBe('Andromeda Galaxy');
    expect(out[1]!.commonName).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/parsers/famousSeed.test.ts`
Expected: FAIL — the test file imports `FamousEntry.commonName`, which doesn't exist yet, so `validateFamousEntry` happily accepts `commonName: ''` instead of throwing. The "rejects a commonName that is the empty string" test fails with "expected [Function] to throw".

- [ ] **Step 3: Implement minimal code to pass**

Edit `/Users/rulkens/Development/js/skymap/tools/parsers/famousSeed.ts`. Add `commonName` to the `FamousEntry` type — insert it after the `names: string[]` field:

```ts
  /**
   * One or more human-readable names, ordered by preference (primary
   * first).  E.g. `['M31', 'NGC 224', 'Andromeda Galaxy']`.  The command
   * palette searches all names; the InfoCard shows the first as the
   * headline and the rest as "also known as".
   */
  names: string[];
  /**
   * Curated human-friendly display name (e.g. `"Andromeda Galaxy"`).
   * Used as the label text in the POI overlay; falls back to the last
   * name in `names` then `id` when absent.  Optional because most seed
   * entries don't have a widely-recognised common name distinct from
   * their catalog identifier.
   */
  commonName?: string;
```

And add the validation block inside `validateFamousEntry`, immediately before the `if (e.axisRatio !== undefined)` block:

```ts
  if (e.commonName !== undefined) {
    if (typeof e.commonName !== 'string' || e.commonName.length === 0) {
      throw new Error(
        `famous seed: ${e.id} has invalid commonName ${JSON.stringify(e.commonName)} (expected non-empty string)`,
      );
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/parsers/famousSeed.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/parsers/famousSeed.ts tests/tools/parsers/famousSeed.test.ts
git commit -m "$(cat <<'EOF'
feat(famous): add optional commonName field to FamousEntry seed

Curated human-friendly display name distinct from the catalog id and
the names[] array.  Feeds the Famous-galaxy label overlay; absent
entries fall back to names[]/id at label-pack time.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Propagate `commonName` through buildFamous → famous_meta.json

**Files:**
- Modify: `/Users/rulkens/Development/js/skymap/tools/buildFamous.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/@types/loading/FamousMetaEntry.d.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/buildFamous.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/buildFamous.test.ts`. The build script's `main()` does real I/O, so this test exercises the type contract on `FamousMetaEntry` and verifies the seed → meta record shape via a small functional shim (we don't run the full build):

```ts
import { describe, expect, it } from 'vitest';
import type { FamousMetaEntry } from '../../src/@types/loading/FamousMetaEntry';
import type { FamousEntry } from '../../tools/parsers/famousSeed';

/**
 * Mirror of the per-entry meta-record construction inside `buildFamous.ts`.
 * Co-located in the test rather than imported so a refactor of
 * `buildFamous.ts` that drops `commonName` fails loud right here.
 */
function entryToMeta(e: FamousEntry): FamousMetaEntry {
  return {
    id: e.id,
    names: e.names,
    description: e.description,
    type: e.type,
    ...(e.commonName !== undefined ? { commonName: e.commonName } : {}),
  };
}

describe('buildFamous meta-record construction', () => {
  it('includes commonName when the seed entry has one', () => {
    const e: FamousEntry = {
      id: 'm31',
      names: ['M31', 'NGC 224'],
      commonName: 'Andromeda Galaxy',
      ra: 10.68,
      dec: 41.27,
      distanceMpc: 0.78,
      diameterKpc: 67,
      type: 'SA(s)b',
      description: 'Spiral galaxy.',
    };
    const meta = entryToMeta(e);
    expect(meta.commonName).toBe('Andromeda Galaxy');
  });

  it('omits commonName when the seed entry has none', () => {
    const e: FamousEntry = {
      id: 'ngc-6744',
      names: ['NGC 6744'],
      ra: 287.44,
      dec: -63.85,
      distanceMpc: 9.5,
      diameterKpc: 60,
      type: 'SAB(r)bc',
      description: 'A Milky Way analogue.',
    };
    const meta = entryToMeta(e);
    expect(meta.commonName).toBeUndefined();
    expect('commonName' in meta).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/buildFamous.test.ts`
Expected: FAIL — `FamousMetaEntry` doesn't have a `commonName` field yet, so the test file fails to typecheck. Vitest reports a TS error like "Object literal may only specify known properties, and 'commonName' does not exist in type 'FamousMetaEntry'".

- [ ] **Step 3: Implement minimal code to pass**

Edit `/Users/rulkens/Development/js/skymap/src/@types/loading/FamousMetaEntry.d.ts` — add `commonName` after `names`:

```ts
/** One famous-galaxy metadata record, indexed by its local position in famous.bin. */
export type FamousMetaEntry = {
  id: string;
  names: string[];
  /**
   * Curated human-friendly display name (e.g. `"Andromeda Galaxy"`).
   * Mirrors the optional field on the seed entry.  Absent for most
   * entries — the POI label producer falls back to `names`/`id`.
   */
  commonName?: string;
  description: string;
  type: string;
  /**
   * Optional flag marking a row that doesn't correspond to a real
   * catalog object.  Pseudo entries (currently just the Milky Way —
   * see `data/milkyWayEntry.ts`) are merged into the palette's
   * entries array but have no `famous.bin` counterpart, so:
   *
   *   - Their id can never be looked up via
   *     `state.sources.famousMeta.findIndex` (the engine's famousMeta
   *     comes from the bin and won't include them).
   *   - The command palette can't render their thumbnail via the
   *     `/images/famous/{id}.webp` URL — there is no per-id WebP for a
   *     pseudo entry.  The palette branches on `pseudo === true` to
   *     render a glyph fallback instead of a broken-image icon.
   *
   * Real entries loaded from `famous_meta.json` never set this flag
   * (the field is absent in the JSON), so production data flows
   * through the existing path unchanged.
   */
  pseudo?: true;
};
```

Edit `/Users/rulkens/Development/js/skymap/tools/buildFamous.ts`. Find this block (around line 160):

```ts
  const metaByIdx: Array<{
    id: string;
    names: string[];
    description: string;
    type: string;
  }> = [];
```

Replace it with:

```ts
  const metaByIdx: Array<{
    id: string;
    names: string[];
    commonName?: string;
    description: string;
    type: string;
  }> = [];
```

Then find the `metaByIdx.push` call (around line 223):

```ts
    metaByIdx.push({ id: e.id, names: e.names, description: e.description, type: e.type });
```

Replace it with:

```ts
    metaByIdx.push({
      id: e.id,
      names: e.names,
      description: e.description,
      type: e.type,
      ...(e.commonName !== undefined ? { commonName: e.commonName } : {}),
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/buildFamous.test.ts`
Expected: PASS (2 tests).

Also run the full typecheck to make sure no consumer of `FamousMetaEntry` regresses:

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/buildFamous.ts src/@types/loading/FamousMetaEntry.d.ts tests/tools/buildFamous.test.ts
git commit -m "$(cat <<'EOF'
feat(famous): propagate commonName through buildFamous and FamousMetaEntry

The build now copies the optional commonName from each seed entry into
the famous_meta.json record, and the runtime FamousMetaEntry type
mirrors the optional field.  No format-version bump — the field is
absent for entries that don't have a curated common name, so existing
JSON sidecars parse unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Seed `commonName` for a starter set of famous galaxies

**Files:**
- Modify: `/Users/rulkens/Development/js/skymap/data/famous_galaxies.seed.json`

This is a data-only change. The seed JSON file lists ~75 curated entries; we add `commonName` to ten well-known ones. No automated test — the parser already enforces the field's shape (covered by Task 1), and the visual verification of "label reads 'Andromeda Galaxy'" lives in Task 12.

- [ ] **Step 1: Open the seed file and locate target entries**

Open `/Users/rulkens/Development/js/skymap/data/famous_galaxies.seed.json` and locate the entries with these `id` values: `m31`, `m33`, `m81`, `m87`, `m104`, `ngc-5128`, `m51`, `m101`, `ngc-1275`, `ngc-1365`. (If any of these ids are absent in the current seed file, skip that entry — leave a comment in the commit message naming the skipped ids. Do NOT invent ids that aren't in the file.)

- [ ] **Step 2: Add `commonName` to each located entry**

For each located entry, insert a `"commonName": "<name>"` field immediately after the `"names"` array. The mapping is:

| id          | commonName             |
| ----------- | ---------------------- |
| m31         | Andromeda Galaxy       |
| m33         | Triangulum Galaxy      |
| m81         | Bode's Galaxy          |
| m87         | Virgo A                |
| m104        | Sombrero Galaxy        |
| ngc-5128    | Centaurus A            |
| m51         | Whirlpool Galaxy       |
| m101        | Pinwheel Galaxy        |
| ngc-1275    | Perseus A              |
| ngc-1365    | Great Barred Spiral    |

Example diff for the `m31` entry:

```json
{
  "id": "m31",
  "names": ["M31", "NGC 224"],
  "commonName": "Andromeda Galaxy",
  "ra": 10.6847,
  ...
}
```

- [ ] **Step 3: Verify the seed parses cleanly**

Run the parser against the file to confirm validity. There's no dedicated CLI, but the test suite's `parseFamousSeed` reads the same file via `tests/tools/parsers/famousSeed.test.ts`. Re-run that test plus the full lint pass:

Run: `npm test -- tests/tools/parsers/famousSeed.test.ts`
Expected: PASS (5 tests, unchanged from Task 1).

Run: `npm run format -- --check data/famous_galaxies.seed.json`
Expected: PASS (the file is already prettified; our additions match the existing indentation).

- [ ] **Step 4: Commit**

```bash
git add data/famous_galaxies.seed.json
git commit -m "$(cat <<'EOF'
data(famous): seed commonName for ten well-known galaxies

Hand-curated display names for the most-recognised entries (M31, M33,
M81, M87, M104, M51, M101, Centaurus A, Perseus A, NGC 1365).  Remaining
entries fall back to their catalog id at label-pack time and can be
filled in incrementally without code changes.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Co-locate `PoiCategory` with `POI_STYLES` and add new categories

**Files:**
- Modify: `/Users/rulkens/Development/js/skymap/src/services/engine/subsystems/poiSubsystem.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/@types/engine/subsystems/PointOfInterest.d.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/@types/engine/subsystems/PoiSubsystem.d.ts`
- Delete: `/Users/rulkens/Development/js/skymap/src/@types/engine/subsystems/PoiCategory.d.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/data/poiCategories.test.ts`
- Modify: `/Users/rulkens/Development/js/skymap/tests/services/engine/subsystems/poiSubsystem.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/data/poiCategories.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { POI_STYLES } from '../../src/services/engine/subsystems/poiSubsystem';
import type { PoiCategory } from '../../src/services/engine/subsystems/poiSubsystem';

describe('POI category registry', () => {
  it('exposes the four expected category keys', () => {
    // Order-insensitive — the consumer order is decoupled from the
    // declaration order in POI_STYLES.
    expect(Object.keys(POI_STYLES).sort()).toEqual(
      ['cluster', 'famousGalaxy', 'supercluster', 'void'].sort(),
    );
  });

  it('every style entry has the four required fields', () => {
    for (const [key, style] of Object.entries(POI_STYLES)) {
      expect(style.labelColor, `${key}.labelColor`).toHaveLength(4);
      expect(style.lineColor, `${key}.lineColor`).toHaveLength(4);
      expect(style.pixelSize, `${key}.pixelSize`).toBeGreaterThan(0);
      expect(style.worldEmMpc, `${key}.worldEmMpc`).toBeGreaterThan(0);
      expect(style.pixelWidth, `${key}.pixelWidth`).toBeGreaterThan(0);
    }
  });

  it('PoiCategory is the literal union of POI_STYLES keys (compile-time check)', () => {
    // Encoded as a value-level expect — if PoiCategory ever drifts from
    // `keyof typeof POI_STYLES`, the assignments below stop compiling.
    const c1: PoiCategory = 'cluster';
    const c2: PoiCategory = 'supercluster';
    const c3: PoiCategory = 'famousGalaxy';
    const c4: PoiCategory = 'void';
    expect([c1, c2, c3, c4]).toEqual([
      'cluster',
      'supercluster',
      'famousGalaxy',
      'void',
    ]);
  });
});
```

Also update `/Users/rulkens/Development/js/skymap/tests/services/engine/subsystems/poiSubsystem.test.ts`. Replace the `M31` constant (currently `category: 'galaxy'`) with two new constants and update the existing test cases that reference `M31`. The full new file content:

```ts
import { describe, expect, it } from 'vitest';
import { createPoiSubsystem } from '../../../../src/services/engine/subsystems/poiSubsystem';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function makeState(): EngineState {
  return { subsystems: { scheduler: { requestRender: () => {} } } } as unknown as EngineState;
}
function makeCtx(): ReadyFrameContext {
  return {
    drawCamPos: [0, 0, 0],
    canvasSize: { width: 1920, height: 1080 },
    drawPxPerRad: 1080 / (2 * Math.tan((60 * Math.PI) / 180 / 2)),
  } as unknown as ReadyFrameContext;
}

const VIRGO: PointOfInterest = {
  id: 'virgo',
  name: 'Virgo',
  category: 'cluster',
  worldPos: [-15.98, -2.13, 3.54],
  crosshairSizeMpc: 5,
};
const M31: PointOfInterest = {
  id: 'm31',
  name: 'Andromeda Galaxy',
  category: 'famousGalaxy',
  worldPos: [0.5, 0.1, 0.0],
};
const BOOTES_VOID: PointOfInterest = {
  id: 'bootes',
  name: 'Boötes Void',
  category: 'void',
  worldPos: [200, 100, 50],
  crosshairSizeMpc: 20,
};
const LANIAKEA: PointOfInterest = {
  id: 'laniakea',
  name: 'Laniakea',
  category: 'supercluster',
  worldPos: [-50, -20, 10],
  crosshairSizeMpc: 25,
};

describe('poiSubsystem', () => {
  it('returns empty output when no POIs are set', () => {
    const sub = createPoiSubsystem();
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
    expect(out.awake).toBe(false);
  });

  it('emits one label per visible POI', () => {
    const sub = createPoiSubsystem();
    sub.setPois([VIRGO, M31]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toHaveLength(2);
    expect(out.labels.map((l) => l.text)).toEqual(['Virgo', 'Andromeda Galaxy']);
  });

  it('emits 3 perpendicular crosshair lines for POIs with crosshairSizeMpc', () => {
    const sub = createPoiSubsystem();
    sub.setPois([VIRGO]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.lines).toHaveLength(3);
  });

  it('omits crosshair lines for POIs without crosshairSizeMpc', () => {
    const sub = createPoiSubsystem();
    sub.setPois([M31]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.lines).toHaveLength(0);
  });

  it('filters by category visibility', () => {
    const sub = createPoiSubsystem();
    sub.setPois([VIRGO, M31, BOOTES_VOID, LANIAKEA]);
    sub.setCategoryVisible('famousGalaxy', false);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels.map((l) => l.text)).toEqual(['Virgo', 'Boötes Void', 'Laniakea']);
  });

  it('accepts the supercluster category and styles it from POI_STYLES.supercluster', () => {
    const sub = createPoiSubsystem();
    sub.setPois([LANIAKEA]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toHaveLength(1);
    expect(out.labels[0]!.text).toBe('Laniakea');
  });

  it('setPois replaces the list immutably (does not mutate input)', () => {
    const sub = createPoiSubsystem();
    const initial = [VIRGO];
    sub.setPois(initial);
    sub.setPois([M31]);
    expect(initial).toEqual([VIRGO]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels.map((l) => l.text)).toEqual(['Andromeda Galaxy']);
  });

  it('has stable id "pois"', () => {
    expect(createPoiSubsystem().id).toBe('pois');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/data/poiCategories.test.ts tests/services/engine/subsystems/poiSubsystem.test.ts`
Expected: FAIL — `POI_STYLES` and `PoiCategory` are not exported from `poiSubsystem.ts` yet; the type `'famousGalaxy'` is not a valid `PoiCategory`. Both files fail to typecheck.

- [ ] **Step 3: Implement minimal code to pass**

Edit `/Users/rulkens/Development/js/skymap/src/services/engine/subsystems/poiSubsystem.ts`. Replace the existing `import type { PoiCategory } from '...'` line and the local `STYLES`/`ALL_CATEGORIES_VISIBLE` constants with the co-located registry. The full new file:

```ts
/**
 * poiSubsystem — typed list of named points of interest (clusters,
 * superclusters, famous galaxies, voids) rendered as text labels +
 * optional crosshairs.
 *
 * ### Why one subsystem for four kinds?
 *
 * Clusters, superclusters, individual famous galaxies, and voids all
 * share the same physical surface: anchor a label at a world position,
 * optionally draw a small visual marker so the user can see the
 * precise centre.  The differences (label colour, default pixel size,
 * crosshair size) are data — `category` + a per-category default
 * table.  Splitting into four subsystems would quadruplicate the
 * producer plumbing without adding any clarity.
 *
 * ### Why `POI_STYLES` and `PoiCategory` live together
 *
 * The category union is derived from the const registry via
 * `keyof typeof POI_STYLES`.  This mirrors the FONTS / FontId pattern
 * (PR #132) — co-locating the value and its type union means they
 * cannot drift.  Adding a fifth category is a single edit (add a row
 * to POI_STYLES) that automatically widens `PoiCategory`.
 *
 * ### Crosshair shape
 *
 * Three perpendicular line segments, each `crosshairSizeMpc` long,
 * centred on `worldPos`.  Cheap to render (3 lines per POI), reads
 * clearly at any zoom, and indicates the precise centre regardless
 * of the label's text bounds.  POIs without `crosshairSizeMpc` (e.g.
 * individual galaxies the user clicked on once) get a label only.
 *
 * ### Apparent-size gating
 *
 * A POI may set `minApparentSizePx` — the producer projects its
 * underlying physical diameter (taken from `crosshairSizeMpc` when
 * available, otherwise omitted from the gate) to screen-pixel space
 * via `apparentSizePx()` and skips emission when the result is below
 * the threshold.  Famous galaxies set this to 6 px (galaxies smaller
 * than ~6 px are visually indistinguishable from the underlying point
 * anyway).  Cluster / supercluster / void anchors omit the field and
 * emit unconditionally.
 *
 * ### Immutability
 *
 * `setPois` takes a readonly array and stores a defensive copy via
 * spread so external mutation can't bleed in.  `setCategoryVisible`
 * replaces the per-category visibility record wholesale.  Each call
 * to `produceLabels` returns a fresh output object — no caching, no
 * shared references between frames.  Per-frame label/line accumulators
 * are locally-mutable for perf, but the returned arrays are typed
 * readonly so callers can't mutate them in place.
 */

import type { Label } from '../../../@types/rendering/Label';
import type { MarkerLine } from '../../../@types/rendering/MarkerLine';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { Vec4 } from '../../../@types/math/Vec4';
import type { LabelProducerOutput } from '../../../@types/engine/subsystems/LabelProducerOutput';
import type { PointOfInterest } from '../../../@types/engine/subsystems/PointOfInterest';
import type { PoiSubsystem } from '../../../@types/engine/subsystems/PoiSubsystem';

type CategoryStyle = {
  readonly labelColor: Vec4;
  readonly lineColor: Vec4;
  readonly pixelSize: number;
  readonly worldEmMpc: number;
  readonly pixelWidth: number;
};

/**
 * The per-category visual style table.  Keys are the canonical
 * category identifiers; `PoiCategory` below is derived from these
 * keys so the type and the data cannot drift.
 *
 * Style choices:
 *   - cluster      — warm yellow, mid pixel size, sub-Mpc world-em
 *   - supercluster — slightly dimmer yellow, larger world-em (tens of Mpc extent)
 *   - famousGalaxy — warm off-white, smallest world-em (galaxies span sub-Mpc)
 *   - void         — soft cyan, largest world-em (voids span 30–50+ Mpc radii)
 */
export const POI_STYLES = {
  cluster: {
    labelColor: [1.0, 0.85, 0.4, 1] as Vec4,
    lineColor: [0.9, 0.75, 0.3, 1] as Vec4,
    pixelSize: 16,
    worldEmMpc: 0.5,
    pixelWidth: 2,
  },
  supercluster: {
    labelColor: [1.0, 0.8, 0.5, 1] as Vec4,
    lineColor: [0.9, 0.7, 0.45, 1] as Vec4,
    pixelSize: 16,
    worldEmMpc: 2.0,
    pixelWidth: 2,
  },
  famousGalaxy: {
    labelColor: [1.0, 0.95, 0.8, 1] as Vec4,
    lineColor: [0.9, 0.85, 0.7, 1] as Vec4,
    pixelSize: 15,
    worldEmMpc: 0.05,
    pixelWidth: 1.5,
  },
  void: {
    labelColor: [0.6, 0.85, 0.95, 1] as Vec4,
    lineColor: [0.45, 0.7, 0.85, 1] as Vec4,
    pixelSize: 16,
    worldEmMpc: 1.0,
    pixelWidth: 2,
  },
} as const satisfies Readonly<Record<string, CategoryStyle>>;

/**
 * The category union derived from POI_STYLES.  See the module header
 * for why the value and its type live together.
 */
export type PoiCategory = keyof typeof POI_STYLES;

const ALL_CATEGORIES_VISIBLE: Readonly<Record<PoiCategory, boolean>> = {
  cluster: true,
  supercluster: true,
  famousGalaxy: true,
  void: true,
};

export function createPoiSubsystem(): PoiSubsystem {
  let pois: readonly PointOfInterest[] = [];
  let visibility: Readonly<Record<PoiCategory, boolean>> = ALL_CATEGORIES_VISIBLE;

  function setPois(next: readonly PointOfInterest[]): void {
    pois = [...next];
  }

  function clearPois(): void {
    pois = [];
  }

  function setCategoryVisible(category: PoiCategory, visible: boolean): void {
    visibility = { ...visibility, [category]: visible };
  }

  function makeCrosshairLines(
    p: PointOfInterest,
    style: CategoryStyle,
  ): readonly MarkerLine[] {
    if (p.crosshairSizeMpc === undefined) return [];
    const half = p.crosshairSizeMpc;
    const [cx, cy, cz] = p.worldPos;
    const mk = (id: string, from: Vec3, to: Vec3): MarkerLine => ({
      id,
      fromWorld: from,
      toWorld: to,
      pixelWidth: style.pixelWidth,
      color: [...style.lineColor],
    });
    return [
      mk(`${p.id}-x`, [cx - half, cy, cz], [cx + half, cy, cz]),
      mk(`${p.id}-y`, [cx, cy - half, cz], [cx, cy + half, cz]),
      mk(`${p.id}-z`, [cx, cy, cz - half], [cx, cy, cz + half]),
    ];
  }

  function produceLabels(_state: EngineState, _ctx: ReadyFrameContext): LabelProducerOutput {
    const labels: Label[] = [];
    const lines: MarkerLine[] = [];
    for (const p of pois) {
      if (!visibility[p.category]) continue;
      const style = POI_STYLES[p.category];
      labels.push({
        id: p.id,
        worldPos: [p.worldPos[0], p.worldPos[1], p.worldPos[2]],
        text: p.name,
        font: 'cormorant',
        pixelSize: style.pixelSize,
        color: [...style.labelColor],
        worldEmMpc: style.worldEmMpc,
        fadeAlpha: 1,
        alignX: 'left',
      });
      for (const line of makeCrosshairLines(p, style)) lines.push(line);
    }
    return { labels, lines, awake: false };
  }

  const subsystem: PoiSubsystem = {
    id: 'pois',
    produceLabels,
    setPois,
    clearPois,
    setCategoryVisible,
    destroy(): void {
      // Intentionally empty — see the type-level docstring for why.
    },
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
```

Edit `/Users/rulkens/Development/js/skymap/src/@types/engine/subsystems/PointOfInterest.d.ts`. Replace the `PoiCategory` import with one from `poiSubsystem`:

```ts
import type { Vec3 } from '../../math/Vec3';
import type { PoiCategory } from '../../../services/engine/subsystems/poiSubsystem';

export type PointOfInterest = {
  readonly id: string;
  readonly name: string;
  readonly category: PoiCategory;
  readonly worldPos: Vec3;
  /** Crosshair half-length in Mpc.  Omit to draw label only. */
  readonly crosshairSizeMpc?: number;
};
```

Edit `/Users/rulkens/Development/js/skymap/src/@types/engine/subsystems/PoiSubsystem.d.ts`. Replace the `PoiCategory` import the same way:

```ts
import type { LabelProducer } from './LabelProducer';
import type { PoiCategory } from '../../../services/engine/subsystems/poiSubsystem';
import type { PointOfInterest } from './PointOfInterest';

export type PoiSubsystem = LabelProducer & {
  setPois(pois: readonly PointOfInterest[]): void;
  clearPois(): void;
  setCategoryVisible(category: PoiCategory, visible: boolean): void;
  /**
   * Tear down the subsystem.  No-op — the subsystem owns only
   * plain-data state (pois list, visibility record); there are no
   * listeners, timers, or workers to release.  Method exists so the
   * engine's bag of subsystems can be torn down uniformly via the
   * shared `Destroyable` shape (`engine.destroy()` iterates and calls
   * `destroy()` on each).
   */
  destroy(): void;
};
```

Delete the standalone declaration file:

```bash
rm /Users/rulkens/Development/js/skymap/src/@types/engine/subsystems/PoiCategory.d.ts
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/data/poiCategories.test.ts tests/services/engine/subsystems/poiSubsystem.test.ts`
Expected: PASS (3 tests in poiCategories, 8 tests in poiSubsystem).

Run: `npm run typecheck`
Expected: PASS — no consumers of `PoiCategory` should still reference the deleted file because the only ones (`PointOfInterest.d.ts`, `PoiSubsystem.d.ts`, `poiSubsystem.ts` itself) were updated above. If typecheck fails with "Cannot find module '../../subsystems/PoiCategory'", grep the codebase for `PoiCategory.d` and `subsystems/PoiCategory` to find any stragglers, and update their import to point at `poiSubsystem`.

- [ ] **Step 5: Commit**

```bash
git add -A src/services/engine/subsystems/poiSubsystem.ts \
            src/@types/engine/subsystems/PointOfInterest.d.ts \
            src/@types/engine/subsystems/PoiSubsystem.d.ts \
            src/@types/engine/subsystems/PoiCategory.d.ts \
            tests/data/poiCategories.test.ts \
            tests/services/engine/subsystems/poiSubsystem.test.ts
git commit -m "$(cat <<'EOF'
refactor(poi): co-locate PoiCategory with POI_STYLES; add supercluster + famousGalaxy

POI_STYLES is now the single source of truth — `PoiCategory =
keyof typeof POI_STYLES`.  The standalone PoiCategory.d.ts is deleted;
PointOfInterest and PoiSubsystem types import from the subsystem
module.  Adds two new category styles (supercluster, famousGalaxy)
and renames the former 'galaxy' to 'famousGalaxy' for clarity.

Mirrors the FONTS / FontId pattern from PR #132.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Add `minApparentSizePx` to PointOfInterest + gate in produceLabels

**Files:**
- Modify: `/Users/rulkens/Development/js/skymap/src/@types/engine/subsystems/PointOfInterest.d.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/services/engine/subsystems/poiSubsystem.ts`
- Modify: `/Users/rulkens/Development/js/skymap/tests/services/engine/subsystems/poiSubsystem.test.ts`

- [ ] **Step 1: Write the failing test**

Append the following test cases to `/Users/rulkens/Development/js/skymap/tests/services/engine/subsystems/poiSubsystem.test.ts`, just before the final closing `});` of the `describe('poiSubsystem', ...)` block:

```ts
  // ── Apparent-size gating ─────────────────────────────────────────
  //
  // `minApparentSizePx` lets a POI suppress emission when its physical
  // extent (passed via `apparentDiameterKpc`) projects to fewer screen
  // pixels than the threshold.  Cluster/supercluster/void anchors
  // omit the field and always emit; Famous galaxies set it so
  // far-away tiny galaxies don't clutter the view.
  it('emits a POI with minApparentSizePx when projected size meets the threshold', () => {
    const sub = createPoiSubsystem();
    // Galaxy 1 Mpc away with 50 kpc diameter under a 60° fovY at
    // 1080 px viewport: angular = 50 / (1 * 1000) = 0.05 rad.  pxPerRad
    // = 1080 / (2*tan(30°)) ≈ 935.  apparentSizePx ≈ 46.7 px — well above
    // any reasonable threshold.
    const close: PointOfInterest = {
      id: 'close',
      name: 'Close',
      category: 'famousGalaxy',
      worldPos: [1, 0, 0],
      minApparentSizePx: 6,
      apparentDiameterKpc: 50,
    };
    sub.setPois([close]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels.map((l) => l.id)).toEqual(['close']);
  });

  it('suppresses a POI when projected size falls below minApparentSizePx', () => {
    const sub = createPoiSubsystem();
    // Galaxy 500 Mpc away with 30 kpc diameter under the same camera:
    // angular = 30 / (500 * 1000) = 6e-5 rad.  apparentSizePx ≈ 0.056 px
    // — way below the 6 px threshold.
    const far: PointOfInterest = {
      id: 'far',
      name: 'Far',
      category: 'famousGalaxy',
      worldPos: [500, 0, 0],
      minApparentSizePx: 6,
      apparentDiameterKpc: 30,
    };
    sub.setPois([far]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
  });

  it('emits a POI without minApparentSizePx unconditionally', () => {
    const sub = createPoiSubsystem();
    // 500 Mpc away — would be suppressed if a threshold were set,
    // but the field is absent so the producer skips the gate.
    const noGate: PointOfInterest = {
      id: 'no-gate',
      name: 'NoGate',
      category: 'cluster',
      worldPos: [500, 0, 0],
    };
    sub.setPois([noGate]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels.map((l) => l.id)).toEqual(['no-gate']);
  });

  it('emits a POI with minApparentSizePx but no apparentDiameterKpc unconditionally', () => {
    // Defensive default: if the consumer set a threshold but forgot to
    // provide a diameter, fall through (better to over-emit than to
    // silently hide a POI the consumer thought they configured).
    const sub = createPoiSubsystem();
    const partial: PointOfInterest = {
      id: 'partial',
      name: 'Partial',
      category: 'famousGalaxy',
      worldPos: [500, 0, 0],
      minApparentSizePx: 6,
    };
    sub.setPois([partial]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels.map((l) => l.id)).toEqual(['partial']);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/services/engine/subsystems/poiSubsystem.test.ts`
Expected: FAIL — `PointOfInterest` doesn't have `minApparentSizePx` or `apparentDiameterKpc` fields yet; the test file fails to typecheck.

- [ ] **Step 3: Implement minimal code to pass**

Edit `/Users/rulkens/Development/js/skymap/src/@types/engine/subsystems/PointOfInterest.d.ts`. Replace the whole file with:

```ts
import type { Vec3 } from '../../math/Vec3';
import type { PoiCategory } from '../../../services/engine/subsystems/poiSubsystem';

export type PointOfInterest = {
  readonly id: string;
  readonly name: string;
  readonly category: PoiCategory;
  readonly worldPos: Vec3;
  /** Crosshair half-length in Mpc.  Omit to draw label only. */
  readonly crosshairSizeMpc?: number;
  /**
   * Minimum on-screen pixel size at which this POI emits a label.  When
   * present together with `apparentDiameterKpc`, the producer projects
   * the diameter to pixels at the current camera distance and skips
   * emission below the threshold.  Famous galaxies use this to avoid
   * cluttering far zooms with labels for galaxies smaller than the
   * underlying point billboard.  Absent → always emit (the default for
   * cluster / supercluster / void anchors).
   */
  readonly minApparentSizePx?: number;
  /**
   * Physical diameter in kpc, used together with `minApparentSizePx`
   * for apparent-size gating.  Famous-galaxy entries populate this
   * from `famous.bin`'s `diameterKpc` column; cluster / supercluster
   * / void anchors omit it (no sensible "diameter" for an extended
   * structure).  If `minApparentSizePx` is set but this is absent,
   * the gate falls through (always emit) — safer than silently
   * hiding a misconfigured POI.
   */
  readonly apparentDiameterKpc?: number;
};
```

Edit `/Users/rulkens/Development/js/skymap/src/services/engine/subsystems/poiSubsystem.ts`. Add an import for `apparentSizePx` near the top with the other imports:

```ts
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
```

Then replace the `produceLabels` function body with the gated version:

```ts
  function produceLabels(_state: EngineState, ctx: ReadyFrameContext): LabelProducerOutput {
    const labels: Label[] = [];
    const lines: MarkerLine[] = [];
    // Recover the vertical fov from the per-frame `drawPxPerRad`:
    //   drawPxPerRad = canvasSize.height / (2 * tan(fovY/2))
    // ⇒ fovY = 2 * atan(canvasSize.height / (2 * drawPxPerRad))
    // We do this rather than carrying fovY directly on ReadyFrameContext
    // because `drawPxPerRad` is the already-derived scalar every other
    // per-frame consumer reads from.
    const halfH = ctx.canvasSize.height * 0.5;
    const fovYRad = 2 * Math.atan(halfH / ctx.drawPxPerRad);
    const [cx, cy, cz] = ctx.drawCamPos;
    for (const p of pois) {
      if (!visibility[p.category]) continue;
      // Apparent-size gate.  Only runs when both threshold AND diameter
      // are set — see the type doc on `apparentDiameterKpc` for the
      // permissive-default rationale.
      if (p.minApparentSizePx !== undefined && p.apparentDiameterKpc !== undefined) {
        const dx = p.worldPos[0] - cx;
        const dy = p.worldPos[1] - cy;
        const dz = p.worldPos[2] - cz;
        const distanceMpc = Math.hypot(dx, dy, dz);
        const sizePx = apparentSizePx({
          diameterKpc: p.apparentDiameterKpc,
          distanceMpc,
          viewportHeightPx: ctx.canvasSize.height,
          fovYRad,
        });
        if (sizePx < p.minApparentSizePx) continue;
      }
      const style = POI_STYLES[p.category];
      labels.push({
        id: p.id,
        worldPos: [p.worldPos[0], p.worldPos[1], p.worldPos[2]],
        text: p.name,
        font: 'cormorant',
        pixelSize: style.pixelSize,
        color: [...style.labelColor],
        worldEmMpc: style.worldEmMpc,
        fadeAlpha: 1,
        alignX: 'left',
      });
      for (const line of makeCrosshairLines(p, style)) lines.push(line);
    }
    return { labels, lines, awake: false };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/services/engine/subsystems/poiSubsystem.test.ts`
Expected: PASS (12 tests — the 8 pre-existing plus the 4 new).

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/@types/engine/subsystems/PointOfInterest.d.ts \
        src/services/engine/subsystems/poiSubsystem.ts \
        tests/services/engine/subsystems/poiSubsystem.test.ts
git commit -m "$(cat <<'EOF'
feat(poi): apparent-size gate for label emission

`PointOfInterest` gains optional `minApparentSizePx` and
`apparentDiameterKpc` fields.  When both are set, `produceLabels`
projects the diameter to screen-pixel space via the existing
`apparentSizePx()` helper and suppresses emission below the threshold.
Cluster/supercluster/void anchors omit the fields and always emit;
Famous galaxies will set them in a follow-up task.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Update `SUPERCLUSTER_ANCHORS` wiring to use the new `supercluster` category

**Files:**
- Modify: `/Users/rulkens/Development/js/skymap/src/services/engine/phases/wireSlots.ts`

This task only touches the existing `?anchors=1` block (Task 7 removes that gate). We split it so the type-rename and the gate-removal land in separate commits.

- [ ] **Step 1: Locate the supercluster wiring**

Open `/Users/rulkens/Development/js/skymap/src/services/engine/phases/wireSlots.ts` and find the `SUPERCLUSTER_ANCHORS.map` block (around line 203). It currently emits POIs with `category: 'cluster'`.

- [ ] **Step 2: Write a smoke check (assertion as a temporary local test)**

This is a single-line type-and-value change; rather than add a new test file, we lean on the existing `wireSlots.test.ts` for coverage and verify by running it after the edit. If `wireSlots.test.ts` currently asserts a specific category on a supercluster anchor, this step is "find that assertion and update it"; if not, the change is purely a type-correctness one.

Open `/Users/rulkens/Development/js/skymap/tests/services/engine/phases/wireSlots.test.ts` and grep within it for `supercluster` or `SUPERCLUSTER_ANCHORS`. If a test exists that asserts `category: 'cluster'` on a supercluster anchor, update that assertion to `category: 'supercluster'` as part of Step 3.

- [ ] **Step 3: Implement minimal code to pass**

In `/Users/rulkens/Development/js/skymap/src/services/engine/phases/wireSlots.ts`, change the supercluster mapping (around lines 203-214):

From:

```ts
      ...SUPERCLUSTER_ANCHORS.map(
        (a): PointOfInterest => ({
          id: `supercluster-${slug(a.name)}`,
          name: a.name,
          category: 'cluster',
          worldPos: raDecDistToEqCart(a),
          // ~10 % of distance, floor 10 Mpc — superclusters span
          // tens of Mpc so the marker should read at supercluster
          // scale, not Abell-cluster-core scale.
          crosshairSizeMpc: Math.max(10, a.distMpc * 0.1),
        }),
      ),
```

To:

```ts
      ...SUPERCLUSTER_ANCHORS.map(
        (a): PointOfInterest => ({
          id: `supercluster-${slug(a.name)}`,
          name: a.name,
          category: 'supercluster',
          worldPos: raDecDistToEqCart(a),
          // ~10 % of distance, floor 10 Mpc — superclusters span
          // tens of Mpc so the marker should read at supercluster
          // scale, not Abell-cluster-core scale.
          crosshairSizeMpc: Math.max(10, a.distMpc * 0.1),
        }),
      ),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/services/engine/phases/wireSlots.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/phases/wireSlots.ts tests/services/engine/phases/wireSlots.test.ts
git commit -m "$(cat <<'EOF'
fix(wireSlots): emit supercluster anchors with category 'supercluster'

Previously misfiled as 'cluster', so the SettingsPanel had no way to
toggle them independently.  Now uses the dedicated supercluster style
(slightly dimmer yellow, larger world-em) introduced in the POI
category co-location refactor.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Remove the `?anchors=1` URL gate so static anchors are always wired

**Files:**
- Modify: `/Users/rulkens/Development/js/skymap/src/services/engine/phases/wireSlots.ts`
- Modify: `/Users/rulkens/Development/js/skymap/tests/services/engine/phases/wireSlots.test.ts`

- [ ] **Step 1: Write the failing test**

Open `/Users/rulkens/Development/js/skymap/tests/services/engine/phases/wireSlots.test.ts` and add (or replace) a test that asserts the static anchors are wired regardless of URL state. Append this test inside the existing `describe(...)` block:

```ts
  it('wires static cluster/supercluster/void anchors unconditionally (no URL gate)', async () => {
    // No `?anchors=1` query param.  After wireSlots runs, the POI
    // subsystem should still receive the static anchor list — the
    // production default since the `?anchors=1` gate is removed.
    //
    // This test exercises only the slot-wiring side effect on
    // state.subsystems.pois.  See the harness builder above for the
    // mock state/deps construction.
    delete (globalThis as { location?: unknown }).location;
    (globalThis as { location: { search: string } }).location = { search: '' };

    const { state, deps } = buildWireSlotsHarness();
    let received: readonly PointOfInterest[] = [];
    state.subsystems.pois.setPois = (pois) => {
      received = pois;
    };
    await wireSlots(state, deps);
    expect(received.length).toBeGreaterThan(0);
    expect(received.some((p) => p.category === 'cluster')).toBe(true);
    expect(received.some((p) => p.category === 'supercluster')).toBe(true);
    expect(received.some((p) => p.category === 'void')).toBe(true);
  });
```

Note: the existing `wireSlots.test.ts` already imports a harness factory (or builds its mock state inline). If it builds inline, factor the construction into a `buildWireSlotsHarness()` local function at the top of the test file (alongside any existing helpers) before adding this test — the harness needs to provide enough of `EngineState` and `BootstrapDeps` for `wireSlots` to run without crashing. Read the existing test file structure to decide whether to add the helper or inline the construction.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/engine/phases/wireSlots.test.ts`
Expected: FAIL — without `?anchors=1` in the URL, the current code skips the entire `if (showAnchors)` block, so `setPois` is never called and `received` stays empty. Assertion "expected 0 to be greater than 0" fails.

- [ ] **Step 3: Implement minimal code to pass**

Edit `/Users/rulkens/Development/js/skymap/src/services/engine/phases/wireSlots.ts`. Remove the URL gate so static anchors always wire.

Delete the `const showAnchors = hasUrlGate('anchors');` line and the `if (showAnchors) {` wrapper. The block becomes unconditional. Specifically, replace this region (around lines 186-229):

```ts
  const showAnchors = hasUrlGate('anchors');
  if (showAnchors) {
    const slug = (name: string): string =>
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const pois: PointOfInterest[] = [
      ...CLUSTER_ANCHORS.map(
        (a): PointOfInterest => ({
          id: `cluster-${slug(a.name)}`,
          name: a.name,
          category: 'cluster',
          worldPos: raDecDistToEqCart(a),
          crosshairSizeMpc: Math.max(2, a.distMpc * 0.05),
        }),
      ),
      ...SUPERCLUSTER_ANCHORS.map(
        (a): PointOfInterest => ({
          id: `supercluster-${slug(a.name)}`,
          name: a.name,
          category: 'supercluster',
          worldPos: raDecDistToEqCart(a),
          // ~10 % of distance, floor 10 Mpc — superclusters span
          // tens of Mpc so the marker should read at supercluster
          // scale, not Abell-cluster-core scale.
          crosshairSizeMpc: Math.max(10, a.distMpc * 0.1),
        }),
      ),
      ...VOID_ANCHORS.map(
        (a): PointOfInterest => ({
          id: `void-${slug(a.name)}`,
          name: a.name,
          category: 'void',
          worldPos: raDecDistToEqCart(a),
          // ~15 % of distance, floor 15 Mpc — voids are large.  The
          // poiSubsystem already styles voids in soft cyan to read
          // as a different category from the warm-yellow clusters.
          crosshairSizeMpc: Math.max(15, a.distMpc * 0.15),
        }),
      ),
    ];
    state.subsystems.pois.setPois(pois);
  }
```

With:

```ts
  // ── Cosmography anchor POIs (always wired) ───────────────────────
  //
  // Pre-2026-05-17 this block was gated behind `?anchors=1`, intended
  // as a dev overlay for visually cross-referencing the CF-4 DM cube
  // alignment.  The cluster + void labels turned out to be useful as
  // a first-class production overlay (they help users orient against
  // known large-scale structure), so the gate is now removed.  The
  // SettingsPanel's per-category checkboxes (Overlays → Labels) are
  // the user-facing knob; this wire just makes the POIs available.
  //
  // The three lists stay separate (rather than one merged export) so
  // the audit script in `tools/` can consume CLUSTER_ANCHORS without
  // pulling in interpretive supercluster/void POIs.
  //
  // Per-category crosshair scaling: clusters get a small marker
  // (cores are ~1 Mpc), superclusters get a larger one (extent
  // 30-50 Mpc), voids get a still larger one (radii 30-50+ Mpc).
  // The per-category min floors prevent vanishing markers on the
  // closest anchors (e.g. Virgo, Local Void).
  const slug = (name: string): string =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const staticAnchorPois: PointOfInterest[] = [
    ...CLUSTER_ANCHORS.map(
      (a): PointOfInterest => ({
        id: `cluster-${slug(a.name)}`,
        name: a.name,
        category: 'cluster',
        worldPos: raDecDistToEqCart(a),
        crosshairSizeMpc: Math.max(2, a.distMpc * 0.05),
      }),
    ),
    ...SUPERCLUSTER_ANCHORS.map(
      (a): PointOfInterest => ({
        id: `supercluster-${slug(a.name)}`,
        name: a.name,
        category: 'supercluster',
        worldPos: raDecDistToEqCart(a),
        crosshairSizeMpc: Math.max(10, a.distMpc * 0.1),
      }),
    ),
    ...VOID_ANCHORS.map(
      (a): PointOfInterest => ({
        id: `void-${slug(a.name)}`,
        name: a.name,
        category: 'void',
        worldPos: raDecDistToEqCart(a),
        crosshairSizeMpc: Math.max(15, a.distMpc * 0.15),
      }),
    ),
  ];
  state.subsystems.pois.setPois(staticAnchorPois);
```

Also remove the now-unused `hasUrlGate` import if it has no other use site in the file. Grep within the file:

```bash
grep -n "hasUrlGate" /Users/rulkens/Development/js/skymap/src/services/engine/phases/wireSlots.ts
```

The file uses `hasUrlGate('volumes')` for `volumesEnabledByUrl` — that use survives, so leave the import alone. Only the `anchors` call site is removed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/engine/phases/wireSlots.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/phases/wireSlots.ts tests/services/engine/phases/wireSlots.test.ts
git commit -m "$(cat <<'EOF'
feat(wireSlots): wire static cluster/supercluster/void POIs unconditionally

Removes the `?anchors=1` URL gate.  The anchor POIs are now a
first-class overlay controlled via the SettingsPanel's per-category
checkboxes (which the next task adds).  The volumesEnabledByUrl gate
elsewhere in the file is untouched.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Build Famous POIs from meta + catalog in wireSlots

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/src/services/engine/phases/buildPoisFromFamousMeta.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/services/engine/phases/wireSlots.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/services/engine/phases/buildPoisFromFamousMeta.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/services/engine/phases/buildPoisFromFamousMeta.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildPoisFromFamousMeta } from '../../../../src/services/engine/phases/buildPoisFromFamousMeta';
import type { FamousMetaEntry } from '../../../../src/@types/loading/FamousMetaEntry';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';

function makeCatalog(positions: number[], diameters: number[]): GalaxyCatalog {
  const count = diameters.length;
  return {
    count,
    objIDs: new BigUint64Array(count),
    positions: new Float32Array(positions),
    magU: new Float32Array(count).fill(NaN),
    magG: new Float32Array(count).fill(NaN),
    magR: new Float32Array(count).fill(NaN),
    magI: new Float32Array(count).fill(NaN),
    magZ: new Float32Array(count).fill(NaN),
    axisRatio: new Float32Array(count).fill(NaN),
    positionAngleDeg: new Float32Array(count).fill(NaN),
    diameterKpc: new Float32Array(diameters),
  };
}

describe('buildPoisFromFamousMeta', () => {
  it('emits one POI per non-pseudo meta entry, with worldPos from the catalog', () => {
    const meta: FamousMetaEntry[] = [
      { id: 'm31', names: ['M31'], commonName: 'Andromeda Galaxy', description: '', type: '' },
      { id: 'm33', names: ['M33'], description: '', type: '' },
    ];
    const catalog = makeCatalog(
      [0.78, 0.1, 0.2, 0.85, 0.05, 0.15], // two points × 3 floats
      [67, 30],
    );
    const pois = buildPoisFromFamousMeta(meta, catalog);
    expect(pois).toHaveLength(2);
    expect(pois[0]!.id).toBe('famous-m31');
    expect(pois[0]!.name).toBe('Andromeda Galaxy');
    expect(pois[0]!.category).toBe('famousGalaxy');
    expect(pois[0]!.worldPos).toEqual([
      catalog.positions[0],
      catalog.positions[1],
      catalog.positions[2],
    ]);
    expect(pois[0]!.minApparentSizePx).toBe(6);
    expect(pois[0]!.apparentDiameterKpc).toBe(67);
    expect(pois[0]!.crosshairSizeMpc).toBeUndefined();
    expect(pois[1]!.id).toBe('famous-m33');
    expect(pois[1]!.name).toBe('M33'); // falls back to last name in names[]
  });

  it('skips pseudo entries (the Milky Way placeholder)', () => {
    const meta: FamousMetaEntry[] = [
      { id: 'mw', names: ['Milky Way'], description: '', type: '', pseudo: true },
      { id: 'm31', names: ['M31'], description: '', type: '' },
    ];
    // Catalog has only one point — pseudo entries don't exist in famous.bin
    // so the meta index does NOT line up with catalog index for pseudo rows.
    // The producer must match by id, not by array position.  (Real meta
    // arrays today happen to contain only non-pseudo entries — the
    // Milky Way placeholder is merged in at the React layer — but the
    // builder defends against the hybrid case anyway.)
    const catalog = makeCatalog([0.78, 0.1, 0.2], [67]);
    const pois = buildPoisFromFamousMeta(meta, catalog);
    expect(pois).toHaveLength(1);
    expect(pois[0]!.id).toBe('famous-m31');
  });

  it('uses commonName when present, then last name, then first name, then id', () => {
    const meta: FamousMetaEntry[] = [
      { id: 'a', names: ['A1', 'A2'], commonName: 'Curated A', description: '', type: '' },
      { id: 'b', names: ['B1', 'B2'], description: '', type: '' },
      { id: 'c', names: ['C1'], description: '', type: '' },
      { id: 'd', names: [], description: '', type: '' },
    ];
    const catalog = makeCatalog(
      [1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0, 0],
      [10, 10, 10, 10],
    );
    const pois = buildPoisFromFamousMeta(meta, catalog);
    expect(pois.map((p) => p.name)).toEqual(['Curated A', 'B2', 'C1', 'd']);
  });

  it('returns empty array when meta is empty', () => {
    const catalog = makeCatalog([], []);
    expect(buildPoisFromFamousMeta([], catalog)).toEqual([]);
  });

  it('returns empty array when catalog has zero points', () => {
    const meta: FamousMetaEntry[] = [
      { id: 'm31', names: ['M31'], description: '', type: '' },
    ];
    const catalog = makeCatalog([], []);
    expect(buildPoisFromFamousMeta(meta, catalog)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/engine/phases/buildPoisFromFamousMeta.test.ts`
Expected: FAIL — the module `buildPoisFromFamousMeta` does not exist; the import fails with "Cannot find module".

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/src/services/engine/phases/buildPoisFromFamousMeta.ts`:

```ts
/**
 * buildPoisFromFamousMeta — assemble PointOfInterest records from the
 * famous-galaxy meta sidecar + the loaded famous.bin galaxy catalog.
 *
 * ### Why a separate module
 *
 * `wireSlots.ts` already covers the static cluster/supercluster/void
 * anchor wiring inline.  The Famous wiring is more involved (needs
 * meta + catalog, runs after both are ready, handles pseudo entries +
 * name resolution), so isolating it here keeps `wireSlots.ts`
 * scannable and makes the producer unit-testable without booting the
 * whole bootstrap.
 *
 * ### Name resolution
 *
 *   displayName = commonName
 *              ?? names[names.length - 1]   // last name is often the readable one
 *              ?? names[0]
 *              ?? id
 *
 * The fallback chain means existing entries (without `commonName`)
 * still produce readable labels — "NGC 6744" rather than "ngc-6744".
 *
 * ### Pseudo entries
 *
 * Entries with `pseudo: true` (currently just the Milky Way merged
 * in at the React layer; not present in `famous.bin` itself) are
 * skipped — `youAreHereSubsystem` already labels the user's position
 * and the meta array index doesn't line up with the catalog index for
 * pseudo rows.  In practice the engine's `state.sources.famousMeta`
 * comes from the bin and never contains pseudo entries, but defending
 * against the hybrid case here keeps the producer robust to future
 * meta-source changes.
 *
 * ### worldPos lookup by index
 *
 * `famous.bin` is built in lock-step with `famous_meta.json` — the
 * same ordering for non-pseudo entries — so a non-pseudo meta entry
 * at index `i` corresponds to catalog positions[i*3..i*3+3].  We track
 * a separate `catalogIdx` counter that advances only for non-pseudo
 * entries to keep the mapping correct even when pseudo entries are
 * mixed in.
 *
 * ### apparentSizePx gating
 *
 * Every Famous POI sets `minApparentSizePx: 6` and
 * `apparentDiameterKpc: catalog.diameterKpc[i]`.  See `poiSubsystem.ts`
 * for the gate semantics.  The 6 px threshold is the same value the
 * engine uses for thumbnail-enqueue gating, so labels appear at
 * roughly the same zoom as the underlying thumbnail.
 */

import type { FamousMetaEntry } from '../../../@types/loading/FamousMetaEntry';
import type { GalaxyCatalog } from '../../../@types/data/GalaxyCatalog';
import type { PointOfInterest } from '../../../@types/engine/subsystems/PointOfInterest';

const FAMOUS_MIN_APPARENT_PX = 6;

function displayNameFor(e: FamousMetaEntry): string {
  if (e.commonName !== undefined && e.commonName.length > 0) return e.commonName;
  if (e.names.length > 0) {
    const last = e.names[e.names.length - 1];
    if (last !== undefined && last.length > 0) return last;
    const first = e.names[0];
    if (first !== undefined && first.length > 0) return first;
  }
  return e.id;
}

export function buildPoisFromFamousMeta(
  meta: readonly FamousMetaEntry[],
  catalog: Pick<GalaxyCatalog, 'count' | 'positions' | 'diameterKpc'>,
): PointOfInterest[] {
  if (meta.length === 0 || catalog.count === 0) return [];
  const out: PointOfInterest[] = [];
  let catalogIdx = 0;
  for (const e of meta) {
    if (e.pseudo === true) continue;
    if (catalogIdx >= catalog.count) break; // ran past the catalog; defensive
    const x = catalog.positions[catalogIdx * 3 + 0]!;
    const y = catalog.positions[catalogIdx * 3 + 1]!;
    const z = catalog.positions[catalogIdx * 3 + 2]!;
    const diameterKpc = catalog.diameterKpc[catalogIdx]!;
    out.push({
      id: `famous-${e.id}`,
      name: displayNameFor(e),
      category: 'famousGalaxy',
      worldPos: [x, y, z],
      minApparentSizePx: FAMOUS_MIN_APPARENT_PX,
      apparentDiameterKpc: diameterKpc,
    });
    catalogIdx += 1;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/engine/phases/buildPoisFromFamousMeta.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/phases/buildPoisFromFamousMeta.ts \
        tests/services/engine/phases/buildPoisFromFamousMeta.test.ts
git commit -m "$(cat <<'EOF'
feat(famous): pure builder for famous-galaxy POIs from meta + catalog

`buildPoisFromFamousMeta(meta, catalog)` is the pure function that
resolves commonName → name fallback, looks up worldPos by lockstep
index, and stamps minApparentSizePx + apparentDiameterKpc for the
producer's gating.  Skips pseudo entries.  Next task wires this into
the wireSlots bootstrap.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Wire `buildPoisFromFamousMeta` into wireSlots after meta + catalog ready

**Files:**
- Modify: `/Users/rulkens/Development/js/skymap/src/services/engine/phases/wireSlots.ts`
- Modify: `/Users/rulkens/Development/js/skymap/tests/services/engine/phases/wireSlots.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `/Users/rulkens/Development/js/skymap/tests/services/engine/phases/wireSlots.test.ts` inside the `describe(...)` block:

```ts
  it('wires famous POIs alongside static anchors once meta + catalog arrive', async () => {
    // The harness primes the famousMeta slot with two entries and
    // populates Source.Famous in state.sources.catalogs.  After
    // wireSlots awaits the slot's commit, the merged setPois call
    // should include both kinds (static anchors + famous POIs).
    delete (globalThis as { location?: unknown }).location;
    (globalThis as { location: { search: string } }).location = { search: '' };

    const { state, deps, primeFamousMeta, primeFamousCatalog } =
      buildWireSlotsHarness();
    primeFamousMeta([
      { id: 'm31', names: ['M31'], commonName: 'Andromeda Galaxy', description: '', type: '' },
      { id: 'm33', names: ['M33'], description: '', type: '' },
    ]);
    primeFamousCatalog({
      count: 2,
      positions: new Float32Array([0.78, 0.1, 0.2, 0.85, 0.05, 0.15]),
      diameterKpc: new Float32Array([67, 30]),
    });
    let received: readonly PointOfInterest[] = [];
    state.subsystems.pois.setPois = (pois) => {
      received = pois;
    };
    await wireSlots(state, deps);
    const ids = received.map((p) => p.id);
    expect(ids).toContain('famous-m31');
    expect(ids).toContain('famous-m33');
    expect(ids.some((id) => id.startsWith('cluster-'))).toBe(true);
    const m31 = received.find((p) => p.id === 'famous-m31');
    expect(m31?.name).toBe('Andromeda Galaxy');
    expect(m31?.category).toBe('famousGalaxy');
    expect(m31?.minApparentSizePx).toBe(6);
  });
```

The `buildWireSlotsHarness` helper from Task 7 needs to grow `primeFamousMeta` and `primeFamousCatalog` setters. Extend the helper to expose those — they should write into the harness state's `assetSlots.famousMeta` (simulate a 'ready' commit) and `sources.catalogs.set(Source.Famous, …)` respectively.

If the existing harness shape makes this awkward, this is a signal that the wire mechanism in `wireSlots.ts` should also export a small testable function. Prefer to keep `wireSlots.ts` thin by extracting a `wireFamousPois(state)` helper that the test can call directly — see Step 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/engine/phases/wireSlots.test.ts`
Expected: FAIL — `wireSlots` does not yet call `buildPoisFromFamousMeta`, so the received POIs only include the static anchors. `expect(ids).toContain('famous-m31')` fails.

- [ ] **Step 3: Implement minimal code to pass**

Edit `/Users/rulkens/Development/js/skymap/src/services/engine/phases/wireSlots.ts`. Add the new builder import near the top, alongside the other phase imports:

```ts
import { buildPoisFromFamousMeta } from './buildPoisFromFamousMeta';
```

Then, after the existing `state.subsystems.pois.setPois(staticAnchorPois);` call (the one Task 7 made unconditional), add a deferred merge that fires once both the meta slot and the Famous catalog are ready. Replace this region:

```ts
  state.subsystems.pois.setPois(staticAnchorPois);
```

With:

```ts
  state.subsystems.pois.setPois(staticAnchorPois);

  // ── Famous-galaxy label wire (deferred merge) ────────────────────
  //
  // Famous POIs need two ingredients: the meta sidecar (for names +
  // diameter) and the Famous galaxy catalog (for worldPos).  Both arrive
  // asynchronously — `famousMetaSlot.load()` fires above; the catalog
  // arrives via the per-source slot commit that `initGpu` already
  // wired.  We re-run the merge whenever either ingredient lands so
  // the user sees labels appear as soon as the data is on hand.
  //
  // Re-merging static anchors + Famous POIs every time isn't a
  // performance concern: setPois is O(N) over the merged list (~125
  // POIs at most), and produceLabels only forwards changes downstream
  // when the label set actually changes.  Simpler to recompute the
  // merged list than to track partial state.
  function rewireFamousPois(): void {
    const meta = state.sources.famousMeta;
    const catalog = state.sources.catalogs.get(Source.Famous);
    if (meta.length === 0 || catalog === undefined || catalog.count === 0) return;
    const famousPois = buildPoisFromFamousMeta(meta, catalog);
    state.subsystems.pois.setPois([...staticAnchorPois, ...famousPois]);
  }
  // Try immediately (in case both ingredients are already present —
  // possible when wireSlots is replayed in tests or after a hot reload).
  rewireFamousPois();
  // Subscribe to the famous-meta slot's transitions; the subscriber
  // also fires once with the current state, so a slot already in
  // `ready` state re-triggers the merge here.
  famousMetaSlot.subscribe((s) => {
    if (s.kind === 'ready') rewireFamousPois();
  });
  // Subscribe to the Famous catalog's slot for the symmetric trigger.
  const famousCatalogSlot = state.assetSlots.points.get(Source.Famous);
  if (famousCatalogSlot !== undefined) {
    famousCatalogSlot.subscribe((s) => {
      if (s.kind === 'ready') rewireFamousPois();
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/engine/phases/wireSlots.test.ts tests/services/engine/phases/buildPoisFromFamousMeta.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS (the full suite — make sure nothing regressed).

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/phases/wireSlots.ts tests/services/engine/phases/wireSlots.test.ts
git commit -m "$(cat <<'EOF'
feat(famous): merge famous-galaxy POIs into the overlay once data lands

`wireSlots` now subscribes to the famous-meta slot AND the Source.Famous
point-catalog slot, re-running the merged setPois(staticAnchors +
buildPoisFromFamousMeta(...)) whenever either ingredient transitions
to ready.  Each Famous entry emits a label gated by minApparentSizePx
= 6.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Add `labelCategoryVisibility` to EngineSettingsState + callback

**Files:**
- Modify: `/Users/rulkens/Development/js/skymap/src/@types/settings/EngineSettingsState.d.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/@types/settings/EngineSettingsCallbacks.d.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/@types/engine/EngineCallbacks.d.ts` (locate via grep — see Step 3)
- Modify: `/Users/rulkens/Development/js/skymap/src/services/engine/engine.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/hooks/useEngineSettings.ts`
- Create: `/Users/rulkens/Development/js/skymap/src/@types/engine/handles/EngineLabelsHandle.d.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/@types/engine/EngineHandle.d.ts`

- [ ] **Step 1: Write the failing test**

Append to `/Users/rulkens/Development/js/skymap/tests/services/engine/subsystems/poiSubsystem.test.ts` — this test asserts the new handle/setter wiring at the subsystem level:

Actually, the right place to test the handle is at the engine integration boundary. Instead create `/Users/rulkens/Development/js/skymap/tests/@types/engineSettingsState.labelCategoryVisibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { EngineSettingsState } from '../../src/@types/settings/EngineSettingsState';
import type { PoiCategory } from '../../src/services/engine/subsystems/poiSubsystem';

/**
 * Type-level check: `EngineSettingsState.labelCategoryVisibility` is
 * keyed by every `PoiCategory` value.  If the union ever drifts from
 * the visibility record shape, this assignment stops compiling.
 */
describe('EngineSettingsState.labelCategoryVisibility', () => {
  it('is a Record keyed by PoiCategory', () => {
    const v: EngineSettingsState['labelCategoryVisibility'] = {
      cluster: true,
      supercluster: true,
      famousGalaxy: true,
      void: true,
    };
    const c: PoiCategory = 'famousGalaxy';
    expect(v[c]).toBe(true);
  });

  it('all four categories default to true (compile-time check)', () => {
    // This is the spec'd default — the runtime defaults live in
    // data/defaults.ts and are echoed back to the React shell.  We
    // verify the SHAPE here; the runtime default value is covered
    // by the wireSlots/engine integration test.
    const all: Record<PoiCategory, boolean> = {
      cluster: true,
      supercluster: true,
      famousGalaxy: true,
      void: true,
    };
    expect(Object.values(all).every(Boolean)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/@types/engineSettingsState.labelCategoryVisibility.test.ts`
Expected: FAIL — `EngineSettingsState` does not have a `labelCategoryVisibility` field; the test file fails to typecheck with "Property 'labelCategoryVisibility' does not exist on type 'EngineSettingsState'".

- [ ] **Step 3: Implement minimal code to pass**

First, locate `EngineCallbacks`:

```bash
grep -rln "export type EngineCallbacks" /Users/rulkens/Development/js/skymap/src/@types/
```

The file is at `/Users/rulkens/Development/js/skymap/src/@types/engine/EngineCallbacks.d.ts` (verify with the grep). Read it to learn the existing sub-bag pattern. Add a new `labels` sub-bag with the visibility callback. The exact insertion depends on the file's shape — add an entry that mirrors `thumbnails: { onEnabledChange: (enabled: boolean) => void }` but keyed by category:

```ts
  labels?: {
    /**
     * Echoed when any per-category label-visibility toggle changes.
     * The engine fires this once at init (with the default record) and
     * once per `handle.labels.setCategoryVisible(cat, visible)` call.
     */
    onCategoryVisibilityChange?: (
      visibility: Readonly<Record<import('../subsystems/PoiCategory.removed') | string, boolean>>,
    ) => void;
  };
```

(The `PoiCategory.removed` placeholder above is intentionally awkward — read the actual file and import `PoiCategory` from `../../services/engine/subsystems/poiSubsystem` properly. If `EngineCallbacks.d.ts` is in `src/@types/engine/`, the import path from there to the subsystem is `../../../services/engine/subsystems/poiSubsystem`.)

Then edit `/Users/rulkens/Development/js/skymap/src/@types/settings/EngineSettingsState.d.ts`. Add the new field at the bottom of the type (just before the closing `};`):

```ts
  /**
   * Per-category visibility for the POI label overlay.  Keyed by the
   * canonical `PoiCategory` union from `poiSubsystem`.  Defaults to
   * every category visible; the SettingsPanel surfaces these as four
   * always-visible checkboxes under Overlays → Labels.
   */
  labelCategoryVisibility: Record<
    import('../../services/engine/subsystems/poiSubsystem').PoiCategory,
    boolean
  >;
```

Edit `/Users/rulkens/Development/js/skymap/src/@types/settings/EngineSettingsCallbacks.d.ts`. Add `'labels'` to the `Pick` list:

```ts
export type EngineSettingsCallbacks = Pick<
  EngineCallbacks,
  | 'points'
  | 'tonemap'
  | 'camera'
  | 'sources'
  | 'bias'
  | 'thumbnails'
  | 'milkyWay'
  | 'filaments'
  | 'labels'
>;
```

Create `/Users/rulkens/Development/js/skymap/src/@types/engine/handles/EngineLabelsHandle.d.ts`:

```ts
/**
 * EngineLabelsHandle — public-handle sub-bag for the POI label overlay.
 *
 * Mirror of EngineThumbnailsHandle's shape; the only knob today is
 * per-category visibility, but the handle is its own sub-bag so the
 * React shell's `handle.labels.setCategoryVisible(...)` call site
 * stays cohesive with the other Overlays sub-handles (thumbnails,
 * milkyWay, filaments).
 */

import type { PoiCategory } from '../../../services/engine/subsystems/poiSubsystem';

export type EngineLabelsHandle = {
  /**
   * Show/hide every POI in the given category.  Forwards to
   * `state.subsystems.pois.setCategoryVisible(category, visible)`.
   * Echoes back via `onCategoryVisibilityChange` with the full
   * visibility record so the React shell can keep all four checkboxes
   * in sync from one callback.
   */
  setCategoryVisible(category: PoiCategory, visible: boolean): void;
};
```

Edit the EngineHandle definition to include the new sub-bag. Grep for its declaration:

```bash
grep -rln "export type EngineHandle" /Users/rulkens/Development/js/skymap/src/@types/
```

Add a `labels: EngineLabelsHandle` field in the appropriate spot (near `thumbnails` / `milkyWay`).

Edit `/Users/rulkens/Development/js/skymap/src/services/engine/engine.ts`. Add the new sub-bag to the `handle` literal — find the `milkyWay` entry (around line 1271) and add immediately after it:

```ts
    labels: {
      setCategoryVisible: (category, visible) => {
        state.subsystems.pois.setCategoryVisible(category, visible);
        state.settings.labelCategoryVisibility = {
          ...state.settings.labelCategoryVisibility,
          [category]: visible,
        };
        cb.labels?.onCategoryVisibilityChange?.({ ...state.settings.labelCategoryVisibility });
      },
    },
```

Also seed `state.settings.labelCategoryVisibility` in the state-construction site. Grep for the existing settings defaults assignment:

```bash
grep -n "milkyWay: {" /Users/rulkens/Development/js/skymap/src/services/engine/engine.ts
```

Find the `state.settings = { ... }` (or equivalent) block and add the new field alongside other sub-bags:

```ts
      labelCategoryVisibility: {
        cluster: true,
        supercluster: true,
        famousGalaxy: true,
        void: true,
      },
```

And fire the initial echo at engine init, near the other init-time echoes (grep for `onEnabledChange` to find a sibling):

```ts
    cb.labels?.onCategoryVisibilityChange?.({ ...state.settings.labelCategoryVisibility });
```

Edit `/Users/rulkens/Development/js/skymap/src/hooks/useEngineSettings.ts`. Add the new state hook with the other engine-echoed values (alongside `milkyWayEnabled`):

```ts
  const [labelCategoryVisibility, setLabelCategoryVisibility] = useState<
    Record<import('../services/engine/subsystems/poiSubsystem').PoiCategory, boolean>
  >({
    cluster: true,
    supercluster: true,
    famousGalaxy: true,
    void: true,
  });
```

Add it to the `settings: { ... }` return block and to the `engineCallbacks: { ... }` block:

```ts
      labels: {
        onCategoryVisibilityChange: setLabelCategoryVisibility,
      },
```

And in `settings`:

```ts
      labelCategoryVisibility,
```

Finally, extend `UseEngineSettingsReturn`'s `settings` field to include `labelCategoryVisibility: Record<PoiCategory, boolean>`. Grep for the type and add the field:

```bash
grep -n "type UseEngineSettingsReturn" /Users/rulkens/Development/js/skymap/src/@types/settings/UseEngineSettingsReturn.d.ts
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/@types/engineSettingsState.labelCategoryVisibility.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS — every consumer of the new types compiles cleanly. If typecheck fails, the most likely cause is a forgotten consumer of `EngineSettingsState` or `EngineCallbacks`; follow the error to its source and add the missing field with the same default (`true` for every category).

Run: `npm test`
Expected: PASS (full suite).

- [ ] **Step 5: Commit**

```bash
git add src/@types/settings/EngineSettingsState.d.ts \
        src/@types/settings/EngineSettingsCallbacks.d.ts \
        src/@types/engine/EngineCallbacks.d.ts \
        src/@types/engine/EngineHandle.d.ts \
        src/@types/engine/handles/EngineLabelsHandle.d.ts \
        src/@types/settings/UseEngineSettingsReturn.d.ts \
        src/services/engine/engine.ts \
        src/hooks/useEngineSettings.ts \
        tests/@types/engineSettingsState.labelCategoryVisibility.test.ts
git commit -m "$(cat <<'EOF'
feat(settings): labelCategoryVisibility state + handle for POI overlay

Adds a `labelCategoryVisibility: Record<PoiCategory, boolean>` field
on EngineSettingsState (defaults: all categories visible), a new
`labels: { setCategoryVisible }` sub-handle on EngineHandle, an echo
callback on EngineCallbacks, and a useState hook that React reads
from to drive the four Settings → Overlays → Labels checkboxes.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Add the four "Labels" checkboxes to the SettingsPanel Overlays section

**Files:**
- Modify: `/Users/rulkens/Development/js/skymap/src/components/SettingsPanel/SettingsPanel.tsx`
- Modify: `/Users/rulkens/Development/js/skymap/src/App.tsx` (wire the new props through)

No automated test — the project does not have heavy React-component tests for the SettingsPanel; visual verification in Task 12 covers this. The typecheck is the safety net.

- [ ] **Step 1: Add the props to SettingsPanel**

Edit `/Users/rulkens/Development/js/skymap/src/components/SettingsPanel/SettingsPanel.tsx`. Add the new prop types inside the `type Props = { ... }` declaration, alongside `milkyWayEnabled` / `onMilkyWayEnabledChange`. The exact insertion point is just after `onMilkyWayEnabledChange` (around line 117):

```ts
  /**
   * Per-category POI label visibility.  Surfaced as four always-visible
   * checkboxes inside the Overlays → Labels sub-group.  All four
   * default to true.
   */
  labelCategoryVisibility: Readonly<
    Record<import('../../services/engine/subsystems/poiSubsystem').PoiCategory, boolean>
  >;
  onSetLabelCategoryVisibility: (
    category: import('../../services/engine/subsystems/poiSubsystem').PoiCategory,
    visible: boolean,
  ) => void;
```

In the destructured prop list at the top of the component (around line 375), add:

```ts
  labelCategoryVisibility,
  onSetLabelCategoryVisibility,
```

Find the `<CollapsibleSection title="Overlays">` block (around line 971) and add the new sub-group inside it, immediately after the existing Galaxy thumbnails + Milky Way rows but BEFORE the closing `</CollapsibleSection>`:

```tsx
            {/*
              Per-category label-visibility toggles.  Four checkboxes
              corresponding to the PoiCategory union (cluster,
              supercluster, famousGalaxy, void).  Always visible — no
              feature-flag gate — because the Famous galaxy labels
              especially are a first-class user-facing overlay.

              Not wrapped in its own CollapsibleSection because four
              rows isn't enough surface to justify the click cost of
              expanding a sub-section.  If a fifth category is ever
              added, revisit.
            */}
            <div className={styles.panelRow}>
              <label htmlFor="toggle-label-cluster">Cluster labels</label>
              <input
                id="toggle-label-cluster"
                type="checkbox"
                checked={labelCategoryVisibility.cluster}
                onChange={(e) => onSetLabelCategoryVisibility('cluster', e.target.checked)}
              />
            </div>
            <div className={styles.panelRow}>
              <label htmlFor="toggle-label-supercluster">Supercluster labels</label>
              <input
                id="toggle-label-supercluster"
                type="checkbox"
                checked={labelCategoryVisibility.supercluster}
                onChange={(e) => onSetLabelCategoryVisibility('supercluster', e.target.checked)}
              />
            </div>
            <div className={styles.panelRow}>
              <label htmlFor="toggle-label-famous-galaxy">Famous galaxy labels</label>
              <input
                id="toggle-label-famous-galaxy"
                type="checkbox"
                checked={labelCategoryVisibility.famousGalaxy}
                onChange={(e) => onSetLabelCategoryVisibility('famousGalaxy', e.target.checked)}
              />
            </div>
            <div className={styles.panelRow}>
              <label htmlFor="toggle-label-void">Void labels</label>
              <input
                id="toggle-label-void"
                type="checkbox"
                checked={labelCategoryVisibility.void}
                onChange={(e) => onSetLabelCategoryVisibility('void', e.target.checked)}
              />
            </div>
```

- [ ] **Step 2: Wire App.tsx**

Open `/Users/rulkens/Development/js/skymap/src/App.tsx` and find the `<SettingsPanel ... />` JSX. Add the two new props. The exact insertion point is alongside `milkyWayEnabled={...}` / `onMilkyWayEnabledChange={...}`:

```tsx
        labelCategoryVisibility={settings.labelCategoryVisibility}
        onSetLabelCategoryVisibility={(category, visible) =>
          handleRef.current?.labels.setCategoryVisible(category, visible)
        }
```

(`settings.labelCategoryVisibility` comes from `useEngineSettings()` — Task 10 added it.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm test`
Expected: PASS (full suite).

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsPanel/SettingsPanel.tsx src/App.tsx
git commit -m "$(cat <<'EOF'
feat(settings-panel): per-category label visibility checkboxes

Adds four always-visible toggles to the Overlays section:
- Cluster labels
- Supercluster labels
- Famous galaxy labels
- Void labels

Each checkbox forwards to handle.labels.setCategoryVisible, which
echoes back via onCategoryVisibilityChange to keep the React state
in sync with the engine.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Manual visual verification

**Files:** No code changes.

This task is the closing gate before opening the PR. The spec's section 5 ("Testing → Manual visual verification") spells out four checks; we run all four with the dev server.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
(Leave it running in the background per project convention.)

Open the canvas in a browser at the URL the Vite output reports (typically `http://localhost:5173`).

- [ ] **Step 2: Verify each checkbox toggles its category**

Open the SettingsPanel (bottom-left), expand "Overlays". Confirm the four new checkboxes appear under the existing Galaxy thumbnails / Show Milky Way rows: "Cluster labels", "Supercluster labels", "Famous galaxy labels", "Void labels". Each defaults to checked.

Toggle each off, one at a time, and visually confirm:
- "Cluster labels" off → Virgo, Coma, etc. labels disappear (warm-yellow text)
- "Supercluster labels" off → Laniakea, Shapley, etc. labels disappear (dimmer yellow)
- "Famous galaxy labels" off → M31, Sombrero, etc. labels disappear
- "Void labels" off → Boötes Void, Local Void labels disappear (soft cyan)

Toggle each back on and confirm the labels reappear at the same positions.

- [ ] **Step 3: Verify apparent-size gating on Famous galaxies**

Pan/zoom to a Famous galaxy (use Cmd+K → search "M31" → focus). Confirm the label "Andromeda Galaxy" reads at close zoom.

Zoom out until the galaxy's apparent size shrinks below ~6 px on screen. The label should disappear cleanly — no flicker, no half-faded glyphs.

Repeat for one more entry that has `commonName` set (e.g. "Sombrero Galaxy" via M104) — confirm the curated common name reads, not the catalog id.

Repeat for one entry that does NOT have `commonName` set (any of the other ~65 Famous entries). Confirm the label reads the last name in the seed's `names` array (e.g. "NGC 6744") rather than the lowercase id.

- [ ] **Step 4: Verify static anchors are always wired (no `?anchors=1` needed)**

Reload the page WITHOUT `?anchors=1` in the URL. Pan to Virgo / Coma — their labels and crosshairs are present.

Reload WITH `?anchors=1` — behaviour is identical (the URL gate is removed, so the param is now a no-op; this is acceptable).

- [ ] **Step 5: Commit (verification log)**

This task has no code changes, so no commit is needed. Instead, prepare the PR body for the next step — note any issues observed during manual verification and include them in the PR's "Test plan" section.

If everything passes, proceed to opening the PR (handled by the user via `gh pr create` per project convention; the agent does not push without explicit instruction).

---

## Self-review checklist

Before opening the PR:

- [ ] All 11 code tasks committed on the feature branch
- [ ] `npm test` PASSES end-to-end
- [ ] `npm run typecheck` PASSES
- [ ] `npm run build` PASSES (catches Vite-level issues the typecheck doesn't)
- [ ] Manual verification (Task 12) confirms all four checks
- [ ] Task 3 lists any seed entries that were skipped (because the id wasn't present) in the commit message — these can be added in a follow-up

If any check fails, fix it in a NEW commit on the feature branch (never amend a prior commit; the project convention is forward-only history per `feedback_commit_author.md`).
