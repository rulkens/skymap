# CF4 sub-plan 03 — Streamline renderer

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Each implementer subagent must be `run_in_background: true`.

**Goal:** Render the laniakea-derived RK4 streamlines as polylines layered
into the HDR pass. After this plan ships, users get a "CF4 streamlines"
toggle that shows ~30k flow-field trajectories in monochrome (basin
colours arrive in plan 04). A density slider truncates the visible strip
count for performance / aesthetic tuning.

**Architecture:** A new `Cf4StreamlineRenderer` based heavily on
`filamentRenderer.ts` (instanced-quad thick lines). The two formats are
near-identical — strip-offset table + flat vertex array — so we crib the
build-segment-instances logic verbatim and adapt the per-vertex slot
(filament density → CF4 basin id, both f32). We do NOT reuse
`FilamentRenderer` directly because its uniform layout, shader, and
instance-attribute names are bound to the cosmic-web overlay; cloning is
faster than parameterising.

**Tech Stack:** WebGPU + WGSL, TypeScript.

**Prerequisites:** plan 01 has shipped. `public/data/cf4_streamlines.bin`
exists. Plan 02 may or may not have shipped — this plan is independent of
the galaxy renderer.

**Done means:**

- A new SettingsPanel toggle "CF4 streamlines" controls visibility.
- A density slider (0..1) controls how many strips draw.
- Smoke test verifies segment-instance buffer sizing.

---

## File structure

### New files

- `src/services/gpu/cf4StreamlineRenderer.ts` — pipeline owner.
- `src/services/gpu/shaders/cf4Streamlines.wgsl` — vs + fs.
- `src/services/engine/loadCf4Streamlines.ts` — fetch + decode helper.
- `tests/services/gpu/cf4StreamlineRenderer.test.ts` — smoke +
  build-segment-instances.
- `tests/services/engine/loadCf4Streamlines.test.ts`

### Modified files

- `src/services/engine/engine.ts` — instantiate renderer, load asset,
  expose `setCf4StreamlinesEnabled` + `setCf4StreamlineDensity`.
- `src/services/engine/renderFrame.ts` — accept renderer; draw inside
  HDR pass after CF4 galaxies, before filaments.
- `src/@types/EngineHandle.d.ts` — add the two setters.
- `src/@types/EngineCallbacks.d.ts` — add `onCf4StreamlinesReady`.
- `src/components/SettingsPanel/SettingsPanel.tsx` — toggle + slider.
- `src/App.tsx` — state + handler wiring.
- `src/data/defaults.ts` — `DEFAULT_CF4_STREAMLINES_ENABLED = false`,
  `DEFAULT_CF4_STREAMLINE_DENSITY = 1.0`.

---

## Render strategy

Identical instanced-quad-line technique as `filamentRenderer.ts`. One
instance per **segment** (consecutive vertex pair within a strip). Per-
instance attributes:

```
startPos      vec3<f32>
startBasinId  f32
endPos        vec3<f32>
endBasinId    f32
```

Six vertices per instance form a screen-aligned thick rectangle between
the two endpoints. Native `topology: 'line-strip'` would be cleaner, but
WebGPU lines are 1-pixel-wide on most platforms — exactly the bug
documented at length in `filaments.wgsl`. Cribbing the proven instanced-
quad path gives us anti-aliased thick lines on day one.

The density slider truncates the **drawn strip count**:

```ts
const drawnStrips = Math.floor(stripCount * density);
const drawnSegments = sumSegmentsUpTo(drawnStrips);
pass.draw(6, drawnSegments, 0, 0);
```

The instance buffer is laid out so that strip *i*'s segments are
contiguous and strips are stored in their natural CSV order. Slider
adjustments cost nothing on the GPU — no buffer re-upload, just a draw-
count change. We pre-compute a `segmentsBeforeStrip: Uint32Array` lookup
table at upload time so the slider→segment-count mapping is O(1).

