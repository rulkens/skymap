# Layer composition, prep PR (a) — `ContentLayer` → `ContentPass`

Spec: [`docs/superpowers/specs/2026-09-09-layer-composition-design.md`](../specs/2026-09-09-layer-composition-design.md)
§9(a), with §4.1's first paragraph as the rationale. Read §9(a) before starting: it
states the one constraint this plan exists to honour — **nothing but the rename rides
this PR**, because a rename diff touching ~80 files must stay reviewable by inspection.

Branch: `worktree-layer-composition` (off `3a12e6490`). One PR, 6 tasks, every commit green.

## Goal

`ContentLayer` currently means "one draw call's worth of a layer" — the exact thing a
`Layer` will own several of (spec §3). The word has to be freed before any Layer work
starts. This PR moves the whole `ContentLayer` vocabulary to `ContentPass` and changes
nothing else: no field added or deleted, no signature narrowed, no behaviour touched.

## Inventory, verified in this worktree at `3a12e6490`

Grounding for the counts each task must reproduce. Re-derive them, don't trust them.

| Thing                                                         | Count                                                                            |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `ContentLayer` refs (`--dry` report)                          | **104 refs across 42 files (21 in `tests/`)**                                    |
| `*Layer.ts` under `src/services/engine/frame/passes/`         | **38** = 37 pass rows + `createUpsampleLayer.ts` (a factory, not a row)          |
| `*Layer*.test.ts` under `tests/services/engine/frame/passes/` | **30** (7 pass rows have no test; 2 non-`*Layer*` tests there are untouched)     |
| `CONTENT_LAYERS` in `src/` + `tests/`                         | **22 files**; the array has **37 rows** and `index.ts` carries **37 re-exports** |
| `UpsampleLayerRow` / `createUpsampleLayer`                    | **8 files**                                                                      |
| `*Layer` mentions inside `.wesl` comments                     | **11 sites**; **0** `package::` imports affected                                 |
| references in `tools/`                                        | **0**                                                                            |

## Naming map

- `ContentLayer` → `ContentPass` (file `ContentLayer.d.ts` → `ContentPass.d.ts`)
- `CONTENT_LAYERS` → `CONTENT_PASSES`
- `UpsampleLayerRow` → `UpsamplePassRow`, `createUpsampleLayer` → `createUpsamplePass`
- every pass row `<x>Layer` → `<x>Pass`, its file `<x>Layer.ts` → `<x>Pass.ts`, its
  mirror `<x>Layer.test.ts` → `<x>Pass.test.ts`
- the `layers` field carrying a `ContentPass[]` → `passes` (T4; see the ruling there)

## Global constraints

- **Behaviour-neutral, byte-for-byte.** No pass row gains, loses or reorders anything.
  The only diff a reviewer should see is identifiers, filenames and the prose that
  spelled them. `npm run perf` is **not** required and must not be run as a gate: no
  executable statement changes. A visual smoke pass is **not** required either — the
  same objects draw in the same order into the same targets.
- **Every rename and file move goes through `npm run refactor`**, never `git mv` plus
  hand-edited imports, never a hand-edited relative path. `--dry` first, every time
  (`.claude/skills/refactor/SKILL.md`).
- **One mechanical op per commit, no content edits mixed in** — that is what keeps
  git's rename detection (and `git blame`) alive across 38 file moves.
- **The CLI rewrites code, never comments.** ts-morph tracks import/export specifiers
  and value/type references only. Identifier text inside `//`, `/** */` and `.wesl`
  comments survives every rename, which is exactly what T4 exists to sweep.
