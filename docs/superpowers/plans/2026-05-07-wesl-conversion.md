# WGSL → WESL Conversion + Shared Shader Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the seven WGSL shaders under `src/services/gpu/shaders/` to WESL, extract a reusable `lib/` of shared modules, and uniformly split each shader into vertex/fragment/io files.

**Architecture:** Build-time linking via `wesl-plugin` for Vite. Each renderer's TS file imports two pre-linked WGSL strings (one per stage) using the `?static` suffix. Library modules live under `src/services/gpu/shaders/lib/`, with math primitives in `lib/math/` (one function per file) and themed cohesive modules at the `lib/` root. Every shader-touching task ends with build + typecheck + full test suite + manual visual sanity check on the running dev server before commit, per the project's `wgsl-meticulous` convention.

**Tech Stack:** TypeScript 5.x, Vite 5.x, raw WebGPU, WGSL, WESL (`wesl@^0.7.26`, `wesl-plugin@^0.6.74`), Vitest 1.x. No shader unit-test framework exists; verification = build green + 590+ existing tests stay green + visual identity check.

**Spec:** `docs/superpowers/specs/2026-05-07-wesl-conversion-design.md`

---

## Pre-flight reference (read once before starting)

**WESL `?static` suffix semantics.** Build-time linker. `import s from './foo.wesl?static'` returns a `string` containing flat WGSL with all `import ... ;` statements resolved into top-level functions/structs (mangled where collisions exist). Zero runtime cost. The legacy `?raw` import returns the file's bytes verbatim — the migration replaces every `?raw` with `?static` so the linker runs on what was previously a self-contained string.

**WESL import path syntax.** Inside `.wesl` files, imports look like `import lib::math::saturate;` — colons, not slashes; no braces. After the import statement, `saturate` is a top-level identifier inside the importing file. Path resolution is relative to the configured root (this project: `src/services/gpu/shaders/`). Use `super::` for parent-relative paths (rare in this layout) and `as` for renaming on collision.

**Sourcemaps caveat.** WGSL compile errors in Chrome will report line numbers in the **linked** WGSL output, not the source `.wesl`. Mitigation in this codebase: every shader module starts with a docblock identifying it (e.g. `// lib/math/saturate.wesl`), and `tonePass.ts` (and all renderers) log the linked WGSL alongside any `device.createShaderModule` failure in dev mode. Task 1 establishes that logging.

**Project visual-verification rule.** Per `feedback_wgsl_meticulous.md`, no shader-touching task is marked complete until the implementer has visually compared the dev-server render to the previous render and confirmed identity. Tests are silent on shader correctness — visual is the only check.

**WESL parser limitations discovered during Task 1 (2026-05-07).** Three concrete gotchas surfaced by the smoke test that affect every later task:

1. **No backticks (`` ` ``) anywhere in shader source** — including inside `//` and `/* */` comments. The WESL parser tokenises the backtick character regardless of comment context and emits "expected a semicolon" errors. The didactic-comment style across the existing `.wgsl` files uses backticks heavily for inline code identifiers (335 occurrences across the 6 not-yet-converted shaders, 204 in `points.wgsl` alone). **Task 2's bulk rename must include a global `` ` `` → `'` substitution** in every shader file, applied as part of the same commit. The single-quote replacement preserves the visual intent (callout for an identifier) at the cost of the markdown-style aesthetic. If the WESL parser later fixes this, the substitution is mechanically reversible.

2. **TypeScript subpath types via the tsconfig `types` array don't reliably resolve.** Adding `"wesl-plugin/suffixes"` to `compilerOptions.types` does not on its own make `import wgsl from './foo.wesl?static'` resolve to `string` under our `moduleResolution: "bundler"` setup. **A triple-slash reference in a project type file is required**, not optional. Task 1 ships `src/@types/wesl.d.ts` with `/// <reference types="wesl-plugin/suffixes" />`; later tasks reference this file rather than re-creating it.

3. **Vitest does NOT inherit Vite plugins from `vite.config.ts`.** Without explicit registration in `vitest.config.ts`, Vitest's SSR-transform pipeline tries to parse `.wesl` files as JavaScript and rolldown rejects them. Task 1 ships an updated `vitest.config.ts` that registers `wesl-plugin` directly. Later tasks should not modify this config unless adding new build extensions.

---

## Task 1: Tooling bootstrap (wesl-plugin + Vite + types) and convert toneMap

**Files:**
- Modify: `package.json` (add deps)
- Create: `wesl.toml` (repo root)
- Modify: `tsconfig.json` (activate ambient `?static` types from `wesl-plugin/suffixes`)
- Modify: `vite.config.ts`
- Rename: `src/services/gpu/shaders/toneMap.wgsl` → `src/services/gpu/shaders/toneMap.wesl`
- Modify: `src/services/gpu/toneMapPass.ts` (import suffix + dev-mode link logging)

- [ ] **Step 1.1: Add devDependencies**

```bash
npm install --save-dev wesl@^0.7.26 wesl-plugin@^0.6.74
```

Versions verified against the npm registry on 2026-05-07: `wesl-plugin` is still on the 0.6.x track (the original draft assumed 0.7.x, which doesn't exist on npm yet). The matching `wesl` runtime is `0.7.26`. Note: in this implementation pass the controller has already run `npm install` for the agent, so this step is a no-op record of what was added. Expected: lockfile updated, no peer-dep warnings beyond what existed before.

- [ ] **Step 1.2: Create `wesl.toml` at repo root**

The actual TOML schema (verified against `node_modules/wesl-plugin/dist/PluginExtension-DTjKL6rt.d.mts` on 2026-05-07) has flat top-level keys — no `[package]` table, no `name` field. The package name used as the prefix in WESL `import` paths comes from npm's `package.json` `name` (already `"skymap"`), which keeps a single source of truth.

```toml
edition = "unstable_2025"
include = ["**/*.wesl", "**/*.wgsl"]
root = "src/services/gpu/shaders"
```

A short comment block in the file explains why we picked `?static` over `?link` — see the actual file for the full rationale.

- [ ] **Step 1.3: Activate ambient types for `?static` imports**

`wesl-plugin` ships its own ambient module declarations at the subpath `wesl-plugin/suffixes` (see `node_modules/wesl-plugin/src/defaultSuffixTypes.d.ts` — declares `*?static` as `string`, plus stubs for `?link`, `?simple_reflect`, `?bindingLayout`). There is **no need** to hand-write `src/@types/wesl.d.ts`. Activate the shipped types by adding `"wesl-plugin/suffixes"` to `compilerOptions.types` in `tsconfig.json` — that matches the project's existing pattern (the array already lists `"node"`, `"@webgpu/types"`, `"vite/client"`).

```jsonc
// tsconfig.json
"types": ["node", "@webgpu/types", "vite/client", "wesl-plugin/suffixes"]
```

- [ ] **Step 1.4: Wire `wesl-plugin` into `vite.config.ts`**

Read `vite.config.ts` first to see the existing plugin array. The actual API splits the Vite plugin entry point from the build extensions: import the Vite-specific factory from `wesl-plugin/vite` and the `staticBuildExtension` from the package root, then pass the extension to the factory.

```ts
import { staticBuildExtension } from 'wesl-plugin';
import viteWesl from 'wesl-plugin/vite';
// ...
plugins: [viteWesl({ extensions: [staticBuildExtension] }), react()],
```

Plugin order shouldn't matter for correctness; alphabetise as fits the existing arrangement. Do not change any other plugin or config.

- [ ] **Step 1.5: Rename `toneMap.wgsl` → `toneMap.wesl`**

```bash
git mv src/services/gpu/shaders/toneMap.wgsl src/services/gpu/shaders/toneMap.wesl
```

No content changes. WESL is a strict superset of WGSL.

- [ ] **Step 1.6: Update `toneMapPass.ts` import + add dev-mode link logging**

Read `src/services/gpu/toneMapPass.ts` to find the existing `?raw` import. Change:

```ts
import wgsl from './shaders/toneMap.wgsl?raw';
```

to:

```ts
import wgsl from './shaders/toneMap.wesl?static';
```

Then locate the `device.createShaderModule({ code: wgsl, ... })` call. Wrap shader compilation error logging so the linked WGSL is dumped in dev:

```ts
const module = device.createShaderModule({ code: wgsl, label: 'toneMap' });
if (import.meta.env.DEV) {
  module.getCompilationInfo().then((info) => {
    if (info.messages.some((m) => m.type === 'error')) {
      // Browser error line numbers refer to the linked WGSL output, not
      // source .wesl files. Log the linked source so we can map line
      // numbers back manually until wesl-plugin gains sourcemap support.
      console.groupCollapsed('[toneMap] linked WGSL (for error line lookup)');
      console.log(wgsl);
      console.groupEnd();
    }
  });
}
```

(If `toneMapPass.ts` already creates the module without a `label`, add the label too — it shows up in `getCompilationInfo` messages and helps identify which shader errored.)

- [ ] **Step 1.7: Build + typecheck + test**

```bash
npm run typecheck && npm run build && npm test
```

Expected: all green. The build output's bundle size for shaders should be the same byte count as before (toneMap has no imports yet, so the linker's output is the same WGSL).

- [ ] **Step 1.8: Visual sanity check**

Confirm the dev server is running (`npm run dev`). Open the browser. The tone-mapped scene should look identical to before — same gamma curve, same colors. If anything looks different, stop and investigate; the linker has changed something it shouldn't have.

- [ ] **Step 1.9: Commit**

```bash
git add package.json package-lock.json wesl.toml tsconfig.json vite.config.ts \
  src/services/gpu/shaders/toneMap.wgsl src/services/gpu/shaders/toneMap.wesl \
  src/services/gpu/toneMapPass.ts
git commit -m "$(cat <<'EOF'
chore(shaders): bootstrap wesl-plugin tooling and convert toneMap

Adds wesl + wesl-plugin (build-time linker) wired into Vite via the
?static import suffix. Renames toneMap.wgsl → toneMap.wesl as the
smoke-test shader; the linker output is identical WGSL until imports
are added in later tasks. Dev-mode shader-compile errors now log the
linked WGSL alongside the error, since wesl-plugin doesn't yet emit
sourcemaps that survive into Chrome's WGSL compiler diagnostics.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Bulk rename remaining 6 shaders to .wesl

**Files:**
- Rename: 6 shader files
- Modify: 6 renderer TS files (one import line each)

- [ ] **Step 2.1: Rename shader files**

```bash
cd src/services/gpu/shaders
git mv disks.wgsl disks.wesl
git mv filaments.wgsl filaments.wesl
git mv milkyWayImpostor.wgsl milkyWayImpostor.wesl
git mv points.wgsl points.wesl
git mv proceduralDisks.wgsl proceduralDisks.wesl
git mv quads.wgsl quads.wesl
cd -
```

- [ ] **Step 2.1b: Strip backticks from shader comments**

Per the WESL parser limitations documented in the pre-flight reference, every backtick (`` ` ``) inside the shader files must be replaced with a single quote. The didactic-comment style uses backticks for inline-code callouts; single quotes preserve the visual cue while making the WESL parser happy. Apply across all 6 renamed files (toneMap was handled in task 1):

