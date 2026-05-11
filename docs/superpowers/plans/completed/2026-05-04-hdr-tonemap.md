# HDR + Tone-Map Post-Process Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the galaxy points / quads / disks into a `rgba16float` HDR
offscreen target instead of straight to the `bgra8unorm` swap chain, then
run a fullscreen tone-map pass with five selectable curves (Linear,
Reinhard-extended, Asinh stretch, Gamma 2.0, ACES filmic) so the user
can A/B compare different ways of compressing the HDR signal into the
displayable [0, 1] range. Eliminates the saturated-white "over-exposed"
cores that currently clamp at 1.0, and offers a Lupton-style asinh curve
that emphasises the low-end signal where cosmic-web filaments live.

**Architecture:** A single new texture (`rgba16float`, viewport-sized,
recreated on resize) sits between the existing render pipelines and the
swap chain. Every existing pipeline that _currently_ targets
`getPreferredCanvasFormat()` is reconstructed against `rgba16float`. The
engine's per-frame loop adds one extra render pass at the end that samples
the HDR texture and writes tone-mapped sRGB-encoded values into the swap
chain. The fragment shader branches on a `curve: u32` uniform between
Reinhard-extended and asinh — single shader, two code paths, instant
switch with no pipeline rebuild. The pick renderer is unchanged (its
`r32uint` target is untouched).

**Tech Stack:** WebGPU + WGSL. No new npm dependencies. Five tone-map
curves selectable at runtime via a `curve: u32` uniform:

- **Linear / Clamp** (`curve=0`): `clamp(c, 0, 1)`. No tone mapping
  — the baseline. Cluster cores saturate, filaments invisible.
  Useful as a "what is HDR buying us" reference.
- **Reinhard-extended** (`curve=1`): `c · (1 + c/W²) / (1 + c)`.
  Smooth highlight roll-off, "natural" look. Sensible default.
- **Asinh / Lupton** (`curve=2`): `asinh(k·c) / asinh(k)`. Linear
  near zero, log-like at high values. Aggressively lifts the low
  end where filaments live; SDSS's own image pipeline uses this.
- **Gamma 2.0** (`curve=3`): `pow(clamp(c, 0, 1), 0.5)`. Simple
  midtone lift; less surgical than asinh but trivially cheap.
- **ACES filmic (Narkowicz approx)** (`curve=4`): the modern
  cinematic S-curve. `(c·(2.51·c+0.03)) / (c·(2.43·c+0.59)+0.14)`.
  "Natural" cinematic look with shoulder + toe.

Fullscreen pass uses the standard "three-vertex covering triangle"
technique (no vertex buffer required). Switching curves at runtime is
a single 4-byte uniform write — no pipeline rebuild.

**Success criteria:**

- Bright cluster cores in SDSS / GLADE remain _brighter_ than mid-density
  regions instead of saturating to identical white.
- Switching to asinh visibly lifts mid-density / low-density regions —
  filamentary cosmic-web structure between clusters becomes legible.
- Switching back to Reinhard returns the smoother "natural" look.
- Linear/Clamp reproduces the pre-HDR look (cores blown out) — a
  baseline reference confirming what HDR is buying.
- ACES gives a cinematic S-curve alternative; Gamma 2.0 a simpler
  midtone lift. Five curves total in the dropdown.
- Schechter mode 3's redistribution is now visible (currently invisible
  because cores were already saturated and mode 3 just shifts where the
  saturation boundary lies).
- No regression: pick still works, selection halo still works, galaxy
  thumbnails still composite correctly.
- Two new engine handle methods (`setExposure`, `setToneMapCurve`) are
  available so the SettingsPanel can drive both.
- A dropdown in SettingsPanel switches between the two curves at
  runtime — no pipeline rebuild, no flicker.

---

## File Structure

**Create:**

- `src/data/toneMapCurve.ts` — `ToneMapCurve` enum + `ALL_TONE_MAP_CURVES`
  - `toneMapCurveLabel(curve)` helper, mirroring the pattern of
    `src/data/sources.ts` and `src/data/biasMode.ts`. Two values:
    `Reinhard = 0`, `Asinh = 1`.
- `src/services/gpu/hdrTarget.ts` — owns the `rgba16float` texture, its
  view, and the resize logic. Pure module: no `this`-state mutation;
  exposes a `createHdrTarget(device, size)` factory and a `resize` method.
- `src/services/gpu/toneMapPass.ts` — render pipeline + draw helper for
  the fullscreen tone-map post-process. Constructor takes the device and
  the swap-chain format; `draw(encoder, swapView, hdrView, exposure,
curve)` runs the pass.
- `src/services/gpu/shaders/toneMap.wgsl` — three-vertex covering tri +
  fragment shader that samples the HDR texture and branches on a
  `curve: u32` uniform between Reinhard-extended and asinh.
- `tests/services/gpu/toneMap.test.ts` — pure-math tests for both
  curves (monotonicity, asymptotes, exposure scaling), exported as TS
  helpers from `toneMapPass.ts` so they can be tested without spinning
  up WebGPU.

**Modify:**

- `src/services/gpu/device.ts` — keep `alphaMode: 'premultiplied'`. No
  format change. Just add a comment explaining why we _now_ render to
  `rgba16float` upstream and tone-map into this target downstream.
