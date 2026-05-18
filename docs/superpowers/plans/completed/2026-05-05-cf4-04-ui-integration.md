# CF4 sub-plan 04 — UI integration + basin colours

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Each implementer subagent must be `run_in_background: true`.

**Goal:** Replace the monochrome phase-1 colours from plans 02 and 03 with
per-basin colours driven by `cf4_basins.json`. Group all CF4 controls into
a "Cosmic Flows" CollapsibleSection in SettingsPanel, add CommandPalette
entries to focus on each named basin, and surface the basin name in the
hover/InfoCard path for CF4 galaxies.

**Architecture:** A small `cf4Palette` module loads
`/data/cf4_basins.json` once at startup and caches a flat
`Float32Array` of length `(N+1) × 4` (RGBA per basin). Both renderers
consume that buffer as a uniform/storage binding; their fragment shaders
look up the colour by `basinId`. The "Cosmic Flows" section in
SettingsPanel groups the four existing controls (galaxies toggle,
streamlines toggle, density slider) plus a new "Basin colours" toggle
that switches the palette buffer between the JSON colours and the phase-1
monochrome fallback.

**Tech Stack:** WebGPU + WGSL, TypeScript, React.

**Prerequisites:** plans 01, 02, 03 have shipped. `cf4_basins.json`
exists; CF4 toggles already work; controls are scattered across the
existing SettingsPanel rows.

**Done means:**

- Basin palette loads at startup and applies to galaxies + streamlines.
- A "Cosmic Flows" CollapsibleSection holds all CF4 controls.
- CommandPalette has 9 new entries (one per named basin) that reframe
  the camera onto that basin's centroid.
- Clicking a CF4 galaxy shows the basin name in the InfoCard.

---

## File structure

### New files

- `src/data/cf4Palette.ts` — fetch + parse `cf4_basins.json`; expose
  the flat RGBA buffer and a `basinName(id) → string` helper.
- `src/services/engine/cf4BasinCentroids.ts` — pure function over
  `Cf4Cloud` that returns `{ id, name, centroid: vec3 }[]` for camera
  focus. Used by CommandPalette.
- `tests/data/cf4Palette.test.ts`
- `tests/services/engine/cf4BasinCentroids.test.ts`

### Modified files

- `src/services/gpu/cf4PointRenderer.ts` — accept palette buffer in
  constructor; bind as second uniform; pass basinId from VS to FS.
- `src/services/gpu/shaders/cf4Galaxies.wgsl` — sample palette by
  basinId in FS.
- `src/services/gpu/cf4StreamlineRenderer.ts` — accept palette buffer;
  bind as second uniform.
- `src/services/gpu/shaders/cf4Streamlines.wgsl` — sample palette in FS.
- `src/services/engine/engine.ts` — load palette JSON; create palette
  buffer; thread into renderers; expose
  `setCf4BasinColoursEnabled`.
- `src/@types/EngineHandle.d.ts` — add the new setter and a
  `getCf4BasinCentroids?(): { id, name, centroid }[]`.
- `src/components/SettingsPanel/SettingsPanel.tsx` — wrap CF4 rows in a
  CollapsibleSection; add a "Basin colours" toggle.
- `src/components/CommandPalette/CommandPalette.tsx` — append basin
  entries fetched from the engine.
- `src/components/InfoCard/InfoCard.tsx` — show basin name when the
  hover target is a CF4 galaxy (best-effort; depends on plan-02 picking
  exposing the CF4 source, see Open Questions).
- `src/App.tsx` — `cf4BasinColoursEnabled` state + handler.
- `src/data/defaults.ts` — `DEFAULT_CF4_BASIN_COLOURS_ENABLED = true`.

---

## Palette buffer layout

We pack the JSON palette into a `Float32Array` of length `(MAX_BASINS+1) × 4`
where `MAX_BASINS = 9` (the laniakea palette ships 0..9 inclusive).
Indices > 9 fall back to entry 0 (white). RGBA in 0..1, alpha is 1.0
(unused but keeps the slot 16-byte aligned).

The buffer is bound as a `uniform` block of fixed size:

```wgsl
struct Palette {
  colours : array<vec4<f32>, 10>,
};
@group(0) @binding(1) var<uniform> palette : Palette;
```