```bash
for f in src/services/gpu/shaders/disks.wesl \
         src/services/gpu/shaders/filaments.wesl \
         src/services/gpu/shaders/milkyWayImpostor.wesl \
         src/services/gpu/shaders/points.wesl \
         src/services/gpu/shaders/proceduralDisks.wesl \
         src/services/gpu/shaders/quads.wesl; do
  # Use perl rather than sed for portable in-place editing without backup files.
  perl -i -pe "s/\`/'/g" "$f"
done
```

Verify zero backticks remain:

```bash
grep -c '`' src/services/gpu/shaders/*.wesl
# Expected: every line ends with `:0`
```

This is the only content change in this task — every other byte of the shaders stays identical. Document the substitution in the commit message.

- [ ] **Step 2.2: Update each renderer's import**

For each of the 6 renderer TS files, change the `?raw` import to `?static` and update the file extension. Read each file first to find the exact line, then edit:

| File | Old import | New import |
|---|---|---|
| `src/services/gpu/diskRenderer.ts` | `'./shaders/disks.wgsl?raw'` | `'./shaders/disks.wesl?static'` |
| `src/services/gpu/filamentRenderer.ts` | `'./shaders/filaments.wgsl?raw'` | `'./shaders/filaments.wesl?static'` |
| `src/services/gpu/milkyWayRenderer.ts` | `'./shaders/milkyWayImpostor.wgsl?raw'` | `'./shaders/milkyWayImpostor.wesl?static'` |
| `src/services/gpu/pointRenderer.ts` | `'./shaders/points.wgsl?raw'` | `'./shaders/points.wesl?static'` |
| `src/services/gpu/proceduralDiskRenderer.ts` | `'./shaders/proceduralDisks.wgsl?raw'` | `'./shaders/proceduralDisks.wesl?static'` |
| `src/services/gpu/quadRenderer.ts` | `'./shaders/quads.wgsl?raw'` | `'./shaders/quads.wesl?static'` |
| `src/services/gpu/pickRenderer.ts` | `'./shaders/points.wgsl?raw'` | `'./shaders/points.wesl?static'` |

(Note: pickRenderer also imports `points.wgsl` — that's the second import to update. Total: 7 TS files modified, 6 shader files renamed.)

- [ ] **Step 2.3: Build + typecheck + test**

```bash
npm run typecheck && npm run build && npm test
```

Expected: all green. Each shader now goes through the WESL linker but still has zero imports, so output WGSL is byte-identical to source.

- [ ] **Step 2.4: Visual sanity check**

Reload the dev server. All renderers should produce identical visuals to before. Pan, zoom, rotate; toggle tier; click a galaxy to verify pickRenderer still works. Anything different = stop.

- [ ] **Step 2.5: Commit**

```bash
git add -u
git commit -m "$(cat <<'EOF'
chore(shaders): rename remaining 6 shaders .wgsl → .wesl

Bulk rename. Each renderer's ?raw import becomes ?static so the WESL
linker runs on every shader. Output WGSL is byte-identical until
imports are introduced in later tasks, save for one mechanical content
change: backticks in comments are replaced with single quotes
project-wide because the WESL parser tokenises ` regardless of comment
context. The single-quote replacement preserves the visual intent of
the inline-code callouts and is mechanically reversible if the parser
later loosens up.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Extract `lib/math/` (six single-function files)

**Files:**
- Create: `src/services/gpu/shaders/lib/math/constants.wesl`
- Create: `src/services/gpu/shaders/lib/math/rot2.wesl`
- Create: `src/services/gpu/shaders/lib/math/sabs.wesl`
- Create: `src/services/gpu/shaders/lib/math/saturate.wesl`
- Create: `src/services/gpu/shaders/lib/math/toPolar.wesl`
- Create: `src/services/gpu/shaders/lib/math/toRect.wesl`
- Modify: `src/services/gpu/shaders/milkyWayImpostor.wesl` (replace inline `rot`, `sabs`, `toPolar`, `toRect`)
- Modify: `src/services/gpu/shaders/points.wesl` (replace inline `clamp(x, 0, 1)` with `saturate`, where it appears)

- [ ] **Step 3.1: Create the six math files**

`src/services/gpu/shaders/lib/math/constants.wesl`:
```wgsl
// lib/math/constants.wesl — common scalar constants.
//
// Pulled out of points.wesl + milkyWayImpostor.wesl which had
// hand-typed `3.14159...` and `2.30258...` literals. Keeping these
// in one file gives us one place to add precision if we ever need
// f64-equivalent constants for compute shaders.

const PI: f32 = 3.14159265358979;
const TAU: f32 = 6.28318530717958;
const LOG10: f32 = 2.30258509299404;  // ln(10), for converting log/ln
```

`src/services/gpu/shaders/lib/math/saturate.wesl`:
```wgsl
// lib/math/saturate.wesl — clamp(x, 0, 1).
//
// WGSL has no built-in `saturate`. The `clamp(x, 0.0, 1.0)` form
// recurs ~20× across the shaders; this gives us a named primitive.

fn saturate(x: f32) -> f32 {
  return clamp(x, 0.0, 1.0);
}
```

`src/services/gpu/shaders/lib/math/rot2.wesl`:
```wgsl
// lib/math/rot2.wesl — 2D rotation of a point around the origin.
//
// Pulled from milkyWayImpostor.wesl's inline `rot()`. Returned as
// a fresh vec2 (no in-place mutation) so it composes cleanly in
// expressions.

fn rot2(p: vec2<f32>, a: f32) -> vec2<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec2<f32>(c * p.x - s * p.y, s * p.x + c * p.y);
}
```

`src/services/gpu/shaders/lib/math/sabs.wesl`:
```wgsl
// lib/math/sabs.wesl — smooth absolute value.
//
// `sabs(x, k)` approximates `abs(x)` but is C¹-continuous at x=0.
// Larger `k` → sharper corner. Used by milkyWay's height function
// to avoid kinks in the derivative of disk thickness.

fn sabs(x: f32, k: f32) -> f32 {
  return sqrt(x * x + k);
}
```

`src/services/gpu/shaders/lib/math/toPolar.wesl`:
```wgsl
// lib/math/toPolar.wesl — Cartesian (x, y) → polar (r, θ).
//
// Returns vec2(r, theta) with theta in radians, range (-PI, PI].