---

## Tasks

### Task 0: Verify baseline

- [ ] **Step 0.1.** `npm run typecheck && npm test` clean. Confirm
  `public/data/cf4_streamlines.bin` exists (~36 MB).

---

### Task 1: Loader helper

**Files:**

- Create: `src/services/engine/loadCf4Streamlines.ts`
- Create: `tests/services/engine/loadCf4Streamlines.test.ts`

- [ ] **Step 1.1: Failing test.**

```ts
// tests/services/engine/loadCf4Streamlines.test.ts
import { describe, it, expect, vi } from 'vitest';
import { loadCf4Streamlines } from '../../../src/services/engine/loadCf4Streamlines';
import { encodeCf4Streamlines } from '../../../src/data/cf4StreamlinesBinaryFormat';

describe('loadCf4Streamlines', () => {
  it('returns null on 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    expect(await loadCf4Streamlines()).toBeNull();
  });

  it('returns the decoded cloud on success', async () => {
    const buf = encodeCf4Streamlines({
      stripCount: 1,
      vertexCount: 2,
      stripOffsets: new Uint32Array([0, 2]),
      vertices: new Float32Array([0, 0, 0, 1, 1, 1, 1, 1]),
    });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(buf) });
    const cloud = await loadCf4Streamlines();
    expect(cloud).not.toBeNull();
    expect(cloud!.stripCount).toBe(1);
    expect(cloud!.vertexCount).toBe(2);
  });
});
```

Run: `npm test -- loadCf4Streamlines`. Expect failure.

- [ ] **Step 1.2: Implement.**

```ts
// src/services/engine/loadCf4Streamlines.ts
/**
 * loadCf4Streamlines — fetch + decode the optional `cf4_streamlines.bin`.
 *
 * Same opt-in shape as `loadFilaments` and `loadCf4Galaxies`:
 * a 404 or decode error resolves to null, never throws. The caller (the
 * engine) treats null as "skip this layer entirely".
 */
import type { Cf4StreamlineCloud } from '../../@types/Cf4StreamlineCloud';
import { decodeCf4Streamlines } from '../../data/cf4StreamlinesBinaryFormat';

const URL = '/data/cf4_streamlines.bin';

export async function loadCf4Streamlines(): Promise<Cf4StreamlineCloud | null> {
  try {
    const res = await fetch(URL);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return decodeCf4Streamlines(buf);
  } catch (err) {
    console.warn('loadCf4Streamlines: failed', err);
    return null;
  }
}
```

Run + commit:

```
npm test -- loadCf4Streamlines
git add src/services/engine/loadCf4Streamlines.ts tests/services/engine/loadCf4Streamlines.test.ts
git commit -m "feat(cf4): loader helper for cf4_streamlines.bin"
```

---

### Task 2: Pure-function buildSegmentInstances helper + segmentsBeforeStrip lookup

**Files:**

- Modified within: `src/services/gpu/cf4StreamlineRenderer.ts` (next task)
- Tests are co-located in `tests/services/gpu/cf4StreamlineRenderer.test.ts`

- [ ] **Step 2.1: Test the pure function in isolation.**

