# WGSL → WESL Conversion + Shared Shader Library — Design

**Status:** Draft (2026-05-07)
**Owner:** @rulkens
**Branch:** `my-feature` (worktree: `.worktrees/my-feature`)

## Goal

Convert the seven hand-rolled WGSL shaders under `src/services/gpu/shaders/` to WESL, the WebGPU Shading Extended Language, and use its module-import system to extract a reusable shader library under `lib/`. The aim is to eliminate verbatim copy-paste between renderers (`ramp()`, `CloudUniforms`, the position-angle/inclination axis math), shrink the giant `points.wgsl` (1485 lines) by hoisting reusable building blocks out of it, and replace the runtime entry-point juggling between `pointRenderer` and `pickRenderer` with a clean per-stage file split.

Non-goals: rewriting any rendering algorithm, changing the binary point-cloud format, changing pipeline descriptors beyond what the file split mechanically requires, or introducing runtime feature-flag toggling. WESL's full toolbox (linker conditionals, generics) is on the table; we use only what serves the immediate refactor.

## Why WESL (and why now)

WGSL has no module system. Every shader is a single self-contained string compiled into a `GPUShaderModule`. That's fine for a small renderer, but our shader code shows three concrete tax effects of the missing modularity:

1. **Verbatim duplication.** `fn ramp(t: f32) -> vec3<f32>` is identical between `points.wgsl:652` and `proceduralDisks.wgsl:211`. The position-angle + inclination → 3D major/minor axis math at `disks.wgsl:158-166` is bytes-equal to `proceduralDisks.wgsl:154-166`. `struct CloudUniforms` lives in both `points.wgsl:292` and `filaments.wgsl:39`. Each duplicate is a maintenance liability; "fix the bug in both places" is already a thing in this code.
2. **One file, two entry points.** `points.wgsl` exposes both `fs` (color path, used by `pointRenderer`) and `fsPick` (pick-target path, used by `pickRenderer`). Both renderers `import wgsl from './shaders/points.wgsl?raw'` and select different `entryPoint:` strings on pipeline creation. The common code between them is real but the file is monolithic — there's no way to express "these two paths share this vertex stage but diverge at the fragment".
3. **Single-file scale.** `points.wgsl` is 1485 lines and `milkyWayImpostor.wgsl` is 774. Both are dominated by reusable primitives (color ramps, billboard expansion, value noise, ray–sphere intersection, galactic-frame rotation) that are stuck inside the file because there's no way to import them.

WESL is a strict superset of WGSL — every existing `.wgsl` file is already a valid `.wesl` file — so the conversion is incremental and reversible. The toolchain is `wesl-plugin` for Vite (build-time linker, sourcemap-aware, HMR-compatible). At build time WESL modules are linked into a final WGSL string per import; production gets a flat WGSL bundle, dev gets HMR-reloaded modules. Runtime cost: zero.

## Architecture overview

```
src/services/gpu/shaders/
├── lib/
│   ├── math/                       # one function per file
│   │   ├── constants.wesl          #   PI, TAU, LOG10
│   │   ├── rot2.wesl               #   2D rotation
│   │   ├── sabs.wesl               #   smooth absolute value
│   │   ├── saturate.wesl           #   clamp(x, 0, 1)
│   │   ├── toPolar.wesl
│   │   └── toRect.wesl
│   ├── astro.wesl                  # distance modulus, mag→intensity
│   ├── billboard.wesl              # vid→corner, screen/world expansion
│   ├── camera.wesl                 # CameraUniforms, worldToClip, depth
│   ├── cloudFade.wesl              # CloudUniforms + applyCloudFade
│   ├── colorIndex.wesl             # ramp(), color-index → RGB
│   ├── masks.wesl                  # circularMask, lumAlpha, edgeBand
│   ├── orientation.wesl            # PA + inclination → 3D axes
│   ├── tonemap.wesl                # linear/reinhard/asinh/gamma2/aces
│   └── util.wesl                   # noise, raySphere, galactic, sRGB,
│                                   #   pick-encode — staging area; promoted
│                                   #   to lib/<domain>/<fn>.wesl when a
│                                   #   second consumer appears
├── points.io.wesl                  # struct VSOut, struct Uniforms
├── points.vertex.wesl              # @vertex fn vs (shared color + pick)
├── points.color.fragment.wesl      # @fragment fn fs    (pointRenderer)
├── points.pick.fragment.wesl       # @fragment fn fsPick (pickRenderer)
├── milkyWayImpostor.io.wesl
├── milkyWayImpostor.vertex.wesl
├── milkyWayImpostor.fragment.wesl
├── disks.io.wesl
├── disks.vertex.wesl
├── disks.fragment.wesl
├── filaments.io.wesl
├── filaments.vertex.wesl
├── filaments.fragment.wesl
├── proceduralDisks.io.wesl
├── proceduralDisks.vertex.wesl
├── proceduralDisks.fragment.wesl
├── quads.io.wesl
├── quads.vertex.wesl
├── quads.fragment.wesl
├── toneMap.io.wesl
├── toneMap.vertex.wesl
└── toneMap.fragment.wesl
```

