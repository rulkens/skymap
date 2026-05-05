# CF4 sub-plan 02 — Galaxy renderer

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Each implementer subagent must be `run_in_background: true`.

**Goal:** Render the ~56k CF4 distance-measured galaxies as instanced
billboards in monochrome, layered over the existing SDSS+2MRS+GLADE point
cloud. After this plan ships, users see a new "CF4 galaxies" overlay they
can toggle in SettingsPanel; the dots appear at the right SG positions but
are uniformly coloured (basin colours arrive in plan 04).

**Architecture:** A new `Cf4PointRenderer` class — *separate* from the
multi-source `PointRenderer` — owns a single vertex buffer and a single
draw call. We deliberately do NOT extend `Source` enum or reuse
`PointRenderer`'s elaborate visibility-bitmask machinery: CF4 galaxies have
no magnitude, no colour index, no Schechter prior, no thumbnails, and no
picking. A 100-line clone of the simpler bits is cleaner than wedging CF4
into a renderer designed for survey catalogues.

**Tech Stack:** WebGPU + WGSL, TypeScript. No new runtime deps.

**Prerequisites:** plan 01 has shipped. `public/data/cf4_galaxies.bin`
exists and `decodeCf4Galaxies` works.

**Done means:**

- A new SettingsPanel toggle "CF4 galaxies" controls visibility.
- When on, ~56k extra dots render in the correct SG positions.
- Phase 1 colour is uniform (e.g. cyan); plan 04 swaps in basin colours.
- A vitest smoke test instantiates `Cf4PointRenderer`, calls `upload`,
  and verifies internal buffer sizes — same pattern as
  `tests/services/gpu/filamentRenderer.test.ts`.

---

## File structure

### New files

- `src/services/gpu/cf4PointRenderer.ts` — pipeline owner.
- `src/services/gpu/shaders/cf4Galaxies.wgsl` — vs + fs.
- `tests/services/gpu/cf4PointRenderer.test.ts` — smoke test (instance
  count, byte sizes; no real GPU).
- `src/services/engine/loadCf4Galaxies.ts` — small fetch + decode helper
  parallel to `loadFilaments`.
- `tests/services/engine/loadCf4Galaxies.test.ts`

### Modified files

- `src/services/engine/cloudLoader.ts` — does **not** change. Keeps the
  three-survey loader intact. CF4 has its own helper.
- `src/services/engine/engine.ts` — instantiate `Cf4PointRenderer`,
  trigger `loadCf4Galaxies`, expose `setCf4GalaxiesEnabled`.
- `src/services/engine/renderFrame.ts` — accept the new renderer, draw it
  inside the HDR pass after `pointRenderer.draw` and before
  `filamentRenderer.draw`.
- `src/@types/EngineHandle.d.ts` — add optional
  `setCf4GalaxiesEnabled?(enabled: boolean): void`.
- `src/@types/EngineCallbacks.d.ts` — add optional
  `onCf4GalaxiesReady?(count: number): void`.
- `src/components/SettingsPanel/SettingsPanel.tsx` — add a "CF4 galaxies"
  toggle row alongside the existing "Filaments" row.
- `src/App.tsx` — useState + handler wiring.
- `src/data/defaults.ts` — `DEFAULT_CF4_GALAXIES_ENABLED = false`.

---

## Render strategy

Mirrors `filamentRenderer.ts` rather than `pointRenderer.ts`:

```
indexBuffer (static)         : 6 × u16    → two-triangle quad
quadVertexBuffer (static)    : 4 × vec2<f32> → corner UVs
instanceBuffer               : count × 5 × f32 → [sgx,sgy,sgz, distance, basinId]
uniformBuffer                : 80 bytes  → viewProj + viewport + radiusPx + intensity
```

Draw call:

```ts
pass.draw(6, instanceCount, 0, 0);
```