```ts
// tests/services/gpu/cf4StreamlineRenderer.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildCf4SegmentInstances,
  FLOATS_PER_SEGMENT,
} from '../../../src/services/gpu/cf4StreamlineRenderer';
import type { Cf4StreamlineCloud } from '../../../src/@types/Cf4StreamlineCloud';

describe('buildCf4SegmentInstances', () => {
  it('produces (totalVerts - stripCount) segments and a strip-prefix table', () => {
    const cloud: Cf4StreamlineCloud = {
      stripCount: 2,
      vertexCount: 5,
      stripOffsets: new Uint32Array([0, 3, 5]),
      vertices: new Float32Array([
        0, 0, 0, 1,
        1, 1, 1, 1,
        2, 2, 2, 1,
        10, 10, 10, 2,
        11, 11, 11, 2,
      ]),
    };
    const out = buildCf4SegmentInstances(cloud);
    expect(out.segmentCount).toBe(3); // (3-1) + (2-1)
    expect(out.data.length).toBe(3 * FLOATS_PER_SEGMENT);
    // first segment endpoints
    expect(Array.from(out.data.slice(0, 4))).toEqual([0, 0, 0, 1]);
    expect(Array.from(out.data.slice(4, 8))).toEqual([1, 1, 1, 1]);
    // strip-prefix table: cumulative segments before each strip
    expect(Array.from(out.segmentsBeforeStrip)).toEqual([0, 2, 3]);
  });

  it('emits zero segments for an empty cloud', () => {
    const cloud: Cf4StreamlineCloud = {
      stripCount: 0,
      vertexCount: 0,
      stripOffsets: new Uint32Array([0]),
      vertices: new Float32Array(0),
    };
    const out = buildCf4SegmentInstances(cloud);
    expect(out.segmentCount).toBe(0);
    expect(out.data.length).toBe(0);
  });
});
```

(Class smoke test added in Task 3.) Run: `npm test -- cf4StreamlineRenderer`.
Expect failure.

---

### Task 3: WGSL shader + renderer class

**Files:**

- Create: `src/services/gpu/shaders/cf4Streamlines.wgsl`
- Create: `src/services/gpu/cf4StreamlineRenderer.ts`

- [ ] **Step 3.1: Write the shader.**

Mirror `filaments.wgsl`'s instanced-quad-line vertex pipeline; the only
difference is the per-endpoint scalar (basinId not density) and the
uniform layout:

```wgsl
// cf4Streamlines.wgsl — instanced-quad thick-line shader for CF4 flow.
//
// One instance per segment. uv.x picks start vs end endpoint, uv.y picks
// +halfWidth vs -halfWidth in screen space. See filaments.wgsl for the
// full rationale on why we don't use native line topology.

struct Uniforms {
  viewProj : mat4x4<f32>,
  viewport : vec2<f32>,
  halfWidthPx : f32,
  intensity : f32,
};
@group(0) @binding(0) var<uniform> u : Uniforms;

struct PerVertex {
  @location(0) uv : vec2<f32>,
  @location(1) startPos : vec3<f32>,
  @location(2) startBasinId : f32,
  @location(3) endPos : vec3<f32>,
  @location(4) endBasinId : f32,
};

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) basinId : f32,
};

@vertex
fn vs(in : PerVertex) -> VSOut {
  let aClip = u.viewProj * vec4<f32>(in.startPos, 1.0);
  let bClip = u.viewProj * vec4<f32>(in.endPos, 1.0);
  let endpoint = select(aClip, bClip, in.uv.x > 0.5);
  let aNdc = aClip.xy / aClip.w;
  let bNdc = bClip.xy / bClip.w;
  let tangent = normalize(bNdc - aNdc);
  let perp = vec2<f32>(-tangent.y, tangent.x);
  let halfWidthNdc = perp * (u.halfWidthPx / (u.viewport * 0.5));
  let sideSign = in.uv.y * 2.0 - 1.0;
  let offsetNdc = halfWidthNdc * sideSign;
  var out : VSOut;
  out.clip = vec4<f32>(endpoint.xy + offsetNdc * endpoint.w, endpoint.zw);
  out.basinId = select(in.startBasinId, in.endBasinId, in.uv.x > 0.5);
  return out;
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  // Phase 1: monochrome amber/gold so streamlines distinguish from the
  // cyan CF4 galaxy dots and the amber filaments.
  let rgb = vec3<f32>(1.0, 0.7, 0.3);
  let alpha = 0.5 * u.intensity;
  return vec4<f32>(rgb * alpha, alpha);
}
```

- [ ] **Step 3.2: Implement the renderer class.**