Total: 160 bytes. Fits comfortably in any uniform buffer; no need for
storage-buffer.

---

## Tasks

### Task 0: Verify baseline

- [ ] **Step 0.1.** `npm run typecheck && npm test`. Confirm CF4 galaxies
      and streamlines render in monochrome from plans 02 & 03.

---

### Task 1: Palette module

**Files:**

- Create: `src/data/cf4Palette.ts`
- Create: `tests/data/cf4Palette.test.ts`

- [ ] **Step 1.1: Failing test.**

```ts
// tests/data/cf4Palette.test.ts
import { describe, it, expect } from 'vitest';
import { decodeCf4Palette, paletteBufferFromBasins } from '../../src/data/cf4Palette';

describe('cf4Palette', () => {
  it('decodes the JSON sidecar', () => {
    const json = JSON.stringify({
      version: 1,
      basins: [
        { id: 0, name: 'Unassigned', color: '#ffffff' },
        { id: 1, name: 'Laniakea',   color: '#e6194b' },
      ],
    });
    const out = decodeCf4Palette(json);
    expect(out.basins).toHaveLength(2);
    expect(out.basins[0]!.name).toBe('Unassigned');
  });

  it('packs RGBA into a Float32Array of (MAX+1) × 4 length', () => {
    const buf = paletteBufferFromBasins([
      { id: 0, name: 'X', color: '#ff0000' },
      { id: 1, name: 'Y', color: '#00ff00' },
    ]);
    expect(buf.length).toBe(10 * 4);
    expect(buf[0]).toBe(1);
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(0);
    expect(buf[4]).toBe(0);
    expect(buf[5]).toBe(1);
  });

  it('throws on malformed hex', () => {
    expect(() =>
      paletteBufferFromBasins([{ id: 0, name: '?', color: 'red' }]),
    ).toThrow();
  });
});
```

- [ ] **Step 1.2: Implement.**

```ts
// src/data/cf4Palette.ts
/**
 * cf4Palette — load `cf4_basins.json` and pack into a GPU-uniform-shaped
 * Float32Array.
 *
 * Why a JSON sidecar rather than baking the palette into the binary?
 * The palette is ten colours; round-tripping it through the binary
 * format means version-bumping every time we tweak a hex value. JSON
 * keeps the palette editable without rebuilding the .bin files.
 */
export type Cf4Basin = { id: number; name: string; color: string };
export type Cf4Palette = { version: number; basins: Cf4Basin[] };

export const MAX_BASINS = 9; // 0..9 inclusive

export function decodeCf4Palette(jsonText: string): Cf4Palette {
  const obj = JSON.parse(jsonText);
  if (!obj || obj.version !== 1 || !Array.isArray(obj.basins)) {
    throw new Error('decodeCf4Palette: bad JSON shape');
  }
  return obj as Cf4Palette;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`invalid hex colour: ${hex}`);
  const n = Number.parseInt(m[1]!, 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

export function paletteBufferFromBasins(basins: Cf4Basin[]): Float32Array {
  const out = new Float32Array((MAX_BASINS + 1) * 4);
  // Default fallback: white, alpha 1
  for (let i = 0; i < MAX_BASINS + 1; i++) {
    out[i * 4 + 0] = 1;
    out[i * 4 + 1] = 1;
    out[i * 4 + 2] = 1;
    out[i * 4 + 3] = 1;
  }
  for (const b of basins) {
    if (b.id < 0 || b.id > MAX_BASINS) continue;
    const [r, g, bl] = hexToRgb(b.color);
    out[b.id * 4 + 0] = r;
    out[b.id * 4 + 1] = g;
    out[b.id * 4 + 2] = bl;
  }
  return out;
}

export async function loadCf4Palette(): Promise<Cf4Palette | null> {
  try {
    const res = await fetch('/data/cf4_basins.json');
    if (!res.ok) return null;
    return decodeCf4Palette(await res.text());
  } catch {
    return null;
  }
}
```

Run + commit:

```
npm test -- cf4Palette
git add src/data/cf4Palette.ts tests/data/cf4Palette.test.ts
git commit -m "feat(cf4): load + pack basin palette JSON sidecar"
```

---

### Task 2: Wire palette into Cf4PointRenderer

**Files:**

- `src/services/gpu/cf4PointRenderer.ts`
- `src/services/gpu/shaders/cf4Galaxies.wgsl`