Vertex shader expands the unit quad to a screen-space billboard at the
galaxy's world position. Radius is uniform across all CF4 galaxies (no
per-galaxy magnitude). Fragment shader applies a soft circular alpha mask
and writes premultiplied RGBA into the HDR target.

Phase 1 colour is hard-coded `vec3(0.4, 0.85, 1.0)` (cyan) so the layer
visually distinguishes itself from the warm SDSS/2MRS billboards. Plan 04
replaces this with a per-instance palette lookup keyed by `basinId`.

---

## Tasks

### Task 0: Verify baseline

- [ ] **Step 0.1.** Run `npm run typecheck && npm test`. Expect green and
      include the binaries from plan 01: confirm
      `ls -lh public/data/cf4_galaxies.bin` shows ~1.3 MB.

---

### Task 1: Loader helper

**Files:**

- Create: `src/services/engine/loadCf4Galaxies.ts`
- Create: `tests/services/engine/loadCf4Galaxies.test.ts`

- [ ] **Step 1.1: Failing test.**

```ts
// tests/services/engine/loadCf4Galaxies.test.ts
import { describe, it, expect, vi } from 'vitest';
import { loadCf4Galaxies } from '../../../src/services/engine/loadCf4Galaxies';
import { encodeCf4Galaxies } from '../../../src/data/cf4GalaxiesBinaryFormat';

describe('loadCf4Galaxies', () => {
  it('returns null when the bin is missing (404)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    expect(await loadCf4Galaxies()).toBeNull();
  });

  it('returns the decoded cloud when the fetch succeeds', async () => {
    const buf = encodeCf4Galaxies({
      count: 1,
      positions: new Float32Array([1, 2, 3]),
      distances: new Float32Array([10]),
      basinIds: new Uint32Array([5]),
    });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(buf) });
    const cloud = await loadCf4Galaxies();
    expect(cloud).not.toBeNull();
    expect(cloud!.count).toBe(1);
    expect(cloud!.basinIds[0]).toBe(5);
  });

  it('returns null on decode error', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)) });
    expect(await loadCf4Galaxies()).toBeNull();
  });
});
```

Run: `npm test -- loadCf4Galaxies`. Expect failure.

- [ ] **Step 1.2: Implement.**

```ts
// src/services/engine/loadCf4Galaxies.ts
/**
 * loadCf4Galaxies — fetch + decode the optional `cf4_galaxies.bin`.
 *
 * Why a dedicated loader rather than extending `cloudLoader.ts`? CF4 is
 * not a Source enum entry — it's a parallel layer. Same shape as
 * `loadFilaments` (single optional asset, swallow 404 + decode errors,
 * return null on failure so the engine keeps the rest of the scene
 * rendering).
 */
import type { Cf4Cloud } from '../../@types/Cf4Cloud';
import { decodeCf4Galaxies } from '../../data/cf4GalaxiesBinaryFormat';

const URL = '/data/cf4_galaxies.bin';

export async function loadCf4Galaxies(): Promise<Cf4Cloud | null> {
  try {
    const res = await fetch(URL);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return decodeCf4Galaxies(buf);
  } catch (err) {
    console.warn('loadCf4Galaxies: failed', err);
    return null;
  }
}
```

Run: `npm test -- loadCf4Galaxies`. Expect green.

- [ ] **Step 1.3: Commit.**

```
git add src/services/engine/loadCf4Galaxies.ts tests/services/engine/loadCf4Galaxies.test.ts
git commit -m "feat(cf4): loader helper for cf4_galaxies.bin"
```

---

### Task 2: WGSL shader

**Files:**

- Create: `src/services/gpu/shaders/cf4Galaxies.wgsl`

- [ ] **Step 2.1: Write the shader.**