```ts
// src/services/gpu/cf4StreamlineRenderer.ts
/**
 * Cf4StreamlineRenderer — instanced-quad thick-line renderer for the
 * laniakea-derived CF4 flow streamlines.
 *
 * Why a clone of filamentRenderer.ts rather than parameterising it?
 * The two renderers share the *technique* (one quad-instance per
 * polyline segment, uniform half-width, additive HDR) but diverge in
 * their per-vertex scalar (density vs basinId), uniform names, shader
 * source, and per-frame draw-count semantics (filaments draw all
 * strips; CF4 has a density slider). A 200-line clone is dramatically
 * easier to reason about than a 350-line "parameterised" abstraction.
 */
import shaderSource from './shaders/cf4Streamlines.wgsl?raw';
import type { Cf4StreamlineCloud } from '../../@types/Cf4StreamlineCloud';
import type { mat4 } from 'gl-matrix';

export const FLOATS_PER_SEGMENT = 8; // start xyz+basin + end xyz+basin
const UNIFORM_BYTES = 80;

/**
 * Produce a flat per-segment array from a `Cf4StreamlineCloud` plus a
 * cumulative-segment-count lookup table. Public so tests can exercise
 * the layout without instantiating a GPU pipeline.
 *
 * `segmentsBeforeStrip[i]` is the count of segments contributed by
 * strips 0..i-1 — which, after multiplying by 6 vertices/segment, is
 * exactly the right `instanceCount` argument to draw all strips
 * 0..i-1. The density slider uses this table to truncate cleanly.
 */
export function buildCf4SegmentInstances(cloud: Cf4StreamlineCloud): {
  segmentCount: number;
  data: Float32Array;
  segmentsBeforeStrip: Uint32Array;
} {
  const segmentsBeforeStrip = new Uint32Array(cloud.stripCount + 1);
  if (cloud.stripCount === 0) {
    return { segmentCount: 0, data: new Float32Array(0), segmentsBeforeStrip };
  }
  // Total segments = totalVerts - stripCount.
  const segmentCount = cloud.vertexCount - cloud.stripCount;
  const data = new Float32Array(segmentCount * FLOATS_PER_SEGMENT);
  let outIdx = 0;
  for (let s = 0; s < cloud.stripCount; s++) {
    segmentsBeforeStrip[s] = outIdx / FLOATS_PER_SEGMENT;
    const lo = cloud.stripOffsets[s]!;
    const hi = cloud.stripOffsets[s + 1]!;
    for (let v = lo; v < hi - 1; v++) {
      const a = v * 4;
      const b = (v + 1) * 4;
      data[outIdx + 0] = cloud.vertices[a + 0]!;
      data[outIdx + 1] = cloud.vertices[a + 1]!;
      data[outIdx + 2] = cloud.vertices[a + 2]!;
      data[outIdx + 3] = cloud.vertices[a + 3]!;
      data[outIdx + 4] = cloud.vertices[b + 0]!;
      data[outIdx + 5] = cloud.vertices[b + 1]!;
      data[outIdx + 6] = cloud.vertices[b + 2]!;
      data[outIdx + 7] = cloud.vertices[b + 3]!;
      outIdx += FLOATS_PER_SEGMENT;
    }
  }
  segmentsBeforeStrip[cloud.stripCount] = outIdx / FLOATS_PER_SEGMENT;
  return { segmentCount, data, segmentsBeforeStrip };
}

export class Cf4StreamlineRenderer {
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly uniformBuffer: GPUBuffer;
  private readonly indexBuffer: GPUBuffer;
  private readonly quadVertexBuffer: GPUBuffer;
  private instanceBuffer: GPUBuffer | null = null;
  private segmentCount = 0;
  private stripCount = 0;
  private segmentsBeforeStrip: Uint32Array | null = null;

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
      label: 'cf4-stream-uniform',
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: bgl,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    // 4-vertex unit quad UV (matches filamentRenderer ordering).
    const QUAD_UV = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    this.quadVertexBuffer = device.createBuffer({
      label: 'cf4-stream-quad',
      size: QUAD_UV.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.quadVertexBuffer, 0, QUAD_UV);

    const QUAD_IDX = new Uint16Array([0, 1, 2, 1, 3, 2]);
    this.indexBuffer = device.createBuffer({
      label: 'cf4-stream-idx',
      size: QUAD_IDX.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.indexBuffer, 0, QUAD_IDX);

    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          { // slot 0: per-vertex unit quad uv
            arrayStride: 8,
            stepMode: 'vertex',
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
          },
          { // slot 1: per-instance segment endpoints
            arrayStride: FLOATS_PER_SEGMENT * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0,  format: 'float32x3' }, // startPos
              { shaderLocation: 2, offset: 12, format: 'float32'   }, // startBasinId
              { shaderLocation: 3, offset: 16, format: 'float32x3' }, // endPos
              { shaderLocation: 4, offset: 28, format: 'float32'   }, // endBasinId
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

  upload(cloud: Cf4StreamlineCloud): void {
    this.instanceBuffer?.destroy();
    const built = buildCf4SegmentInstances(cloud);
    this.segmentCount = built.segmentCount;
    this.stripCount = cloud.stripCount;
    this.segmentsBeforeStrip = built.segmentsBeforeStrip;
    if (built.segmentCount === 0) {
      this.instanceBuffer = null;
      return;
    }
    this.instanceBuffer = this.device.createBuffer({
      label: 'cf4-stream-instance',
      size: built.data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.instanceBuffer, 0, built.data);
  }

  /**
   * @param density  0..1 — fraction of strips to draw. Maps to a slice
   *                 of the contiguous segment-instance buffer via the
   *                 segmentsBeforeStrip lookup. 1.0 draws everything.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array | mat4,
    viewportPx: [number, number],
    halfWidthPx: number,
    intensity = 1.0,
    density = 1.0,
  ): void {
    if (!this.instanceBuffer || this.segmentCount === 0 || !this.segmentsBeforeStrip) return;
    const u = new Float32Array(20);
    u.set(viewProj as Float32Array, 0);
    u[16] = viewportPx[0];
    u[17] = viewportPx[1];
    u[18] = halfWidthPx;
    u[19] = intensity;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, u);

    const clamped = Math.max(0, Math.min(1, density));
    const drawnStrips = Math.floor(this.stripCount * clamped);
    const drawnSegments =
      drawnStrips >= this.stripCount
        ? this.segmentCount
        : this.segmentsBeforeStrip[drawnStrips]!;
    if (drawnSegments === 0) return;

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.quadVertexBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint16');
    pass.drawIndexed(6, drawnSegments, 0, 0, 0);
  }

  clear(): void {
    this.instanceBuffer?.destroy();
    this.instanceBuffer = null;
    this.segmentCount = 0;
    this.stripCount = 0;
    this.segmentsBeforeStrip = null;
  }

  destroy(): void {
    this.clear();
    this.uniformBuffer.destroy();
    this.indexBuffer.destroy();
    this.quadVertexBuffer.destroy();
  }
}
```