- `src/services/gpu/pointRenderer.ts` — change pipeline format from
  the constructor's `format` parameter to a literal `'rgba16float'`
  (or accept the target format as before; engine wires it differently).
  Pick whichever is cleaner; recommendation: **accept `targetFormat`
  via constructor**, engine passes `'rgba16float'`. Pickrenderer is
  unaffected.
- `src/services/gpu/quadRenderer.ts` — same change as pointRenderer.
- `src/services/gpu/diskRenderer.ts` — same change as pointRenderer.
- `src/services/engine/engine.ts` — at engine init, allocate the HDR
  target. Per-frame loop: render points/quads/disks into the HDR view
  (currently the swap-chain view), then run the tone-map pass writing
  to the swap chain view. On resize, recreate the HDR target.

---

## Task 0: Pre-flight check

- [ ] **Step 1: Confirm GPU support**

WebGPU's required minimum feature set already includes `rgba16float`
sampling and rendering on every browser/GPU that runs the project, so
no `requestDevice` feature flag changes are needed. Verify with one
quick browser-console check:

```js
// in DevTools after `npm run dev`:
const a = navigator.gpu.getPreferredCanvasFormat();
console.log({ preferredFormat: a, hdrSupported: 'rgba16float' });
```

Expected: prints the platform's preferred swap-chain format. (No actual
support check needed — `rgba16float` is core.)

- [ ] **Step 2: Snapshot baseline screenshot**

Open the app, frame any dense GLADE region, screenshot. Save to
`/tmp/hdr-baseline.png`. This is the "before" image for visual verify
in Task 5.

---

## Task 1: HDR target module

**Files:**

- Create: `src/services/gpu/hdrTarget.ts`
- Create: `tests/services/gpu/hdrTarget.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/services/gpu/hdrTarget.test.ts`:

```ts
/**
 * Tests for the HDR target factory.  WebGPU device APIs are mocked here
 * (Vitest runs in Node without a real GPU); we just verify the module
 * builds the right `createTexture` descriptor and exposes the expected
 * surface.
 */
import { describe, it, expect, vi } from 'vitest';
import { createHdrTarget } from '../../../src/services/gpu/hdrTarget';

function mockDevice() {
  const createTexture = vi.fn(() => ({
    createView: vi.fn(() => ({})),
    destroy: vi.fn(),
  }));
  return { createTexture } as unknown as GPUDevice;
}

describe('createHdrTarget', () => {
  it('allocates a rgba16float texture sized to the requested viewport', () => {
    const device = mockDevice();
    const target = createHdrTarget(device, { width: 1024, height: 768 });
    expect(device.createTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'rgba16float',
        size: { width: 1024, height: 768 },
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      }),
    );
    expect(target.view).toBeDefined();
    expect(typeof target.resize).toBe('function');
  });

  it('resize destroys the old texture and creates a new one', () => {
    const device = mockDevice();
    const target = createHdrTarget(device, { width: 512, height: 512 });
    target.resize({ width: 1024, height: 1024 });
    // Two creations: one initial, one after resize.
    expect(device.createTexture).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/services/gpu/hdrTarget.test.ts`
Expected: FAIL with module-not-found error.

- [ ] **Step 3: Implement the module**

Create `src/services/gpu/hdrTarget.ts`:

```ts
/**
 * hdrTarget — owns the rgba16float offscreen texture that every visible
 * draw pass renders into instead of the swap-chain.
 *
 * ### Why a dedicated module
 *
 * The HDR target's lifetime is "as long as the canvas size is constant" —
 * it gets thrown away and recreated on resize.  Keeping that lifecycle
 * outside the renderer classes (which own pipelines, vertex buffers, and
 * other long-lived resources) avoids tangling re-creation paths.  The
 * engine's resize handler calls `target.resize(...)` once per resize and
 * the new view propagates through the per-frame `draw(...)` calls.
 *
 * ### Why rgba16float and not rgba32float
 *
 * 16-bit half-float is the WebGPU minimum for sampleable + renderable
 * floating-point textures; 32-bit float requires the `float32-filterable`
 * feature on most platforms.  Half-float gives us ~5 decimal digits of
 * precision and a range of ±65 504, which is more than enough for our
 * additive billboard math (per-fragment alpha contributions in [0, 1],
 * accumulating to peaks of maybe a few hundred in the densest cluster
 * cores before tone-mapping).
 *
 * ### Why TEXTURE_BINDING + RENDER_ATTACHMENT
 *
 * RENDER_ATTACHMENT lets the points/quads/disks pipelines write into it.
 * TEXTURE_BINDING lets the tone-map fragment shader sample from it.
 * Both flags are required on the same texture — they're set as a bitmask
 * because WebGPU descriptors don't support "sample-or-render" tagging
 * after creation.
 */

export type Size = { readonly width: number; readonly height: number };

export type HdrTarget = {
  /** Current view, stable until the next `resize()` call. */
  readonly view: GPUTextureView;
  /** Recreate the underlying texture at a new size. Old view becomes invalid. */
  resize(size: Size): void;
  /** Tear down — call on engine destroy. */
  destroy(): void;
};

export function createHdrTarget(device: GPUDevice, size: Size): HdrTarget {
  let texture: GPUTexture | null = null;
  let view: GPUTextureView | null = null;

  function allocate(s: Size): void {
    if (texture) texture.destroy();
    texture = device.createTexture({
      format: 'rgba16float',
      size: { width: s.width, height: s.height },
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    view = texture.createView();
  }

  allocate(size);

  return {
    get view(): GPUTextureView {
      if (!view) throw new Error('hdrTarget: view accessed after destroy');
      return view;
    },
    resize(s: Size): void {
      allocate(s);
    },
    destroy(): void {
      if (texture) texture.destroy();
      texture = null;
      view = null;
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/services/gpu/hdrTarget.test.ts`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add src/services/gpu/hdrTarget.ts tests/services/gpu/hdrTarget.test.ts
git commit -m "feat(render): HDR target module (rgba16float, resizable)"
```

---

## Task 2: Tone-map shader + post-process pass

**Files:**

- Create: `src/services/gpu/shaders/toneMap.wgsl`
- Create: `src/services/gpu/toneMapPass.ts`
- Create: `tests/services/gpu/toneMap.test.ts`

- [ ] **Step 1: Write the tone-map math + its tests**

Create `tests/services/gpu/toneMap.test.ts`:

```ts
/**
 * Pure-math tests for all five tone-mapping curves.  Each curve is
 * exported from `toneMapPass.ts` as a JS helper so it can be unit-tested
 * without spinning up WebGPU.  The shader uses the same arithmetic, so
 * a regression in the JS form is a regression in the shader.
 *
 * For every curve we verify:
 *   - maps 0 → 0 (no negative/NaN flicker at black sky pixels)
 *   - is monotonic across the relevant input range
 *   - asymptotes / clamps to ≤ 1.0 at large input (no over-bright glitches)
 *   - exposure scales input multiplicatively (where applicable)
 *
 * Plus a few curve-specific assertions documented inline.
 */
