# GPU renderers reorg — plan 02: folderize + docs

> **For agentic workers:** REQUIRED SUB-SKILL `superpowers:subagent-driven-development`
> — execute this plan one task per fresh subagent, with spec + quality reviews between
> tasks. The main thread runs `npm run typecheck` / `npm test` and makes the commits
> (background subagents can't run `npm`); implementers edit only.

## Goal

Land migration **steps 3 and 4** of the GPU-renderers reorg spec
([`2026-07-10-gpu-renderers-reorg-design.md`](../specs/2026-07-10-gpu-renderers-reorg-design.md)):
move the 21 flat renderers into coupling-following **family folders**, nest their
shaders under `shaders/galaxyCatalog/` + `shaders/bodies/`, rename the
`gpu/labels/` supplier to `gpu/labelLayout/`, move `diskRadiusRing` out of
`passes/`, then codify the file-anatomy section + refresh two stale claims in
[`renderers.md`](../conventions/renderers.md).

**This plan assumes plan 01 (`…reorg-01-lib-and-point-split`) has already shipped.**
Its end state is a precondition: `gpu/lib/{cameraUniforms,unitQuad,blendStates,dummyFade}.ts`
exist; `pointVertexLayout.ts` + `catalogStore.ts` sit flat beside `pointRenderer.ts`;
`setBuildBufferRunner` is gone; `pickRenderer` imports the vertex layout from
`pointVertexLayout.ts`. If any of those are missing, STOP — plan 01 is not done.

## Architecture

Pure mechanical movement. Every task is `git mv` (so history follows the file) plus
the import / `vi.mock` / consumer-constant rewrites the move forces. **Zero runtime
logic changes** — the reorg is behaviour-neutral, and every renderer already has
tests whose imports move with it (23 test files under `tests/services/gpu/renderers/`).
Family boundaries and the target tree are the spec's §3 / §4 verbatim; the shader
moves are §7; the blast-radius counts are §8.

## Tech stack

TypeScript + Vite + WebGPU + WESL (wesl-plugin build-time linker) + Vitest. No new
dependencies; no new files except the two shader nest directories, the family
folders `git mv` creates, and Task A7's `buildSegmentInstances.ts` extraction (+ its
mirrored test file).

## Global constraints

- **Suite green after every task.** The main thread runs `npm run typecheck` +
  `npm test` and commits only on green; a red task does not land.
- **Behaviour-neutral.** This plan changes **zero runtime logic**. The one sanctioned
  extraction is Task A7's `buildSegmentInstances` cut-out (an already-exported pure
  function moving files, user-confirmed 2026-07-14); any other "fix" or "extract"
  temptation is STOP — that belongs to a different plan.
- **`git mv`, don't rewrite.** Preserve every didactic module docblock and comment
  through the move — move the file, then touch only the import lines. Do not
  reformat or re-flow moved files.
- **`type` aliases, never `interface`.** (No new types here, but hold the line.)
- **`@types` files do NOT move.** Per the one-type-per-file convention, the
  `src/@types/rendering/*` renderer type files stay put (spec §8); only the
  implementation `.ts` files relocate.

---

## Phase A — Folderize (spec §11 step 3)

### The mechanical recipe (applies to every family-move task below)

Each family-move task is the same shape — the task lines only name the files and the
task-specific consumers. For every task:

1. `git mv` the renderer `.ts` file(s) from `src/services/gpu/renderers/<name>.ts`
   into `src/services/gpu/renderers/<family>/<name>.ts`.
2. `git mv` the mirroring test file(s) from `tests/services/gpu/renderers/<name>.test.ts`
   into `tests/services/gpu/renderers/<family>/<name>.test.ts`.
3. In each moved renderer, add one `../` to every relative import that now points a
   level up: its **`?static` shader imports** (spec §8: 47 across 20 files), its
   `../lib/*` imports into the hoisted `gpu/lib/` (now `../../lib/*`), and any
   sibling-renderer or `../../` imports.
4. Re-point every **external consumer** of the moved files — the `initGpu.ts` factory
   import for this family (`phases/initGpu.ts:46–70`), any `vi.mock('.../renderers/<name>')`
   literal (spec §8: 20 total — 19 in
   `tests/services/engine/phases/initGpu.destroyReachability.test.ts`, 1 in
   `wireInput.test.ts`), and the task-specific cross-folder **constant** consumers
   the task names (each gains one `../`).
5. Main thread: `npm run typecheck` + `npm test` green → commit.

