# SDD ledger — plan: docs/superpowers/plans/2026-11-11-tier-swap-galaxy-reanchor.md

Branch: worktree-tier-swap-galaxy-reanchor. Spec+plan commit 5de807dd4 (base f9a85995c).
Rulings from ask VDzX (2026-11-12): plan approved; ONE PR, prep (Task 1) its own commit; frameFocusSaga stays in backlog.
Parallelism: one plan, one PR. Perf gate: none.
Ruling: no perf gate — no render-path or per-frame code changes (selection state + sagas only) — cost if wrong: an unmeasured saga cost on count pulses, visible in smoke.

Dispatch plan: D1 = Task 1 (Opus, review: yes) → mid review; D2 = Tasks 2+3 (Opus, T3 review: yes) → mid review; D3 = Task 4 (Sonnet); final whole-branch review (Opus).

Side stream (not this plan): dilateAtlas speed-up bg agent, own worktree + PR, NO merge without the user's word.

D1: Task 1 — opus — BASE 5de807dd4 — dispatched 2026-11-12 (agent a258f7f8873c179e0)
Side: dilateAtlas agent afed15354ba35d268 (sonnet, isolation wt, branch perf/dilate-atlas-frontier) — on report: relay PR + timings, ask merge in dash; never merge unasked.
D1 done: Task 1 — opus — 5de807dd4→5b640d44d — DONE_WITH_CONCERNS, 111 tool uses. Report task-1-report.md (5 deviations).
Ruling: deviation 3 (absent nulls current focus/pin) is reversed — absent retires only the pending request — spec §3 says "the pending focus clears", and losing the current pick on a bad link is a user-visible regression — cost if wrong: one small reducer case.
Ruling: deviation 2 (frameFocusSaga 3-line exit) kept — needed so an unclaimed deep link fails fast and doesn't wait for the 30 s backstop; it reads the new outcome, the idle guess stays (§6) — cost if wrong: 3 lines.
Deviation 1 (non-resident claimant → pending; tier drop does not clear) → owner ask udL2 (A tier-aware claimants recommended). Merge #1125 also in udL2.
Mid review Task 1: agent a56cf154ff77be2e4 (opus), running. Fix round after review + udL2, by resuming the implementer a258f7f8873c179e0.
Mid review Task 1 done (opus, 37 tools): 6 SHOULD + 2 NIT, no MUST. Fix round 1 → resumed implementer a258f7f8873c179e0.
Ruling: review #1 option (a) — drop engineStatusChanged retry; pre-createLayers request retires absent — spec §4.1 "no claiming row → absent" — cost: a 'fly' hash change typed during boot is dropped (rare).
Ruling: review #2 — structure/satellites/stellarStreams decode against loaded data where the row holds it; no contract growth — cost: format-only rows stay 30 s on a bogus id.
Ruling: review #4 — reducer-only requestRetired({slot}); never re-put the current ref (would re-fly the camera) — cost: one action.
Ruling: review #3 (pos@ miss over EVERY_SOURCE never absent) rides the udL2 ruling; not a regression (old code waited forever too).
Fix round 1: a7ec36dfe — full tsc clean, 190 files green. R2 deviation accepted: structure/streams decode by format before their data lands (no count pulse would wake a pending wait), absent after — cost: none beyond today's behaviour.
Task 1: complete (5b640d44d, a7ec36dfe). Galaxy non-resident claimant rule = follow-up commit after udL2.
D2: Tasks 2+3 — opus — BASE a7ec36dfe — dispatched (agent a2658a75e929c095a). Brief flags: match watchTierSaga's write mode so re-anchor doesn't re-fly the camera; hover-absent test.
D2 done: Tasks 2+3 — opus — a7ec36dfe→a559fa99e (eb5e6a6c4, a559fa99e) — DONE, 53 tools. Deviation accepted: reuse utils/object/shallowEqualRef, no sameRef (deletion beats addition); SELECTION_WRITE_BY_SLOT.focus = 'cut' (only re-anchor callers). Spec aligned a2b55eb99.
Task 2: complete (eb5e6a6c4). Task 3: complete pending mid review (a559fa99e).
Mid review Tasks 2+3: agent a252afee7f126c8d8 (opus). D3: Task 4 — sonnet — BASE a2b55eb99 — agent ab3fec6bb14d89d4c (serial writer; the 2+3 fix round runs after it).
D3 done: Task 4 — sonnet — a2b55eb99→c22bec9b0 — DONE. Deviations accepted: GalaxyCatalogReq.d.ts → layers/galaxyCatalog/@types (boundary test demanded it, via move-files); stale captureGalaxyFocusIds row in inlineTypeFiles + stale J8 line in selection-kind-facts backlog deleted. Dated audit/research docs left as records.
Task 4: complete (c22bec9b0).
Pushed c22bec9b0; draft PR #1127; CI watched in bg.
Mid review Tasks 2+3 done (opus): 0 MUST, 4 SHOULD, 3 NIT. Fix round 1 → resumed a2658a75e929c095a on c22bec9b0.
Ruling: F1/F2 — re-anchor skips slots with a pending request (not compare-and-set) — smaller, keeps reanchorWrites pure — cost if wrong: a pending slot isn't re-anchored until its request settles (it re-resolves then anyway).
Ruling: F4 — keep previous id on same-ref unresolved row; gate selectFocusId on row — keeps URL rule — cost: one branch in reextract.
Ruling: F5 header note only; F6 extract types; F7 trim headers. F3 = udL2.
CI did not run on #1127: PR CONFLICTING with main (compositions/README.md, tests/packages/website/objectCatalogue.test.ts). After the 2+3 fix round lands: merge origin/main into branch (no rebase), resolve, push, watch CI.
Fix round 1 (2+3): 98a8e9dd0 — F4 deviation: SelectionRowsState.extractedFrom (ref provenance) + setSelectionRow carries ref; final review to judge whether it's a mirror. Task 3: complete.
Merged origin/main 100d70dd5 (README: took main's, deleted the galaxyCatalog id-domain TODO row → tally 25 DONE / 8 TODO; the branch's "24/9" was wrong). Ratchet fix 0340bd338. Pushed; CI watched.
NEXT: CI green → udL2 galaxy rule follow-up (if A) → final whole-branch review (opus) → one fix round → feature-done → merge ask.
Final review: agent a903f4fc0a5624c92 (opus), started before udL2 answer; galaxy rule follow-up reviewed in its own small scope.
Final review done (opus): 0 MUST, 4 SHOULD, 3 NIT; DoD deliverables all present; spec goals + anti-goals met.
Ruling: adopt all 7, incl. NIT 5 — ids pair with their ref ({id, ref}) replacing extractedFrom — one record, not two parallel ones; F4 was my ruling, so this is mine too — cost: a payload-shape churn in tests.
One final fix round → resumed a2658a75e929c095a on 0340bd338. No re-review (protocol).
CI GREEN on 0340bd338 (typecheck·test·format 9m14s, cargo, Workers).
Final fix round: 1927a2aa0 — all 7 applied; SelectionAnchor {id, ref} replaces extractedFrom. Pushed.
CI GREEN on 1927a2aa0. Waiting on udL2 (galaxy rule + #1125 merge).

## Follow-up: galaxy no-data rule (ask Cu28, 2026-11-16)
User ruled "Full A: add tier getter": LayerCoreDeps gains `readonly tier: () => Tier` (contract consent given in Cu28). #1125 already MERGED (asked in qizV, dropped).
Ruling: bridge stays pure — `galaxyRecordBridge(records, canLoad: (source) => boolean)`; create.ts builds canLoad from deps.tier() + deps.settings(); `miss` filters claimants by canLoad, used by both resolveDurableId and resolvePosition — cost if wrong: pos@ may answer absent earlier than before (only when every loadable source is resident).
Ruling: famousGalaxy canLoad = true always (demand 'always', stays resident when off).
Dispatched follow-up implementer (brief followup-canload-brief.md). Next: review diff, merge origin/main (13 behind), push, CI, then /feature-done + smoke checks.
Follow-up landed: 5e5ff24cf (canLoad + LayerCoreDeps.tier), c23f04ae8 (survey entry by key). Merged origin/main 083bdcdc2 (resolveClipFoci header kept ours; wireInput/wireSlots tests took main's; stepCameraRuntime + watchRequestViewSaga tests moved to SelectionAnchor/FocusResolution). Pushed; CI watching. Next: /feature-done, smoke checks, merge ask.
/feature-done in progress: checkboxes 17/17, DoD present, spec Ground prep present. Dev server :5175 (public/data linked). Smoke = ask g57B. Deletion audit agent running → deletion-audit.md. CI watch b2igrj3fr.
Deletion audit: safe-now 4 applied in d4bc9eec0 (-46 LOC tests); needs-ruling 3 (inline refOfResolution, body boot-retire test, ids masking) — auditor leans keep on 1 and 3. Pushed; CI re-running.
CI red on d4bc9eec0: main had gained the asteroids Layer (decode returned a ref). Merged origin/main 742d043ea; 43c00da7d wraps asteroid decode in hitOrAbsent + test. Pushed; CI watch b1yi7yic1.
933bdee4e: body asteroid-number decode test → FocusResolution (CI red on 43c00da7d). Local full suite: only unrelated load timeouts (tools/textures 5s timeouts, website siteMode); pass in isolation except timeouts. CI watch b3hwveyii.
CI GREEN on 933bdee4e. Waiting on smoke ask g57B, then completion moves + merge ask.
- Smoke ask MyhK: all 6 PASS (2026-11-17). Merged origin/main (film look, clouds), typecheck clean. Completion moves done; next = CI watch, then merge ask.