import { describe, it, expect } from 'vitest';
import {
  linearClamp,
  reinhardExtended,
  asinhStretch,
  gamma2,
  acesFilmic,
} from '../../../src/services/gpu/toneMapPass';

const ALL_CURVES = [linearClamp, reinhardExtended, asinhStretch, gamma2, acesFilmic];

describe('tone-map curves — common invariants', () => {
  it('every curve maps 0 to 0', () => {
    for (const f of ALL_CURVES) {
      expect(f(0, 1)).toBeCloseTo(0, 6);
    }
  });

  it('every curve clamps output to [0, 1] across the practical input range', () => {
    for (const f of ALL_CURVES) {
      for (let c = 0; c < 100; c += 0.5) {
        const out = f(c, 1);
        expect(Number.isFinite(out)).toBe(true);
        expect(out).toBeGreaterThanOrEqual(0);
        expect(out).toBeLessThanOrEqual(1.001);
      }
    }
  });

  it('every curve is monotonic non-decreasing', () => {
    for (const f of ALL_CURVES) {
      let prev = -Infinity;
      for (let c = 0; c < 10; c += 0.1) {
        const out = f(c, 1);
        expect(out).toBeGreaterThanOrEqual(prev - 1e-6);
        prev = out;
      }
    }
  });
});

describe('linearClamp', () => {
  it('passes inputs through up to 1.0 then clamps', () => {
    expect(linearClamp(0.5, 1)).toBeCloseTo(0.5, 6);
    expect(linearClamp(1.0, 1)).toBeCloseTo(1.0, 6);
    expect(linearClamp(2.0, 1)).toBeCloseTo(1.0, 6);
  });

  it('exposure scales before clamp', () => {
    expect(linearClamp(0.4, 2)).toBeCloseTo(0.8, 6);
    expect(linearClamp(0.6, 2)).toBeCloseTo(1.0, 6); // clipped
  });
});

describe('reinhardExtended', () => {
  it('asymptotes toward 1 for large input', () => {
    expect(reinhardExtended(100, 1)).toBeGreaterThan(0.9);
  });

  it('exposure scales the input before mapping', () => {
    expect(reinhardExtended(0.5, 2)).toBeCloseTo(reinhardExtended(1.0, 1), 4);
  });
});

describe('asinhStretch', () => {
  it('asymptotes toward 1 for large input', () => {
    expect(asinhStretch(100, 1)).toBeGreaterThan(0.9);
  });

  it('lifts the low end more aggressively than reinhardExtended', () => {
    // The whole point of asinh: more weight on dim values, so for any
    // small c > 0 the asinh output should exceed reinhardExtended's at
    // the same exposure.  This is the filament-friendly behaviour.
    for (const c of [0.05, 0.1, 0.25, 0.5]) {
      const a = asinhStretch(c, 1);
      const r = reinhardExtended(c, 1);
      expect(a).toBeGreaterThan(r);
    }
  });
});

describe('gamma2', () => {
  it('reproduces sqrt for typical inputs (gamma 2.0)', () => {
    expect(gamma2(0.25, 1)).toBeCloseTo(0.5, 4);
    expect(gamma2(0.5, 1)).toBeCloseTo(Math.SQRT1_2, 4);
    expect(gamma2(1.0, 1)).toBeCloseTo(1.0, 4);
  });

  it('clamps inputs above 1 to 1 (post-clamp gamma)', () => {
    expect(gamma2(2.0, 1)).toBeCloseTo(1.0, 4);
  });
});