```wgsl
// cf4Galaxies.wgsl — instanced billboard shader for CF4 distance-measured
// galaxies.
//
// One instance per galaxy. Six vertices per instance (two-triangle quad).
// The vertex stage expands a unit-square corner UV into a screen-aligned
// quad of world-space radius `radiusPx` (in pixels, projected back into
// world space via 1/viewport).
//
// Why not reuse points.wgsl? points.wgsl carries Schechter-magnitude
// brightness, per-instance colour-index lookup, pick-buffer writes, and
// kPerZ scaling. CF4 has none of those. A 60-line bespoke shader is
// dramatically easier to reason about than wedging "ignore these
// attributes" branches into the survey shader.

struct Uniforms {
  viewProj    : mat4x4<f32>,
  viewport    : vec2<f32>,    // physical pixels [w, h]
  radiusPx    : f32,          // billboard radius in pixels
  intensity   : f32,          // [0..1] dimmer; 1.0 = full brightness
};
@group(0) @binding(0) var<uniform> u : Uniforms;

struct PerInstance {
  @location(0) pos : vec3<f32>,    // SG cartesian, Mpc
  @location(1) distance : f32,     // D_Mpc (unused phase 1; reserved)
  @location(2) basinId : f32,      // 0..N (unused phase 1)
};

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv : vec2<f32>,
  @location(1) basinId : f32,
};

const QUAD_UV = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>(-1.0,  1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0,  1.0),
);

@vertex
fn vs(@builtin(vertex_index) vid : u32, in : PerInstance) -> VSOut {
  let centerClip = u.viewProj * vec4<f32>(in.pos, 1.0);
  let uv = QUAD_UV[vid];
  // Pixel-radius offset → NDC offset → clip-space offset (multiply by w
  // for perspective-correct interpolation).
  let pxToNdc = (u.radiusPx * 2.0) / u.viewport;
  let offsetClip = vec2<f32>(uv.x * pxToNdc.x, uv.y * pxToNdc.y) * centerClip.w;
  var out : VSOut;
  out.clip = vec4<f32>(centerClip.xy + offsetClip, centerClip.zw);
  out.uv = uv;
  out.basinId = in.basinId;
  return out;
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  // Soft circular mask: r=1 at corner, r=0 at center; alpha falls off.
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.0) { discard; }
  let alpha = (1.0 - r2) * u.intensity;
  // Phase 1: uniform cyan. Plan 04 will replace with palette lookup
  // keyed by basinId via a second uniform buffer.
  let rgb = vec3<f32>(0.4, 0.85, 1.0);
  return vec4<f32>(rgb * alpha, alpha);
}
```

- [ ] **Step 2.2: Commit shader.**

```
git add src/services/gpu/shaders/cf4Galaxies.wgsl
git commit -m "feat(cf4): WGSL billboard shader for CF4 galaxies (monochrome)"
```

---

### Task 3: Renderer class with smoke test

**Files:**

- Create: `src/services/gpu/cf4PointRenderer.ts`
- Create: `tests/services/gpu/cf4PointRenderer.test.ts`

- [ ] **Step 3.1: Failing smoke test.**

The pattern follows `tests/services/gpu/filamentRenderer.test.ts`: build a
fake device that records buffer creations, exercise `upload`, assert
buffer sizes.

