# SDD ledger — plan: docs/superpowers/plans/2026-10-29-selection-driven-layers.md

Asks (RNEt, "yes" 2026-10-29): plan approved; lean SDD, grouped dispatches A1=T1+T2, A2=T3+T4, B=T5+T6; perf gate after Part A, before #974 merges. Parallelism: one plan, one worktree.
Pre-merge: merged origin/main 4fdae3660 into branch (frameContext.ts slab-row filter + viewBandOf; no conflict with plan); pushed.
Ruling: review:yes tasks get Opus implementers and one mid-branch review per dispatch (covering its tagged tasks), not one per task — sdd-execution says tagged tasks get Opus + one review; grouping halves the seats — cost if wrong: a per-task issue found one dispatch later.
Dispatch A1 (T1+T2): opus, bdd810612→1ad4c4b13, DONE, 84 tool uses / 12.5 min. Pushed.
Task 1: complete (8dd85ca75)
Task 2: complete (1ad4c4b13) — deviations: new frame/frameBodyStates.ts (pick + cubemap callers share recipe); identity Mat3 orientation; 14 fixtures pass bodyStates; registry tests dropped.
Env: worktree node_modules lacked satellite.js (resolved main's) → `npm install` here; lockfile churn reverted. typecheck:fast 0 errors.
Review A1: opus, 30 tool uses — fix needed: Important cubemapCaptureFrame re-places per bake (spec: once per frame); Minors: stale caption identity comments, satellitePositioner rename + take Earth BodyState, sceneBodyStates header trim, hover-never-places test.
Minor (deferred, no fix): placeLiveSelection dedupe misses when first slot's extractRow is null (loading only, harmless).
Minor (noted): deleted transientPositions.test held surfaceFixedChain(transientId) case; covered end-to-end by transientFollow.
A1 fix round 1: resumed implementer ad3cd2db589893d37 with all but the deferred minor. DONE efc2de045 (17 tool uses), all 5 addressed (satellitePositioner → satellitePositionMpc; new frameBodyStates.test hover case). Pushed. No re-review (lean protocol).
Dispatch A2 (T3+T4): opus, efc2de045→e209fe250, DONE, 56 tool uses / 9 min. Pushed; CI green on e209fe250.
Task 3: complete (622d04379) — selectedSatelliteIndices.ts in subsystems/ (purity ratchet covers passes/)
Task 4: complete (e209fe250) — 7 asset-row stubs + 3 engine stubs; efe978552 re-applied incl. composition spec A7 row
Part A whole-branch review: opus, 21 tool uses — APPROVE, 4 minor wording (LayerCoreDeps:24, satrecOf header, layerImportBoundary comment, composition spec table width). Demand re-eval traced: live state.selection getter + per-frame reevaluateDemand + watchSelectionWakeSaga requestRender — same trigger chain as the old mirror.
Leftover-sweep session (ADR 0013 check, owner rulings via dash): followsSimClock meaning change → HOLD, discuss here before #974 lands; ShowEntry.selects → re-check vs ADR 0013 before Part B. User relayed 3 findings: untested ctx seam; per-frame json2satrec+sgp4 + caption identity; key placement on extracted row's poseId.
Perf gate (Task 7 step 1, pulled forward): scratch probe issCpu.mts (?perf, satellites on, #focus=satellite-25544, 15 s settle, collectCpu 300 frames running then paused), branch :5173 vs main scratch wt perf-main-974 :5174, A-B-A-B. Sum of spans ms/frame — running: branch 2.324 / 2.320, main 2.125 / 2.454; paused: branch 1.658 / 1.712, main 1.628 / 1.807. No measurable regression (noise ±0.2 both ways); labels:near0 paused branch 0.538/0.528 vs main 0.519/0.575 → caption-cache miss not visible. Unspanned work priced in node: json2satrec+sgp4 = 2.6 µs/call, ≤ 3 calls/frame (placement + trail pass ≤ 2) ≈ 8 µs desktop.
Ruling: no satrec memo — gate passes by >10× margin; plan says memo only if Task 7 asks — cost if wrong: a phone frame pays ~40 µs.
Merged origin/main 6cd9efbc6 (ADR 0013 + core-wide import ratchet): BACKLOG conflict resolved (kept deletions, took main's kind-facts wording, kept deep-link line); conventions tests 7217 pass; typecheck 0. Pushed c02f5c560.
Final fix wave: sonnet (agent a106f2e0869bd3dab), BASE c02f5c560 — extracted-row poseId + seam test + 4 review minors + spec satellitePositioner wording. followsSimClock untouched pending ruling.
Ask nFhn OPEN (dash): followsSimClock keep-one-flag (rec) vs own member; reveal home keep ShowEntry.selects (rec) vs SelectionKindRow.reveals. #974 does not land before the first is answered; Part B does not start before the second.
Final fix wave DONE: 76abf4b7f + 2de760f3f (sonnet, 19 tool uses). Seam test in frameContext.test.ts. Pushed; PR title/body updated; CI watch bg bueea1k8h.
Ruling: accept placeLiveSelection dedupe by ref identity (Set<SelectionRef>) — equal-but-distinct ref objects extract twice, 2.6 µs and an identical Map entry — cost if wrong: one extra satrec build a frame.
Ask nFhn ANSWERED: (1) followsSimClock → OWN MEMBER (user consented widening DriverGeometry; name `placedEachFrame?: true`, the example shown in the ask); (2) keep ShowEntry.selects (Part B as planned).
Dispatch split: sonnet (agent a2de278826a9c436b), BASE 2de760f3f — placedEachFrame read by placeLiveSelection, followsSimClock back to "moves" only; satellites row sets both; spec/plan wording.
Split DONE dc119075c (sonnet, 9 tool uses), pushed; PR body names the third consented contract change. CI watch bg bueea1k8h.
PR had conflicts (main #978/#981/#984; no CI ran on dc119075c): merged origin/main 7519406f7, BACKLOG conflict = adjacency only, kept deep-link line. typecheck 0; frame/camera/satellites/conventions 12360 pass. Pushed f8729d015; CI wait bg b352an2qb.
USER: "you can merge when ci passes" (2026-10-30) → on green f8729d015: gh pr ready 974, squash-merge #974. Then Part B (T5+T6) on a new branch off main; plan stays in plans/ (feature-done after Part B).
LANDED: CI green f8729d015 → #974 ready + squash-merged as 074befb1c.
Part B: branch worktree-selection-reveal off 074befb1c (same wt, upstream unset — push with -u origin).
Dispatch B (T5+T6): opus, BASE 074befb1c.
Dispatch B (T5+T6): opus, 074befb1c→df456a779, DONE, 65 tool uses / 7.8 min.
Task 5: complete (1cb5b9313)
Task 6: complete (df456a779) — deviations: saga before tests (guards broken on purpose to confirm tests bite); +2 tests; suspendDuringClip SCOPE comment.
Controller: 715847edd docs fix (completed satellites spec named transientPositions). Pushed; draft PR #988; CI wait bg blkixwvww. Part B review: opus (agent aaf3d3f5fc05c092c), diff partB.diff.
Ruling: Task 7 perf satisfied by the Part A measurement — Part B adds a saga on select/focus only, no per-frame work — cost if wrong: none measurable.
Eye-check shots: scratch wt main-074befb1c :5174 (bg bw3p9epkc), branch :5173 (bg bo66voq16). Cold `#focus=satellite-25544&t=2026-10-29T12:00:00Z`: main → "arrival failed: timeout" (no image); branch → arrives, Satellites on, ISS card + ring (scratchpad/cold-branch.jpg).
Part B review: opus, 25 tool uses — APPROVE; cold-link path traced real (navigateSaga → requestFocus → updateSelectionFocus). Minors: satellitesAssetRows header 157 cols; saga double check → one `enabled !== false`; arrival test title; restoreSceneSaga re-focus re-reveals after a tour (→ ask).
Fix wave B: sonnet (agent ab7d0deba864f0ee8) — header rewrap, saga single check, test retitle.
Fix wave B DONE 9a52603a9 (sonnet, 5 tool uses), pushed; CI GREEN on 9a52603a9.
Ask JKPA OPEN: 3 eye-checks (cold link branch/main, ISS follow 1 h/s) + restore edge (rec: put focus before mergeSnapshot so restored settings win).
Ask JKPA ANSWERED: eye-checks cold link branch Arrives, main Bug shows, ISS follow 1 h/s Looks right; tour restore → Fix (rec: focus first).
Ruling: tour-restore fix done as "reveal skips while a takeover runs" (selectTakeoverSource), NOT the recommended reorder — restoreSceneSaga.test pins settings-before-focus (likely so the focus tween frames with the restored lens); same outcome (viewer's switch survives) — cost if wrong: an exhibit that focuses a hidden kind doesn't reveal it (exhibits carry their own visibility).
Controller inline 7c5a4b741 (test first: failed, then passed; 31 files / 214 tests state/selection,arrival,scene,takeover,tour). Pushed.
Task 7: complete — perf (Part A run), eye-checks passed (JKPA), /feature-done.
DoD audit: npm test 1727 files / 19949 pass; typecheck 0; DoD grep clean. Deletion audit (opus, 26 tool uses): little to remove; report deletion-audit-parts-A-B.md; 0 safe-now applied (#6 kept for sibling-doc parity, #4 adjacent → ask); 5 needs-ruling → user.
Completion moves: plan + spec → completed/, this ledger archived beside the plan. → push → CI watch → update #974 title/body (stale) → mark ready → merge ask (only after checks, own ask).
Scratch: wt perf-main-974 (:5174, bg bs635n9sg) + branch dev server :5173 (bg b0ycyz2cg) — remove scratch wt after Part B perf/eye-checks.
