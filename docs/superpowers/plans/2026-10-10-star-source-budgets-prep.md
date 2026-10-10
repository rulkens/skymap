# Star source budgets: ground preparation P2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The survey star source row states one budget per tier, `budgets: Record<Tier, { drawBudget }>`, in place of the `tiered` flag and the single `drawBudget`. Behaviour-neutral: all three tiers carry today's 1 500 000, the same `stars-<tier>.bin` files load, and the cut draws the same instances.

**Architecture:**

- New type `StarSourceBudgets` (its own `@types/` file). `SurveyStarCatalogSourceEntry` carries `budgets: StarSourceBudgets` and loses `tiered` and `drawBudget`.
- A survey star catalog is always tiered: having `budgets` is what makes a row a survey row that ships per-tier files. The fetcher always names `${binBaseName}-${tier}.bin`; the untiered branch and the comments explaining it are deleted.
- The cut reads `budgets[tier].drawBudget`, where `tier` is the tier of the request the source's slot last committed. During a tier reload the old catalog keeps drawing, so its budget is the one it was loaded at, not the newly requested one.
- The cut uniform's `budgetTypical` becomes `drawBudget` end to end (TS and WGSL), so no name refers to the removed `typical` field.

**Tech stack:** TS, Vitest, WESL.

**Spec:** [`docs/superpowers/specs/2026-10-10-chunked-star-octree-design.md`](../specs/2026-10-10-chunked-star-octree-design.md), §5.4 and §8.3 (P2).

## Global constraints

- Behaviour-neutral. No existing test changes its expected values. Tests whose stubs or field names change, change shape only.
- The cosmic-web-density rows keep their own `tiered` field (`CosmicWebDensitySourceEntry.d.ts:30`, read at `cosmicWebDensityAssetRows.ts:29`). That is a different entry type; do not touch it.
- The five `binBaseName !== null` survey tests stay as they are: `starCatalogFetcher.ts:58`, `starSourcesInBand.ts:23`, `starSourceDrawOpacity.ts:19`, `create.ts:77`, `starCatalogAssetRows.ts:16`.
- No `slots` field, no `format`, no `columns`: the octree feature adds those.
- `type` aliases, never `interface`. One type per `@types/` file, filename = symbol. No barrels.
- Comments explain why, never what: module header ≤ 10 lines, comment lines ≤ half the code lines. When a task changes what a comment describes, rewrite it; do not narrate the refactor.
- Each task is its own commit. Format with `npx prettier --write <files>`, never `npm run format`. Stage files by path, never `git add -A`. No `Co-Authored-By` lines.
- Load the `wesl-shaders` skill and read `docs/RENDERER.md` before Task 2.

## Review focus

1. **Committed tier, not requested tier (Task 1).** The cut's tier comes from the slot's `committed()` request. `lastRequest()` and `PassState.tier` are already the new tier while a reload is in flight; reading either gives the still-drawing old catalog the wrong budget once the tiers' budgets differ.
2. **Same file name (Task 1).** The fetched URL is `star-catalog/…/stars-<tier>.bin` for every tier, exactly as before.
3. **Uniform word unchanged (Task 2).** The renamed `drawBudget` field stays at u32 word 9 (byte 36) of `CutUniforms`; the parity test and the reference cut read it there.

---

### Task 1: `budgets` replaces `tiered` and `drawBudget`

**Files:** `src/@types/data/starCatalog/StarSourceBudgets.d.ts` (new), `src/@types/data/starCatalog/SurveyStarCatalogSourceEntry.d.ts`, `src/layers/starCatalog/sources/gaia-stars.ts`, `src/layers/starCatalog/load/starCatalogFetcher.ts`, `src/@types/loading/StarCatalogReq.d.ts`, `src/layers/starCatalog/render/cut/starCutInputs.ts`, `tests/layers/starCatalog/render/cut/starCutInputs.test.ts`, `docs/BACKLOG.md`

**Contract:**

```ts
// src/@types/data/starCatalog/StarSourceBudgets.d.ts
export type StarSourceBudgets = { readonly [T in Tier]: { readonly drawBudget: number } };

// SurveyStarCatalogSourceEntry: replaces `tiered` (:20-21) and `drawBudget` (:22-23)
readonly budgets: StarSourceBudgets;
```

`drawBudget` today has only `typical` (`SurveyStarCatalogSourceEntry.d.ts:23`), so the per-tier object has only `drawBudget`.

