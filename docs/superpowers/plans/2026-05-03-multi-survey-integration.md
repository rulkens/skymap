# Multi-Survey Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Revision history

> **2026-05-03 (revision 2):** Catalog IDs in revision 1 were fabricated. Real catalog formats verified against VizieR ReadMes in `data/raw/`. Switched primary all-sky source from 2MPZ → GLADE v2.3 (which subsumes 2MPZ, 2MASS XSC, HyperLEDA, GWGC, SDSS-DR12Q). Dropped 6dFGS standalone (subsumed by GLADE). Extended SDSS query to include BOSS + eBOSS. Source enum reduced from 5 to 4 values.

**Goal:** Render galaxies from three real redshift surveys (SDSS Main+BOSS+eBOSS, 2MRS, GLADE v2.3) with parallel per-source loading and progressive rendering as each survey arrives, deduplication across overlap, auto-LOD that picks which surveys are visible based on camera distance, and a UI panel for manual per-survey toggles.

**Architecture:** A Node CLI parses each catalogue from `data/raw/`, performs light dedup across the three real surveys, and writes **three separate `.bin` files** (one per source), all in the existing v2 format. The runtime fetches all three in parallel and uploads each to its own GPU vertex buffer (`Map<Source, GPUBuffer>`). The renderer issues one draw call per source; toggling a source skips its entire draw call — no shader change needed, no per-vertex filtering. React state owns the source mask; an auto-LOD heuristic in the engine recomputes it from camera distance unless the user has overridden it. The binary format does NOT change — each file is standard v2.

**Tech Stack:** TypeScript 6, Node 20+, Vite 8, React 19, plugin-react 6, WebGPU, Vitest 4, gl-matrix.

**Source priority** (best record wins on duplicates): SDSS spec > 2MRS spec > GLADE (which is itself an internally cross-matched merge of 2MPZ + 2MASS XSC + HyperLEDA + GWGC + SDSS-DR12Q).

**The dataset stack:**

1. **GLADE v2.3** — `data/raw/glade2.3.dat` (256-byte fixed-width, 3,262,881 records, ~838 MB ASCII). All-sky. Pre-merged from 2MPZ + 2MASS XSC + HyperLEDA + GWGC + SDSS-DR12Q. Replaces both the standalone 2MPZ and 6dFGS parsers from revision 1.
2. **2MRS** — `data/raw/2mrs_table3.dat` (233-byte fixed-width, 44,599 records). All-sky local spec-z, z<0.05.
3. **SDSS Main + BOSS + eBOSS** — extends current SDSS query to include BOSS galaxies. SAME PARSER as today, just new SQL. ~3M galaxies northern, z up to 0.8.

---

## File Structure

Files this plan creates or modifies:

```
src/
  data/
    sources.ts                  MODIFY  drop TwoMPZ + SixDFGS, add Glade
    pointCloudFormat.ts         (no change — format stays at v2)
    physics.ts                  MODIFY  add DSS image-cutout URL fallback
    synthetic.ts                (no change — plain v2 PointCloud)
  types.ts                      (no change — PointCloud stays as-is)
  engine.ts                     MODIFY  parallel loader (Promise.allSettled per source),
                                        Map<Source, PointCloud>, fires onCloudReady per arrival;
                                        setSourceMask drives renderer per-source skip;
                                        auto-LOD bands updated for new source set
  gpu/
    pointRenderer.ts            (Task 4 already DONE)
    shaders/points.wgsl         (Task 4 already DONE)
  components/
    InfoCard.tsx                MODIFY  source badge, per-source link logic, DSS image fallback
    SettingsPanel.tsx           CREATE  per-source toggles (3 surveys + Synthetic) + auto-LOD master
    App.tsx                     MODIFY  wires SettingsPanel state to engine
  index.html                    MODIFY  CSS for SettingsPanel, source badge

tools/
  parsers/
    common.ts                   (Task 9 already DONE)
    sdssCsv.ts                  (Task 9 already DONE — see Task 9 substep for new SQL)
    twoMrs.ts                   REWRITE  rebuild against real ReadMe byte offsets
    glade.ts                    CREATE   parse GLADE v2.3 fixed-width ASCII
    twoMpz.ts                   DELETE   superseded by GLADE
    sixDfgs.ts                  DELETE   superseded by GLADE
  buildAllBins.ts               CREATE  CLI: cross-match + write three .bin files
  csvToBin.ts                   (no further change)

tests/
  sources.test.ts               MODIFY  drop TwoMPZ + SixDFGS, add Glade
  pointCloudFormat.test.ts      (no change)
  parsers/
    twoMrs.test.ts              REWRITE  fixture is 3 real lines from data/raw/2mrs_table3.dat
    glade.test.ts               CREATE   fixture is 3 real lines from data/raw/glade2.3.dat
    twoMpz.test.ts              DELETE
    sixDfgs.test.ts             DELETE
  crossMatch.test.ts            CREATE  GLADE/2MRS/SDSS dedup priority + position+z matching
  autoLod.test.ts               MODIFY  bands per the new table

README.md                       MODIFY  download instructions for GLADE + 2MRS + SDSS
```

**Updated Source enum** (defined once in `src/data/sources.ts`):

```ts
export enum Source {
  Synthetic = 0,
  SDSS = 1,
  TwoMRS = 2,
  Glade = 3,
}
```

Bit position in `visibleSourceMask: u32` matches the enum value. `0xF` (= `0b1111`) means "all visible".

> **Renumbering safety:** the previous values `TwoMPZ = 3` and `SixDFGS = 4` are removed. No `.bin` file format on disk encodes these enum values — the binary format does not store source IDs per point (each file IS its source). Renumbering is therefore safe.

**New auto-LOD bands:**

| Distance (Mpc) | Visible sources                |
| -------------- | ------------------------------ |
| < 200          | Synthetic + 2MRS + GLADE       |
| 200 – 800      | all sources (Synthetic + SDSS + 2MRS + GLADE) |
| > 800          | Synthetic + SDSS               |

---

## Task 1: Source enum — drop TwoMPZ + SixDFGS, add Glade

**Files:**

- Modify: `src/data/sources.ts`
- Modify: `tests/sources.test.ts`

The committed enum has `TwoMPZ = 3` and `SixDFGS = 4`. Replace both with a single `Glade = 3`. The metadata tables (`LABELS`, `ALL_SKY`, `MAX_DIST_MPC`, `ALL_SOURCES`) and `ALL_VISIBLE_MASK` derivation all need matching updates.

- [ ] **Step 1: Update `tests/sources.test.ts`**

Replace the existing tests for `TwoMPZ` / `SixDFGS` with `Glade`:

```ts
import { describe, it, expect } from 'vitest';
import {
  Source,
  sourceLabel,
  sourceIsAllSky,
  sourceMaxDistanceMpc,
  ALL_VISIBLE_MASK,
  maskHas,
  maskWith,
  maskWithout,
} from '../src/data/sources';

describe('Source enum', () => {
  it('has stable numeric values used in the renderer mask', () => {
    expect(Source.Synthetic).toBe(0);
    expect(Source.SDSS).toBe(1);
    expect(Source.TwoMRS).toBe(2);
    expect(Source.Glade).toBe(3);
  });
});

describe('sourceLabel', () => {
  it('returns human-readable names', () => {
    expect(sourceLabel(Source.SDSS)).toBe('SDSS');
    expect(sourceLabel(Source.TwoMRS)).toBe('2MRS');
    expect(sourceLabel(Source.Glade)).toBe('GLADE');
    expect(sourceLabel(Source.Synthetic)).toBe('Synthetic');
  });
});

describe('source coverage metadata', () => {
  it('flags all-sky sources', () => {
    expect(sourceIsAllSky(Source.TwoMRS)).toBe(true);
    expect(sourceIsAllSky(Source.Glade)).toBe(true);
    expect(sourceIsAllSky(Source.SDSS)).toBe(false);
  });
  it('reports approximate maximum distance per survey in Mpc', () => {
    expect(sourceMaxDistanceMpc(Source.TwoMRS)).toBeLessThan(300);
    // GLADE distance varies wildly — we use ~800 Mpc as the practical
    // limit for visualisation; the long tail is sparse.
    expect(sourceMaxDistanceMpc(Source.Glade)).toBeLessThanOrEqual(1000);
    expect(sourceMaxDistanceMpc(Source.SDSS)).toBeGreaterThan(2000);
  });
});

describe('source mask helpers', () => {
  it('ALL_VISIBLE_MASK has every defined source bit set', () => {
    expect(maskHas(ALL_VISIBLE_MASK, Source.SDSS)).toBe(true);
    expect(maskHas(ALL_VISIBLE_MASK, Source.Glade)).toBe(true);
    expect(maskHas(ALL_VISIBLE_MASK, Source.TwoMRS)).toBe(true);
    expect(maskHas(ALL_VISIBLE_MASK, Source.Synthetic)).toBe(true);
  });
  it('maskHas / maskWith / maskWithout flip individual bits', () => {
    let m = 0;
    expect(maskHas(m, Source.Glade)).toBe(false);
    m = maskWith(m, Source.Glade);
    expect(maskHas(m, Source.Glade)).toBe(true);
    m = maskWithout(m, Source.Glade);
    expect(maskHas(m, Source.Glade)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- sources`
