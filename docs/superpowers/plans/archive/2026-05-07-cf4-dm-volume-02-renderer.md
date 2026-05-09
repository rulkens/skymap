# CF-4 DM Volume — Sub-plan 02: Renderer + UI

> **SUPERSEDED 2026-05-10. DO NOT EXECUTE.** Re-scoped against the scalar-volume-renderer primitive (which obviates this entire sub-plan). See the new spec [`docs/superpowers/specs/2026-05-10-cf4-dm-volume-content-design.md`](../../specs/2026-05-10-cf4-dm-volume-content-design.md). Preserved for historical context.

---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Volume-render the CF-4 density cube produced by Plan 01 as a translucent 3D fog around the observer. After this plan ships, toggling "Dark Matter (CF-4)" in the SettingsPanel makes Laniakea, the Local Void, and the Great Attractor visible behind the existing GLADE galaxies. Toggle off → scene unchanged from current `main`. Intensity slider modulates opacity from 0 to 2.

**Architecture:** New `Cf4DensityRenderer` mirrors `FilamentRenderer`'s shape: a class that owns its GPU resources (3D texture, sampler, uniform buffer, pipeline) and exposes `render(pass, viewProj, cameraPos, intensity)`. The shader is a single fullscreen-quad fragment that ray-marches through a `texture_3d<f32>` (uploaded as `r16float`). Composition is purely additive — the volume writes into the HDR target before galaxies/filaments, with no depth interaction.

**Tech Stack:** TypeScript, WebGPU + WGSL, Vite, Vitest. No new runtime deps.

**Prerequisites:** Plan 01 must be merged (provides `cf4DensityFormat`, `superGalacticTransform`, the `.bin` on R2). For visual verification, the implementer needs `public/data/cf4_density.bin` locally — `npm run sync-r2 -- --pull` (or curl per `data/raw/cf4/README.md`) gets it from R2; no Python required.

**Done means:**

- `loadCf4Density()` returns a populated `Cf4DensityField` from `cf4_density.bin`, or `null` if missing.
- `Cf4DensityRenderer` initializes against a real WebGPU device, uploads the 3D texture, and renders a fullscreen pass.
- Engine wires the renderer in as the first HDR pass; subsequent passes (points, filaments, etc.) draw on top.
- SettingsPanel has a "Dark Matter (CF-4)" section with a toggle + intensity slider; both persist via `useEngineSettings`.
- CommandPalette has a "Toggle CF-4 dark matter" entry.
- Visual verification: Laniakea blob visible toward (RA, Dec) ≈ (160°, −60°); Local Void as a dark gap; toggle off identical to current `main`.

> **WGSL note (per project memory `feedback_wgsl_meticulous.md`):** Shader edits must be visually verified, not just typecheck-passed. Tasks 3, 4, and 9 explicitly include manual visual checks; do not mark them `[x]` based on green tests alone.

---

## File structure

### New files

- `src/services/engine/cf4DensityLoader.ts` — `loadCf4Density(): Promise<Cf4DensityField | null>`.
- `src/services/gpu/cf4DensityMath.ts` — `buildModelToCf4Matrix` pure helper.
- `src/services/gpu/cf4DensityRenderer.ts` — Renderer class.
- `src/services/gpu/shaders/cf4Density.wgsl` — Fullscreen vertex + ray-march fragment.
- `tests/services/engine/cf4DensityLoader.test.ts` — Mocked-fetch happy + null + error paths.
- `tests/services/gpu/cf4DensityMath.test.ts` — Matrix anchored against observer + voxel-distance norms.

### Modified files

- `src/services/engine/engine.ts` — load + construct + integrate render pass.
- `src/components/SettingsPanel.tsx` — toggle + slider UI.
- `src/components/CommandPalette.tsx` — new entry.
- `src/hooks/useEngineSettings.ts` — `cf4DensityEnabled`, `cf4DensityIntensity`.
- `src/data/defaults.ts` — `DEFAULT_CF4_DENSITY_ENABLED`, `DEFAULT_CF4_DENSITY_INTENSITY`.
- `src/@types/EngineSettingsState.d.ts` — extend with new fields.
- `src/@types/EngineHandle.d.ts` — extend with setters following the existing pattern.
- `src/@types/EngineGpuHandles.d.ts` — add the renderer field.

---

## Tasks

### Task 0: Pre-flight

- [ ] **Step 0.1: Verify Plan 01 is in place.**

```
test -f src/data/cf4DensityFormat.ts && echo "FORMAT: present" || echo "FORMAT: MISSING — Plan 01 must run first"
test -f src/data/superGalacticTransform.ts && echo "TRANSFORM: present" || echo "TRANSFORM: MISSING — Plan 01 must run first"
```

Expected: both `present`. If either is `MISSING`, abort and run Plan 01 first.

- [ ] **Step 0.2: Pull `cf4_density.bin` from R2 if missing.**

```
test -f public/data/cf4_density.bin && echo "BIN: present ($(wc -c < public/data/cf4_density.bin) bytes)" || echo "BIN: missing"
```

If missing, fetch:

```
curl -L -o public/data/cf4_density.bin https://skymap-data.rulkens.com/data/cf4_density.bin
```

Visual-verification tasks at the end of this plan need this file. Loader unit tests use mocked fetch and don't.

- [ ] **Step 0.3: Verify baseline.**

```
npm run typecheck && npm test
```

Expected: clean. Record the test count for the self-review.

- [ ] **Step 0.4: Ensure dev server is running.**

```
ps aux | grep -v grep | grep "vite" | head -1
```

If no Vite process, start one (`npm run dev`) per CLAUDE.md "dev server stays running" convention.

---

### Task 1: `cf4DensityLoader`

**Files:**
- Create: `src/services/engine/cf4DensityLoader.ts`
- Test: `tests/services/engine/cf4DensityLoader.test.ts`

- [ ] **Step 1.1: Write the failing test.**

Create `tests/services/engine/cf4DensityLoader.test.ts`:

```ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { loadCf4Density } from '../../../src/services/engine/cf4DensityLoader';
import { encodeCf4Density } from '../../../src/data/cf4DensityFormat';
import type { Cf4DensityField } from '../../../src/@types/Cf4DensityField';

function makeBuffer(): ArrayBuffer {
  const voxels = new Uint16Array(8);
  for (let i = 0; i < voxels.length; i++) voxels[i] = i;
  const field: Cf4DensityField = {
    nx: 2, ny: 2, nz: 2,
    voxelSizeMpc: 5.236,
    boxOriginMpc: [-10, -10, -10],
    observerVoxel: [1, 1, 1],
    minDelta: 0,
    maxDelta: 7,
    meanDelta: 3.5,
    voxels,
  };
  return encodeCf4Density(field);
}

describe('loadCf4Density', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.stubEnv('VITE_DATA_BASE_URL', '');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('decodes a valid response', async () => {
    const buffer = makeBuffer();
    global.fetch = vi.fn(async () => new Response(buffer, { status: 200 })) as typeof fetch;

    const field = await loadCf4Density();
    expect(field).not.toBeNull();
    expect(field!.nx).toBe(2);
    expect(field!.voxels.length).toBe(8);
  });

  it('returns null on 404', async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 404 })) as typeof fetch;
    const field = await loadCf4Density();
    expect(field).toBeNull();
  });

  it('returns null on network error', async () => {
    global.fetch = vi.fn(async () => { throw new Error('offline'); }) as typeof fetch;
    const field = await loadCf4Density();
    expect(field).toBeNull();
  });

  it('throws on malformed body (bad magic)', async () => {
    const bad = new ArrayBuffer(64 + 16);
    new DataView(bad).setUint32(0, 0xdeadbeef, true);
    global.fetch = vi.fn(async () => new Response(bad, { status: 200 })) as typeof fetch;
    await expect(loadCf4Density()).rejects.toThrow(/magic/i);
  });

  it('requests the correct URL', async () => {
    const buffer = makeBuffer();
    const fetchSpy = vi.fn(async () => new Response(buffer, { status: 200 })) as typeof fetch;
    global.fetch = fetchSpy;
    await loadCf4Density();
    expect(fetchSpy).toHaveBeenCalledWith('/data/cf4_density.bin');
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails.**

```
npx vitest run tests/services/engine/cf4DensityLoader.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 1.3: Implement.**

Create `src/services/engine/cf4DensityLoader.ts`:

```ts
/**
 * cf4DensityLoader — fetch and decode public/data/cf4_density.bin.
 *
 * Mirrors loadFilaments(): the asset is OPTIONAL. A 404 or network failure
 * returns null silently and the engine treats this as "DM layer disabled".
 * Only a successfully-fetched but malformed binary throws — that's a code
 * bug, not a missing-asset path.
 */

import { dataUrl } from './cloudLoader';
import { decodeCf4Density } from '../../data/cf4DensityFormat';
import type { Cf4DensityField } from '../../@types/Cf4DensityField';

export async function loadCf4Density(): Promise<Cf4DensityField | null> {
  const url = dataUrl('cf4_density.bin');
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    console.info(`cf4DensityLoader: fetch failed (${(err as Error).message}); DM layer disabled`);
    return null;
  }

  if (!response.ok) {
    if (response.status === 404) {
      console.info(`cf4DensityLoader: ${url} not available; DM layer disabled`);
      return null;
    }
    throw new Error(`cf4DensityLoader: HTTP ${response.status} for ${url}`);
  }

  const buffer = await response.arrayBuffer();
  return decodeCf4Density(buffer);
}
```

- [ ] **Step 1.4: Run test to verify it passes.**

```
npx vitest run tests/services/engine/cf4DensityLoader.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 1.5: Commit.**

```
git add src/services/engine/cf4DensityLoader.ts tests/services/engine/cf4DensityLoader.test.ts
git commit -m "feat(cf4-dm): add cf4DensityLoader with mocked-fetch tests"
```

---

### Task 2: `buildModelToCf4Matrix` helper

**Files:**
- Create: `src/services/gpu/cf4DensityMath.ts`
- Test: `tests/services/gpu/cf4DensityMath.test.ts`

**Background:** The shader needs a 4×4 matrix that maps Skymap world Mpc (equatorial) → CF-4 voxel coords. We extract that math into a pure helper so it can be unit-tested without a GPU.

The transform is `p_voxel = R^T * (1/voxelSize) * p_world_eq + observerVoxel`, where `R = SG_TO_EQ_ROTATION` rotates supergalactic → equatorial (so its transpose rotates equatorial → supergalactic, which is what we need).

- [ ] **Step 2.1: Write the failing test.**

Create `tests/services/gpu/cf4DensityMath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildModelToCf4Matrix } from '../../../src/services/gpu/cf4DensityMath';
import type { Cf4DensityField } from '../../../src/@types/Cf4DensityField';

function syntheticField(): Cf4DensityField {
  return {
    nx: 256, ny: 256, nz: 256,
    voxelSizeMpc: 5.236, // 3.90625 / 0.746
    boxOriginMpc: [-670.24, -670.24, -670.24],
    observerVoxel: [128, 128, 128],
    minDelta: -0.7,
    maxDelta: 28.0,
    meanDelta: 0.001,
    voxels: new Uint16Array(0),
  };
}

function applyMatrix(m: Float32Array, v: [number, number, number]): [number, number, number] {
  // Column-major mat4 × (x, y, z, 1).
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ];
}