The split rule is **uniform**: every shader is broken into a vertex file, a fragment file, and a `.io.wesl` file containing the V→F interpolant struct + uniform layouts that both stages import. `points` is a special case with two fragment variants (color + pick) sharing a vertex file. The uniformity costs slightly more files for the small shaders (`filaments`, `toneMap`, `disks`) where a single file would be navigable, but it pays off in predictability — every renderer's TS file imports the same shape (`<name>.vertex.wesl?link` + `<name>.fragment.wesl?link`), and the V→F interpolant contract for every shader has a single canonical source.

## Library modules

The `lib/` tree has three tiers, distinguished by whether they're solving real duplication today or staging future reuse.

**Immediate-win modules** (each replaces existing duplicated code on extraction):

- **`lib/camera.wesl`** — declares `CameraUniforms` (viewProj, view, proj, cameraPos, kPerZ, viewportPx) and helpers `worldToClip(p) -> vec4<f32>`, `worldEyeDepth(p) -> f32`, `pixelSizeAt(eyeDepth) -> f32`. Every renderer except `toneMap` currently rolls its own `viewProj * vec4(p, 1)` plus a per-shader copy of the kPerZ scaling logic. Consolidating fixes the second concrete bug class on the project's `things-that-have-bitten-us` list — the `queue.writeBuffer` race only happens because per-renderer uniform structs each have their own subtly different layouts to keep in sync.
- **`lib/billboard.wesl`** — unit-quad `vid -> corner` expansion (used by `points`, `quads`, `disks`, `proceduralDisks`), plus `expandBillboardScreen(centerWS, sizePx, vid)` (kPerZ-scaled, screen-aligned) and `expandBillboardWorld(centerWS, sizeWS, vid)` (world-space-sized, view-aligned). Each billboard shader currently writes its own version of this, with subtle differences that have caused alignment bugs.
- **`lib/orientation.wesl`** — given a galaxy's (positionWS, position-angle, inclination, axisRatio) plus the camera position, returns `(majorAxis3D, minorAxis3D)` in world space. The 9-line block at `disks.wgsl:158-166` and `proceduralDisks.wgsl:154-166` is byte-for-byte identical; this module is the first one extracted because the saving is unambiguous and the consolidation pays for the WESL setup work on its own.
- **`lib/colorIndex.wesl`** — exports `ramp(t: f32) -> vec3<f32>`, the duplicated piecewise color-index→RGB function. Future expansion slot for B−V→temperature→RGB if/when we move to a physically-grounded color model.
- **`lib/cloudFade.wesl`** — exports `CloudUniforms` and `applyCloudFade(opacity)`. Resolves the duplicate struct between `points` and `filaments`.
- **`lib/masks.wesl`** — `circularMask(uv, inner, outer) -> f32`, `lumAlpha(lum, lo, hi) -> f32`, `edgeBandMask(uv, fade) -> f32`. Each existing fragment shader hand-rolls a `1 - smoothstep(0.45, 0.5, r)` or similar; consolidating makes it consistent and clarifies which renderer uses which mask shape.
- **`lib/astro.wesl`** — `distanceModulus(appMag, dMpc) -> f32` (the `appMag - 5·log₁₀(d_Mpc) - 25` line currently inline at `points.wgsl:762`), `appMagToIntensity(m) -> f32` (the `pow(10, -0.4·m)` pattern), `LOG10` constant. Today's only consumer is `points`, but the formulas are the canonical astronomy primitives — pulling them into a single, comment-rich file makes them documentable and future-proof for any catalog/UI/debug shader that needs to convert between magnitude representations.
- **`lib/tonemap.wesl`** — `applyLinear`, `applyReinhard`, `applyAsinh`, `applyGamma2`, `applyAces`. Currently lives inside `toneMap.wgsl`. Pulling them out makes them reusable for any future post-process pass (bloom, motion blur, debug-tonemap previews) without `toneMap.wesl` becoming a transitive import.