describe('acesFilmic', () => {
  it('produces an S-curve: small input mapped < linear, mid input ~ linear', () => {
    // ACES is shoulder+toe; very small c gets a slight toe lift but
    // stays below the linear identity, while mid values track close
    // to it.  Exact numbers depend on the Narkowicz approximation;
    // we just assert the qualitative shape.
    expect(acesFilmic(0.5, 1)).toBeGreaterThan(0.3);
    expect(acesFilmic(0.5, 1)).toBeLessThan(0.7);
  });

  it('asymptotes toward 1 for large input', () => {
    expect(acesFilmic(100, 1)).toBeGreaterThan(0.9);
  });
});
```

- [ ] **Step 2: Verify the test fails**

Run: `npx vitest run tests/services/gpu/toneMap.test.ts`
Expected: FAIL — `reinhardExtended` not exported.

- [ ] **Step 3: Implement the shader**

Create `src/services/gpu/shaders/toneMap.wgsl`:

```wgsl
// Fullscreen tone-map post-process — five selectable curves.
//
// Uses the "covering triangle" trick: a single triangle whose three
// vertices sit at (-1,-1), (3,-1), (-1,3) in clip space covers the
// entire viewport [-1,1]² with a 50 % overdraw budget that's free
// because we never sample those off-screen pixels.  No vertex buffer
// required.
//
// Curves, branched on `u.curve`:
//   curve=0 — Linear / Clamp.  Pre-HDR baseline, no tone mapping.
//             Cluster cores blow out, filaments invisible.  Reference.
//   curve=1 — Reinhard-extended `c·(1 + c/W²) / (1+c)`.  Smooth
//             roll-off near 1.0, "natural" look.  Default.
//   curve=2 — Asinh / Lupton 2004 `asinh(k·c) / asinh(k)`.  Linear
//             near zero, log-like at high values.  Aggressively lifts
//             dim regions — what SDSS's pipeline uses for filaments.
//   curve=3 — Gamma 2.0 `pow(clamp(c, 0, 1), 0.5)`.  Simple midtone
//             lift; cheap, less surgical than asinh.
//   curve=4 — ACES filmic (Narkowicz 2015 approximation):
//             `(c·(2.51·c+0.03)) / (c·(2.43·c+0.59)+0.14)`, clamped.
//             Cinematic S-curve with shoulder + toe.

struct ToneMapUniforms {
  exposure: f32,
  // whitepoint² (pre-squared CPU-side) for Reinhard-extended.
  whitepointSq: f32,
  // softening constant for asinh stretch — controls where the curve
  // transitions from linear to logarithmic.  Default 10.
  asinhSoftness: f32,
  // 0..4 — see header comment for the curve→value mapping.
  curve: u32,
}

@group(0) @binding(0) var hdrTex: texture_2d<f32>;
@group(0) @binding(1) var hdrSamp: sampler;
@group(0) @binding(2) var<uniform> u: ToneMapUniforms;

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  let x = f32(((vi << 1u) & 2u));
  let y = f32(vi & 2u);
  var out: VSOut;
  out.clip = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2<f32>(x, y);
  return out;
}

// Linear / Clamp — no tone map.  Saturates at 1.0.
fn applyLinear(c: vec3<f32>) -> vec3<f32> {
  return clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
}

// Reinhard-extended per channel: c * (1 + c/W²) / (1 + c).
fn applyReinhard(c: vec3<f32>, wsq: f32) -> vec3<f32> {
  return c * (vec3<f32>(1.0) + c / vec3<f32>(wsq)) / (vec3<f32>(1.0) + c);
}

// Asinh stretch (Lupton-style): asinh(k·c) / asinh(k).
fn applyAsinh(c: vec3<f32>, k: f32) -> vec3<f32> {
  // WGSL has no vector asinh — hand-vectorise.
  return vec3<f32>(
    asinh(k * c.x) / asinh(k),
    asinh(k * c.y) / asinh(k),
    asinh(k * c.z) / asinh(k),
  );
}

// Gamma 2.0 = sqrt of clamped input.  WGSL `pow(c, 0.5)` works but
// `sqrt` is the dedicated intrinsic and slightly faster.
fn applyGamma2(c: vec3<f32>) -> vec3<f32> {
  return sqrt(clamp(c, vec3<f32>(0.0), vec3<f32>(1.0)));
}

// ACES filmic (Narkowicz 2015 closed-form approximation).  Lifts toe,
// rolls off shoulder, S-curves through midtone.  No exposure division
// — caller handles that via the exposure multiplier above.
fn applyAces(c: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let d = 2.43;
  let e = 0.59;
  let f = 0.14;
  return clamp(
    (c * (a * c + vec3<f32>(b))) / (c * (d * c + vec3<f32>(e)) + vec3<f32>(f)),
    vec3<f32>(0.0),
    vec3<f32>(1.0),
  );
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let hdr = textureSample(hdrTex, hdrSamp, in.uv).rgb;
  let scaled = hdr * u.exposure;
  // Dynamic-uniform branch — `curve` is identical across all fragments
  // in a frame, so the GPU's branch predictor handles this efficiently.
  // We use a chain of `if`s rather than a `switch` because WGSL's
  // `switch` semantics are slightly stricter (must end in `default`)
  // and the chain is cleaner with fall-through-impossible curves.
  var mapped: vec3<f32>;
  if (u.curve == 0u) {
    mapped = applyLinear(scaled);
  } else if (u.curve == 1u) {
    mapped = applyReinhard(scaled, u.whitepointSq);
  } else if (u.curve == 2u) {
    mapped = applyAsinh(scaled, u.asinhSoftness);
  } else if (u.curve == 3u) {
    mapped = applyGamma2(scaled);
  } else {
    // curve == 4u (Aces) or any unknown value — fall through to ACES
    // as the most cinematic-looking default.
    mapped = applyAces(scaled);
  }
  // Output is opaque — alpha doesn't matter because the swap-chain
  // is configured `alphaMode: 'premultiplied'` and we just composited
  // the entire scene already.
  return vec4<f32>(mapped, 1.0);
}
```

- [ ] **Step 4: Implement the ToneMapCurve enum**

Create `src/data/toneMapCurve.ts`:

```ts
/**
 * Selectable tone-mapping curves for the HDR post-process.  Mirrors
 * the pattern of `src/data/sources.ts` and `src/data/biasMode.ts`
 * (numeric enum + ALL_* array + label fn).  The numeric values land
 * verbatim in the shader's `curve: u32` uniform so DON'T renumber
 * without also updating `toneMap.wgsl`.
 */