- [ ] **Step 2.1: Add palette uniform binding to the shader.**

Replace the hard-coded fragment colour:

```wgsl
struct Palette {
  colours : array<vec4<f32>, 10>,
};
@group(0) @binding(1) var<uniform> palette : Palette;

// FS: lookup by basinId clamped to [0,9].
@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.0) { discard; }
  let alpha = (1.0 - r2) * u.intensity;
  let idx = u32(clamp(in.basinId, 0.0, 9.0));
  let rgb = palette.colours[idx].rgb;
  return vec4<f32>(rgb * alpha, alpha);
}
```

- [ ] **Step 2.2: Renderer constructor accepts a palette buffer.**

Modify `Cf4PointRenderer` to take an `initialPalette: Float32Array` arg
and:

- create a 160-byte uniform buffer for the palette
- add a second binding to the layout + bind group (binding 1)
- expose `setPalette(buffer: Float32Array)` that re-uploads the buffer

The bindGroupLayout becomes:

```ts
entries: [
  { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
  { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
],
```

- [ ] **Step 2.3: Update tests.**

The Cf4PointRenderer smoke test now checks for **two** uniform buffers
(`'cf4-uniform'` and `'cf4-palette'`) plus the instance buffer.

Run + commit:

```
npm run typecheck && npm test -- cf4PointRenderer
git add src/services/gpu/cf4PointRenderer.ts src/services/gpu/shaders/cf4Galaxies.wgsl tests/services/gpu/cf4PointRenderer.test.ts
git commit -m "feat(cf4): galaxy renderer samples basin palette uniform"
```

---

### Task 3: Wire palette into Cf4StreamlineRenderer

**Files:**

- `src/services/gpu/cf4StreamlineRenderer.ts`
- `src/services/gpu/shaders/cf4Streamlines.wgsl`

- [ ] **Step 3.1: Update shader.**

Replace the fragment hard-coded amber:

```wgsl
struct Palette {
  colours : array<vec4<f32>, 10>,
};
@group(0) @binding(1) var<uniform> palette : Palette;

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  let idx = u32(clamp(in.basinId, 0.0, 9.0));
  let rgb = palette.colours[idx].rgb;
  let alpha = 0.5 * u.intensity;
  return vec4<f32>(rgb * alpha, alpha);
}
```

- [ ] **Step 3.2: Renderer constructor + setPalette + smoke-test
  update.**

Same shape as Task 2.2. Run + commit:

```
npm run typecheck && npm test -- cf4StreamlineRenderer
git add src/services/gpu/cf4StreamlineRenderer.ts src/services/gpu/shaders/cf4Streamlines.wgsl tests/services/gpu/cf4StreamlineRenderer.test.ts
git commit -m "feat(cf4): streamline renderer samples basin palette uniform"
```

---

### Task 4: Engine wires palette into both renderers

**Files (modify):**

- `src/services/engine/engine.ts`
- `src/data/defaults.ts`
- `src/@types/EngineHandle.d.ts`

- [ ] **Step 4.1: Defaults + setter.**

```ts
// defaults.ts
export const DEFAULT_CF4_BASIN_COLOURS_ENABLED = true;
```

- [ ] **Step 4.2: Engine init.**

```ts
let palette = paletteBufferFromBasins([]); // white fallback
loadCf4Palette().then((p) => {
  if (!p) return;
  palette = paletteBufferFromBasins(p.basins);
  cf4PointRenderer.setPalette(palette);
  cf4StreamlineRenderer.setPalette(palette);
  state.cf4Palette = p;
});

setCf4BasinColoursEnabled(enabled: boolean) {
  const buf = enabled
    ? state.cf4Palette
      ? paletteBufferFromBasins(state.cf4Palette.basins)
      : palette
    : MONOCHROME_PALETTE; // a precomputed Float32Array — cyan for galaxies, amber for streamlines… see open questions
  cf4PointRenderer.setPalette(buf);
  cf4StreamlineRenderer.setPalette(buf);
  scheduler.requestRender();
},
```

(Note: Phase-4 monochrome restoration is debatable — see Open Questions
in the index. The simpler path is to drop the toggle and always use basin
colours.)

- [ ] **Step 4.3: Run, commit.**