- **EXCLUDED identifiers — the other "layer" vocabularies. Do not touch any of these:**
  - `FadeLayer` (`src/@types/animation/FadeLayer.d.ts`), `FADE_LAYERS`,
    `src/services/engine/wiring/fadeLayers.ts`, `fadeIdToVisibilityKey.ts`
  - `VisibilityLayerKey`, `VisibilityLayerArg`, and **`LAYER_GROUPS`**
    (`src/utils/animation/expandVisibilityLayers.ts:33`). Checked: `LAYER_GROUPS` is
    `Record<string, readonly VisibilityLayerKey[]>` — it groups _visibility keys_ for
    tour cues, not passes. It is **not** renamed to `PASS_GROUPS`.
  - `CategoryLabelLayer` and every `labelLayer` in `services/engine/presentation/`
  - texture-array layers: `hiResLayerIdx`, `safeLayer`, `baseArrayLayer`,
    `layerCount`, `hiResFamousTexture.ts`, Earth-tile "layers"
  - any CSS/React `layer` word
- **`PASS_GROUP_TITLES`, `PASS_GROUP_KEYS` and `TIMED_SLOTS` already read correctly** and
  are untouched (spec §5's file table says so). Their _inputs_ rename; they do not.
- **No new tests, no deleted tests.** A rename adds no bug class
  (`docs/superpowers/conventions/testing.md`). The suite is the guard, not the deliverable.
- **Docs: living docs only.** In scope: `docs/RENDERER.md`,
  `docs/superpowers/conventions/renderers.md`, `.claude/skills/add-data-source/SKILL.md`,
  `docs/BACKLOG.md` + `docs/backlog/*.md`. Out of scope and deliberately left stale:
  `docs/superpowers/plans/completed/**`, `specs/completed/**`, `docs/grill-sessions/**`,
  `docs/research/engine/**` — those are dated records whose `file:line` citations
  correspond to the tree as it stood on their date. Retro-editing them destroys that
  correspondence for no reader's benefit. `CLAUDE.md` and `.claude/skills/perf/SKILL.md`
  have **zero** hits; don't go looking.
- Comment budget per `docs/superpowers/conventions/comments.md` — this PR only _renames_
  inside comments; it neither adds nor removes comment lines.
- Commit after every task except T1.

---

## Task 1 — dry-run inventory, commit nothing

**Files:** none modified. Manifests are scratch files, outside the repo.

- [ ] `npm run refactor -- rename src/@types/engine/frame/ContentLayer.d.ts#ContentLayer ContentPass --dry`
      → expect the header `104 refs across 42 files (21 in tests/)`. Note: the `--dry`
      report lists refs only, it does **not** print the file-rename plan. `planRename`
      handles `.d.ts` as one extension and drags the `tests/` mirror
      (`tools/utils/refactor/planRename.ts:87-109`); the proof is `git status` after T2.
- [ ] Write the T3 manifest to the scratch dir as a bare array of positional-arg arrays,
      one entry per pass row — the batch form validates all 37 against one `Project` and
      aborts the whole batch on any throw:

```json
[
  ["src/services/engine/frame/passes/scalarVolumeLayer.ts#scalarVolumeLayer", "scalarVolumePass"],
  [
    "src/services/engine/frame/passes/galaxyPointSpritesLayer.ts#galaxyPointSpritesLayer",
    "galaxyPointSpritesPass"
  ]
]
```

- [ ] `npm run refactor -- rename --manifest <scratch>/passRenames.json --dry` → 37
      entries, no throw. Confirm every entry's basename equals its symbol (it does for
      all 37; that is what makes the file move fire).
- [ ] Blind-spot sweep, recorded in the task report:
      `rg -n "Layer" -g '*.wesl' src` → **11** comment sites, **0** `package::` imports;
      `rg -n "frame/passes" tests --type ts | rg "vi.mock|import\(|readFileSync"` → one
      hit, `tests/services/engine/phases/wireInput.test.ts:66`, which mocks the
      **directory** `.../frame/passes` (unmoved) — but its factory body names
      `CONTENT_LAYERS`, so T2 must check it;
      `rg -l "ContentLayer|CONTENT_LAYERS" tools` → empty.
- [ ] **No commit.** Report the four counts.