export const ToneMapCurve = {
  /** Linear / Clamp — no tone mapping; pre-HDR baseline. */
  Linear: 0,
  /** Reinhard-extended — smooth, "natural" highlight roll-off. */
  Reinhard: 1,
  /** Asinh stretch — Lupton-style, lifts dim filamentary structure. */
  Asinh: 2,
  /** Gamma 2.0 — simple sqrt-style midtone lift. */
  Gamma2: 3,
  /** ACES filmic (Narkowicz approx) — cinematic S-curve. */
  Aces: 4,
} as const;

export type ToneMapCurve = (typeof ToneMapCurve)[keyof typeof ToneMapCurve];

export const ALL_TONE_MAP_CURVES: ReadonlyArray<ToneMapCurve> = [
  ToneMapCurve.Linear,
  ToneMapCurve.Reinhard,
  ToneMapCurve.Asinh,
  ToneMapCurve.Gamma2,
  ToneMapCurve.Aces,
];

export function toneMapCurveLabel(curve: ToneMapCurve): string {
  switch (curve) {
    case ToneMapCurve.Linear:
      return 'Linear (baseline)';
    case ToneMapCurve.Reinhard:
      return 'Reinhard (natural)';
    case ToneMapCurve.Asinh:
      return 'Asinh (filaments)';
    case ToneMapCurve.Gamma2:
      return 'Gamma 2.0';
    case ToneMapCurve.Aces:
      return 'ACES (cinematic)';
  }
}
```

- [ ] **Step 5: Implement the JS side (pass class + JS-mirror of both curves)**

Create `src/services/gpu/toneMapPass.ts`:

```ts
/**
 * toneMapPass — fullscreen post-process that compresses HDR values
 * from the rgba16float offscreen target into the displayable [0, 1]
 * range of the swap chain.
 *
 * ### Why post-process, not in-shader per pipeline
 *
 * Every renderer (point, quad, disk) writes its own HDR contribution
 * into the same target with additive blending.  Doing tone-mapping
 * in each renderer's fragment stage would tone-map *each contribution*
 * independently — but tone-mapping is a non-linear operation, so
 * `tonemap(a + b) ≠ tonemap(a) + tonemap(b)`.  The whole point of
 * the HDR pass is to let contributions accumulate linearly and *then*
 * compress.  Hence: one post-process at the end of the frame.
 *
 * ### Two curves, one pass
 *
 * The shader branches on a `curve: u32` uniform between Reinhard-
 * extended and asinh.  Switching curves at runtime is a single
 * `device.queue.writeBuffer` of 4 bytes — no pipeline rebuild, no
 * shader recompile, no perceptible lag.  See the WGSL shader's
 * header comment for the rationale on each curve.
 */

import toneMapWgsl from './shaders/toneMap.wgsl?raw';
import { ToneMapCurve } from '../../data/toneMapCurve';

/** Default whitepoint for Reinhard-extended — input value where the curve reaches 1.0. */
const DEFAULT_WHITEPOINT = 4.0;

/** Default softness for asinh stretch — higher = more aggressive low-end lift. */
const DEFAULT_ASINH_SOFTNESS = 10.0;

// JS-mirrors of every WGSL curve.  Kept by-hand-in-sync so the unit
// tests catch shader regressions before they ship.

export function linearClamp(c: number, exposure: number): number {
  return Math.max(0, Math.min(1, c * exposure));
}

export function reinhardExtended(
  c: number,
  exposure: number,
  whitepoint: number = DEFAULT_WHITEPOINT,
): number {
  const x = c * exposure;
  const wsq = whitepoint * whitepoint;
  return (x * (1 + x / wsq)) / (1 + x);
}

export function asinhStretch(
  c: number,
  exposure: number,
  softness: number = DEFAULT_ASINH_SOFTNESS,
): number {
  const x = c * exposure;
  return Math.asinh(softness * x) / Math.asinh(softness);
}

export function gamma2(c: number, exposure: number): number {
  return Math.sqrt(Math.max(0, Math.min(1, c * exposure)));
}

export function acesFilmic(c: number, exposure: number): number {
  // Narkowicz 2015 closed-form ACES approximation.
  const x = c * exposure;
  const a = 2.51,
    b = 0.03,
    d = 2.43,
    e = 0.59,
    f = 0.14;
  return Math.max(0, Math.min(1, (x * (a * x + b)) / (x * (d * x + e) + f)));
}