describe('buildModelToCf4Matrix', () => {
  it('maps world origin (observer) to the cube center voxel', () => {
    const m = buildModelToCf4Matrix(syntheticField());
    const r = applyMatrix(m, [0, 0, 0]);
    expect(r[0]).toBeCloseTo(128, 4);
    expect(r[1]).toBeCloseTo(128, 4);
    expect(r[2]).toBeCloseTo(128, 4);
  });

  it('preserves distance: a point one voxelSize away maps to one voxel from the observer', () => {
    const field = syntheticField();
    const m = buildModelToCf4Matrix(field);
    // World offset of (voxelSizeMpc, 0, 0) — magnitude 1 voxel.
    const r = applyMatrix(m, [field.voxelSizeMpc, 0, 0]);
    const dx = r[0] - 128;
    const dy = r[1] - 128;
    const dz = r[2] - 128;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    expect(dist).toBeCloseTo(1.0, 4);
  });

  it('returns a 16-element Float32Array (column-major mat4) with [0,0,0,1] last row', () => {
    const m = buildModelToCf4Matrix(syntheticField());
    expect(m).toBeInstanceOf(Float32Array);
    expect(m.length).toBe(16);
    expect(m[3]).toBeCloseTo(0, 6);
    expect(m[7]).toBeCloseTo(0, 6);
    expect(m[11]).toBeCloseTo(0, 6);
    expect(m[15]).toBeCloseTo(1, 6);
  });

  it('is invertible — applying the inverse rotation gets back to world units', () => {
    // Constructive: build the matrix, apply it to a 3D world point, then
    // manually undo to verify directionality. Pick a non-axis-aligned vector
    // so a swapped-rotation bug would show up.
    const field = syntheticField();
    const m = buildModelToCf4Matrix(field);
    const worldEq: [number, number, number] = [10, -20, 30];
    const voxel = applyMatrix(m, worldEq);
    // Undo the translation, then multiply by voxelSize to get back to a
    // rotated-but-same-magnitude point.
    const dvox: [number, number, number] = [voxel[0] - 128, voxel[1] - 128, voxel[2] - 128];
    const worldMagnitude = Math.sqrt(worldEq[0] ** 2 + worldEq[1] ** 2 + worldEq[2] ** 2);
    const voxelMagnitude = Math.sqrt(dvox[0] ** 2 + dvox[1] ** 2 + dvox[2] ** 2);
    expect(voxelMagnitude * field.voxelSizeMpc).toBeCloseTo(worldMagnitude, 3);
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails.**

```
npx vitest run tests/services/gpu/cf4DensityMath.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 2.3: Implement.**

Create `src/services/gpu/cf4DensityMath.ts`:

```ts
/**
 * cf4DensityMath — pure helpers for the CF-4 density volume renderer.
 *
 * Extracted from cf4DensityRenderer.ts so they can be unit-tested without
 * a WebGPU device.
 */

import { SG_TO_EQ_ROTATION } from '../../data/superGalacticTransform';
import type { Cf4DensityField } from '../../@types/Cf4DensityField';

/**
 * Build a column-major 4×4 matrix that maps Skymap world Mpc (equatorial)
 * to CF-4 voxel coords (supergalactic, observer-centered).
 *
 *   p_voxel = R^T * (1/voxelSize) * p_world_eq + observerVoxel
 *
 * R = SG_TO_EQ_ROTATION rotates sg → eq, so R^T rotates eq → sg.
 *
 * Output is column-major to match WGSL's mat4x4<f32>: m[col*4 + row].
 */
export function buildModelToCf4Matrix(field: Cf4DensityField): Float32Array {
  const m = new Float32Array(16);
  const r = SG_TO_EQ_ROTATION;
  const inv = 1 / field.voxelSizeMpc;
  const ox = field.observerVoxel[0];
  const oy = field.observerVoxel[1];
  const oz = field.observerVoxel[2];

  // Column-major mat4 (m[col*4 + row]). Column i of M = column i of R^T =
  // row i of R. R is stored row-major in `r` (r[0..2] is row 0). So:
  //   col 0 of M (linear part) = (r[0], r[1], r[2]) * inv
  //   col 1 of M (linear part) = (r[3], r[4], r[5]) * inv
  //   col 2 of M (linear part) = (r[6], r[7], r[8]) * inv
  //   col 3 of M (translation)  = (observerVoxel, 1)
  m[0] = r[0] * inv;
  m[1] = r[1] * inv;
  m[2] = r[2] * inv;
  m[3] = 0;
  m[4] = r[3] * inv;
  m[5] = r[4] * inv;
  m[6] = r[5] * inv;
  m[7] = 0;
  m[8] = r[6] * inv;
  m[9] = r[7] * inv;
  m[10] = r[8] * inv;
  m[11] = 0;
  m[12] = ox;
  m[13] = oy;
  m[14] = oz;
  m[15] = 1;

  return m;
}
```

- [ ] **Step 2.4: Run test to verify it passes.**

```
npx vitest run tests/services/gpu/cf4DensityMath.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 2.5: Commit.**

```
git add src/services/gpu/cf4DensityMath.ts tests/services/gpu/cf4DensityMath.test.ts
git commit -m "feat(cf4-dm): add buildModelToCf4Matrix helper"
```

---

### Task 3: WGSL ray-march shader

**Files:**
- Create: `src/services/gpu/shaders/cf4Density.wgsl`

**Background:** Shader is a fullscreen-triangle vertex pass + ray-march fragment. No vertex buffer needed (we emit NDC corners directly from `vertex_index`). Fragment reconstructs the world-space ray from screen UV + `inv_view_proj`, intersects the cube AABB, marches ~128 samples, accumulates emission front-to-back, returns premultiplied RGBA for additive blending.

Per project memory `feedback_wgsl_meticulous.md`: this shader gets visual verification, not just typecheck approval. Step 3.4 is a manual visual-look gate.

- [ ] **Step 3.1: Create the shader file.**

Create `src/services/gpu/shaders/cf4Density.wgsl`:

```wgsl
// cf4Density.wgsl — ray-march a 3D density texture into HDR space.
//
// Inputs:
//   - uniforms.inv_view_proj : reconstructs world rays from screen UV.
//   - uniforms.model_to_cf4  : world Mpc (equatorial) → CF-4 voxel coords.
//   - uniforms.camera_pos    : observer position in world Mpc (typically 0).
//   - uniforms.box_min/max   : AABB bounds in world Mpc for fast skip.
//   - uniforms.intensity     : UI slider, multiplies emission.
//   - uniforms.delta_log_min/max : transfer-function input range.
//   - uniforms.step_count    : ray-march sample count.
//   - field (texture_3d<f32>): the density cube, sampled in [0, 1] uvw.
//
// Output: premultiplied RGBA. Caller blends with src=ONE, dst=ONE_MINUS_SRC_ALPHA
// (or ONE for purely additive, since the volume sits behind opaque-ish
// galaxies that come later in the pass).
//
// Composition decision (per spec §architecture): purely additive emission,
// no depth interaction. Galaxies and filaments draw on top because they
// run after this pass.

struct Uniforms {
    inv_view_proj : mat4x4<f32>,
    model_to_cf4  : mat4x4<f32>,
    camera_pos    : vec3<f32>,
    intensity     : f32,
    box_min       : vec3<f32>,
    delta_log_min : f32,
    box_max       : vec3<f32>,
    delta_log_max : f32,
    step_count    : u32,
    cube_extent   : f32,  // = nx (== ny == nz, assumes cubic field)
    half_box_voxels : f32,
    _pad          : f32,
};

@group(0) @binding(0) var<uniform> u : Uniforms;
@group(0) @binding(1) var field : texture_3d<f32>;
@group(0) @binding(2) var samp  : sampler;

struct VsOut {
    @builtin(position) clip_pos : vec4<f32>,
    @location(0) ndc_xy : vec2<f32>,
};

// Fullscreen-triangle vertex shader (no vertex buffer).
//   index 0 → (-1, -1)
//   index 1 → ( 3, -1)
//   index 2 → (-1,  3)
// Covers NDC clip space with one triangle that overhangs to (-1,3) and (3,-1);
// the rasteriser clips to the actual viewport.
@vertex
fn vs_main(@builtin(vertex_index) idx : u32) -> VsOut {
    var out : VsOut;
    let xy = vec2<f32>(
        select(-1.0, 3.0, idx == 1u),
        select(-1.0, 3.0, idx == 2u),
    );
    out.clip_pos = vec4<f32>(xy, 0.0, 1.0);
    out.ndc_xy = xy;
    return out;
}

// AABB ray intersection. Returns vec2(t_near, t_far). t_far <= t_near means miss.
fn intersect_aabb(ray_origin : vec3<f32>, ray_dir : vec3<f32>, lo : vec3<f32>, hi : vec3<f32>) -> vec2<f32> {
    let inv_d = 1.0 / ray_dir;
    let t1 = (lo - ray_origin) * inv_d;
    let t2 = (hi - ray_origin) * inv_d;
    let tmin = min(t1, t2);
    let tmax = max(t1, t2);
    let t_near = max(max(tmin.x, tmin.y), tmin.z);
    let t_far  = min(min(tmax.x, tmax.y), tmax.z);
    return vec2<f32>(t_near, t_far);
}

// Transfer function: t in [0,1] → emission RGB, opacity in [0,1].
// Voids (low t) → faint cool blue. Mean → transparent black. Overdensities →
// warm white. We use a 4-stop perceptual ramp; could be replaced by a 1D LUT
// later if we want UI control.
fn transfer(t : f32) -> vec4<f32> {
    // Color: cool-blue → transparent → warm-amber → near-white.
    let c0 = vec3<f32>(0.10, 0.20, 0.55);  // void
    let c1 = vec3<f32>(0.05, 0.05, 0.10);  // mean (transparent-ish)
    let c2 = vec3<f32>(0.95, 0.55, 0.20);  // filament
    let c3 = vec3<f32>(1.00, 0.95, 0.85);  // cluster core

    var rgb : vec3<f32>;
    if (t < 0.33) {
        rgb = mix(c0, c1, t / 0.33);
    } else if (t < 0.66) {
        rgb = mix(c1, c2, (t - 0.33) / 0.33);
    } else {
        rgb = mix(c2, c3, (t - 0.66) / 0.34);
    }

    // Opacity: lowest near the mean (transparent voids and the bulk are quiet),
    // ramping up sharply at high overdensities. Tuned by eye; revisit during
    // visual verification.
    let opacity = smoothstep(0.0, 1.0, max(0.0, t - 0.15)) * 0.6;

    return vec4<f32>(rgb, opacity);
}

@fragment
fn fs_main(in : VsOut) -> @location(0) vec4<f32> {
    // Reconstruct world ray from screen NDC.
    let ndc = vec4<f32>(in.ndc_xy, 0.0, 1.0);
    let world_h = u.inv_view_proj * ndc;
    let world_pos = world_h.xyz / world_h.w;
    let ray_dir = normalize(world_pos - u.camera_pos);

    let t_range = intersect_aabb(u.camera_pos, ray_dir, u.box_min, u.box_max);
    if (t_range.y <= max(t_range.x, 0.0)) {
        discard;
    }

    let t_start = max(t_range.x, 0.0);
    let t_end   = t_range.y;
    let dt      = (t_end - t_start) / f32(u.step_count);

    var color = vec3<f32>(0.0);
    var transmittance = 1.0;

    for (var i = 0u; i < u.step_count; i = i + 1u) {
        let t = t_start + dt * f32(i);
        let p_world = u.camera_pos + ray_dir * t;
        let p_voxel = (u.model_to_cf4 * vec4<f32>(p_world, 1.0)).xyz;

        // Half-box-sphere clip — CF-4 reconstructions are noise beyond
        // half-box from the observer. observer is at (cube_extent/2)^3,
        // and half_box_voxels == cube_extent/2.
        let r_from_observer = length(p_voxel - vec3<f32>(u.half_box_voxels));
        if (r_from_observer > u.half_box_voxels) {
            continue;
        }

        // Sample the field. Normalised uvw in [0, 1].
        let uvw = p_voxel / vec3<f32>(u.cube_extent);
        if (any(uvw < vec3<f32>(0.0)) || any(uvw > vec3<f32>(1.0))) {
            continue;
        }
        let delta = textureSampleLevel(field, samp, uvw, 0.0).r;

        // Transfer function input: log(1+δ) normalised to [0, 1].
        let log_d = log(max(1.0 + delta, 1e-6));
        let t_param = clamp(
            (log_d - u.delta_log_min) / max(u.delta_log_max - u.delta_log_min, 1e-6),
            0.0,
            1.0,
        );

        let tf = transfer(t_param);
        // dt-scaled opacity correction so changing step_count doesn't
        // change apparent density. 5.0 is the reference Mpc step size.
        let opacity = tf.a * u.intensity * dt / 5.0;

        // Front-to-back compositing.
        color = color + transmittance * tf.rgb * opacity;
        transmittance = transmittance * (1.0 - opacity);
        if (transmittance < 0.01) {
            break;
        }
    }

    let alpha = 1.0 - transmittance;
    return vec4<f32>(color, alpha);
}
```

- [ ] **Step 3.2: Verify the shader file is included in Vite's `?raw` import system.**

```
grep -E '?raw' src/services/gpu/*Renderer.ts | head -3
```

Expected: shows existing `?raw` imports of `.wgsl` files. The new shader will be imported the same way in Task 4. No change needed here unless the project has a custom Vite plugin.

- [ ] **Step 3.3: Typecheck (no compile errors at the file level — the shader is just text until Task 4).**

```
npm run typecheck
```

Expected: clean. WGSL itself isn't typechecked at this stage.

- [ ] **Step 3.4: Visual sanity check — gate on Task 4.**

The shader cannot be visually checked without a renderer to invoke it. **Defer the visual gate to Task 9** when engine wiring lands. For now, do a careful read-through:

- AABB intersection has `inv_d = 1.0 / ray_dir` which divides by zero if any component is 0. WGSL handles this via IEEE Inf, and the subsequent `min/max` saturates correctly — no NaNs. Verify by inspection.
- The fullscreen-triangle vertex shader uses `select()` to pick the corner. Indices 0/1/2 map to (−1,−1)/(3,−1)/(−1,3). Confirm.
- The transfer function's `c1 = (0.05, 0.05, 0.10)` is intentionally near-black to make the mean field nearly transparent. If after visual verification this looks wrong (e.g. ghost of the cube shape visible), tweak in Task 10.

- [ ] **Step 3.5: Commit.**

```
git add src/services/gpu/shaders/cf4Density.wgsl
git commit -m "feat(cf4-dm): add cf4Density.wgsl ray-march shader (no renderer yet)"
```

---

### Task 4: `Cf4DensityRenderer` class

**Files:**
- Create: `src/services/gpu/cf4DensityRenderer.ts`

**Background:** Owns the GPU resources (3D texture, sampler, uniform buffer, pipeline). Mirrors `FilamentRenderer` shape. No unit test for the GPU side — visual verification in Task 9.

- [ ] **Step 4.1: Implement the renderer.**

Create `src/services/gpu/cf4DensityRenderer.ts`:

```ts
/**
 * Cf4DensityRenderer — volume-renders the CF-4 DM density cube as a
 * translucent fog around the observer.
 *
 * Strategy: fullscreen-triangle vertex + ray-march fragment (see
 * `shaders/cf4Density.wgsl`). The 3D density texture is uploaded once at
 * construction; per-frame work is one draw call with three vertices.
 *
 * Buffers:
 *   uniformBuffer : 192 bytes (mat4 + mat4 + vec3+f32 + vec3+f32 + vec3+f32 + 3×f32)
 *   density3DTex  : nx*ny*nz r16float texels (~32 MB for 256³)
 *
 * Public API:
 *   - new Cf4DensityRenderer(device, format, field)
 *   - render(pass, viewProj, cameraPos, intensity)
 *   - destroy()
 */

import shaderSource from './shaders/cf4Density.wgsl?raw';
import { mat4, vec3 } from 'gl-matrix';
import type { Cf4DensityField } from '../../@types/Cf4DensityField';
import { buildModelToCf4Matrix } from './cf4DensityMath';

// Uniform layout (matches struct Uniforms in cf4Density.wgsl exactly).
// Total size: 64 + 64 + 16 + 16 + 16 + 16 = 192 bytes. WGSL pads structs to
// 16-byte alignment, so all the vec3 + f32 packs work as written.
const UNIFORM_BYTES = 192;

// Default ray-march parameters. Tuned during visual verification (Task 10).
const DEFAULT_STEP_COUNT = 128;
// log(1 + (-0.5)) ≈ -0.69, log(1 + 30) ≈ 3.43. Maps voids → low t, clusters → high t.
const DEFAULT_DELTA_LOG_MIN = -0.69;
const DEFAULT_DELTA_LOG_MAX = 3.43;

export type Cf4DensityRenderer = {
  render(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    cameraPos: [number, number, number],
    intensity: number
  ): void;
  destroy(): void;
};

export function createCf4DensityRenderer(
  device: GPUDevice,
  format: GPUTextureFormat,
  field: Cf4DensityField
): Cf4DensityRenderer {
  // ── 3D texture upload ───────────────────────────────────────────────
  // We pack the f16 voxels as r16float. WebGPU requires r16float to come
  // from a Uint16Array of the raw f16 bit pattern, which is exactly what
  // cf4DensityFormat decodes.
  const texture = device.createTexture({
    label: 'cf4-density-3d',
    size: { width: field.nx, height: field.ny, depthOrArrayLayers: field.nz },
    dimension: '3d',
    format: 'r16float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });

  device.queue.writeTexture(
    { texture },
    field.voxels,
    { bytesPerRow: field.nx * 2, rowsPerImage: field.ny },
    { width: field.nx, height: field.ny, depthOrArrayLayers: field.nz }
  );

  const sampler = device.createSampler({
    label: 'cf4-density-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    addressModeW: 'clamp-to-edge',
  });

  const uniformBuffer = device.createBuffer({
    label: 'cf4-density-uniforms',
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const shaderModule = device.createShaderModule({
    label: 'cf4-density-shader',
    code: shaderSource,
  });

  // ── Pipeline ────────────────────────────────────────────────────────
  // Additive blend (src=ONE, dst=ONE) — the volume contributes additively
  // to the HDR target. Alpha channel is unused downstream because tone-map
  // ignores it.
  const pipeline = device.createRenderPipeline({
    label: 'cf4-density-pipeline',
    layout: 'auto',
    vertex: { module: shaderModule, entryPoint: 'vs_main' },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });

  const bindGroup = device.createBindGroup({
    label: 'cf4-density-bg',
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: sampler },
    ],
  });

  // Static matrix: world Mpc (equatorial) → CF-4 voxel.
  const modelToCf4 = buildModelToCf4Matrix(field);

  // World-space AABB of the cube (boxOriginMpc + boxSize on each axis).
  const boxSizeMpc = field.voxelSizeMpc * field.nx;
  const boxMin: [number, number, number] = [
    field.boxOriginMpc[0],
    field.boxOriginMpc[1],
    field.boxOriginMpc[2],
  ];
  const boxMax: [number, number, number] = [
    boxMin[0] + boxSizeMpc,
    boxMin[1] + boxSizeMpc,
    boxMin[2] + boxSizeMpc,
  ];

  // Pre-compute scratch matrices.
  const invViewProj = mat4.create();
  const tmpMat = mat4.create();
  const uniformScratch = new Float32Array(UNIFORM_BYTES / 4);

  function render(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    cameraPos: [number, number, number],
    intensity: number
  ): void {
    // Invert view-proj for ray reconstruction in the shader.
    mat4.copy(tmpMat, viewProj as Float32Array as mat4);
    mat4.invert(invViewProj, tmpMat);

    // Pack the uniform block. Offsets in floats (4 bytes each).
    // 0..15  : inv_view_proj (mat4)
    // 16..31 : model_to_cf4 (mat4)
    // 32..34 : camera_pos
    // 35     : intensity
    // 36..38 : box_min
    // 39     : delta_log_min
    // 40..42 : box_max
    // 43     : delta_log_max
    // 44     : step_count (u32 — write as f32 bits then patch)
    // 45     : cube_extent
    // 46     : half_box_voxels
    // 47     : pad
    uniformScratch.set(invViewProj as unknown as Float32Array, 0);
    uniformScratch.set(modelToCf4, 16);
    uniformScratch[32] = cameraPos[0];
    uniformScratch[33] = cameraPos[1];
    uniformScratch[34] = cameraPos[2];
    uniformScratch[35] = intensity;
    uniformScratch[36] = boxMin[0];
    uniformScratch[37] = boxMin[1];
    uniformScratch[38] = boxMin[2];
    uniformScratch[39] = DEFAULT_DELTA_LOG_MIN;
    uniformScratch[40] = boxMax[0];
    uniformScratch[41] = boxMax[1];
    uniformScratch[42] = boxMax[2];
    uniformScratch[43] = DEFAULT_DELTA_LOG_MAX;
    // step_count is a u32 in the shader. Float32Array can't represent it
    // directly; patch via a Uint32Array view of the same buffer.
    new Uint32Array(uniformScratch.buffer)[44] = DEFAULT_STEP_COUNT;
    uniformScratch[45] = field.nx;
    uniformScratch[46] = field.nx / 2;
    uniformScratch[47] = 0;

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    device.queue.writeBuffer(uniformBuffer, 0, uniformScratch.buffer);
    pass.draw(3, 1, 0, 0);
  }

  function destroy(): void {
    texture.destroy();
    uniformBuffer.destroy();
  }

  return { render, destroy };
}
```

- [ ] **Step 4.2: Typecheck.**

```
npm run typecheck
```

Expected: clean. Shader binding-group layout matches the WGSL struct layout in Task 3.

- [ ] **Step 4.3: Commit.**

```
git add src/services/gpu/cf4DensityRenderer.ts
git commit -m "feat(cf4-dm): add Cf4DensityRenderer class (not yet wired)"
```

---

### Task 5: Defaults and types

**Files:**
- Modify: `src/data/defaults.ts`
- Modify: `src/@types/EngineSettingsState.d.ts`
- Modify: `src/@types/EngineGpuHandles.d.ts`
- Modify: `src/@types/EngineHandle.d.ts`

- [ ] **Step 5.1: Add defaults.**

Edit `src/data/defaults.ts` — add two new constants near the existing `DEFAULT_FILAMENTS_ENABLED` / `DEFAULT_FILAMENT_INTENSITY`. Use the `Edit` tool with `old_string` matching the existing filament defaults line and `new_string` adding the two CF-4 lines after it:

```ts
export const DEFAULT_CF4_DENSITY_ENABLED = false;
export const DEFAULT_CF4_DENSITY_INTENSITY = 1.0;
```

- [ ] **Step 5.2: Extend `EngineSettingsState`.**

Edit `src/@types/EngineSettingsState.d.ts` — add to the type body alongside `filamentsEnabled` / `filamentIntensity`:

```ts
  cf4DensityEnabled: boolean;
  cf4DensityIntensity: number;
```

- [ ] **Step 5.3: Extend `EngineGpuHandles`.**

Edit `src/@types/EngineGpuHandles.d.ts` — add a field for the optional renderer (matches the existing `filamentRenderer: FilamentRenderer | null` pattern):

```ts
  cf4DensityRenderer: Cf4DensityRenderer | null;
```

(Also add the corresponding import at the top.)

- [ ] **Step 5.4: Extend `EngineHandle`.**

Edit `src/@types/EngineHandle.d.ts` — add setter signatures alongside the existing filament setters (the exact name pattern matches the existing API; if filaments use `setFilamentsEnabled(b: boolean)`, follow suit):

```ts
  setCf4DensityEnabled(enabled: boolean): void;
  setCf4DensityIntensity(intensity: number): void;
```

- [ ] **Step 5.5: Verify typecheck.**

```
npm run typecheck
```

Expected: clean (or fails with "X is not assignable" complaints from `engine.ts` because it doesn't yet implement the new setters — that's fixed in Task 9). If the only typecheck errors are in `engine.ts`, that's expected; if there are errors elsewhere, fix them.

- [ ] **Step 5.6: Commit.**

```
git add src/data/defaults.ts src/@types/EngineSettingsState.d.ts src/@types/EngineGpuHandles.d.ts src/@types/EngineHandle.d.ts
git commit -m "feat(cf4-dm): add CF-4 density settings + types"
```

---

### Task 6: `useEngineSettings` hook

**Files:**
- Modify: `src/hooks/useEngineSettings.ts`

- [ ] **Step 6.1: Inspect the existing hook.**

```
grep -n -B1 -A2 'filamentsEnabled\|filamentIntensity' src/hooks/useEngineSettings.ts | head -30
```

Expected: shows the persistence shape — likely a `localStorage` getter/setter pair or a reducer with action types.

- [ ] **Step 6.2: Mirror the filament wiring for CF-4 density.**

Edit `src/hooks/useEngineSettings.ts`:

- Add `cf4DensityEnabled` and `cf4DensityIntensity` to the state shape, defaulting to `DEFAULT_CF4_DENSITY_ENABLED` / `DEFAULT_CF4_DENSITY_INTENSITY`.
- Add setters following the same pattern as the filament setters (e.g. `setCf4DensityEnabled`, `setCf4DensityIntensity`).
- Add localStorage persistence keys (e.g. `'skymap-cf4-density-enabled'`, `'skymap-cf4-density-intensity'`) parallel to the filament keys.

The exact code shape depends on the hook's internal style. Use `Edit` to add lines next to the existing filament logic.

- [ ] **Step 6.3: Typecheck.**

```
npm run typecheck
```

Expected: clean (or `engine.ts`-only errors as before).

- [ ] **Step 6.4: Commit.**

```
git add src/hooks/useEngineSettings.ts
git commit -m "feat(cf4-dm): persist CF-4 density toggle + intensity in useEngineSettings"
```

---

### Task 7: SettingsPanel UI

**Files:**
- Modify: `src/components/SettingsPanel.tsx`

- [ ] **Step 7.1: Find the existing filament section.**

```
grep -n 'filament' src/components/SettingsPanel.tsx | head -10
```

Expected: identifies the section block (likely a `<details>` or `<section>` with a checkbox + slider).

- [ ] **Step 7.2: Add a "Dark Matter (CF-4)" section parallel to the filament section.**

Edit `src/components/SettingsPanel.tsx` — add a new section after the filament section:

```tsx
{/* CF-4 dark-matter density volume */}
<section>
  <label>
    <input
      type="checkbox"
      checked={settings.cf4DensityEnabled}
      onChange={(e) => onSetCf4DensityEnabled(e.target.checked)}
    />
    Dark Matter (CF-4)
  </label>
  {settings.cf4DensityEnabled && (
    <label>
      Intensity
      <input
        type="range"
        min={0}
        max={2}
        step={0.05}
        value={settings.cf4DensityIntensity}
        onChange={(e) => onSetCf4DensityIntensity(parseFloat(e.target.value))}
      />
      <span>{settings.cf4DensityIntensity.toFixed(2)}</span>
    </label>
  )}
</section>
```

The exact JSX style (className, helper components) should match the surrounding filament section — use `Edit` to mimic local idioms rather than the snippet above verbatim.

- [ ] **Step 7.3: Verify the panel renders without React errors.**

In a browser, open `http://localhost:5173`, open the SettingsPanel. The new "Dark Matter (CF-4)" section should appear with an unchecked checkbox. Toggling it should reveal the intensity slider. (At this stage no rendering happens yet because Task 9 hasn't wired the engine.)

If browser shows a console error about a missing prop or handler, the parent component (`App.tsx` likely) needs to pass `onSetCf4DensityEnabled` / `onSetCf4DensityIntensity` from the engine handle. Add those wireups now:

```
grep -n 'onSetFilamentsEnabled\|setFilamentsEnabled' src/App.tsx src/components/SettingsPanel.tsx | head -10
```

Mirror the filament prop wiring.

- [ ] **Step 7.4: Commit.**

```
git add src/components/SettingsPanel.tsx src/App.tsx
git commit -m "feat(cf4-dm): SettingsPanel toggle + intensity slider for CF-4 density"
```

(Adjust `git add` to match what you actually edited.)

---

### Task 8: CommandPalette entry

**Files:**
- Modify: `src/components/CommandPalette.tsx`

- [ ] **Step 8.1: Find an existing toggle entry to mirror.**

```
grep -n 'filament\|toggle' src/components/CommandPalette.tsx | head
```

- [ ] **Step 8.2: Add a "Toggle CF-4 dark matter" entry.**

Edit `src/components/CommandPalette.tsx` — add an entry parallel to the filament toggle, with id like `'toggle-cf4-density'`, label "Toggle CF-4 dark matter", and an action that flips `cf4DensityEnabled` via the engine handle.

- [ ] **Step 8.3: Verify in browser.**

Open the command palette (per the project's keybinding — likely `Cmd+K` or similar; check `App.tsx` for the keybinding). Type "dark matter" or "cf4". The new entry should appear and toggle the layer when selected.

- [ ] **Step 8.4: Commit.**

```
git add src/components/CommandPalette.tsx
git commit -m "feat(cf4-dm): add 'Toggle CF-4 dark matter' to CommandPalette"
```

---

### Task 9: Engine wiring (the big one)

**Files:**
- Modify: `src/services/engine/engine.ts`

**Background:** Engine needs to:
1. Call `loadCf4Density()` in parallel with the existing `loadFilaments()`.
2. Construct `Cf4DensityRenderer` once the field arrives, store on `gpu.cf4DensityRenderer`.
3. Expose `setCf4DensityEnabled` and `setCf4DensityIntensity` setters.
4. Add a render-pass call before the existing point/disk/quad/filament passes (or wherever the spec specifies — see "Composition with the rest of the scene" in the spec). Per the spec: volume goes FIRST in the HDR pass list so subsequent passes draw on top.

This task is the only one that can produce visible output. **Per `feedback_wgsl_meticulous.md`:** do not declare this task complete until visual verification passes (Step 9.5).

- [ ] **Step 9.1: Mirror `loadFilaments` for CF-4.**

Find where `loadFilaments` is called in `engine.ts` (likely inside the engine's async init function, after `cloudLoader` resolves). Add a parallel call:

```
grep -n 'loadFilaments' src/services/engine/engine.ts | head
```

Add an analogous block:

```ts
import { loadCf4Density } from './cf4DensityLoader';
import { createCf4DensityRenderer } from '../gpu/cf4DensityRenderer';
// ... in the init flow:
const cf4Field = await loadCf4Density();
if (cf4Field) {
  state.gpu.cf4DensityRenderer = createCf4DensityRenderer(device, hdrFormat, cf4Field);
  callbacks.onCf4DensityReady?.();  // optional, only if the existing onFilamentsReady pattern uses one
}
```

(The exact integration point depends on the engine's flow. Match the filament style.)

- [ ] **Step 9.2: Wire the setters.**

Add to the engine handle returned at the end of init:

```ts
setCf4DensityEnabled(enabled: boolean) {
  state.settings.cf4DensityEnabled = enabled;
  scheduler.requestRender();
},
setCf4DensityIntensity(intensity: number) {
  state.settings.cf4DensityIntensity = intensity;
  scheduler.requestRender();
},
```

- [ ] **Step 9.3: Add the render pass.**

Find the per-frame render section. Per the spec, the volume pass goes FIRST in the HDR pass list (additive blending; subsequent passes draw on top). Add:

```ts
if (state.settings.cf4DensityEnabled && state.gpu.cf4DensityRenderer) {
  state.gpu.cf4DensityRenderer.render(
    hdrPass,
    viewProj as Float32Array,
    [camera.pos[0], camera.pos[1], camera.pos[2]],
    state.settings.cf4DensityIntensity
  );
}
```

This should sit immediately after `hdrPass` is created and before the first call to `pointRenderer.draw(...)`.

- [ ] **Step 9.4: Typecheck and run all tests.**

```
npm run typecheck && npm test
```

Expected: clean.

- [ ] **Step 9.5: Visual verification gate.**

This is the visual-verification gate per `feedback_wgsl_meticulous.md`. Do all of these checks before moving on:

1. Open `http://localhost:5173` (dev server).
2. **Toggle off**: scene matches current `main`. No visible change. Take a screenshot for comparison if needed.
3. **Toggle on, intensity 1.0**:
   - A translucent fog appears around the existing GLADE galaxies.
   - Brightest blob roughly toward galactic (l, b) ≈ (308°, +20°) which is approximately equatorial (RA ≈ 200°, Dec ≈ −60°) — that's the **Laniakea / Great Attractor** direction, distance ~50 Mpc.
   - A clear dark cavity toward (l, b) ≈ (60°, +20°) ≈ (RA ≈ 260°, Dec ≈ +30°) at distance ~30 Mpc — the **Local Void**.
   - Volume fades smoothly toward the cube edges; no hard cube outline visible.
4. **Toggle off, then on**: layer crossfades cleanly, no flicker.
5. **Intensity slider**: 0.0 → invisible, 2.0 → strong fog. No artifacts at extremes.
6. **Camera fly-through**: orbit/pan around the Local Group — the volume tracks correctly with the camera. Move out to ~500 Mpc — volume gracefully fades to nothing past the half-box clip.

If any of these fail, the bug is most likely in:
- The matrix in `cf4DensityMath.ts` (rotation direction, h-rescaling)
- The shader's `model_to_cf4` application or the half-box clip
- Uniform buffer offsets in `cf4DensityRenderer.ts`
- Render-pass ordering in `engine.ts`

Fix the bug, re-run all 6 visual checks. Do not commit `[x]` for this step until all 6 pass.

- [ ] **Step 9.6: Commit.**

```
git add src/services/engine/engine.ts
git commit -m "feat(cf4-dm): wire CF-4 density layer into engine + render pass"
```

---

### Task 10: Tuning pass (optional, only if Task 9 visual verification flagged issues)

**Background:** The transfer function colors and opacity ramp in `cf4Density.wgsl` are first-pass guesses. After visual verification, common tweaks:

- **Mean field too bright** → push `c1 = (0.05, 0.05, 0.10)` darker, or raise the `smoothstep(0.0, 1.0, t - 0.15)` threshold to `t - 0.25`.
- **Voids invisible** → boost the void color contribution.
- **Cluster cores blown out** → cap opacity at `0.6` rather than allowing the ramp to go to 1.0.
- **Cube edges visible** → check the half-box clip + the AABB intersection; one of them isn't actually clipping.

Apply tweaks, re-verify visually (Step 9.5), commit:

```
git add src/services/gpu/shaders/cf4Density.wgsl src/services/gpu/cf4DensityRenderer.ts
git commit -m "tune(cf4-dm): adjust transfer function after visual verification"
```

If Task 9 verification was clean, skip this task.

---

### Task 11: Self-review and final verify

- [ ] **Step 11.1: All tests + typecheck + build.**

```
npm run typecheck && npm test && npm run build
```

Expected: all green. Test count ≥ baseline + ~10 new tests (5 loader + 4 math + maybe 1 misc).

- [ ] **Step 11.2: Verify default-off behaviour.**

Open `http://localhost:5173` in a clean browser profile (or clear localStorage):

```
localStorage.clear(); location.reload();
```

Expected: layer is off; SettingsPanel shows the unchecked toggle.

- [ ] **Step 11.3: Verify graceful degradation when `.bin` is missing.**

```
mv public/data/cf4_density.bin /tmp/cf4_bin_backup
```

Reload the dev page. Expected: console says `cf4DensityLoader: ... not available; DM layer disabled`. SettingsPanel toggle is still there but flipping it does nothing (no error, just no-op). Restore:

```
mv /tmp/cf4_bin_backup public/data/cf4_density.bin
```

- [ ] **Step 11.4: Mark plan checklist.**

Mark every `- [ ]` in this plan as `- [x]`. Commit:

```
git add docs/superpowers/plans/2026-05-07-cf4-dm-volume-02-renderer.md
git commit -m "docs(cf4-dm): mark Plan 02 complete"
```

- [ ] **Step 11.5: Push and open PR (or push to main per session convention).**

```
git log --oneline main..HEAD
```

Expected: ~10 commits, one per task. Push and open PR per project convention (`gh pr create`). If the user has explicitly requested direct-to-main per the brainstorming session, push to main.

---

## Done

Plan 02 is complete when:

- ✅ `npm run typecheck && npm test && npm run build` all green.
- ✅ Toggling the SettingsPanel "Dark Matter (CF-4)" checkbox makes Laniakea / Local Void visible and toggling off restores the current scene.
- ✅ Intensity slider modulates 0 → 2.
- ✅ Missing `.bin` gracefully disables the layer (no errors).
- ✅ Visual verification (Step 9.5) all 6 checks pass.

The CF-4 dark-matter density volume render is now part of Skymap.