```
npm run typecheck && npm test
git add src/services/engine/engine.ts src/data/defaults.ts src/@types/EngineHandle.d.ts
git commit -m "feat(cf4): engine threads basin palette to both renderers"
```

---

### Task 5: Basin centroids + CommandPalette entries

**Files:**

- Create: `src/services/engine/cf4BasinCentroids.ts`
- Create: `tests/services/engine/cf4BasinCentroids.test.ts`
- Modify: `src/components/CommandPalette/CommandPalette.tsx`
- Modify: `src/services/engine/engine.ts` — expose `getCf4BasinCentroids`.

- [ ] **Step 5.1: Pure function + test.**

```ts
// src/services/engine/cf4BasinCentroids.ts
/**
 * cf4BasinCentroids — compute the centroid (mean SG position) of each
 * basin's CF4 galaxies. Pure; the engine calls it once after
 * cf4_galaxies.bin decodes.
 *
 * Used by the CommandPalette's "Focus on Laniakea / Shapley / etc."
 * entries: each centroid becomes a tween destination for the orbit
 * camera.
 */
import type { Cf4Cloud } from '../../@types/Cf4Cloud';
import type { Cf4Palette } from '../../data/cf4Palette';

export type BasinCentroid = {
  id: number;
  name: string;
  centroid: [number, number, number];
  count: number;
};

export function computeCf4BasinCentroids(
  cloud: Cf4Cloud,
  palette: Cf4Palette,
): BasinCentroid[] {
  const sums = new Map<number, { x: number; y: number; z: number; n: number }>();
  for (let i = 0; i < cloud.count; i++) {
    const id = cloud.basinIds[i]!;
    let s = sums.get(id);
    if (!s) {
      s = { x: 0, y: 0, z: 0, n: 0 };
      sums.set(id, s);
    }
    s.x += cloud.positions[i * 3 + 0]!;
    s.y += cloud.positions[i * 3 + 1]!;
    s.z += cloud.positions[i * 3 + 2]!;
    s.n += 1;
  }
  const out: BasinCentroid[] = [];
  for (const b of palette.basins) {
    if (b.id === 0) continue; // skip "Unassigned"
    const s = sums.get(b.id);
    if (!s || s.n === 0) continue;
    out.push({
      id: b.id,
      name: b.name,
      centroid: [s.x / s.n, s.y / s.n, s.z / s.n],
      count: s.n,
    });
  }
  return out;
}
```

Test:

```ts
// tests/services/engine/cf4BasinCentroids.test.ts
import { describe, it, expect } from 'vitest';
import { computeCf4BasinCentroids } from '../../../src/services/engine/cf4BasinCentroids';

describe('computeCf4BasinCentroids', () => {
  it('returns the mean position per basin and skips id 0', () => {
    const cloud = {
      count: 4,
      positions: new Float32Array([0, 0, 0, 2, 2, 2, 10, 0, 0, 20, 0, 0]),
      distances: new Float32Array([0, 0, 0, 0]),
      basinIds: new Uint32Array([1, 1, 0, 2]),
    };
    const palette = {
      version: 1,
      basins: [
        { id: 0, name: 'Unassigned', color: '#ffffff' },
        { id: 1, name: 'Laniakea',   color: '#e6194b' },
        { id: 2, name: 'Shapley',    color: '#f58231' },
      ],
    };
    const out = computeCf4BasinCentroids(cloud, palette);
    expect(out).toHaveLength(2);
    const lan = out.find((b) => b.id === 1)!;
    expect(lan.centroid).toEqual([1, 1, 1]);
    expect(lan.count).toBe(2);
    const shap = out.find((b) => b.id === 2)!;
    expect(shap.centroid).toEqual([20, 0, 0]);
  });
});
```

Run + commit:

```
npm test -- cf4BasinCentroids
git add src/services/engine/cf4BasinCentroids.ts tests/services/engine/cf4BasinCentroids.test.ts
git commit -m "feat(cf4): compute basin centroids for camera focus"
```

- [ ] **Step 5.2: Engine exposes the centroids.**

```ts
// inside the loadCf4Palette + loadCf4Galaxies merging .then:
state.cf4Centroids = computeCf4BasinCentroids(galaxiesCloud, palette);

// EngineHandle method:
getCf4BasinCentroids() {
  return state.cf4Centroids;
}
```