export type ToneMapPass = {
  draw(
    encoder: GPUCommandEncoder,
    swapView: GPUTextureView,
    hdrView: GPUTextureView,
    exposure: number,
    curve: ToneMapCurve,
  ): void;
  destroy(): void;
};

export function createToneMapPass(device: GPUDevice, swapFormat: GPUTextureFormat): ToneMapPass {
  const module = device.createShaderModule({ code: toneMapWgsl });

  const sampler = device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest',
  });

  // Uniform layout: [exposure: f32, whitepointSq: f32, asinhSoftness: f32,
  // curve: u32] — 16 bytes total, naturally 16-byte aligned.
  const uniformBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: { module, entryPoint: 'vs' },
    fragment: {
      module,
      entryPoint: 'fs',
      targets: [{ format: swapFormat }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // Mixed f32/u32 uniform — pack via two views over the same ArrayBuffer.
  const uniformBytes = new ArrayBuffer(16);
  const uniformF32 = new Float32Array(uniformBytes);
  const uniformU32 = new Uint32Array(uniformBytes);

  return {
    draw(encoder, swapView, hdrView, exposure, curve) {
      uniformF32[0] = exposure;
      uniformF32[1] = DEFAULT_WHITEPOINT * DEFAULT_WHITEPOINT;
      uniformF32[2] = DEFAULT_ASINH_SOFTNESS;
      uniformU32[3] = curve >>> 0;
      device.queue.writeBuffer(uniformBuffer, 0, uniformBytes);

      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: hdrView },
          { binding: 1, resource: sampler },
          { binding: 2, resource: { buffer: uniformBuffer } },
        ],
      });

      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: swapView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();
    },
    destroy(): void {
      uniformBuffer.destroy();
    },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/services/gpu/toneMap.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/toneMapPass.ts \
        src/services/gpu/shaders/toneMap.wgsl \
        tests/services/gpu/toneMap.test.ts
git commit -m "feat(render): tone-map post-process (Reinhard-extended) + shader"
```

---

## Task 3: Wire renderers to the HDR target

**Files:**

- Modify: `src/services/gpu/pointRenderer.ts`
- Modify: `src/services/gpu/quadRenderer.ts`
- Modify: `src/services/gpu/diskRenderer.ts`
- Modify: `src/services/engine/engine.ts`

The renderers already accept `format` as a constructor parameter, so this
task is mostly engine-side — pass `'rgba16float'` instead of the swap-chain
format. No renderer code changes are strictly required, but we should add
clarifying comments at each construction site.

- [ ] **Step 1: Engine init — allocate HDR target and tone-map pass**

In `src/services/engine/engine.ts`, near the existing
`const { device, context, format } = await initGpu(canvas);` line:

```ts
import { createHdrTarget } from '../gpu/hdrTarget';
import { createToneMapPass } from '../gpu/toneMapPass';

// ...

const { device, context, format } = await initGpu(canvas);

// HDR offscreen target — every visible draw pass writes here at
// rgba16float precision.  The tone-map pass below compresses the
// accumulated linear-light values into the swap chain's [0, 1] range
// at the end of every frame.  See docs/superpowers/plans/2026-05-04-
// hdr-tonemap.md for the full rationale.
const hdrTarget = createHdrTarget(device, {
  width: canvas.width,
  height: canvas.height,
});

const toneMapPass = createToneMapPass(device, format);
let exposure = 1.0; // future settings-panel slider drives this
```

- [ ] **Step 2: Engine renderers — construct against rgba16float**

Find the three renderer constructions (around lines 453, 484, 490 today).
Replace `format` with the literal `'rgba16float'`:

```ts
renderer = new PointRenderer(device, 'rgba16float');
// (also pickRenderer below — leave alone, it targets r32uint)
const quadRenderer = new QuadRenderer({
  device,
  context,
  format: 'rgba16float',
  canvas,
});
const diskRenderer = new DiskRenderer({
  device,
  context,
  format: 'rgba16float',
  canvas,
});
```

- [ ] **Step 3: Engine per-frame — render to HDR view, then tone-map**

In the frame loop (around line 917 today), change the colorAttachment view:

```ts
const pass = encoder.beginRenderPass({
  colorAttachments: [
    {
      // Was: context.getCurrentTexture().createView()
      view: hdrTarget.view,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    },
  ],
});

// ... existing draws into `pass` (renderer.draw, quadRenderer, diskRenderer)
pass.end();

// New: tone-map the HDR target into the swap chain.
toneMapPass.draw(encoder, context.getCurrentTexture().createView(), hdrTarget.view, exposure);
```

The existing `pass.end()` and `device.queue.submit` calls stay where they
are — both passes get encoded into the same command encoder and submitted
together.

- [ ] **Step 4: Engine resize — recreate HDR target**

Find the existing resize handler (search for `canvas.width` and the
`getCurrentTexture` reconfigure logic). After the swap chain reconfigure,
add:

```ts
hdrTarget.resize({ width: canvas.width, height: canvas.height });
```

- [ ] **Step 5: Engine destroy — tear down HDR + tone-map**

In the existing destroy / cleanup path:

```ts
hdrTarget.destroy();
toneMapPass.destroy();
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: 358+ passing (no regression — existing tests don't exercise the
GPU path).

