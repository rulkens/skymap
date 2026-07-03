# Galaxy Renderer 02 — WebGPU engine & WESL shaders

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention. Steps use checkbox (`- [ ]`) syntax for tracking. **Load the `wesl-shaders` skill before any `.wesl` task and the `create-component` skill before the Viewport task.**

**Spec:** `docs/superpowers/specs/2026-07-02-galaxy-renderer-tool-design.md`
**Series:** plan 02 of 3. Requires plan 01 (model + scaffold) landed. After this plan, `npm run galaxy-renderer` shows a live, orbitable, bloomed galaxy.

**Goal:** Port the spike's `galaxy-engine.js` + `galaxy-shaders.js` into `tools/galaxy-renderer/src/engine/`: seven WESL shaders, `createGalaxyEngine(canvas, opts) → GalaxyEngineHandle` with the five-pass HDR chain (additive stars → absorptive dust → bright-pass → 5-level dual-filter bloom pyramid → tonemap composite), engine-internal camera input, worker-backed regeneration — with every pure calculation extracted to a tested helper.

**Architecture:** `GalaxyEngineHandle` is kept **verbatim** as the spike's public surface — it is the future main-app seam and plan 03's bridge target. GPU orchestration (pipelines, targets, frame loop, input listeners) stays in one `createGalaxyEngine.ts`, verified visually like every renderer in this repo; the five pure functions it leans on (`orbitEye`, `panAxes`, `packCameraUniforms`, `bakeExtraTransform`, `lensShift`) live one-per-file with focused tests. Matrices come from **wgpu-matrix** (dst arg LAST and optional; `mat4.create()` returns zeros; `mat4.lookAt` returns the view matrix directly and `mat4.perspective` maps depth to [0,1] — see `src/utils/camera/computeViewProj.ts` for the worked explanation). The spike's hand-rolled mat4 helpers in `galaxy-math.js` are ported nowhere.

**Tech Stack:** TypeScript, WebGPU, WESL (`?static` build-time linking), wgpu-matrix, React (Viewport only), Vitest for the pure parts.

**Reference source:** the spike at `/Users/rulkens/Downloads/galaxy-renderer/` — cited as `galaxy-engine.js:NNN` / `galaxy-shaders.js:NNN`. Implementers MUST read the cited lines.

## Global Constraints

- Worktree `.claude/worktrees/better-galaxy-renderer`; commands from its root; `npm test` + `npm run typecheck` green before every commit; stage specific paths only.
- **Behaviour-identical port**: every constant below is verbatim-with-cite. A deliberate deviation is flagged `DEVIATION:` inline; there are exactly two (projection z-range, shared fullscreen-tri vertex) and no others may be introduced.
- WESL discipline (wesl-shaders skill): NO backticks in `.wesl` comments (single quotes for identifiers); all `import` lines at the very top; one identifier per `import` (no brace lists); prefix is the literal `package::`; the tool's `wesl.toml` (root `src/engine/shaders`, landed in plan 01) is what makes `package::lib::…` resolve.
- Standing WebGPU rules: `layout: 'auto'` bind groups are built per-pipeline and NEVER shared across pipelines; per-instance data is baked into vertex buffers, never mutated mid-frame via uniforms; every GPU resource gets a `label:`; shader modules go through `createShaderModuleWithDevLog` from `src/services/gpu/shaderCompileLogger.ts` (relative import `../../../../src/services/gpu/shaderCompileLogger` — flow-workbench imports from `src/` the same way).
- DELIBERATE house-ethos deviation (spec-sanctioned): continuous rAF loop, **no render-on-demand** — the FPS badge under sustained load is the tool's perf instrument. Do not "improve" this.
- House conventions as in plan 01 (types/one-per-file, Vec3 aliases, didactic comments, typed `vi.fn`).

---

## Task 1 — engine types

**Files**
- Create under `tools/galaxy-renderer/@types/engine/` (one type per `.d.ts`):
  `GalaxyEngineHandle.d.ts`, `GalaxyEngineOptions.d.ts`, `RenderSettings.d.ts`, `LodSettings.d.ts`, `TonemapMode.d.ts`, `ViewPose.d.ts`, `ExtraGalaxySpec.d.ts`, `EngineStats.d.ts`