Expected: FAIL — `Source.Glade` does not exist; `Source.TwoMPZ` / `Source.SixDFGS` references gone.

- [ ] **Step 3: Update `src/data/sources.ts`**

Edit the enum:

```ts
export enum Source {
  Synthetic = 0,
  SDSS = 1,
  TwoMRS = 2,
  /**
   * GLADE v2.3 — Galaxy List for the Advanced Detector Era.
   * An internally cross-matched merge of GWGC + HyperLEDA + 2MASS XSC
   * + 2MPZ + SDSS-DR12Q (3,262,881 records). All-sky.
   * Replaces standalone 2MPZ and 6dFGS sources from plan revision 1.
   */
  Glade = 3,
}
```

Update `LABELS`:

```ts
const LABELS: Record<Source, string> = {
  [Source.Synthetic]: 'Synthetic',
  [Source.SDSS]: 'SDSS',
  [Source.TwoMRS]: '2MRS',
  [Source.Glade]: 'GLADE',
};
```

Update `ALL_SKY`:

```ts
const ALL_SKY: Record<Source, boolean> = {
  [Source.Synthetic]: true,
  [Source.SDSS]: false,
  [Source.TwoMRS]: true,
  [Source.Glade]: true,
};
```

Update `MAX_DIST_MPC` (GLADE goes deeper than 2MPZ alone — its distance distribution has a long tail beyond 1 Gpc but the bulk of the catalog sits at z<0.1 ≈ 400 Mpc; we use 800 Mpc as the practical visualisation limit, matching the auto-LOD mid-band):

```ts
const MAX_DIST_MPC: Record<Source, number> = {
  [Source.Synthetic]: 1000,
  [Source.SDSS]: 3000,
  [Source.TwoMRS]: 250,
  [Source.Glade]: 800,
};
```

Update `ALL_SOURCES`:

```ts
export const ALL_SOURCES: readonly Source[] = [
  Source.Synthetic,
  Source.SDSS,
  Source.TwoMRS,
  Source.Glade,
];
```

`ALL_VISIBLE_MASK` derivation is unchanged (it reduces over `ALL_SOURCES`), but the resulting value is now `0b1111 = 15` instead of `0b11111 = 31`.

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- sources`

- [ ] **Step 5: Commit**

```bash
git add src/data/sources.ts tests/sources.test.ts
git commit -m "refactor(sources): drop TwoMPZ + SixDFGS, add Glade"
```

---

## Task 2 — removed in revision 1

> Task 2 removed in revision 1: per-source files mean the format stays at v2 — each survey's output is a standard v2 binary, no per-point sourceID byte needed.

---

## Task 3 — removed in revision 1

> Task 3 removed in revision 1: with multi-cloud loading, the engine tags clouds with their `Source` at registration time. The synthetic generator's output is plain v2 PointCloud.

---

## Task 4: Multi-cloud renderer architecture — DONE

> **Status:** committed in `36779c3` (`feat: multi-cloud renderer — Map<Source, GPUBuffer> + per-source draw calls`). The committed implementation matches the spec from the rev-1 plan: a `Map<Source, ...>` keyed by enum value with one draw call per source, gated by `visibleSourceMask`. **No code change is required for revision 2** because the renderer iterates `this.clouds` (a Map) in insertion order — it never enumerates the enum's range, so removing `TwoMPZ`/`SixDFGS` from the enum and adding `Glade` works without changes.

(See historical Task 4 spec in git history at `2854fff` if needed.)

---

## Task 5: Auto-LOD heuristic — UPDATE bands

**Files:**

- Modify: `tests/autoLod.test.ts`
- Modify: `src/engine.ts`

The heuristic shape is unchanged (3 distance bands), but the source set inside each band is now Synthetic / SDSS / TwoMRS / Glade.

| Distance (Mpc) | Visible sources                |
| -------------- | ------------------------------ |
| < 200          | Synthetic, 2MRS, GLADE         |
| 200 – 800      | all sources (Synthetic, SDSS, 2MRS, GLADE) |
| > 800          | Synthetic, SDSS                |

- [ ] **Step 1: Update `tests/autoLod.test.ts`** (replace TwoMPZ/SixDFGS with Glade)

```ts
import { describe, it, expect } from 'vitest';
import { autoLodMask } from '../src/engine';
import { Source, maskHas } from '../src/data/sources';