**Reject if:** any count differs from the inventory table without an explanation, or
the manifest was skipped in favour of 37 individual invocations.

## Task 2 — the core type, the registry, and the two upsample derivatives

**Files:** driven by the CLI. Renamed files: `src/@types/engine/frame/ContentLayer.d.ts`,
`src/@types/engine/frame/UpsampleLayerRow.d.ts`,
`src/services/engine/frame/passes/createUpsampleLayer.ts` (+ its test mirror).
`CONTENT_LAYERS` lives in `passes/index.ts`, whose basename does not track the symbol,
so that file is correctly left in place.

Four renames, one manifest, one commit:

- [ ] `src/@types/engine/frame/ContentLayer.d.ts#ContentLayer` → `ContentPass`
- [ ] `src/services/engine/frame/passes/index.ts#CONTENT_LAYERS` → `CONTENT_PASSES`
- [ ] `src/@types/engine/frame/UpsampleLayerRow.d.ts#UpsampleLayerRow` → `UpsamplePassRow`
- [ ] `src/services/engine/frame/passes/createUpsampleLayer.ts#createUpsampleLayer` → `createUpsamplePass`
- [ ] `--dry` the manifest, then run it for real.
- [ ] `git status` must show three renames plus one test-mirror rename
      (`tests/services/engine/frame/passes/createUpsampleLayer.test.ts` →
      `createUpsamplePass.test.ts`). If `ContentPass.d.ts` did not appear, the `.d.ts`
      basename check failed — stop and report, do not `git mv`.
- [ ] Fix the one string-literal blind spot by hand:
      `tests/services/engine/phases/wireInput.test.ts:66`'s `vi.mock` factory returns
      `CONTENT_LAYERS`; the mocked module's _path_ is unchanged, its _export name_ is not.
- [ ] `npm run typecheck` green. Commit: `refactor(frame): ContentLayer → ContentPass, CONTENT_LAYERS → CONTENT_PASSES`.

**Reject if:** the commit contains any edit the CLI did not make, other than the
`vi.mock` export name; or `ContentLayer.d.ts` still exists.

## Task 3 — the 37 pass rows, their files and their test mirrors

**Files:** all 37 `src/services/engine/frame/passes/<x>Layer.ts` → `<x>Pass.ts`, the 29
surviving `tests/.../passes/<x>Layer.test.ts` mirrors, and every importer the CLI
repoints (the 37 re-export lines in `passes/index.ts` among them).

- [ ] Run the T1 manifest for real:
      `npm run refactor -- rename --manifest <scratch>/passRenames.json`
- [ ] `git status` → **37** source renames + **29** test-mirror renames (30 minus
      `createUpsampleLayer.test.ts`, already moved in T2). Files with extra exports —
      `earthPass.ts` (`prepareBodySurfaceFrame`), `orbitTrailsPass.ts`
      (`orbitReachByRegion`), `starCatalogPass.ts` (`starCatalogVisible`,
      `prepareStarCut`) — move whole; those extra symbols are **not** renamed.
      `tests/.../passes/prepareStarCut.test.ts` and `foregroundLabelsOcclusion.test.ts`
      are hand-named tests with no mirrored source basename and correctly stay put.
- [ ] `npm run typecheck` green. Commit: `refactor(frame): 37 *Layer pass files → *Pass`.

**Reject if:** any import path was hand-edited; any of the three multi-export files lost
or renamed a non-pass export; the source and mirror counts don't match the numbers above.

## Task 4 — the residue the CLI structurally cannot reach

The CLI renames symbols. Three classes of text it never touches are now half-renamed.
A half-rename left for (c) to finish is a second, drifting authority on what the thing
is called, so it is this PR's business.