**Math primitives** (each in its own file under `lib/math/`, per the project's house rule):

- **`lib/math/saturate.wesl`** — `fn saturate(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }`. Currently written inline as `clamp(x, 0.0, 1.0)` ~20× across the shaders.
- **`lib/math/rot2.wesl`** — 2D rotation matrix builder; replaces the hand-rolled `cos·p.x − sin·p.y` and `sin·p.x + cos·p.y` lines that appear in `milkyWayImpostor.wgsl` and the position-angle code in `points.wgsl`.
- **`lib/math/sabs.wesl`** — smooth absolute value with parameter `k`. Currently lives in `milkyWayImpostor.wgsl:425`. Generic enough to live with the other math primitives.
- **`lib/math/toPolar.wesl`** / **`lib/math/toRect.wesl`** — Cartesian↔polar (vec2). Currently in `milkyWayImpostor.wgsl:330-336`.
- **`lib/math/constants.wesl`** — `const PI = 3.14159...`, `const TAU = 6.28318...`, `const LOG10 = 2.30258...`. Tiny but eliminates the magic numbers that recur in points + milkyWay.

The "one function per file" rule applies specifically to `lib/math/`. The other lib modules are themed cohesive units (camera *is* its uniform struct + its handful of helpers; splitting them into per-function files would obscure their interface), and they stay multi-function.

**Future-proofing modules** (single call site today, generic utility — staged in `lib/util.wesl` until they earn their own file):

`lib/util.wesl` consolidates the orphan utilities: `hash21(co)`, `valueNoise2(p)` (currently `rand`/`noise1` in milkyWay), `raySphere(ro, rd, center, r)` (currently in milkyWay), `worldToGalactic(v)` / `galacticToShader(g)` (galactic-frame rotations from milkyWay), `linearToSRGB` / `srgbToLinear` (currently implicit in `toneMap`'s gamma curve), and `encodePickId(idx)` / `decodePickId(v)` (currently inline in `points.wgsl:fsPick`). They live together until a real second consumer appears, at which point each graduates to its own `lib/<domain>/<fn>.wesl` file (matching the `lib/math/` pattern). The util file is a staging area, not a permanent home.

## Tooling

- Add `wesl-plugin` as a devDependency. Wire it into `vite.config.ts` alongside the existing React + WebGPU type plugins. The plugin registers a `?link` import suffix that runs the WESL linker at build time and returns the linked WGSL string — semantically equivalent to today's `?raw` import, but with imports resolved.
- Add `src/@types/wesl.d.ts` mirroring the existing `wgsl.d.ts`, declaring `*.wesl?link` as resolving to `string`.
- Rename `.wgsl` → `.wesl` across `src/services/gpu/shaders/`. Because WESL is a strict superset, no shader content changes are required for the rename itself — the build keeps producing identical pipelines until imports are added.
- Each renderer's TS file changes one line: `import shader from './shaders/foo.wgsl?raw'` becomes `import shader from './shaders/foo.wesl?link'`. The shape (string) is unchanged. Renderers that split into vertex/fragment modules go from one import to two, and `device.createRenderPipeline` is updated to pass two `GPUShaderModule`s — which matches WebGPU's native pipeline shape (vertex and fragment have always been separate fields; today both happen to point at the same module).

## Migration plan (15 tasks)

Each task is independently shippable. The build stays green throughout, the existing 590+ test suite stays green, and every shader-touching task ends with a manual visual sanity check on the running dev server before being marked complete (per the `wgsl-meticulous` project convention — shader edits never ship on confidence alone).

1. **Tooling bootstrap.** Add `wesl-plugin` + Vite config + `wesl.d.ts`. Convert `toneMap.wgsl` → `toneMap.wesl`, switch the `toneMapPass.ts` import from `?raw` to `?link`. Smoke-test: build, dev HMR, sourcemap line numbers in browser errors. If sourcemaps are broken, decide here whether to live with it or fall back to a hand-rolled Vite plugin around `wesl-js`'s linker.
2. **Bulk rename.** The remaining 6 shaders renamed `.wgsl` → `.wesl`, all `?raw` imports switched to `?link`. No content changes. Visual diff: nothing.
3. **Extract `lib/math/`.** Create the six single-function files. Replace inline `clamp(x, 0, 1)` with `saturate(x)` in shaders that already use it; replace the 2D rotation pattern in milkyWay with `rot2`. Constants pulled out into `constants.wesl`. Tests stay green; visual: identical.
4. **Extract `lib/camera.wesl`.** Replace each renderer's hand-rolled view/proj math with imports. One sub-commit per renderer to keep diffs reviewable. The camera uniform layout changes per renderer because some have additional renderer-specific fields — those move into a renderer-local struct that *contains* `CameraUniforms` rather than duplicating its fields.
5. **Extract `lib/billboard.wesl`.** Replace the unit-quad expansion + screen-space-sizing logic in `points`, `quads`, `disks`, `proceduralDisks`. Each replacement is mechanical; the win is removing the per-renderer subtle variations.
6. **Extract `lib/orientation.wesl`.** Collapses the verbatim PA+inclination duplicate between `disks` and `proceduralDisks`. Smallest commit, biggest readability win.
7. **Extract `lib/colorIndex.wesl`.** Collapses the `ramp()` duplicate between `points` and `proceduralDisks`.
8. **Extract `lib/cloudFade.wesl`.** Collapses the `CloudUniforms` + `applyCloudFade` duplicate between `points` and `filaments`.
9. **Extract `lib/masks.wesl`.** Pulls the circular / lum / edge-band masks out of `disks`, `quads`, `proceduralDisks`, `filaments`.
10. **Extract `lib/astro.wesl`.** Pulls the distance-modulus and magnitude→intensity formulas out of `points` into a documented module.
11. **Extract `lib/tonemap.wesl`.** The five tone-mapping functions move out of `toneMap.wesl`; the renderer entry shader becomes a thin import + entry-point file.
12. **Extract `lib/util.wesl`.** Consolidates noise, ray-sphere, galactic-frame, sRGB, and pick-encode utilities pulled out of `milkyWayImpostor`, `toneMap`, and `points` (the pick path).
13. **Split `points` into 4 files.** `points.io.wesl` (shared structs), `points.vertex.wesl` (shared `vs`), `points.color.fragment.wesl` (`fs` for `pointRenderer`), `points.pick.fragment.wesl` (`fsPick` for `pickRenderer`). `pointRenderer.ts` and `pickRenderer.ts` each import their respective vertex+fragment pair. This replaces the planned `@if(PICK)` approach with a cleaner two-file split — no conditional compilation needed.
14. **Split `milkyWayImpostor` into 3 files.** `milkyWayImpostor.io.wesl`, `milkyWayImpostor.vertex.wesl`, `milkyWayImpostor.fragment.wesl`. The fragment file is where most of the existing 774 lines end up (procedural galaxy, ray-sphere, noise) — but with `lib/util.wesl` already extracted in task 12, the file is dominated by genuine renderer-specific code rather than reusable primitives.
15. **Split remaining 5 shaders into 3 files each.** `disks`, `filaments`, `proceduralDisks`, `quads`, `toneMap` each get a `.io.wesl` + `.vertex.wesl` + `.fragment.wesl` triple. Each of the five splits is mechanical and small (the original files are 138–258 lines), so they're bundled into a single sweep with one sub-commit per renderer. Each renderer's TS file gains one extra `?link` import.

## Risks

**`wesl-plugin` maturity.** WESL is a young language and its Vite plugin is correspondingly young. Task 1 is the smoke test — if HMR, sourcemaps, or module resolution have rough edges that don't have a plugin-level fix, fall back to a small custom Vite plugin around `wesl-js` (the linker library, which is more stable than the all-in-one plugin). The fallback adds ~30 lines of plugin code to `vite.config.ts` but keeps the same build-time-link semantics.

**Shader debugging line numbers.** Browser-side shader compilation errors will reference the linked WGSL output, not the source `.wesl` file. `wesl-plugin` advertises sourcemap support but it needs verification on Chrome's WebGPU compiler error path. If sourcemaps don't survive into browser error messages, mitigation is logging the linked WGSL alongside the error in dev mode — already a pattern this repo uses for catalog-format errors.

**Subtle struct-layout drift.** When `CameraUniforms` moves from inline definitions across six renderers into `lib/camera.wesl`, any field-order divergence breaks bind groups silently — the GPU will read garbage instead of erroring. Mitigation is per-step diff review at the byte level, plus a one-time write-up of the canonical `CameraUniforms` field order in the module's docblock so that future changes happen in one place. The 590-test suite covers TS-side correctness but doesn't catch GPU-side struct-alignment bugs; visual sanity is the only check there.

**Shader file is not unit-testable.** Tests are silent on shader correctness. Every shader-touching task is gated on a manual visual comparison ("does the rendered scene look identical to before?") on the running dev server, plus the standard test pass for the surrounding TS scaffolding. The `wgsl-meticulous` project memory enforces this.

**Plan stays sequential, not parallel.** Tasks 4–12 each touch multiple renderers (each lib extraction sweeps across consumers) so they can't be parallelised by subagent. The throughput limit is one task per implementer per session, with visual review between. That's deliberate — the cost of a silent regression is high enough that batching gains aren't worth chasing.

## Out of scope

- Runtime feature-flag toggling (would require shipping `.wesl` source to the browser; we don't need it).
- Any procedural code change inside a shader (this is a refactor, not a redesign — the rendered output is byte-identical at every step).
- The `tools/` build pipeline (the catalog `.bin` format and the parsers under `tools/parsers/` are untouched).
- Migration of any future shader stages (compute, mesh) — none exist today; if they do later, they slot into the same lib structure with no design change required.
- A WESL coding-style guide or shared lint rules. The project's existing didactic-comments convention and `feedback_wgsl_meticulous` rule are sufficient guidance.