**Interfaces**

```ts
export type TonemapMode = 0 | 1 | 2 | 3 | 4;  // ACES | Reinhard | Reinhard-ext | Uncharted 2 | linear
```

```ts
export type RenderSettings = {
  readonly exposure: number;      // default 0.92   — galaxy-engine.js:166
  readonly bloom: number;         // default 0.85
  readonly saturation: number;    // default 1.26
  readonly vignette: number;      // default 0.5
  readonly sizeScale: number;     // default 1.0 (engine); the UI seeds 0.3 in plan 03
  readonly starIntensity: number; // default 0.11
  readonly tonemap: TonemapMode;  // default 0
};
```

```ts
export type LodSettings = {
  readonly lodApparent: number;  // min on-screen size before flux-conserving fade; 0 = off
  readonly cullBright: number;   // hard cull of stars fainter than this; 0 = off
};
```

The GPU already separates these two bags (camera UBO vs composite UBO — see Task 3's layout); the split type surface mirrors that and is why plan 03 gives `lod` its own slice. Do not merge them.

```ts
export type ViewPose = { readonly az: number; readonly el: number; readonly dist: number };
export type EngineStats = { readonly stars: number; readonly dust: number };
export type ExtraGalaxySpec = {
  readonly params: GalaxyParams;
  readonly pos: Vec3;
  readonly scale: number;
  readonly rotY: number;
  readonly tiltX: number;
};
export type GalaxyEngineOptions = {
  readonly autoRotate?: boolean;                       // default true — galaxy-engine.js:161
  readonly onFps?: (fps: number) => void;              // rounded, every 0.5 s — :334-338
  readonly onStats?: (stats: EngineStats) => void;     // after each setParams — :180
};
```

```ts
export type GalaxyEngineHandle = {
  setParams(params: GalaxyParams): Promise<void>;               // regenerate via worker
  setRender(patch: Partial<RenderSettings & LodSettings>): void; // live, no regen
  setView(pose: Partial<ViewPose>): void;
  setAutoRotate(on: boolean): void;
  setInsets(left: number, right: number): void;                  // CSS px of overlaid panels
  setExtras(specs: readonly ExtraGalaxySpec[]): Promise<void>;   // token-guarded replace
  step(now?: number): void;                                      // one frame (headless / fit loop)
  sample(): Promise<{ mean: number; max: number; litPct: number; stars: number }>;
  grab(size?: number): Promise<{ S: number; data: Uint8ClampedArray }>; // default 480 — :366
  getCamera(): ViewPose;
  dispose(): void;
};
```

These names are consumed verbatim by plan 03's bridge/matcher — they may not drift.

**Steps**
- [x] Create the eight files (contract-only task: no test of its own; `npm run typecheck` is the gate — it fails on any import the later tasks disagree with).
- [x] `npm run typecheck` → green. Commit.

---

## Task 2 — pure camera helpers: `orbitEye`, `panAxes`, `lensShift`

**Files**
- Create: `tools/galaxy-renderer/src/engine/orbitEye.ts`, `.../engine/panAxes.ts`, `.../engine/lensShift.ts`
- Tests: `tests/tools/galaxy-renderer/engine/orbitEye.test.ts`, `.../panAxes.test.ts`, `.../lensShift.test.ts`

**Interfaces**

```ts
export function orbitEye(az: number, el: number, dist: number, target: Readonly<Vec3>): Vec3;
// galaxy-engine.js:277-282: target + dist·[cos el·cos az, sin el, cos el·sin az]
```

```ts
export function panAxes(az: number, el: number): { readonly right: Vec3; readonly up: Vec3 };
// galaxy-engine.js:231-234: right = [sin az, 0, −cos az]; up = [−sin el·cos az, cos el, −sin el·sin az]
```

```ts
export function lensShift(insetLeft: number, insetRight: number, clientWidthPx: number): number;
// galaxy-engine.js:285: (insetRight − insetLeft) / max(1, clientWidthPx) — written into proj[8]
// (column-major col 2 row 0) to re-centre the galaxy in the un-panelled screen area.
```

**Steps**
- [x] Failing tests:
  - orbitEye: `el=0, az=0 puts the eye at target + [dist, 0, 0]`; `el=π/2 puts the eye dist above the target` (within 1e-12); `distance from target is always dist` (several az/el probes); `target offsets translate the eye`.
  - panAxes: `right and up are unit length` (probe several az/el); `right is horizontal` (y === 0); `right ⊥ up` (dot ≈ 0); `at el=0 up is +Y`.
  - lensShift: `symmetric insets give zero shift`; `a wider right panel shifts positive` (compare panel widths 390 vs 0); `magnitude is inset delta over client width`; `zero client width does not divide by zero` (max(1,…) guard).
- [x] Run the three files → fail. Implement. Run → pass. Commit.

---

## Task 3 — `packCameraUniforms` (112-byte UBO)

**Files**
- Create: `tools/galaxy-renderer/src/engine/packCameraUniforms.ts`
- Test: `tests/tools/galaxy-renderer/engine/packCameraUniforms.test.ts`

**Interfaces**

```ts
export function packCameraUniforms(
  viewProj: Float32Array,   // 16 floats, column-major (mat4.multiply(proj, view))
  view: Float32Array,       // 16 floats — right/up are read from its rotation rows
  args: { readonly sizeScale: number; readonly starIntensity: number; readonly lodApparent: number; readonly cullBright: number },
  dst?: Float32Array,       // 28 floats; allocated when omitted (wgpu-matrix dst-last idiom)
): Float32Array;
```

Byte layout — matches WGSL `struct Cam { viewProj: mat4x4<f32>, right: vec4<f32>, up: vec4<f32>, params: vec4<f32> }` (galaxy-shaders.js:7-12; packing at galaxy-engine.js:287-292):

| floats | bytes | content |
| --- | --- | --- |
| 0–15 | 0–63 | viewProj (column-major) |
| 16–19 | 64–79 | camera right in world space: `view[0], view[4], view[8]`, 0 |
| 20–23 | 80–95 | camera up in world space: `view[1], view[5], view[9]`, 0 |
| 24–27 | 96–111 | `sizeScale, starIntensity, lodApparent, cullBright` |

Total **112 bytes** — the engine's `camBuf` size (galaxy-engine.js:25). The rows-of-the-view-rotation trick works because a lookAt view matrix's transpose-of-rotation is the camera basis; wgpu-matrix's `mat4.lookAt` uses the same column-major convention as the spike's hand-rolled one.

**Steps**
- [x] Failing tests: `output has 28 floats`; `viewProj occupies floats 0-15 verbatim`; `right vector is the view rotation's first row with w=0` (feed a known lookAt matrix, e.g. eye [0,0,10] target origin: right = [1,0,0]); `up vector is the second row with w=0`; `params land at floats 24-27 in order`; `dst is written in place and returned when provided`.
- [x] Run → fail. Implement. Run → pass. Commit.

---

## Task 4 — `bakeExtraTransform`

Rigid transform baked into an interleaved buffer, so background galaxies ride the same world-space pipeline with zero per-draw uniform churn (the standing writeBuffer-race rule).

**Files**
- Create: `tools/galaxy-renderer/src/engine/bakeExtraTransform.ts`
- Test: `tests/tools/galaxy-renderer/engine/bakeExtraTransform.test.ts`

**Interfaces**

```ts
export function bakeExtraTransform(
  data: Float32Array,        // stride-8 interleaved records, mutated in place
  sizeIndex: number,         // offset of the size field within the record: 6 for stars, 3 for dust
  pos: Readonly<Vec3>,
  scale: number,
  rotY: number,
  tiltX: number,
): void;
```

Port of `galaxy-engine.js:187-195`: scale xyz → rotate about Y (disk spin) → rotate about X (inclination tilt) → translate; multiply the size slot by `scale`. All other slots untouched.

**Steps**
- [x] Failing tests: `identity transform leaves positions and sizes unchanged` (pos 0, scale 1, rot 0); `pure Y-rotation preserves distances from the Y axis and leaves y alone`; `tilt then rotation matches the spike's order` (one hand-computed record: rotY π/2 then tiltX π/2 on [1,0,0] → assert exact expected position — compute it from the cited formula, not from the implementation); `size slot is multiplied by scale for the given sizeIndex (6 and 3)`; `colour/brightness slots are untouched`; `translation adds pos after rotation`.
- [x] Run → fail. Implement. Run → pass. Commit.

---

## Task 5 — the seven WESL shaders

All behaviour-identical to the spike's WGSL strings (`galaxy-shaders.js`). The `FS_TRI` string concatenation becomes a shared `lib/fullscreenTri.wesl` import.

**Files**
- Create under `tools/galaxy-renderer/src/engine/shaders/`:
  `lib/fullscreenTri.wesl`, `star.wesl`, `dust.wesl`, `bloomBright.wesl`, `bloomDownsample.wesl`, `bloomUpsample.wesl`, `composite.wesl`

**Interfaces**

`lib/fullscreenTri.wesl` — the shared oversized-triangle vertex logic (galaxy-shaders.js:125-135):

```wgsl
struct FullscreenOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
fn fullscreenVertex(vi: u32) -> FullscreenOut { … }   // 3 verts: (-1,-1) (3,-1) (-1,3); uv = ((x+1)/2, (1-y)/2)
```

DEVIATION (structural, not behavioural): the helper carries **no** `@vertex` attribute. Each post-pass shader declares its own two-line `@vertex fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut { return fullscreenVertex(vi); }`. Rationale: the linker inlines imported functions and is not guaranteed to preserve an imported *entry point's* name for `entryPoint: 'vs'` lookup — the repo's `toneMap/vertex.wesl` uses the same own-entry-point pattern. Every post shader imports one identifier per line, at the top:

```wgsl
import package::lib::fullscreenTri::FullscreenOut;
import package::lib::fullscreenTri::fullscreenVertex;
```

Per-shader contracts — entry points are `vs`/`fs` in every file; constants verbatim:

| shader | port of | must-carry constants |
| --- | --- | --- |
| `star.wesl` | galaxy-shaders.js:6-64 | Cam struct per Task 3 table. Billboard in world space via `cam.right/up`. Screen-size clamp: displacement in NDC limited to **0.11** (:36). Hard cull `inSB.y < cam.params.w` (:38). Flux-conserving LOD: hash `fract(sin(dot(inPos, vec3(12.9898, 78.233, 37.719))) * 43758.5453)`, fade `smoothstep(h − 0.4, h, apparent/thr)`, boost `min(fade / min(1.0, a + 0.2), 3.0)` (:41-48). Culled verts park at `vec4(2,2,2,1)` (:49). Fragment: `core = exp(−r²·5.0)`, `glow = exp(−r²·1.6)·0.35`, edge-subtract **0.0774**, alpha × `cam.params.y` (starIntensity) (:56-63). |
| `dust.wesl` | :66-123 | Same Cam struct + LOD scheme but clamp **0.16** (:96). Fragment alpha `smoothstep(1,0,sqrt(r²))·op`; per-channel transmittance `T = clamp(vec3(1) − a·vec3(0.55, 0.78, 1.0), 0, 1)` — blue extinguished most; output `vec4(T, 1)` for the src·dst blend (:113-122). |
| `bloomBright.wesl` | :137-155 | uniform `vec4` (x threshold, y knee); soft threshold `f = max(0, l − u.x) / max(l, 0.0001)` on max-channel luma; **firefly clamp maxB = 2.0** rescaling `o` when its max channel exceeds it. |
| `bloomDownsample.wesl` | :212-234 | 5-tap dual-filter: centre ×4 + 4 diagonals, `/8` normal path; when `u.z > 0.5` (level-0 flag) use the **Karis average** `w = 1/(1 + max-channel)` with centre weight ×4 — the temporal-flicker killer. `u.xy` = SOURCE texel size. |
| `bloomUpsample.wesl` | :236-252 | 9-tap tent (corners ×1, edges ×2, offsets ±t and ±2t on the axes), `/12`; drawn additively (blend set by the pipeline, not the shader). |
| `composite.wesl` | :172-207 | `struct Post { a: vec4<f32>, b: vec4<f32> }` — a = exposure, bloom, saturation, vignette; b.x = tonemap mode. `hdr = scene + bloom·u.a.y`, then `·u.a.x`. Tonemap dispatch on mode: ACES (2.51/0.03/2.43/0.59/0.14), Reinhard `x/(1+x)`, Reinhard-ext w=3.0, Uncharted 2 (A .15, B .50, C .10, D .20, E .02, F .30, whitepoint 11.2), linear clamp. Saturation via luma `dot(c, vec3(0.2126, 0.7152, 0.0722))` mix. Vignette `1 − u.a.w·smoothstep(0.35, 0.85, distance(uv, (.5,.5)))`. Gamma `pow(c, 1/2.2)`. |

The spike's `BLUR_WGSL` (galaxy-shaders.js:157-170) is **dead code** — the shipped chain is bright→down→up→composite — and is ported nowhere (spec lists seven shaders).

**Steps**
- [x] Load the `wesl-shaders` skill. Write the seven files. No backticks in comments; imports top-of-file, one per line.
- [x] `npm run typecheck` green (the `?static` imports don't exist yet — nothing imports these files until Task 6, so the gate here is the linker running clean when Task 6's engine first imports them; still run typecheck to catch stray `.ts` damage).
- [x] Commit.

---

## Task 6 — `createGalaxyEngine`

The one GPU-orchestration module. No unit tests (GPU shell is verified visually, same policy as the main renderer) — its correctness budget is spent on the cited constants and on delegating every calculation to the tested helpers.

**Files**
- Create: `tools/galaxy-renderer/src/engine/createGalaxyEngine.ts`

**Interfaces**

```ts
export async function createGalaxyEngine(canvas: HTMLCanvasElement, opts?: GalaxyEngineOptions): Promise<GalaxyEngineHandle>;
```

Consumes: `generateGalaxy` (fallback path), the worker (`new Worker(new URL('../worker/generateGalaxy.worker.ts', import.meta.url), { type: 'module' })`), the five pure helpers, the seven shaders via `?static` imports, `mat4` from wgpu-matrix, `createShaderModuleWithDevLog`.

Port map (every row cites `galaxy-engine.js`) — carry each constant verbatim:

| concern | contract | cite |
| --- | --- | --- |
| device | `requestAdapter({ powerPreference: 'high-performance' })`; throw `'no-webgpu'` / `'no-adapter'` (Viewport maps them to friendly copy) | 10-13 |
| canvas | preferred format, `alphaMode: 'opaque'`; HDR working format `'rgba16float'` | 14-17 |
| quad VB | 6 verts × 2 floats: `[-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1]` | 20-22 |
| uniform buffers | cam 112 B; bright 16 B seeded `[0.22, 0.5, 0, 0]` (threshold, knee); comp 32 B; 5 × 16 B mip-texel buffers | 25-34 |
| BLOOM_MIPS | **5** | 32 |
| star pipeline | instance stride **32**: loc1 `float32x3`@0 pos, loc2 `float32x3`@12 colour, loc3 `float32x2`@24 (size, brightness); additive blend `src=one dst=one` colour AND alpha | 40-56 |
| dust pipeline | instance stride **32**: loc1 `float32x3`@0 pos, loc2 `float32`@12 size, loc3 `float32x3`@16 colour, loc4 `float32`@28 opacity; transmittance blend colour `src=dst, dst=zero`, alpha `src=zero, dst=one` | 58-76 |
| post pipelines | bright/downsample plain HDR targets; upsample HDR + additive one/one; composite targets the canvas format | 78-93 |
| bind groups | per-pipeline via `getBindGroupLayout(0)` — `layout:'auto'` groups never cross pipelines (cam buffer gets one group for star, another for dust) | 117-118, 138-155 |
| targets | scene HDR at canvas size; pyramid level 0 = half-res, halving per level, min 1 px; per-level texel uniform `[1/w, 1/h, i===0 ? 1 : 0, 0]` (z = Karis flag); rebuilt on resize | 120-156, 253-264 |
| resize | `dpr = min(devicePixelRatio, 2)`, ResizeObserver on the canvas | 253-264 |
| worker | pending-map keyed by incrementing id; `onerror` flips to synchronous `generateGalaxy` on the main thread | 104-116 |
| setParams | await generation; destroy + recreate vertex buffers with `mappedAtCreation`; `opts.onStats({ stars, dust })` | 168-181 |
| setExtras | token guard (a newer call abandons the older's remaining work); `bakeExtraTransform(stars, 6, …)` / `(dust, 3, …)` before upload | 197-215 |
| input | orbit drag 0.006 rad/px; el clamp ±1.5; right/middle-drag pans the target along `panAxes` scaled by `dist·0.0016`; wheel `dist ·= exp(deltaY·0.0011)` clamped [3, 400]; contextmenu suppressed; `setPointerCapture` | 226-250 |
| camera state | defaults az 0.5, el 1.05, dist 31, target [0,0,0], fov 45°; damped shadow copy `camAnim` eased by `min(1, dt·10)`; idle auto-rotate `az += dt·0.12` after 2500 ms without interaction | 159-161, 268-275 |
| render defaults | exposure .92, bloom .85, saturation 1.26, vignette .5, sizeScale 1.0, starIntensity .11 (one internal bag merged by `setRender`, exactly the spike's `Object.assign`) | 165-166, 183 |
| frame | dt clamp 0.05 s; `view = mat4.lookAt(orbitEye(...), target, [0,1,0])`; `proj = mat4.perspective(fov, aspect, 0.1, 400)` then `proj[8] = lensShift(...)`; `vp = mat4.multiply(proj, view)`; upload `packCameraUniforms(...)`; comp UBO `[exposure, bloom, saturation, vignette, tonemap, 0, 0, 0]` | 268-293 |
| pass order | scene (clear black): star pipe → central + extras, dust pipe → central + extras; bright → mip0 (clear); downsample 1..4 (clear); upsample 3..0 (**loadOp 'load'**, additive); composite → canvas | 295-330 |
| fps | accumulate, report `Math.round(fpsN/fpsAcc)` every 0.5 s via `opts.onFps` | 333-338 |
| step | `drawFrame(now ?? performance.now())` without scheduling | 349 |
| sample | draw composite into a 64×64 canvas-format debug texture, `copyTextureToBuffer` bytesPerRow 256, map, mean/max/litPct (luma > 4) over pixels | 96-97, 350-363 |
| grab | S×S (default 480) canvas-format texture; `bytesPerRow = ceil(S·4/256)·256`; BGRA swizzle when the canvas format starts with 'bgra'; alpha forced 255; destroy the staging pair | 365-388 |
| dispose | stop the loop, cancel rAF, disconnect the observer, remove the four listeners | 389-395 |

DEVIATION: wgpu-matrix's `mat4.perspective` maps depth to **[0, 1]** (WebGPU convention) whereas the spike's hand-rolled matrix used the GL [−1, 1] convention. The scene has **no depth attachment** (stars are additive, dust is order-independent transmittance), so z only affects near/far clipping — visually identical, and [0,1] is the correct convention for this API. Documented here so nobody "restores" the spike matrix.

**Steps**
- [x] Implement `createGalaxyEngine.ts` against the table (read the whole spike file first; keep the module header didactic — pass chain diagram + why extras are baked rather than per-draw-uniformed).
- [x] `npm run typecheck` → green (this is the task that proves the `?static` shader imports and the worker URL resolve).
- [x] Commit.

---

## Task 7 — default settings data + Viewport + main.tsx

Make `npm run galaxy-renderer` show a galaxy. The defaults live in `data/` files because plan 03's slices seed from the same constants — one source, no drift.

**Files**
- Create: `tools/galaxy-renderer/src/data/defaultGalaxyParams.ts`, `.../data/defaultRenderSettings.ts`, `.../data/defaultLodSettings.ts`
- Create: `tools/galaxy-renderer/src/ui/Viewport/Viewport.tsx`, `.../ui/Viewport/Viewport.module.css`
- Replace: `tools/galaxy-renderer/src/main.tsx` (plan 01's placeholder)
- Test: `tests/tools/galaxy-renderer/data/defaults.test.ts`

**Interfaces**

```ts
export const DEFAULT_GALAXY_PARAMS: GalaxyParams;   // the spike's boot params, verbatim from Galaxy Renderer.dc.html:472-476 ('Sc', 200k stars, seed 3, …)
export const DEFAULT_RENDER_SETTINGS: RenderSettings; // exposure .92, bloom .85, saturation 1.26, vignette .5, sizeScale 0.3, starIntensity 0.11, tonemap 0  (html:476 + engine defaults for the two knobs the spike UI didn't expose)
export const DEFAULT_LOD_SETTINGS: LodSettings;       // lodApparent 0.006, cullBright 0                      (html:476)
```

Viewport (load the **create-component** skill first — own folder, `<Name>.tsx` + module css, `function Viewport() {}` + default export, top-level `.root`, readonly props):

```ts
export type ViewportProps = {
  readonly onEngine?: (engine: GalaxyEngineHandle | null) => void; // fires with the handle once live, null on dispose
  readonly onFps?: (fps: number) => void;
  readonly onStats?: (stats: EngineStats) => void;
};
```

Owns the `<canvas>` + engine lifecycle (mirror `tools/flow-workbench/src/ui/Viewport/Viewport.tsx`'s mount/dispose discipline, including the disposed-before-ready race guard) and the two non-live states from the spec: a WebGPU-unavailable fallback card (map `'no-webgpu'` / `'no-adapter'` rejections to the friendly copy of `Galaxy Renderer.dc.html:18-32`, plain text is fine) and a loading spinner until the first `setParams` resolves. After engine creation: `setRender({ ...DEFAULT_RENDER_SETTINGS, ...DEFAULT_LOD_SETTINGS })`, `await setParams(DEFAULT_GALAXY_PARAMS)`, then report via `onEngine`. Camera input is engine-internal — the Viewport adds NO pointer listeners (unlike flow-workbench's).

`main.tsx`: createRoot → `<Viewport onFps={console-free no-op or small fps badge} />`. Plan 03 replaces this with the store + `<App>`; keep it minimal but real (the spec's `Hud` arrives in plan 03).

**Steps**
- [x] Failing test `defaults.test.ts`: `default params match the spike boot state` (spot-check type 'Sc', starCount 200000, seed 3, dustNoise 0.76); `default render settings carry the spike values` (assert every field: 0.92 / 0.85 / 1.26 / 0.5 / 0.3 / 0.11 / 0); `default lod settings carry the spike values` (0.006 / 0).
- [x] Run → fail. Create the three data files. Run → pass.
- [x] Load `create-component`; build Viewport + swap main.tsx.
- [x] `npm run typecheck` + full `npm test` → green.
- [x] **Visual gate:** ask the user to run `npm run galaxy-renderer` (port 5400) and confirm: an Sc spiral renders with bloom; drag orbits; right-drag pans; wheel zooms with damping; idle 2.5 s resumes auto-rotate; resizing keeps it crisp. Do not proceed to plan 03 sign-off without this.
- [x] Commit.

---

## Task 8 — plan gate

- [x] Full `npm test` + `npm run typecheck` green.
- [x] Skim the seven `.wesl` files once more against the wesl-shaders checklist (backticks, import placement, one-per-line, `package::`).
- [x] Update `tools/galaxy-renderer/README.md`: controls, the pass chain in one paragraph, pointer to spike-fidelity constants living in the shaders/engine.
- [x] Prettier touched files; commit stragglers.