- [ ] **Step 3.3: Run all the streamline tests.**

`npm test -- cf4StreamlineRenderer`. The pure-function tests from Task 2.1
should now pass. Add a smoke test for the class:

```ts
// append to tests/services/gpu/cf4StreamlineRenderer.test.ts
import { Cf4StreamlineRenderer } from '../../../src/services/gpu/cf4StreamlineRenderer';

describe('Cf4StreamlineRenderer (smoke)', () => {
  it('upload sizes the instance buffer to segmentCount × FLOATS_PER_SEGMENT × 4', () => {
    const created: { kind: string; size: number }[] = [];
    const fakeDevice = {
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
    } as unknown as GPUDevice;
    const r = new Cf4StreamlineRenderer(fakeDevice, 'rgba16float');
    r.upload({
      stripCount: 1,
      vertexCount: 3,
      stripOffsets: new Uint32Array([0, 3]),
      vertices: new Float32Array([0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 1]),
    });
    const inst = created.find((c) => c.kind === 'cf4-stream-instance');
    expect(inst).toBeDefined();
    expect(inst!.size).toBe(2 * FLOATS_PER_SEGMENT * 4); // (3 verts - 1 strip) = 2 segs
  });
});
```

Run again, expect green. Commit:

```
git add src/services/gpu/cf4StreamlineRenderer.ts src/services/gpu/shaders/cf4Streamlines.wgsl tests/services/gpu/cf4StreamlineRenderer.test.ts
git commit -m "feat(cf4): Cf4StreamlineRenderer with density-truncated draw"
```