The blast-radius table (spec §8) is the master checklist — every `?static`, `vi.mock`,
test-file, and constant-consumer row must be owned by exactly one task by the end of
Phase A. Re-read the current file before editing; cite lines, don't trust these.

---

### Task A1 — Rename supplier `gpu/labels/` → `gpu/labelLayout/`

Kills the name-twin with the new `renderers/labels/` renderer folder (spec §3, last
subsection). Not a renderer move — a supplier rename.

**Files:** `git mv src/services/gpu/labels/` (5 files: `fontMetrics.ts`,
`labelLayout.ts`, `loadFontAtlases.ts`, `measureLabel.ts`, `milkyWayLabelVisibility.ts`)
→ `src/services/gpu/labelLayout/`, plus the mirroring test dir if one exists.

- [ ] `git mv` the folder + its tests.
- [ ] Re-point the four consumer groups (spec §3): `labelRenderer.ts:76–77`
      (`../labels/` → `../labelLayout/` — this path also shifts again in A5 when
      `labelRenderer` itself moves; do the rename half here), `src/data/fonts.ts`,
      `phases/initGpu.ts`, and `presentation/produceMilkyWayLabel.ts`.
- [ ] typecheck + suite green.
- [ ] Commit: `refactor(gpu): rename gpu/labels supplier to gpu/labelLayout`.

### Task A2 — `galaxyCatalog/` family move (7 files)

The LOD chain of one conceptual renderer (spec §3). Members (spec §4):
`pointRenderer.ts`, `proceduralDiskRenderer.ts`, `texturedDiskRenderer.ts`,
`instancedQuadRenderer.ts`, `pickRenderer.ts`, `pointVertexLayout.ts`,
`catalogStore.ts` (the last two produced by plan 01).

Apply the recipe. Task-specific consumers:

- [ ] `git mv` the 7 renderer files → `renderers/galaxyCatalog/` and their test files
      → `tests/services/gpu/renderers/galaxyCatalog/`. (Intra-family imports —
      `pickRenderer` → `pointVertexLayout`, the two disk renderers → `instancedQuadRenderer` —
      stay same-folder, no `../` change.)
- [ ] `?static` rewrites: `point`/`proceduralDisk` carry 3 each (spec §8); the disk
      and pick files the rest.
- [ ] `createPickRenderer` consumer is **`wireInput.ts:33`**, NOT `initGpu.ts` (spec §8)
      — re-point it + its test's `vi.fn` stub. The other 4 factories re-point in
      `initGpu.ts:46–70`.
- [ ] `FLOATS_PER_INSTANCE` consumers gain `../`: `texturedDiskRenderer.ts:47`,
      `proceduralDiskRenderer.ts:67`, and their tests (spec §8). NOT
      `rebuildHiResFamousForTier` — comment-only.
- [ ] `pointVertexLayout` external consumers (3 test files per spec §8) gain `../`.
- [ ] `vi.mock` literals for all 5 factory-visible members in
      `initGpu.destroyReachability.test.ts` + the `wireInput.test.ts` pick literal.
- [ ] typecheck + suite green.
- [ ] Commit: `refactor(gpu): move galaxyCatalog LOD renderers into a family folder`.

### Task A3 — Nest galaxy-catalog shaders under `shaders/galaxyCatalog/`

`shaders/{points,proceduralDisks,texturedDisks}/` → `shaders/galaxyCatalog/{points,proceduralDisks,texturedDisks}/`
(spec §7). WESL import paths change: `package::points::io` →
`package::galaxyCatalog::points::io`, etc.

- [ ] `git mv` the three shader dirs under a new `shaders/galaxyCatalog/`.
- [ ] Rewrite the **14** `package::` import lines across the `.wesl` files under
      those three dirs (spec §7).
