# Ledger — 2026-09-16-layer-composition-05a-filaments-layer

Plan: `docs/superpowers/plans/2026-09-16-layer-composition-05a-filaments-layer.md`
Worktree: `.claude/worktrees/layer-composition-05a-filaments` · Branch: `worktree-layer-composition-05a-filaments`
Base: main @ `883e90a36` (which is #737, the fade-on-arrival prep) · PR: not yet opened

## Start-of-run answers (2026-09-16)

- **Parallelism:** SERIAL — 05a alone. 05b (`flow`) would touch the same six core
  files (`app.ts`, `appSettingsFragments.ts`, `sources.ts`, `assetWiring.ts`,
  `fadeLayers.ts`, `frame/passes/index.ts`) and conflict on every one.
- **Perf gate:** NO. Nothing per-frame changes — the pass keeps its `FRAME_ORDER`
  slot and its draw body; only its file location and how it reaches the renderer move.

## Standing rulings this run inherits

- User ruling 2026-09-16: small Layers before `starCatalog`; `filaments` and `flow`
  in SEPARATE PRs ("easier to check"); `flow` (05b) carries the `computes` contract
  extension; `zoneOfAvoidance` is 05c.
- User ruling 2026-09-16: **no imperative fade drives from a slot or a Layer.** #737
  made the arrival fade core's edge. This Layer's `create` wires NO fade — plan Task 2
  says so explicitly, and `LayerCoreDeps` no longer carries a fade registry to reach for.
- Standing: skip `deletion-audit` on prep PRs. 05a is a FEATURE PR, so the audit DOES
  run at its `/feature-done`.

## Dispatches

| # | Tasks | Model | Status | HEAD |
|---|---|---|---|---|
| D1 | Task 1 — relocate the six modules via `move-files` | Sonnet | dispatched | — |
| D2 | Tasks 2–3 — Runtime/create/destroy, then pass/assets/fades | Opus (`review: yes`) | queued | — |
| D3 | Tasks 4–5 — form + compose the Layer, then delete what core no longer holds | Opus (`review: yes`) | queued | — |

Grouping rationale: Task 1 is a mechanical move whose gate is "typecheck + suite still
green" — Sonnet, own dispatch, so a bad move is caught before anything is rewired.
Tasks 2+3 share one mental model (bind the Layer's contributions to the Runtime).
Tasks 4+5 share another (compose it, then delete the core rows it replaced) and must
not be split — a formed Layer with core's rows still present throws on the duplicate
pass name at boot. Four of the five tasks are `review: yes`, so D2 and D3 get Opus and
both are covered by the one whole-branch review.

## Review

One whole-branch review after D3. Mandate: spec fidelity + slop. One fix round, no
re-review. Then `npm run build` (the WESL gate `typecheck` cannot give), CI, then
`/feature-done` — which for this FEATURE PR includes the deletion audit.

## Log

- 2026-09-16 — worktree created off `883e90a36`, `public/data` symlinked to main's
  (15 entries), `/public/data` added to the worktree's `info/exclude`.

## In flight

- **D1** (Sonnet, dispatched 2026-09-16): plan Task 1 only — the six `move-files`
  relocations + their test mirrors. Briefed that behaviour is UNCHANGED at this commit
  (renderer still built by `gpuHandleRegistry`, pass still in `CONTENT_PASSES`, slot
  still reads `state.gpu.filamentRenderer`) and that Tasks 2–5 are not its work.
  Briefed on the three landmines: `move-files` misses string-literal paths and `.wesl`
  `package::` specifiers; `?static` shader specifiers are invisible to `tsc` so a
  dangling one only fails at `npm run build`; the shaders themselves do NOT move.
  Will push the branch itself (no upstream yet).
  **Handling when it reports:** controller opens the DRAFT PR (it cannot exist before
  the first commit — `gh pr create` refuses with no diff from base), then dispatches D2.

## Queued after this PR

1. **05b — `flow`**, carrying the `computes?(runtime)` contract extension:
   `encodeFlowCompute` is dispatched through the `COMPUTE` name→fn table at
   `executeFrame.ts:111-127` and `Layer` has no member for a compute step.
2. **05c — `zoneOfAvoidance`**, first Layer to own a render target (`zoa`,
   `renderTargets.ts:214`) plus an upsample row; `Layer.targets` already carries it.
3. Then the rest of (e): `structure`, `volume`, `body`, `constellations`, `milkyWay`
   (blocked on spec §6.3's band PR), and finally `starCatalog`, deferred to last by
   the user because it carries the god-layer split.
4. Also still open from (d): the DEFERRED `galaxiesOnly` reference engine, which
   becomes expressible once a second Layer exists — i.e. after this PR — but is
   explicitly out of scope here.

## D1 — DONE (Task 1)

HEAD `89fd0870d`, pushed. typecheck clean, 8540/8540 green.

Six modules relocated via `move-files --manifest` into
`src/layers/filaments/{render,passes,load,sources}/`; test mirrors rode along.

Controller verified the three briefed landmines independently (not taken on report):
- `?static` shader imports: `move-files` left them pointing at a nonexistent
  `src/layers/shaders/filaments/...` (the query suffix defeats its resolution);
  D1 repointed them to `../../../services/gpu/shaders/filaments/` — both files
  confirmed present.
- Shaders did NOT move: `src/services/gpu/shaders/filaments/{vertex,fragment,io}.wesl`
  still in place.
- No lingering old-path string literals. D1 hand-fixed two `vi.mock()` paths
  (`wireSlots.test.ts`, `initGpu.hdrCapabilityWiring.test.ts`). The one remaining
  `frame/passes/filamentsPass` hit is the dormant `frameFilePurity` row the plan
  explicitly assigns to Task 5.
- `settings/filamentsSettings.ts` was already in the Layer since (c) (#690) —
  not a stray Task 1 move.

Ratchet maintenance D1 did (data-table rows, not new tests):
- `layerImportBoundary.test.ts`: three temporary ALLOWED rows (gpuHandleRegistry,
  assetWiring, frame/passes/index — each budget 1), commented as Task 1's
  relocation-only state that Tasks 2–5 remove.
- `frameFilePurity.test.ts`: new row for `layers/filaments/passes/filamentsPass: 3`
  alongside the old dormant row, left for Task 5 per the plan.

## PR

**#739 DRAFT** — https://github.com/rulkens/skymap/pull/739
`refactor(layers): the filaments Layer (05a)`, base `main`.

## D2 — IN FLIGHT (Tasks 2–3), Opus

Tasks 2 (`FilamentsRuntime` + `create`/`destroy`) and 3 (pass / assets / fades off
the runtime), one commit each, push to existing upstream.

Briefed: read plan lines 1–138 only; `src/layers/galaxyCatalog/` is the reference
pattern (do not invent a second); Task 1's state is correct and nothing is deleted
until Task 5; comment budget; no `interface`; types in the Layer's `types/`;
pass-file purity; `?static` needs `npm run build` not `typecheck`; core owns the
fade arrival edge so `create` must not drive a fade — `filamentsFadeRows` only
declares; `layerImportBoundary` is shrink-only — if a budget must GROW, stop and
report rather than widen.

**Handling when it reports:** controller re-verifies the contract claims by grep
(not on report), then dispatches D3 (Opus, Tasks 4–5). Tasks 4 and 5 stay in ONE
dispatch: a formed Layer with core's pass row still present throws at boot on the
duplicate pass name (`createLayers.ts:120-131`).

## USER DIRECTIVE 2026-09-16 — re-ordered queue

After 05a lands, the NEXT unit is **not** 05b. The user wants a Layer-folder
structure cleanup first: conform BOTH shipped Layers (`galaxyCatalog`, `filaments`)
to one high-quality modular structure, and write the convention down so the
remaining 8 Layers reuse it. Goal in the user's words: "well organized, scannable,
clear locations and conventions for where to put what."

Sequencing rationale (agreed): doing it after the 2nd Layer and before the other 8
is the cheapest point — every later Layer would otherwise bake in the drift.

Revised queue: 05a → **layer-structure cleanup** → 05b (`flow` + `computes?`) →
05c (`zoneOfAvoidance`) → structure/volume/body/constellations/milkyWay →
starCatalog LAST. Still open from (d): the deferred `galaxiesOnly` reference engine.

Ground facts gathered for that cleanup (read-only, 2026-09-16):
- `src/layers/` has 10 folders; 8 are settings-only stubs from (c).
- `galaxyCatalog` = 62 files over `load/ passes/ present/ render/ sagas/ settings/
  sources/ subsystems/ types/ ui/` + root `create.ts destroy.ts frame.ts layer.ts`.
- `filaments` = 12 files, no `subsystems/`, no `sagas/`, no `ui/`, no `frame.ts`.
- The written convention is ONE line: `CLAUDE.md:16` (+ the types clause at
  `CLAUDE.md:33`). It lists `sources/ settings/ load/ render/ passes/ present/
  sagas/ ui/ types/` — it does NOT mention `subsystems/` or the root-level
  contract files, both of which the shipped reference uses. There is no
  `docs/superpowers/conventions/` doc for Layers.
- Known fuzzy boundary to adjudicate: `subsystems/` vs `render/`
  (`proceduralDiskSubsystem.ts` vs `proceduralDiskRenderer.ts`), and `load/`
  currently mixes fetchers+slots, `wire*.ts` wiring fns, and the asset-row
  declaration.

Starts with brainstorming (per CLAUDE.md), lands as its own PR.

## RULING 2026-09-16 — uniform Layer structure, declarative resources

User, verbatim: "its ok if it makes small layers worse. I'd rather have a well
defined structure that is repeated everywhere."

**Settles:** the flat-vs-nested question is closed in favour of ONE mandated
structure applied to every Layer regardless of size. No size thresholds, no
"flat for small Layers" carve-out. `FilamentsRuntime` (2 resources) takes the
same shape as `GalaxyCatalogRuntime` (15). Extra ceremony on small Layers is
accepted cost, explicitly.

**Also directed:** a Layer gets an opinionated, DECLARATIVE way to manage
resources by type (subsystems, asset slots, renderers, passes) — "as much code
as data". Intent: resources declared as a table (`build` / `dispose` / `needs`),
`create` becomes a generic walk, `destroy` becomes reverse-topological order
DERIVED rather than hand-maintained, and the Runtime type is derived from the
table so grouping falls out of the declaration.

Evidence this is worth doing: `create.ts` and `destroy.ts` encode the same
dependency knowledge twice by hand today, and nothing checks them against each
other — see the teardown comment in `src/layers/galaxyCatalog/destroy.ts:10-13`
(texturedDisks before galaxyAtlas; hi-res planner before its texture).

**NOT settled by this ruling — three open design questions, all orthogonal to
Layer size:**
1. Passes are not resources. `passes`/`fades`/`labels`/`selection` are pure
   functions of the runtime with no lifecycle and are already declarative.
   The table should cover OWNED things only (renderers, subsystems, slots).
2. `destroy` reaches things the table cannot name: galaxyCatalog destroys
   `hiResFamous.committed()?.value.subsystem` and `.texture` — resources owned
   by a slot's PAYLOAD, not declared. Needs schema support or a named escape
   hatch. This is an un-braid/STOP signal per the conventions, not something to
   paper over.
3. `create` does more than construct — private cells (`famousMeta` getter,
   `catalogsVersion` counter) and cross-resource wiring
   (`wireImpostorSubsystems`). Needs a declared "after all built, wire" phase or
   ordering bugs hide inside builders.

**Risk to watch:** the derived Runtime type. Inferring it from a const table is
feasible (`defineLayer`/`FactsOf` already do const-inference) but a mapped type
that silently degrades to `any` costs more than it saves.

**Validation order:** design against `galaxyCatalog` FIRST, not filaments. Two
resources prove nothing; fifteen with a load-bearing teardown order is the test.
If the schema cannot express that teardown without an escape hatch, that is the
answer.

**Plan:** brainstorm once D3 lands → refactor-ground → spec → plan → own PR,
before 05b.

## D3 — STALLED at the gates; controller finished Task 5

D3 (Opus, Tasks 4–5) committed Task 4 (`771b6ddfb`) then **failed with a stream
watchdog stall** after its last line, "Now the final gates." Its Task 5 edits were
complete in the working tree but uncommitted and ungated.

Controller verified the deletions itself, ran the three gates, formatted, staged by
path and committed as `6ba96275d`. All five tasks now pushed.

Verified deletions (by grep, not on report):
- `layerImportBoundary.test.ts` — BOTH Task-1 allowances (`gpuHandleRegistry`,
  `assetWiring`) reach zero and are DELETED; no filaments rows remain.
- `frameFilePurity.test.ts` — dormant `frame/passes/filamentsPass` row gone; only
  `layers/filaments/passes/filamentsPass: 3` remains.
- No core file references filaments. The three surviving `assetWiring.ts` hits
  (lines 252/258/262) are unrelated comments about OTHER slots sharing its
  priority rung.

D3 also touched 4 files beyond its brief — `EngineData.d.ts`,
`createEngineData.ts`, `wireSlots.ts`, `slotFor.ts` — the cascade from removing the
filaments field off `EngineAssetSlots`. Legitimate; flagged for the review.

**Gates (controller-run):** `npm run typecheck` clean · `npm test` 8571/8571
passing, 1263 files (baseline 8559 at Task 4; +12 from the new
`filamentsAssetRows` test) · `npm run build` clean.

## Commits on the branch

- `89fd0870d` T1 relocate · `09b0e331a` T2 Runtime/create/destroy
- `4cb6b9f5d` docs: `src/layers/README.md` (Layer folder convention)
- `9de7f5052` T3 pass/assets/fades · `771b6ddfb` T4 form + compose
- `04d52f78d` docs: TSDoc every `Layer.d.ts` member + its call site
- `6ba96275d` T5 delete what core no longer holds

## Ruling 2026-09-16 — comment budget exception

User: "thats ok for the Layer.d file, we make an exception. its such an important
entry point." `src/@types/engine/layer/Layer.d.ts` is EXEMPT from the
comment-lines ≤ half-code-lines ratio (now 36/41). The ≤5-line module header rule
still applies and the header was trimmed from 6 to 5 to comply.
Proposed but NOT ruled: extending the exemption to all of `src/@types/**`.

## Findings for the review / cleanup

- `Layer.sources` is typing only — `src/data/sources.ts` folds the same rows into
  `SOURCE_REGISTRY` by direct import. A Layer declaring `sources` and stopping
  there gets NO registry entry. Asymmetric with every other contract member.
- `Layer.targets` has NO declared user anywhere. Deletion candidate.

## NEXT

1. Whole-branch review (Opus) — dispatched.
2. CI as the gate (check main hasn't moved; merge main in if it has).
3. `/feature-done` — this is a FEATURE PR, so the deletion audit DOES run.
4. Manual smoke pass: the 6 named behaviours in the plan's DoD.
5. Un-draft + squash-merge via
   `gh api -X PUT repos/rulkens/skymap/pulls/739/merge -f merge_method=squash`.

## Whole-branch review — DONE, fixes landed `702259dc4`

Verdict: composition CORRECT. Frame order genuinely unchanged, fade row identical,
destroy path intact, no coverage lost in the relocations, the 4 out-of-plan files
are comment-only cascade with nothing riding along. Every finding was a comment, a
leftover, or dead contract surface — no behavioural bug.

Fixed (all controller-verified against source before acting, not taken on report):
1. `filamentSlot.ts` header asserted `state.assetSlots` + `wireSlots`; a Layer's
   slot lands in `state.layerSlots` via `createLayers`. Header 7 lines → 4.
2. `Layer.d.ts` `sagas` TSDoc claimed `rootSaga`'s `all([…])`. WRONG — and it was
   the controller's own prose from `04d52f78d`. `createLayers.ts:103` calls
   `deps.cb.runSaga(sagaFactory)` = `sagaMiddleware.run`, an independent root task
   pushed to `layerSagaTasks` and cancelled at teardown.
3. `frameFilePurity` comment said "four tuning constants"; `filamentsPass` declares
   THREE. The plan says four too — the plan is wrong.
4. Seven fixtures carried dead `state.gpu.filamentRenderer` keys, invisible to tsc
   behind `as unknown as EngineState`; two had comments teaching a guard that no
   longer exists. Also removed the now-inert `createFilamentRenderer` vi.mock in
   `initGpu.hdrCapabilityWiring.test.ts`.
5. `docs/science.md:91` linked the pre-Task-1 renderer path. Task 1's grep swept
   `src/` and `tests/` but not `docs/`.
6. Two headers echoed `galaxyCatalog` verbatim (`filamentsLayerSettings` 6 lines
   over a 1-line export; `filamentsFadeRows` diff-narration) — now point at the
   one home / state the contract timelessly.
Housekeeping: removed the two empty dirs `move-files` left
(`src/services/gpu/renderers/filaments/`, `tests/.../renderers/filaments/`).

Gates after fixes: typecheck clean, 8571/8571 passing.

### NOT a finding — review verified these
`expandFrameOrder` resolve is by `find` over `state.passes`; `frameOrder.ts:102`
`'filaments'` untouched, exactly one pass answers. `installLoadProgress` folds
`state.layerSlots` into `allSlots` and runs BEFORE `installFadeOnArrival` in
`wireSlots`, so the subscription lands. All relocated test cases reappear.

### OPEN — needs user ruling before landing
- **#7 `Layer.targets` is dead surface.** Stronger than "no declared user":
  NOTHING reads it. `instantiateLayer` never touches `layer.targets` and its
  `LayerInstance` has no `targets`; `createLayers` never touches it. But this
  branch's new prose (`Layer.d.ts:42`, `src/layers/README.md` table) says "nothing
  *declares* one yet", implying declaring would work. 05c (`zoneOfAvoidance`) is
  the first Layer that would try. Options: delete the member (returns with 05c
  when it gets a consumer) vs re-word to "declared but not yet consumed".
- **#8 `Layer.sources` has no guard.** Nothing reads it at runtime;
  `src/data/sources.ts:105` folds the rows in by direct import, so the `sources:`
  line in `layer.ts` is inert. Asymmetric with `settings`, which IS guarded by
  `tests/compositions/appSettingsFragments.test.ts` (identity assert). Options:
  add the same ~5-line identity test for sources vs accept as-is.

### Notes, no action
- The `frameFilePurity` ratchet did NOT shrink: the row was RELABELLED
  (`frame/passes/filamentsPass: 3` → `layers/filaments/passes/filamentsPass: 3`),
  total allowed debt unchanged. The sweep derives `src/layers/*/passes/`, so the
  relabel was mandatory. The plan's "ratchet shrinks" line is unmet as written.
- Two commits fall outside the plan: `4cb6b9f5d` (README) and `04d52f78d` (TSDoc).
  Both findings #2 and #7 live in the TSDoc commit — adding prose to a type file
  is where this branch's only wrong statements landed.

## User rulings 2026-09-16 (review items #7/#8) — LANDED `58de64ff2`

- **#7 `Layer.targets`**: user chose RE-WORD, not delete. Member stays; both
  `Layer.d.ts` and the README table now say "DECLARED BUT NOT CONSUMED — nothing
  reads this yet; 05c wires it."
- **#8 `Layer.sources`**: user chose ADD THE IDENTITY TEST.
  `tests/compositions/sourceRegistryCoverage.test.ts` mirrors
  `appSettingsFragments.test.ts`, asserting by identity (not presence, so a
  hand-copied duplicate fails) with the same vacuity guard. Hit the same
  `flatMap<U>` inference trap that test documents — `U` pinned explicitly.
  **Mutation-verified**: breaking identity in `data/sources.ts` fails the
  assertion (`Object.is`), then reverted clean. NOTE: the first mutation attempt
  (deleting the spread outright) was INCONCLUSIVE — the module failed to load and
  the test never collected. That bug fails loudly anyway; the guard's value is
  the quieter identity case.

## main merged in — `907a27e05`

main had moved 3 commits: #738 terrain F4 prep, #740 trackpad pinch zoom,
#742 CORS purge. **9 files overlapped** (`docs/science.md`, `EngineGpuHandles.d.ts`,
`engine.ts`, `frame/passes/index.ts`, `gpuHandleRegistry.ts`, `assetWiring.ts`,
`slotFor.ts`, `initGpu.hdrCapabilityWiring.test.ts`, `assetWiring.test.ts`) —
#738 was ADDING rows to the same tables this branch DELETES a row from.

Auto-merged with zero conflicts. Controller verified semantically, not just
structurally: grepped that no `filamentRenderer` / `createFilamentSlot` reference
came back from main's side. Clean.

Gates after merge: typecheck clean · **8591/8591 passing, 1269 files** (was 8572;
+19 from main) · `npm run build` clean.

LANDMINE (recurring): after this merge the editor shows stale cannot-find-module
diagnostics on `assetWiring.ts`, `gpuHandleRegistry.ts`, `passes/index.ts` naming
main's PRE-rename paths (`utils/scene/hostBodyId`, `earthSurfaceTilesPass`). #738
renamed those. `tsc` is clean — ignore the editor.

CI running on `907a27e05` at the time of writing.

## CI failure + fix — `9829e3bd1`

First CI run on the merge commit FAILED where local was green.

Cause: `tests/services/engine/frame/frameFilePurity.test.ts` discovered Layer
`passes/` dirs by mapping EVERY entry of `src/layers/` to `<name>/passes` and
statting it. `statSync(dir, { throwIfNoEntry: false })` suppresses **ENOENT, not
ENOTDIR** — so `stat('README.md/passes/')` THREW on Linux while macOS returned
ENOENT and swallowed it. The `src/layers/README.md` added on this branch
(`4cb6b9f5d`) was the first non-directory ever placed there.

**Latent since the sweep was written** — any non-directory in `src/layers/` would
have done it. Fix: filter to directories at `readdir` (`withFileTypes: true`)
instead of discovering the type by statting through the path.

Mutation-verified, not trusted green: tightening the `filamentsPass` budget 3→2
still fails naming the three real constants, so the directory filter has NOT
silently stopped reaching Layer passes. (Worth checking — the test's vacuity guard
is per-swept-dir, so a filter dropping ALL Layers would have passed quietly.)

`tests/conventions/layerImportBoundary.test.ts` checked for the same assumption:
SAFE, it hands a glob to the ts-morph project parser, which ignores a `.md`.

LANDMINE for the record: a macOS-green / Linux-red split on `fs` error codes.
`throwIfNoEntry` covers ENOENT only.

## STATE AT COMPACTION

Branch `worktree-layer-composition-05a-filaments`, HEAD **`9829e3bd1`**, tree
CLEAN, pushed, up to date with `origin/main`. PR **#739 still DRAFT**.
No background agents in flight — D1/D2 done, D3 died at the gates (controller
finished Task 5), review done and its fixes landed.

Local gates all green at HEAD: typecheck clean · 8591/8591 tests, 1269 files ·
`npm run build` clean.

**CI RUNNING** on `9829e3bd1`:
https://github.com/rulkens/skymap/actions/runs/35161063954 — must be read as the
gate before anything else. Previous run 35160607907 failed (the ENOTDIR bug above).

## NEXT ACTIONS, in order

1. **Read CI** on `9829e3bd1`. Green → continue; red → fix before proceeding.
2. **`/feature-done`** with
   `docs/superpowers/plans/2026-09-16-layer-composition-05a-filaments-layer.md`.
   This is a FEATURE PR — the **deletion audit DOES run** (the prep-PR exemption
   does NOT apply). Ledger archives to
   `docs/superpowers/plans/completed/<plan-basename>.ledger.md`.
   Two PLAN errors the audit will surface — plan is wrong, implementation is right:
   - plan says `filamentsPass` has "four" tuning constants; it has THREE.
   - plan's Modified table says the `frameFilePurity` ratchet shrinks; it did NOT.
     The row was RELABELLED `frame/passes/filamentsPass: 3` →
     `layers/filaments/passes/filamentsPass: 3`, same budget. Mandatory, since the
     sweep derives `src/layers/*/passes/`.
   Also expect: 2 commits outside plan scope (`4cb6b9f5d` README, `04d52f78d`
   TSDoc) — both user-requested mid-flight.
3. **Diff breakdown** (once per PR at landing): compact code/comment/test/doc
   line-diff table. Script at
   `/private/tmp/claude-501/-Users-rulkens-Development-js-skymap/2906d35a-702e-4713-b0e6-91ab6b5c352c/scratchpad/breakdown.py`
   (needs `numstat.txt` + `srcpatch.txt` written beside it first).
4. **USER's manual smoke pass** — the 6 named behaviours in the plan's DoD.
   Controller CANNOT do this; must be attested by the user.
5. Un-draft, then squash-merge — **NEVER `gh pr merge` from a worktree**:
   `gh api -X PUT repos/rulkens/skymap/pulls/739/merge -f merge_method=squash`
6. `/wt-close`, then update memory `project_layer_composition.md`.

Then the queued sequence (see "USER DIRECTIVE 2026-09-16 — re-ordered queue"
above): **Layer-structure cleanup FIRST** (brainstorm → refactor-ground → spec →
plan → own PR), THEN 05b `flow` (+`computes?`), 05c `zoneOfAvoidance`, then
structure/volume/body/constellations/milkyWay, `starCatalog` LAST.

## Post-CI-fix work (user-directed) — HEAD now `73d3592ee`

- `9ac65c766` **dev log + pass constants.** User: "we can remove the console.log in
  filamentSlot.ts". The `ready` subscriber existed ONLY to log parsed counts, so the
  whole `slot.subscribe` block went with it; header now "builds and returns".
  User: "filamentsPass.ts has a couple of constant colours, should move to the right
  location." Moved all THREE tuning constants to `src/data/filament/`, one symbol per
  file (`filamentLineHalfwidthPx.ts`, `filamentBaseTint.ts`, `filamentHotTint.ts`).
  **Chose `src/data/filament/` over a Layer-local folder** because `galaxyCatalog` is
  a formed Layer whose constants likewise live under `src/data/galaxyCatalog/`, the
  folder already existed, and it matches the ratchet's own error text.
  **CONSEQUENCE: the `frameFilePurity` ALLOWED row reaches 0 and is DELETED** — the
  ratchet genuinely shrinks now, closing the plan line the review flagged as unmet
  (Task 1 had only relabelled the row at the same budget of 3).
- `73d3592ee` **pointer fix.** The earlier trim of `filamentsLayerSettings`'s header
  pointed at `appSettingsFragments`, which points ONWARD to
  `galaxyCatalogLayerSettings` where the explanation actually lives. Now direct.

Gates at `9ac65c766`: typecheck clean · 8591/8591 · build clean.

## ANSWERED 2026-09-16 — why settingsSlice still names each Layer's settings

User asked why `settingsSlice.ts` imports `filamentsLayerSettings` /
`galaxyCatalogLayerSettings` instead of iterating `APP_COMPOSITION.layers`.
NOT laziness — iterating is impossible at the TYPE level, two distinct reasons:

1. **`settingsSlice` needs the tuple's literal element types.** It destructures
   (`const [a, b, c] = galaxyCatalogLayerSettings`) because `liftClusterReducers`
   uses each element's literal type to name the lifted reducer keys. A loop or
   `flatMap` collapses a tuple of unlike Layer types to a union and the reducer keys
   widen to `string` — every typed action creator lost. (Same inference trap as the
   `flatMap<U>` pin in `sourceRegistryCoverage.test.ts`.)
2. **`appSettingsFragments` cannot read `APP_COMPOSITION` at all.** Doing so makes
   the settings ROOT type depend on the Layer type, which depends via
   `ContentPass` → `PassState` on that same root — a circular alias `tsc` refuses
   and **tsgo does NOT see** (so `typecheck:fast` would let it through).

Runtime could iterate; types can't. Guarded by `tests/compositions/appSettingsFragments.test.ts`
(identity assert), which is the guard `sources` lacked until this branch added one.

**For the cleanup:** same root problem as the declarative resource table — deriving
precise types from a composed collection. Likely fix is CUTTING the
`ContentPass` → `PassState` → settings-root cycle. Cost scales with the 8 Layers
still to come (2 hand-wired imports each), not a one-off.

## STATE

HEAD `73d3592ee`, tree CLEAN, pushed. PR #739 still DRAFT. No agents in flight.
**Dev server RUNNING** on http://localhost:5173/ (background task `bl44aee21`) for
the user's visual smoke — do NOT kill it; `/wt-close` stops it at the end.
CI running on `73d3592ee`: https://github.com/rulkens/skymap/actions/runs/35161983205

NEXT ACTIONS unchanged — see "NEXT ACTIONS, in order" above (read CI →
`/feature-done` WITH deletion audit → diff breakdown → USER smoke pass →
`gh api` squash-merge → `/wt-close` → memory).
NOTE for `/feature-done`: the "ratchet shrinks" plan line is NOW MET (see
`9ac65c766`); the "four tuning constants" plan error still stands (it is three).