**Files:** `src/@types/engine/frame/ExecuteFrameArgs.d.ts`, `.../PickProgram.d.ts`,
`.../RenderFrameInput.d.ts`, `.../RunFrameDeps.d.ts`, `.../FrameStep.d.ts`,
`.../Blend.d.ts`, `.../Slab.d.ts`, `src/@types/gpu/timing/TimingSlotName.d.ts`,
`src/@types/rendering/{LabelPickRenderer,ZoneOfAvoidanceRenderer}.d.ts`,
`src/@types/scene/AnchorPointBody.d.ts`, `src/@types/perf/SkymapPerfHook.ts`,
`src/@types/settings/EngineSettingsState.d.ts`,
`src/services/engine/frame/{executeFrame,frameProgram,pickProgram,renderFrame,slabs}.ts`,
`src/services/engine/frame/passes/index.ts`, `src/services/engine/engine.ts`,
`src/services/engine/phases/startLoop.ts`,
`src/services/engine/gpuHandles/gpuHandleRegistry.ts`,
`src/services/gpu/renderTargets.ts`,
`src/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer.ts`,
`src/data/sources/sgr-a-star.ts`,
`src/components/DebugPanel/GpuTimingsSection.tsx`, the 11 `.wesl` comment sites, and
the `tests/` files the greps below turn up.

1. **The `layers` field.** `layers: readonly ContentPass[]` now lies. Rename the field
   to `passes` at its declaration (`ExecuteFrameArgs.d.ts:49`), at `pickProgram.ts:116`'s
   inline deps type, and at every construction site (`renderFrame.ts:223`,
   `gpuHandleRegistry.ts:505`, the `tests/` fixtures). The CLI has no property-rename
   subcommand, so this is a hand edit — keep it to the field name and its destructured
   bindings. **Ruled in scope**; the alternative is shipping a half-rename that (c) is
   not obliged to finish.
2. **Local bindings** named `layer` / `layers` / `slabLayers` / `bodyLayer` / `makeLayer`
   / `fakeLayer` inside the five `frame/` files and their tests, where the binding holds
   a `ContentPass`. Single-letter `l` is fine as-is.
3. **Identifier text inside comments** — and only that. Rename `` `ContentLayer` ``,
   `` `CONTENT_LAYERS` ``, `` `<x>Layer.ts` ``, `` `createUpsampleLayer` ``,
   `` `UpsampleLayerRow` `` wherever they are quoted, in `.ts`, `.tsx` and `.wesl`.
   **Free prose "layer" / "layers" / "content-layer" stays** — including
   `passes/index.ts`'s draft-order header, which spec §5 relocates to `frameOrder.ts` in
   (c). Rewriting that prose now is churn (c) would immediately undo.

- [ ] Sweep: `rg -n "ContentLayer|CONTENT_LAYERS|UpsampleLayerRow|createUpsampleLayer" src tests` → empty.
- [ ] Sweep: `rg -n "[a-zA-Z]Layer\.ts|[a-zA-Z]Layer\b" src tests -g '!**/fadeLayers.ts'` →
      only the EXCLUDED vocabulary from Global Constraints remains. Read every hit; do
      not blanket-replace.
- [ ] Sweep: `rg -n "Layer" -g '*.wesl' src` → only `hiResLayerIdx` / `safeLayer`.
- [ ] `npm run typecheck` + `npm test` green. Commit: `refactor(frame): finish the ContentPass rename in fields, locals and comments`.

**Reject if:** a diff hunk touches `FadeLayer`, `FADE_LAYERS`, `LAYER_GROUPS`,
`VisibilityLayerKey`, `CategoryLabelLayer`, `labelLayer`, `hiResLayerIdx` or any
texture-array/Earth-tile "layer"; if free prose was rewritten wholesale; or if any edit
changes an expression rather than a name.

## Task 5 — living docs