- [ ] **Step 5.3: CommandPalette entries.**

In `CommandPalette.tsx`, after the existing entries (focus on famous
galaxies etc.), append:

```tsx
const cf4 = handleRef.current?.getCf4BasinCentroids?.() ?? [];
const cf4Entries = cf4.map((b) => ({
  id: `cf4-basin-${b.id}`,
  label: `Focus on ${b.name} (${b.count.toLocaleString()} galaxies)`,
  onSelect: () => {
    handleRef.current?.focusOnPosition?.(b.centroid, /* radiusMpc */ 50);
  },
}));
```

(`focusOnPosition` already exists on `EngineHandle` per the camera-focus
plan; verify the signature before final commit.)

- [ ] **Step 5.4: Visual verification.**

Ask the user to: open CommandPalette, search "Laniakea", select the
entry, verify the camera tweens to the basin centroid. Repeat for one
or two other basins.

- [ ] **Step 5.5: Commit.**

```
git add src/services/engine/engine.ts src/components/CommandPalette/CommandPalette.tsx src/@types/EngineHandle.d.ts
git commit -m "feat(cf4): CommandPalette entries to focus on each basin"
```

---

### Task 6: SettingsPanel "Cosmic Flows" CollapsibleSection

**Files (modify):**

- `src/components/SettingsPanel/SettingsPanel.tsx`

- [ ] **Step 6.1: Wrap the four CF4 controls in a CollapsibleSection.**

Move the rows added in plans 02 + 03 into a new section:

```tsx
<CollapsibleSection title="Cosmic Flows (CF4)" defaultOpen={false}>
  {/* CF4 galaxies toggle (plan 02) */}
  {/* CF4 streamlines toggle (plan 03) */}
  {/* Streamline density slider (plan 03) */}
  {/* Basin colours toggle (plan 04) */}
</CollapsibleSection>
```

The whole section hides if neither `cf4GalaxiesCount` nor
`cf4StreamlineCounts` is non-null (matches the existing
"don't show controls for assets that didn't load" idiom).

- [ ] **Step 6.2: Add the basin-colours toggle.**

```tsx
cf4BasinColoursEnabled?: boolean;
onCf4BasinColoursChange?: (enabled: boolean) => void;
```

```tsx
<label className={styles.row}>
  <input type="checkbox" checked={cf4BasinColoursEnabled}
    onChange={(e) => onCf4BasinColoursChange!(e.target.checked)} />
  <span>Basin colours</span>
</label>
```

- [ ] **Step 6.3: Visual verification + commit.**

```
git add src/components/SettingsPanel/SettingsPanel.tsx src/App.tsx
git commit -m "feat(cf4): unified Cosmic Flows section with basin-colours toggle"
```

---

### Task 7: InfoCard basin name (best-effort)

**Files (modify):**

- `src/components/InfoCard/InfoCard.tsx`

This task depends on the picking pipeline being able to identify a hovered
galaxy as CF4 vs. SDSS/2MRS/GLADE. Plan 02 deliberately did **not** add
CF4 to the picker — phase-1 CF4 dots are decorative-only. This task is
tagged "stretch" and may move to a follow-up plan if CF4 picking turns out
to be non-trivial.

- [ ] **Step 7.1: Decide.**

If `pickRenderer` cannot easily yield "this hover hit CF4", file an issue
and skip Task 7. Otherwise:

- Extend the picker to write CF4 instance ids in a separate id-space.
- In `InfoCard`, when the hover target is CF4, look up the basin name
  via `engineHandle.getCf4BasinCentroids()` and show "Basin: Laniakea"
  in the card.

If skipped, document the deferral in the index file's "Known gaps"
section.

---

## Self-review

- [ ] Basin palette loads at startup; both renderers honour it.
- [ ] CommandPalette has one entry per non-zero basin in the loaded
      palette.
- [ ] All CF4 controls live in a single "Cosmic Flows" CollapsibleSection.
- [ ] `npm run typecheck && npm test` clean.
- [ ] No new `interface` keywords. All didactic comments explain *why*.
- [ ] Visual verification done with the user in the dev-server browser.

After this plan ships: the Tully-style CF4 visualisation is complete.
Galaxies and streamlines colour by basin. The user can focus on any named
attractor with one CommandPalette entry.
