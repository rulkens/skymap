# PR 2 — Layer-declared visibility — SDD ledger

Plan: docs/superpowers/plans/2026-10-14-layer-declared-visibility.md
Spec: docs/superpowers/specs/2026-10-13-layer-declared-visibility-design.md
Rulings: .superpowers/grill/2026-10-13-layer-declared-fades-rulings.md
Branch: layer-declared-visibility (wt layer-declared-fades), base main dc3c2cddc
Dev server: :5178 (bg shell bjk0r7wgq)

## Start
- Docs commit 5963c68c6 pushed. Draft PR NOT yet open: gh token expired (user to `gh auth login`).
- Pending asks: yq3x (parallelism + perf gate), vpQG (ADR 0012 in PR 2).
- Groups: A 1–4 Opus · B 5–8 Opus · C 9–10 Sonnet · D 11–12 Opus. review: yes inside A, on 7, inside D. One final whole-branch review with the uniformity mandate. CI gate. A/B + smoke as dash checks. Merge ask alone.

## Dispatches
- Ruling (yq3x): PR 2 alone, serial groups. Perf gate: `npm run perf:cpu` at Task 7 only (plan's 0.1 ms STOP).
- Group A dispatched (Opus, Tasks 1–4), base 5963c68c6. Draft PR still blocked on gh auth.
- Group A: Task 1 b7e0b9cc2 · Task 2 9c67f0d97 · Task 3 062913143 · Task 4 fbc80002e (Opus, 268 tool uses). Not pushed.
- Ruling: `LayerInstance.worldLabels` widening CONSENTED (WCWE) — fold into Global Constraints in the fix round.
- Mid-branch review of 5963c68c6..fbc80002e dispatched (Opus) → review-group-a.md.
- Review A: 0 high / 1 medium / 9 low (review-group-a.md). Fix round 8aba589ac (Opus, 52 tool uses): M1, L1–L4, L6–L8 fixed; L5 (`ShowEntry.field`) awaits ask FhoV; L9 left (dormant).
- Pushed 8aba589ac. Group B dispatched (Opus, Tasks 5–8), base 8aba589ac; perf:cpu before/after Task 7 vs :5178.
- Draft PR #912 opened (gh auth restored). CI watch on group A HEAD 8aba589ac.
- CI GREEN on #912 at 8aba589ac (typecheck · test · format 7m58s, Workers Builds pass).
- Group B agent retired at 638k (context limit) mid Task 8. Task 5 1055cf645 · Task 6 0efe5a312 · ShowEntry.field drop 61e27ae11 · Task 7 7c5ad70d3. Handoff: group-b-handoff.md. Perf gate PASSED (worst +0.098 ms, noise ±0.13; perf-before/after/after2.txt).
- Ruling enforcement: its `near0SphereBodies` took `slabBodyCandidates` = the REJECTED T7-5 option (a). Fix: core's own rosters SCENE_PLANETS (static; the store is set from it in createEngineData) + snapshot.meshBodies; no state threading. Assigned to the Group B continuation agent.
- Group B continuation dispatched (Opus): finish Task 8 from the handoff + near0 fix commit.
- Group B continuation (Opus): Task 8 1093e9b47 · T7-5 roster fix be262d89e. Pushed. Consent RRBX: UpsamplePassRow.fade.
- Mid-branch review of 8aba589ac..be262d89e dispatched (Opus) → review-group-b.md.
- CI GREEN on #912 at be262d89e (6m9s).
- Review B: 0 high / 2 medium / 9 low / 4 info (review-group-b.md). Pending ask m9bf: ContentCompute.fade consent (M1) + delete dead hasCloud/fieldLoaded. Fix round after answers.
- Rulings m9bf: ContentCompute.fade CONSENTED; dead hasCloud/fieldLoaded deleted here. Group B fix round dispatched (Opus).
- Fix round B (Opus): cbcfa4dc6 ContentCompute.fade · 869f91fab dead members + docs · 0e26f415c coreSceneBodyIds + L3–L8. Pushed. Group C dispatched (Sonnet, Tasks 9–10) base 0e26f415c.
- CI did NOT run on 0e26f415c: PR #912 CONFLICTING with main (4 new main commits; conflicts only zoneOfAvoidancePass.ts + its test, from #908 pick window). Merge main in AFTER group C finishes (tree busy), then CI.
- Group C agent retired at 506k mid Task 10. Task 9 1c2bbc53d. Task 10 uncommitted (15 failing tests in 5 files). Handoff group-c-handoff.md. Pending ask EjXW: ScalarVolumePassRow.fade consent + blackHolePickable switch read. Then: continuation agent, then merge main (ZoA conflicts).
- Rulings EjXW: ScalarVolumePassRow.fade CONSENTED; blackHolePickable caption branch dropped. Group C continuation dispatched (Opus).
- Group C continuation (Opus): Task 10 6a10f23af (blackHole caption check passed). Merged main → 6e39e2842 (ZoA pass+test conflicts resolved: main's view.window + branch's handed fade); tsc clean, 220 layer/frame test files pass. Pushed. Group D dispatched (Opus, Tasks 11–12).
- CI GREEN on #912 at 6e39e2842 (merge; covers Tasks 9–10 + B fixes), 7m26s.
- Group D (Opus): Task 11 6e57a679a · Task 12 578dc80db. RF#10 confirmed (cues ignored over); U5 fix landed. Pushed. Final whole-branch review dispatched (Opus, covers D's review: yes).
- CI GREEN on #912 at 578dc80db (all 12 tasks), 6m19s.
- Final review: 0 high / 2 medium / 8 low (review-final.md); no unconsented contract change. Pending ask q2Ye (M1 selected ring, L1 dead code, L3 fadeItem, L6 wesl comments). A/B main checkout .superpowers/ab-main (detached 872ac65e3, symlinked node_modules + public/data), main dev server :5177 (bg b2a3612rn). REMOVE after shots.
- Rulings q2Ye: all four as recommended. Final fix round dispatched (Opus).
- Final fix round (Opus): 9b57951fa M2/L4/L7/L8 · 0aaf92449 L1 · 40a65007a L3/L2 · cd17dd333 L6. M1 held (focus design grill c1U2). L5 skipped (not clean). Pushed.
- CI GREEN on #912 at cd17dd333 (8m13s). Open: c1U2 focus design (Task 13), ADR vpQG; then perf re-run, smoke pairs (main :5177 / branch :5178), merge ask.
- Ruling c1U2: focus design adopted fully. Task 13 docs agent dispatched (Opus, docs only).

## RESUME HERE (2026-10-16, pre-compact)
- Branch `layer-declared-visibility` HEAD cd17dd333 = Tasks 1–12 + all review fix rounds; draft PR #912; CI GREEN at cd17dd333. Tree clean.
- IN FLIGHT: Opus docs agent writing plan Task 13 ("The focused subject never recedes: recession leaves the handed value") + Group E row + spec edits (behaviour change #5 rewrite, Uniformity wording), docs only, no commit. Design = rulings log entry "ask c1U2 — RULED: adopt FULLY". ON REPORT: review its STOP questions/consumer list → ask user (one at a time) → user reviews Task 13 docs → commit docs → dispatch Group E implementer (Opus, review: yes) → mid-review → fix round.
- THEN: `npm run perf:cpu -- --url http://localhost:5178` (compare perf-before.txt); smoke pairs as dash checks (main :5177 from .superpowers/ab-main, bg shell b2a3612rn; branch :5178, bg bjk0r7wgq) per the plan's Manual smoke list incl. Task 6 panel order shot; update PR #912 body (still says "plan and spec only"); /feature-done DoD; merge ask ALONE last.
- OPEN ASK: vpQG (ADR 0012 in PR 2, my rec yes) — unanswered.
- CLEANUP at landing: `git worktree remove .superpowers/ab-main`, stop :5177, agent wts/branches, ledger archive to docs/superpowers/plans/completed/.
- Consents this PR beyond the plan's original list: WCWE LayerInstance.worldLabels · RRBX UpsamplePassRow.fade · m9bf ContentCompute.fade · EjXW ScalarVolumePassRow.fade · c1U2 focus design members (all in rulings log).

## RESUME HERE (2026-10-16, Group E dispatched)

- Task 13 docs: fERT RULED (world labels apply emphasis; `Label3DProducer.label` consented). User approved docs (bucL). Committed + pushed `d4ae438d5`; CI watch in bg.
- In flight: Group E implementer (Opus, background, this worktree, no push). On report: check commits/tsc/tests, parity outcomes, STOP items → mid-review (Opus) → fix round → push + CI watch.
- Then: perf:cpu vs perf-before.txt (--url http://localhost:5178), smoke pairs as dash checks (main :5177 / branch :5178), PR #912 body update, ADR vpQG ask, /feature-done DoD + diff breakdown, merge ask ALONE last, cleanup.
- Task 13: complete (ed1978ce6, pushed; CI watch bg). Parity passed all 7 kinds; no STOPs. Deviations: pass-factory entry lookup (purity ratchet), extra world-gate test, 5 frame fixtures gained selection rows.
- In flight: Group E mid-review (Opus, read-only) → review-group-e.md; perf:cpu → scratchpad perf-after3.txt (compare with sdd perf-before.txt). Then fix round.
- Group E review: review-group-e.md (C0 I2 M7). Main merged in (ca7a2189a, #913 + #914; clean; tsc both clean; 17174 tests pass; pushed; CI watch bg).
- perf: perf-after3.txt / perf-after3b.txt — labels:cosmo/near0 +0.03–0.07 vs perf-after2 consistently (director per-label path at rest?), no row >0.1 in run b. Fix round to check the at-rest path + reviewer's memo note.
- Asks queue (one at a time): ieQV (unfocus pop: latch focusPickId to structureFocus `active.id` through fade-out — rec) PENDING; then I1 (delete 5 surplus plan-mandated tests — rec yes). Then ONE fix round: I1/I2 outcome + minors (emphasisOf guard, director test `?? 1`, galaxyCatalog/frame.ts:120 comment, gate test to own mirror file, director at-rest cost).
- ieQV + PRWx RULED (rulings log). CI green at ca7a2189a.
- In flight: Group E fix round (Opus, this wt, no push): ieQV latch, PRWx deletions, minors, at-rest label perf. On report: verify gate, push + CI watch, re-run perf:cpu → perf-after4.txt vs perf-after2/before. Then smoke pairs, PR body, ADR vpQG, /feature-done, merge ask alone.
- USER DIRECTIVE: after the fix round, merge main into the branch again (main-into-branch, merge commit) before push.
- Fix round: complete (c536487e2 ieQV latch via structureFocus.lastFocusRef(); 612af896f PRWx; 2313b9b09 minors; e9eff75c5 at-rest label skip). Main unchanged → no merge needed. Pushed; CI watch + perf-after4.txt running bg.
- Ask dvSx PENDING: focusPickId lost `readonly` (matches focus/focusBlend). Offer later: pre-existing constellationLayerOpacity comment (review-group-e Minor). Hint: unused `state` runFrame.test.ts:298.
- A/B main server moved to b1cccb149, restarted → :5176 (bg brvsbxkcp; old b2a3612rn stopped). Interleaved perf pairs running (perf-main-a/b, perf-branch-a/b) — load avg ~50, single runs unreliable.
- PERF GATE (paired A/B vs main b1cccb149, 2 runs each): per-pose frame total −0.110…+0.085 ms, net neutral; local-group labels:near0 +0.10 (main's own run-to-run noise there 0.10). perf-ab-summary.txt. Backlog item f2cfe2c47 (dvSx) committed, not pushed. CI green e9eff75c5. NEXT: smoke pairs.
- Smoke: 5 at-rest pairs shot (data/shots/*-1812xx.jpg), identical to my eye; sent as dash checks + interactive list (ask wef2) PENDING. Main A/B on :5176.
- Smoke wef2: ALL PASS (5 pairs + interactive). Pushed f2cfe2c47; PR #912 body updated. CI watch bg. NEXT: ADR vpQG ask → /feature-done DoD + diff breakdown → merge ask alone.
- DoD audit running: tsc clean (only website github-slugger env gap), 1576 files/17170 tests pass. ADR 0012 committed 24d14fa5b (not pushed). Deletion audit (opus) + DoD verifier (sonnet) running bg → deletion-audit-pr912.md, scratchpad dod-verify.md.
- DoD verify: 13/13 DoD MET (scratchpad dod-verify.md). CI green f2cfe2c47. Deletion audit: deletion-audit-pr912.md — SAFE-NOW ~−37 src/−93 tests (dispatch after ruling); NEEDS-RULING ask 6Nm9 PENDING. Then: one deletion dispatch (safe-now + ruled), push, completion moves (tick DoD + smoke boxes, git mv plan/spec, archive ledger), diff breakdown, merge ask ALONE.
- 6Nm9 RULED (all five). Deletion agent (Opus, this wt, no push) running: commit 1 safe-now, commit 2 ruled. On report: verify gate, push, CI watch, then completion moves + diff breakdown + merge ask.

## RESUME HERE (2026-10-16, pre-compact #2)

- Branch `layer-declared-visibility`, draft PR #912. Pushed through f2cfe2c47 (CI green). Local unpushed: 24d14fa5b ADR 0012 (+ BACKLOG ADR row). Main = b1cccb149, already merged in (ca7a2189a); user directive: merge main in again if it moves before landing.
- Tasks 1–13 done; Group E review + fix round done; perf gate PASSED (perf-ab-summary.txt, neutral vs main); smoke ALL PASS (wef2); DoD 13/13 MET (scratchpad dod-verify.md); ADR vpQG → written.
- IN FLIGHT: deletion agent (Opus, this wt, editing tree, no push): commit 1 = SAFE-NOW bin of deletion-audit-pr912.md; commit 2 = 6Nm9 five ruled deletions. Tree is dirty while it runs (IDE diagnostics = its WIP). On report: check commits + gate (tsc both; vitest excl website/tools-site), push, bg CI watch.
- THEN /feature-done completion: tick plan DoD (13) + Manual smoke (13) boxes; git mv plan → plans/completed/, spec → specs/completed/; copy this ledger → plans/completed/2026-10-14-layer-declared-visibility.ledger.md; backlog sweep for the slug; commit `docs(plan): mark layer-declared-visibility complete` (NO Co-Authored-By); push; CI watch. Report audit table (Tests PASS 17170; Checkboxes; file inventory notes from dod-verify.md; TODOs 0; parity OK — 3 shrunk tests tracked src deletions; smoke FOUND; leanness net LOC from the deletion commits).
- THEN task diff breakdown (code/comment/test/doc lines) once; then the merge ask ALONE (never merge without an explicit merge word).
- Servers: branch :5178 (bg bjk0r7wgq); main A/B :5176 from .superpowers/ab-main at b1cccb149 (bg brvsbxkcp).
- Cleanup at landing: stop :5176, `git worktree remove .superpowers/ab-main`; remove agent-* worktrees + worktree-agent-* branches; ledger archived.
- Adjacent offers outstanding: pre-existing constellationLayerOpacity comment (review-group-e Minor); older visibleSourceMask names in DiskWalkInput/HiResFamousFrameInput/GalaxiesSection; unused isStructureId.