- [ ] Rewrite the **9** `?static` TS import lines: `pointRenderer.ts:51–52`,
      `pickRenderer.ts:30–31`, `proceduralDiskRenderer.ts:57–59`,
      `texturedDiskRenderer.ts:45–46` (post-A2 these live under `galaxyCatalog/`; the
      path segment `galaxyCatalog/` is the change, on top of A2's `../`).
- [ ] `wesl.toml` is **untouched** — its glob `src/services/gpu/shaders/**/*.wesl`
      (`wesl.toml:31`) already covers the nesting. A bad `package::` path **fails the
      build loudly**, not silently. No backticks in `.wesl` comments.
- [ ] typecheck + suite green.
- [ ] Commit: `refactor(gpu): nest galaxy-catalog shaders under shaders/galaxyCatalog`.

### Task A4 — `milkyWay/` family move (2 files)

`milkyWayCloudRenderer.ts`, `milkyWayPickRenderer.ts` (spec §3 — matched pick
footprint reads shared calibration). Apply the recipe. `gpu/galaxy/` stays a sibling
supplier — do **not** move it.

- [ ] `git mv` the 2 files → `renderers/milkyWay/` + their tests.
- [ ] Recipe steps 3–5; re-point `initGpu.ts` + the two `vi.mock` literals.
- [ ] Commit: `refactor(gpu): move milkyWay cloud + pick renderers into a family folder`.

### Task A5 — `labels/` family move (2 files)

`labelRenderer.ts`, `markerLineRenderer.ts` — the label subsystem's two draw calls
(spec §3). Apply the recipe.

- [ ] `git mv` the 2 files → `renderers/labels/` + their tests.
- [ ] `labelRenderer.ts` import of the (already-renamed) `labelLayout/` supplier gains
      `../` on top of A1's rename.
- [ ] `LABEL_*_DEFAULT` (`MIN_PX`, `MAX_PX`, `WORLD_EM_MPC`) consumer gains `../`:
      `subsystems/labelDirectorSubsystem.ts:83–85` (spec §8).
- [ ] Re-point `initGpu.ts` + the two `vi.mock` literals.
- [ ] Commit: `refactor(gpu): move label + markerLine renderers into a family folder`.

### Task A6 — `structureMarker/` singleton move (1 file)

`structureMarkerRenderer.ts` — genuine singleton (spec §3). It carries **6** `?static`
imports (the most — spec §8). Apply the recipe.

- [ ] `git mv` → `renderers/structureMarker/` + its test; +`../` on all 6 `?static`.
- [ ] Re-point `initGpu.ts` + its `vi.mock` literal.
- [ ] Commit: `refactor(gpu): move structureMarker renderer into its own folder`.

### Task A7 — `filaments/` family move + `buildSegmentInstances` extraction (2 files)

Spec §4 lists `buildSegmentInstances.ts (extracted from filamentRenderer.ts)` as the
second member — honor it literally. `buildSegmentInstances` is already an exported,
directly-tested pure function (`filamentRenderer.ts:72`, tested at
`tests/services/gpu/renderers/filamentRenderer.test.ts:76`), so the extraction is
mechanical and behaviour-neutral (user-confirmed 2026-07-14).

- [ ] `git mv filamentRenderer.ts` → `renderers/filaments/filamentRenderer.ts` + its
      test → `tests/services/gpu/renderers/filaments/filamentRenderer.test.ts`.
- [ ] Cut the `buildSegmentInstances` function — with its docblock and the
      `FilamentCloud`-related imports it needs (read the current file to enumerate) —
      into `renderers/filaments/buildSegmentInstances.ts`; `filamentRenderer.ts` imports
      it from `'./buildSegmentInstances'`.
- [ ] Move the `buildSegmentInstances` describe block (`filamentRenderer.test.ts:76`)
      into a new `tests/services/gpu/renderers/filaments/buildSegmentInstances.test.ts`
      so tests mirror src, re-pointing its import to the new file.
- [ ] Recipe steps 3–5; re-point `initGpu.ts` + its `vi.mock` literal.
- [ ] typecheck + suite green — the whole task lands as one commit.
- [ ] Commit: `refactor(gpu): move filamentRenderer into a filaments folder, extract buildSegmentInstances`.

### Task A8 — `volumeField/` singleton move (1 file)

`volumeFieldRenderer.ts`. Apply the recipe. (Note: shares only the `buildCubeModelMatrix`
util with `flowField`, not each other — they stay separate singles, spec §3.)

- [ ] `git mv` → `renderers/volumeField/` + its test.
- [ ] Re-point `initGpu.ts` + its `vi.mock` literal.
- [ ] Commit: `refactor(gpu): move volumeFieldRenderer into its own folder`.

### Task A9 — `flowField/` singleton move (1 file)

`flowFieldRenderer.ts`. It carries **3** `?static` imports (spec §8). Apply the recipe.

- [ ] `git mv` → `renderers/flowField/` + its test.
- [ ] External consumer `tools/flow-workbench/src/createFlowHarness.ts:48`
      (`createFlowFieldRenderer`) gains its new path (spec §8).
- [ ] Re-point `initGpu.ts` + its `vi.mock` literal.
- [ ] Commit: `refactor(gpu): move flowFieldRenderer into its own folder`.

### Task A10 — `selectionRing/` singleton move (1 file)

`selectionRingRenderer.ts` — verified zero coupling to any body renderer (spec §3).

- [ ] `git mv` → `renderers/selectionRing/` + its test.
- [ ] Re-point `initGpu.ts` + its `vi.mock` literal.
- [ ] Commit: `refactor(gpu): move selectionRingRenderer into its own folder`.

### Task A11 — `horizonShell/` singleton move (1 file)

`horizonShellRenderer.ts`. Apply the recipe.

- [ ] `git mv` → `renderers/horizonShell/` + its test.
- [ ] `HORIZON_RADIUS_GPC` consumer gains `../`: `frame/passes/horizonShellLayer.ts:48`
      (spec §8).
- [ ] Re-point `initGpu.ts` + its `vi.mock` literal.
- [ ] Commit: `refactor(gpu): move horizonShellRenderer into its own folder`.

### Task A12 — `devTools/` family move (2 files incl. `diskRadiusRing` out of `passes/`)

`debugLineRenderer.ts` moves from `renderers/`; `diskRadiusRing.ts` moves **out of
`gpu/passes/`** into `renderers/devTools/` — it is a renderer, not a texture-operator
(spec §3, `passes/index.ts:159`).

- [ ] `git mv renderers/debugLineRenderer.ts` → `renderers/devTools/debugLineRenderer.ts`.
- [ ] `git mv src/services/gpu/passes/diskRadiusRing.ts` →
      `renderers/devTools/diskRadiusRing.ts` (this is a two-folder-deep move — its
      `?static`, `lib/`, and any `../../` imports change accordingly).
- [ ] `git mv` both test files → `tests/services/gpu/renderers/devTools/`.
- [ ] Re-point the `diskRadiusRing` consumer in the compositor/pass wiring (it sits in
      `CONTENT_LAYERS` as `diskRadiusRingLayer`, `passes/index.ts:159`) and the
      `debugLineRenderer` consumer in `initGpu.ts` + both `vi.mock` literals.
- [ ] Commit: `refactor(gpu): group debug renderers under devTools, move diskRadiusRing out of passes`.

### Task A13 — `bodies/` family move (5 files)

`earthRenderer.ts`, `planetRenderer.ts`, `starRenderer.ts`, `starPointRenderer.ts`,
`orbitTrailRenderer.ts` — the solar-system foreground, one unit (spec §3). Apply the
recipe. Their `utils/math/uvSphereMesh` + `src/data/bodies/` imports gain `../`.

- [ ] `git mv` the 5 files → `renderers/bodies/` + their 5 test files.
- [ ] `MAX_ORBITS` + `INSTANCE_FLOATS` consumer gains `../`:
      `frame/passes/orbitTrailsLayer.ts:50` (spec §8).
- [ ] `MAX_PLANETS` + `INSTANCE_FLOATS` consumer gains `../`:
      `frame/passes/planetsLayer.ts:48` (spec §8).
- [ ] Re-point all 5 `initGpu.ts:66–70` factory imports + all 5 `vi.mock` literals.
- [ ] Commit: `refactor(gpu): move the five body renderers into a bodies family folder`.

### Task A14 — Nest body shaders under `shaders/bodies/`

`shaders/{earth,planet,star,starPoints,orbitTrail}/` → `shaders/bodies/{…}/`
(spec §7, USER-APPROVED 2026-07-14).

- [ ] `git mv` the five shader dirs under a new `shaders/bodies/`.
- [ ] Rewrite the **8** WESL self-import lines (`package::<dir>::io::VSOut` →
      `package::bodies::<dir>::io::VSOut`): `earth/vertex.wesl:30`, `earth/fragment.wesl:50`,
      `planet/vertex.wesl:39`, `planet/fragment.wesl:37`, `starPoints/vertex.wesl:46`,
      `starPoints/fragment.wesl:17`, `orbitTrail/vertex.wesl:43`, `orbitTrail/fragment.wesl:67`
      (`star` has **no** self-import — spec §7).
- [ ] Rewrite the **10** `?static` TS lines (2 per body renderer, post-A13 under
      `bodies/`).
- [ ] The `package::lib::` imports (`lib::camera`, `lib::billboard`, `lib::sphere`) are
      **UNTOUCHED** — the shared lib stays at `shaders/lib/` (spec §7). `wesl.toml`
      untouched; bad path fails the build loudly; no backticks in `.wesl` comments.
- [ ] typecheck + suite green.
- [ ] Commit: `refactor(gpu): nest body shaders under shaders/bodies`.

### Task A15 — Visual smoke check (MAIN-THREAD / USER checkpoint — not a subagent step)

~57 shader-plumbing import lines moved across two nests. Per the iOS-shader landmine
(`CLAUDE.md`): a broken pipeline can present a **black canvas with no thrown error** and
the linker only catches path typos, not layout mismatches. So a green suite is
necessary but not sufficient — a human must look.

- [ ] The user / main thread drives the running dev server and confirms **each** surface
      from spec §12 renders: galaxies, procedural disks, textured disks, labels, marker-lines
      (label stems), Milky Way cloud + pick, volume field, flow field, pick/hover, Earth
      (Blue Marble texture), planets, star spheres + star points (the LOD partition), and
      orbit trails.
- [ ] Any black / missing surface → the shader path for that family is wrong; fix before
      Phase B. No commit (verification checkpoint).

---

## Phase B — Docs + backlog (spec §11 step 4)

### Task B1 — Add the canonical file-anatomy section to `renderers.md` + refresh stale claims

**File:** `docs/superpowers/conventions/renderers.md` (modify).

- [ ] Add a new **file-anatomy** section using the spec §9 sketch verbatim:
      `module docblock → imports → layout/uniform constants (byte-map comments) →
factory: shader modules → BGLs + pipeline layout + pipeline → buffers → methods as
named functions → return object literal satisfies Renderer`. Note that
      `flowFieldRenderer` + `volumeFieldRenderer` (methods inline in the return literal)
      **normalize to named functions when next touched, NOT in this reorg** (spec §9).
- [ ] Refresh **stale claim 1** (known-outliers section, `renderers.md:306–311`):
      `pickRenderer` no longer shares `pointRenderer`'s `uniformBuffer` — it owns its own
      `pickUniformBuffer` since renderer-unification plan 03 (`pickRenderer.ts:11`, `:155`,
      `:203`; spec §6 stale-claim note). Delete the sharing claim; do not preserve it.
- [ ] Refresh **stale claim 2** (`renderers.md:275–276`): `instancedQuadRenderer` has
      **two** consumers (textured-disk, procedural-disk), not "three downstream renderers
      (thumbnail, disk, procedural disk)" — the thumbnail path _is_ the textured-disk
      stage, and `rebuildHiResFamousForTier` is comment-only (spec §3, §9).
- [ ] Update any `renderers.md` **path references** broken by the folderize (e.g. any
      `src/services/gpu/renderers/<name>.ts` citation whose file moved into a family
      folder, and the `gpu/labels/` → `gpu/labelLayout/` rename).
- [ ] Commit: `docs(renderers): add file-anatomy section, refresh stale outlier claims`.

### Task B2 — Reconcile the spec's own §4 tree with reality

**File:** `docs/superpowers/specs/2026-07-10-gpu-renderers-reorg-design.md` (modify).

- [ ] Correct the spec's **§3** wording, which calls `filaments/` a "genuine
      singleton" holding "one file each" while §4 (correctly, post-A7) shows two files:
      after the extraction, `filaments/` is a two-file family — the renderer plus its
      pure instance builder. One line of drift-reconcile. Fix any other §3/§4 drift
      that emerged during Phase A the same way.
- [ ] Commit: `docs(spec): reconcile gpu-renderers §3 filaments wording with shipped folderize`.

### Task B3 — Delete the shipped BACKLOG line

**File:** `docs/BACKLOG.md` (modify).

Backlog hygiene: the item ships with this plan, so its index line goes in the same
change. Verified: `BACKLOG.md:58` ("**GPU renderers folder reorg** … → [spec]") links
**straight to the spec**, and no `docs/backlog/` detail file exists for it — so there
is only the one line to delete.

- [ ] Delete `BACKLOG.md:58` (the "GPU renderers folder reorg" line under Rendering).
- [ ] Commit: `docs(backlog): drop shipped GPU-renderers-reorg line`.

### Task B4 — Closing entanglement-radar review (main thread)

Per project practice of baking a radar check into every plan.

- [ ] Main thread invokes the `entanglement-radar` skill over the **complete** plan-02
      diff (all Phase A + B commits). Expect it clean — the reorg _removes_ the flat-list
      coupling, and there are zero logic changes. If it flags a knot introduced by the
      move (e.g. an import that should have been a `lib/` re-point but became a
      cross-family reach), fix it and re-run before closing the plan.
- [ ] No commit unless the review surfaces a fix.