```ts
// tests/services/gpu/cf4PointRenderer.test.ts
import { describe, it, expect } from 'vitest';
import { Cf4PointRenderer, FLOATS_PER_INSTANCE } from '../../../src/services/gpu/cf4PointRenderer';
import type { Cf4Cloud } from '../../../src/@types/Cf4Cloud';

function makeFakeDevice() {
  const created: { kind: string; size: number }[] = [];
  return {
    created,
    device: {
      createShaderModule: () => ({}),
      createBindGroupLayout: () => ({}),
      createPipelineLayout: () => ({}),
      createRenderPipeline: () => ({}),
      createBuffer: ({ size, label }: { size: number; label?: string }) => {
        created.push({ kind: label ?? '', size });
        return { destroy: () => {} };
      },
      createBindGroup: () => ({}),
      queue: { writeBuffer: () => {} },
    } as unknown as GPUDevice,
  };
}

describe('Cf4PointRenderer', () => {
  it('upload sizes the instance buffer to count × FLOATS_PER_INSTANCE × 4', () => {
    const { device, created } = makeFakeDevice();
    const r = new Cf4PointRenderer(device, 'rgba16float');
    const cloud: Cf4Cloud = {
      count: 100,
      positions: new Float32Array(300),
      distances: new Float32Array(100),
      basinIds: new Uint32Array(100),
    };
    r.upload(cloud);
    const inst = created.find((c) => c.kind === 'cf4-instance');
    expect(inst).toBeDefined();
    expect(inst!.size).toBe(100 * FLOATS_PER_INSTANCE * 4);
  });

  it('FLOATS_PER_INSTANCE is 5 (xyz + distance + basinId)', () => {
    expect(FLOATS_PER_INSTANCE).toBe(5);
  });

  it('clear() drops the instance buffer; subsequent draw is a no-op', () => {
    const { device } = makeFakeDevice();
    const r = new Cf4PointRenderer(device, 'rgba16float');
    r.clear();
    // Should not throw without an instance buffer.
    const fakePass = { setPipeline: () => {}, setBindGroup: () => {}, setVertexBuffer: () => {}, setIndexBuffer: () => {}, draw: () => {} };
    r.draw(fakePass as unknown as GPURenderPassEncoder, new Float32Array(16), [800, 600], 1.0);
  });
});
```

Run: `npm test -- cf4PointRenderer`. Expect failure.

- [ ] **Step 3.2: Implement.**

```ts
// src/services/gpu/cf4PointRenderer.ts
/**
 * Cf4PointRenderer — instanced-billboard renderer for the CF4 catalog.
 *
 * Why not extend `PointRenderer`? PointRenderer carries a multi-source
 * visibility bitmask, per-source uniform offsets for the picker, the
 * Schechter-bias prior, the colour-index lookup, etc. CF4 doesn't need
 * any of that. Cloning the simpler bits keeps each renderer's mental
 * model small. See plan 02 architecture notes.
 *
 * Layout (mirrors filamentRenderer.ts):
 *   indexBuffer         6 × u16
 *   quadVertexBuffer    4 × vec2<f32>  (unused — vid drives QUAD_UV)
 *   instanceBuffer      count × 5 × f32  [x,y,z, distance, basinId]
 *   uniformBuffer       80 B  (viewProj + viewport + radiusPx + intensity)
 */
import shaderSource from './shaders/cf4Galaxies.wgsl?raw';
import type { Cf4Cloud } from '../../@types/Cf4Cloud';
import type { mat4 } from 'gl-matrix';

export const FLOATS_PER_INSTANCE = 5;
const UNIFORM_BYTES = 80;

export class Cf4PointRenderer {
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly uniformBuffer: GPUBuffer;
  private instanceBuffer: GPUBuffer | null = null;
  private instanceCount = 0;

  constructor(private readonly device: GPUDevice, hdrFormat: GPUTextureFormat) {
    const module = device.createShaderModule({ code: shaderSource });
    const bgl = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });
    this.uniformBuffer = device.createBuffer({
      label: 'cf4-uniform',
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: bgl,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: FLOATS_PER_INSTANCE * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0,  format: 'float32x3' }, // pos
              { shaderLocation: 1, offset: 12, format: 'float32'   }, // distance
              { shaderLocation: 2, offset: 16, format: 'float32'   }, // basinId
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format: hdrFormat,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  upload(cloud: Cf4Cloud): void {
    this.instanceBuffer?.destroy();
    if (cloud.count === 0) {
      this.instanceBuffer = null;
      this.instanceCount = 0;
      return;
    }
    const data = new Float32Array(cloud.count * FLOATS_PER_INSTANCE);
    for (let i = 0; i < cloud.count; i++) {
      const o = i * FLOATS_PER_INSTANCE;
      data[o + 0] = cloud.positions[i * 3 + 0]!;
      data[o + 1] = cloud.positions[i * 3 + 1]!;
      data[o + 2] = cloud.positions[i * 3 + 2]!;
      data[o + 3] = cloud.distances[i]!;
      data[o + 4] = cloud.basinIds[i]!;
    }
    this.instanceBuffer = this.device.createBuffer({
      label: 'cf4-instance',
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.instanceBuffer, 0, data);
    this.instanceCount = cloud.count;
  }

  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array | mat4,
    viewportPx: [number, number],
    radiusPx: number,
    intensity = 1.0,
  ): void {
    if (!this.instanceBuffer || this.instanceCount === 0) return;
    const u = new Float32Array(20);
    u.set(viewProj as Float32Array, 0);
    u[16] = viewportPx[0];
    u[17] = viewportPx[1];
    u[18] = radiusPx;
    u[19] = intensity;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, u);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.instanceBuffer);
    pass.draw(6, this.instanceCount, 0, 0);
  }

  clear(): void {
    this.instanceBuffer?.destroy();
    this.instanceBuffer = null;
    this.instanceCount = 0;
  }

  destroy(): void {
    this.clear();
    this.uniformBuffer.destroy();
  }
}
```

