# Galaxy Renderer 01 — tool scaffold & procedural model

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention. Steps use checkbox (`- [x]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-02-galaxy-renderer-tool-design.md`
**Series:** plan 01 of 3 (02 = engine + shaders, 03 = state + UI + matcher). Each plan lands working, tested software on its own.

**Goal:** Stand up the `tools/galaxy-renderer/` Vite app skeleton (port 5400, shared `public/`, tool-local WESL toml) and port the spike's procedural Hubble-sequence galaxy generator (`galaxy-model.js`) into a fully decomposed, typed, tested TypeScript model: `generateGalaxy(params) → GeneratedGalaxy`, deterministic and byte-stable, plus the worker entry that plan 02's engine will drive.

**Architecture:** The spike's single 600-line `generateGalaxy` closure becomes an orchestrator over one-builder-per-file population modules (`src/model/populations/`). The closure environment becomes an explicit `GalaxyBuildContext` carrying the seeded RNG streams, scale constants, warp/lopsided/falloff functions, the HII palette, and `addStar`/`addDust` write paths. Buffer mechanics live in `starWriter`/`dustWriter`; physics (warp application, dust reddening) lives in the context's write closures — writers never know about warp. **The RNG draw order is part of the output contract**: the four streams (`seed`/`asymSeed`/`clumpSeed`/`waveSeed`) are shared mutable closures and the builders consume them in the spike's exact order, so a given params object produces the *same galaxy* the spike produces, not merely a statistically similar one.

**Tech Stack:** TypeScript, Vite (tool app), Vitest. No new npm deps.

**Reference source (read-only, outside the repo):** the spike at `/Users/rulkens/Downloads/galaxy-renderer/`. This plan cites it as `galaxy-model.js:NNN` etc. Implementers MUST read the cited lines — the spike is the algorithm's source of truth; this plan only pins the contracts.

## Global Constraints

- Work in the worktree at `.claude/worktrees/better-galaxy-renderer` (branch `better-galaxy-renderer`). All test commands run from the worktree root.
- `npm test` and `npm run typecheck` green before every commit. Stage specific paths — never `git add -A`.
- **Behaviour-identical port.** Every constant is carried verbatim (cites given per task). Preserve RNG draw order exactly — including draws the spike makes unconditionally (e.g. the bar-angle draw at `galaxy-model.js:229` happens for every category). Never "fix" a spike formula; deviations are listed explicitly in this plan or not made at all.
- House conventions: `type` aliases never `interface`; one exported type per `@types/` file (`.d.ts`, filename = type name); one exported function per `src/utils/` file; `Vec3`/`Vec2` aliases from `src/@types/math/` — never raw `[number, number, number]`; didactic timeless comments (why + the alternative, no history notes); typed `vi.fn<...>()` in tests.
- Reuse, don't reinvent: `src/utils/random/mulberry32.ts` (the spike's `makeRng` at `galaxy-math.js:64-72` IS mulberry32 — identical bit-mixing, verified) and `tools/utils/random/gaussian.ts` (the spike's `makeGaussian` at `galaxy-math.js:79-86`, same Box–Muller; the house version clamps `u1` to `Number.MIN_VALUE` instead of looping on 0 — draw count and output differ only if the PRNG emits exactly 0, p ≈ 2⁻³² per draw, which the spec accepts as identical). Before writing ANY helper, grep `src/utils/` and `tools/utils/` for an existing one.
- Prettier only on files you touched.
- Tests mirror source: model tests under `tests/tools/galaxy-renderer/model/`, the shared util under `tests/utils/random/`.

---

## Task 1 — tool scaffold + npm script

Create the sibling Vite app, mirroring `tools/flow-workbench/` file-for-file, with the three deltas the spec pins: port **5400**, tool-local shader root, and a placeholder entry (the real app arrives in plans 02/03).

**Files**
- Create: `tools/galaxy-renderer/vite.config.ts`, `tools/galaxy-renderer/wesl.toml`, `tools/galaxy-renderer/tsconfig.json`, `tools/galaxy-renderer/index.html`, `tools/galaxy-renderer/README.md`, `tools/galaxy-renderer/src/main.tsx` (placeholder)
- Modify: `package.json` (one script line)
- Test: `tests/tools/galaxy-renderer/viteConfig.smoke.test.ts`

**Interfaces**

`vite.config.ts` — mirror `tools/flow-workbench/vite.config.ts` (read it whole; its module header explains every choice) with:
- `root: resolve(__dirname)`
- `publicDir: resolve(__dirname, '../../public')` — serves the curated reference images at `/images/famous-curated/...`; no image copies enter the repo
- `server: { port: 5400 }` (5173 main / 5200 curator / 5300 flow-workbench stay clear)
- plugins: `viteWesl({ extensions: [staticBuildExtension], weslToml: resolve(__dirname, 'wesl.toml') })` then `react()`. The explicit `weslToml` is load-bearing — the plugin otherwise reads `<cwd>/wesl.toml` (the runtime's), the flow-workbench gotcha.

`wesl.toml` — unlike flow-workbench (which links against the runtime's shader tree), this tool's shaders are self-contained:

```toml
edition = "unstable_2025"
include = ["src/engine/shaders/**/*.wesl"]
root = "src/engine/shaders"
```

so plan 02's `import package::lib::fullscreenTri::…;` resolves against the tool's own `lib/`.

`tsconfig.json` — copy `tools/flow-workbench/tsconfig.json`, adding `"wesl-plugin/suffixes"` to `compilerOptions.types` (the tool's own `.wesl?static` imports need the ambient module; flow-workbench dodges this by importing runtime renderers that are typed under the root config).

`index.html` — mirror `tools/flow-workbench/index.html` (title "Galaxy Renderer", `<div id="root">`, module script `./src/main.tsx`).

`src/main.tsx` — placeholder that writes a one-line "galaxy-renderer: engine lands in plan 02" into `#root`. Replaced wholesale in plan 02; exists so `npm run galaxy-renderer` serves without a 404 from day one.

`package.json` script: `"galaxy-renderer": "vite --config tools/galaxy-renderer/vite.config.ts"`.

**Steps**
- [x] Write `tests/tools/galaxy-renderer/viteConfig.smoke.test.ts` failing-first — copy the shape of `tests/tools/flow-workbench/viteConfig.smoke.test.ts` (async import of the config, resolve the function/object union, assert `server.port === 5400`, assert flattened plugin names include `react` and `wesl`).
- [x] `npx vitest run tests/tools/galaxy-renderer/viteConfig.smoke.test.ts` → fails (module absent).
- [x] Create the six tool files + the npm script.
- [x] `npx vitest run tests/tools/galaxy-renderer/viteConfig.smoke.test.ts` → passes. `npm run typecheck` green.
- [x] `README.md`: what the tool is (spec §Why in two sentences), `npm run galaxy-renderer` → `http://localhost:5400`, pointer to the spec.
- [x] Commit (stage the six new files + `package.json` + the test).

---

## Task 2 — shared util: `makeValueNoise`

The one genuinely new shared helper (spec §Reuse): seeded trilinear 3D value noise, port of `galaxy-math.js:95-113`. Lives in `src/utils/random/` because the model is destined to move into `src/` later.

**Files**
- Create: `src/utils/random/makeValueNoise.ts`
- Test: `tests/utils/random/makeValueNoise.test.ts`

**Interfaces**

```ts
export function makeValueNoise(seed: number): (x: number, y: number, z: number) => number;
```

Hash lattice + smoothstep-interpolated trilinear blend, constants verbatim from `galaxy-math.js:97-101`: multipliers `374761393`, `668265263`, `2147483647`, seed mix `974711`, avalanche `1274126177`, final `>>> 16` fold, `/ 4294967296`.

**Steps**
- [x] Write the failing tests:
  - `same seed and coords give the same value` — two independent samplers, same seed, equal outputs at several coords.
  - `different seeds decorrelate` — seed 1 vs seed 2 differ at at least one probe point.
  - `outputs stay in [0, 1)` — sweep a grid of ≥1000 points incl. negative coords; assert `0 <= v && v < 1`.
  - `varies smoothly between lattice points` — for 100 random points, `|f(x+0.01,y,z) − f(x,y,z)| < 0.1` (trilinear + smoothstep bounds the local slope).
  - `is continuous at lattice corners` — the smoothstep weights vanish at integer coords, so `f(i,j,k)` and `f(i+1e-6, j, k)` agree within 1e-3; also assert two neighbouring lattice points differ (non-constant field).
- [x] `npx vitest run tests/utils/random/makeValueNoise.test.ts` → fails.
- [x] Implement (port the cited lines; keep the house didactic-header style — say why value noise and not Perlin: cheap, isotropy irrelevant for density modulation).
- [x] Test passes. Commit.

---

## Task 3 — model types + `tempColor` + `hiiPalette`

Pin the model's shared vocabulary: the parameter/type surface everything downstream compiles against, plus the two small colour helpers.

**Files**
- Create (`tools/galaxy-renderer/@types/model/`, one type per `.d.ts` file, `type` aliases only):
  - `GalaxyParams.d.ts`, `GalaxyCategory.d.ts`, `GeneratedGalaxy.d.ts`, `StarBudget.d.ts`, `DustSeed.d.ts`, `BarGeometry.d.ts`, `HiiPalette.d.ts`, `StarWriter.d.ts`, `DustWriter.d.ts`
- Create: `tools/galaxy-renderer/src/model/tempColor.ts`, `tools/galaxy-renderer/src/model/hiiPalette.ts`
- Test: `tests/tools/galaxy-renderer/model/tempColor.test.ts`, `tests/tools/galaxy-renderer/model/hiiPalette.test.ts`

**Interfaces**

```ts
export type GalaxyCategory = 'elliptical' | 'lenticular' | 'irregular' | 'barred' | 'spiral';
```

```ts
// GalaxyParams — every knob optional except `type`; generateGalaxy applies the
// spike's defaults (table below). The spike's `background` flag is dropped:
// galaxy-model.js:117 hardcodes the background field to 0, so the knob was dead.
export type GalaxyParams = {
  readonly type: string; // Hubble type: 'Sa'..'Sc', 'SBa'..'SBc', 'E0'..'E7', 'S0', 'Irr'
  readonly starCount?: number;
  readonly radius?: number;
  readonly bulgeSize?: number;
  readonly bulgeFalloff?: number;
  readonly diskThickness?: number;
  readonly irregularity?: number;
  readonly armCount?: number;
  readonly armWinding?: number;
  readonly armWidth?: number;
  readonly armStrength?: number;
  readonly subArms?: number;
  readonly armFalloff?: number;
  readonly armEdgeVar?: number;
  readonly armClump?: number;
  readonly armWave?: number;
  readonly barStrength?: number;
  readonly youngStars?: number;
  readonly metallicity?: number;
  readonly hii?: number;
  readonly dust?: number;
  readonly dustNoise?: number;
  readonly dustNoiseScale?: number;
  readonly dustRing?: number;
  readonly dustRingWidth?: number;
  readonly dustRingStrength?: number;
  readonly globularCount?: number;
  readonly globularSize?: number;
  readonly globularBright?: number;
  readonly warpStrength?: number;
  readonly warpTwist?: number;
  readonly warpStart?: number;
  readonly seed?: number;
  readonly asymSeed?: number;
  readonly clumpSeed?: number;
  readonly waveSeed?: number;
};
```

Defaults (applied at point of use, exactly as the spike does — document this table in the `GalaxyParams` docblock):

| param | default | cite |
| --- | --- | --- |
| starCount | 400000, floored, min 20000 | model.js:89 |
| radius / bulgeSize / diskThickness | 1 | 86–88 |
| bulgeFalloff / irregularity | 0.5 | 192 / 179 |
| armCount 2 · armWinding 0.5 · armWidth 1 · armStrength 1 | | 288 / 289 / 292 / 111 |
| subArms 0 · armFalloff 0.6 · armEdgeVar 0 · armClump 0.5 · armWave 0 | | 293 / 298 / 300 / 302 / 294 |
| barStrength 1 | | 228 |
| youngStars 0.5 · hii 1 · metallicity 0.5 | | 167 / 303 / 131 |
| dust 1 · dustNoise 0.6 · dustNoiseScale 1 | | 488 / 505 / 506 |
| dustRing 0.72 · dustRingWidth 0.12 · dustRingStrength 0 | | 572 / 573 / 571 |
| globularCount 0 · globularSize 1 · globularBright 0.6 | | 118 / 453 / 454 |
| warpStrength 0 · warpTwist 0 · warpStart 0.3 | | 141 / 142 / 146 |
| seed `(seed\|0) \|\| 1` · asymSeed `((asymSeed\|0) \|\| 331) >>> 0` · clumpSeed 911 · waveSeed 777 | | 79 / 180 / 296 / 295 |

```ts
export type GeneratedGalaxy = {
  readonly stars: Float32Array;   // [x,y,z, r,g,b, size, brightness] × starCount (stride 8)
  readonly starCount: number;
  readonly dust: Float32Array;    // [x,y,z, size, r,g,b, opacity] × dustCount (stride 8)
  readonly dustCount: number;
};
```

```ts
export type StarBudget = {
  readonly totalStars: number;    // max(20000, floor(starCount ?? 400000)) — carried so scale
                                  // constants (grainScale) and the split share one derivation
  readonly bulgeCount: number;
  readonly diskCount: number;
  readonly armStarCount: number;
  readonly haloCount: number;
};
```

```ts
export type DustSeed = {
  readonly x: number; readonly y: number; readonly z: number;
  readonly radius: number;  // hypot(x, z) at emission
  readonly angle: number;   // atan2-style azimuth at emission
  readonly armFade: number; // arm brightness envelope 0..1; irregular clumps emit 1
};
```

```ts
export type BarGeometry = { readonly barLength: number; readonly cosBar: number; readonly sinBar: number };
```

```ts
export type HiiPalette = { readonly core: Vec3; readonly halo: Vec3 };
```

```ts
export type StarWriter = {
  write(x: number, y: number, z: number, r: number, g: number, b: number, size: number, brightness: number): void;
  readonly count: () => number;          // records written so far
  readonly view: () => Float32Array;     // zero-copy subarray of the filled region
};
export type DustWriter = {
  write(x: number, y: number, z: number, size: number, r: number, g: number, b: number, opacity: number): void;
  readonly count: () => number;
  readonly toFloat32Array: () => Float32Array; // tight copy (dust count is not known up front)
};
```

`tempColor` — port of `galaxy-color.js:6-26` (the six `COLOR_STOPS` verbatim, module-local const). Signature keeps the spike's write-into-out shape — it runs ~10⁶ times per generation, the documented perf carve-out from prefer-immutability:

```ts
export function tempColor(t: number, out: Vec3): void;
```

`hiiPalette` — the metallicity-driven HII emission palette, extracted from `galaxy-model.js:131-136`:

```ts
export function hiiPalette(metallicity: number): HiiPalette;
```

core: metallicity < 0.5 lerps teal `[0.40, 0.85, 0.80]` → pink `[1.0, 0.42, 0.56]`, then pink → deep red `[1.0, 0.30, 0.32]`; halo lerps `[0.42, 0.78, 0.72]` → `[1.0, 0.26, 0.30]` over the full range.

**Steps**
- [x] Write the failing tests:
  - `tempColor.test.ts`: `t=0 samples the coolest stop` (`[1.00, 0.36, 0.16]`), `t=1 clamps to the hottest stop` (within one step of `[0.60, 0.72, 1.00]` — spike clamps t to 0.999), `midpoints interpolate linearly` (t exactly on stop 1 → `[1.00, 0.58, 0.28]`), `blue channel is monotone non-decreasing in t` (sweep).
  - `hiiPalette.test.ts`: `metallicity 0 gives a teal core`, `metallicity 0.5 gives the pink core exactly`, `metallicity 1 gives the deep-red core exactly`, `halo tracks metallicity` (endpoints exact).
- [x] Run both → fail. Create the nine `.d.ts` files + the two modules.
- [x] `npx vitest run tests/tools/galaxy-renderer/model` → passes. `npm run typecheck`. Commit.

---

## Task 4 — `classifyHubbleType` + `splitStarBudget`

**Files**
- Create: `tools/galaxy-renderer/src/model/classifyHubbleType.ts`, `tools/galaxy-renderer/src/model/splitStarBudget.ts`
- Tests: `tests/tools/galaxy-renderer/model/classifyHubbleType.test.ts`, `tests/tools/galaxy-renderer/model/splitStarBudget.test.ts`

**Interfaces**

```ts
export function classifyHubbleType(type: string): GalaxyCategory;
```
Port of `galaxy-model.js:58-65` (the spike duplicated this as `CAT` in the HTML at `Galaxy Renderer.dc.html:381-387`; this file is now the single source — plans 02/03 import it, nothing re-implements it).

```ts
export function splitStarBudget(category: GalaxyCategory, params: GalaxyParams): StarBudget;
```
Table dispatch on category (spec mandate: no predicate chain — a `Record<GalaxyCategory, (…) => …>` or switch-free table; spiral and barred share one entry parameterised by category). Formulas verbatim from `galaxy-model.js:89-116`:
- elliptical: bulge = floor(0.9·total), disk = arm = 0, halo = remainder
- lenticular: bulge = floor(0.55·total), disk = floor(0.4·total), arm = 0, halo = remainder
- irregular: bulge = floor(0.06·total), arm = floor(0.86·total), disk = 0, halo = remainder
- spiral/barred: bulgeFraction = `0.12 + 0.35·bulgeSize·(barred ? 0.8 : 1)` capped 0.55; armFraction = `0.4·armStrength`; arm = floor((total − bulge)·armFraction); disk = remainder; halo = 0

**Steps**
- [x] Failing tests:
  - classify: one assertion per family — `'E0'`/`'E7'` → elliptical, `'S0'` → lenticular, `'Irr'` → irregular, `'SBa'`/`'SBc'` → barred, `'Sa'`/`'Sc'` → spiral, unknown string → spiral (spike fallback, model.js:64).
  - split: `counts sum to exactly totalStars for every category` (bulge+disk+arm+halo === totalStars — the spike computes halo as remainder everywhere except spiral where halo=0 and disk is the remainder; assert the sum either way); `totalStars floors at 20000`; `elliptical has zero disk and arm stars`; `irregular has zero smooth-disk stars`; `lenticular has zero arm stars`; `spiral arm share scales with armStrength` (armStrength 0 → armStarCount 0); `barred bulge fraction is 0.8× the spiral one` (same params, compare).
- [x] Run → fail. Implement. Run → pass. `npm run typecheck`. Commit.

---

## Task 5 — `starWriter` + `dustWriter`

Pure buffer mechanics — stride-8 interleaving, capacity guarding. No physics here (warp/reddening live in the build context, Task 7), so these stay trivially testable.

**Files**
- Create: `tools/galaxy-renderer/src/model/starWriter.ts` (`createStarWriter`), `tools/galaxy-renderer/src/model/dustWriter.ts` (`createDustWriter`)
- Tests: `tests/tools/galaxy-renderer/model/starWriter.test.ts`, `tests/tools/galaxy-renderer/model/dustWriter.test.ts`

**Interfaces**

```ts
export function createStarWriter(capacityStars: number): StarWriter;
export function createDustWriter(): DustWriter;
```

- StarWriter preallocates `capacityStars * 8` floats (the capacity formula lives with the orchestrator, Task 10 — writers don't know galaxy math). **Overflow throws.** The spike wrote past the end of a `Float32Array`, which JS silently ignores while the write cursor keeps advancing — corrupt-and-continue. Throwing turns a headroom-formula regression into a loud test failure instead of a garbled galaxy.
- DustWriter accumulates in a growable `number[]` (dust count is unknowable up front — mirrors `galaxy-model.js:490-499`'s push array) and `toFloat32Array()` snapshots it.

**Steps**
- [x] Failing tests:
  - star: `records land at stride-8 offsets` (write two records, assert exact float slots: record 1 slot 0..7, record 2 slot 8..15, field order x,y,z,r,g,b,size,brightness); `count tracks records written`; `view length is count*8 and aliases the backing buffer` (no copy — mutating view is visible on next view); `writing past capacity throws`.
  - dust: `records land at stride-8 offsets` (field order x,y,z,size,r,g,b,opacity — note the size-before-colour order differs from stars; that asymmetry is the GPU vertex layout's, carried as-is); `toFloat32Array length is count*8`; `empty writer yields a zero-length array`.
- [x] Run → fail. Implement. Run → pass. Commit.

---

## Task 6 — `makeWarpOffset`

The galactic-warp vertical offset — zero inside `warpStart`, S-shaped and twist-precessing beyond. Port of `galaxy-model.js:141-151`.

**Files**
- Create: `tools/galaxy-renderer/src/model/makeWarpOffset.ts`
- Test: `tests/tools/galaxy-renderer/model/makeWarpOffset.test.ts`

**Interfaces**

```ts
export function makeWarpOffset(params: GalaxyParams, outerRadius: number): (x: number, z: number) => number;
```

Formula verbatim: `warpStrength · outerRadius · 0.4 · rel² · sin(atan2(z, x) − warpTwist·rel)` with `rel = (r − start) / max(1e-4, outerRadius − start)`, `start = outerRadius · (warpStart ?? 0.3)`; returns 0 when `warpStrength ≤ 0` or `r ≤ start`.

**Steps**
- [x] Failing tests: `returns zero everywhere when warpStrength is 0`; `returns zero inside the warp start radius` (probe just inside `start`); `is antisymmetric across the disk (integral-sign shape)` — for warpTwist 0, `offset(x, z) === −offset(−x, −z)` at several outer-disk points; `grows quadratically with radial excess` (offset at rel=1 ≈ 4× offset at rel=0.5 along a fixed azimuth, twist 0); `twist precesses the node line` (with warpTwist > 0, the azimuth of the zero-crossing at rel=1 differs from the one at rel≈0.2).
- [x] Run → fail. Implement. Run → pass. Commit.

---

## Task 7 — `GalaxyBuildContext` + `createGalaxyBuildContext`

The spike's closure environment, made explicit. This is where the four RNG streams are born, where scale constants are derived, and where `addStar`/`addDust` compose warp + reddening onto the writers.

**Files**
- Create: `tools/galaxy-renderer/@types/model/GalaxyBuildContext.d.ts`
- Create: `tools/galaxy-renderer/src/model/createGalaxyBuildContext.ts`
- Test: `tests/tools/galaxy-renderer/model/createGalaxyBuildContext.test.ts`

**Interfaces**

```ts
export type GalaxyBuildContext = {
  readonly params: GalaxyParams;
  readonly category: GalaxyCategory;
  readonly budget: StarBudget;

  // ── seeded streams — SHARED MUTABLE closures; draw order is contract ──
  readonly rand: () => number;        // mulberry32((seed|0) || 1)            — model.js:79
  readonly randNormal: () => number;  // () => gaussian(rand)                 — model.js:80 (reuses tools/utils/random/gaussian.ts)
  readonly asymRand: () => number;    // mulberry32(((asymSeed|0) || 331)>>>0) — model.js:180
  // clump/wave streams are created INSIDE the spiral-arm builder (model.js:295-296), not here.

  // ── scale constants — model.js:85-89, 172-173 ──
  readonly outerRadius: number;   // 10 · radius
  readonly diskScaleLen: number;  // outerRadius / 3.2
  readonly bulgeRadius: number;   // outerRadius · 0.34 · bulgeSize
  readonly diskHeight: number;    // 0.055 · outerRadius · diskThickness
  readonly grainScale: number;    // cbrt(400000 / totalStars)
  readonly starSize: number;      // 0.016 · outerRadius · grainScale

  // ── asymmetry — model.js:176-192 ──
  readonly flattening: number;    // elliptical: 1 − 0.09·(E-digit); else 0.62
  readonly asymmetry: number;     // irregularity ?? 0.5
  readonly applyLopsided: (radius: number, angle: number) => number;   // m=1 stretch, model.js:183-185
  readonly bulgeAxisX: number; readonly bulgeAxisY: number; readonly bulgeAxisZ: number;
  readonly cosBulge: number; readonly sinBulge: number;                // triaxial bulge rotation, model.js:188-190
  readonly bulgeConcentration: number;                                  // bulgeFalloff ?? 0.5

  // ── shared shaping fns ──
  readonly diskFalloff: (radius: number, softness: number) => number;   // exp profile, model.js:194
  readonly sampleDiskRadius: () => number;                              // rejection-sampled exp, model.js:252-257 (draws rand()!)
  readonly randomLuminosity: () => number;                              // steep tail, model.js:162-165 (draws rand()!)
  readonly hii: HiiPalette;

  // ── write paths — warp/reddening composed HERE, writers stay dumb ──
  readonly addStar: (x: number, y: number, z: number, r: number, g: number, b: number, size: number, brightness: number) => void;
  readonly addDust: (x: number, y: number, z: number, size: number, opacity: number) => void;
  readonly stars: StarWriter;
  readonly dust: DustWriter;
};
```

```ts
export function createGalaxyBuildContext(params: GalaxyParams): GalaxyBuildContext;
```

Contract points to pin in the docblock and tests:
- `addStar` adds `warpOffset(x, z)` to y before writing (model.js:152-158); `addDust` does the same AND derives the reddened colour by drawing **four values from the main `rand` stream** (darkness + three channel factors, model.js:492-499: `darkness = 0.020 + 0.022·rand()`, `dr = darkness·(1.05 + 0.55·rand())`, `dg = darkness·(0.60 + 0.22·rand())`, `db = darkness·(0.32 + 0.26·rand())`).
- Star buffer capacity (passed to `createStarWriter`) is the spike's headroom formula, model.js:124-125: `planned + armStarCount + ceil((diskCount + armStarCount) · 0.08) + 64` records, where `planned = bulge + disk + arm + halo + floor(globularCount)·90`.
- **asymRand construction draws, in order** (model.js:183-189): 1 lopsidedAmp, 2 lopsidedAngle, 3 bulgeAxisZ, 4 bulgeAngle. Nothing else draws from any stream at construction — the main stream's first draw belongs to the bulge builder.

**Steps**
- [x] Failing tests:
  - `scale constants match the spike formulas` — radius 1.3, diskThickness 0.8, bulgeSize 0.5, starCount 400000: assert each constant to 1e-12.
  - `grainScale is 1 at 400k stars and shrinks with more stars`.
  - `elliptical flattening follows the E-digit` — 'E0' → 1, 'E7' → 1 − 0.63.
  - `addStar applies the warp offset to y` — params with warpStrength 0.3; write a star in the outer disk; assert stored y === input y + makeWarpOffset(...)(x, z).
  - `addDust reddens: r > g > b` — write several dust records; assert each record's channel ordering and that colours differ per record (per-particle draws).
  - `two contexts from equal params are stream-identical` — drain 100 draws from `rand` on both, equal sequences.
  - `asymRand construction consumes exactly four draws` — build a context, then compare `ctx.asymRand()` with a fresh `mulberry32(((asymSeed|0)||331)>>>0)` advanced by 4.
- [x] Run → fail. Implement (import `mulberry32` from `src/utils/random/mulberry32`, `gaussian` from `tools/utils/random/gaussian`, `makeWarpOffset`, `hiiPalette`, `splitStarBudget`, `classifyHubbleType`, writers).
- [x] Run → pass. `npm run typecheck`. Commit.

---

## Task 8 — star population builders I: bulge, bar geometry, bar, disk

One builder per file under `src/model/populations/`, each a straight port of its spike section, drawing from the context streams in spike order.

**Files**
- Create: `tools/galaxy-renderer/src/model/populations/bulge.ts`, `tools/galaxy-renderer/src/model/computeBarGeometry.ts`, `tools/galaxy-renderer/src/model/populations/bar.ts`, `tools/galaxy-renderer/src/model/populations/disk.ts`
- Test: `tests/tools/galaxy-renderer/model/populations/bulgeBarDisk.test.ts`

**Interfaces**

```ts
export function buildBulge(ctx: GalaxyBuildContext): void;                          // model.js:196-223
export function computeBarGeometry(ctx: GalaxyBuildContext): BarGeometry;           // model.js:228-230
export function buildBar(ctx: GalaxyBuildContext, bar: BarGeometry): void;          // model.js:231-248
export function buildDisk(ctx: GalaxyBuildContext, bar: BarGeometry): void;         // model.js:259-280
```

Ordering contract (enforce in the orchestrator, Task 10, and state it in each docblock): `computeBarGeometry` runs **between** bulge and bar because its `rand()` draw for the bar tilt (model.js:229) happens at that point in the spike's main stream — for every category, barred or not. `barLength` is `outerRadius · 0.42 · barStrength` for barred, else 0.

Behaviour to carry:
- bulge: elliptical vs disk-galaxy radial profiles + brightness falloffs (model.js:201-211), rejection resamples (`i--`/`continue`) keep the record count exact; triaxial squash + rotation (213-219); colour `tempColor(0.27 + 0.15·rand())`.
- bar: `barStars = floor(diskCount · 0.35)`; clamped gaussian along-bar (reject |t|>1.25); width narrows to the tips; end fade `exp(−t²·1.3)`.
- disk: barred draws only `diskCount − floor(diskCount·0.35)` background stars and fades in from the centre via the `t²` acceptance test (267-269 — a rejected star is *skipped*, not resampled: record count < diskCount is correct for barred); vertical puff `0.6 + bulgeRadius/(radius + bulgeRadius)`; colour temp rises with radius and youngStars; brightness `randomLuminosity() · 1.35 · diskFalloff(radius, 1.7)`.

**Steps**
- [x] Failing tests (build a small ctx per case, e.g. starCount 30000):
  - `bulge writes exactly budget.bulgeCount records` (spiral and elliptical cases).
  - `elliptical bulge extends beyond a disk-galaxy bulge` (max radius over records: E1 ctx vs Sb ctx with same outerRadius).
  - `bar geometry is zero-length for non-barred categories` and `bar length is 0.42·outerRadius·barStrength for SBb`.
  - `computeBarGeometry consumes exactly one main-stream draw for every category` — build two contexts from equal params (any category); call `computeBarGeometry` on the first, call `ctx.rand()` once manually on the second; the next draw from each stream is equal. This pins the spike's unconditional bar-angle draw (model.js:229).
  - `bar writes floor(diskCount·0.35) records for barred and none otherwise`.
  - `spiral disk writes exactly diskCount records; barred disk writes fewer` (acceptance test skips).
  - `disk stars sit in the plane` — |y| distribution bounded by a few × diskHeight.
- [x] Run → fail. Implement the four modules. Run → pass. Commit.

---

## Task 9 — star population builders II: spiral arms, irregular clumps, halo, globular clusters

**Files**
- Create: `tools/galaxy-renderer/src/model/populations/spiralArms.ts`, `.../populations/irregularClumps.ts`, `.../populations/halo.ts`, `.../populations/globularClusters.ts`
- Test: `tests/tools/galaxy-renderer/model/populations/armsHaloClusters.test.ts`

**Interfaces**

```ts
export function buildSpiralArms(ctx: GalaxyBuildContext, bar: BarGeometry): DustSeed[];  // model.js:286-401
export function buildIrregularClumps(ctx: GalaxyBuildContext): DustSeed[];               // model.js:406-434
export function buildHalo(ctx: GalaxyBuildContext): void;                                // model.js:439-447
export function buildGlobularClusters(ctx: GalaxyBuildContext): void;                    // model.js:453-471
```

Contract points:
- spiralArms creates its own `clumpRand`/`waveRand` mulberry32 streams from `clumpSeed || 911` / `waveSeed || 777` (model.js:295-296) and draws per-arm personality from `asymRand` (313-325 — continuing the stream after the context's four construction draws). Pitch `8 + 26·armWinding` degrees; `armStartRadius = max(barred ? barLength·0.9 : bulgeRadius·0.55, bulgeRadius·0.4)` (291 — the bar dependency is why it takes `BarGeometry`). HII knots (376-391) write bonus stars beyond the arm budget (halo glow + core + 1-3 newborns) using `ctx.hii`; clump gaps `continue` without resampling (393). Dust-lane seeds emitted with probability `0.55·armFade` (399).
- irregularClumps: 7 clump centres, LMC-style bar offset `outerRadius·0.18`, HII probability `0.02·hii`, dust seeds at probability 0.25 with `armFade: 1` (432 — the spike leaves the slot undefined and defaults it to 1 at consumption, model.js:527; we normalise at emission, same behaviour).
- halo: heavy-tailed radial profile, rejection keeps count exact, colour warm-old, brightness ×0.5 falloff.
- globulars: `floor(globularCount)` clusters × exactly 90 stars (`starsPerCluster`, model.js:119), per-cluster hue `0.26 + 0.20·rand()` with ±0.08 per-star spread, richness skew `0.3 + 0.9·rand()·rand()`, `globularSize`/`globularBright` multipliers.

**Steps**
- [x] Failing tests:
  - `spiral arms return dust seeds with armFade in [0,1]`.
  - `with clumping and HII off, arm records equal the arm budget exactly` — ctx with `armClump: 0, hii: 0`: every loop iteration writes exactly one star, so count === `budget.armStarCount` (deterministic, no loose bounds).
  - `HII knots write bonus records` — same params but `hii: 2`: count strictly greater than the `hii: 0` count.
  - `clump gaps skip records` — `armClump: 1, hii: 0`: count strictly less than `armStarCount`.
  - `no arm stars for lenticular` (armStarCount 0 → builder is a no-op — orchestrator gates it, but the builder must also tolerate a 0 budget).
  - `irregular clumps write exactly armStarCount records plus HII bonuses` (each loop iteration writes ≥1 star; assert `count ≥ armStarCount`).
  - `irregular dust seeds carry armFade 1`.
  - `halo writes exactly haloCount records` (elliptical ctx).
  - `globulars write clusters × 90 records` (globularCount 12 → 1080 on a zero-halo spiral ctx: count delta before/after).
- [x] Run → fail. Implement. Run → pass. Commit.

---

## Task 10 — dust builders + dust field

**Files**
- Create: `tools/galaxy-renderer/@types/model/DustField.d.ts`
- Create: `tools/galaxy-renderer/src/model/createDustField.ts`, `tools/galaxy-renderer/src/model/populations/armDust.ts`, `.../populations/barDust.ts`, `.../populations/lenticularDust.ts`, `.../populations/irregularDust.ts`
- Test: `tests/tools/galaxy-renderer/model/populations/dust.test.ts`

**Interfaces**

```ts
export type DustField = {
  readonly dustMod: (x: number, y: number, z: number) => { readonly keep: boolean; readonly op: number; readonly sz: number };
  readonly radialFalloff: (r: number) => number;   // exp(−r / (diskScaleLen · 1.5))
};
export function createDustField(ctx: GalaxyBuildContext): DustField;   // model.js:505-520
```

- The noise sampler seeds `makeValueNoise(((seed|0) ^ 0x9e3779b9) >>> 0)` (model.js:507) — construction is draw-free (safe to build lazily inside the dust gate), but `dustMod(...).keep` draws one `ctx.rand()` per call (515). Two-octave sample: base + `0.5·`(2.3× frequency), normalised `/1.5`; y-frequency halved (509-510).

```ts
export function buildArmDust(ctx: GalaxyBuildContext, field: DustField, seeds: readonly DustSeed[]): void;       // model.js:522-538, budget floor(30000·dust/grainScale²)
export function buildBarDust(ctx: GalaxyBuildContext, field: DustField, bar: BarGeometry): void;                 // model.js:540-551, budget floor(9000·dust/grainScale²)
export function buildLenticularDust(ctx: GalaxyBuildContext, field: DustField): void;                            // model.js:553-583, nuclear floor(12000·…) + ring floor(34000·dustRingStrength/grainScale²)
export function buildIrregularDust(ctx: GalaxyBuildContext, field: DustField, seeds: readonly DustSeed[]): void; // model.js:584-598, budget floor(16000·dust/grainScale²)
```

Behaviour to carry: arm dust nudges toward the arm's concave edge (−cos/−sin · 0.018·outerRadius) with dense-knot split at p=0.28; bar dust runs two lanes along the bar's leading edges with `exp(−t²·1.2)` end fade; lenticular = 34 nuclear cloud centres + the Sombrero "hat-brim" annulus gated on `dustRingStrength > 0` (radius `dustRing·outerRadius`, gaussian width `dustRingWidth·outerRadius`); irregular follows the clump seeds.

**Steps**
- [x] Failing tests:
  - `dust field construction draws nothing from the main stream` (probe draw equal with/without `createDustField`).
  - `dustMod keep-rate rises with the noise value` — statistical: with dustNoise 1, average keep over many calls at a high-f location > at a low-f location (find probe points by sampling the noise directly).
  - `arm dust respects its budget` — seeds ≫ budget with dust 1, grainScale 1 → dustWriter count ≤ 30000.
  - `bar dust only for barred` (barLength 0 → no-op).
  - `lenticular ring appears only when dustRingStrength > 0` and `ring particles cluster at the ring radius` (mean hypot(x,z) within ±2 gaussian widths of `dustRing·outerRadius`).
  - `irregular dust tracks its seeds` (each particle within a few spreads of some seed).
- [x] Run → fail. Implement. Run → pass. Commit.

---

## Task 11 — `generateGalaxy` orchestrator + worker entry

The pure entry point. Fixed builder order = the spike's source order; category gates identical to the spike's.

**Files**
- Create: `tools/galaxy-renderer/src/model/generateGalaxy.ts`, `tools/galaxy-renderer/src/worker/generateGalaxy.worker.ts`
- Test: `tests/tools/galaxy-renderer/model/generateGalaxy.test.ts`

**Interfaces**

```ts
export function generateGalaxy(params: GalaxyParams): GeneratedGalaxy;
```

Execution order (document as a numbered list in the module header — it IS the determinism contract):
1. `createGalaxyBuildContext(params)`
2. `buildBulge(ctx)`
3. `computeBarGeometry(ctx)` — unconditional (its one draw is part of the stream for every category)
4. `buildBar(ctx, bar)` — barred only
5. `buildDisk(ctx, bar)` — diskCount > 0
6. `buildSpiralArms(ctx, bar)` → seeds — `armStarCount > 0 && category !== 'irregular'`
7. `buildIrregularClumps(ctx)` → seeds — irregular only
8. `buildHalo(ctx)`
9. `buildGlobularClusters(ctx)`
10. dust gate `dust > 0 && category !== 'elliptical'` (model.js:501): `createDustField(ctx)`, then spiral/barred → `buildArmDust` + `buildBarDust`; lenticular → `buildLenticularDust`; irregular → `buildIrregularDust`
11. return `{ stars: ctx.stars.view(), starCount: ctx.stars.count(), dust: ctx.dust.toFloat32Array(), dustCount: ctx.dust.count() }`

Worker (`generateGalaxy.worker.ts`) — port of `galaxy-worker.js` verbatim shape: `self.onmessage` receives `{ id, params }`, calls `generateGalaxy`, posts `{ id, stars, starCount, dust, dustCount }` with `stars`/`dust` **sliced to tight standalone buffers and transferred** (the model returns a subarray view — transferring its backing buffer would ship unused headroom and detach the generator's scratch). Message types inline in the worker file (they're private to the worker↔engine pair; plan 02's engine mirrors them). No unit test — no Worker in the vitest node env; typecheck + plan-02 visual covers it.

**Steps**
- [x] Failing tests (`generateGalaxy.test.ts` — use starCount 30000-ish for speed):
  - `same params produce byte-identical output` — two calls; `expect(a.stars).toEqual(b.stars)` and same for dust (Float32Array deep-equality) plus equal counts.
  - `a different main seed produces different bytes`.
  - `stars length is exactly starCount·8` and `dust length is dustCount·8`.
  - `every float is finite` (scan both arrays).
  - `elliptical emits zero dust and zero arm stars` — 'E2' with `dust: 2, globularCount: 0` → dustCount 0; starCount === bulge+halo budget exactly.
  - `lenticular emits no arm stars` — 'S0' with `globularCount: 0` → starCount === bulge+disk+halo budget exactly (no HII bonuses possible without arms).
  - `rerolling waveSeed leaves the bulge segment untouched` — same params, waveSeed 1 vs 2: first `budget.bulgeCount·8` floats identical, full arrays different. (This is the stream-independence property the four seeds exist for.)
  - `starCount floors at 20000` — starCount 5000 still yields ≥ 20000 records.
  - `warp only bends the outer disk` — warpStrength 0 vs 0.3 on an elliptical: identical output (warp never fires — elliptical has no disk/arm/dust y-offsets… the bulge also passes through addStar's warp, and bulge points CAN sit beyond warpStart; instead assert on a spiral: the two outputs differ only in the y column — indices ≡1 mod 8 — for stars beyond warpStart, all other columns byte-identical).
- [x] Run → fail. Implement orchestrator + worker. Run → pass.
- [x] `npm run typecheck` (both configs) + full `npm test` → green. Commit.

---

## Task 12 — plan gate

- [x] Full `npm test` green; `npm run typecheck` green.
- [x] `npm run galaxy-renderer` serves the placeholder page on 5400 (ask the user to confirm, or curl the dev server root).
- [x] Review every new file header against the didactic-comment convention; prettier the touched files.
- [ ] Commit any stragglers. Plan 02 picks up from here with the engine.
