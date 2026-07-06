# GPU galaxy generation 01 — CPU seams, WGSL port & parity harness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention. Steps use checkbox (`- [x]`) syntax for tracking. **Load the `wesl-shaders` skill before any `.wesl` task.**

**Spec:** `docs/superpowers/specs/2026-07-03-gpu-galaxy-generation-design.md`
**Series:** plan 01 of 2. Requires the galaxy-renderer tool as shipped (plans 01–03 completed 2026-07-02). After this plan the GPU can generate a full galaxy into storage buffers and a dev-only parity harness demonstrates statistical agreement with the CPU model — but the engine still renders the CPU/worker path. Plan 02 cuts the engine over and deletes the CPU model.

**Goal:** Port the 11 population builders + shared model math (`makeWarpOffset`, `tempColor`, `hiiPalette`, value noise) into two WGSL compute passes (`generateStars.wesl`, `generateDust.wesl`) fed by one generation UBO, with a stateless hash RNG replacing the serial mulberry32 streams, and prove parity statistically against the CPU model.

**Architecture:**

- **Galaxy-level draws stay CPU, per-particle draws become the hash.** Auditing the CPU model shows the `asymRand` / `clumpRand` / `waveRand` streams are consumed _only_ at galaxy level (4 construction draws + per-arm personality — `createGalaxyBuildContext.ts:60-68`, `spiralArms.ts:99-119`); no per-star draw ever touches them. So `packGenerationUniforms` runs those three streams as real mulberry32 CPU-side and packs the results into the UBO — the asym/clump/wave seed dice reproduce **today's exact values**, not merely same-family scoping. Only per-particle draws (all from the main `rand`/`randNormal` stream) become `rand(seed, populationId, index, drawSlot)`.
  - DEVIATION (mechanism, not contract): the spec words this as all four seeds being "hash inputs". Three of them never reach the hash — they feed CPU-side mulberry32 into the UBO, which satisfies the underlying requirement ("per-family seed dice behave exactly as before") _more_ strongly. The hash's `seed` input is `params.seed` only.
  - DEVIATION: main-seed _galaxy-level_ draws (bar tilt angle, 7 irregular clump centres, 34 lenticular cloud centres) are re-derived from a fresh `mulberry32(seed)` in the packer, in a fixed documented order — their values differ from the CPU model's (where they sat mid-stream between star draws). Byte-compat is waived; determinism holds.