- [x] Add `StarSourceBudgets`. Its doc line says what the per-tier object governs (the cut's instance budget) and that `slots` joins it with the octree pool.
- [x] `SurveyStarCatalogSourceEntry.d.ts:20-23`: replace both fields with `budgets`.
- [x] `gaia-stars.ts:29-36`: delete `tiered: true` and `drawBudget`; add `budgets` with `small`, `medium` and `large` each `{ drawBudget: 1_500_000 }`. Keep the rationale comment at `:30-35` above `budgets`, reworded for a per-tier row. Drop its stale "Task 12 tunes both" sentence.
- [x] `starCatalogFetcher.ts`: delete the "Filename: tiered vs untiered" header block (`:12-19`), the re-bind and its comment (`:61-70`), and the ternary (`:71-73`). The name is `${entry.binBaseName}-${req.tier}.bin` on the guard-narrowed `entry`. Drop the `SurveyStarCatalogSourceEntry` import if unused. Rewrite the type-guard paragraph (`:28-36`) so it no longer names `tiered`.
- [x] `StarCatalogReq.d.ts:8-9`: `tier` always selects the `-<tier>.bin` variant; drop "when the source ships tiered".
- [x] `starCutInputs.ts`: widen the runtime parameter to `Pick<StarCatalogRuntime, 'renderer' | 'catalogs'>` (`:28`). Per in-band source, read the tier from `runtime.catalogs.get(source)?.committed()?.req.tier` and pass `entry.budgets[tier].drawBudget` where `:63` passes `entry.drawBudget.typical`. A source with no committed request is skipped: the renderer holds a catalog only after its slot commits, so this never drops a source across a frame. Leave the field name `budgetTypical` here; Task 2 renames it.
- [x] `starCutInputs.test.ts:19-25`: add a `catalogs` map to the stub runtime, its slot's `committed()` returning a request at `'medium'`. The two existing tests keep their expected values.
- [x] Add the test `the cut reads the budget of the tier its catalog was committed at`. Mock the Gaia row's `budgets` to three distinct values (`vi.mock` of `src/layers/starCatalog/sources/gaia-stars.ts` with `importOriginal`, overriding only `budgets`). The stub slot's `committed()` returns `'small'` and its `lastRequest()` returns `'large'`; assert the source row carries `small`'s value. It fails if the cut reads the in-flight request or a fixed tier.
- [x] `docs/BACKLOG.md:168`: the item names a `hardCap` that does not exist. Reword it to lowering `budgets.small.drawBudget` in `gaia-stars.ts`; keep its tag and the WebKit clause.
- [x] No new fetcher test: `starCatalogFetcher.test.ts:55-76` already asserts `stars-medium.bin`, and the untiered branch had no test.
- [x] Commit.

### Task 2: Rename the cut uniform `budgetTypical` to `drawBudget` — `review: yes`

**Files:** `src/layers/starCatalog/@types/StarCutSourceInput.d.ts`, `src/layers/starCatalog/render/starCutLayout.ts`, `src/layers/starCatalog/render/starCutGpu.ts`, `src/layers/starCatalog/render/cut/starCutInputs.ts`, `src/services/gpu/shaders/starCatalog/cutIo.wesl`, `src/services/gpu/shaders/starCatalog/cut.wesl`, `tests/helpers/starCatalog/referenceStarCut.ts`, `tests/services/gpu/shaders/starCutLayout.parity.test.ts`, `tests/layers/starCatalog/render/starCutGpu.test.ts`, `tests/layers/starCatalog/render/starCutLayout.test.ts`, `tests/layers/starCatalog/render/cut/sameStarCut.test.ts`, `tests/layers/starCatalog/render/cut/referenceStarCut.test.ts`, `tests/layers/starCatalog/passes/starCatalogPass.test.ts`, `tests/layers/starCatalog/passes/starAggregatesPass.test.ts`

- [ ] Rename the TS symbols with `npm run refactor` (see `.claude/skills/refactor/SKILL.md` for the rename subcommand): `StarCutSourceInput.budgetTypical` (`StarCutSourceInput.d.ts:8`) → `drawBudget`, the `writeStarCutUniforms` parameter field (`starCutLayout.ts:163`) → `drawBudget`, and `BUDGET_TYPICAL_U32_INDEX` (`starCutLayout.ts:70`) → `DRAW_BUDGET_U32_INDEX`. The CLI does not reach WGSL or string keys, so then search the files above for `budgetTypical` and `BUDGET_TYPICAL` and finish by hand.
- [ ] WGSL by hand: the `CutUniforms` field (`cutIo.wesl:53`), the offset comment (`cutIo.wesl:44`) and its read (`cut.wesl:134`). Field order and type are unchanged, so the struct layout is unchanged.
- [ ] The parity test's name map (`starCutLayout.parity.test.ts:142,171,183`) keys on the WGSL field name; rename the key with the field.
- [ ] No new test: the parity test already fails if the TS index and the WGSL field disagree.
- [ ] Search `src/` and `tests/` for `budgetTypical` and `BUDGET_TYPICAL`: zero hits.
- [ ] `npm run build` passes (shader specifiers are invisible to `tsc`).
- [ ] Commit.

## Definition of Done

**Deliverables**

- `src/@types/data/starCatalog/StarSourceBudgets.d.ts` exporting `StarSourceBudgets`.
- `GAIA_STARS_ENTRY.budgets` with `small`, `medium` and `large` at `{ drawBudget: 1_500_000 }`.
- `SurveyStarCatalogSourceEntry` with `budgets` and without `tiered` or `drawBudget`; no star row carries either.
- `starCatalogFetcher` with one file-name path and no untiered branch or comment.
- `starCutInputs` reading `budgets[committedTier].drawBudget`, with the test `the cut reads the budget of the tier its catalog was committed at`.
- The cut uniform field `drawBudget` and `DRAW_BUDGET_U32_INDEX`, at word 9 as before.

**Observable behaviours for the smoke pass (all unchanged from main)**

- `#focus=body-sun` on a desktop-width window: the network panel shows `stars-medium.bin` loading, and the star field draws as on main.
- Switching the tier to large reloads `stars-large.bin`; the medium field keeps drawing until it lands.

**Out of scope**

- `slots` per tier, the octree pool and `format: 'octree'` (the octree feature, spec §5.4).
- Distinct per-tier budget values and their `npm run perf` tuning (the feature, and backlog item "Star drawBudget small-tier mobile cap").
- The cosmic-web-density `tiered` field.
- P1 (`SlotPool`) and P3 (data-family sync groups).
- A deletion audit (runs once, at the feature's `/feature-done`).
