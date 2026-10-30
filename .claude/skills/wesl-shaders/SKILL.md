---
name: wesl-shaders
description: Working with WESL (WebGPU Shading Extended Language) and Skymap's build-time linker (`weslStaticPlugin`, on the `wesl` library) — covers .wesl import syntax, parser quirks, shader-module debugging, and WGSL struct layout for shared CameraUniforms-style prefixes. **Use this skill whenever you're editing a .wesl file, debugging a "Invalid ShaderModule" or "unexpected token" error from Chrome's WGSL compiler, extending a shaders/lib/ directory, or wiring `weslStaticPlugin` into a Vite or Vitest config — even if the user doesn't explicitly mention WESL.** The gotchas in this skill are linker-level constraints that aren't documented upstream and silently produce broken or unlinked WGSL output.
---

# WESL shader gotchas

These are the places the `wesl` linker (0.7.26) is stricter than the WESL spec suggests, plus the wiring Skymap needs. `?static` imports are linked at build time by `tools/utils/vite/weslStaticPlugin.ts`, which emits the WGSL as a JSON string (so backticks in shader comments are harmless). Re-test the linker gotchas on every `wesl` version bump.

Shaders live in `src/services/gpu/shaders/`, with the shared modules under `shaders/lib/`; the cross-references below all point into that tree.

## The four gotchas

### 1. The package prefix is the literal token `package`

Inside `.wesl` files, the import-path root is the literal string `package`, not your `package.json` name.

```wgsl
// Right
import package::lib::math::saturate;

// Wrong — Chrome's WGSL parser will reject this with "module not found"
import skymap::lib::math::saturate;
```

The npm package name is reserved for cross-package imports if your project ever publishes a shader library. Single-project builds always use `package::`. Verified in `node_modules/wesl/dist/index.js` (the linker calls `fileToModulePath(rootModuleName, "package", false)`, hard-coding the literal).

### 2. Imports must live at the top of the file

The linker only resolves `import` statements that appear before the first declaration. An import placed near its call site (e.g., next to `fn shadeGalaxy(...)`) leaves the name unbound, and the link fails with `unresolved identifier '<name>'` — at build time, in the shader that imports it.

Fix: move all `import` lines to the top of the file, alongside any existing imports.

### 3. Imports name a function FROM a module, not a function-as-module

WESL's import resolution treats the LAST segment of the path as the function (or struct) name and everything before it as the module path. So:

```wgsl
import package::lib::math::saturate;
```

…looks for a function `saturate` inside a module at `lib/math.wesl`. It does NOT look for a function-as-module at `lib/math/saturate.wesl`.

Implication: don't do "one function per file" under `lib/`. The import path becomes `package::lib::math::saturate::saturate` (duplicated leaf) which is verbose noise. The idiomatic shape is **one cohesive multi-function module per file** — `lib/math.wesl` exporting saturate, rot2, sabs, etc., each section-divided with a comment header.

`src/services/gpu/shaders/lib/math.wesl` is the canonical example.

### 4. Vitest doesn't auto-inherit Vite plugins

Adding the plugin to `vite.config.ts` is necessary but not sufficient. Vitest's SSR transform pipeline runs through its own plugin chain, so `weslStaticPlugin` is registered again in `vitest.config.ts`:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { weslStaticPlugin } from './tools/utils/vite/weslStaticPlugin.ts';