- **Thread → output slot.** Each population owns a contiguous slot range carved CPU-side (`carveStarLayout` / `carveDustLayout`). A slot maps to `(iteration, sub)` via a per-population `stride`: spiral arms stride **5** (regular star or HII halo / HII core / up to 3 newborns), irregular clumps stride **2** (star-or-halo / core), everything else stride 1. Sibling sub-threads recompute the iteration's shared hash draws identically and each writes only its own slot — that recompute trick is also how the dust passes reconstruct the arm/clump dust _seeds_ without any cross-pass buffer.
  - DEVIATION (from the spec's "few percent" dead-point _estimate_, not from its requirements): the arm stride means a default Sc galaxy carries ~45% dead slots (400k stars → ~740k slots, ~24 MB, ~4.4M vertex invocations of an immediately-degenerate quad). No compaction / atomics / indirect draws (spec-rejected); capacity is still exactly the dispatch size. The cost is memory + trivially-culled vertices, acceptable for this tool.
  - DEVIATION: `armDust`/`irrDust`'s CPU hard cap (`dust.count() < budget`) is inherently serial; it becomes a cap on the _candidate index_ (`iterations = min(armStarCount, budget)`). In the common regime the cap doesn't bind (candidates < budget) and behaviour is identical; when it binds, the GPU writes `budget × acceptance-rate` particles instead of exactly `budget`.
- **Rejection sampling** (bulge / bar / halo radial rejections): up to **8** retry iterations, retry `k` re-hashes the whole iteration at `drawSlot + 64·k`, then a dead point. Dead point = **all 8 record floats zero** (size 0 → degenerate billboard, no fragments). `sampleDiskRadius`'s _internal_ 6-attempt loop is part of a single iteration's slot budget (12 slots), mirroring its CPU clamp-not-reject semantics.
- **One shared WESL lib** (`shaders/lib/generate.wesl`) holds the UBO struct, hash RNG, and ported math; two thin entry files dispatch over the range table. Bind groups are built at the compute pipelines only.

**Tech Stack:** TypeScript, WebGPU compute, WESL (`?static`), Vitest for every CPU-side pure function, a browser dev harness (not vitest — no WebGPU in node) for GPU/CPU comparison.

**Reference source:** the CPU model in this repo — cited as `<file>.ts:NN` under `tools/galaxy-renderer/src/model/`. Implementers MUST read the cited lines; the port is faithful, not a reinterpretation (the spec explicitly rejected the unified-emission-kernel redesign).

## Global Constraints

- Worktree `.claude/worktrees/better-galaxy-renderer`; commands from its root; `npm test` + `npm run typecheck` green before every commit; stage specific paths only (never `git add -A`); prettier only touched files.
- **Byte-compat with the CPU model is waived** (user decision). Determinism contract: **same params → same buffer contents**, independent of dispatch size, workgroup layout, and machine — via the stateless hash `rand(seed, populationId, starIndex, drawSlot)`.
- The four seed params keep their family roles: `seed` = main placement, `asymSeed` = asymmetry, `clumpSeed` = clump placement, `waveSeed` = warp/wave.
- Rejection sampling: max 8 retry iterations then dead point (size 0); capacity IS the dispatch size; stride-8 star/dust buffer record layouts unchanged; buffers gain `STORAGE` usage.
- `GalaxyEngineHandle` surface unchanged for consumers; `setParams` resolves after submit (plan 02).
- **Faithful builder-by-builder port** — no reinterpretation of the model math; every ported constant cites its CPU source line (same cite discipline as plan 02 of the tool series). Deliberate deviations are the five flagged `DEVIATION:` above and no others may be introduced.
- WESL rules (wesl-shaders skill): NO backticks inside `.wesl` comments (single quotes for identifier refs); all `import` lines at the very top, one identifier per line; prefix is the literal `package::`; shaders are consumed via `?static` build-time imports; the tool's `wesl.toml` root (`src/engine/shaders`) is what makes `package::lib::…` resolve. Shader modules go through `createShaderModuleWithDevLog`.
- Standing WebGPU rules: `layout: 'auto'` bind groups are built per-pipeline and NEVER cross pipelines; every GPU resource gets a `label:`.
- TS house rules: `type` never `interface`; one exported type per file in `@types/` (one symbol per file in utils-style helper files); `Vec3`/`Vec2` aliases never raw tuples; typed `vi.fn<() => void>()` in fixtures; didactic comments (why + the alternative); no history notes in comments; reducer args named `settings`/`action` if any slice is touched (none should be in this plan).
- Search before writing helpers: preflight-grep `src/utils` and `tools/galaxy-renderer` for an existing fn before creating one.
- **CPU model + worker + parity harness are deleted in plan 02's FINAL task only**, after the user visual gate. Every task in this plan leaves the CPU render path fully working.

## Shared contract: population IDs and slot conventions

Pinned here once; every builder task references it. The same values appear as a TS const and as WGSL constants — the parity harness catches a mismatch as total drift.

| id  | population         | pass  | stride | iteration index means                                    |
| --- | ------------------ | ----- | ------ | -------------------------------------------------------- |
| 0   | bulge              | stars | 1      | star                                                     |
| 1   | bar                | stars | 1      | star                                                     |
| 2   | disk               | stars | 1      | star                                                     |
| 3   | spiralArms         | stars | 5      | arm-loop iteration                                       |
| 4   | irregularClumps    | stars | 2      | clump-loop iteration                                     |
| 5   | halo               | stars | 1      | star                                                     |
| 6   | globularCluster    | stars | —      | cluster (cluster-level draws only; owns no output slots) |
| 7   | globularStar       | stars | 1      | global member index `c·90 + j`                           |
| 8   | armDust            | dust  | 1      | candidate = arm-loop iteration                           |
| 9   | barDust            | dust  | 1      | particle                                                 |
| 10  | lenticularNucDust  | dust  | 1      | particle                                                 |
| 11  | lenticularRingDust | dust  | 1      | particle                                                 |
| 12  | irregularDust      | dust  | 1      | candidate = clump-loop iteration                         |

Slot conventions (fixed, builders below cite them):

- `randNormal(slot)` consumes `slot, slot+1` (Box-Muller u1, u2; u1 clamped away from 0 before `log`).
- `randomLuminosity(slot)` consumes `slot..slot+2` (u, flare gate, flare amount — `createGalaxyBuildContext.ts:89-92`; the third slot is assigned even when the gate fails).
- `sampleDiskRadius(baseSlot)` reserves `baseSlot..baseSlot+11` (6 attempts × 2 draws, then clamp — `createGalaxyBuildContext.ts:79-86`; clamp, NOT dead).
- Dust reddening (`addDust`'s 4 draws — `createGalaxyBuildContext.ts:126-133`) lives at slots **56-59** (darkness, dr, dg, db) in every dust population.
- Rejection retries: retry `k ≤ 7` re-hashes at `slot + 64·k`; after 8 failures write the dead point. Base slots therefore stay `< 64` in every builder.
- Slots are assigned unconditionally (a branch not taken simply never evaluates its slots) — numbering never shifts between categories or branches.

---

## Task 1 — layout carving: `carveStarLayout`, `carveDustLayout`, population IDs

**Files**

- Create: `tools/galaxy-renderer/src/model/populationIds.ts`, `.../model/grainScale.ts`, `.../model/carveStarLayout.ts`, `.../model/carveDustLayout.ts`
- Create: `tools/galaxy-renderer/@types/model/PopulationRange.d.ts`, `.../@types/model/GenerationLayout.d.ts`
- Tests: `tests/tools/galaxy-renderer/model/carveStarLayout.test.ts`, `.../model/carveDustLayout.test.ts`

**Interfaces**

```ts
export type PopulationRange = {
  readonly popId: number;      // POPULATION_IDS value
  readonly start: number;      // first output slot in the target buffer
  readonly iterations: number; // loop-iteration count (CPU loop bound)
  readonly stride: number;     // output slots per iteration; slots = iterations * stride
};
export type GenerationLayout = {
  readonly ranges: readonly PopulationRange[]; // contiguous, ascending start; zero-iteration entries omitted
  readonly capacity: number;                   // total slots = dispatch size = instance count
};

export const POPULATION_IDS: { … };  // the 13-row table above, as a plain frozen const
export function grainScale(totalStars: number): number; // cbrt(400000 / totalStars) — createGalaxyBuildContext.ts:49
export function carveStarLayout(category: GalaxyCategory, params: GalaxyParams, budget: StarBudget): GenerationLayout;
export function carveDustLayout(category: GalaxyCategory, params: GalaxyParams, budget: StarBudget): GenerationLayout;
```

**Behaviour** — star ranges in fixed order bulge, bar, disk, arms, irregularClumps, halo, globularStar:

- bulge: `budget.bulgeCount` (`bulge.ts:39`); bar: barred ? `floor(diskCount·0.35)` : 0 (`bar.ts:26`); disk: `diskCount − barStars` when barred else `diskCount` (`disk.ts:42-45`); arms: spiral/barred with `armStarCount > 0` → `armStarCount` iterations × stride 5 (`spiralArms.ts:41`, HII writes at `spiralArms.ts:194-219`); irregularClumps: irregular → `armStarCount` × stride 2 (`irregularClumps.ts:60-90`); halo: `haloCount`; globularStar: `floor(globularCount||0)·90` (`globularClusters.ts:18-27`).

Dust ranges in fixed order armDust, barDust, lenticularNucDust, lenticularRingDust, irregularDust, all gated on `(dust ?? 1) > 0 && category !== 'elliptical'` (`generateGalaxy.ts:68-79`), with `g = grainScale(totalStars)`:

- armDust (spiral/barred): `min(armStarCount, floor(30000·dust / g²))` (`armDust.ts:26` — the min is the flagged candidate-cap DEVIATION); barDust (barred only, i.e. barLength > 0): `floor(9000·dust / g²)` (`barDust.ts:20`); lenticularNucDust (lenticular): `floor(12000·dust / g²)` (`lenticularDust.ts:32`); lenticularRingDust (lenticular, `dustRingStrength > 0`): `floor(34000·ringAmt / g²)` (`lenticularDust.ts:55`); irregularDust (irregular): `min(armStarCount, floor(16000·dust / g²))` (`irregularDust.ts:21`).

**Steps**

- [x] Failing tests — carveStarLayout: `Sc: bulge, disk, arms ranges are contiguous with arms stride 5` (assert each start = previous start + iterations·stride); `SBb: bar takes floor(diskCount*0.35) iterations and disk shrinks by the same amount`; `Irr: clumps range has stride 2 and there is no disk or arms range`; `E3: bulge and halo only`; `globularCount 12 appends a 1080-slot globularStar range`; `capacity equals the sum of iterations*stride`. carveDustLayout: `Sc default params: armDust iterations = min(armStarCount, floor(30000*dust/grainScale^2))`; `elliptical or dust 0 gives an empty layout with capacity 0`; `S0 with dustRingStrength 0 has only the nuclear range`; `S0 with dustRingStrength 0.5 adds the ring range with floor(34000*0.5/g^2) iterations`; `SBb has armDust then barDust`; `Irr has only irregularDust capped at min(armStarCount, budget)`.
- [x] Run → fail. Implement (table-driven like `splitStarBudget`, not a predicate chain). Run → pass. Commit.

---

## Task 2 — `packGenerationUniforms` + `GENERATION_UBO` layout + `computeBarGeometry` reshape

**Files**

- Create: `tools/galaxy-renderer/src/engine/generationUboLayout.ts`, `.../engine/packGenerationUniforms.ts`
- Modify: `tools/galaxy-renderer/src/model/computeBarGeometry.ts` (+ its call site `generateGalaxy.ts:60` and test)
- Test: `tests/tools/galaxy-renderer/engine/packGenerationUniforms.test.ts`

**Interfaces**

```ts
// computeBarGeometry no longer reads a GalaxyBuildContext — the packer and the
// (still-alive) CPU orchestrator both call it with their own rand stream:
export function computeBarGeometry(
  rand: () => number,
  category: GalaxyCategory,
  outerRadius: number,
  asymmetry: number,
  barStrength: number | undefined,
): BarGeometry; // formulas unchanged — computeBarGeometry.ts:19-21

// spec-pinned signature; null extra = the main galaxy (identity transform):
export function packGenerationUniforms(
  params: GalaxyParams,
  budget: StarBudget,
  extra: ExtraGalaxySpec | null,
): ArrayBuffer;

export const GENERATION_UBO: {
  readonly byteLength: number; // 16-aligned total
  readonly f32: Record<string, number>; // float index per scalar field name
  readonly u32: Record<string, number>; // u32 index per integer field name
  readonly arrays: Record<string, { readonly offsetVec4: number; readonly countVec4: number }>;
};
```

**UBO field inventory** — `GENERATION_UBO` is the single offset authority (the packer writes through it, the test reads through it, the WGSL struct in Task 3 mirrors it field-for-field in declaration order; every field is vec4-aligned, scalars packed 4-per-vec4). Fixed array sizes: `MAX_ARMS = 8` (PARAM_SPEC armCount max), `NUM_IRR_CLUMPS = 7`, `LENT_CLOUDS = 34`, `MAX_STAR_RANGES = 7`, `MAX_DUST_RANGES = 5`.

| group        | fields (f32 unless noted)                                                                                                                                                                                                                           | source                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| scale        | outerRadius, diskScaleLen, bulgeRadius, diskHeight, grainScale, starSize                                                                                                                                                                            | `createGalaxyBuildContext.ts:45-50`                                           |
| asymmetry    | flattening, asymmetry, lopsidedAmp, lopsidedAngle, bulgeAxisZ, cosBulge, sinBulge, bulgeConcentration                                                                                                                                               | `:52-72` (asym stream)                                                        |
| bar          | barLength, cosBar, sinBar                                                                                                                                                                                                                           | `computeBarGeometry` via the packer's main stream                             |
| warp         | warpStrength, warpTwist, warpStartRadius (= outerRadius·(warpStart ?? 0.3))                                                                                                                                                                         | `makeWarpOffset.ts:31-33`                                                     |
| dust         | dustAmount, dustNoiseAmt, noiseFreq (= 2.4·dustNoiseScale/outerRadius), clumpAmount, ringRadius, ringWidth, ringStrength                                                                                                                            | `createDustField.ts:18-22`, `lenticularDust.ts:50-55`                         |
| arms         | subArmAmount, waveAmount, armStartRadius, armWidthFactor, armFullRadius, armInnerRampW, weightSum                                                                                                                                                   | `spiralArms.ts:60-98`                                                         |
| misc         | globularSize, globularBright, youngFraction, hiiIntensity, irrBarOffset (= outerRadius·0.18), extraScale                                                                                                                                            | builders' point-of-use defaults                                               |
| palettes     | hiiCore vec4 (rgb+0), hiiHalo vec4                                                                                                                                                                                                                  | `hiiPalette(metallicity ?? 0.5)`                                              |
| extra        | extraPos vec4 (xyz+0), extraRot vec4 (cosRotY, sinRotY, cosTiltX, sinTiltX)                                                                                                                                                                         | `ExtraGalaxySpec`; identity when null                                         |
| u32          | seed (= (seed\|0)\|\|1), noiseSeed (= seed ^ 0x9e3779b9), category (elliptical 0, lenticular 1, spiral 2, barred 3, irregular 4), numArms (= clamp(max(1, round(armCount\|\|2)), 1, 8)), starCapacity, dustCapacity, starRangeCount, dustRangeCount | `createGalaxyBuildContext.ts:36`, `createDustField.ts:21`, `spiralArms.ts:60` |
| armTable     | array of MAX_ARMS × 4 vec4: [phase, pitch, weight, fadeRadius], [meanderAmp, meanderFreq, meanderPhase, 0], [clumpF1, clumpP1, clumpF2, clumpP2], [waveF1, waveP1, waveF2, waveP2]                                                                  | `spiralArms.ts:99-119`                                                        |
| clumpCenters | array of 7 vec4 (xyz+0)                                                                                                                                                                                                                             | `irregularClumps.ts:47-55`                                                    |
| cloudCenters | array of 34 vec4 (x, y, rr, 0)                                                                                                                                                                                                                      | `lenticularDust.ts:26-30`                                                     |
| starRanges   | array of 7 vec4u (start, iterations, stride, popId)                                                                                                                                                                                                 | `carveStarLayout`                                                             |
| dustRanges   | array of 5 vec4u (same lanes)                                                                                                                                                                                                                       | `carveDustLayout`                                                             |

If porting reveals a missing field, **append** it (and update the byte test) — never renumber existing fields mid-branch.

**Packer draw streams** (this ordering is itself a determinism contract, byte-tested):

- `asymStream = mulberry32(((asymSeed ?? 0)|0 || 331) >>> 0)`: lopsidedAmp, lopsidedAngle, bulgeAxisZ, bulgeAngle (`createGalaxyBuildContext.ts:60-68`), then — only when the CPU model would run arm setup (`armStarCount > 0 && category !== 'irregular'`, `spiralArms.ts:41`) — per arm `a < numArms`: phase, pitch, weight, meanderAmp, meanderFreq, meanderPhase, fadeRadius (`spiralArms.ts:100-118`; zero-fill the table otherwise).
- `clumpStream = mulberry32(((clumpSeed ?? 0)|0 || 911) >>> 0)`: per arm F1, P1, F2, P2 (`spiralArms.ts:107-110`); `waveStream` likewise with `777` (`:111-114`).
- `mainStream = mulberry32(((seed ?? 0)|0 || 1))`: bar angle (via `computeBarGeometry`), then 7 irregular clump centres (per centre: a, dist, gaussian y — `irregularClumps.ts:47-55`) when irregular, then 34 lenticular cloud centres (per cloud: a, rand, rand for rr — `lenticularDust.ts:26-30`) when lenticular. Draw these unconditionally-per-category in this order; unused groups zero-fill.

**Steps**

- [x] Reshape `computeBarGeometry` + update `generateGalaxy.ts` call site and its existing test (CPU model must stay green — it is the parity reference and the live render path until plan 02).
- [x] Failing tests (mirror `packCameraUniforms.test.ts` style, reading offsets from `GENERATION_UBO`): `byteLength is 16-aligned and matches the layout const`; `derived scale constants land at their offsets` (radius 2 → outerRadius 20, diskScaleLen 6.25, starSize per formula); `same params produce identical bytes`; `asymSeed reroll changes only asymmetry-family fields` (diff two packs; the changed float indices must be a subset of the asymmetry group + armTable asym lanes); `clumpSeed reroll changes only the armTable clump lanes`; `waveSeed reroll changes only the armTable wave lanes`; `null extra packs the identity transform` (pos 0,0,0 / extraScale 1 / rot lanes 1,0,1,0); `an ExtraGalaxySpec packs pos, scale and the cos/sin of rotY and tiltX`; `star and dust range lanes mirror the carve fns`; `hii palette lanes equal hiiPalette(metallicity)`; `category and numArms u32s are correct for SBb` (3, clamped arm count).
- [x] Run → fail. Implement. Run → pass. Full `npm test` + typecheck. Commit.

---

## Task 3 — WESL lib: hash RNG + shared model math (`lib/generate.wesl`)

**Load the `wesl-shaders` skill first.**

**Files**

- Create: `tools/galaxy-renderer/src/engine/shaders/lib/generate.wesl`

**Interfaces** — WGSL contracts (no test of its own; the link + compile gate is Task 5, correctness gate is the parity harness):

```wgsl
struct GenUniforms { … }  // mirrors GENERATION_UBO field-for-field, declaration order = layout order

// PCG-family 4D hash (Jarzynski & Olano, 'Hash Functions for GPU Rendering'):
// v = v * 1664525u + 1013904223u; cross-feed adds; v ^= v >> 16; cross-feed adds again.
fn pcg4d(v: vec4<u32>) -> vec4<u32>
fn genRand(seed: u32, pop: u32, idx: u32, slot: u32) -> f32          // pcg4d(...).x * (1.0 / 4294967296.0)
fn genNormal(seed: u32, pop: u32, idx: u32, slot: u32) -> f32        // Box-Muller from slots {slot, slot+1}; clamp u1 >= 1e-38
fn randomLuminosity(seed: u32, pop: u32, idx: u32, slot: u32) -> f32 // 3 slots — createGalaxyBuildContext.ts:89-92
fn sampleDiskRadius(seed: u32, pop: u32, idx: u32, slot: u32) -> f32 // 12 slots, 6 attempts then clamp — :79-86

fn valueNoise3(p: vec3<f32>, seed: u32) -> f32   // port makeValueNoise.ts:49-81 verbatim (u32 lattice hash: 374761393, 668265263, 2147483647, 974711, mix 1274126177, shifts 13/16; smoothstep-lerped trilinear)
fn dustNoiseAt(p: vec3<f32>) -> f32               // two-octave sample — createDustField.ts:27-30 (y at half frequency, 2.3x detail, /1.5)
fn tempColorRamp(t: f32) -> vec3<f32>             // 6 stops — tempColor.ts:18-25, clamp t to [0, 0.999]
fn hiiCorePerturbed(cv: f32) -> vec3<f32>         // core with g/b += cv, min 1 — spiralArms.ts:196-205
fn warpOffset(x: f32, z: f32) -> f32              // makeWarpOffset.ts:35-42
fn applyLopsided(radius: f32, angle: f32) -> f32  // createGalaxyBuildContext.ts:62-63
fn diskFalloff(radius: f32, softness: f32) -> f32 // :75-76
fn applyExtraTransform(p: vec3<f32>) -> vec3<f32> // scale -> rotY -> tiltX -> translate — bakeExtraTransform.ts order
fn armStarSample(i: u32) -> ArmStarSample         // Task 7 fills this in; declared here as the star/dust shared seam

struct StarRec { pos: vec3<f32>, color: vec3<f32>, size: f32, brightness: f32, alive: bool }
struct DustRec { pos: vec3<f32>, size: f32, color: vec3<f32>, opacity: f32, alive: bool }
```

Notes: the `@group(0)` bindings ('gen' uniform + the output storage array) are declared once in this lib and imported by both entry files, so lib fns read the module-scope `gen` directly instead of threading pointers — WGSL bindings are module-scope by design, and the two passes bind different buffers to the same declarations at dispatch. Record field ORDER on write is the existing stride-8 vertex layout — stars x,y,z,r,g,b,size,brightness (`starWriter.ts:34-42`), dust x,y,z,size,r,g,b,opacity (`dustWriter.ts:23-25`). `addStar`'s warp (`y += warpOffset(x, z)`) and `addDust`'s warp+reddening (`createGalaxyBuildContext.ts:110-133`) are applied by shared write helpers in the entry shaders, then `applyExtraTransform` + `size *= extraScale`, so builders stay warp/transform-free exactly like their CPU counterparts.

**Steps**

- [x] Load `wesl-shaders`. Write the lib (didactic header: why stateless hashing makes sibling-thread recompute free, and why galaxy-level values arrive via the UBO instead). No backticks in comments; nothing imports this yet — the gate is Task 5's link.
- [x] `npm run typecheck` (guards stray TS damage). Commit.

---

## Task 4 — compute entry points: `generateStars.wesl`, `generateDust.wesl` (all-dead skeleton)

**Load the `wesl-shaders` skill first.**

**Files**

- Create: `tools/galaxy-renderer/src/engine/shaders/generateStars.wesl`, `.../shaders/generateDust.wesl`

**Interfaces**

```wgsl
// bindings ('gen' uniform at @group(0) @binding(0), stride-8 output storage
// array<f32> at @binding(1)) are declared in lib/generate.wesl and imported here

@compute @workgroup_size(256)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>)
```

Body contract (both files): `slot = gid.x`; return if `slot >= gen.starCapacity` (resp. `dustCapacity`); linear-scan the range table (`starRangeCount`/`dustRangeCount` live entries) to find the owning range; `iteration = (slot − start) / stride`, `sub = (slot − start) % stride`; `switch` on the range's popId (table dispatch — one case per population, mirroring `POPULATION_IDS`); every case returns a dead record for now; the shared write helper zeroes all 8 floats for dead records. Workgroup size 256 keeps the 1D dispatch under the 65 535-workgroup limit for the worst-case capacity (~3.1 M slots at starCount 1 M).

**Steps**

- [x] Load `wesl-shaders`. Write both entries (imports one-identifier-per-line, `package::lib::generate::…`).
- [x] `npm run typecheck`. Commit. (First link/compile proof lands with Task 5.)

---

## Task 5 — generation pipelines + dev parity harness

**Files**

- Create: `tools/galaxy-renderer/src/engine/createGenerationPipelines.ts`, `.../engine/encodeGeneration.ts`
- Create: `tools/galaxy-renderer/@types/engine/GenerationPipelines.d.ts`, `.../@types/dev/ParityReport.d.ts`
- Create: `tools/galaxy-renderer/src/dev/gpuParityHarness.ts`
- Modify: `tools/galaxy-renderer/src/main.tsx` (dev-only `window.__galaxyParity` hook, gated on `import.meta.env.DEV`)

**Interfaces**

```ts
export type GenerationPipelines = {
  readonly stars: GPUComputePipeline;
  readonly dust: GPUComputePipeline;
};
export function createGenerationPipelines(device: GPUDevice): GenerationPipelines; // ?static imports of both entries, createShaderModuleWithDevLog

export function encodeGeneration(args: {
  readonly device: GPUDevice;
  readonly encoder: GPUCommandEncoder;
  readonly pipelines: GenerationPipelines;
  readonly ubo: GPUBuffer;
  readonly starBuf: GPUBuffer;
  readonly starLayout: GenerationLayout;
  readonly dustBuf: GPUBuffer | null;
  readonly dustLayout: GenerationLayout;
}): void;
// Builds bind groups HERE, at the compute pipelines ('auto' layouts never cross
// pipelines); dispatches ceil(capacity / 256) workgroups per pass; skips the dust
// pass when dustLayout.capacity === 0.

export async function runGpuParity(params: GalaxyParams): Promise<ParityReport>;
```

Harness behaviour: requests its own adapter/device (fully decoupled from the engine — `GalaxyEngineHandle` stays untouched); packs the UBO, allocates `STORAGE | COPY_SRC` buffers at layout capacity, dispatches, reads back; runs `generateGalaxy(params)` on the CPU; prints a `console.table` and returns `ParityReport` with, for stars and dust separately: total live count GPU vs CPU (+% delta), per-population GPU live counts vs the layout's iteration counts, a 16-bin radial histogram of `hypot(x, z) / outerRadius` over live records (GPU vs CPU, per-bin relative delta), mean r/g/b, and summed brightness (stars) / opacity (dust). Advisory PASS/CHECK flags at: totals ±2% (stars) / ±5% (dust), histogram bins holding > 2% of mass ±5%, colour means ±2%, brightness sum ±3%. These thresholds are a judgement aid printed by the harness, not a vitest gate — WGSL is f32 against the CPU's f64, and the RNGs are different by design.

**Steps**

- [x] Implement the four modules + the dev hook. This is the first task that links the WESL — fix any linker/compile fallout here (compile errors surface via `createShaderModuleWithDevLog`).
- [x] `npm run typecheck` + full `npm test` green.
- [ ] **Checkpoint (user or dev console):** with the dev server running, `await window.__galaxyParity()` on the default Sc params reports GPU live counts of 0 across all populations and intact CPU counts — plumbing proven end-to-end, rendering visually unchanged.
- [x] Commit.

---

## Task 6 — port batch A: bulge, bar, disk

**Load the `wesl-shaders` skill first.** Extend `lib/generate.wesl` with `buildBulge`, `buildBar`, `buildDisk` (each `(iteration: u32, gen) -> StarRec`) and wire their switch cases in `generateStars.wesl`.

**Draw-slot enumeration** (populationId in parentheses; every formula ports verbatim from the cited file — read the whole builder before writing WGSL):

bulge (0) — `bulge.ts:39-80`; radial rejection → retry at `+64·k`, dead after 8:

| slot | draw                                                   |
| ---- | ------------------------------------------------------ |
| 0    | radial u (elliptical and disk-bulge branches share it) |
| 1    | cosLat                                                 |
| 2    | lon                                                    |
| 3    | tempColor t jitter                                     |
| 4    | size jitter                                            |
| 5-7  | randomLuminosity                                       |

bar (1) — `bar.ts:28-52`; `|alongBar| > 1.25` rejection → retry, dead after 8; population exists only when barred (range absent otherwise):

| slot | draw               |
| ---- | ------------------ |
| 0-1  | alongBar genNormal |
| 2    | barHalfWidth       |
| 3-4  | localZ genNormal   |
| 5-6  | y genNormal        |
| 7    | tempColor t        |
| 8    | size               |
| 9-11 | randomLuminosity   |

disk (2) — `disk.ts:47-73`; the barred centre-fade is a SKIP (dead point, no retry) — conflating it with a resample would erase the centre fade (`disk.ts` module header):

| slot  | draw                                                  |
| ----- | ----------------------------------------------------- |
| 0-11  | sampleDiskRadius                                      |
| 12    | barred centre-fade gate (assigned for every category) |
| 13    | angle                                                 |
| 14-15 | y genNormal                                           |
| 16    | tempColor t jitter                                    |
| 17    | size                                                  |
| 18-20 | randomLuminosity                                      |

**Steps**

- [x] Port the three builders (cite lines per constant, e.g. the elliptical falloff pair `bulge.ts:45-50` vs disk-bulge `:52-57`).
- [x] `npm run typecheck` + full `npm test` green (CPU suite untouched).
- [ ] **Checkpoint:** `window.__galaxyParity` on an E3 preset (pure bulge+halo: bulge row live ≈ bulgeCount, halo row still 0 — expected until Task 7) and an SBb (bulge/bar/disk rows within ±2%, disk reflecting the centre-fade undercount exactly like the CPU count does). Radial histogram sanity over the live populations.
- [x] Commit.

---

## Task 7 — port batch B: spiral arms, irregular clumps, halo, globular clusters

**Load the `wesl-shaders` skill first.** Extend the lib with `armStarSample` (the star/dust shared seam), `buildArmSlot`, `buildIrregularSlot`, `buildHalo`, `buildGlobularStar`; wire the switch cases.

spiralArms (3) — `spiralArms.ts:123-236`; stride 5, sub-slot mapping: sub0 = regular star (dead on clump-gap skip) or HII halo star; sub1 = HII core or dead; sub2-4 = newborn `b = sub − 2` or dead (`b >= newbornCount` → dead). All five siblings recompute slots 0-29 identically; per-arm personality (phase/pitch/weight/meander/clump/wave/fadeRadius) comes from the UBO armTable, weighted arm pick scans armTable weights against `weightSum`:

| slot            | draw                                                                                |
| --------------- | ----------------------------------------------------------------------------------- |
| 0-11            | sampleDiskRadius (radius = armStartRadius·0.5 + sample — `:124`)                    |
| 12              | weighted arm pick                                                                   |
| 13              | sub-arm gate                                                                        |
| 14              | sub-arm side                                                                        |
| 15              | sub-arm phase jitter                                                                |
| 16              | sub-arm pitch jitter                                                                |
| 17-18           | spur feather genNormal (sub-arm only — `:161`)                                      |
| 19-20           | angle feather genNormal (`:162`)                                                    |
| 21-22           | perpOffset genNormal                                                                |
| 23-24           | y genNormal                                                                         |
| 25              | HII gate (`rand < 0.011·hii·(subArm ? 0.4 : 1)` — `:186`)                           |
| 26              | HII giant                                                                           |
| 27              | HII coreBright                                                                      |
| 28              | HII cv                                                                              |
| 29              | newborn count (`1 + floor(rand·3)` — `:206`)                                        |
| 30              | clump-gap gate (non-HII — `:221`)                                                   |
| 31              | tempColor t jitter (non-HII)                                                        |
| 32              | size (non-HII)                                                                      |
| 33-35           | randomLuminosity (non-HII)                                                          |
| 36              | dust-seed gate (`rand < 0.55·armFade` — `:235`; consumed by Task 8)                 |
| 40+8b … 40+8b+7 | newborn b ∈ 0..2: t, x genNormal, y genNormal, z genNormal, brightness (`:207-218`) |

`armStarSample(i, gen)` returns pre-warp x/y/z, radius, angle, armFade, isHii, gapSkipped, and seedAccepted (= `(isHii || !gapSkipped) && rand(slot 36) < 0.55·armFade` — matching the CPU where a gap `continue` also skips the seed push).

irregularClumps (4) — `irregularClumps.ts:60-90`; stride 2 (sub0 = regular star or HII halo, sub1 = HII core or dead); clump centres + irrBarOffset from the UBO; also expose `irregularSample(i, gen)` (position + seed gate, slot 15) for Task 8:

| slot  | draw                           |
| ----- | ------------------------------ |
| 0-1   | x genNormal                    |
| 2-3   | y genNormal                    |
| 4-5   | z genNormal                    |
| 6     | HII gate (`rand < 0.02·hii`)   |
| 7     | HII giant                      |
| 8     | HII coreBright                 |
| 9     | HII cv                         |
| 10    | tempColor t (non-HII)          |
| 11    | size (non-HII)                 |
| 12-14 | randomLuminosity (non-HII)     |
| 15    | dust-seed gate (`rand < 0.25`) |

halo (5) — `halo.ts:30-54`; radial rejection → retry, dead after 8; size is the fixed `starSize·0.7` (no draw):

| slot | draw             |
| ---- | ---------------- |
| 0    | radial u         |
| 1    | cosLat           |
| 2    | lon              |
| 3    | tempColor t      |
| 4-6  | randomLuminosity |

globulars — two ID spaces so cluster-level and member-level draws can't collide. Cluster-level (6), `idx = cluster c` (`globularClusters.ts:27-41`): 0 dist, 1 cosLat, 2 lon, 3-4 richness u·u, 5 radius pow, 6 hue. Member-level (7), `idx = c·90 + j` (`:43-59`): 0 d, 1 cl, 2 ln, 3 hue jitter, 4 size, 5 brightness. Output slot = range start + `c·90 + j`; each member thread recomputes its cluster's level-6 draws.

**Steps**

- [x] Port the four builders + the two sample fns.
- [x] `npm run typecheck` + full `npm test` green.
- [ ] **Checkpoint:** `window.__galaxyParity` across Sc, SBb, E3, S0, Irr, and one preset with `globularCount > 0` — all star populations live-count PASS; radial histograms and colour means PASS. HII bonus stars show up as arms live count _exceeding_ iterations (same as CPU); note the observed dead fraction in the task summary.
- [x] Commit.

---

## Task 8 — port the four dust builders + dust write path

**Load the `wesl-shaders` skill first.** Extend the lib with `dustMod` (keep/op/sz — `createDustField.ts:32-43`, keep-gate draw slot per builder below, noise via `dustNoiseAt` with `noiseSeed`), `radialFalloff` (`:45`), and the four builders; wire `generateDust.wesl`'s switch. The dust write helper applies warp, the 4 reddening draws at slots 56-59 (`createGalaxyBuildContext.ts:126-133`), then the extra transform.

armDust (8) — `armDust.ts:28-51`; candidate i reuses `armStarSample(i)` (dead if `!seedAccepted`); inner-edge nudge inX/inZ are draw-free:

| slot  | draw                       |
| ----- | -------------------------- |
| 0     | dense gate (`rand < 0.28`) |
| 1-2   | x genNormal                |
| 3-4   | y genNormal                |
| 5-6   | z genNormal                |
| 7     | dustMod keep gate          |
| 8     | opacity jitter             |
| 9     | size jitter                |
| 56-59 | reddening                  |

barDust (9) — `barDust.ts:22-39`:

| slot  | draw              |
| ----- | ----------------- |
| 0     | along             |
| 1     | lane side sign    |
| 2     | lane side width   |
| 3-4   | localZ genNormal  |
| 5-6   | y genNormal       |
| 7     | dustMod keep gate |
| 8     | size jitter       |
| 9     | opacity jitter    |
| 56-59 | reddening         |

lenticularNucDust (10) — `lenticularDust.ts:33-48`; cloud = `cloudCenters[i % 34]` from the UBO: 0-1 x genNormal, 2-3 z genNormal, 4-5 y genNormal, 6 keep, 7 size, 8 opacity, 56-59 reddening.
lenticularRingDust (11) — `:56-71`: 0 theta, 1-2 r genNormal, 3-4 y genNormal, 5 keep, 6 size, 7 opacity, 56-59 reddening.
irregularDust (12) — `irregularDust.ts:23-38`; candidate i reuses `irregularSample(i)` (dead if seed gate failed): 0 dense, 1-2 x genNormal, 3-4 y genNormal, 5-6 z genNormal, 7 keep, 8 size, 9 opacity, 56-59 reddening. Note the seed's radius/angle are `hypot`/`atan2` of the recomputed position and armFade is 1 (`irregularClumps.ts:88`).

**Steps**

- [x] Port the builders (mind each file's own size-vs-opacity draw order — the tables above already encode it; do not 'normalise' them).
- [x] `npm run typecheck` + full `npm test` green.
- [ ] **Checkpoint:** `window.__galaxyParity` across Sc, SBb, S0 (with and without dustRingStrength), Irr — dust totals within ±5% where the candidate cap doesn't bind; verify the cap DEVIATION on a high-starCount Sc (GPU below CPU, explainable by acceptance rate); star rows still PASS (regression guard on the shared sample fns).
- [ ] Run the full harness table one more time on the default preset and paste it into the task summary — this is the parity record plan 02's cutover leans on.
- [x] Commit.