describe('autoLodMask', () => {
  it('local view (< 200 Mpc) shows 2MRS and GLADE but hides SDSS', () => {
    const m = autoLodMask(150);
    expect(maskHas(m, Source.TwoMRS)).toBe(true);
    expect(maskHas(m, Source.Glade)).toBe(true);
    expect(maskHas(m, Source.SDSS)).toBe(false);
  });
  it('mid range (200–800 Mpc) shows everything', () => {
    const m = autoLodMask(500);
    for (const s of [Source.SDSS, Source.TwoMRS, Source.Glade]) {
      expect(maskHas(m, s)).toBe(true);
    }
  });
  it('deep view (> 800 Mpc) shows SDSS only', () => {
    const m = autoLodMask(2000);
    expect(maskHas(m, Source.SDSS)).toBe(true);
    expect(maskHas(m, Source.TwoMRS)).toBe(false);
    expect(maskHas(m, Source.Glade)).toBe(false);
  });
  it('always includes Source.Synthetic so the synthetic fallback stays visible', () => {
    expect(maskHas(autoLodMask(50), Source.Synthetic)).toBe(true);
    expect(maskHas(autoLodMask(500), Source.Synthetic)).toBe(true);
    expect(maskHas(autoLodMask(5000), Source.Synthetic)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- autoLod`

- [ ] **Step 3: Update `autoLodMask` in `src/engine.ts`**

```ts
export function autoLodMask(distanceMpc: number): number {
  if (distanceMpc < 200) {
    let m = 0;
    m = maskWith(m, Source.Synthetic);
    m = maskWith(m, Source.TwoMRS);
    m = maskWith(m, Source.Glade);
    return m;
  }
  if (distanceMpc <= 800) {
    return ALL_VISIBLE_MASK;
  }
  let m = 0;
  m = maskWith(m, Source.Synthetic);
  m = maskWith(m, Source.SDSS);
  return m;
}
```

(This is a single-line semantic change inside the existing function — replace the two `maskWith(m, Source.TwoMPZ)` and `maskWith(m, Source.TwoMRS)` calls in the local band with `Source.TwoMRS` + `Source.Glade`. The mid-band still returns `ALL_VISIBLE_MASK`. The deep-band is unchanged.)

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- autoLod`

- [ ] **Step 5: Commit**

```bash
git add src/engine.ts tests/autoLod.test.ts
git commit -m "refactor(autoLod): update bands for Synthetic/SDSS/TwoMRS/Glade source set"
```

---

## Task 6: Engine multi-cloud orchestration — pending

**Files:**

- Modify: `src/engine.ts`

The engine fires three parallel fetches (one per real source) when starting up, plus the synthetic fallback if all three fail. As each resolves, it tags the cloud with the source it came from and uploads to the renderer. The status bar reports loading progress (e.g. "loaded 2/3 surveys").

```ts
type CloudFile = { source: Source; url: string };

const FILES: CloudFile[] = [
  { source: Source.SDSS, url: '/data/sdss.bin' },
  { source: Source.TwoMRS, url: '/data/2mrs.bin' },
  { source: Source.Glade, url: '/data/glade.bin' },
];

async function loadAll(): Promise<void> {
  const results = await Promise.allSettled(
    FILES.map(({ source, url }) =>
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((buf) => ({ source, cloud: decodePointCloud(buf) })),
    ),
  );
  for (const r of results) {
    if (r.status === 'fulfilled') {
      renderer.upload(r.value.source, r.value.cloud);
      clouds.set(r.value.source, r.value.cloud);
      cb.onCloudReady?.(r.value.source, r.value.cloud.count);
    } else {
      console.warn('survey load failed', r.reason);
    }
  }
}
```

If ALL fetches fail, fall back to synthetic (`Source.Synthetic`).

Add a new callback `onCloudReady?: (source: Source, count: number) => void` to `EngineCallbacks` so the React UI can show progressive load status.

The `setSourceMask` and `setLodMode` setters stay the same as in the rev-1 plan. The auto-LOD heuristic is now `autoLodMask(distanceMpc)` from Task 5. The mask is interpreted by the renderer's `draw()` as "skip these sources' buffers" — no shader change.

For multi-cloud picking: the engine reads back a global instance ID from the pick texture, then walks `renderer.loadedSources()` to map global ID → (source, local index). `buildPointInfo` takes a `(source, localIndex)` pair instead of a single global index.

- [ ] **Step 1: Extend `EngineCallbacks` and `EngineHandle` types**

In `src/engine.ts`:

```ts
export type LodMode = 'auto' | 'manual';

export type EngineCallbacks = {
  onStatusChange: (s: EngineStatus) => void;
  onHoverChange: (info: PointInfo | null) => void;
  onSelectChange: (info: PointInfo | null) => void;
  onScaleChange: (info: ScaleInfo) => void;
  /** Fires when the visible-source mask changes (auto-LOD or user toggle). */
  onSourceMaskChange?: (mask: number) => void;
  /** Fires when the LOD mode flips between 'auto' and 'manual'. */
  onLodModeChange?: (mode: LodMode) => void;
  /** Fires each time a survey file finishes loading — enables progressive UI. */
  onCloudReady?: (source: Source, count: number) => void;
};

export type EngineHandle = {
  clearSelection: () => void;
  destroy: () => void;
  setLodMode: (mode: LodMode) => void;
  setSourceMask: (mask: number) => void;
};
```

- [ ] **Step 2: Implement parallel loader in `createEngine`**

Replace the single `fetch('/data/sdss.bin')` call with `loadAll()` as shown above. Add closure state:

```ts
const clouds = new Map<Source, PointCloud>();
let visibleSourceMask = ALL_VISIBLE_MASK;
let lodMode: LodMode = 'auto';
```

After any cloud arrives, `renderer.upload(source, cloud)` makes the next render frame include it. If `clouds.size === 0` after all settle, fall back to `generateSyntheticCloud()` tagged as `Source.Synthetic`.

- [ ] **Step 3: Auto-LOD render loop integration**

Inside the render loop, before the `renderer.draw(...)` call:

```ts
if (lodMode === 'auto') {
  const m = autoLodMask(cam.distance);
  if (m !== visibleSourceMask) {
    visibleSourceMask = m;
    cb.onSourceMaskChange?.(visibleSourceMask);
  }
}
```

Expose setters in the returned handle:

```ts
setLodMode(mode) {
  if (mode === lodMode) return;
  lodMode = mode;
  cb.onLodModeChange?.(lodMode);
},
setSourceMask(mask) {
  visibleSourceMask = mask;
  if (lodMode !== 'manual') {
    lodMode = 'manual';
    cb.onLodModeChange?.(lodMode);
  }
  cb.onSourceMaskChange?.(visibleSourceMask);
},
```

- [ ] **Step 4: Update pick path for global → (source, local) mapping**

```ts
let remaining = g - 1;
for (const { source, count } of renderer.loadedSources()) {
  if (remaining < count) {
    const info = buildPointInfo(clouds.get(source)!, source, remaining);
    break;
  }
  remaining -= count;
}
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add src/engine.ts
git commit -m "feat(engine): parallel multi-cloud loader for SDSS/2MRS/GLADE + LOD setters"
```

---

## Task 7: Settings panel React component — pending

**Files:**

- Create: `src/components/SettingsPanel.tsx`
- Modify: `index.html` (CSS for the panel)

Three real-survey toggles plus the auto-LOD master. Synthetic is hidden — it's the fallback dataset, not user-controlled.

- [ ] **Step 1: Add CSS to `index.html`** (same as the rev-1 spec — colours / layout unchanged)

```css
/* Settings panel (bottom-left) */
#settings-panel {
  position: fixed;
  bottom: 16px;
  left: 16px;
  z-index: 10;
  padding: 12px 14px;
  background: rgba(8, 12, 28, 0.65);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(160, 200, 255, 0.16);
  border-radius: 8px;
  color: #cfd8ff;
  font: 11px/1.4 ui-monospace, 'SF Mono', Menlo, monospace;
  user-select: none;
  min-width: 180px;
}

#settings-panel .panel-title {
  margin-bottom: 8px;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(160, 180, 230, 0.5);
}

#settings-panel .panel-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}

#settings-panel input[type='checkbox'] {
  accent-color: rgba(180, 220, 255, 0.85);
  cursor: pointer;
}

#settings-panel .panel-divider {
  margin: 6px 0;
  border-top: 1px solid rgba(160, 200, 255, 0.12);
}

#settings-panel .panel-mode {
  font-size: 10px;
  letter-spacing: 0.04em;
  color: rgba(160, 200, 255, 0.6);
}
```

- [ ] **Step 2: Create `src/components/SettingsPanel.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Source, sourceLabel, maskHas } from '../data/sources';
import type { LodMode } from '../engine';

type Props = {
  mask: number;
  mode: LodMode;
  onToggleSource: (s: Source, visible: boolean) => void;
  onSetMode: (mode: LodMode) => void;
};

/**
 * The three real-survey toggles plus an Auto-LOD master.
 * Synthetic is intentionally hidden from the panel: it's the loader
 * fallback, not a user-facing data source — letting the user toggle it
 * off would just leave a black screen if the real surveys are absent.
 */
const TOGGLEABLE: readonly Source[] = [
  Source.SDSS,
  Source.TwoMRS,
  Source.Glade,
] as const;

export function SettingsPanel({ mask, mode, onToggleSource, onSetMode }: Props): ReactNode {
  return (
    <div id="settings-panel">
      <div className="panel-title">Surveys</div>

      {TOGGLEABLE.map((s) => (
        <label className="panel-row" key={s}>
          <input
            type="checkbox"
            checked={maskHas(mask, s)}
            onChange={(e) => onToggleSource(s, e.target.checked)}
          />
          {sourceLabel(s)}
        </label>
      ))}

      <div className="panel-divider" />

      <label className="panel-row">
        <input
          type="checkbox"
          checked={mode === 'auto'}
          onChange={(e) => onSetMode(e.target.checked ? 'auto' : 'manual')}
        />
        Auto LOD
      </label>

      <div className="panel-mode">
        mode: {mode === 'auto' ? 'auto (by zoom)' : 'manual override'}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsPanel.tsx index.html
git commit -m "feat(ui): SettingsPanel with SDSS/2MRS/GLADE toggles + Auto-LOD"
```

---

## Task 8: Wire SettingsPanel into App + engine — pending

**Files:**

- Modify: `src/App.tsx`

- [ ] **Step 1: Add state + callbacks + mount the panel**

```tsx
import { SettingsPanel } from './components/SettingsPanel';
import { Source, ALL_VISIBLE_MASK, maskWith, maskWithout } from './data/sources';
import type { LodMode } from './engine';

const [sourceMask, setSourceMask] = useState<number>(ALL_VISIBLE_MASK);
const [lodMode, setLodMode] = useState<LodMode>('auto');

// In createEngine call:
const handle = createEngine(canvas, {
  onStatusChange: setStatus,
  onHoverChange: setHovered,
  onSelectChange: setSelected,
  onScaleChange: setScale,
  onSourceMaskChange: setSourceMask,
  onLodModeChange: setLodMode,
});

// In JSX:
<SettingsPanel
  mask={sourceMask}
  mode={lodMode}
  onToggleSource={(s, visible) => {
    const next = visible ? maskWith(sourceMask, s) : maskWithout(sourceMask, s);
    handleRef.current?.setSourceMask(next);
  }}
  onSetMode={(mode) => handleRef.current?.setLodMode(mode)}
/>
```

(`handleRef` is the ref already used by the Esc keydown listener — reuse it.)

- [ ] **Step 2: Run typecheck and build**

Run: `npm run typecheck && npm run build`

- [ ] **Step 3: Visual verification**

User reloads. Bottom-left panel appears with three checkboxes (SDSS, 2MRS, GLADE) and an Auto LOD toggle. Toggling SDSS off should hide its draw call; toggling Auto LOD off freezes the mask. Zoom out far → with auto-LOD on, the mask should drop to SDSS-only.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): wire SettingsPanel to engine sourceMask + LOD mode"
```

---

## Task 9: SDSS CSV parser refactor — DONE, plus BOSS+eBOSS SQL substep

> **Status:** the parser refactor itself is committed in `ba5a465` (`refactor: extract SDSS CSV parser to reusable parsers/sdssCsv module`). The parser reads column names (not positions), so it transparently accepts a wider SQL result that includes BOSS + eBOSS rows.

The substep below documents the **new SQL** to paste into [SkyServer SQL Search](https://skyserver.sdss.org/dr18/SearchTools/sql) to download the larger combined Main + BOSS + eBOSS spectroscopic galaxy sample (~3M rows). No code change needed — only the input file changes.

- [ ] **Step 1 (substep): Run the wider SDSS query**

Open https://skyserver.sdss.org/dr18/SearchTools/sql and paste:

```sql
SELECT
  s.specObjID AS objID,
  s.ra,
  s.dec,
  s.z,
  p.modelMag_u,
  p.modelMag_g,
  p.modelMag_r,
  p.modelMag_i,
  p.modelMag_z
FROM SpecObj AS s
JOIN PhotoObj AS p ON s.bestObjID = p.objID
WHERE s.class = 'GALAXY'
  AND s.zWarning = 0
  AND s.z BETWEEN 0.001 AND 0.8
```

Why no `survey =` filter? `SpecObj` rolls up Main + BOSS + eBOSS into one view; omitting the `survey` predicate returns all three. SDSS-DR18 hosts the union; older releases (DR12 etc.) split the views.

Save the CSV result as `data/sdss_combined.csv` (or whatever name you prefer — pass it explicitly to `build-all`).

- [ ] **Step 2 (substep): Re-build the SDSS bin**

Run the existing `csv-to-bin` (or wait for `build-all` from Task 13):

```bash
npm run csv-to-bin -- data/sdss_combined.csv public/data/sdss.bin
```

Same parser, same column expectations — file size scales with row count.

> **No commit for Task 9 in revision 2** — the parser code is already correct. The user re-runs the CSV download manually when they want the wider sample.

---

## Task 10: 2MRS parser — REWRITE against real ReadMe

**Files:**

- Delete: `tools/parsers/twoMrs.ts` (committed in `6356b88` with fabricated byte offsets)
- Delete: `tests/parsers/twoMrs.test.ts` (same commit)
- Create: `tools/parsers/twoMrs.ts` (correct version)
- Create: `tests/parsers/twoMrs.test.ts` (uses real fixture)

The committed parser was written against fabricated column offsets and would not parse a real 2MRS row correctly. Delete it and start over.

### Real 2MRS spec (verified against `/data/raw/J_ApJS_199_26_ReadMe`)

File: `data/raw/2mrs_table3.dat`, 233-byte fixed-width, 44,599 records. Bytes are 1-based inclusive — slice with `line.slice(N-1, M)`.

| Bytes | Field | Type | Notes |
|---|---|---|---|
| 1–16 | ID | A16 | 2MASS designation |
| 18–26 | RAdeg | F9.5 | decimal degrees |
| 28–36 | DEdeg | F9.5 | decimal degrees |
| 38–46 | GLON | F9.5 | galactic longitude |
| 48–56 | GLAT | F9.5 | galactic latitude |
| 58–63 | Kcmag | F6.3 | extinction-corrected K |
| 65–70 | Hcmag | F6.3 | extinction-corrected H |
| 72–77 | Jcmag | F6.3 | extinction-corrected J; `99.999` sentinel for missing |
| 79–84 | Ktmag | F6.3 | total extrapolated K |
| 86–91 | Htmag | F6.3 | total extrapolated H |
| 93–98 | Jtmag | F6.3 | total extrapolated J |
| 100–104 | e_Kcmag | F5.3 | error |
| ... | | | (other error/flag fields) |
| 174–178 | cz | I5 | km/s; blank if no redshift |
| 180–182 | e_cz | I3 | km/s |

**Skip rules:**
- Skip if `cz` is blank or non-positive
- Skip if any of `Kcmag`, `Hcmag` is non-finite
- Allow `Jcmag = 99.999` (sentinel) → store as `NaN`

**Redshift:** `z = cz / 299792.458`.

**Mapping into 5-band slots:**
- magG = Jcmag (handle 99.999 → NaN)
- magR = Hcmag
- magI = Kcmag
- magU = NaN, magZ = NaN

**objID:** `0n` always (no SDSS counterpart).

### Fixture: 3 real lines from `data/raw/2mrs_table3.dat`

These are the actual first three records of the file (M31, NGC 253, M81):

```
00424433+4116074  10.68471  41.26875 121.17430 -21.57319  0.797  0.929  1.552  0.743  0.881  1.497 0.016 0.016 0.015 0.017 0.017 0.016 0.683 3.208 3.491 0.473 Z111  3A2s ZC  -300   4 N 1991RC3.9.C...0000d MESSIER_031
00473313-2517196  11.88806 -25.28880  97.36301 -87.96452  3.815  4.132  4.858  3.765  4.077  4.798 0.016 0.015 0.015 0.017 0.016 0.016 0.019 2.799 2.965 0.264 Z111  5X_s ZC   243   2 N 2004AJ....128...16K NGC_0253
09553318+6903549 148.88826  69.06526 142.09190  40.90022  3.898  4.131  4.784  3.803  4.043  4.690 0.016 0.016 0.015 0.018 0.018 0.016 0.080 2.688 2.878 0.517 Z111  2A2s ZC   -34   4 N 1991RC3.9.C...0000d MESSIER_081
```

Expected after parsing:
- M31: cz=−300 → z=−1.0007e-3 (negative — M31 is blueshifted; **skip per `cz > 0` rule**)
- NGC 253: cz=243 → z=8.106e-4, magG=Jcmag=1.552, magR=Hcmag=0.929, magI=Kcmag=0.797
- M81: cz=−34 → negative; **skip**

So parsing this 3-row fixture yields **1 record + 2 skipped** (because two have negative cz, which represents blueshifted local-group galaxies and is not useful for our cosmological visualisation).

> **Implementation note (didactic comment material):** the parser keeps only `cz > 0` because in cosmological context we map z to comoving distance, and negative redshifts produce nonsense distances. The handful of negative-cz local-group members (M31, M33, etc.) are interesting but their motion is dominated by the local gravitational field, not Hubble flow. Drop them for the visualisation; visualise them another day.

- [ ] **Step 0: Remove the wrong files**

```bash
git rm tools/parsers/twoMrs.ts tests/parsers/twoMrs.test.ts
```

(Keep this in the same commit as the new files added below.)

- [ ] **Step 1: Write the new test file with the real fixture**

```ts
// tests/parsers/twoMrs.test.ts
import { describe, it, expect } from 'vitest';
import { parseTwoMrs } from '../../tools/parsers/twoMrs';
import { Source } from '../../src/data/sources';

// Real first 3 rows of data/raw/2mrs_table3.dat (M31, NGC 253, M81).
// Two of them have negative cz (local group blueshift) and are skipped.
const SAMPLE = [
  '00424433+4116074  10.68471  41.26875 121.17430 -21.57319  0.797  0.929  1.552  0.743  0.881  1.497 0.016 0.016 0.015 0.017 0.017 0.016 0.683 3.208 3.491 0.473 Z111  3A2s ZC  -300   4 N 1991RC3.9.C...0000d MESSIER_031',
  '00473313-2517196  11.88806 -25.28880  97.36301 -87.96452  3.815  4.132  4.858  3.765  4.077  4.798 0.016 0.015 0.015 0.017 0.016 0.016 0.019 2.799 2.965 0.264 Z111  5X_s ZC   243   2 N 2004AJ....128...16K NGC_0253',
  '09553318+6903549 148.88826  69.06526 142.09190  40.90022  3.898  4.131  4.784  3.803  4.043  4.690 0.016 0.016 0.015 0.018 0.018 0.016 0.080 2.688 2.878 0.517 Z111  2A2s ZC   -34   4 N 1991RC3.9.C...0000d MESSIER_081',
].join('\n');

describe('parseTwoMrs', () => {
  it('parses bytes 18-26 RA, 28-36 Dec, 58-63 Kc, 65-70 Hc, 72-77 Jc, 174-178 cz', () => {
    const { records, skipped } = parseTwoMrs(SAMPLE);
    // Two of the three rows have negative cz (M31 = -300, M81 = -34) → skipped.
    expect(skipped).toBe(2);
    expect(records).toHaveLength(1);

    const r = records[0]!;
    expect(r.source).toBe(Source.TwoMRS);
    expect(r.ra).toBeCloseTo(11.88806, 4);
    expect(r.dec).toBeCloseTo(-25.2888, 4);
    expect(r.magI).toBeCloseTo(3.815, 3); // Kcmag
    expect(r.magR).toBeCloseTo(4.132, 3); // Hcmag
    expect(r.magG).toBeCloseTo(4.858, 3); // Jcmag
    expect(Number.isNaN(r.magU)).toBe(true);
    expect(Number.isNaN(r.magZ)).toBe(true);
    // cz = 243 km/s → z ≈ 8.106e-4
    expect(r.z).toBeCloseTo(243 / 299792.458, 6);
    expect(r.objID).toBe(0n);
  });

  it('treats Jcmag=99.999 as NaN', () => {
    // synthetic row built around the sentinel — RA/Dec/cz pulled from NGC 253
    const line =
      '99999999+9999999  11.88806 -25.28880  97.36301 -87.96452  3.815  4.132 99.999  3.765  4.077  4.798 0.016 0.015 9.999 0.017 0.016 0.016 0.019 2.799 2.965 0.264 Z111  5X_s ZC   243   2 N 2004AJ....128...16K SENTINEL_TEST';
    const { records } = parseTwoMrs(line);
    expect(records).toHaveLength(1);
    expect(Number.isNaN(records[0]!.magG)).toBe(true); // Jcmag sentinel
    expect(records[0]!.magR).toBeCloseTo(4.132, 3); // Hcmag still parsed
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- twoMrs`
Expected: FAIL — module not found (just deleted).

- [ ] **Step 3: Implement `tools/parsers/twoMrs.ts`**

```ts
import { Source } from '../../src/data/sources';
import { nonCommentLines, type ParsedRecord } from './common';

const C_KM_S = 299792.458;
const J_SENTINEL = 99.999;

/**
 * Parse the 2MASS Redshift Survey (2MRS) catalogue from VizieR J/ApJS/199/26.
 *
 * Format: 233-byte fixed-width ASCII (file `table3.dat`, 44,599 records).
 * Byte ranges below are 1-based inclusive — `line.slice(N-1, M)` extracts
 * characters N..M.
 *
 *   1–16   A16   ID         (2MASS designation)
 *   18–26  F9.5  RAdeg      decimal degrees
 *   28–36  F9.5  DEdeg      decimal degrees
 *   58–63  F6.3  Kcmag      extinction-corrected K
 *   65–70  F6.3  Hcmag      extinction-corrected H
 *   72–77  F6.3  Jcmag      extinction-corrected J (99.999 = no measurement)
 *   174–178 I5   cz         km/s heliocentric (blank → no redshift)
 *
 * Magnitude mapping into our 5-band SDSS slots (worth a didactic note —
 * the slots were designed for SDSS ugriz; pushing 2MASS JHK in is a
 * procrustean fit but the renderer's K-correction uses redshift, not
 * band-specific corrections, so it still works):
 *
 *   magG = Jcmag (handle 99.999 sentinel → NaN)
 *   magR = Hcmag
 *   magI = Kcmag
 *   magU = NaN, magZ = NaN
 *
 * Redshift: z = cz / c. We drop rows with cz ≤ 0 (local-group galaxies
 * blueshifted by peculiar velocity — interesting but not part of the
 * cosmological-distance visualisation).
 */
export function parseTwoMrs(rawText: string): { records: ParsedRecord[]; skipped: number } {
  const lines = nonCommentLines(rawText);
  const records: ParsedRecord[] = [];
  let skipped = 0;

  for (const line of lines) {
    const ra = parseFloat(line.slice(17, 26).trim());
    const dec = parseFloat(line.slice(27, 36).trim());
    const kcmag = parseFloat(line.slice(57, 63).trim());
    const hcmag = parseFloat(line.slice(64, 70).trim());
    const jcmagRaw = parseFloat(line.slice(71, 77).trim());
    const czStr = line.slice(173, 178).trim();
    const cz = czStr === '' ? NaN : parseFloat(czStr);

    if (
      !Number.isFinite(ra) ||
      !Number.isFinite(dec) ||
      !Number.isFinite(kcmag) ||
      !Number.isFinite(hcmag) ||
      !Number.isFinite(cz) ||
      cz <= 0
    ) {
      skipped++;
      continue;
    }

    // Apply the J-band sentinel: 99.999 means "no measurement".
    const jcmag =
      Number.isFinite(jcmagRaw) && Math.abs(jcmagRaw - J_SENTINEL) < 1e-3 ? NaN : jcmagRaw;

    records.push({
      source: Source.TwoMRS,
      objID: 0n,
      ra,
      dec,
      z: cz / C_KM_S,
      magU: NaN,
      magG: jcmag,
      magR: hcmag,
      magI: kcmag,
      magZ: NaN,
    });
  }

  return { records, skipped };
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- twoMrs`

- [ ] **Step 5: Commit (combines the delete + the new files)**

```bash
git add tools/parsers/twoMrs.ts tests/parsers/twoMrs.test.ts
git commit -m "fix(parsers): rewrite 2MRS parser against real ReadMe byte offsets"
```

(Git records the file deletion automatically since `git rm` was run before the new files were added with the same path.)

---

## Task 11: GLADE v2.3 parser (replaces old Task 11 = 2MPZ)

**Files:**

- Delete: `tools/parsers/twoMpz.ts` (committed in `a786ec2`; superseded by GLADE)
- Delete: `tests/parsers/twoMpz.test.ts`
- Create: `tools/parsers/glade.ts`
- Create: `tests/parsers/glade.test.ts`

GLADE v2.3 is a pre-merged catalogue (GWGC + HyperLEDA + 2MASS XSC + 2MPZ + SDSS-DR12Q) — using it eliminates the need to parse 2MPZ separately and to run cross-match dedup against those constituent catalogues ourselves.

### Real GLADE v2.3 spec (verified against `/data/raw/VII_281_ReadMe`)

File: `data/raw/glade2.3.dat`, 256-byte fixed-width, 3,262,881 records. Bytes are 1-based inclusive.

| Bytes | Field | Type | Notes |
|---|---|---|---|
| 1–7 | PGC | I7 | PGC number; `?=-` if absent |
| 9–36 | GWGC | A28 | name |
| 38–66 | HyperLEDA | A29 | name |
| 68–83 | 2MASS | A16 | name (e.g. 2MASX designation) |
| 85–102 | SDSS-DR12 | A18 | name |
| 104 | Flag1 | A1 | object type: `Q`=quasar, `C`=globular cluster, `G`=galaxy |
| 106–123 | RAdeg | F18.14 | decimal degrees |
| 125–144 | DEdeg | F20.15 | decimal degrees |
| 146–165 | Dist | F20.14 | luminosity distance Mpc; `?=-` if absent |
| 167–172 | e_Dist | F6.3 | distance error |
| 174–191 | z | E18.15 | redshift; `?=-` if absent |
| 193–198 | Bmag | F6.3 | apparent B mag |
| 200–203 | e_Bmag | F4.2 | error |
| 205–213 | BMAG | F9.5 | absolute B mag |
| 215–220 | Jmag | F6.3 | 2MASS J |
| 222–226 | e_Jmag | F5.3 | error |
| 228–233 | Hmag | F6.3 | 2MASS H |
| 235–239 | e_Hmag | F5.3 | error |
| 241–246 | Kmag | F6.3 | 2MASS K |
| 248–252 | e_Kmag | F5.3 | error |
| 254 | Flag2 | A1 | distance source: `0`=neither, `1`=z→dist, `2`=dist→z, `3`=photo-z replaced by spec-z |
| 256 | Flag3 | A1 | velocity correction: `0`=not applied, `1`=applied |

**Skip rules:**
- Skip if `Flag1 != 'G'` (drop quasars and globulars — we want galaxies)
- Skip if `Flag2 == '0'` (no measured z or distance — useless)
- Skip if `z` is `?=-` or non-finite or ≤ 0
- Skip if RA or Dec can't be parsed

**Mapping into 5-band slots:**
- magG = Bmag (B-band optical — bluest available)
- magR = Jmag (closest IR)
- magI = Hmag
- magZ = Kmag
- magU = NaN

> **Didactic comment material — write into the parser:** GLADE's photometry is heterogeneous: B-band from optical surveys, JHK from 2MASS. The five SDSS slots are a procrustean fit. We put B in the bluest slot and JHK in the longer-wavelength slots. The K-correction in `points.wgsl` uses redshift, not per-band corrections, so the visual rendering still works — colours won't match SDSS-only points exactly, but the relative brightness ordering is preserved.

**objID:** GLADE has no SDSS-objID-equivalent (the SDSS-DR12 column is a *name* like `SDSSJ123456.78+...`, not the numeric `bestObjID`). Use `0n` always. Cross-match dedup against SDSS in Task 13 falls back to position+z matching.

**Sentinel handling:** the ReadMe uses `?=-` (a literal dash) to mark missing values. Detect it as the trimmed field being `'---'`, `'-'`, or empty.

### Fixture: 3 real lines from `data/raw/glade2.3.dat`

The first 3 records of the file (NGC 253, NGC 5128, an unnamed 2MASS XSC galaxy):

```
   2789 NGC0253                      NGC0253                       00473313-2517196 ---                G  11.88806           -25.288799              3.92595099046     ---    0.00091602045801   7.34  0.30   ---      4.874 0.015  4.143 0.015  3.822 0.016 3 0
  46957 NGC5128                      NGC5128                       13252775-4301073 ---                G 201.365646          -43.018711              3.76743399832     ---    0.00087906043953   7.48  0.30   ---      5.031 0.015  4.312 0.016  3.989 0.015 3 0
    --- ---                          ---                           03464851+6805459 ---                G  56.702141           68.096107              8.3557478325      ---    0.001948          16.369 ---    ---      5.982 0.018  5.281 0.019  4.879 0.02  3 0
```

Expected after parsing all 3:
- All have `Flag1 = G` and `Flag2 = 3` → kept.
- Row 1 (NGC 253): RA=11.88806, Dec=-25.2888, z≈9.16e-4, Bmag=7.34, Jmag=4.874, Hmag=4.143, Kmag=3.822
- Row 2 (NGC 5128): RA=201.366, Dec=-43.019, z≈8.79e-4, Bmag=7.48
- Row 3 (unnamed): RA=56.702, Dec=68.096, z=1.948e-3, Bmag=16.369

So 3 records, 0 skipped.

> **Note on file completeness:** `data/raw/glade2.3.dat` may be a partial download (the curl was running in background; when last checked the file was 36 MB instead of the expected 838 MB). The fixture above is taken from the *real* first three rows of the partial file, which are valid records of the same byte format as the full file. If the download finishes between now and implementation, the same parser handles all 3.26M rows; the implementer can re-sample additional rows if more fixture coverage is wanted.

- [ ] **Step 0: Remove the superseded 2MPZ files**

```bash
git rm tools/parsers/twoMpz.ts tests/parsers/twoMpz.test.ts
```

- [ ] **Step 1: Write the new test file with the real fixture**

```ts
// tests/parsers/glade.test.ts
import { describe, it, expect } from 'vitest';
import { parseGlade } from '../../tools/parsers/glade';
import { Source } from '../../src/data/sources';

// Real first 3 rows from data/raw/glade2.3.dat (NGC 253, NGC 5128, unnamed).
const SAMPLE = [
  '   2789 NGC0253                      NGC0253                       00473313-2517196 ---                G  11.88806           -25.288799              3.92595099046     ---    0.00091602045801   7.34  0.30   ---      4.874 0.015  4.143 0.015  3.822 0.016 3 0',
  '  46957 NGC5128                      NGC5128                       13252775-4301073 ---                G 201.365646          -43.018711              3.76743399832     ---    0.00087906043953   7.48  0.30   ---      5.031 0.015  4.312 0.016  3.989 0.015 3 0',
  '    --- ---                          ---                           03464851+6805459 ---                G  56.702141           68.096107              8.3557478325      ---    0.001948          16.369 ---    ---      5.982 0.018  5.281 0.019  4.879 0.02  3 0',
].join('\n');

describe('parseGlade', () => {
  it('parses 3 real rows into 3 records (all Flag1=G, Flag2=3)', () => {
    const { records, skipped } = parseGlade(SAMPLE);
    expect(skipped).toBe(0);
    expect(records).toHaveLength(3);

    const r0 = records[0]!;
    expect(r0.source).toBe(Source.Glade);
    expect(r0.ra).toBeCloseTo(11.88806, 4);
    expect(r0.dec).toBeCloseTo(-25.2888, 4);
    expect(r0.z).toBeCloseTo(0.0009160, 6);
    expect(r0.magG).toBeCloseTo(7.34, 2); // Bmag → magG
    expect(r0.magR).toBeCloseTo(4.874, 3); // Jmag → magR
    expect(r0.magI).toBeCloseTo(4.143, 3); // Hmag → magI
    expect(r0.magZ).toBeCloseTo(3.822, 3); // Kmag → magZ
    expect(Number.isNaN(r0.magU)).toBe(true);
    expect(r0.objID).toBe(0n);
  });

  it('skips quasar rows (Flag1=Q)', () => {
    // synthetic row with Flag1='Q' in column 104
    const row =
      '   1234 testQSO                       testQSO                       ---              ---                Q 100.000000          0.000000                ---                   ---    0.500000000000     20.000 ---    ---      ---   ---    ---   ---    ---   ---   1 0';
    const { records, skipped } = parseGlade(row);
    expect(records).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('skips Flag2=0 rows (no measured distance or z)', () => {
    // synthetic row Flag2='0', Flag1='G'
    const row =
      '   1234 testEmpty                     testEmpty                     ---              ---                G 100.000000          0.000000                ---                   ---    ---                ---   ---    ---      ---   ---    ---   ---    ---   ---   0 0';
    const { records, skipped } = parseGlade(row);
    expect(records).toHaveLength(0);
    expect(skipped).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- glade`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tools/parsers/glade.ts`**

```ts
import { Source } from '../../src/data/sources';
import { nonCommentLines, type ParsedRecord } from './common';

/**
 * Parse a GLADE field that may carry the `?=-` sentinel. Returns NaN if
 * the trimmed value is empty, '-', or '---'; else the parsed float.
 *
 * GLADE marks missing values with literal dashes rather than blanks,
 * which is unusual — most VizieR catalogues use blanks. The pattern is
 * consistent: a single `-` for short fields, a longer `---` for wider
 * fields. Both must be treated as "missing".
 */
function parseFloatOrSentinel(s: string): number {
  const t = s.trim();
  if (t === '' || t === '-' || t === '---') return NaN;
  return parseFloat(t);
}

/**
 * Parse the GLADE v2.3 catalogue from VizieR VII/281.
 *
 * Format: 256-byte fixed-width ASCII (file `glade2.3.dat`, 3,262,881 records).
 * GLADE is itself a pre-merged catalogue: it cross-matches GWGC + HyperLEDA
 * + 2MASS XSC + 2MPZ + SDSS-DR12Q under one schema. Using GLADE means we
 * do not need separate parsers for any of those constituents — the GLADE
 * team has already deduplicated them.
 *
 * Byte ranges (1-based inclusive — `line.slice(N-1, M)`):
 *
 *   104     A1     Flag1      Q=quasar, C=globular, G=galaxy
 *   106–123 F18.14 RAdeg
 *   125–144 F20.15 DEdeg
 *   174–191 E18.15 z          redshift (or `?=-` for missing)
 *   193–198 F6.3   Bmag       apparent B
 *   215–220 F6.3   Jmag       2MASS J
 *   228–233 F6.3   Hmag       2MASS H
 *   241–246 F6.3   Kmag       2MASS K
 *   254     A1     Flag2      0 = no z and no distance; we drop these
 *
 * Magnitude mapping into our 5-band SDSS slots — heterogeneous photometry
 * (B is optical, JHK are 2MASS near-IR) is forced into the SDSS slots
 * pragmatically:
 *
 *   magU = NaN
 *   magG = Bmag   (bluest)
 *   magR = Jmag
 *   magI = Hmag
 *   magZ = Kmag
 *
 * The renderer's K-correction in `points.wgsl` is redshift-driven, not
 * band-specific, so this remapping does not break the visual model.
 *
 * objID: GLADE has no numeric SDSS objID; the `SDSS-DR12` column is a
 * name string, not the integer `bestObjID`. We always set `objID = 0n`.
 * Dedup against SDSS in Task 13 uses position + z instead.
 */
export function parseGlade(rawText: string): { records: ParsedRecord[]; skipped: number } {
  const lines = nonCommentLines(rawText);
  const records: ParsedRecord[] = [];
  let skipped = 0;

  for (const line of lines) {
    // Lines must be at least byte 256 to carry Flag2/Flag3 (allow trailing
    // missing newline → ≥ 254 to still read Flag2).
    if (line.length < 254) {
      skipped++;
      continue;
    }

    const flag1 = line.charAt(103); // byte 104, zero-indexed 103
    const flag2 = line.charAt(253); // byte 254

    if (flag1 !== 'G') {
      skipped++;
      continue;
    }
    if (flag2 === '0') {
      skipped++;
      continue;
    }

    const ra = parseFloatOrSentinel(line.slice(105, 123)); // 106–123
    const dec = parseFloatOrSentinel(line.slice(124, 144)); // 125–144
    const z = parseFloatOrSentinel(line.slice(173, 191)); // 174–191
    const bmag = parseFloatOrSentinel(line.slice(192, 198)); // 193–198
    const jmag = parseFloatOrSentinel(line.slice(214, 220)); // 215–220
    const hmag = parseFloatOrSentinel(line.slice(227, 233)); // 228–233
    const kmag = parseFloatOrSentinel(line.slice(240, 246)); // 241–246

    if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(z) || z <= 0) {
      skipped++;
      continue;
    }

    records.push({
      source: Source.Glade,
      objID: 0n,
      ra,
      dec,
      z,
      magU: NaN,
      magG: bmag,
      magR: jmag,
      magI: hmag,
      magZ: kmag,
    });
  }

  return { records, skipped };
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- glade`

- [ ] **Step 5: Commit**

```bash
git add tools/parsers/glade.ts tests/parsers/glade.test.ts
git commit -m "feat(parsers): GLADE v2.3 parser (replaces standalone 2MPZ)"
```

---

## Task 12 — REMOVED in revision 2

> **Removed in revision 2:** the 6dFGS standalone parser is subsumed by GLADE (which already incorporates 6dF redshifts via HyperLEDA + 2MPZ). Maintaining a separate 6dFGS pipeline would duplicate galaxies already present in GLADE.
>
> **Cleanup step:** delete the committed files from `6719560`:
>
> ```bash
> git rm tools/parsers/sixDfgs.ts tests/parsers/sixDfgs.test.ts
> git commit -m "refactor: remove 6dFGS parser (superseded by GLADE)"
> ```

---

## Task 13: Cross-match merger and per-source bin writer

**Files:**

- Create: `tests/crossMatch.test.ts`
- Create: `tools/buildAllBins.ts`
- Modify: `package.json` (add `build-all` script)

### Cross-match strategy (simplified vs. revision 1)

Because GLADE is *already* internally cross-matched (GWGC + HyperLEDA + 2MASS XSC + 2MPZ + SDSS-DR12Q), the only dedup we need to do ourselves is:

1. **GLADE ↔ SDSS** by position + z. GLADE's SDSS-DR12 column is a *name*, not the numeric objID we use elsewhere. We can't match on objID, so we use angular separation < 5 arcsec AND `|Δz/(1+z)| < 0.01`.
2. **GLADE ↔ 2MRS** by the same position + z criterion.
3. **2MRS ↔ SDSS** by the same criterion.

Priority order (best record kept on duplicate): SDSS > 2MRS > GLADE. Rationale:
- SDSS spectroscopic z is the highest precision.
- 2MRS spec-z is also high precision, but only K-band photometry — we prefer SDSS where both cover the same galaxy.
- GLADE inherits its z from whichever underlying catalogue measured it first; some GLADE z's are photometric (lower precision than 2MRS spec-z).

Output: three per-source bins — `sdss.bin`, `2mrs.bin`, `glade.bin` (no `2mpz.bin`, no `6dfgs.bin`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/crossMatch.test.ts
import { describe, it, expect } from 'vitest';
import { crossMatch } from '../tools/buildAllBins';
import { Source } from '../src/data/sources';
import type { ParsedRecord } from '../tools/parsers/common';

function rec(source: Source, ra: number, dec: number, z: number, objID = 0n): ParsedRecord {
  return {
    source,
    objID,
    ra,
    dec,
    z,
    magU: NaN,
    magG: 18,
    magR: NaN,
    magI: NaN,
    magZ: NaN,
  };
}

describe('crossMatch', () => {
  it('rejects positional duplicates within 5 arcsec and Δz/(1+z) < 1%', () => {
    const out = crossMatch({
      sdss: [rec(Source.SDSS, 180, 0, 0.1)],
      twoMrs: [rec(Source.TwoMRS, 180.0001, 0, 0.10005)], // ~0.36 arcsec, same z
      glade: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe(Source.SDSS);
  });

  it('keeps records that differ in z even at the same position', () => {
    const out = crossMatch({
      sdss: [rec(Source.SDSS, 180, 0, 0.1)],
      twoMrs: [],
      glade: [rec(Source.Glade, 180, 0, 0.5)], // background galaxy along same LoS
    });
    expect(out).toHaveLength(2);
  });

  it('preserves SDSS > 2MRS > GLADE priority on positional dedup', () => {
    const out = crossMatch({
      sdss: [],
      twoMrs: [rec(Source.TwoMRS, 180, 0, 0.05)],
      glade: [rec(Source.Glade, 180.0001, 0, 0.05005)],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe(Source.TwoMRS);
  });

  it('keeps galaxies that appear only in GLADE', () => {
    const out = crossMatch({
      sdss: [],
      twoMrs: [],
      glade: [
        rec(Source.Glade, 30, -25, 0.001),
        rec(Source.Glade, 200, -43, 0.001),
      ],
    });
    expect(out).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- crossMatch`

- [ ] **Step 3: Implement `tools/buildAllBins.ts`**

```ts
#!/usr/bin/env node
/**
 * buildAllBins — cross-match three real catalogues and write one v2 .bin per source.
 *
 * Usage:
 *   npm run build-all -- \
 *     --sdss    path/to/sdss.csv \
 *     --twomrs  path/to/2mrs_table3.dat \
 *     --glade   path/to/glade2.3.dat \
 *     --out-dir public/data
 *
 * Output files: sdss.bin, 2mrs.bin, glade.bin (one per source).
 *
 * Cross-match dedup:
 *   - Priority: SDSS > 2MRS > GLADE (records concatenated in this order;
 *     the first one through wins).
 *   - GLADE is itself a pre-merged catalogue (2MPZ + 2MASS XSC + HyperLEDA
 *     + GWGC + SDSS-DR12Q), so we only need to dedup it against SDSS and
 *     against 2MRS — not against its own constituents.
 *   - Match criterion: angular separation < 5 arcsec AND |Δz/(1+z)| < 0.01.
 *     (We do NOT use objID here because GLADE's SDSS-DR12 column is a
 *     name, not the numeric objID.)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseSdssCsv } from './parsers/sdssCsv';
import { parseTwoMrs } from './parsers/twoMrs';
import { parseGlade } from './parsers/glade';
import type { ParsedRecord } from './parsers/common';

import { encodePointCloud } from '../src/data/pointCloudFormat';
import { raDecZToCartesian } from '../src/data/coords';
import { Source } from '../src/data/sources';
import type { PointCloud } from '../src/types';

// ─── Cross-match ─────────────────────────────────────────────────────────────

const ARC_SEC_IN_DEG = 1 / 3600;
const POSITION_TOL_DEG = 5 * ARC_SEC_IN_DEG;
const REDSHIFT_TOL_REL = 0.01;

type Inputs = {
  sdss: ParsedRecord[];
  twoMrs: ParsedRecord[];
  glade: ParsedRecord[];
};

export function crossMatch(inputs: Inputs): ParsedRecord[] {
  // Priority order: SDSS first, then 2MRS, then GLADE.
  const all: ParsedRecord[] = [...inputs.sdss, ...inputs.twoMrs, ...inputs.glade];

  // 2D grid keyed by floor(ra),floor(dec); each cell holds the records
  // already accepted in that 1°×1° tile. 5 arcsec is well below 1°, so
  // checking the centre cell + 8 neighbours covers all possible matches.
  const grid = new Map<string, ParsedRecord[]>();
  const cellKey = (ra: number, dec: number) => `${Math.floor(ra)}|${Math.floor(dec)}`;

  function angularSepDeg(ra1: number, dec1: number, ra2: number, dec2: number): number {
    // Small-angle approximation. Adequate for our 5-arcsec threshold and
    // dec away from the poles. cos(dec) compresses the RA delta because
    // RA is a longitude, not a great-circle distance.
    const dRa = (ra1 - ra2) * Math.cos(((dec1 + dec2) * 0.5 * Math.PI) / 180);
    const dDec = dec1 - dec2;
    return Math.sqrt(dRa * dRa + dDec * dDec);
  }

  const accepted: ParsedRecord[] = [];

  for (const r of all) {
    let isDuplicate = false;
    const cx = Math.floor(r.ra);
    const cy = Math.floor(r.dec);
    for (let dy = -1; dy <= 1 && !isDuplicate; dy++) {
      for (let dx = -1; dx <= 1 && !isDuplicate; dx++) {
        const cell = grid.get(`${cx + dx}|${cy + dy}`);
        if (!cell) continue;
        for (const other of cell) {
          if (angularSepDeg(r.ra, r.dec, other.ra, other.dec) < POSITION_TOL_DEG) {
            const dz = Math.abs(r.z - other.z) / (1 + Math.min(r.z, other.z));
            if (dz < REDSHIFT_TOL_REL) {
              isDuplicate = true;
              break;
            }
          }
        }
      }
    }
    if (isDuplicate) continue;

    accepted.push(r);
    const k = cellKey(r.ra, r.dec);
    let cell = grid.get(k);
    if (!cell) {
      cell = [];
      grid.set(k, cell);
    }
    cell.push(r);
  }

  return accepted;
}

// ─── PointCloud assembly + write ─────────────────────────────────────────────

function recordsToCloud(records: ParsedRecord[]): PointCloud {
  const count = records.length;
  const cloud: PointCloud = {
    count,
    objIDs: new BigUint64Array(count),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
  };
  for (let i = 0; i < count; i++) {
    const r = records[i]!;
    const [x, y, z] = raDecZToCartesian(r.ra, r.dec, r.z);
    cloud.objIDs[i] = r.objID;
    cloud.positions[i * 3 + 0] = x;
    cloud.positions[i * 3 + 1] = y;
    cloud.positions[i * 3 + 2] = z;
    cloud.magU[i] = r.magU;
    cloud.magG[i] = r.magG;
    cloud.magR[i] = r.magR;
    cloud.magI[i] = r.magI;
    cloud.magZ[i] = r.magZ;
  }
  return cloud;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function readArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      out[a.slice(2)] = argv[i + 1] ?? '';
      i++;
    }
  }
  return out;
}

const args = readArgs();
if (!args['out-dir']) {
  process.stderr.write(
    'usage: build-all --sdss FILE --twomrs FILE --glade FILE --out-dir DIR\n',
  );
  process.exit(1);
}

function loadOrEmpty(
  path: string | undefined,
  parser: (raw: string) => { records: ParsedRecord[]; skipped: number },
): ParsedRecord[] {
  if (!path) return [];
  const text = readFileSync(resolve(path), 'utf8');
  const { records, skipped } = parser(text);
  process.stderr.write(
    `  loaded ${records.length.toLocaleString()} records (skipped ${skipped.toLocaleString()})\n`,
  );
  return records;
}

process.stderr.write('parsing SDSS…\n');
const sdss = loadOrEmpty(args.sdss, parseSdssCsv);
process.stderr.write('parsing 2MRS…\n');
const twoMrs = loadOrEmpty(args.twomrs, parseTwoMrs);
process.stderr.write('parsing GLADE…\n');
const glade = loadOrEmpty(args.glade, parseGlade);

process.stderr.write('cross-matching…\n');
const merged = crossMatch({ sdss, twoMrs, glade });
process.stderr.write(`  ${merged.length.toLocaleString()} records survived dedup\n`);

const bySource = new Map<Source, ParsedRecord[]>();
for (const r of merged) {
  let arr = bySource.get(r.source);
  if (!arr) {
    arr = [];
    bySource.set(r.source, arr);
  }
  arr.push(r);
}

const OUT_NAMES: Partial<Record<Source, string>> = {
  [Source.SDSS]: 'sdss.bin',
  [Source.TwoMRS]: '2mrs.bin',
  [Source.Glade]: 'glade.bin',
};

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

- [ ] **Step 4: Add npm script**

In `package.json`, add to the `scripts` block:

```json
"build-all": "tsx tools/buildAllBins.ts"
```

- [ ] **Step 5: Run test, expect PASS**

Run: `npm test -- crossMatch`

- [ ] **Step 6: Commit**

```bash
git add tools/buildAllBins.ts tests/crossMatch.test.ts package.json
git commit -m "feat(tools): cross-match merger + build-all CLI (3 per-source bins)"
```

---

## Task 14: InfoCard source attribution + DSS image fallback

**Files:**

- Modify: `src/data/physics.ts`
- Modify: `src/engine.ts`
- Modify: `src/components/InfoCard.tsx`
- Modify: `index.html`

For non-SDSS sources we can't link to the SDSS Quick-Look page (no objID). The image cutout still works for any RA/Dec via the DSS service:

```
https://archive.eso.org/dss/dss/image?ra={ra}&dec={dec}&x=2&y=2&Sky-Survey=DSS2-red&mime-type=image/jpeg
```

- [ ] **Step 1: Add `dssThumbnailUrl` to `src/data/physics.ts`**

```ts
/**
 * Build a Digitized Sky Survey image cutout URL for a given (RA, Dec).
 *
 * DSS is all-sky (originally photographic plates), unlike SDSS which only
 * covers ~1/3 of the sky. We fall back to DSS for points sourced from
 * non-SDSS surveys (2MRS, GLADE).
 */
export function dssThumbnailUrl(raDeg: number, decDeg: number, arcMin = 2): string {
  return (
    `https://archive.eso.org/dss/dss/image?ra=${raDeg}&dec=${decDeg}` +
    `&x=${arcMin}&y=${arcMin}&Sky-Survey=DSS2-red&mime-type=image/jpeg`
  );
}
```

Add a unit test in `tests/physics.test.ts`:

```ts
import { dssThumbnailUrl } from '../src/data/physics';

describe('dssThumbnailUrl', () => {
  it('builds the ESO DSS endpoint with default 2-arcmin field', () => {
    expect(dssThumbnailUrl(180, 0)).toBe(
      'https://archive.eso.org/dss/dss/image?ra=180&dec=0&x=2&y=2&Sky-Survey=DSS2-red&mime-type=image/jpeg',
    );
  });
});
```

- [ ] **Step 2: Update `PointInfo` to include `source` and per-source URLs**

In `src/engine.ts`:

```ts
export type PointInfo = {
  // existing fields unchanged
  source: Source;
  sourceLabel: string;
  explorerUrl: string | null; // null for non-SDSS rows
  thumbnailUrl: string;
};
```

In `buildPointInfo`:

```ts
import { Source, sourceLabel as sourceLabelFn } from './data/sources';
import { dssThumbnailUrl, sdssThumbnailUrl, sdssExplorerUrl } from './data/physics';

const isSdss = source === Source.SDSS;
const explorerUrl =
  isSdss && cloud.objIDs[index]! > 0n ? sdssExplorerUrl(cloud.objIDs[index]!) : null;
const thumbnailUrl = isSdss ? sdssThumbnailUrl(ra, dec, 200) : dssThumbnailUrl(ra, dec, 2);

const info: PointInfo = {
  // ...
  source,
  sourceLabel: sourceLabelFn(source),
  explorerUrl,
  thumbnailUrl,
};
```

- [ ] **Step 3: Update `src/components/InfoCard.tsx`**

In `FullCard`:

```tsx
// Above the card rows, just under the J-name headline:
<div className="card-source-badge">{info.sourceLabel}</div>;

// Replace the Explorer link block:
{
  info.explorerUrl ? (
    <a className="external-link" href={info.explorerUrl} target="_blank" rel="noopener noreferrer">
      View in SDSS Explorer →
    </a>
  ) : (
    <div className="external-link external-link-disabled">
      No catalogue page for {info.sourceLabel}
    </div>
  );
}
```

Add the same badge to `CompactCard`.

- [ ] **Step 4: Add CSS for `.card-source-badge` in `index.html`**

```css
.card-source-badge {
  display: inline-block;
  padding: 1px 6px;
  margin: 4px 0 6px 0;
  border-radius: 3px;
  background: rgba(160, 200, 255, 0.12);
  border: 1px solid rgba(160, 200, 255, 0.25);
  color: rgba(220, 230, 255, 0.85);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.external-link-disabled {
  opacity: 0.45;
  font-style: italic;
}
```

- [ ] **Step 5: Run typecheck and build**

Run: `npm run typecheck && npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/data/physics.ts src/engine.ts src/components/InfoCard.tsx index.html tests/physics.test.ts
git commit -m "feat(infocard): source badge + DSS image fallback for non-SDSS rows"
```

---

## Task 15: README updates

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Add a "Multi-survey download" section**

Insert after the existing "Loading real SDSS data" section:

````markdown
## Loading multi-survey data

To render galaxies from all three surveys (SDSS Main+BOSS+eBOSS, 2MRS, GLADE) loaded in parallel:

### 1. Download the catalogues

| Survey | Source | File / Notes |
| ------ | ------ | -------------- |
| SDSS   | [SkyServer SQL](https://skyserver.sdss.org/dr18/SearchTools/sql) | Use the wider Main+BOSS+eBOSS query (no `survey=` filter) — see Task 9 for the exact SQL. |
| 2MRS   | [VizieR J/ApJS/199/26](https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/ApJS/199/26) | `table3.dat`, 233-byte fixed-width, 44,599 rows, ~10 MB. |
| GLADE  | [VizieR VII/281](https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=VII/281) | `glade2.3.dat`, 256-byte fixed-width, 3.26M rows, ~838 MB. Pre-merged from 2MPZ + 2MASS XSC + HyperLEDA + GWGC + SDSS-DR12Q. |

GLADE alone subsumes 2MPZ and 6dFGS — the GLADE team has already cross-matched and deduplicated the constituents, so a single download replaces what would otherwise be three.

### 2. Build the per-source binary files

```bash
npm run build-all -- \
  --sdss    data/sdss_combined.csv \
  --twomrs  data/raw/2mrs_table3.dat \
  --glade   data/raw/glade2.3.dat \
  --out-dir public/data
```

The tool parses each catalogue, runs cross-match dedup (5 arcsec / 1% Δz tolerance) using priority SDSS > 2MRS > GLADE, then writes three files: `public/data/sdss.bin`, `2mrs.bin`, `glade.bin`. Each file is standard v2 format.

### 3. Reload

The browser fetches all three files in parallel at startup. Surveys arrive progressively — the status bar reports "loaded N/3 surveys". The settings panel bottom-left gives you per-survey checkboxes plus an Auto LOD toggle that picks visible surveys based on camera distance:

- < 200 Mpc → Synthetic + 2MRS + GLADE (local universe; SDSS too sparse)
- 200–800 Mpc → all sources
- \> 800 Mpc → Synthetic + SDSS only (only SDSS reaches that depth)

> Want only some surveys? Omit the corresponding `--xxx` flag — the merger treats missing inputs as empty arrays and skips writing the empty output file.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): GLADE-centric multi-survey workflow"
```

---

## Out of scope (deferred)

- **FITS file support** — VizieR also offers FITS downloads. Easier to parse than ASCII for some catalogues but adds a dependency. Stick with ASCII for v1.
- **Spatial chunking / frustum culling** for ≥10M points. The three-survey combined point count is ~3–5M which the multi-buffer renderer should handle at 60 fps with appropriate point sizing. The 100M-photometric-scale problem is its own plan.
- **Photometric mass / luminosity estimates** from the cross-band photometry. Adds a stellar-population-synthesis pipeline; defer.
- **Galactic-plane region** highlighting. The 2MRS/GLADE data sparsens through `|b| < 5°`; visualising this gap is its own UX exercise.
- **Settings panel keyboard shortcuts** (e.g. `1`/`2`/`3` to toggle surveys, `a` for auto-LOD).

---

## Self-review notes

- **Spec coverage:** 3 real surveys ingested (Tasks 9 — SDSS, 10 — 2MRS, 11 — GLADE), cross-matched and written as three separate v2 `.bin` files (Task 13), parallel runtime loading with progressive rendering (Task 6), auto-LOD by camera distance + manual override (Tasks 5, 7, 8), multi-cloud renderer with per-source draw calls (Task 4 — already DONE).
- **Format unchanged:** Binary format stays at v2. No `sourceIDs` field in PointCloud. Each cloud's source identity is known from which file it was loaded, stored in `Map<Source, PointCloud>` in the engine.
- **Type consistency:** `Source` enum values reduced from 5 to 4 in Task 1 and used identically everywhere.
- **Real specs throughout:** every byte offset in the 2MRS and GLADE parsers (Tasks 10, 11) is taken from the actual VizieR ReadMes in `data/raw/`. Test fixtures are real first-three-rows of the actual data files.
- **Known partial download:** `data/raw/glade2.3.dat` may have been incompletely downloaded at the time this plan was written (~36 MB observed instead of the expected ~838 MB). Test fixtures in Task 11 use rows that were present in the partial file and are valid GLADE records under the documented schema. If the implementer finds the file is still partial when running the merger, finishing the download is a one-line curl re-run, not a code change.
- **No placeholders.** Every task contains complete code (or a complete delete + replace plan). Removed/superseded tasks (2, 3, 4, 9, 12) are marked with explicit revision notes pointing at the relevant commit SHA.
