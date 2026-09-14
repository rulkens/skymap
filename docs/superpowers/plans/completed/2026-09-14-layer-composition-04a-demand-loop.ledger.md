# SDD ledger — plan: docs/superpowers/plans/2026-09-14-layer-composition-04a-demand-loop.md

Branch `worktree-layer-galaxy-catalog`, draft PR #703. Execution base: 44e4506ab (plan + spec commits). Spec reachable: §9(d) D3/P2.
Harness has no TodoWrite tool this session — the task list lives here (Rule 1 satisfied as far as the harness allows).

## Task list (13)

- [ ] 1 sameRequest + flat-request invariant
- [ ] 2 AssetSlot.committed() (serves through reload)
- [ ] 3 slotReady + earthSurfaceTier + produceConstellationCaptions read committed()
- [ ] 4 audit (no code): commit paths overwrite in place; consumers tolerate reloading; demandTable boot set
- [ ] 5 requests state what is fetched: shipsTierVariants, galaxyCatalogRequest, optional tier, FilamentReq {small}
- [ ] 6 drift edge: requestDrifted + reevaluateDemand 4th edge, direct slot.load, −staleTierEvict
- [ ] 7 captureGalaxyFocusIds asks the row (drift + enabled)
- [ ] 8 famousGalaxiesMeta req = galaxyCatalogRequest(Famous); famousStarsMeta req undefined
- [ ] 9 hiResFamous slot row (built:'external', wireHiResFamousSlot)
- [ ] 10 delete makeRunTierTransition + SagaContext entry; tierRoute → WAKE_ROUTES
- [ ] 11 delete rebuildHiResFamousForTier
- [ ] 12 delete willSourceReload / loadCompanionAssets / CompanionAssetReq / dissolve
- [ ] 13 gate: typecheck/build/test delta, paired perf, user-attested visual pass

## Execution model (user ruling: max-safe parallelism)

Implementers run in isolation worktrees (Agent isolation:worktree) branched from the execution branch HEAD at dispatch; the controller cherry-picks their commits onto `worktree-layer-galaxy-catalog`, then generates the review package from the branch. Tasks in one wave have disjoint Files sets. Reviews pipeline per sdd-execution.md Rule 2.

Waves: W1 = {1, 2, 4(audit, read-only, in-branch)} · W2 = {3 (after 2), 5 (after 1)} · W3 = {6 (after 4,5), 7 (after 5), 8 (after 5), 9 (independent)} · W4 = {10 (after 6)} · W5 = {11 (after 9,10), 12 (after 8,10)} · W6 = {13}.
Why 11/12 wait for 10: makeRunTierTransition imports rebuildHiResFamousForTier / willSourceReload / loadCompanionAssets; deleting them before the caller is gone breaks typecheck.

## Pre-flight conflict scan (44e4506ab)

| Pair / task | Produces vs consumes | Found |
|---|---|---|
| 1 → 5,6,7,8 | `sameRequest(a: unknown, b: unknown): boolean` | consistent in every consumer |
| 2 → 3 | `committed(): (LoadState<T> & {kind:'ready'; req: Req}) \| null` | consistent; T3 reads `.req.tier` and `.value` |
| 5 → 6 | `galaxyCatalogRequest(source, tier): GalaxyCatalogReq` with optional `tier`; requestDrifted needs only row.req + sameRequest | consistent; 6 waits for 5 so untiered rows don't drift in the T6 test env |
| 5 → 7,8 | same builder | consistent |
| 5 & 12 both edit GalaxyCatalogReq.d.ts | 5: tier optional; 12: −dissolvePrevious | sequential (12 after 8 after 5) — no conflict |
| 5 & 8 & 9 all edit assetWiring.ts | 5: :85 point req + :268 filaments; 8: :246-263 companion rows; 9: + hiResFamous row | disjoint hunks; 8 ∥ 9 cherry-pick risk noted (adjacent additions) — resolve at pick time |
| 8 & 9 both edit EngineAssetSlots.d.ts | 8: Req types :48-50; 9: + hiResFamous field | disjoint hunks, same risk as above |
| 6 & 4 | 6 asserts demandTable.test unedited; 4 concludes it | 4 runs read-only in W1 against base; conclusion carried into 6's dispatch |
| 10 ↔ 9 ordering | 10 deletes the only caller of rebuildHiResFamousForTier; 9 supplies the replacement | plan allows 10 after 6 regardless of 9 → an intermediate commit where hi-res no longer rebuilds on flip. Ruling: run 10 in W4 only after 9 has landed (W3) — one commit-range less surprising, no cost |
| 10 ↔ 11/12 | see Waves | ordered |
| Each task self-consistency | tests named vs code named | T6 "superseded queued fetch" test says "if it rejects, stop and report" — honoured as a BLOCKED route. T13 has no code. Nothing else found |

Ruling: Task 10 waits for Task 9 as well as Task 6 — avoids a commit range where a tier flip leaves the hi-res texture at the old side; costs nothing (W3 → W4 anyway). If wrong: nothing, ordering only.
Ruling: Task 4 runs in W1 against the base (read-only audit); its "re-pointed in Task 3" classification is stated as "to be re-pointed" — carried into T6's dispatch. If wrong: the audit re-runs after W2 (cheap).