---

### Task 4: Engine + renderFrame integration

**Files (modify):**

- `src/data/defaults.ts`
- `src/@types/EngineHandle.d.ts`
- `src/@types/EngineCallbacks.d.ts`
- `src/services/engine/engine.ts`
- `src/services/engine/renderFrame.ts`

- [ ] **Step 4.1: Defaults + type additions.**

```ts
// src/data/defaults.ts
export const DEFAULT_CF4_STREAMLINES_ENABLED = false;
/**
 * CF4 streamline density. 1.0 draws all ~30k strips; lower values trim
 * the tail of the strip-index list. The slider doesn't re-upload — it
 * just changes the draw count, so it's safe to scrub continuously.
 */
export const DEFAULT_CF4_STREAMLINE_DENSITY = 1.0;
/** Half-width in pixels for the instanced-quad lines. */
export const DEFAULT_CF4_STREAMLINE_HALF_WIDTH_PX = 1.0;
```

`EngineHandle.d.ts`:

```ts
setCf4StreamlinesEnabled?: (enabled: boolean) => void;
setCf4StreamlineDensity?: (density: number) => void;
```

`EngineCallbacks.d.ts`:

```ts
onCf4StreamlinesReady?: (stripCount: number, vertexCount: number) => void;
```

- [ ] **Step 4.2: Engine instantiation + lifecycle.**

In `engine.ts`, mirror filaments:

```ts
const cf4StreamlineRenderer = new Cf4StreamlineRenderer(device, 'rgba16float');
state.gpu.cf4StreamlineRenderer = cf4StreamlineRenderer;
loadCf4Streamlines().then((cloud) => {
  if (!cloud) return;
  cf4StreamlineRenderer.upload(cloud);
  cb.onCf4StreamlinesReady?.(cloud.stripCount, cloud.vertexCount);
});

setCf4StreamlinesEnabled(enabled: boolean) {
  state.settings.cf4StreamlinesEnabled = enabled;
  scheduler.requestRender();
},
setCf4StreamlineDensity(density: number) {
  state.settings.cf4StreamlineDensity = density;
  scheduler.requestRender();
},
```

destroy path:

```ts
state.gpu.cf4StreamlineRenderer?.destroy();
```

- [ ] **Step 4.3: renderFrame draw call.**

In the HDR pass, after CF4 galaxies (plan 02) and before filaments:

```ts
if (settings.cf4StreamlinesEnabled && cf4StreamlineRenderer) {
  cf4StreamlineRenderer.draw(
    pass,
    viewProj,
    [viewportW, viewportH],
    DEFAULT_CF4_STREAMLINE_HALF_WIDTH_PX,
    1.0,
    settings.cf4StreamlineDensity,
  );
}
```

`renderFrame.ts` `RenderFrameInput` gets a new `cf4StreamlineRenderer:
Cf4StreamlineRenderer | null` field.

- [ ] **Step 4.4: Run, commit.**

```
npm run typecheck && npm test
git add src/data/defaults.ts src/@types/EngineHandle.d.ts src/@types/EngineCallbacks.d.ts src/services/engine/engine.ts src/services/engine/renderFrame.ts
git commit -m "feat(cf4): wire streamline renderer with density slider"
```