fn toPolar(p: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(length(p), atan2(p.y, p.x));
}
```

`src/services/gpu/shaders/lib/math/toRect.wesl`:
```wgsl
// lib/math/toRect.wesl — polar (r, θ) → Cartesian (x, y).
//
// Inverse of toPolar. p.x = r, p.y = theta.

fn toRect(p: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(p.x * cos(p.y), p.x * sin(p.y));
}
```

- [ ] **Step 3.2: Replace `rot`, `sabs`, `toPolar`, `toRect` in `milkyWayImpostor.wesl`**

Read `src/services/gpu/shaders/milkyWayImpostor.wesl`. At the top of the file (after any leading docblock), add:

```wgsl
import skymap::lib::math::rot2;
import skymap::lib::math::sabs;
import skymap::lib::math::toPolar;
import skymap::lib::math::toRect;
```

Then **delete** the four inline function definitions:
- `fn toPolar(p: vec2<f32>) -> vec2<f32>` (around line 330)
- `fn toRect(p: vec2<f32>) -> vec2<f32>` (around line 334)
- `fn rot(p: vec2<f32>, a: f32) -> vec2<f32>` (around line 367)
- `fn sabs(x: f32, k: f32) -> f32` (around line 425)

The function name `rot` becomes `rot2` everywhere it's called inside the file. Use a global find-replace within the file: `rot(` → `rot2(` (be precise — there's no other identifier matching that prefix in this shader, but verify with grep before replacing).

```bash
grep -n "rot(" src/services/gpu/shaders/milkyWayImpostor.wesl
```

Expected: matches are all the call sites of the deleted `rot` function. Replace each with `rot2(`.

- [ ] **Step 3.3: Replace `clamp(x, 0.0, 1.0)` with `saturate(x)` in points.wesl**

Read `src/services/gpu/shaders/points.wesl`. Add the import near the top:

```wgsl
import skymap::lib::math::saturate;
```

Find every occurrence of `clamp(<expr>, 0.0, 1.0)` and `clamp(<expr>, 0, 1)` in the file:

```bash
grep -n "clamp(" src/services/gpu/shaders/points.wesl
```

Replace each `clamp(<expr>, 0.0, 1.0)` with `saturate(<expr>)` **only when** the second and third arguments are exactly `0.0, 1.0` or `0, 1`. Don't touch `clamp` calls with other bounds.

(There may be ~5–10 such matches. The remaining `clamp` calls with non-[0,1] bounds stay as-is — `saturate` is specifically the [0,1] case.)

- [ ] **Step 3.4: Build + typecheck + test**

```bash
npm run typecheck && npm run build && npm test
```

Expected: all green.

- [ ] **Step 3.5: Visual sanity check**

Reload dev server. Milky Way impostor + points pass should be visually identical. Spend ~30s panning around, especially near the Milky Way (where `sabs`/`rot2` actually fire) and at distance from origin (where `saturate` calls in points.wesl gate the depth fade).

- [ ] **Step 3.6: Commit**

```bash
git add src/services/gpu/shaders/lib/math/ \
  src/services/gpu/shaders/milkyWayImpostor.wesl \
  src/services/gpu/shaders/points.wesl
git commit -m "$(cat <<'EOF'
refactor(shaders): extract lib/math/ — saturate, rot2, sabs, toPolar, toRect, constants

Six single-function modules under lib/math/, plus a constants file
for PI/TAU/LOG10. Replaces inline definitions in milkyWayImpostor
and the ~10 inline `clamp(x, 0, 1)` calls in points with named
`saturate()`. No semantic change.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Extract `lib/camera.wesl`

**Files:**
- Create: `src/services/gpu/shaders/lib/camera.wesl`
- Modify: each renderer shader that today rolls its own view/proj math

- [ ] **Step 4.1: Inventory existing camera-uniform layouts**

Before extracting, read each renderer's `Uniforms` struct to identify which fields are camera-related (`viewProj`, `view`, `proj`, `cameraPos`, `kPerZ`, `viewportPx`, `dpr`, etc.) vs. renderer-specific (e.g. `globalBrightness` in points; `cloudOpacity` is fade-related and stays in cloudFade later). Note any field-order differences between renderers.

```bash
grep -n "^struct Uniforms" src/services/gpu/shaders/*.wesl
# Then read each one — they're at:
#   disks.wesl:57, filaments.wesl:21, milkyWayImpostor.wesl:71,
#   points.wesl:68, proceduralDisks.wesl:18, quads.wesl:21, toneMap.wesl:24
```

Document the canonical `CameraUniforms` field order in the new module's docblock — this is the source of truth, all renderers must adopt this order.

- [ ] **Step 4.2: Create `lib/camera.wesl`**

```wgsl
// lib/camera.wesl — shared camera uniform layout + projection helpers.
//
// CANONICAL FIELD ORDER. Bind groups across all renderers depend on
// these offsets matching exactly between TS-side struct writes and
// WGSL-side struct reads. Do NOT reorder fields without updating
// every renderer's TypedArray fill on the CPU side.
//
// Layout (16-byte aligned, std140-compatible-ish):
//   offset  0: mat4x4<f32> viewProj    (64 B)
//   offset 64: mat4x4<f32> view        (64 B)
//   offset 128: mat4x4<f32> proj        (64 B)
//   offset 192: vec3<f32>  cameraPos   + 4 B padding
//   offset 208: vec2<f32>  viewportPx  + 8 B padding
//   offset 224: f32        kPerZ
//   offset 228: f32        dpr
//   offset 232: f32        timeSec      (for animated effects; renderers that
//                                         don't need it leave it 0)
//   offset 236: f32        _pad
// Total: 240 bytes.

struct CameraUniforms {
  viewProj:    mat4x4<f32>,
  view:        mat4x4<f32>,
  proj:        mat4x4<f32>,
  cameraPos:   vec3<f32>,
  viewportPx:  vec2<f32>,
  kPerZ:       f32,
  dpr:         f32,
  timeSec:     f32,
}

// World-space → clip-space (homogeneous, w=1 input).
fn worldToClip(cam: CameraUniforms, p: vec3<f32>) -> vec4<f32> {
  return cam.viewProj * vec4<f32>(p, 1.0);
}

// Eye-space depth (linear distance from camera along view direction).
// Useful for size-vs-distance scaling that must be linear, not 1/w.
fn worldEyeDepth(cam: CameraUniforms, p: vec3<f32>) -> f32 {
  return length(cam.cameraPos - p);
}

// Pixel size (in NDC units) of a kPerZ-defined world unit at the given
// eye-space depth. Inverse of: "1 NDC unit = how many pixels at this depth?"
// Used by the billboard library for screen-space-sized point sprites.
fn pixelSizeAt(cam: CameraUniforms, eyeDepth: f32) -> f32 {
  return cam.kPerZ / max(eyeDepth, 0.001);
}
```

(Verify the field count and offsets against what the TS side actually writes — read `src/services/engine/engine.ts` or wherever the camera uniform buffer is filled. Adjust `viewportPx` / `dpr` / `timeSec` presence based on real usage.)

- [ ] **Step 4.3: Update each renderer shader**

For each of the 7 shader files (`disks`, `filaments`, `milkyWayImpostor`, `points`, `proceduralDisks`, `quads`, `toneMap`):

1. Add `import skymap::lib::camera::{ CameraUniforms, worldToClip, worldEyeDepth };` (and `pixelSizeAt` where used) to the top of the file.
2. Refactor the renderer's `Uniforms` struct so its first field is `cam: CameraUniforms` and renderer-specific fields follow. **Or**, if the renderer has only camera fields, replace the `Uniforms` struct entirely with `CameraUniforms`.
3. Replace inline `viewProj * vec4(p, 1.0)` with `worldToClip(u.cam, p)`.
4. Replace inline `length(u.cameraPos - p)` (or equivalent) with `worldEyeDepth(u.cam, p)`.

This is a per-renderer commit. **Do these as 7 sub-commits**, one per renderer, so each diff is reviewable in isolation.

For **each** renderer, after the shader change, also update the TypeScript side that fills the uniform buffer. Read the renderer's TS file to locate where the `Float32Array`/`DataView` write sequence happens — add or reorder writes to match the new `CameraUniforms` layout. The byte total must match the WGSL struct exactly.

The mechanical pattern per renderer:
```
edit shaders/<name>.wesl       # add import, restructure Uniforms struct, swap call sites
edit <name>Renderer.ts         # update CPU-side uniform write to match new layout
build + test + visual          # gate
git add + commit               # per-renderer sub-commit
```

- [ ] **Step 4.4: Per-renderer sub-commit checklist**

Repeat for each of: `disks`, `filaments`, `milkyWayImpostor`, `points`, `proceduralDisks`, `quads`, `toneMap`:

```bash
# After editing the .wesl + .ts pair for one renderer:
npm run typecheck && npm run build && npm test
# Visual check: reload dev server, focus on the affected renderer's output
git add src/services/gpu/shaders/<name>.wesl src/services/gpu/<name>Renderer.ts
git commit -m "refactor(shaders): adopt lib/camera.wesl in <name>Renderer"
```

(Final sub-commit, after all 7 renderers, also git-adds `lib/camera.wesl` itself if not already committed.)

- [ ] **Step 4.5: Final verification after all renderers converted**

```bash
npm run typecheck && npm run build && npm test
```

Expected: all green. Visual: every renderer should look identical to pre-task. The most likely failure mode is a struct-alignment bug — wrong CPU-side write order produces garbage uniforms and renders nothing or wildly wrong colors.

---

## Task 5: Extract `lib/billboard.wesl`

**Files:**
- Create: `src/services/gpu/shaders/lib/billboard.wesl`
- Modify: `points.wesl`, `quads.wesl`, `disks.wesl`, `proceduralDisks.wesl`

- [ ] **Step 5.1: Inventory existing billboard expansion code**

Each of the four billboard renderers has a near-identical block that:
1. Receives `vid: u32` (0..3, the vertex index of a unit quad).
2. Computes `cornerOffset = vec2<f32>((vid & 1u) == 0u ? -1.0 : 1.0, ...)` (or via a constant array).
3. Scales by a per-instance pixel- or world-size.
4. Adds the offset to the world-space center, projected via `viewProj`.

Read each of the four files' `vs` entry points to locate the shared pattern.

- [ ] **Step 5.2: Create `lib/billboard.wesl`**

```wgsl
// lib/billboard.wesl — view-aligned billboard expansion helpers.
//
// All four billboard renderers (points, quads, disks, proceduralDisks)
// take a unit-quad's `@builtin(vertex_index) vid: u32` and need to:
//   1. Map vid (0..3) → corner offset in [-1, +1]² (UV-style).
//   2. Multiply by a per-instance size.
//   3. Add to an instance's world-space center.
//
// The corner mapping uses a CCW triangle-strip order (vid=0 →
// bottom-left, 1 → bottom-right, 2 → top-left, 3 → top-right) so a
// 4-vertex `triangle-strip` topology renders the quad as two
// triangles without an index buffer.

import skymap::lib::camera::{ CameraUniforms, pixelSizeAt };

// Map vertex index 0..3 to its [-1, +1]² corner offset.
fn quadCorner(vid: u32) -> vec2<f32> {
  let x = select(1.0, -1.0, (vid & 1u) == 0u);
  let y = select(1.0, -1.0, (vid & 2u) == 0u);
  return vec2<f32>(x, y);
}

// Same mapping but as UV in [0, 1]², for fragment-shader UV coords.
fn quadUv(vid: u32) -> vec2<f32> {
  let x = select(1.0, 0.0, (vid & 1u) == 0u);
  let y = select(1.0, 0.0, (vid & 2u) == 0u);
  return vec2<f32>(x, y);
}

// Expand a screen-space-sized billboard. `centerWS` is the instance
// center in world space, `sizePx` is the desired diameter in pixels at
// the current viewport, and the result is a clip-space position.
//
// Internally: project center to clip, then add the corner offset
// scaled by pixelSizeAt(eyeDepth) so the quad's screen size is
// constant regardless of distance.
fn expandBillboardScreen(
  cam: CameraUniforms,
  centerWS: vec3<f32>,
  sizePx: f32,
  vid: u32,
) -> vec4<f32> {
  let eyeDepth = length(cam.cameraPos - centerWS);
  let centerClip = cam.viewProj * vec4<f32>(centerWS, 1.0);
  let cornerNDC = quadCorner(vid) * (sizePx / cam.viewportPx) * centerClip.w;
  return vec4<f32>(centerClip.xy + cornerNDC, centerClip.zw);
}

// Expand a world-space-sized billboard. `sizeWS` is the desired
// diameter in world units, and the quad is view-aligned (faces the
// camera). Used for galaxy thumbnails, where the on-sky size is
// physically meaningful.
fn expandBillboardWorld(
  cam: CameraUniforms,
  centerWS: vec3<f32>,
  sizeWS: f32,
  vid: u32,
) -> vec4<f32> {
  // View-aligned basis: x = camera-right, y = camera-up.
  // Extracted from the inverse-rotation columns of the view matrix.
  let right = vec3<f32>(cam.view[0].x, cam.view[1].x, cam.view[2].x);
  let up    = vec3<f32>(cam.view[0].y, cam.view[1].y, cam.view[2].y);
  let corner = quadCorner(vid) * sizeWS * 0.5;
  let posWS = centerWS + right * corner.x + up * corner.y;
  return cam.viewProj * vec4<f32>(posWS, 1.0);
}
```

- [ ] **Step 5.3: Replace inline expansion in each billboard renderer**

For each of `points.wesl`, `quads.wesl`, `disks.wesl`, `proceduralDisks.wesl`:

1. Add the relevant imports:
   ```wgsl
   import skymap::lib::billboard::{ quadCorner, quadUv, expandBillboardScreen, expandBillboardWorld };
   ```
2. Inside the `vs` entry point, replace the manually-rolled corner+expansion math with the matching helper. Keep all other logic (color computation, fade, magnitude→intensity) untouched.
3. If the existing code uses a custom corner ordering, verify the new `quadCorner`'s [-1,+1]² output produces the same vertex layout — otherwise the quad will wind backward and disappear under back-face culling.

This is per-renderer. Sub-commit each:

```bash
npm run typecheck && npm run build && npm test
# Visual: reload dev. Focus on the renderer just changed.
git add src/services/gpu/shaders/<name>.wesl
git commit -m "refactor(shaders): adopt lib/billboard.wesl in <name>"
```

(`disks.wesl` is the trickiest — its expansion uses the position-angle/inclination math, so leave the orientation parts untouched and only swap the corner-mapping primitives. `lib/orientation.wesl` in task 6 handles the rest.)

- [ ] **Step 5.4: Final verification**

```bash
npm run typecheck && npm run build && npm test
```

Visual: thoroughly check points, quads (galaxy thumbnails near close approach), disks, and proceduralDisks. The failure mode here is a corner-ordering bug — quads disappear or invert.

---

## Task 6: Extract `lib/orientation.wesl`

**Files:**
- Create: `src/services/gpu/shaders/lib/orientation.wesl`
- Modify: `disks.wesl`, `proceduralDisks.wesl`

- [ ] **Step 6.1: Read the duplicate code**

```bash
sed -n '155,170p' src/services/gpu/shaders/disks.wesl
echo "---"
sed -n '150,170p' src/services/gpu/shaders/proceduralDisks.wesl
```

Confirm the two blocks are byte-for-byte equivalent (modulo identifier renames and comment style). Capture any genuine difference here in the commit message — usually there's none.

- [ ] **Step 6.2: Create `lib/orientation.wesl`**

```wgsl
// lib/orientation.wesl — galaxy disk orientation: position-angle +
// inclination → world-space major/minor axes.
//
// Background: the catalog gives us each galaxy's position-angle (PA,
// the angle from local north toward east, projected on the sky) and
// either an axis ratio b/a or a directly-measured inclination i.
// We need a 3D coordinate frame for the disk: a major axis on the
// plane of the sky, and a minor axis tilted toward the line-of-sight.
//
// Derivation (also lives in disks.wesl + proceduralDisks.wesl as
// commentary):
//   1. north_proj, east_proj: tangent-plane basis at the galaxy
//      world position, north = +y projected onto the local sky tangent.
//   2. major = north_proj * cos(PA) + east_proj * sin(PA)
//   3. minor_in_sky = north_proj * (-sin(PA)) + east_proj * cos(PA)
//   4. minor_3d = minor_in_sky * cos(i) + losDir * sin(i)
//      where losDir = unit vector from camera toward galaxy.
//
// Edge-on (axisRatio → 0, cosI → 0, sinI → 1) → minor_3d ≈ losDir.
// Face-on (axisRatio → 1, cosI → 1, sinI → 0) → minor_3d ≈ minor_in_sky.

struct DiskAxes {
  major: vec3<f32>,
  minor: vec3<f32>,
}

// Build the disk's world-space axes.
//   posWS:     galaxy world position
//   cameraPos: camera world position (defines line-of-sight)
//   paRad:     position angle in radians, from north toward east
//   cosI, sinI: cosine and sine of the inclination angle.
//              For a catalog axisRatio = b/a, cosI = axisRatio,
//              sinI = sqrt(1 - axisRatio²).
fn diskAxes(
  posWS: vec3<f32>,
  cameraPos: vec3<f32>,
  paRad: f32,
  cosI: f32,
  sinI: f32,
) -> DiskAxes {
  let losDir = normalize(posWS - cameraPos);

  // Local tangent basis. North is global +y projected onto the plane
  // perpendicular to losDir; east is north × losDir (right-handed).
  let worldUp = vec3<f32>(0.0, 1.0, 0.0);
  let northTangent = normalize(worldUp - losDir * dot(losDir, worldUp));
  let eastTangent = cross(northTangent, losDir);

  let cosPA = cos(paRad);
  let sinPA = sin(paRad);

  let majorSky = northTangent * cosPA + eastTangent * sinPA;
  let perpMajorSky = northTangent * (-sinPA) + eastTangent * cosPA;
  let minor3D = perpMajorSky * cosI + losDir * sinI;

  return DiskAxes(majorSky, minor3D);
}
```

(Verify the exact derivation against the existing block — there's a chance one renderer uses a slightly different sign convention. If so, document and unify.)

- [ ] **Step 6.3: Replace the inline block in `disks.wesl`**

Read `disks.wesl` to locate the existing block (around lines 155–170). Add the import:

```wgsl
import skymap::lib::orientation::{ DiskAxes, diskAxes };
```

Replace the ~12 lines of inline math with a single call:

```wgsl
let axes = diskAxes(instance.posWS, u.cam.cameraPos, instance.paRad, cosI, sinI);
let majorAxis = axes.major;
let minorAxis = axes.minor;
```

(Adjust local variable names to match what the existing `vs` body uses afterward.)

- [ ] **Step 6.4: Replace the inline block in `proceduralDisks.wesl`**

Same replacement, same import, same call shape.

- [ ] **Step 6.5: Build + typecheck + test + visual + commit**

```bash
npm run typecheck && npm run build && npm test
```

Visual: focus on disks and procedural disks at close approach. Any galaxy with a known orientation (M31, M81, NGC 891) should still tilt correctly. Edge-on galaxies should still appear edge-on.

```bash
git add src/services/gpu/shaders/lib/orientation.wesl \
  src/services/gpu/shaders/disks.wesl \
  src/services/gpu/shaders/proceduralDisks.wesl
git commit -m "$(cat <<'EOF'
refactor(shaders): extract lib/orientation.wesl

Collapses the verbatim PA + inclination → 3D major/minor axis math
duplicated between disks.wesl and proceduralDisks.wesl. The two
blocks were byte-equal modulo identifier renames; both now call
the shared diskAxes() helper.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Extract `lib/colorIndex.wesl`

**Files:**
- Create: `src/services/gpu/shaders/lib/colorIndex.wesl`
- Modify: `points.wesl`, `proceduralDisks.wesl`

- [ ] **Step 7.1: Read the duplicate `ramp` function**

```bash
sed -n '650,705p' src/services/gpu/shaders/points.wesl
echo "---"
sed -n '210,220p' src/services/gpu/shaders/proceduralDisks.wesl
```

Confirm the two `fn ramp(t: f32) -> vec3<f32>` definitions are byte-equal (modulo formatting). The longer comment block above `points.wesl`'s ramp is documentation; preserve it on the new module.

- [ ] **Step 7.2: Create `lib/colorIndex.wesl`**

```wgsl
// lib/colorIndex.wesl — color-index → RGB ramp.
//
// Maps a normalised color index t ∈ [0, 1] to a color, where t=0
// represents the bluest galaxies and t=1 the reddest. The ramp is a
// piecewise-linear interpolation through five anchor colors derived
// from real galaxy spectra (UV-bright spirals → red ellipticals).
//
// The mapping from catalog (g - i) or (B - V) to t happens on the CPU
// side (see src/data/colourIndex.ts) so this shader doesn't have to
// know which photometric system any given galaxy came from.
//
// Future work: a B-V → blackbody-temperature → RGB path would be
// physically more honest. Until then, this hand-tuned ramp matches
// what NASA-style press images use, which gives users the "right"
// expectation about galaxy color.

fn ramp(t: f32) -> vec3<f32> {
  // [PASTE THE EXISTING RAMP BODY HERE — copy from points.wesl
  //  verbatim. The function is ~50 lines of piecewise mix() calls
  //  between five anchor colors.]
}
```

(The implementer must paste the actual existing function body when extracting — do not re-derive the anchor colors from memory.)

- [ ] **Step 7.3: Replace `ramp` in `points.wesl`**

Add import:
```wgsl
import skymap::lib::colorIndex::ramp;
```

Delete the local `fn ramp` definition. Call sites (already named `ramp(...)`) need no change.

- [ ] **Step 7.4: Replace `ramp` in `proceduralDisks.wesl`**

Same pattern.

- [ ] **Step 7.5: Build + visual + commit**

```bash
npm run typecheck && npm run build && npm test
git add src/services/gpu/shaders/lib/colorIndex.wesl \
  src/services/gpu/shaders/points.wesl \
  src/services/gpu/shaders/proceduralDisks.wesl
git commit -m "refactor(shaders): extract lib/colorIndex.wesl"
```

(Visual: galaxy color distribution should be unchanged. Easiest check: zoom out to a wide view and observe the red/blue ratio matches before.)

---

## Task 8: Extract `lib/cloudFade.wesl`

**Files:**
- Create: `src/services/gpu/shaders/lib/cloudFade.wesl`
- Modify: `points.wesl`, `filaments.wesl`

- [ ] **Step 8.1: Compare the duplicate `CloudUniforms` struct**

```bash
sed -n '290,322p' src/services/gpu/shaders/points.wesl
echo "---"
sed -n '37,47p' src/services/gpu/shaders/filaments.wesl
```

Note any differences. Document them in the commit message; if they diverge, either unify (preferred) or split into two named structs.

- [ ] **Step 8.2: Create `lib/cloudFade.wesl`**

```wgsl
// lib/cloudFade.wesl — per-cloud fade uniform + apply helper.
//
// Each renderable point cloud has an `opacity` scalar in [0, 1] that
// drives a smooth fade-in/out as a tier swap progresses. The CPU side
// animates this between 0 and 1 using a smoothstep curve.
//
// The struct also includes a `cloudId` for picking-target encoding:
// the pickRenderer writes (cloudId, instanceIdx) into r32uint so a
// single readback distinguishes which cloud the user clicked.

struct CloudUniforms {
  opacity: f32,
  cloudId: u32,
  // pad to 16-byte alignment if needed by the bind-group layout
  _pad0: f32,
  _pad1: f32,
}

fn applyCloudFade(color: vec4<f32>, cloud: CloudUniforms) -> vec4<f32> {
  return vec4<f32>(color.rgb, color.a * cloud.opacity);
}
```

(Match the actual TS-side write layout. If `CloudUniforms` has more fields in the live code than this draft shows, copy them in.)

- [ ] **Step 8.3: Replace the inline struct + fade application in `points.wesl` and `filaments.wesl`**

For each file:

```wgsl
import skymap::lib::cloudFade::{ CloudUniforms, applyCloudFade };
```

Delete the local `struct CloudUniforms`. The bind-group binding (e.g. `@group(2) @binding(0) var<uniform> cloud: CloudUniforms;`) stays in the renderer file — only the type definition moves.

Replace any inline `color * cloud.opacity` with `applyCloudFade(color, cloud)` where it appears as the final fade step.

- [ ] **Step 8.4: Build + visual + commit**

```bash
npm run typecheck && npm run build && npm test
git add src/services/gpu/shaders/lib/cloudFade.wesl \
  src/services/gpu/shaders/points.wesl \
  src/services/gpu/shaders/filaments.wesl
git commit -m "refactor(shaders): extract lib/cloudFade.wesl"
```

Visual: tier-swap animations should fade smoothly as before. Pick a tier transition that exercises both points and filaments fading.

---

## Task 9: Extract `lib/masks.wesl`

**Files:**
- Create: `src/services/gpu/shaders/lib/masks.wesl`
- Modify: `disks.wesl`, `quads.wesl`, `proceduralDisks.wesl`, `filaments.wesl`

- [ ] **Step 9.1: Inventory the existing mask patterns**

Three patterns recur across fragment shaders:

| Pattern | Where | Purpose |
|---|---|---|
| `1.0 - smoothstep(inner, outer, r)` | disks `:191`, quads `:210`, proceduralDisks `:241` | Circular cutoff fade — soft edge of a disk/sprite |
| `smoothstep(lo, hi, lum)` | disks `:195`, quads `:230` | Luminance-keyed alpha — dim pixels become transparent |
| `smoothstep(0, fade, uv.y) * (1 - smoothstep(1-fade, 1, uv.y))` | filaments `:107` | Edge-band mask — fade in at 0 and out at 1 |

- [ ] **Step 9.2: Create `lib/masks.wesl`**

```wgsl
// lib/masks.wesl — common fragment-stage mask shapes.

// Soft circular cutoff: 1 inside `inner`, 0 outside `outer`, smooth between.
// Used for disk/sprite edges. r is typically `length(uv - 0.5) * 2` or
// `length(uv - center)` depending on the shader's UV convention.
fn circularMask(r: f32, inner: f32, outer: f32) -> f32 {
  return 1.0 - smoothstep(inner, outer, r);
}

// Luminance-keyed alpha: 0 below `lo`, 1 above `hi`, smooth between.
// Lets the renderer fade out very dim pixels rather than rendering
// them as gray noise.
fn lumAlpha(lum: f32, lo: f32, hi: f32) -> f32 {
  return smoothstep(lo, hi, lum);
}

// Edge-band mask along one UV axis. 0 at axis=0 and axis=1, 1 in the
// middle, with `fade` controlling the falloff width at each end.
// Used by filaments to taper line endpoints.
fn edgeBandMask(axis: f32, fade: f32) -> f32 {
  return smoothstep(0.0, fade, axis) * (1.0 - smoothstep(1.0 - fade, 1.0, axis));
}
```

- [ ] **Step 9.3: Replace inline masks in each fragment shader**

For each of `disks.wesl`, `quads.wesl`, `proceduralDisks.wesl`, `filaments.wesl`:

1. Add `import skymap::lib::masks::{ circularMask, lumAlpha, edgeBandMask };` (only the names actually used).
2. Replace each occurrence of the matching pattern with a call to the helper. Verify the parameters map to the helper's argument order — the existing inline forms might pass `outer, inner` instead of `inner, outer`.

Per-shader sub-commit.

- [ ] **Step 9.4: Final verification**

```bash
npm run typecheck && npm run build && npm test
```

Visual: galaxy sprites should still have soft edges, dim pixels fade out as before, filament endpoints taper smoothly.

---

## Task 10: Extract `lib/astro.wesl`

**Files:**
- Create: `src/services/gpu/shaders/lib/astro.wesl`
- Modify: `points.wesl`

- [ ] **Step 10.1: Locate the formulas in `points.wesl`**

```bash
grep -n "5.0 \* (log\|pow(10" src/services/gpu/shaders/points.wesl
```

Two formulas:
- Distance modulus at `points.wesl:762` — `absMag = appMag - 5*log10(d_Mpc) - 25`
- Magnitude → intensity (search for `pow(10.0, -0.4`).

- [ ] **Step 10.2: Create `lib/astro.wesl`**

```wgsl
// lib/astro.wesl — astronomical magnitude conversions.

import skymap::lib::math::constants::LOG10;

// Distance modulus: convert apparent magnitude + distance to absolute
// magnitude. m - M = 5·log₁₀(d/10pc) — for d in Mpc this is
//   M = m - 5·log₁₀(d_Mpc) - 25
fn distanceModulus(appMag: f32, distMpc: f32) -> f32 {
  return appMag - 5.0 * (log(distMpc) / LOG10) - 25.0;
}

// Apparent magnitude → linear flux ratio. Pogson scale: each 5 mag
// step is a factor of 100 in flux, so flux ratio = 10^(-0.4·m).
// `m=0` returns 1.0; brighter (smaller m) returns >1, dimmer <1.
fn appMagToIntensity(m: f32) -> f32 {
  return pow(10.0, -0.4 * m);
}
```

- [ ] **Step 10.3: Replace inline formulas in `points.wesl`**

Add `import skymap::lib::astro::{ distanceModulus, appMagToIntensity };`.

Replace the inline `appMag - 5.0 * (log(dMpc) / LOG10) - 25.0` with `distanceModulus(appMag, dMpc)`. Replace `pow(10.0, -0.4 * m)` with `appMagToIntensity(m)`.

- [ ] **Step 10.4: Build + visual + commit**

```bash
npm run typecheck && npm run build && npm test
```

Visual: galaxy brightnesses should be unchanged. Easiest check: examine a known-bright galaxy (M31) — its apparent size and intensity should match before.

```bash
git add src/services/gpu/shaders/lib/astro.wesl \
  src/services/gpu/shaders/points.wesl
git commit -m "refactor(shaders): extract lib/astro.wesl — distance modulus + magnitude→intensity"
```

---

## Task 11: Extract `lib/tonemap.wesl`

**Files:**
- Create: `src/services/gpu/shaders/lib/tonemap.wesl`
- Modify: `toneMap.wesl`

- [ ] **Step 11.1: Read the existing tone-mapping curves**

```bash
sed -n '55,110p' src/services/gpu/shaders/toneMap.wesl
```

Five functions: `applyLinear`, `applyReinhard`, `applyAsinh`, `applyGamma2`, `applyAces`.

- [ ] **Step 11.2: Create `lib/tonemap.wesl`**

```wgsl
// lib/tonemap.wesl — tone-mapping curves.
//
// Each function maps a linear-space HDR color to a [0, 1] LDR color
// suitable for an sRGB display. Curves chosen to suit deep-space
// imagery where the dynamic range spans many orders of magnitude.

// Identity. Useful as a debug or "bypass" pass.
fn applyLinear(c: vec3<f32>) -> vec3<f32> {
  // [PASTE EXISTING IMPL]
}

// Reinhard with white-point normalization. wsq = whitePoint².
fn applyReinhard(c: vec3<f32>, wsq: f32) -> vec3<f32> {
  // [PASTE EXISTING IMPL]
}

// asinh(k·x)/asinh(k) — natural fit for stellar magnitudes.
fn applyAsinh(c: vec3<f32>, k: f32) -> vec3<f32> {
  // [PASTE EXISTING IMPL]
}

// sqrt(saturate(c)) — quick gamma-2 approximation.
fn applyGamma2(c: vec3<f32>) -> vec3<f32> {
  // [PASTE EXISTING IMPL]
}

// ACES filmic curve. Standard cinema/CG tone-map.
fn applyAces(c: vec3<f32>) -> vec3<f32> {
  // [PASTE EXISTING IMPL]
}
```

(Implementer pastes the actual function bodies. Don't re-derive ACES coefficients.)

- [ ] **Step 11.3: Replace inline functions in `toneMap.wesl`**

Add:
```wgsl
import skymap::lib::tonemap::{ applyLinear, applyReinhard, applyAsinh, applyGamma2, applyAces };
```

Delete the five inline `fn apply*` definitions. The fragment-stage `fs` function calls (already named `applyReinhard(...)` etc.) need no change.

- [ ] **Step 11.4: Build + visual + commit**

```bash
npm run typecheck && npm run build && npm test
```

Visual: tone-map dropdown in the dev panel should still cycle through Linear / Reinhard / Asinh / Gamma2 / ACES with the same curves as before. Set each one and compare to memory of the previous look.

```bash
git add src/services/gpu/shaders/lib/tonemap.wesl src/services/gpu/shaders/toneMap.wesl
git commit -m "refactor(shaders): extract lib/tonemap.wesl"
```

---

## Task 12: Extract `lib/util.wesl` (noise + raySphere + galactic + sRGB + pickEncode)

**Files:**
- Create: `src/services/gpu/shaders/lib/util.wesl`
- Modify: `milkyWayImpostor.wesl`, `points.wesl` (the pick fragment), `toneMap.wesl`

- [ ] **Step 12.1: Read the source functions**

```bash
# Noise + ray-sphere + galactic + stars (in milkyWay)
grep -n "^fn " src/services/gpu/shaders/milkyWayImpostor.wesl
# Pick encoding (in points)
grep -n "vec4<u32>\|@location(0) vec4<u32>" src/services/gpu/shaders/points.wesl
# sRGB conversion (in toneMap, currently as part of gamma2)
grep -n "linearToSRGB\|srgbToLinear\|gamma" src/services/gpu/shaders/toneMap.wesl
```

- [ ] **Step 12.2: Create `lib/util.wesl`**

```wgsl
// lib/util.wesl — orphan utility functions awaiting promotion.
//
// Each function in this module is currently used by exactly one
// shader. They live together to avoid a flurry of single-call-site
// modules; when a second consumer appears for any of them, that
// function graduates to its own file under lib/<domain>/<fn>.wesl
// (matching the lib/math/ pattern).

// ── noise ─────────────────────────────────────────────────────────

// Hash from 2D input to scalar in [0, 1). The constants come from the
// classic `fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453)`
// tradition; they're a hash, not a serious PRNG, but visually
// good enough for shader noise.
fn hash21(co: vec2<f32>) -> f32 {
  // [PASTE existing rand() body from milkyWayImpostor.wesl]
}

// 2D value noise with bilinear interpolation. tm is a phase offset.
fn valueNoise2(p: vec2<f32>, tm: f32) -> f32 {
  // [PASTE existing noise1() body from milkyWayImpostor.wesl]
}

// ── geometry ──────────────────────────────────────────────────────

// Ray-sphere intersection. Returns vec2(tEnter, tExit); both
// negative if the ray misses or the sphere is behind the origin.
fn raySphere(ro: vec3<f32>, rd: vec3<f32>, center: vec3<f32>, radius: f32) -> vec2<f32> {
  // [PASTE existing impl from milkyWayImpostor.wesl]
}

// ── galactic frame ────────────────────────────────────────────────

// World-frame (equatorial-aligned) → galactic-frame rotation.
fn worldToGalactic(v: vec3<f32>) -> vec3<f32> {
  // [PASTE existing impl from milkyWayImpostor.wesl]
}

// Galactic-frame → renderer-frame (the Milky Way impostor's
// orientation in the scene).
fn galacticToShader(g: vec3<f32>) -> vec3<f32> {
  // [PASTE existing impl from milkyWayImpostor.wesl]
}

// ── sRGB ──────────────────────────────────────────────────────────

// Linear → sRGB gamma. Currently used implicitly by toneMap's
// gamma-2 curve; isolating it makes the conversion available to
// any future post-process pass.
fn linearToSRGB(c: vec3<f32>) -> vec3<f32> {
  let cutoff = vec3<f32>(0.0031308);
  let lo = 12.92 * c;
  let hi = 1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c < cutoff);
}

fn srgbToLinear(c: vec3<f32>) -> vec3<f32> {
  let cutoff = vec3<f32>(0.04045);
  let lo = c / 12.92;
  let hi = pow((c + 0.055) / 1.055, vec3<f32>(2.4));
  return select(hi, lo, c < cutoff);
}

// ── pick-target encoding ──────────────────────────────────────────

// Encode a 32-bit instance ID into the r32uint pick-target format.
// The fragment shader writes vec4<u32>; only the .r channel is read
// back via copyTextureToBuffer. Keeping this in a function documents
// the wire format for future readback code.
fn encodePickId(idx: u32) -> vec4<u32> {
  return vec4<u32>(idx, 0u, 0u, 0u);
}
```

- [ ] **Step 12.3: Replace call sites in `milkyWayImpostor.wesl`**

Add:
```wgsl
import skymap::lib::util::{ hash21, valueNoise2, raySphere, worldToGalactic, galacticToShader };
```

Delete the local definitions of `rand`, `noise1`, `raySphere`, `worldToGalactic`, `galacticToShader`. Rename call sites: `rand(` → `hash21(`, `noise1(` → `valueNoise2(`. Verify with grep.

- [ ] **Step 12.4: Replace pick encoding in `points.wesl`**

In the `fsPick` function, replace the inline `vec4<u32>(globalInstanceIdx, 0u, 0u, 0u)` (or whatever the existing form is) with `encodePickId(globalInstanceIdx)`. Add the import.

- [ ] **Step 12.5: Final verification**

```bash
npm run typecheck && npm run build && npm test
```

Visual: Milky Way impostor (fragment shader is the heaviest user — noise + raySphere + galactic). Pan around it; the procedural galaxy should look identical. Click a galaxy → pickRenderer → ensure selection still works.

```bash
git add src/services/gpu/shaders/lib/util.wesl \
  src/services/gpu/shaders/milkyWayImpostor.wesl \
  src/services/gpu/shaders/points.wesl
git commit -m "refactor(shaders): extract lib/util.wesl — noise, raySphere, galactic, sRGB, pickEncode"
```

---

## Task 13: Split `points.wesl` into 4 files

**Files:**
- Create: `src/services/gpu/shaders/points.io.wesl`
- Create: `src/services/gpu/shaders/points.vertex.wesl`
- Create: `src/services/gpu/shaders/points.color.fragment.wesl`
- Create: `src/services/gpu/shaders/points.pick.fragment.wesl`
- Delete: `src/services/gpu/shaders/points.wesl`
- Modify: `src/services/gpu/pointRenderer.ts`, `src/services/gpu/pickRenderer.ts`

- [ ] **Step 13.1: Carve up the existing file**

Read `src/services/gpu/shaders/points.wesl` to see what's there now (after tasks 3–12, it's smaller — most reusable code has been extracted to `lib/`). Identify three regions:

1. **Shared types**: `struct Uniforms`, `struct CloudUniforms` (already imported), `struct PerVertex`, `struct VSOut`, plus any bind-group declarations.
2. **Vertex stage**: `@vertex fn vs(...)` — used by both color and pick paths.
3. **Color fragment**: `@fragment fn fs(in: VSOut) -> @location(0) vec4<f32>`.
4. **Pick fragment**: `@fragment fn fsPick(in: VSOut) -> @location(0) vec4<u32>`.

- [ ] **Step 13.2: Create the four new files**

`points.io.wesl`:
```wgsl
// points.io.wesl — shared type declarations + bind groups for the
// points/pick pair. Imported by all three companion files
// (points.vertex.wesl, points.color.fragment.wesl, points.pick.fragment.wesl).
//
// Pulling these out of points.vertex.wesl (where they could otherwise
// live) means both fragment files get them without re-declaring,
// which prevents accidental drift in the V→F interpolant struct.

import skymap::lib::camera::CameraUniforms;
import skymap::lib::cloudFade::CloudUniforms;

struct Uniforms {
  cam: CameraUniforms,
  // [paste any remaining renderer-specific fields here]
}

struct PerVertex {
  // [paste from current points.wesl]
}

struct VSOut {
  // [paste from current points.wesl]
}

// Bind groups (paste the @group / @binding declarations from the
// current file). All three companion files reference these.
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(2) @binding(0) var<uniform> cloud: CloudUniforms;
// [etc.]
```

`points.vertex.wesl`:
```wgsl
import skymap::points::io::{ Uniforms, PerVertex, VSOut, u, cloud };
import skymap::lib::camera::worldToClip;
import skymap::lib::billboard::expandBillboardScreen;
// [other imports the vs body uses, copied from the current top-of-file]

@vertex
fn vs(/* paste signature */) -> VSOut {
  // [paste existing vs body verbatim]
}
```

`points.color.fragment.wesl`:
```wgsl
import skymap::points::io::{ VSOut, u, cloud };
import skymap::lib::cloudFade::applyCloudFade;
// [other imports]

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // [paste existing fs body verbatim]
}
```

`points.pick.fragment.wesl`:
```wgsl
import skymap::points::io::VSOut;
import skymap::lib::util::encodePickId;

@fragment
fn fsPick(in: VSOut) -> @location(0) vec4<u32> {
  // [paste existing fsPick body verbatim]
}
```

(WESL imports of `var<uniform>` bindings: verify the linker actually allows importing a binding declaration vs. requiring redeclaration. If not, the bind groups must live in each consuming file with identical `@group/@binding` numbers — a pattern WGSL itself supports without complaint as long as the numbers match.)

- [ ] **Step 13.3: Delete the old `points.wesl`**

```bash
git rm src/services/gpu/shaders/points.wesl
```

- [ ] **Step 13.4: Update `pointRenderer.ts`**

Read the current file. Find the `import wgsl from './shaders/points.wesl?static'` line, plus the `device.createShaderModule` and `device.createRenderPipeline` calls.

Replace the single import with two:

```ts
import vsCode from './shaders/points.vertex.wesl?static';
import fsCode from './shaders/points.color.fragment.wesl?static';
```

Update the pipeline construction to use two modules:

```ts
const vsModule = device.createShaderModule({ code: vsCode, label: 'points.vertex' });
const fsModule = device.createShaderModule({ code: fsCode, label: 'points.color.fragment' });

device.createRenderPipeline({
  // ...existing layout/buffers/etc...
  vertex:   { module: vsModule, entryPoint: 'vs', buffers: [...] },
  fragment: { module: fsModule, entryPoint: 'fs', targets: [...] },
});
```

Apply the same dev-mode link-logging pattern used in task 1 to both modules.

- [ ] **Step 13.5: Update `pickRenderer.ts`**

Same pattern, but the fragment module imports the pick fragment file:

```ts
import vsCode from './shaders/points.vertex.wesl?static';
import fsCode from './shaders/points.pick.fragment.wesl?static';
```

The vertex module is bit-identical to pointRenderer's — both renderers can either keep separate `createShaderModule` calls (simpler, no shared state) or coordinate to share one. **Use separate calls.** It's cheap and avoids cross-renderer coupling.

- [ ] **Step 13.6: Final verification**

```bash
npm run typecheck && npm run build && npm test
```

Visual: points pass renders identically. Click a galaxy — selection halo appears on the right galaxy (regression of the second-bug-class on the project's "things that have bitten us" list — selection-on-wrong-galaxy was caused by uniform-update races; this split eliminates that whole class).

```bash
git add -u
git commit -m "$(cat <<'EOF'
refactor(shaders): split points.wesl into vertex / color-fs / pick-fs / io

Replaces the single 1485-line points.wesl with four files:
- points.io.wesl       — shared structs + bind-group declarations
- points.vertex.wesl   — @vertex fn vs (used by both renderers)
- points.color.fragment.wesl — @fragment fn fs (pointRenderer)
- points.pick.fragment.wesl  — @fragment fn fsPick (pickRenderer)

This replaces the planned `@if(PICK)` conditional-compilation
approach: with a vertex/fragment file split, the pick path is
just a different fragment module import — no preprocessor needed.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Split `milkyWayImpostor.wesl` into 3 files

**Files:**
- Create: `src/services/gpu/shaders/milkyWayImpostor.io.wesl`
- Create: `src/services/gpu/shaders/milkyWayImpostor.vertex.wesl`
- Create: `src/services/gpu/shaders/milkyWayImpostor.fragment.wesl`
- Delete: `src/services/gpu/shaders/milkyWayImpostor.wesl`
- Modify: `src/services/gpu/milkyWayRenderer.ts`

Same pattern as task 13, but only one fragment file.

- [ ] **Step 14.1: Carve up the file**

Read the post-task-12 `milkyWayImpostor.wesl`. It now has structs + vs entry point + fs entry point + the procedural-galaxy helpers (`stars`, `height`, `galaxyNormal`, `shadeGalaxyDisk`, `renderGalaxy`).

Decision: the procedural-galaxy helpers (~5 functions, ~150 lines) are fragment-stage only and not reusable elsewhere. Keep them in the fragment file rather than inventing a fourth file. If a future shader wants `renderGalaxy`, it graduates to `lib/` then.

- [ ] **Step 14.2: Create the three files**

`milkyWayImpostor.io.wesl`:
```wgsl
import skymap::lib::camera::CameraUniforms;

struct Uniforms {
  cam: CameraUniforms,
  // [other fields]
}

struct VsOut {
  // [paste]
}

@group(0) @binding(0) var<uniform> u: Uniforms;
// [other bindings]
```

`milkyWayImpostor.vertex.wesl`:
```wgsl
import skymap::milkyWayImpostor::io::{ Uniforms, VsOut, u };
import skymap::lib::camera::worldToClip;

@vertex
fn vs(@builtin(vertex_index) vid: u32) -> VsOut {
  // [paste vs body]
}
```

`milkyWayImpostor.fragment.wesl`:
```wgsl
import skymap::milkyWayImpostor::io::{ Uniforms, VsOut, u };
import skymap::lib::util::{ raySphere, worldToGalactic, galacticToShader, hash21, valueNoise2 };
import skymap::lib::math::{ rot2, sabs, toPolar, toRect };
// [etc]

// The procedural-galaxy helpers (stars, height, galaxyNormal, etc.)
// stay here — they're fragment-stage only and only this shader uses
// them. Promote to lib/ if a second consumer ever appears.

fn stars(p_in: vec2<f32>) -> vec3<f32> { /* paste */ }
fn height(p: vec2<f32>, tm: f32) -> f32 { /* paste */ }
fn galaxyNormal(p: vec2<f32>, tm: f32) -> vec3<f32> { /* paste */ }
fn shadeGalaxyDisk(/* ... */) -> vec3<f32> { /* paste */ }
fn renderGalaxy(ro: vec3<f32>, rd: vec3<f32>, tm: f32) -> vec3<f32> { /* paste */ }

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  // [paste fs body]
}
```

- [ ] **Step 14.3: Delete old file + update renderer**

```bash
git rm src/services/gpu/shaders/milkyWayImpostor.wesl
```

`milkyWayRenderer.ts`:
```ts
import vsCode from './shaders/milkyWayImpostor.vertex.wesl?static';
import fsCode from './shaders/milkyWayImpostor.fragment.wesl?static';
```

Update pipeline construction to use two modules.

- [ ] **Step 14.4: Build + visual + commit**

```bash
npm run typecheck && npm run build && npm test
```

Visual: zoom in on the Milky Way impostor — same procedural galaxy, same star field. Animate (the `tm` parameter) — the galaxy should wobble identically.

```bash
git add -u
git commit -m "refactor(shaders): split milkyWayImpostor.wesl into vertex/fragment/io"
```

---

## Task 15: Split remaining 5 shaders into 3 files each

**Files:**
- For each of `disks`, `filaments`, `proceduralDisks`, `quads`, `toneMap`:
  - Create: `<name>.io.wesl`, `<name>.vertex.wesl`, `<name>.fragment.wesl`
  - Delete: `<name>.wesl`
  - Modify: `<name>Renderer.ts` (or `toneMapPass.ts`)

Same pattern as tasks 13–14, repeated for each small renderer. Each one is mechanical (these shaders are <300 lines each), so they're done as five sub-commits in one task.

- [ ] **Step 15.1: Per-renderer template**

For each renderer, in the order: `toneMap`, `filaments`, `disks`, `quads`, `proceduralDisks` (smallest to largest):

1. Read the current `<name>.wesl`. Identify: structs + bindings (→ io), `@vertex fn vs` (→ vertex), `@fragment fn fs` (→ fragment).
2. Create `<name>.io.wesl`, `<name>.vertex.wesl`, `<name>.fragment.wesl` per the templates from tasks 13–14.
3. `git rm` the original `<name>.wesl`.
4. Update the renderer's TS file: replace the single `?static` import with two, and update the pipeline construction to use two `GPUShaderModule`s.
5. Build + typecheck + test.
6. Visual: focus on this renderer's output.
7. Sub-commit:
   ```bash
   git add -u
   git commit -m "refactor(shaders): split <name>.wesl into vertex/fragment/io"
   ```

- [ ] **Step 15.2: Final verification across all renderers**

After all five sub-commits:

```bash
npm run typecheck && npm run build && npm test
```

Comprehensive visual check: pan, zoom, rotate, click, tier-swap, tone-map curve cycle. Everything should look identical to before the entire 15-task plan started.

- [ ] **Step 15.3: Open PR**

```bash
git push -u origin my-feature
gh pr create --title "WGSL → WESL conversion + shared shader library" --body "$(cat <<'EOF'
## Summary

- Bootstraps `wesl-plugin` (build-time WESL→WGSL linker for Vite) and converts all 7 shaders from `.wgsl` to `.wesl`.
- Extracts a `lib/` of shared shader modules: `math/` (saturate, rot2, sabs, toPolar, toRect, constants), camera, billboard, orientation, colorIndex, cloudFade, masks, astro, tonemap, util.
- Uniformly splits every renderer shader into `<name>.io.wesl` + `<name>.vertex.wesl` + `<name>.fragment.wesl`. `points` is special-cased with two fragment files (color + pick).
- Replaces the planned `@if(PICK)` conditional-compilation path with a clean two-fragment-file split for the points/pick renderer pair.

Spec: `docs/superpowers/specs/2026-05-07-wesl-conversion-design.md`
Plan: `docs/superpowers/plans/2026-05-07-wesl-conversion.md`

## Test plan

- [x] `npm run typecheck` green
- [x] `npm run build` green
- [x] `npm test` green (590+ tests)
- [x] Visual: every renderer output identical to pre-PR
- [x] Visual: click-to-select still works (pickRenderer)
- [x] Visual: tier-swap fades smoothly (cloudFade)
- [x] Visual: tone-map dropdown cycles through all 5 curves correctly

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

After all 15 tasks, verify against the spec:

- [x] Section 1 (Goal) — all 7 shaders converted, lib/ extracted, vertex/fragment split done.
- [x] Section 2 (Why WESL) — three duplications collapsed: ramp (task 7), CloudUniforms (task 8), orientation (task 6). Single-file scale addressed: tasks 13–15 split. One-file-two-entry-points addressed: task 13.
- [x] Section 3 (Architecture) — every file in the spec's tree exists (or is deleted intentionally).
- [x] Section 4 (Library modules) — every immediate-win module extracted in tasks 4–11, math primitives in task 3, util staging in task 12.
- [x] Section 5 (Tooling) — wesl + wesl-plugin + wesl.toml + tsconfig types activation + Vite config in task 1.
- [x] Section 6 (Migration plan) — 15 tasks, matching the 15-task spec section.
- [x] Section 7 (Risks) — sourcemap-survival risk addressed by dev-mode link logging in task 1; struct-alignment risk addressed by canonical CameraUniforms layout in task 4; visual-verification gate present in every task.