Run: `npm test -- cf4PointRenderer`. Expect green.

- [ ] **Step 3.3: Commit.**

```
git add src/services/gpu/cf4PointRenderer.ts tests/services/gpu/cf4PointRenderer.test.ts
git commit -m "feat(cf4): Cf4PointRenderer pipeline + instance buffer upload"
```

---

### Task 4: Engine integration

**Files (modify):**

- `src/@types/EngineHandle.d.ts`
- `src/@types/EngineCallbacks.d.ts`
- `src/services/engine/engine.ts`
- `src/services/engine/renderFrame.ts`
- `src/data/defaults.ts`

- [ ] **Step 4.1: Add the toggle to defaults + types.**

In `src/data/defaults.ts`:

```ts
/**
 * CF4 galaxy overlay default. OFF on first load — the asset is optional
 * (matches the Filaments rationale: a fresh clone won't have
 * cf4_galaxies.bin until `npm run build-cf4` runs).
 */
export const DEFAULT_CF4_GALAXIES_ENABLED = false;
```

Add to `EngineHandle.d.ts`:

```ts
setCf4GalaxiesEnabled?: (enabled: boolean) => void;
```

Add to `EngineCallbacks.d.ts`:

```ts
/**
 * One-shot callback fired after `cf4_galaxies.bin` decodes. Used by App.tsx
 * to gate the SettingsPanel toggle visibility (we hide the row entirely
 * if the asset isn't on disk — same idiom as Filaments).
 */
onCf4GalaxiesReady?: (count: number) => void;
```

- [ ] **Step 4.2: Wire engine + renderFrame.**

In `engine.ts`, mirror the `FilamentRenderer` lifecycle:

```ts
// Inside engine init, alongside filamentRenderer setup:
const cf4PointRenderer = new Cf4PointRenderer(device, 'rgba16float');
state.gpu.cf4PointRenderer = cf4PointRenderer;
loadCf4Galaxies().then((cloud) => {
  if (!cloud) return;
  cf4PointRenderer.upload(cloud);
  cb.onCf4GalaxiesReady?.(cloud.count);
});
```

Add `cf4GalaxiesEnabled: boolean` to the per-frame settings struct (default
from `DEFAULT_CF4_GALAXIES_ENABLED`); add the setter:

```ts
setCf4GalaxiesEnabled(enabled: boolean) {
  state.settings.cf4GalaxiesEnabled = enabled;
  scheduler.requestRender();
}
```

In `renderFrame.ts`, in the HDR pass after the survey-points draw and
before the filaments draw:

```ts
if (settings.cf4GalaxiesEnabled && cf4PointRenderer) {
  cf4PointRenderer.draw(pass, viewProj, [viewportW, viewportH], CF4_RADIUS_PX);
}
```

`CF4_RADIUS_PX = 2.5` is a reasonable phase-1 default (visually distinct
without dominating). Add it as a top-of-file constant with a comment
explaining the choice and that plan 04 may make it user-configurable.