export default defineConfig({
  plugins: [weslStaticPlugin()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

Without this, Vitest fetches `.wesl` files and rolldown tries to parse them as JavaScript, failing with "expected a semicolon" or "unexpected token" — a JS parse error, not a shader error. A tool with its own `wesl.toml` passes `weslStaticPlugin({ weslToml })`, since the default is `<cwd>/wesl.toml`.

## Runtime-only failure: duplicate @builtin(position)

Declaring `@builtin(position)` twice in one entry point (once on a member of the input struct and again on a bare parameter) fails ONLY at runtime: the build and the wesl linker both pass, and it is `device.createShaderModule` that rejects the module. Fix: read the position from the struct member and delete the bare parameter. Because nothing fails until module creation, the symptom is the same "Invalid ShaderModule" cascade as gotcha #3; the dev-mode compile logger (below) shows the real error.

## Math and binding traps

- **Multiply-by-zero does not neutralize a read in a bisect**: `0.0 * NaN` and `0.0 * Inf` are NaN. Replace the call with a literal (`let h = 0.0;`).
- **f32 denormal flush on Mpc-unit magnitudes**: squaring ~1e-19 Mpc (`normalize`, `dot`, `length`) drops below 1.18e-38, flushes to 0, and `inverseSqrt(0)` is NaN. Tell: a camera-anchored black disc that grows on descent. Rescale to body radii at the vertex; keep value² ≥ ~1e-37.
- **Renormalize after `invModel`**: `invModel * vec4(dir, 0.0)` has magnitude 1/scale, so anything treating `t` as a distance (march step, per-step opacity, attenuation) goes wrong. `normalize(...)` after the transform; AABB hit tests alone are fine unnormalized.
- **`layout: 'auto'` bind groups are not interchangeable**: two pipelines with `'auto'` on the same `@group(N)` get distinct layouts, and a bind group built for one fails validation on the other (a pick texture reads back all zeros). Share the `GPUBuffer`/sampler/view, build each bind group against the consumer's own `getBindGroupLayout(N)`, or use one explicit `GPUPipelineLayout`.
- **CPU-side math is wgpu-matrix, not gl-matrix**: the `dst` argument is LAST and optional; `mat4.create()` returns ZEROS (use `mat4.identity()`); `invert` is `inverse`, `scaleAndAdd` is `addScaled`; `mat4d`/`vec3d` are Float64. wgpu `Vec3` is a `Float32Array` (indexing gives `number | undefined`); skymap's `@types/math` `Vec3`/`Mat4` are tuples, so use those where you index.

## File layout and moves

- **One folder per shader** with `io.wesl` + `vertex.wesl` + `fragment.wesl`; variants are extra fragments over one vertex (`galaxyCatalog/points/`: `colorFragment.wesl` + `pickFragment.wesl`). A draw-type `if` inside a shared fragment is the wrong split: it belongs in the pipeline table. Ground a new layout in the existing tree and checkpoint it with the user for anything beyond a one-file tweak. No register-style locals (`g0`, `w2`).
- **A shader move needs a hand sweep** of literals no tool rewrites (`npm run move-files` included): `import package::…`, TS `?static` specifiers, `wesl.toml`, `vite.config.ts`, and bare directory literals in scraper/parity tests (no trailing slash, no filename).
- **Tool shader symlinks go at the LEAF**: the galaxy-renderer tool's `wesl.toml` glob follows a symlinked dir but not a real subdir of one, so `tools/galaxy-renderer/src/engine/shaders/milkyWay/field/` is a real dir of per-file symlinks. The wrong shape fails "module not found" only at the tool's shader-link time, and tool-only trees are linked only by the tool's vite build, so both builds are gates.

## Mitigations baked into skymap

- **shaderCompileLogger.ts** — every renderer routes `device.createShaderModule` through `createShaderModuleWithDevLog(device, code, label)`, which logs the linked WGSL alongside any compile-time error in dev mode. The linked output carries no sourcemap, so Chrome's error line numbers refer to the LINKED output, not your source `.wesl` files. Reading the linked output in the dev console is the only way to map "error at line 142" back to a source file. The helper is at `src/services/gpu/shaderCompileLogger.ts`; copy the pattern into other projects.

- **`label:` everywhere** — every WebGPU resource (shader module, render pipeline, bind group, bind group layout, pipeline layout, buffer, texture) has a `label` field. Browser-console errors that previously said "(unlabeled)" now name the offending resource. Worth its weight in debugging time.

## CameraUniforms shared-prefix pattern

For a renderer with multiple shader passes that all need `viewProj` + `viewportPx`, declare a shared 80-byte `CameraUniforms` struct in `lib/camera.wesl`:

```wgsl
struct CameraUniforms {
  viewProj:    mat4x4<f32>,  // bytes 0..63
  viewportPx:  vec2<f32>,    // bytes 64..71
  _pad0:       f32,          // bytes 72..75 — reserved for vec3 alignment
  _pad1:       f32,          // bytes 76..79
};

fn worldToClip(cam: CameraUniforms, p: vec3<f32>) -> vec4<f32> {
  return cam.viewProj * vec4<f32>(p, 1.0);
}
```

Each renderer's `Uniforms` struct embeds it as the first member (`cam: CameraUniforms,`). Renderer-specific fields go AFTER the 80-byte prefix — typically at offset 80 onward, which is 16-byte-aligned and ready for a `vec3<f32>` if the renderer has one.

The two reserved pad bytes (72–79) exist because WGSL requires 16-byte alignment before any `vec3<f32>` field. Don't put scalars there — that defeats the purpose. Instead, place renderer-specific scalars at offsets 88+ if you need to stay within an existing 16-byte slot, or accept a slightly larger struct.

The CPU-side `Float32Array` write must match the WGSL struct byte-for-byte. Mismatch = silent garbage uniforms = visible-but-wrong rendering. Document the offset table in a docblock on the renderer's TS file (the skymap project does this for every uniform-bearing renderer).

## TS ↔ WESL constant parity

`?static` linking is pure build-time text linking; there is NO value injection from TS into the shader. When a constant must exist on both sides, keep the TS export authoritative, hand-mirror it into the `.wesl`, and pin the pair with a Vitest parity test that reads the `.wesl` as text and regex-extracts each declaration:

```ts
const re = /const\s+(\w+)\s*:\s*(?:u32|f32)\s*=\s*([0-9]+(?:\.[0-9]+)?)[uf]?\s*;/g;
```

Exemplar: skymap's `tests/services/gpu/shaders/constants.parity.test.ts`. It asserts both directions (each mirrored WESL constant equals its TS export, and no WESL constant lacks an asserted TS twin). The test, not the compiler, is what keeps the mirror from drifting.

## Versions pinned

- `wesl@0.7.26`

Re-test gotchas 1-3 on every `wesl` version bump — they're linker behaviour that may change upstream. If they're fixed, the workarounds become unnecessary noise; if they're not, document the version that confirmed them.

## When the linker gives you an error

Before debugging the shader itself, run through this checklist:

1. `unresolved identifier`? An `import` below the first declaration (gotcha #2): hoist it.
2. `module not found`? The prefix must be `package::` (gotcha #1), and the last path segment names a function in a module, not a file (gotcha #3).
3. Does `npm test` fail but `npm run build` pass? (gotcha #4) `vitest.config.ts` is missing `weslStaticPlugin`.

If none of these apply, you're looking at a real WGSL bug — read the linked output via the dev-mode logger (above) to see what reached Chrome's compiler, then work it as below.

## Working on a WGSL change

WGSL fixes fail more often than TS fixes and nothing type-checks the maths, so go slower than in TS:

- **List the failure modes before editing**: NaN paths, hard cutoffs, integration boundaries, additive magnification. Phrase a fix as "should help, because…" until the user has looked; offer a look between iterations instead of batching "obvious" fixes. If a change makes it worse, revert first, then think.
- **Tint probe when the mechanism is uncertain**: a temporary uncommitted tint (labelled `TEMP DIAGNOSTIC -- DO NOT COMMIT`) colour-coding the competing hypotheses; one look over HMR (~2 s) shows the edit reaches the GPU, which path fires, and where. Revert it before tuning. Tune by binary-searching a hardcoded const with the user watching, then plumb the converged value to a setting; try existing live sliders first.
- **Every new varying costs**: one extra flat `vec3` `@location` on the points `VSOut` once cost +1.5 ms (~21%) to save a `sqrt` + FMA. Fit the value into an existing 4-component slot first (regroup by consumer and rename, e.g. `ellipse: vec3`), or recompute in the fragment; if a slot must be added, measure with the `perf` skill and report it.
- **`npm run galaxy-renderer:probe`** (plain and `?gpuTimings`) runs 1–2 min: start it in the background and edit nothing its vite server watches (`.wesl` and `src/` TS) until it finishes. HMR unmounts the Viewport mid-readback, and the resulting `orientationReadbackBuf used in submit while destroyed` errors (all steps ✓, `?t=<epoch>` module URLs) mean re-run on a quiet tree, not a bug.

## For orchestrators

Linker failures stay silent until a lazily gated draw fires, so an implementer that never saw this checklist reports success on a clean `tsc`. Step 1 of every shader brief: "invoke the `wesl-shaders` skill before editing any `.wesl` file", plus the gotchas above that apply to that task inlined. Read the produced `.wesl` yourself before accepting it.