**Files:** `docs/RENDERER.md` (the `starSpheresLayer.ts` / `fieldStarSphereLayer.ts`
citation at `:14`), `docs/superpowers/conventions/renderers.md` (`:119`, `:319`, `:324`,
`:410`), `.claude/skills/add-data-source/SKILL.md:142`, `docs/BACKLOG.md` (`:78`, `:79`,
`:152`) and the ~20 `docs/backlog/*.md` detail files that cite `ContentLayer` or a
`*Layer.ts` basename.

- [ ] Rename the identifiers only. Do not restructure an entry, do not add or delete a
      backlog line, do not update a `file:line` number — line numbers barely moved and
      chasing them turns a rename into a docs edit.
- [ ] `rg -n "ContentLayer|CONTENT_LAYERS|createUpsampleLayer" docs/RENDERER.md docs/BACKLOG.md docs/backlog docs/superpowers/conventions .claude/skills` → empty.
- [ ] `npx prettier --write` on the touched markdown. Commit: `docs: ContentLayer → ContentPass in living docs`.

**Reject if:** any file under `plans/completed/`, `specs/completed/`, `grill-sessions/`
or `research/` was touched; or a backlog line's content changed beyond the identifier.

## Task 6 — gate

- [ ] `npm run typecheck` (both projects) — green.
- [ ] `npm test` — green, and the **test count is unchanged** from `main`. A changed
      count means a test was renamed out of the suite or a mirror got orphaned.
- [ ] `npm run build` — green. This is the load-bearing one: it is the only check that
      links WESL, so it proves no `package::` specifier or `?static` path was disturbed
      by the 38 file moves.
- [ ] `git diff main --stat` — confirm the shape: ~38 renames + ~80 modified files, and
      **no** line in the diff that is neither an identifier, a filename, nor comment text
      containing one.
- [ ] Skipped on purpose, state it in the PR body: `npm run perf` (no executable
      statement changed) and the visual smoke pass (same draws, same order, same targets).

**Reject if:** the PR body claims a perf or visual result that was not run, or omits the
statement that both were deliberately skipped.

---

## Definition of Done

**Deliverable inventory**

- [ ] `src/@types/engine/frame/ContentPass.d.ts` exists; `ContentLayer.d.ts` does not.
- [ ] `src/services/engine/frame/passes/` contains **38** `*Pass.ts` files and **zero**
      `*Layer.ts` files; `tests/services/engine/frame/passes/` contains **30** matching
      `*Pass*.test.ts` mirrors and zero `*Layer*.test.ts`.
- [ ] `passes/index.ts` exports `CONTENT_PASSES` (37 rows, 37 re-exports, same order).
- [ ] `rg -n "ContentLayer|CONTENT_LAYERS|UpsampleLayerRow|createUpsampleLayer" src tests docs/RENDERER.md docs/BACKLOG.md docs/backlog docs/superpowers/conventions .claude/skills` → empty.
- [ ] The EXCLUDED identifiers of Global Constraints are byte-identical to `main`.
- [ ] The diff contains no expression change — every hunk is a name or a filename.

**The deferral boundary** — nothing else. No field is deleted, no signature narrowed, no
`FRAME_ORDER` authored, no Layer formed.

## Not in this PR

- **(b) Boot de-coupling** (spec §9(b)): `wireSlots.ts:97-101`, `wireInput.ts:68-69`,
  `startLoop.ts:88-97`, and the Earth home moving to `EngineComposition.home`.
- **(c) The contract PR** (spec §9(c)) carries **both halves of §4.1's contract change**:
  deleting `target` / `slab` / `skyCapture` / `hdrPostLensing` from the pass row, and
  narrowing `enabled` / `draw` / `pickEnabled` / `drawPick` to `CoreFrameState`. It also
  authors `FRAME_ORDER`, rebuilds the settings root, absorbs `passes/index.ts`'s
  draw-order header into `frameOrder.ts`, and subsumes
  `tests/services/engine/frame/targetParity.test.ts`. It is the PR that needs a paired
  `npm run perf`, because of the `(hdr, NEAR0)` step-merge rule — this one does not.