- [ ] **Step 8: Commit**

```bash
git add src/services/engine/engine.ts
git commit -m "feat(render): route point/quad/disk passes through HDR target + tone-map"
```

---

## Task 4: Engine handle methods + SettingsPanel dropdown

**Files:**

- Modify: `src/@types/EngineHandle.d.ts`
- Modify: `src/@types/EngineCallbacks.d.ts`
- Modify: `src/services/engine/engine.ts`
- Modify: `src/components/SettingsPanel/SettingsPanel.tsx`
- Modify: `src/App.tsx`

We expose two engine handle methods — `setExposure` and
`setToneMapCurve` — and add a single dropdown (curve selector) to the
SettingsPanel so the user can compare Reinhard vs Asinh. The exposure
slider is OUT OF SCOPE here; `setExposure` ships ready for future UI but
no slider lands in this plan (keep the panel addition tight).

- [ ] **Step 1: Extend the EngineHandle type**

In `src/@types/EngineHandle.d.ts`:

```ts
/**
 * Set the tone-map exposure multiplier.  Higher values brighten the
 * HDR signal *before* the curve compresses it; the default of 1.0
 * preserves the existing brightness.  Useful range is roughly
 * [0.25, 4.0].  Forwarded into the tone-map pass uniform on the next
 * rendered frame — no pipeline rebuild.
 */
setExposure?(value: number): void;

/**
 * Switch the tone-mapping curve at runtime.  Values come from
 * `data/toneMapCurve.ts` (Reinhard = 0, Asinh = 1).  The change takes
 * effect on the next rendered frame via the tone-map pass uniform —
 * no pipeline rebuild.
 */
setToneMapCurve?(curve: ToneMapCurve): void;
```

(Add the `import type { ToneMapCurve } from '../data/toneMapCurve'`
near the top of the file.)

- [ ] **Step 2: Extend the EngineCallbacks type**

In `src/@types/EngineCallbacks.d.ts`:

```ts
/**
 * Echoed by the engine on init *and* after every `setToneMapCurve`
 * call so React's SettingsPanel state stays in sync with engine truth.
 * Same pattern as `onBiasModeChange`.
 */
onToneMapCurveChange?: (curve: ToneMapCurve) => void;
```

- [ ] **Step 3: Wire engine.ts**

Add to the engine's closure scope (near `let exposure = 1.0;`):

```ts
import { ToneMapCurve } from '../../data/toneMapCurve';

// ...
// Default to Reinhard, not Linear — Linear=0 is the "no tone map"
// reference baseline, useful for comparison but not what the user
// wants to look at on first frame.  Reinhard preserves the HDR signal
// with smooth roll-off and is the cinematic-default the rest of the
// industry has converged on.
let toneMapCurve: ToneMapCurve = ToneMapCurve.Reinhard;
```

Update the per-frame `toneMapPass.draw(...)` call to forward the
current curve:

```ts
toneMapPass.draw(
  encoder,
  context.getCurrentTexture().createView(),
  hdrTarget.view,
  exposure,
  toneMapCurve,
);
```

Seed the callback once at engine init (just after the existing bias-
mode echo):

```ts
cb.onToneMapCurveChange?.(toneMapCurve);
```

Add to the returned handle object:

```ts
setExposure(value) {
  exposure = Math.max(0.05, Math.min(16, value));
},
setToneMapCurve(curve) {
  toneMapCurve = curve;
  cb.onToneMapCurveChange?.(curve);
},
```

- [ ] **Step 4: SettingsPanel dropdown**

In `src/components/SettingsPanel/SettingsPanel.tsx`:

1. Add the import: `import { ToneMapCurve, ALL_TONE_MAP_CURVES, toneMapCurveLabel } from '../../data/toneMapCurve';`
2. Add props (mirror the existing bias-mode dropdown):

```tsx
toneMapCurve?: ToneMapCurve;
onToneMapCurveChange?: (curve: ToneMapCurve) => void;
```

3. Destructure them in the function signature.
4. Add a render block (find the existing biasMode dropdown for the
   pattern; place the new section directly above or below it):

```tsx
{
  toneMapCurve !== undefined && onToneMapCurveChange !== undefined && (
    <>
      <div className={styles.panelRow}>
        <label htmlFor="tonemap-curve">Tone curve</label>
        <select
          id="tonemap-curve"
          value={toneMapCurve}
          onChange={(e) => onToneMapCurveChange(parseInt(e.target.value, 10) as ToneMapCurve)}
        >
          {ALL_TONE_MAP_CURVES.map((c) => (
            <option key={c} value={c}>
              {toneMapCurveLabel(c)}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.panelDivider} role="separator" />
    </>
  );
}
```

- [ ] **Step 5: App.tsx — state + callback wiring**

Add a `useState<ToneMapCurve>(ToneMapCurve.Reinhard)` near the bias-mode
state. Wire the callback on the `createEngine` call (mirror
`onBiasModeChange: setBiasMode`). Pass `toneMapCurve` and
`onToneMapCurveChange` into the SettingsPanel call:

```tsx
toneMapCurve={toneMapCurve}
onToneMapCurveChange={(curve) => {
  setToneMapCurve(curve);
  handleRef.current?.setToneMapCurve?.(curve);
}}
```

- [ ] **Step 6: Typecheck + run all tests**

Run: `npx tsc --noEmit && npm test`
Expected: 0 type errors, all tests pass (382+ from baseline).

