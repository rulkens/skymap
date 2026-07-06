# Milky Way point cloud 01 — generation core moves to src/

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention. Steps use checkbox (`- [ ]`) syntax for tracking. **Load the `wesl-shaders` skill before any `.wesl` task.**

**Spec:** `docs/superpowers/specs/2026-07-06-milky-way-point-cloud-design.md`
**Series:** plan 01 of 2. Requires a base containing the merged GPU-generation work (PR #402/#403 — `tools/galaxy-renderer` with `carveStarLayout` / `packGenerationUniforms` / `generate.wesl` etc.). After this plan the shared generation core lives under `src/`, the tool imports it from there, and nothing in the app's runtime behaviour has changed. Plan 02 builds the in-world renderer on top.

**Goal:** Move the GPU galaxy-generation core — 14 TS modules, 9 types, 3 WESL files, 7 test files — from `tools/galaxy-renderer/` to `src/services/gpu/galaxy/` + `src/@types/galaxy/` + `src/services/gpu/shaders/galaxyGen/`, re-point every tool import at the new home (tools→src is the sanctioned dependency direction), and mint the single-source Milky Way preset both apps share. Zero WESL duplication; the parity test keeps guarding the TS↔WGSL mirrors from its new home.

**Architecture:**

- `src/services/gpu/galaxy/` gets the device-facing building blocks (carve fns, UBO layout + packer, compute-pipeline factory, dispatch encoder, param math). `src/@types/galaxy/` gets their types, one per file, converted from the tool's `.d.ts` style to plain `.ts` (the newer main-app convention — cf. `src/@types/animation/*.ts`). `src/services/gpu/shaders/galaxyGen/` gets the three WESL files; the entry files' imports change from `package::lib::generate::X` to `package::galaxyGen::generate::X` (the lib flattens to `galaxyGen/generate.wesl` — the main shader tree's `lib/` is for cross-renderer helpers, and this lib serves exactly this feature).
- The tool keeps everything else (draw shaders, engine loop, matcher, UI, presets) and imports the moved core deep-relative into `src/` — the direction its tsconfig already supports (`include: ["@types", "src", "../../src", "../../tools/utils"]`, and it already imports `src/services/gpu/shaderCompileLogger` and `src/@types/math/Vec3`).
- **DEVIATION from the spec's explicit move list (mechanism, not contract):** the spec's bullet list omits `createGenerationPipelines.ts`, `encodeGeneration.ts`, `GenerationPipelines`, `ExtraGalaxySpec`, and the `GEN_RECORD_BYTES` constant — but its architecture section defines the core as "UBO layout, buffer sizing, compute pipelines", and plan 02's `initGpu` generation step cannot import them from `tools/` (wrong direction). They move too. `GEN_RECORD_BYTES` (currently a local const in `createGalaxyEngine.ts:137`) gets its own one-symbol file because plan 02's renderer and buffer sizing both need it — a second hand-copied `32` is exactly the drift the record-size authority exists to prevent.
- Move mechanics: use `git mv` per file so history follows, then edit imports. Every task boundary leaves the full suite + both typechecks green and the tool linkable.

**Tech Stack:** TypeScript, WESL (`?static` build-time linking via wesl-plugin), Vitest, two Vite builds (main app + `tools/galaxy-renderer/vite.config.ts`).

## Global Constraints

- Worktree `.claude/worktrees/better-galaxy-renderer`; run all commands from its root with absolute paths in dispatches (subagents resolve relative paths against the main repo).
- Gates at every task boundary: `npm test` green, `npm run typecheck` green (both configs), and — for any task that touches WESL or the tool's imports — the tool still builds: `npx vite build --config tools/galaxy-renderer/vite.config.ts` (there is no npm script for the tool's build; `npm run galaxy-renderer` is the dev server only).
- This is a **move, not a rewrite**: file contents change only where an import path, a WESL `package::` path, or a scraped path constant demands it. No behaviour changes, no formula edits, no comment rewrites beyond stale-path fixes.
- TS house rules: `type` never `interface`; **one exported type per file in `src/@types/`** (this rule goes in every dispatch touching `@types/`); one symbol per file for the moved modules (already true — preserve it); deep relative imports, no barrels; `Vec2`/`Vec3` aliases never raw tuples; typed `vi.fn<() => void>()` in fixtures; didactic timeless comments (no history narration, no PR refs — when a moved file's header references its old tool context, fix the path references but do not add "moved from" notes).
- WESL rules (load the `wesl-shaders` skill first): no backticks in `.wesl` comments; `import` lines at the very top, one identifier per line; prefix is the literal `package::`; every `switch` has a `default:`; GPU resources keep their `galaxy:` labels.
- Git hygiene: never `git add -A` — stage specific paths; prettier only on touched files; commits use the user's identity with the Co-Authored-By trailer only.
- Search before writing helpers: preflight-grep `src/utils` and `src/services/gpu` before creating any new file that isn't in this plan's inventory.

## Move inventory (the complete list — nothing else moves)

| From (`tools/galaxy-renderer/`)                                 | To                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------- |
| `src/model/populationIds.ts`                                    | `src/services/gpu/galaxy/populationIds.ts`              |
| `src/model/grainScale.ts`                                       | `src/services/gpu/galaxy/grainScale.ts`                 |
| `src/model/carveStarLayout.ts`                                  | `src/services/gpu/galaxy/carveStarLayout.ts`            |
| `src/model/carveDustLayout.ts`                                  | `src/services/gpu/galaxy/carveDustLayout.ts`            |
| `src/model/classifyHubbleType.ts`                               | `src/services/gpu/galaxy/classifyHubbleType.ts`         |
| `src/model/splitStarBudget.ts`                                  | `src/services/gpu/galaxy/splitStarBudget.ts`            |
| `src/model/computeBarGeometry.ts`                               | `src/services/gpu/galaxy/computeBarGeometry.ts`         |
| `src/model/barLengthOf.ts`                                      | `src/services/gpu/galaxy/barLengthOf.ts`                |
| `src/model/outerRadiusOf.ts`                                    | `src/services/gpu/galaxy/outerRadiusOf.ts`              |
| `src/model/hiiPalette.ts`                                       | `src/services/gpu/galaxy/hiiPalette.ts`                 |
| `src/engine/generationUboLayout.ts`                             | `src/services/gpu/galaxy/generationUboLayout.ts`        |
| `src/engine/packGenerationUniforms.ts`                          | `src/services/gpu/galaxy/packGenerationUniforms.ts`     |
| `src/engine/createGenerationPipelines.ts`                       | `src/services/gpu/galaxy/createGenerationPipelines.ts`  |
| `src/engine/encodeGeneration.ts`                                | `src/services/gpu/galaxy/encodeGeneration.ts`           |
| _(new — extracted from `src/engine/createGalaxyEngine.ts:137`)_ | `src/services/gpu/galaxy/genRecordBytes.ts`             |
| `@types/model/GalaxyParams.d.ts`                                | `src/@types/galaxy/GalaxyParams.ts`                     |
| `@types/model/GalaxyCategory.d.ts`                              | `src/@types/galaxy/GalaxyCategory.ts`                   |
| `@types/model/StarBudget.d.ts`                                  | `src/@types/galaxy/StarBudget.ts`                       |
| `@types/model/BarGeometry.d.ts`                                 | `src/@types/galaxy/BarGeometry.ts`                      |
| `@types/model/HiiPalette.d.ts`                                  | `src/@types/galaxy/HiiPalette.ts`                       |
| `@types/model/PopulationRange.d.ts`                             | `src/@types/galaxy/PopulationRange.ts`                  |
| `@types/model/GenerationLayout.d.ts`                            | `src/@types/galaxy/GenerationLayout.ts`                 |
| `@types/engine/GenerationPipelines.d.ts`                        | `src/@types/galaxy/GenerationPipelines.ts`              |
| `@types/engine/ExtraGalaxySpec.d.ts`                            | `src/@types/galaxy/ExtraGalaxySpec.ts`                  |
| `src/engine/shaders/generateStars.wesl`                         | `src/services/gpu/shaders/galaxyGen/generateStars.wesl` |
| `src/engine/shaders/generateDust.wesl`                          | `src/services/gpu/shaders/galaxyGen/generateDust.wesl`  |
| `src/engine/shaders/lib/generate.wesl`                          | `src/services/gpu/shaders/galaxyGen/generate.wesl`      |

Tests (mirror the src tree):

| From (`tests/tools/galaxy-renderer/`)   | To                                                         |
| --------------------------------------- | ---------------------------------------------------------- |
| `model/carveStarLayout.test.ts`         | `tests/services/gpu/galaxy/carveStarLayout.test.ts`        |
| `model/carveDustLayout.test.ts`         | `tests/services/gpu/galaxy/carveDustLayout.test.ts`        |
| `model/classifyHubbleType.test.ts`      | `tests/services/gpu/galaxy/classifyHubbleType.test.ts`     |
| `model/splitStarBudget.test.ts`         | `tests/services/gpu/galaxy/splitStarBudget.test.ts`        |
| `model/hiiPalette.test.ts`              | `tests/services/gpu/galaxy/hiiPalette.test.ts`             |
| `engine/packGenerationUniforms.test.ts` | `tests/services/gpu/galaxy/packGenerationUniforms.test.ts` |
| `engine/generationShaderParity.test.ts` | `tests/services/gpu/galaxy/generationShaderParity.test.ts` |

`@types/model/` and the tool's two moved `@types/engine` files are deleted once empty; `tools/galaxy-renderer/src/model/` is deleted once empty; `src/engine/shaders/lib/fullscreenTri.wesl` and everything else in the tool stays.

---

## Task 1 — SPIKE: cross-root WESL resolution for the tool build

**Deliverable:** a decided mechanism recorded in the **Ledger** at the bottom of this plan — not production code. Scratch files are deleted before commit (commit only the ledger note).

**The hazard.** After the move, the WESL lives under the MAIN app's wesl root (`wesl.toml`: `root = "src/services/gpu/shaders"`, include glob already covers `galaxyGen/`). The main build links it natively. The TOOL build is the problem: `tools/galaxy-renderer/vite.config.ts:45-48` passes `weslToml: resolve(__dirname, 'wesl.toml')`, whose `root = "src/engine/shaders"` — the moved files are outside it, and the tool still needs its OWN root for its draw shaders (`star.wesl`, `dust.wesl`, `bloom*.wesl`, `composite.wesl`, `lib/fullscreenTri.wesl`). The known wesl-plugin-reads-cwd gotcha (memory: cosmic-flow sub-tools) compounds this. Note the exact shape to prove: the tool build imports the src-resident TS module `createGenerationPipelines.ts`, whose `?static` imports point at src-resident WESL whose internal imports say `package::galaxyGen::generate::…`.

**Steps**

- [x] Load the `wesl-shaders` skill.
- [x] Create a scratch probe: `src/services/gpu/shaders/galaxyGen/spikeProbe.wesl` (a trivial `fn probeIdentity(x: f32) -> f32` plus a second file importing it via `package::galaxyGen::spikeProbe::probeIdentity`), and a scratch TS module under `src/services/gpu/galaxy/` that imports the probe with `?static`.
- [x] Prove the MAIN side: temporarily import the scratch TS module from any app entry (or run `npx vite build` with the import in place) → the linker resolves `package::galaxyGen::…`. Expected: works out of the box (the root toml's include glob already matches).
- [x] Prove the TOOL side. Try mechanisms in this order, stopping at the first that builds `npx vite build --config tools/galaxy-renderer/vite.config.ts` with a temporary import of the scratch TS module from `createGalaxyEngine.ts`:
  1. **Extend the tool's `wesl.toml`** — add `"../../src/services/gpu/shaders/**/*.wesl"` to `include` (test whether resolution is include-driven or strictly root-driven for the `galaxyGen::` package path).
  2. **Two `viteWesl` plugin instances** in the tool config — one with the tool's toml, one with `weslToml: resolve(__dirname, '../../wesl.toml')` (check whether the second instance picks up what the first can't resolve, or whether they conflict).
  3. **Vite alias / `galaxyGen` symlink under the tool's shader root** so `package::galaxyGen::…` resolves inside the tool's own root (a symlink is a single source, NOT a copy — but weigh git/Windows friction before choosing it).
- [x] **Never a WESL copy** — if all three fail, STOP and escalate to the user with findings; do not invent a fourth mechanism that duplicates shader text.
- [x] Delete all scratch files and config edits except the winning mechanism's config change (keep that uncommitted if Task 5 will re-apply it cleanly, or commit it now if it stands alone).
- [x] Write the one-paragraph decision note in the **Ledger** section below (mechanism, why, what failed). Commit the ledger note.

---

## Task 2 — types move: `src/@types/galaxy/` (9 files)

**Files:** create the 9 `src/@types/galaxy/*.ts` files per the inventory table; delete the 9 tool `.d.ts` originals; update every tool import of them.

**Rules for this task:** one exported type per file (filename = type name); plain `.ts`, not `.d.ts`; `type` never `interface` (already true — preserve); keep each file's didactic header (fix stale path references like `model.js` cites — those stay, they cite the spike source, not a repo path).

- [x] `git mv` each `.d.ts` to its new `.ts` path (contents unchanged apart from any intra-`@types` relative imports: `ExtraGalaxySpec.ts` imports `GalaxyParams` from `./GalaxyParams` and `Vec3` from `../math/Vec3` now that they're siblings under `src/@types/`).
- [x] Re-point every tool import. Find them all with: `grep -rln "@types/model/" tools/galaxy-renderer tests/tools/galaxy-renderer` and `grep -rln "@types/engine/GenerationPipelines\|@types/engine/ExtraGalaxySpec" tools/galaxy-renderer tests/tools/galaxy-renderer`. Expect ~25 files (matcher, presets, data, state, ui, engine, model). New import shape from `tools/galaxy-renderer/src/<dir>/`: `../../../../src/@types/galaxy/<Type>` (count the depth per file — the tool's own `@types/` files that reference moved types, e.g. `@types/data/ReferenceGalaxy.d.ts`, `@types/engine/GalaxyEngineHandle.d.ts`, re-point too but do NOT move).
- [x] `npm run typecheck` (both configs) + `npm test` → green. `npx vite build --config tools/galaxy-renderer/vite.config.ts` → builds.
- [x] Commit (stage the specific moved/edited paths).

---

## Task 3 — model math moves: `src/services/gpu/galaxy/` (10 files + 5 tests)

**Files:** the 10 `src/model/*.ts` rows of the inventory + their 5 test files.

- [x] `git mv` the 10 model files to `src/services/gpu/galaxy/`. Inside each, re-point type imports to `../../../@types/galaxy/<Type>` and sibling imports stay `./<sibling>`.
- [x] Re-point every remaining tool import of these modules (`grep -rn "from '.*model/" tools/galaxy-renderer/src` — consumers include `createGalaxyEngine.ts:110-113`, `packGenerationUniforms.ts:52-58` (moves next task — still re-point now so this task's gate passes), `randomGalaxyParams.ts`, `hubbleStagePatches.ts`, `ControlsPanel.tsx`, `runCompareFit.ts`, matcher files).
- [x] `git mv` the 5 test files to `tests/services/gpu/galaxy/` and re-point their imports to `../../../../src/services/gpu/galaxy/<fn>`.
- [x] Delete the now-empty `tools/galaxy-renderer/src/model/` directory.
- [x] Gates: `npm test` + `npm run typecheck` + tool `npx vite build`. Commit.

---

## Task 4 — engine generation seam moves: packer, UBO layout, pipelines, encoder, `GEN_RECORD_BYTES`

**Files:** `generationUboLayout.ts`, `packGenerationUniforms.ts`, `createGenerationPipelines.ts`, `encodeGeneration.ts` → `src/services/gpu/galaxy/`; new `src/services/gpu/galaxy/genRecordBytes.ts`; `tests/services/gpu/galaxy/packGenerationUniforms.test.ts` (moved); modify `tools/galaxy-renderer/src/engine/createGalaxyEngine.ts`.

**Interfaces** (unchanged signatures, new home — pinned so plan 02 can cite them):

```ts
// src/services/gpu/galaxy/genRecordBytes.ts — the record-size authority.
// 8 f32 lanes per generated star/dust record; the tool's render pipelines
// and plan 02's cloud renderer both read their instance arrayStride from it.
export const GEN_RECORD_BYTES = 32;

// src/services/gpu/galaxy/packGenerationUniforms.ts
export const CATEGORY_CODE: Record<GalaxyCategory, number>;
export function packGenerationUniforms(
  params: GalaxyParams,
  budget: StarBudget,
  extra: ExtraGalaxySpec | null,
): ArrayBuffer;

// src/services/gpu/galaxy/generationUboLayout.ts
export const GENERATION_UBO: { byteLength; f32; u32; arrays };

// src/services/gpu/galaxy/createGenerationPipelines.ts — its two `?static`
// imports become '../shaders/galaxyGen/generateStars.wesl?static' /
// '../shaders/galaxyGen/generateDust.wesl?static' (Task 5 makes them exist;
// see the sequencing note below).
export function createGenerationPipelines(device: GPUDevice): GenerationPipelines;

// src/services/gpu/galaxy/encodeGeneration.ts — unchanged.
```

**Sequencing note:** Tasks 4 and 5 are one atomic pair for the tool build (`createGenerationPipelines`'s `?static` paths and the WESL's location must agree). Land them as two commits in one green sequence: this task moves the TS with its `?static` paths still pointing at the OLD tool shader location (tool builds, vitest green — vitest never links these shaders), Task 5 moves the WESL and flips the two paths. If the intermediate tool build fails on cross-root TS→tool-WESL resolution, squash the two into one commit instead — note which way it went in the task summary.

- [x] Extract `GEN_RECORD_BYTES` to its own file; `createGalaxyEngine.ts` imports it (delete the local const, keep its didactic comment with the file reference updated).
- [x] `git mv` the four engine modules; re-point their internal imports (`../model/…` → `./…`, `../../@types/…` → `../../../@types/galaxy/…`).
- [x] Re-point `createGalaxyEngine.ts:105-113` imports (`./packGenerationUniforms` etc. → `../../../../src/services/gpu/galaxy/…`).
- [x] `git mv` + re-point `packGenerationUniforms.test.ts` (imports `GENERATION_UBO`, `packGenerationUniforms`, `hiiPalette`, carve fns — all now `src/services/gpu/galaxy/`).
- [x] Gates: `npm test` + `npm run typecheck` + tool `npx vite build` (see sequencing note). Commit.

---

## Task 5 — WESL moves + parity test re-home

**Load the `wesl-shaders` skill first.**

**Files:** the 3 WESL rows of the inventory; `tests/services/gpu/galaxy/generationShaderParity.test.ts` (moved); `tools/galaxy-renderer/vite.config.ts` and/or `tools/galaxy-renderer/wesl.toml` (the Task-1 mechanism); `src/services/gpu/galaxy/createGenerationPipelines.ts` (the two `?static` paths).

- [ ] `git mv` the three files; the lib flattens: `lib/generate.wesl` → `galaxyGen/generate.wesl`.
- [ ] Rewrite the entry files' import lines (one identifier per line, at the very top): `package::lib::generate::X` → `package::galaxyGen::generate::X` (10 imports in `generateStars.wesl:47-56`, 8 in `generateDust.wesl:41-48`). `generate.wesl` itself imports nothing — no edits beyond comment path references. **Keep the `total N bytes` comment intact** — the parity test scrapes it.
- [ ] Flip `createGenerationPipelines.ts`'s two `?static` import paths to `../shaders/galaxyGen/…`.
- [ ] Apply the Task-1 mechanism to the tool build config so the tool links the moved files.
- [ ] `git mv` + update the parity test. Path constants change (the test resolves from `process.cwd()`): `const SHADERS = 'src/services/gpu/shaders/galaxyGen'`; `readShader('lib/generate.wesl')` → `readShader('generate.wesl')` (3 sites); TS imports → `../../../../src/services/gpu/galaxy/{generationUboLayout,packGenerationUniforms,populationIds}`. Scraper regexes and every assertion stay byte-identical — the mirrors themselves did not change.
- [ ] Delete the now-empty `tools/galaxy-renderer/src/engine/shaders/lib/` entry for generate (keep `fullscreenTri.wesl`); delete the two moved entry files from the tool tree (git mv already did).
- [ ] Gates: `npm test` (parity green from the new home) + `npm run typecheck` + tool `npx vite build` + **manual dev-server check of the tool**: `npm run galaxy-renderer`, load it, confirm a galaxy still generates and draws (this is the only runtime consumer of the moved compute path today).
- [ ] Commit.

---

## Task 6 — single-source Milky Way preset

**Files:** create `src/data/milkyWay/milkyWayGalaxyParams.ts`, `tests/data/milkyWay/milkyWayGalaxyParams.test.ts`; modify `tools/galaxy-renderer/src/data/referenceGalaxies.ts`.

**Interfaces**

```ts
// src/data/milkyWay/milkyWayGalaxyParams.ts
// (data module — may export both constants; the one-symbol rule binds utils/ and @types/)

/** Fixed generation seed. 1 is what the tool preset implicitly used
 *  (seed undefined → (seed|0)||1), so tool and app render the identical galaxy. */
export const MILKY_WAY_GENERATION_SEED = 1;

/** SBb, 4 arms, bar, warp — the tool's 'Milky Way (model)' reference params,
 *  verbatim (referenceGalaxies.ts mw entry), with the seed made explicit.
 *  starCount 200_000 is the MEDIUM-tier budget (plan 02's per-tier table
 *  derives small/large as x0.5/x2 from it). */
export const MILKY_WAY_GALAXY_PARAMS: GalaxyParams; // = { type: 'SBb', …, seed: MILKY_WAY_GENERATION_SEED }
```

- [ ] Failing tests: `MILKY_WAY_GALAXY_PARAMS is an SBb with 4 arms and the explicit seed` (assert `type === 'SBb'`, `armCount === 4`, `seed === MILKY_WAY_GENERATION_SEED`, `starCount === 200_000`); `classifyHubbleType(MILKY_WAY_GALAXY_PARAMS.type) is 'barred'` (guards the preset against a type-string typo silently changing the whole morphology).
- [ ] Create the module: copy the params object verbatim from `referenceGalaxies.ts` (`id: 'mw'` entry, lines ~238-265) + add `seed`.
- [ ] `referenceGalaxies.ts`: the mw entry's `params:` becomes `MILKY_WAY_GALAXY_PARAMS` (import from `../../../../src/data/milkyWay/milkyWayGalaxyParams`); delete the inline object. `tests/tools/galaxy-renderer/data/referenceGalaxies.test.ts` must stay green unmodified (it asserts entry count/ids, not param literals — verify).
- [ ] Gates: `npm test` + `npm run typecheck` + tool `npx vite build`. Commit.

---

## Task 7 — final sweep + gate

- [ ] Sweep for stragglers: `grep -rn "galaxy-renderer/src/model\|galaxy-renderer/@types/model\|lib::generate\|lib/generate.wesl" src tools tests docs/superpowers/plans/2026-07-06-*` → only historical docs (completed plans) may still reference old paths; live code must have zero hits.
- [ ] Confirm deleted dirs are gone: `tools/galaxy-renderer/src/model/`, `tools/galaxy-renderer/@types/model/`, the two moved `@types/engine` files, the three old WESL locations, the seven old test locations.
- [ ] Full gate: `npm test` (all suites), `npm run typecheck`, `npx vite build --config tools/galaxy-renderer/vite.config.ts`, `npm run build` (main app — proves the moved WESL doesn't break the app bundle even before plan 02 consumes it).
- [ ] Commit any sweep fixes.

## Ledger

- **Task 1 spike decision:** **Mechanism 3 — symlink + vite alias — wins.** A relative symlink at `tools/galaxy-renderer/src/engine/shaders/galaxyGen` → `../../../../../src/services/gpu/shaders/galaxyGen` makes the shared WESL appear inside the tool's wesl root (the include glob follows the directory symlink for discovery), and the tool vite config gains `resolve.preserveSymlinks: true` plus a regex alias rewriting any `.../shaders/galaxyGen/*.wesl` import onto the symlinked path, so the `?static` id the plugin receives is root-internal and binds `package::galaxyGen::…`. Mechanism 1 (adding `../../src/services/gpu/shaders/**/*.wesl` to the tool toml's `include`) failed: the glob discovered the file but binding is **root-driven** — `module not found for 'package::galaxyGen::spikeProbe::probeIdentity'`. Mechanism 2 (two `viteWesl` instances) failed in **both** orders: whichever instance runs first claims every `?static` load and dies with `Root module not found` on the other root's files. The main build is untouched (its glob never traverses `tools/`; proven green in round 1). Cwd caveats: the MAIN build is cwd-sensitive (no explicit `weslToml` → the plugin reads `<cwd>/wesl.toml`, so build from the repo root, as `npm run build` does); the TOOL build is cwd-insensitive (absolute `weslToml`, `__dirname`-anchored alias, filesystem-level symlink). Git note for Task 5: commit the symlink as a symlink object; Windows checkouts need `core.symlinks=true` + Developer Mode or the link materialises as a plain text file and the tool build breaks there (macOS/Linux unaffected).

## Definition of Done

- [ ] Every row of the move inventory is at its new path; every old path is deleted; `git log --follow` traces each moved file.
- [ ] Zero WESL duplication: `generate.wesl`, `generateStars.wesl`, `generateDust.wesl` each exist exactly once in the repo (`find . -name "generate*.wesl" -not -path "*/node_modules/*"` → 3 hits, all under `src/services/gpu/shaders/galaxyGen/`).
- [ ] The parity test guards the mirrors from `tests/services/gpu/galaxy/` and is green.
- [ ] The tool imports the core from `src/` only (no `tools/galaxy-renderer/src/model` or tool-local generation WESL remains) and builds + runs visually unchanged.
- [ ] `MILKY_WAY_GALAXY_PARAMS` + `MILKY_WAY_GENERATION_SEED` exist in `src/data/milkyWay/` and `referenceGalaxies.ts` imports them (no inline mw params).
- [ ] Ledger records the spike decision.
- [ ] Full suite + both typechecks + both builds green; every commit staged specific paths.