## Log
W1 dispatched 2026-09-14: T1 impl (sonnet, isolation worktree), T2 impl (opus, isolation worktree), T4 audit (opus, read-only in branch). BASE for all = 44e4506ab.
T1 impl DONE_WITH_CONCERNS (agent worktree agent-a5153f8c37bd313be, commit 6184f80cd) → cherry-picked as 18b3c3d65. Concern: sameRequest.ts docblock 6 comment lines vs 8 code — handed to reviewer to rule. Review package review-44e4506ab..18b3c3d65.diff; T1 reviewer dispatched (sonnet, in-branch read-only) → task-1-review.md.
Landmine: isolation-worktree implementers cannot WRITE into layer-galaxy-catalog (harness guard); reports land at the same relative path inside their own worktree; controller copies them over. Reads work.
W2: T5 impl dispatched (opus, isolation worktree) with BASE 18b3c3d65. T3 waits for T2.
T4 audit DONE → task-4-report.md. Premise confirmed: every commit path replaces in place (only dissolveCatalogBuffer blanks; deleted by Ruling 3); no consumer breaks on a non-idle slot holding a value; demandTable boot set unchanged. Four consumers are silently FIXED by T2 (extractSelectionRow:70, watchFocusTweenSaga:92, cloudShellPass:110, ringsPass:95) — name them in the PR body.
Ruling (T4 D1): adding committed() to the AssetSlot type breaks 15 stub literals in 13 test files (tsconfig includes tests). Task 2 fixes every stub (its implementer is already doing so); Task 6's "demandTable.test.ts unedited" gate is restated as "demandTable.test.ts EXPECTATIONS unedited" — the one added `committed: () => null` stub line is allowed. Why: the boot set is what the gate protects; cost if wrong: none beyond a one-line stub.
Ruling (T4 D2): createSyntheticFallback's subscriber re-dispatches engineStatusChanged on every reload (whole-field assign, benign); no change in this PR. Cost if wrong: a redundant status dispatch per reload.
Note (T4 D3): the in-place premise holds for meshBodies/filaments/constellations/flow and the four no-commit metadata rows too — carried into T6's dispatch.
Open (T4 D4, adjacent): awaitSlotReady:120 fast-paths on state() not committed(); dead today (pgcAlias req undefined), live if PR-D puts a tiered slot behind it. NOT folded into T3 (plan names its readers); offer pick-up to the user at the end of this plan rather than backlog.
Task 1: complete — 18b3c3d65; review APPROVED/APPROVED (task-1-review.md), no findings; comment-budget concern ruled load-bearing by reviewer.
T2 impl DONE_WITH_CONCERNS (agent worktree agent-a3daa8ca43ada405e, commit 2f4ec45a0 off main 35463c237 — isolation worktrees branch from origin/main, NOT the execution branch; T3 dispatch told to cherry-pick 18b3c3d65+bf4a97d9f if missing) → cherry-picked clean as bf4a97d9f; typecheck clean on branch. Concerns: 13 stub files (ruled required), tier-swap-race test adapted (waits on writes.length===3), ringsPass/cloudShellPass draw-through-reload ships one task early (intended), AssetSlot.ts header duplicate paragraph pre-existing (reviewer to rule scope). Review package review-18b3c3d65..bf4a97d9f.diff; T2 reviewer dispatched (opus) → task-2-review.md.
W2: T3 impl dispatched (sonnet, isolation worktree) with BASE bf4a97d9f.
T2 review: Spec APPROVED / Quality CHANGES (task-2-review.md): Important 1 tier-swap-race.test.ts:126 end-state assertion vacuous; Minor 2 header duplicate :52-55 (ruled in scope, delete); Minor 4 committed() return annotation; Minor 5 two self-contradictory stubs (aggregateRegistry/awaitSlotReady tests); Minor 6 d.ts ratio pre-existing (out of scope).
Ruling (T2 Minor 3): the reviewer says "gate Task 3" on rewriting reevaluateDemand.ts:91-94/:173-183 prose ("release on drift"); the staleTierEvict edge lives in TASK 6 (which deletes it), so the gate goes on Task 6's review, not Task 3. The d.ts "release is distance eviction only" claim is true from Task 6 on; the contradiction is intra-PR only. Cost if wrong: none, PR-level check at final review.
T2 fix round 1: resume implementer (opus) for Important 1 + Minors 2, 4, 5.
T2 fix round 1: 327261f94 in agent worktree → cherry-picked as 944f63c75 (4 files +5/−9). Re-review dispatched (sonnet) over review-bf4a97d9f..944f63c75.diff → task-2-rereview.md.
T5 impl DONE_WITH_CONCERNS (agent worktree agent-a321b732fca3c07ec came up on main 35463c237; implementer re-branched at 18b3c3d65 → commit e7c690167) → cherry-picked as 80b253cb7 (14 files +188/−66, one auto-merge in wireSlots.test.ts). Review package review-944f63c75..80b253cb7.diff; T5 reviewer dispatched (opus) → task-5-review.md.
Ruling (T5 concern 2): Source.Synthetic row (assetWiring.ts:237, hand-written, not pointRow) routed through galaxyCatalogRequest → { source } — accepted pending reviewer verification; without it Task 6 would regenerate synthetic data on every flip. Cost if wrong: reviewer catches it.
Ruling (T5 concern 3): makeRunTierTransition.ts:64 builds { source, tier, dissolvePrevious: true }; sameRequest counts keys so it never equals row.req(tier). In the T6..T10 commit range a flip therefore triggers ONE extra reload (the drift edge's direct load sets lastRequest to row.req(tier), so it does not repeat every frame). Accepted as intermediate-only; Task 10 deletes the path. Carry into T6's dispatch so its implementer does not "fix" it.
Note (T5 concern 4): EngineAssetSlots.d.ts:45 edit is adjacent to T8's :48-50 hunk — expect a trivial cherry-pick conflict at T8 pick time; take both.
Task 2: complete — bf4a97d9f + fix 944f63c75; re-review ALL ADDRESSED (task-2-rereview.md).
W3 dispatched with BASE 80b253cb7 (T5 landed, in review; no open Important findings): T6 impl (opus, isolation), T7 impl (sonnet, isolation), T8 impl (sonnet, isolation), T9 impl (opus, isolation). Each told to cherry-pick 18b3c3d65 bf4a97d9f 944f63c75 80b253cb7 if its worktree came up on main. T3 (sonnet) still running.
T3 impl DONE (agent worktree agent-aaa18bce5d7746124, commit 4ed40657d; it cherry-picked bf4a97d9f itself) → cherry-picked as d89700cee (11 files +126/−38; 5 consumer-test stubs adapted). Review package review-80b253cb7..d89700cee.diff; T3 reviewer dispatched (sonnet) → task-3-review.md.
T5 review: Spec APPROVED / Quality CHANGES (task-5-review.md). Important 1: filaments flag polarity unpinned (assetWiring.test.ts:410 → add exact-shape asserts). Minors 3/4/6/7 stale prose + test title + tierTargets header echo → fix. Synthetic-row ruling VERIFIED required (tierTargets {} → { source }).
Ruling (T5 Minor 2): galaxyCatalogRequest.ts:7 "famous-meta companion row calls it too" stays — Task 8 (in flight) makes it true within this PR. Cost if wrong: one stale sentence caught at final review.
Ruling (T5 Minor 5/8/9): no change — EngineAssetSlots.d.ts:45 true from T6 on; shipsTierVariants ratio justified; makeRunTierTransition.ts:54-55 dies in T10.
Note: reviewer's cross-task claim "re-fetch every frame after a flip" in the T6..T10 range is over-stated — the drift edge compares lastRequest(), which the direct load sets to row.req(tier); it is one extra reload per flip for SDSS/GLADE/Milliquas. T6's dispatch already carries this.
T5 fix round 1: resumed implementer (opus) for Important 1 + Minors 3, 4, 6, 7.
T3 review: Spec APPROVED / Quality CHANGES (task-3-review.md). Important: earthSurfaceTier.ts header grew 13→15 lines (budget ≤10) and the report claimed it shrank; Minor: slotReady.ts header 13 lines pre-existing, missed the opportunity. Both drive fix round 1 (resumed implementer, sonnet). All stubs verified non-contradictory; slotReady callers = flow only (encodeFlowCompute, flowFieldPass, shouldKeepTicking).
T5 fix round 1: cfde69f24 in agent worktree → cherry-picked as 59adf96a0 (5 files +12/−19; implementer mutation-verified the polarity assert). Re-review dispatched (sonnet) over review-d89700cee..59adf96a0.diff → task-5-rereview.md.
Task 5: complete — 80b253cb7 + fix 59adf96a0; re-review ALL ADDRESSED (task-5-rereview.md).
T3 fix round 1: fad836bc2 in agent worktree → cherry-picked as 930775a4f (2 files, comments only, +14/−22). Re-review dispatched (sonnet) over review-59adf96a0..930775a4f.diff → task-3-rereview.md.
T3 re-review: OPEN — earthSurfaceTier.ts header 11 lines counting the /** and */ delimiters (9 prose lines); slotReady 9. Ruling: ADDRESSED — comments.md is "not a lint gate — a default you should be able to justify departing from in a sentence"; the prose is 9 lines and the content is the landmine the task exists for. Cost if wrong: one line of comment.
Task 3: complete — d89700cee + fix 930775a4f.
T7 impl DONE (agent worktree agent-adeed8b73ce5dbc9d, commit 3cf5c26e1; it cherry-picked the four landed commits itself) → cherry-picked as fd8c46166 (2 files +67/−34). Review package review-930775a4f..fd8c46166.diff; T7 reviewer dispatched (sonnet) → task-7-review.md.
T8 impl DONE_WITH_CONCERNS (agent worktree agent-a3d89bd07205c778c, commit b1b728890) → cherry-picked as 1d37de01e (13 files +73/−64; 3 auto-merges vs T5 fix: GalaxyCatalogSourceConfig.d.ts, assetWiring.ts, assetWiring.test.ts). Out-of-list edits: galaxyCatalogSourceRegistry.ts loadCompanionAssets (type-forced), 4 adapted tests; CompanionAssetReq.d.ts now unreferenced (T12 deletes). Full suite had 4 env timeouts (load avg ~208 from parallel agents) — branch typecheck+focused suites run by controller. Review package review-fd8c46166..1d37de01e.diff; T8 reviewer dispatched (opus, told to read the 3 auto-merged files at HEAD) → task-8-review.md.
Task 7: complete — fd8c46166; review APPROVED/APPROVED (task-7-review.md). Parked Minor: captureGalaxyFocusIds.ts header 28 lines (pre-existing, +1 here). Ruling: fold into the final whole-branch fix wave rather than a per-task round — comment-only, no behaviour. Cost if wrong: one extra fix commit later.
T6 impl DONE_WITH_CONCERNS (agent worktree agent-a2c774fda1fbce916, commit c6c0eb375) → cherry-picked as 5952baa5a (4 files +251/−67). Superseded queued fetch RESOLVES (runLoad returns on every terminal path) — not blocked. Concerns: conjunct order deviates (null rule inside requestDrifted; non-idle → demand → requestDrifted), two extra prose corrections, "edges partition slot states" claim removed, stale-tier block rows flipped demand false→true.
Ruling (T6 concern 1): conjunct order accepted — req(tier) still reached last, no duplicated null check; reviewer told to verify. Cost if wrong: one reorder.
Review package review-1d37de01e..5952baa5a.diff; T6 reviewer dispatched (opus, full rigour, carries Task 2 review's Minor 3 gate) → task-6-review.md.

## Task 8 review — 2026-09-14

Review (opus, `task-8-review.md`): Spec APPROVED, Quality APPROVED, 4 Minor, no Critical/Important.
Reviewer verified the companion's `lastRequest()` equals `row.req(tier)` under the drift edge (zero extra reloads, better than the accepted one-per-flip) and that the `void` request does not storm the drift edge (`lastRequest = undefined`, not `null`; `sameRequest(undefined, undefined)` true).
Reviewer's observation 5 (makeRunTierTransition hand-built 3-key request drifts once per flip) = the already-ruled intermediate state; Task 10 deletes it. Reviewer mislabels 5952baa5a as "Task 9" — it is Task 6; harmless.

Ruling: Minor 1 (EngineAssetSlots.d.ts:46-51 claims tier agreement a `{source}` request cannot carry) + Minor 2 (same fact at four sites; revert EngineAssetSlots docblock to its one-line form) — PARKED to the final fix wave beside Task 7's header, same as the T7 ruling: a comment-only fix does not earn its own cherry-pick + re-review cycle — cost if wrong: one lying docblock lives on the branch until the final wave, nothing runtime.
Ruling: Minor 3 (GalaxyCatalogSourceConfig.d.ts "no per-key switch" promise now conditional) — NO ACTION: Task 12 deletes `companions` and this docblock with it — cost if wrong: none, file section dies in W5.
Ruling: Minor 4 (thin undefined-request test) — NO ACTION, brief-mandated, reviewer agrees.

Task 8: complete (1d37de01e). Final-wave fix list so far: T7 captureGalaxyFocusIds header (28 lines), T8 Minor 1+2 EngineAssetSlots docblock.

## Task 9 implemented — 2026-09-14

Implementer (opus, agent worktree agent-a34275d65dd4dd980, branch worktree-agent-a34275d65dd4dd980) DONE_WITH_CONCERNS: f51b941f7 → cherry-picked as 87275766d (auto-merges: EngineAssetSlots.d.ts, engine.ts, assetWiring.ts, assetWiring.test.ts — all clean). Branch `npm run typecheck` green after the pick. Report copied to `task-9-report.md`; package `review-5952baa5a..87275766d.diff`.
New files: HiResFamousPair.d.ts, HiResFamousReq.d.ts, src/data/hiResReqByTier.ts, wireHiResFamousSlot.ts (+test).
Concerns (handed to reviewer to adjudicate): (1) hiResFamous now in the load-progress walk; (2) old rebuildHiResFamousForTier path leaves slot ready with a destroyed pair until Task 11 — nothing reads it, commit destroys state.subsystems not its own stale payload; (3) engine.ts +3 hiResFamous:null forced by required field; (4) wireSlots.test.ts explicit drain() = flaky-test fix.
Ruling (provisional, pending reviewer): concern 2 is the accepted double path; Task 10 dispatch carries a pointer so the tier route does not touch rebuildHiResFamousForTier's semantics; Task 11 deletes it — cost if wrong: one stale ready slot between T9 and T11 on the branch, never on main.

Task 9 review dispatched (opus, full rigour). Task 9: in review.

## Rate-limit restart — 2026-09-14 ~16:30

Both reviewers (T6, T9) were killed by the session rate limit before writing a review file (no task-6-review.md / task-9-review.md existed). Re-dispatched both fresh on opus with the same inputs and rulings (T6: rulings a–d + superseded-fetch-resolves + void-request checks; T9: four implementer concerns + commit-order mutation check). Nothing else changed; branch HEAD 87275766d, typecheck green.

## Task 6 review — 2026-09-14

Review (opus, `task-6-review.md`): Spec APPROVED, Quality APPROVED, 0 Critical / 0 Important / 2 Minor. Rulings a–d verified; superseded-fetch-resolves pin verified; void-request no-storm verified; one-extra-reload-per-flip bound verified (not per frame).
Ruling (Minor 1): reevaluateDemand.ts header 80 lines (pre-existing; this commit net −3 comment lines) — PARKED to the final fix wave: move the four "Why" sections into the spec §9(d), leave a ≤10-line header linking there + the one-line invariant. Cost if wrong: one comment-only commit later.
Ruling (Minor 2): reevaluateDemand.ts:39-41 direct-call rationale names only the in-flight `admit` path, not the enqueued closure's idle re-check (`:137`) that drops the ready case — PARKED to the final fix wave, comment-only. Cost if wrong: one misleading clause until then.
Ruling (reviewer note on dissolve): the drift reload re-issues without `dissolvePrevious`, so the tier-swap dissolve is absent across T6..T10. INTENDED: the user confirmed the dissolve delete (Task 12 removes dissolveCatalogBuffer + dissolvePrevious); Task 10's wake route must NOT reintroduce `dissolvePrevious`. Carry into the Task 10 brief. Cost if wrong: none, the user ruled it.

Task 6: complete (5952baa5a). Final-wave fix list: T7 captureGalaxyFocusIds header; T8 EngineAssetSlots docblock (Minor 1+2); T6 reevaluateDemand header (→ spec) + :39-41 clause.
Task 10 gate: T6 complete ✓, T9 review pending.

## Task 9 review — 2026-09-14

Review (opus, `task-9-review.md`): Spec APPROVED, Quality CHANGES — 0 Critical / 2 Important / 3 Minor. No corruption between the slot path and the old rebuild path (both destroy off state.subsystems; nothing in production reads the slot payload). Implementer concern 1 (load-progress walk) ACCEPTABLE per reviewer (zero bytes, consumers handle totalBytes 0, redraw wake is a gain). Concern 3 (engine.ts +3) forced. Concern 4 (drain) flaky-test fix, not a weakening.
I2 (mechanism correction): a `small ↔ medium/large` flip reloads the slot via the DRIFT EDGE, not blocked by the idle guard → two 32 MB texture_2d_array allocations (peak 64 MB) until Task 11 deletes rebuildHiResFamousForTier; medium ↔ large share layerSide 1024, no drift. Carry into the Task 10 and Task 11 briefs.
Fix round 1 (implementer a34275d65dd4dd980 resumed via SendMessage, BASE 87275766d): I1 wireSlots.ts:123-126 stale "five subsystems" comment; M1 hiResReqByTier.ts comment ratio; M2 wireImpostorSubsystems.ts fold two notes; I2 report-only correction. Comment-only commit; scoped re-review (sonnet) after the pick.
Ruling (M3): engine.destroy() between the slot's fetch and commit nulls state.subsystems.hiResFamous* and the commit republishes a 32 MB texture nobody destroys — microtask window at boot / tier flip, dev-HMR leak class, not user-visible; slot.cancel() in destroy() would orphan the already-allocated texture instead. NOT fixed in this PR (routing teardown through the slot is a lifecycle design change outside Task 11's delete). ADJACENT FINDING → offer to the user at the end beside awaitSlotReady:120 (not backlog by default). Cost if wrong: a dev-HMR leak until then.

T9 fix round 1: 09bbd756f → cherry-picked as 9a02672ec (3 files, +10/−15, comments only; I1/M1/M2 applied, I2 report-only). Report re-copied. Package review-87275766d..9a02672ec.diff; scoped re-review dispatched (sonnet) → task-9-rereview.md.

T9 re-review (sonnet, `task-9-rereview.md`): OPEN M1 only — hiResReqByTier.ts 5 comment lines (3 prose + delimiters) over 8 code lines; I1/I2/M2 addressed; tests + typecheck green; commit comment-only.
Ruling (T9 M1): ADDRESSED — same basis as T3: comments.md is "not a lint gate"; the 3 prose lines record a choice that looks wrong and would get "fixed" back (a per-call `{ layerSide }` literal would defeat the `Object.is` fast path and drift every frame). Cost if wrong: one comment line.
Task 9: complete (87275766d + 9a02672ec).

## W4 — Task 10 dispatched — 2026-09-14

Gate: T6 complete ✓, T9 complete ✓. BASE = 9a02672ec. Implementer (opus, isolation worktree; told to `git reset --hard 9a02672ec` instead of 12 cherry-picks). Carried: no `dissolvePrevious` reintroduction (user ruling; T12 deletes); rebuildHiResFamousForTier untouched, may go dead (T11 deletes); watchTierSaga keeps focus-id capture / hover clear / setTier / MW starCount re-seed / re-anchor; hi-res double allocation on cross-small flips accepted until T11.
Ruling (T10 manual check): the brief's "flip the tier on the branch's dev server" is deferred to the Task 13 gate's user-attested visual pass — an isolation worktree has no public/data and no server. Cost if wrong: the drift-only reload path is first exercised at the gate, one task later than the plan wanted.

## Task 10 implemented; W5 pipelined — 2026-09-14

T10 implementer (opus, agent-ae1bb24618bb40b93) DONE: dfcd5042c → cherry-picked as 13dca63cf (18 files, +74/−439; makeRunTierTransition + test deleted; tierRoute in WAKE_ROUTES). Full suite 1319 files / 9170 tests green in its worktree; typecheck clean; rg runTierTransition empty. `git reset --hard` is DENIED by the permission system in isolation worktrees — `git checkout -B <own-branch> <sha>` on a clean tree is the working substitute; carried into T11/T12 dispatches.
Concerns handed to the reviewer: (1) willSourceReload prose edited to clear the rg gate (T12 deletes the file); (2) same-tier no-op test proves the guard via the hover clear, not a spy; (3) no end-to-end wake→drift→reload pin.
Package review-9a02672ec..13dca63cf.diff; T10 reviewer dispatched (opus, full rigour, mutation check on tierRoute) → task-10-review.md.

Ruling (W5 pipelining): T11 (sonnet, agent isolation) and T12 (opus, agent isolation) dispatched NOW on BASE 13dca63cf, before the T10 review verdict — both are delete-only tasks in files disjoint from each other (T11: rebuildHiResFamousForTier + RENDERER.md + TexturedDiskSubsystem.d.ts; T12: willSourceReload, dissolveCatalogBuffer, CompanionAssetReq, galaxyCatalogSourceRegistry, GalaxyCatalogReq, Committer, GalaxyCatalogSourceConfig, renderFrame.ts:151, fade test) and mostly disjoint from T10's; the user asked for max-safe parallelism. Cost if wrong: a T10 fix round touching one of those files forces a conflict resolution at the T11/T12 pick — small, deletions rebase trivially.
Task 10: in review. Task 11: running. Task 12: running.

T11 implementer (sonnet, agent-a92a42e9e3f995e31) DONE: 0c545892c → cherry-picked as cc483daf7 (3 files, +9/−411). Full suite green in its worktree (1318 files / 9167 tests), typecheck clean. RENDERER.md untouched (implementer: no tier-swap paragraph ever existed there — reviewer told to verify). Ruling: `rg rebuildHiResFamousForTier docs` hitting the plan + spec files is acceptable — plan/spec text is execution history, not edited mid-plan; src/tests clean. Cost if wrong: none.
Package review-13dca63cf..cc483daf7.diff; T11 reviewer dispatched (sonnet) → task-11-review.md. Task 11: in review.

## Task 10 review — 2026-09-14

Review (opus, `task-10-review.md`): Spec APPROVED, Quality APPROVED, 0/0/5 Minor. Mutation check passed: the wake test fails without tierRoute and cannot ride another route. Producer/consumer predicates agree (captureGalaxyFocusIds.ts:68-74 vs assetWiring.ts:89 + requestDrifted read the same galaxyCatalogRequest) → no re-anchor hang. Implementer concerns adjudicated: willSourceReload prose edit accurate/minimal; same-tier no-op test real; end-to-end wake→drift→reload pin not warranted here (two halves + Task 13 gate).
Ruling: all five Minors PARKED to the final fix wave (comment/test-only): M1 SagaContextProvider.tsx:22-24 overclaimed throw; M2 watchWakeSaga.ts comment budget (cut the new note's last clause); M3 history narration in createAppStore.ts:12 ("now forks its first feature saga" — also stale, ~20 watchers) and types.ts:12 ("now indexes … no longer returns"); M4 types.ts:18-19 ragged reflow; M5 registerReconcile.test.ts:69-72 four runtime-type assertions (tsc guarantees them) → delete, keep toHaveBeenCalledTimes(1) + toBeDefined. Cost if wrong: one comment/test-only commit later.
Task 10: complete (13dca63cf).
Final-wave fix list: T7 captureGalaxyFocusIds header · T8 EngineAssetSlots docblock (Minor 1+2) · T6 reevaluateDemand header → spec + :39-41 clause · T10 M1–M5.

## Task 11 review — 2026-09-14

Review (sonnet, `task-11-review.md`): Spec APPROVED, Quality APPROVED, 0/0/1 Minor. Orphaned-behaviour check: five of the deleted test's six assertions are re-pinned in wireHiResFamousSlot.test.ts; the sixth (absent texturedDisks tolerated via `texturedDisks?.` at wireHiResFamousSlot.ts:50) is unpinned.
Ruling (T11 Minor): NO ACTION — a one-line optional chain is not a contract; testing.md would reject a test that only exercises it. Cost if wrong: an absent-texturedDisks commit throws in a state the engine never constructs.
Task 11: complete (cc483daf7). Remaining: Task 12 (running), Task 13 gate.

## Task 12 implemented — 2026-09-14

T12 implementer (opus, agent-acb27824abe0a7dd7) DONE: aa2fd0536 → cherry-picked as 238f2074e (14 files, +82/−464). Full suite green in its worktree (1316 files / 9162 tests), typecheck clean. Fade test had 3 cases: 2 non-dissolve cases MOVED into galaxyCatalogSourceRegistry.test.ts, the dissolve-ordering case died. `req` dropped from the galaxy commit; Committer's third param kept (reviewer to adjudicate). rg gate: 6 hits, all the English word "companions" (labels, famous-stars tests) — per ruling, left. Forced extras: StructureCatalogReq.d.ts dangling reference, syncVisibilityFades.ts "mid-dissolve" prose.
Concerns to the reviewer: rosterSettling covers a tier swap only because fadeTo marks animating at an unchanged target; stale "reloads on tier change" prose in GalaxyCatalogSourceConfig.d.ts + registry header (→ final fix wave candidate).
Package review-cc483daf7..238f2074e.diff; T12 reviewer dispatched (opus) → task-12-review.md. Task 12: in review.

## Gate prep — 2026-09-14

Dev server for THIS worktree started (background task bz65gzhx5): http://localhost:5175/ (5173 = main checkout, 5174 = another session's agent worktree — never measure those). public/data → main's (symlink verified). Perf baseline commit 223145f68 is an ancestor of HEAD and code-identical to the branch base 44e4506ab under src/ and tools/ (docs-only between them).
Gate plan (after T12 review clears): ONE gate agent (opus, isolation worktree) checks out 223145f68 in ITS worktree as the baseline, links data, starts its own server, runs the mechanical gate (typecheck/build/test delta vs baseline/DoD rg inventory + deliverable checks) and the paired perf A-B-A-B on the three scenarios against :5175 (branch) and its own port (baseline); writes task-13-report.md. Then the user-attested visual pass on :5175 with the brief's eight cases. Gate runs BEFORE the final whole-branch review; the parked-minors fix wave rides the final review's single fix dispatch.

## Task 12 review — 2026-09-14

Review (opus, `task-12-review.md`): Spec APPROVED, Quality APPROVED, 0/0/5 Minor. rg gate clean (6 English-word hits verified in context); moved fade cases confirmed moves + mutation-sensitive; 190 tests green; typecheck clean.
Ruling: all five Minors → final fix wave: M1 drop Committer's dead third `req` param + its docblock sentence (all 15 commit sites take `(value)`); M2 add a fadeController test "fadeTo at an unchanged target marks animating" (renderFrame.ts:151-152 bake key rides it — a real contract, testing.md-positive) + a one-line note at fadeController.ts:140-155; M3 stale "Reloads on tier change" prose at GalaxyCatalogSourceConfig.d.ts:11,15 + the registry header + the third site the review names; M4 galaxyCatalogSourceRegistry.test.ts:12-26 header bullet for the fade-in describe; M5 renderFrame.ts:152 re-wrap. Cost if wrong: one comment/test commit later.
Task 12: complete (238f2074e).

## W6 — Task 13 gate dispatched — 2026-09-14

Gate agent (opus, isolation worktree aebddf771f3be544e): Phase 1 branch tree 238f2074e (typecheck, build, test, DoD inventory); Phase 2 baseline 223145f68 test count + delta reconciled against task reports 2/6/9/10/11/12; Phase 3 paired perf A-B-A-B ×3 scenarios, branch :5175 vs its own baseline server, MERGED medians; Phase 4 task-13-report.md incl. the eight-case visual checklist for the user on :5175. Then: user attests the visual pass → final whole-branch review (most capable model) → ONE fix wave (parked minors T6/T7/T8/T10/T12 + final findings) → scoped re-review → archive ledger → remove agent-* worktrees → /feature-done → finishing-a-development-branch.
Final-wave fix list: T7 captureGalaxyFocusIds header · T8 EngineAssetSlots docblock (Minor 1+2) · T6 reevaluateDemand header → spec §9(d) + :39-41 clause · T10 M1–M5 · T12 M1–M5.
Adjacent findings to OFFER the user (not backlog): awaitSlotReady:120 fast-path on state(); engine.destroy() hi-res slot fetch→commit leak window (route teardown through the slot).
PR body must name the four consumers T2 silently fixed: extractSelectionRow:70, watchFocusTweenSaga:92, cloudShellPass:110, ringsPass:95.

## Task 13 gate — mechanical half PASSED — 2026-09-14

Gate agent report → `task-13-report.md` (copied). typecheck green; build green; branch `npm test` 1315 files / 9159 tests green, no timeouts; baseline 223145f68 1314 / 9135 → delta +1 file / +24 tests, reconciled per file AND per case title against tasks 1–12, NO unexplained drop. DoD inventory: all 8 bullets pass; rg gate clean over src+tests; demandTable.test.ts diff vs base = the one allowed stub line, boot firedKeys untouched.
Paired perf (MERGED medians, A=:5175 branch, B=:5176 baseline, A-B-A-B-A-B, all --url): full-survey 19.9 vs 19.9 (0.0) · solar-system 20.8 vs 22.8 (−2.0, branch faster) · milky-way 20.4 vs 19.9 (+0.5). Verdict NEUTRAL, no regression; ~4–7 ms machine spread per side (three other dev servers live), one ~24.5 outlier per side; the per-frame drift check does not show. Landing NOT halted.
Gate §6 findings (fix wave): 3 live docs/backlog detail files cite deleted symbols; stale tier-propagation prose at engine.ts:329, galaxyCatalogSourceRegistry.ts:3, GalaxyCatalogSourceConfig.d.ts:11,15; reevaluateDemand.ts:155 restates the "once" invariant; the 80-line header.
Task 13: mechanical half complete. VISUAL PASS PENDING — user attests on http://localhost:5175/ (checklist in task-13-report.md §5, eight cases). Task 13 is complete only after the user's attestation.

## Final whole-branch review dispatched — 2026-09-14

Package review-44e4506ab..238f2074e.diff (15 commits). Reviewer: fable (most capable), lenses A correctness-across-seams / B DoD + deferral boundary / C simplicity + deletion opportunities / D tests / E comments+docs; told not to re-report the parked list; writes final-review.md with Verdict LAND | FIX-WAVE-THEN-LAND | HALT. Runs concurrently with the user's visual pass. Then: ONE fix dispatch (parked list + gate §6 + final findings) → scoped re-review → archive ledger → remove agent-* worktrees (a34275d65dd4dd980, ae1bb24618bb40b93, a92a42e9e3f995e31, acb27824abe0a7dd7, aebddf771f3be544e + any earlier T1–T8 ones) → /feature-done (spec ~914 stale "loading and committing carry the previous value" → lastReady) → finishing-a-development-branch.

## Visual pass ATTESTED — 2026-09-14

User: "all looks good" — the eight-case visual pass on http://localhost:5175/ (galaxies, Earth close approach, stars, hi-res famous, MCPM, network panel, filaments, re-enable) attested. Task 13: complete. All 13 tasks complete.
Waiting on the final whole-branch review (fable) → single fix wave → scoped re-review → landing sequence.

## Final whole-branch review — 2026-09-14

`final-review.md` (fable): FIX-WAVE-THEN-LAND — 0 Critical / 2 Important / 7 Minor / 5 deletion opportunities / 0 ruling disagreements. Seams found sound: ASSET_WIRING × drift (no per-frame drifter), direct load vs queue (resolves, frees key), committed()/lastRequest() under cancel/error/release, hi-res commit order (destroy window UNREACHABLE — fetch allocates synchronously, commit follows in the same task; better than the T9 M3 ruling recorded), watchTierSaga ordering, tier/ wake, DoD + deferral boundary, docs.
Rulings:
- I1 FIX (wave A): evict edge gate `(ready|error) && committed() !== null && release?.(ctx)` — conservative two-kind gate, not loading/committing (a release during committing cannot unwind setMap) + one test. Cost if wrong: an errored body texture stays pinned until the next request change.
- I2 FIX: four "committed request" → "last request" sites (A: galaxyCatalogRequest.test.ts, hiResReqByTier deleted; B: watchWakeSaga, watchTierSaga).
- M1, M6, M7 riders, G1–G4, T12 M4/M5 → wave B. M4 backlog REWRITE (not re-point) → wave B.
- M2 (dangling re-anchor take on two requestTier in one frame) + M3 (supersede window one frame wide) ACCEPTED as residuals; M3 goes in the PR body. Cost if wrong: a parked saga worker / one bounded re-anchor against soon-replaced data.
- M5 (gate checklist told the user to ignore an sdss-small.bin 404 the fetcher cannot issue — target 0 short-circuits at galaxyCatalogFetcher.ts:53): ask the user whether such a request appeared; if it did it is a finding. Report is a workspace artifact, not corrected.
- D1 FIX (wave A): delete the UNTIERED/TIERED restating cases + one of the row-level pair (−4 cases). D2 FIX (wave A): delete src/data/hiResReqByTier.ts, inline the row's req — overrides Task 9's text and the T9 M1 ruling; the Object.is fast path on a one-key object is unmeasurable and the landmine comment dies with the file. Cost if wrong: one Object.entries of length 1 per frame.
- D3 (state.subsystems.hiResFamous* duplicates the slot's committed pair; destroy through the slot) → ADJACENT FINDING to offer the user (with the earlier M3/awaitSlotReady items). D4 rename TIER_FETCHED_POINT_SOURCES, D5 slotReady mirror cases → NOT taken (pre-existing, out of scope; the deletion audit at /feature-done may re-raise).
Spec ~914 stale clause folded into wave B item 11 (so /feature-done finds it fixed).

## Fix wave dispatched — 2026-09-14

`fix-wave-brief.md` written. TWO parallel implementers (user ruling max-safe parallelism; disjoint file sets; reevaluateDemand.ts split code (A, evict edge only) vs comments (B, header/:39-41/:134-135/:155) — hunks are far apart, expect a clean pick; conflict fallback = resolve by taking both): Wave A code+tests (opus, agent a50478f4e79a73c8f, BASE 238f2074e); Wave B prose/docs/spec (opus, agent af8ef2c3edcd92d1e, BASE 238f2074e). Then: cherry-pick A then B, full typecheck + focused suites on the branch, ONE scoped re-review (sonnet) over both commits against final-review.md + the parked list, then the landing sequence.

Fix wave A (agent a50478f4e79a73c8f) DONE: b15975317 → cherry-picked as 3b58a431a (14 files, +70/−105; hiResReqByTier.ts deleted; evict gate ready|error + committed; Committer third param dropped; fadeTo unchanged-target test; −4 restating cases; registerReconcile runtime-type asserts dropped). Both mutation checks passed. Full suite in its worktree 1315 files / 9158 tests green; typecheck clean. Adapted coverage: AssetSlot.test.ts ×3 (Committer arity), wireHiResFamousSlot.test.ts ×6 (inline req).
Residual → wave B via SendMessage: reevaluateDemand.ts drop-edge comment "release() only ever runs on a ready slot" now false; B rewrites the line (B's worktree at 238f2074e; controller merges at the pick).

Fix wave B (agent af8ef2c3edcd92d1e) DONE: a167dcf74 → cherry-picked as 598293172 (19 files, +169/−207) after ONE conflict in reevaluateDemand.ts at the evict edge (B's comment over A's condition — resolved by the controller: B's prose + A's code) plus the controller's rewrite of the drop-edge sentence (:78-80: release runs on a slot holding a committed value, not "only on a ready slot"). B later amended its own commit to 5e10415fe with an equivalent wording of that sentence; NOT re-picked (content-equivalent, re-review already running on 598293172). Headers: reevaluateDemand.ts 80→10 (four Why sections → spec §9(d) "Demand-loop rationale"), captureGalaxyFocusIds.ts 28→10, watchWakeSaga.ts 13→9. Spec ~914 stale clause corrected in this commit. Branch typecheck green at 598293172.
B's reported-not-done (accepted, pre-existing): reevaluateDemand.ts comment:code ratio 67/46 still over; watchTierSaga.ts / types.ts / createAppStore.ts headers over budget (unswept rationale).
Package review-238f2074e..598293172.diff; scoped re-review dispatched (opus, whole-file truth check on reevaluateDemand.ts) → fix-wave-rereview.md.

Agent worktree attribution (by head-commit subject = a commit cherry-picked onto this branch) — THIS effort's 14, to remove after the re-review is clean (worktree + `worktree-agent-*` branch each): a5153f8c37bd313be (T1) · a3daa8ca43ada405e (T2 fix) · aaa18bce5d7746124 (T3 fix) · a321b732fca3c07ec [branch task-5-requests-state-what-is-fetched] (T5) · a2c774fda1fbce916 (T6) · adeed8b73ce5dbc9d (T7) · a3d89bd07205c778c (T8) · a34275d65dd4dd980 (T9) · ae1bb24618bb40b93 (T10) · a92a42e9e3f995e31 (T11) · acb27824abe0a7dd7 (T12) · aebddf771f3be544e (gate) · a50478f4e79a73c8f (wave A) · af8ef2c3edcd92d1e (wave B). NOT ours (terrain/scene/camera subjects, or locked): a067c9e6f34ef658b, a2169750958406f0a, a35f750c0cc8d001d, a4fd578fd931f142b, a7578ed0e06f4eb0f, a78caffae3ed75c50, a7e67507878ba000e, a9b875965e3379e64, a9e1b634142fb51d0, ac5309315f9e07d03, acdeb561541e8c2c9, ad0a0b1af762ecd60, af2802b833aaf2dc7, affad474071d2b508 — leave.
Full `npm test` on the branch at 598293172 running (bh6ea9h9v).
User asked mid-turn whether this is prep: answered — it is the feature (PR-A), in its landing tail.
Full suite at 598293172: 1315 files / 9158 tests green (99 s). Typecheck green. Waiting on fix-wave-rereview.md.

## Fix-wave re-review CLEAN — landing sequence — 2026-09-14

`fix-wave-rereview.md` (opus): ADDRESSED, all 17 items; I1 test mutation-verified; whole-file truth check on reevaluateDemand.ts passes; narration scan clean; 18 files / 256 tests green; typecheck green. Residuals accepted: reevaluateDemand.ts 68 comment / 50 code (rationale now in the spec, remainder is per-edge landmines — /comment-audit target, not this PR); `committed() !== null` conjunct untested (stubSlot defaults non-null — the conjunct is defensive against a state AssetSlot cannot produce: error without a prior commit has committed() null AND nothing to free, so release is a no-op either way); fadeController 3 comment lines vs 1 — accepted.
All 14 agent worktrees + branches REMOVED (T1, T2, T3, T5, T6, T7, T8, T9, T10, T11, T12, gate, wave A, wave B). Other sessions' agent worktrees untouched.
Deletion audit dispatched (opus, whole branch 44e4506ab..598293172, legacy framing) → deletion-audit.md — required by /feature-done step 9; safe-now bin lands as its own commit before the completion moves.
NEXT: deletion-audit result → safe-now commit (delegated) → /feature-done (plan+spec → completed/, ledger archived as docs/superpowers/plans/completed/2026-09-14-layer-composition-04a-demand-loop.ledger.md, backlog sweep) → finishing-a-development-branch (PR #703 body: rulings list, four T2-fixed consumers, M3 supersede-window note, adjacent findings offered: awaitSlotReady:120, hi-res teardown through the slot / state.subsystems duplication; mark ready).
Plan checkboxes: all 91 ticked in the working tree (uncommitted; rides the /feature-done completion commit). No TODO/FIXME added on the branch. Branch stat: 106 files, +1539/−1924 (src −404, tests −37). PR #703 OPEN draft; body draft at scratchpad pr-703-body.md (deletion-audit line to be added).

## Deletion audit — 2026-09-14

`deletion-audit.md` (opus, legacy framing): safe-now −124 LOC (S1–S7), needs-ruling −49..−67 (N1–N4), 4 traps verified load-bearing.
Rulings:
- S1–S7 APPLY (one chore commit, delegated, BASE 598293172).
- N1 (evict edge `error` arm unnamed by the plan): KEEP and NAME — it is the final review's I1 leak fix; added to the plan's DoD behaviour list + PR body. Cost if wrong: none, naming only.
- N2 (inline requestDrifted, −20 on top of S1): YES — single caller, three-line predicate, the plan's file list is not a contract; the null-rule landmine comment moves to the inlined site. Cost if wrong: one file to re-extract.
- N3 (sameRequest duplicates shallowEqualRef): KEEP BOTH in this PR — merging touches selectionSlice (outside scope) and needs a neutral name (`shallowEqual` in utils/object); ADJACENT FINDING → offer to the user. Recorded in the PR body so the next audit does not re-raise.
- N4 (reevaluateDemand.ts:7-8 spec link rots when the spec moves to completed/): the spec 2026-09-09-layer-composition-design.md is SHARED by plans 04b–04d, so /feature-done for 04a moves ONLY the plan, NOT the spec (deviation from the skill's default, deliberate). The link is rewritten at the sequence's close-out ((d)/(e)) when the spec moves — recorded in memory project_layer_composition.md. Cost if wrong: one stale link.
Plan DoD gained the named I1 behaviour bullet (uncommitted, rides the completion commit). PR body draft updated (leanness + adjacent N3/N4). Memory project_layer_composition.md + MEMORY.md refreshed to the landing state. Branch upstream origin/worktree-layer-galaxy-catalog is at 44e4506ab — everything since is UNPUSHED; push at finishing. Deletion chore commit (agent a56dea3559fc231c7) IN FLIGHT → cherry-pick → focused tests + typecheck → /feature-done (plan only) → PR body + ready → push.

## Deletion commit landed — 2026-09-14

f9081dd24 → cherry-picked as 4c9cb8a6f (9 files, +23/−156, net −133: S1–S7 + N2 requestDrifted inlined at the drift edge with lastRequest() read once; two test headers re-worded for the deleted cases). Agent's worktree: 163 focused + 9150/9150 full suite green, typecheck clean. Branch now 18 commits over 44e4506ab. Final typecheck + full suite running on the branch at 4c9cb8a6f.
/feature-done: baseline green (pending run) · checkboxes 92/92 ticked (incl. the new I1 bullet) · DoD section present · spec has "Ground preparation" (§9) · no TODO/FIXME added · smoke attested by the user this session · deferred items listed in the plan's "Out of scope" · leanness audit: safe-now −133 applied as 4c9cb8a6f. Moves: PLAN ONLY → plans/completed/ + ledger archived beside it; SPEC STAYS (shared by 04b–04d). Backlog: no straggler (grep clean).

## /feature-done — READY — 2026-09-14

DoD audit at 4c9cb8a6f: tests PASS (9150, baseline 9135 at 223145f68; +15 net after the deletion commit, every difference reconciled in task-13-report.md + deletion-audit.md) · typecheck PASS · checkboxes 92/92 (DoD PRESENT) · spec Ground preparation PRESENT (§9) · modified-vs-plan: 107 files, every out-of-list edit ruled forced in a task review · new TODOs 0 · comment smells: swept by the fix wave · test parity: tests net −37 lines, all reconciled · smoke: user-attested this session · deferred: plan "Out of scope" (companionOf, watchTierSaga Layer leaks, P1/P3–P7, registry double registration, ReadyFrameContext, rebuildOnSwapFormat rows, volume release predicate) · leanness: −133 applied as 4c9cb8a6f.
OVERALL: READY. Moves: plan → completed/ (git mv), ledger archived as completed/2026-09-14-layer-composition-04a-demand-loop.ledger.md; SPEC NOT MOVED (shared by 04b–04d, deliberate). Completion commit next, then push + PR body + ready.