- [ ] **Step 7: Commit**

```bash
git add src/@types/EngineHandle.d.ts src/@types/EngineCallbacks.d.ts \
        src/services/engine/engine.ts \
        src/components/SettingsPanel/SettingsPanel.tsx \
        src/App.tsx
git commit -m "feat(ui): tone-curve dropdown (Reinhard / Asinh) + setExposure handle"
```

---

## Task 5: Visual verification

**Files:** none (visual check only)

- [ ] **Step 1: Reload the dev server**

The dev server stays running per project convention; just reload the
browser tab.

- [ ] **Step 2: Compare against the baseline**

Frame the same dense GLADE region screenshotted in Task 0 Step 2.
Take a new screenshot, save to `/tmp/hdr-after.png`.

Expected differences:

- Bright cluster cores no longer pure white; they're brighter than
  the surrounding mid-density regions but visibly distinguishable.
- Dim outskirts may be slightly darker (the Reinhard curve compresses
  the upper end without affecting the lower end much).
- Sky background unchanged (additive contribution there is near zero).

- [ ] **Step 3: Test exposure slider via DevTools**

```js
// in DevTools:
window.__engine.setExposure(0.5); // dimmer
window.__engine.setExposure(2.0); // brighter
window.__engine.setExposure(1.0); // back to default
```

(Engine handle exposure on `window.__engine` may need a one-line export
in App.tsx — check; if it's not there, swap to engine handle's existing
debug surface.)

Expected: each call should re-render the next frame at the new exposure
without any geometry rebuild — instant visual change.

- [ ] **Step 4: Verify all five tone-curve options switch live**

Settings panel → "Tone curve" dropdown. Cycle through every option:

| Curve              | Expected look                                            |
| ------------------ | -------------------------------------------------------- |
| Linear (baseline)  | Cores blown out to white; filaments invisible (pre-HDR)  |
| Reinhard (natural) | Smooth, "natural" — cores brighter than mid, no clipping |
| Asinh (filaments)  | Mid/dim regions visibly lifted; filaments stand out      |
| Gamma 2.0          | Brighter midtones than Reinhard, cleaner highlights      |
| ACES (cinematic)   | S-curve; punchier contrast, slight toe lift              |

Switching should be instant (single uniform write — no flicker,
no pipeline rebuild).

- [ ] **Step 5: Verify Schechter mode 3 is now visible**

Settings panel → density correction → "Schechter LF". The mode 3 alpha
re-distribution should now be _visible_ (it isn't currently because
saturated cores were swallowing the per-galaxy ratio difference).
Particularly clear under the Asinh curve where dim galaxies are lifted.

- [ ] **Step 6: Verify pick still works**

Hover a galaxy → InfoCard updates. Click → selection halo appears.
The pick renderer is on a separate `r32uint` target and should be
entirely unaffected.

---

## Task 6: README update

**Files:**

- Modify: `README.md` (or `docs/architecture.md` if it exists — check)

- [ ] **Step 1: Add a "Render pipeline" sentence**

Search the README for any mention of the swap chain or rendering. Add
or update a sentence:

```markdown
Visible draw passes (points, quads, disks) render into a `rgba16float`
HDR offscreen target. A fullscreen tone-map pass (Reinhard-extended,
exposure-scaled) compresses the accumulated linear-light values into
the swap chain's displayable range. See
`docs/superpowers/plans/2026-05-04-hdr-tonemap.md` for the rationale.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(render): note HDR + tone-map pipeline in README"
```

---

## Out of scope (deliberately)

- **Settings-panel exposure slider.** The engine handle exposes
  `setExposure()`, but no UI ships in this plan. A follow-up plan
  ("expose exposure slider in SettingsPanel") is one task long.
- **ACES tone-mapping.** Reinhard-extended is the chosen curve. ACES
  is on the table for a future visual upgrade if Reinhard's
  desaturation behaviour becomes a complaint.
- **Bloom / glare post-process.** Big visual win for starfields, but
  out of scope for this plan. Add as a separate post-process pass
  after this one lands.
- **Per-channel exposure.** Single scalar exposure only. Per-channel
  white-balance shifts could come later.
- **HDR tone-mapping for the pick renderer.** Pick targets `r32uint`,
  unaffected by this plan.

---

## Self-Review checklist

- [x] Every visible renderer (point, quad, disk) is reconstructed against
      `'rgba16float'` (Task 3 Step 2).
- [x] Pick renderer is explicitly noted as unchanged (Task 3 Step 2 +
      Task 5 Step 5).
- [x] HDR target is recreated on resize (Task 3 Step 4).
- [x] HDR target is destroyed on engine destroy (Task 3 Step 5).
- [x] Tone-map pass writes to the swap chain (Task 3 Step 3).
- [x] Reinhard-extended curve is unit-tested (Task 2 Step 1).
- [x] No new npm dependencies.
- [x] Engine handle exposes `setExposure` for future UI (Task 4).
- [x] Type names consistent (`HdrTarget`, `ToneMapPass`, `Size`).
- [x] No placeholders in step bodies — every code block is concrete.
- [x] File paths match current repo layout (`src/services/gpu/`,
      `src/services/engine/`, `tests/services/gpu/`).

## Execution handoff

Plan saved at `docs/superpowers/plans/2026-05-04-hdr-tonemap.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