- [ ] **Step 4.3: Add the renderer destroy call.**

```ts
state.gpu.cf4PointRenderer?.destroy();
```

next to the existing `filamentRenderer.destroy()`.

- [ ] **Step 4.4: Run typecheck + smoke.**

```
npm run typecheck && npm test
```

All previous tests stay green; the new tests stay green.

- [ ] **Step 4.5: Commit.**

```
git add src/data/defaults.ts src/@types/EngineHandle.d.ts src/@types/EngineCallbacks.d.ts src/services/engine/engine.ts src/services/engine/renderFrame.ts
git commit -m "feat(cf4): wire Cf4PointRenderer into the per-frame loop"
```

---

### Task 5: SettingsPanel toggle

**Files (modify):**

- `src/components/SettingsPanel/SettingsPanel.tsx`
- `src/App.tsx`

- [ ] **Step 5.1: Add SettingsPanel props and the row.**

Following the existing Filaments pattern (optional opt-in pair):

```tsx
cf4GalaxiesEnabled?: boolean;
onCf4GalaxiesChange?: (enabled: boolean) => void;
```

In the JSX, in the same section as the Filaments toggle, add:

```tsx
{showCf4GalaxiesToggle && (
  <label className={styles.row}>
    <input
      type="checkbox"
      checked={cf4GalaxiesEnabled}
      onChange={(e) => onCf4GalaxiesChange!(e.target.checked)}
    />
    <span>CF4 galaxies</span>
  </label>
)}
```

with the matching `showCf4GalaxiesToggle = cf4GalaxiesEnabled !== undefined && onCf4GalaxiesChange !== undefined && cf4GalaxiesCount !== null`
guard. Pass `cf4GalaxiesCount` from App.tsx state set by `onCf4GalaxiesReady`.

- [ ] **Step 5.2: App.tsx state + handler.**

```tsx
const [cf4GalaxiesEnabled, setCf4GalaxiesEnabled] =
  useState<boolean>(DEFAULT_CF4_GALAXIES_ENABLED);
const [cf4GalaxiesCount, setCf4GalaxiesCount] = useState<number | null>(null);

// in EngineCallbacks:
onCf4GalaxiesReady: (count) => setCf4GalaxiesCount(count),

// in SettingsPanel props:
cf4GalaxiesEnabled={cf4GalaxiesEnabled}
onCf4GalaxiesChange={(e) => {
  setCf4GalaxiesEnabled(e);
  handleRef.current?.setCf4GalaxiesEnabled?.(e);
}}
```

- [ ] **Step 5.3: Visual verification.**

Dev server is already running. Ask the user to: open the app, find the
"CF4 galaxies" toggle in SettingsPanel, click it, verify a new layer of
cyan dots appears that wasn't there before. The dots should cluster around
the local-universe SG plane (the CF4 footprint is a 1000-Mpc cube
centered on the Local Group).

- [ ] **Step 5.4: Commit.**

```
git add src/components/SettingsPanel/SettingsPanel.tsx src/App.tsx
git commit -m "feat(cf4): SettingsPanel toggle for CF4 galaxy overlay"
```

---

## Self-review

- [ ] `npm run typecheck && npm test` clean.
- [ ] `Cf4PointRenderer` smoke test asserts `FLOATS_PER_INSTANCE === 5`.
- [ ] `loadCf4Galaxies` returns `null` on 404 / decode error and logs but
      does not throw.
- [ ] `setCf4GalaxiesEnabled` calls `scheduler.requestRender()` so toggling
      under render-on-demand actually re-draws.
- [ ] SettingsPanel hides the row when `cf4GalaxiesCount === null`.
- [ ] No `interface` keyword introduced.
- [ ] All didactic comments explain *why*.

After this plan ships: ~56k extra cyan dots are visible on toggle. Plan
03 adds streamlines on top; plan 04 swaps in basin colours.