---

### Task 5: SettingsPanel toggle + density slider

**Files (modify):**

- `src/components/SettingsPanel/SettingsPanel.tsx`
- `src/App.tsx`

- [ ] **Step 5.1: Add the props and the controls.**

```tsx
cf4StreamlinesEnabled?: boolean;
onCf4StreamlinesChange?: (enabled: boolean) => void;
cf4StreamlineDensity?: number;
onCf4StreamlineDensityChange?: (density: number) => void;
cf4StreamlineCounts?: { stripCount: number; vertexCount: number } | null;
```

In JSX, after the CF4 galaxies row from plan 02:

```tsx
{showCf4StreamlinesToggle && (
  <>
    <label className={styles.row}>
      <input type="checkbox" checked={cf4StreamlinesEnabled}
        onChange={(e) => onCf4StreamlinesChange!(e.target.checked)} />
      <span>CF4 streamlines ({cf4StreamlineCounts!.stripCount.toLocaleString()})</span>
    </label>
    {cf4StreamlinesEnabled && cf4StreamlineDensity !== undefined && (
      <label className={styles.sliderRow}>
        <span>Density</span>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={cf4StreamlineDensity}
          onChange={(e) =>
            onCf4StreamlineDensityChange!(Number.parseFloat(e.target.value))
          }
        />
      </label>
    )}
  </>
)}
```

- [ ] **Step 5.2: App.tsx state + dispatch.**

```tsx
const [cf4StreamlinesEnabled, setCf4StreamlinesEnabled] =
  useState<boolean>(DEFAULT_CF4_STREAMLINES_ENABLED);
const [cf4StreamlineDensity, setCf4StreamlineDensity] =
  useState<number>(DEFAULT_CF4_STREAMLINE_DENSITY);
const [cf4StreamlineCounts, setCf4StreamlineCounts] = useState<{
  stripCount: number; vertexCount: number;
} | null>(null);

// EngineCallbacks:
onCf4StreamlinesReady: (stripCount, vertexCount) =>
  setCf4StreamlineCounts({ stripCount, vertexCount }),

// SettingsPanel props:
cf4StreamlinesEnabled={cf4StreamlinesEnabled}
onCf4StreamlinesChange={(e) => {
  setCf4StreamlinesEnabled(e);
  handleRef.current?.setCf4StreamlinesEnabled?.(e);
}}
cf4StreamlineDensity={cf4StreamlineDensity}
onCf4StreamlineDensityChange={(d) => {
  setCf4StreamlineDensity(d);
  handleRef.current?.setCf4StreamlineDensity?.(d);
}}
cf4StreamlineCounts={cf4StreamlineCounts}
```

- [ ] **Step 5.3: Visual verification.**

Ask the user to: enable the toggle, then scrub the density slider. Verify
that (a) thick amber lines appear arcing through the local-universe
region, (b) the slider scrubs smoothly without jank (no per-frame buffer
re-upload).

- [ ] **Step 5.4: Commit.**

```
git add src/components/SettingsPanel/SettingsPanel.tsx src/App.tsx
git commit -m "feat(cf4): SettingsPanel toggle + density slider for streamlines"
```

---

## Self-review

- [ ] `buildCf4SegmentInstances` returns `(vertexCount - stripCount)`
      segments and the `segmentsBeforeStrip` table where
      `segmentsBeforeStrip[stripCount] === segmentCount`.
- [ ] Density slider scrubs without per-frame buffer reupload.
- [ ] No `interface`. All comments explain *why*.
- [ ] `npm run typecheck && npm test` clean.

After this plan ships: streamlines render in monochrome amber and the
density slider works. Plan 04 swaps the per-segment colour to a basin
palette lookup, adds the same to the galaxies, and exposes a unified
"Cosmic Flows" SettingsPanel section.
