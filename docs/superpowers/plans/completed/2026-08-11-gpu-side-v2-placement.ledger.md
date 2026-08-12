# SDD ledger — plan: docs/superpowers/plans/2026-08-11-gpu-side-v2-placement.md

Branch: gpu-side-v2-placement · draft PR #547 · plan committed at 726d2682c.
16 tasks; DAG in the plan. House rules in force: implementers strictly serial
(sdd-execution.md Rule 2), reviews pipelined, implementers are background
sonnet agents that cd to this worktree, self-check with tsc, and commit with
explicit file lists; orchestrator runs npm gates (test/probe/lint) — probe
only on a quiet tree (HMR-vs-probe landmine). Open user thread: perf
baseline offer (rebuild-timing instrumentation) not yet answered — placement
rebuild path stays honest for a baseline until Group B wiring lands.

Task 1: dispatched (BASE 726d268, implementer sonnet, brief task-1-brief.md)
Task 1: NEEDS_CONTEXT round — implementer caught a false plan/spec claim
  (comps binding type change is NOT source-compatible: six splat files index
  flat vec4s; WGSL has no element reinterpret). Ruling: extend Task 1 to
  rewrite all six read sites to named field access; plan Task-1 checklist +
  spec "naming pass" para amended; brief regenerated; same implementer
  resumed. Doc amendments to commit with Task 1's review.
Doc amendment committed separately (a9bb2f10e); Task 1 BASE stays 726d268 —
  review package must span 726d268..HEAD minus a9bb2f1? NO: generate the
  package from 726d268; the doc commit is mine, reviewer sees it as context.
IN FLIGHT: Task 1 implementer (resumed after ruling). On DONE: orchestrator
  runs focused vitest + `npm run galaxy-renderer:probe` on the quiet tree,
  then review-package 726d268..HEAD, dispatch task reviewer (sonnet) AND
  Task 2 implementer pipelined (files disjoint: hiiRegions.ts vs Task 1 set).
  Serial implementer order after that: 3, 4, 5, 12 (rest of Group A), then
  6 → 7/8/14 per DAG gates.
User rulings this session: split-into-multiple-plans offered by user,
  declined by orchestrator (coupled via records.wesl + shared recalibration
  + deletion gate; one 16-task plan stands). Perf-baseline offer still
  unanswered — valid until Group B wiring lands.
Task 1: DONE_WITH_CONCERNS at 7d827dc13 (struct + 6 read-site rewrites +
  parity test; tsc clean; 18 tests green). Orchestrator probe run: FAIL,
  boot-failure signature — records.wesl missing from the tool's per-file
  symlink farm (milkyWay/field/). Implementer resumed with the fix
  (pre-review fix round; probe re-run after its commit). LANDMINE
  confirmed for Tasks 6/7/8/12/13/14/15: every NEW .wesl needs a leaf
  symlink under tools/galaxy-renderer/src/engine/shaders/ — put this in
  every shader task's dispatch brief.
Task 1: symlink fix 306549625; probe re-run PASS (27 sections, 256 sliders).
  Reviewer dispatched (sonnet, package review-726d2682c..306549625.diff).
Task 2: dispatched pipelined (BASE 306549625, implementer sonnet,
  brief task-2-brief.md) — files disjoint from Task 1's open review.
Task 1: minor (deferred): io.wesl:11 byte-layout doc still says "canonical —
  the offset authority" + [4i] prose at :259-262/:286-298 — stale now that
  records.wesl is SSoT; doc-only, follow-up pass.
Task 1: complete (commits 726d268..3065496, review clean)
Task 2: DONE at f486be286 (8/8 + 95/95 green, tsc clean) but orphaned
  sampleIsmMapEventPosition.ts (+test) — implementer resumed to delete it
  and any transitive orphans (pre-review extension, rg-guarded). Review
  package after the second commit; Task 3 dispatch follows.
Task 2: orphan deletion landed 034996feb (28 files/142 tests green, no
  transitive orphans). Reviewer dispatched (sonnet, package
  review-306549625..034996feb.diff, extension noted in prompt).
Task 3: dispatched pipelined (BASE 034996feb, implementer sonnet, brief
  task-3-brief.md; symlink landmine + no-test-plumbing resolution in
  dispatch). Serial order after: 4, 5, 12, then 6.
Task 2: complete (commits 3065496..034996f, review clean — zero findings)
Visual-pass plan agreed with user: (a) EARLY checkpoint when Task 4 lands +
  probe green — orchestrator starts the tool dev server and pings the user
  to eyeball the young-stars layer (arm-gather sharp lines should be gone);
  execution continues meanwhile. (b) Formal recalibration = Task 11 with
  user attestation. (c) Optional mid-point after Tasks 7-9 offered, user
  has NOT answered — ask again when Task 7 nears.
Task 3: DONE at ced5f7651 (ringReduce.wesl + createIsmMapRingReduce.ts +
  ringMeansBuffer plumbing through Output/Generator/Engine — deviation
  beyond brief's file list, flagged for reviewer; CPU fallback kept for
  non-fluid so ringMeansBuffer never stales). No new symlink needed:
  tools .../ismMap is a WHOLE-DIRECTORY symlink (unlike field/'s per-file
  farm) — check which pattern applies before assuming the landmine.
  Orchestrator probe: PASS (27 sections, 256 sliders) — workgroup_size(256)
  concern didn't bite. Reviewer dispatched (sonnet, package
  review-034996feb..ced5f7651.diff, deviation-assessment in prompt).
Task 4: dispatched pipelined (BASE ced5f7651, implementer sonnet, brief
  task-4-brief.md; files ismMapFluidVelocity.wesl + ismMapFluidStep.wesl +
  createIsmMapFluidRunner.ts, disjoint from Task 3's set; probe-by-
  orchestrator correction + 'auto'-layout trap in dispatch). On Task 4
  DONE + probe green: EARLY VISUAL CHECKPOINT — start tool dev server,
  ping user to eyeball young-stars layer. Serial order after: 5, 12, 6.
Task 3: complete (commit ced5f7651, review clean — spec OK, approved; two
  sanctioned minors: no host test [Task 5's job], CPU arrayMean loop stays
  [Task 10's job]. Deviation ruled legitimate plumbing, mirrors gridBuffer
  precedent). Carry-forward into Task 4's review: rebuild() must stay
  synchronous-submit (ring-means ordering relies on it) — INCLUDED in the
  Task 4 reviewer dispatch.
Task 4: DONE at 6df304786 (three brief files exactly; tsc clean both
  configs; judgment call flagged: kept curl.x in az term — "shear+curl"
  means FULL curl, revert path in task-4-report.md). Probe running in
  background (moved to bg at 300s timeout, task brfafe4wb). Task 4
  reviewer dispatched pipelined (package review-ced5f7651..6df304786.diff,
  curl.x derivation check + synchronous-submit carry-forward in prompt).
Task 5: brief generated (task-5-brief.md). DISPATCH BLOCKED until the
  background probe finishes (quiet-tree rule — Task 5 edits files AND
  runs its own probe iterations; for Task 5 ONLY the implementer runs the
  probe itself, the assertion-liveness check requires it). On probe PASS:
  dispatch Task 5 implementer + start tool dev server + PING USER for the
  early young-stars visual checkpoint. User asked about more parallelism:
  answered — serial-implementer rule binds; Task 12-in-nested-worktree
  offered as not-worth-it unless forced.
Task 4: probe FAIL — WESL link error, boot-breaker: rg16float is not a
  core storage-capable texel format (the BRIEF specified it — brief error,
  from my design correction; the linker rejects it as an unresolved
  identifier). Task 4 review itself came back clean (spec OK, approved;
  curl.x call verified as exactly {shear, curl} vs composedVelocity;
  synchronous-submit preserved) but reviewer couldn't see the probe.
  Fix round 1: same implementer resumed — switch starsVelocityTex to
  rg32float (core storage format, same 8 B/texel as rgba16float, honest
  two channels; read side is textureLoad-only so unfilterable is fine).
  On fix commit: orchestrator probe → scoped re-review via the SAME Task 4
  reviewer (SendMessage) → then Task 5 dispatch + early visual checkpoint.
  LANDMINE for later shader briefs: storage texture formats must be core
  storage-capable — rg16float/r16float etc. do NOT exist for WESL; use
  r32float/rg32float/rgba16float.
Task 4: complete (commits 6df30478 + fix 662f13282; probe PASS 27/256;
  scoped re-review approved — format swap complete, read side
  textureLoad-only so unfilterable rg32float is fine).
Task 5: dispatched (BASE 662f13282, implementer sonnet, brief
  task-5-brief.md). EXCEPTION in dispatch: Task 5 runs its own probe
  iterations (liveness check requires it), strict edit-probe-edit
  sequencing, must not kill other vite processes.
EARLY VISUAL CHECKPOINT OPEN: tool dev server running at
  http://localhost:5400/ (bg task b4obzm2vc — leave running). User to
  eyeball the young-stars layer: arm-gather sharp lines should be gone,
  young stars shear/swirl with local flow. Note: Task 5's engine-file
  edits may trigger HMR reloads in the user's tab — harmless.
  Execution continues meanwhile; on Task 5 DONE: review-package
  662f13282..HEAD, dispatch Task 5 reviewer + Task 12 implementer
  pipelined (Task 12 = fresh v2 arm-ridge WGSL port, new files — check
  file disjointness at dispatch). Serial order after 12: 6 → 7/8/14.
EARLY VISUAL CHECKPOINT PASSED (user, 2026-08-11): "the young stars layer
  looks better indeed" — arm-gather fix visually confirmed at 662f13282.
  Formal recalibration attestation still Task 11's. Dev server :5400
  stays up. Task 5 implementer resumed after a session-limit kill (no
  lost edits, tree was clean).
Task 5: DONE at a8f0c3fe2 (13 files: bufferStream refactor of
  createReadbackQueue sharing one chain, requestRingMeans hook,
  ?probeReadback URL gate + window.__probeEngine bridge in Viewport.tsx,
  readback:ringMeans probe step; full vitest 6818 green; probe 3x with
  liveness proof — corrupted run FAILED at 0.30 vs 1e-3, measured real
  diff 1.192e-7). Implementer concerns: tolerance tuned on one GPU
  vendor; requestRingMeansReadback intentionally dead until Tasks 6/9.
Task 5: reviewer dispatched (package review-662f13282..a8f0c3fe2.diff).
  PIPELINING OFF this round: Task 12's checklist extends the probe
  harness (probeGpuErrors.ts overlap with Task 5's review set) — Task 12
  dispatches ONLY after Task 5's review is clean. task-12-brief.md
  already generated. Task 12 dispatch must include: field/ per-file
  symlink landmine (armRidge.wesl is NEW under milkyWay/field), storage-
  format landmine, v1 generate.wesl arm math KNOWN-DIVERGED (fresh port
  from armRidgeGeometry.ts only), Task 5 harness naming (requestRingMeans
  / readback:ringMeans pattern).
User attestation logged above; user also asked about texture-formats-tier1
  support (~1.9% per Web3D Survey, Chrome-142-only) — rg32float ruling
  stands, no follow-up needed.
Task 5: review verdict — spec OK, approved WITH one Important: the
  wrapped readback Promise has no reject path (chainedStream catch only
  logs; mapAsync rejection = indefinite probe hang, first externally-
  awaited use of the pattern). Fix round 1: same implementer resumed —
  propagate errors to awaiters, keep fire-and-forget users log-and-
  continue, chain survives one request's failure; probe once after.
Task 5: minors (deferred): report phrasing "same as every other entry
  point" inaccurate (first callback->Promise wrapper on the handle);
  Viewport.tsx 5-level ../ import of hasUrlGate (matches existing
  ?gpuTimings convention). Reviewer ⚠ items: SETTLE_FRAMES=6 margin and
  1e-3 tolerance on other machines/vendors — both roll into Task 11's
  attestation environment, no action now.
  On fix commit: scoped re-review via SAME Task 5 reviewer (SendMessage),
  then Task 12 dispatch (still gated on this loop closing — file overlap).
Task 5: fix round 1 landed 8f4af98f9 (onError param through the queue's
  catch, Promise wrap rejects, probe step maps rejection to {ok:false};
  fire-and-forget callers untouched; probe PASS 1.192e-7 post-fix).
  Scoped re-review dispatched to the SAME reviewer. On approved: Task 5
  complete -> dispatch Task 12 implementer (BASE = 8f4af98f9,
  task-12-brief.md ready; landmines to inline: field/ per-file symlink
  for NEW armRidge.wesl, core storage formats only, v1 generate.wesl
  KNOWN-DIVERGED, Task 5 harness pattern names requestRingMeans /
  readback:ringMeans).
Task 5: complete (commits a8f0c3fe2 + fix 8f4af98f9, re-review approved).
  Minor (deferred): no automated test exercises the onError/reject path
  itself — verified by code trace only.
Task 12: dispatched (BASE 8f4af98f9, implementer sonnet, brief
  task-12-brief.md; dispatch carries: field/ PER-FILE symlink landmine,
  probe exception with edit-probe sequencing, Task 5 harness names,
  translation-not-redesign framing, core-storage-formats line). On DONE:
  review-package 8f4af98f9..HEAD, reviewer + Task 6 implementer pipelined
  IF file sets disjoint (Task 6 = ismMapDustCdfScan.wesl under ismMap/ +
  harness extension — LIKELY OVERLAPS probeGpuErrors.ts with Task 12's
  review set; check at dispatch, expect pipelining OFF again).
Task 12: DONE at b4fec29bd after a mid-task network kill + resume (tree
  survived; armRidgeDebugSample.wesl as real tools/ file RULED FINE —
  grade.wesl precedent). Probe PASS readback:armRidgeSample 2.711e-7 vs
  1e-4. Implementer deviation: geom: ArmRidgeGeometry param threaded
  (brief sanctioned "implementer's call") — Tasks 13/14 build buffer
  layouts against it, report has the shapes. Five of eight functions
  numerically unverified (brief scope) — reviewer asked to risk-assess.
  Reviewer dispatched (package review-8f4af98f9..b4fec29bd.diff,
  function-by-function translation check). PIPELINING OFF (Task 6
  overlaps probeGpuErrors.ts): Task 6 dispatches after review clean;
  task-6-brief.md generated. Serial order after 6: 7, 8, 14 (check DAG
  gates at each dispatch).
Task 12: review — spec OK, approved, ONE Important: numeric-validation
  gap on the six unprobed functions; warpSurfaceFrame + armRidgeFrameAt
  are highest-risk and the probed trio is no canary for them (never
  touches warp/cross-product). Fix round 1: same implementer — extend
  armRidgeDebugSample to sample armRidgeFrameAt (transitively validates
  curvePoint + warpHeight + warpSurfaceFrame) + armExcessSurfaceShape +
  armColor. Minor (deferred): CPU normalize3 zero-vector fallback vs
  WGSL normalize NaN — unreachable for real geometry. Reviewer verified
  extras: struct field sets, fixture constants, symlink target, all 3
  mock call sites. On fix commit: scoped re-review (same reviewer),
  then Task 6 dispatch.
Task 12: fix round 1 landed 0afa047ec (frameAt/excessSurfaceShape/armColor
  lanes added; probe PASS 6.103e-6 at lane 46 frame.along.z vs 1e-4 —
  warp/Gram-Schmidt/cross path now numerically validated). Implementer
  hit + fixed the backtick-in-WGSL-comment boot breaker mid-round
  (landmine confirmed live; diagnosis via server.ssrLoadModule on
  .wesl?static). Scoped re-review dispatched (same reviewer). On
  approved: Task 12 complete -> dispatch Task 6 (BASE = 0afa047ec,
  task-6-brief.md ready; ismMap whole-dir symlink so no symlink work,
  core-storage-formats, harness pattern names, probe exception).
Task 12: complete (commits b4fec29bd + fix 0afa047ec, re-review approved
  zero findings — all 6 previously-unverified functions covered, lane
  indexing spot-checked, fixtures digit-for-digit, no backticks).
Task 6: dispatched (BASE 0afa047ec, implementer sonnet, brief
  task-6-brief.md; dispatch carries: ismMap whole-dir symlink = no work,
  Task 12 debug-sample template pointer, backtick landmine, monotonicity
  note for Tasks 7/8 inverse-CDF, probe exception). On DONE: review-
  package 0afa047ec..HEAD; Task 7 (placeDust + rebuildDustMixture) gates
  on 1+6 both complete — DAG-eligible next; Task 7's files (placeDust.wesl,
  createGalaxyModel wiring) LIKELY overlap Task 6's review only at
  probeGpuErrors.ts if Task 7 extends harness — check at dispatch.
Task 6: DONE_WITH_CONCERNS at 3f4830649 after TWO watchdog stalls +
  resumes (ambient API instability; tree stayed clean throughout).
  Three entry points (csRingScan/csFoldRingOffsets/csApplyRingOffsets),
  weight table channel-dot vs armBiased, probe 7.629e-6 vs 1e-3.
  Concerns -> reviewer: armBiased path typechecks but numerically
  unvalidated (Task 8's consumer); debug-sample file-set deviation
  (Task 12 precedent); tolerance by analogy. Reviewer dispatched
  (package review-0afa047ec..3f4830649.diff). PIPELINING OFF (Task 7
  overlaps probeGpuErrors.ts/createGalaxyEngine.ts): Task 7 dispatches
  after review clean. task-7-brief.md generated (82 lines — placeDust +
  rebuildDustMixture; Task 7 gates on 1+6, both will then be satisfied).
Task 6: review — spec OK on the validated dust path, THREE Important:
  (1) armCount==0 short-circuit diverges from CPU armBiasedDensity
  (base vs base*(1-armBias)) — real divergence, carries into Task 8;
  (2) packIsmMapCdfArmEnvelope.test pins packer literals not WGSL struct
  (sibling packIsmMapCdfParams.test parses shader source — the model);
  (3) monotonicity asserted not proven — fix = probe-side adjacent-
  decrease check on the readback buffer. Fix round 1 dispatched (same
  implementer, all three + two deferred minors: armBias>1 clamp at
  Task 8 call site, debug-file breadth OK per precedent).
  On fix commit: scoped re-review (same reviewer), then Task 7.
Task 6: fix round 1 landed cff5707a8 (all three: CPU-matching zero-arm
  semantics, shader-parsing parity test, probe monotonicity check at
  zero epsilon — clean on real GPU output; full vitest 6826 green,
  probe 7.629e-6). Scoped re-review dispatched (same reviewer). On
  approved: Task 6 complete -> dispatch Task 7 (BASE = cff5707a8,
  task-7-brief.md ready).
Task 6: complete (commits 3f4830649 + fix cff5707a8, re-review approved
  zero findings — monotonicity failure path traced to FAIL summary).
Task 7: dispatched (BASE cff5707a8, implementer sonnet, brief
  task-7-brief.md; dispatch carries: Task 6 CDF host pointers +
  monotonicity guarantee, records.wesl named-field import, whole-dir
  symlink note, genRand-per-CPU-draw framing, clumping-loop-as-
  importable-function contract for Task 13, no-Larson-renorm (Task 9),
  probe exception, backtick + storage-format landmines, NEEDS_CONTEXT
  escape hatch for the size). On DONE: review-package cff5707a8..HEAD;
  next DAG-eligible implementers after 7: Task 8 (gates 1,2,6 — all
  met) or Task 14 (gates 1,12 — met); Task 13 needs 7's clumping fn.
  Check probeGpuErrors.ts overlap before pipelining, as usual.
Perf-baseline window: Task 7 wires the GPU path into rebuildDustMixture —
  the CPU-path baseline offer effectively CLOSES when this lands (noted
  to user; no answer, proceeding without baseline instrumentation).

## Parallel prep while Task 7 runs (2026-08-11)
- Briefs extracted ahead of time: task-8-brief.md, task-13-brief.md, task-14-brief.md.
- Read-only premise-verification scout (background sonnet, Explore) dispatched over those three briefs; report arrives as its final message. On arrival: fold VERIFIED/STALE/WRONG/VOLATILE verdicts into the next dispatches (Task 8 or 14 first, per DAG) as the verified-vs-inferred premises block. Scout is read-only — safe alongside the Task 7 implementer.
- Reminder recorded earlier stands: implementers strictly serial; no second implementer until Task 7 lands.

## Task 7: implementer DONE_WITH_CONCERNS (2026-08-11)
- Commit 6a1c2de44 on BASE cff5707a8. tsc x2 clean, vitest 1011 files/6837 green, probe PASS with real assertions (determinism bit-identical 6500 records; count matches budget math; survival floor 16/6500 non-vacuous — implementer self-caught a missing COPY_SRC that made the first probe run pass vacuously).
- Report: task-7-report.md. Key structure: clumping factored as buildClusteredDiscPlacementChild in NEW clusteredDiscPlacement.wesl (mode 0=mapDensity/1=smoothDisc; Task 13 adds mode 2 in the same if/else — import contract documented in report). rebuildDustMixture no longer dispatches: budget-only + dustPlacementRebuild keyed rebuild, dispatch deferred to ensureFresh() AFTER orientationTexRebuild (one-frame-late fill, zero readback). scheduleIsmMapReadback/scheduleOrientationReadback dropped their dust rebuild calls.
- CONCERN RULINGS (orchestrator):
  1. dustPlacementCap inert (Task 6 'channel' weight skips ring-mean-normalize+cap of dustParticleCloud.ts:208-218) → CORRECTNESS GAP, fix round 1 dispatched pre-review. Task 6 scan files authorized into scope; growth at the weight-mode seam; armBiased mode must be unaffected; probe parity must now prove the knob live.
  2. OrientationDeltaStats zeroed on GPU path (debug-only) → PARKED as deferred minor for final whole-branch review.
  3. One-frame-late fill via ensureFresh() → ACCEPTED as the design (load-bearing ordering decision; zero-readback guarantee intact).
  4. smoothDisc mode has no probe numeric exercise → included in fix round 1 (generator 'none' fixture through readback:placeDust) — pins mode 1 before Task 13 adds mode 2.
  5. dustParticleCloud.ts/clusteredDiscPlacement.ts left in place → per plan (Task 16 deletes).
- Fix round 1 dispatched by resuming the Task 7 implementer (round 1 of 5). On DONE: review-package cff5707a8..HEAD (full multi-commit range incl. fix), dispatch task reviewer with brief+report+package. Reviewer lens must include: RNG draw-order mapping (two populations, slot tables in report), the Task-13 import contract on buildClusteredDiscPlacementChild, the dustPlacementCap fix's armBiased non-interference, deferred armBias>1 clamp context (Task 6 entry), and the report's ensureFresh() ordering claim.
- Premise scout (briefs 8/13/14) still running — its verdicts now partially stale for ismMapDustCdfScan citations (fix round touches those files); treat its Task-8 scan citations as VOLATILE when it reports.

## Premise scout report landed (2026-08-11)
- Saved to brief-premises-8-13-14.md — hand its path to the Task 8/13/14 dispatches (do NOT paste). Headlines:
  - Task 8: hiiRegions.ts drift systemic; rebuildHiiIfSeeded (createGalaxyModel.ts:440-454) is ONE unified rebuild (shells+DIG+young-stars) via centralHiiMixtureAndSegments — no separable DIG branch. Task 8 dispatch must carry this restructuring question explicitly.
  - Task 13: clumping extraction ALREADY DONE (clusteredDiscPlacement.wesl pre-annotated for mode 2u); rebuild-encode shape (createKeyedRebuild+ensureFresh vs setFieldTuning-owned encoder) is an explicit orchestrator decision to make at dispatch.
  - Task 14: premises near-perfect; setFieldTuning is a SHARED touch point with Task 13 — serial order decides encoder ownership; never pipeline 13 and 14 implementers.
  - Scan-file citations may re-drift under fix round 1 (ring-mean+cap mode) — re-check only those two files at Task 8 dispatch.

## Task 7: fix round 1 DONE (2026-08-11)
- Commit d0cfbfc5d on top of 6a1c2de44. tsc x2 clean, vitest 1011/6837 green, probe PASS: CDF scan parity vs ring-normalized+capped CPU formula max|delta| 3.052e-5 (dustPlacementCap LIVE again); monotonicity holds; mapDensity mode 3/6500 survival-zeroed + bit-identical determinism + count match; smoothDisc mode pinned (0/6500 zeroed, matches CPU's no-filter guarantee).
- NEW out-of-scope PRE-EXISTING bug (implementer-found): setting ismMap.generator='none' via setFieldTuning throws GPU validation — disabled-generator clear path writeTexture()s into ismMapTex/ismMapDustBlurTex/ismMapCartesianTex which lack COPY_DST (createIsmMapGenerator.ts/createIsmMapOutput.ts). Probe works around via forceGeneratorIsFluid override. PARKED → surface at plan end as a BACKLOG entry (affects real users disabling the generator in the UI). Do not fold into this plan.
- Deferred minor: dispatchDustCdfScan can double-dispatch in one synchronous setParams call when both triggers fire — harmless wasted work, park for final review/perf pass.
- Task reviewer dispatched (background sonnet, read-only) over review-cff5707a8..d0cfbfc5d.diff with brief+report; writes task-7-review.md. Lens: RNG draw-order tables, rebuildDustMixture/ensureFresh rewiring + no-mapAsync, ring-mean+cap formula vs CPU density(), armBiased non-interference, Task-13 import contract.
- Pipelining OFF: Tasks 8 and 14 both edit createGalaxyModel.ts (in Task 7's diff) — next implementer waits for review verdict.
- On review approved: ledger completion line, board #24 → completed, then dispatch Task 14 implementer (premises near-perfect per brief-premises-8-13-14.md) with the scout report path + the setFieldTuning encoder-ownership decision made explicitly at dispatch. Task 8 follows (needs the rebuildHiiIfSeeded restructuring question answered in its dispatch).

## Task 7: review verdict + fix round 2 (2026-08-11)
- Review (task-7-review.md): spec ✅ (checklist fully verified against ground truth incl. byte-identical RNG, structural ensureFresh ordering, no production mapAsync); quality needs-changes (minor). 3 Important, 3 Minor.
- Fix round 2 dispatched (same implementer, round 2 of 5) with the 3 Importants:
  1. Survival-floor ringMean uses floor-bucket cdpRingIndexForSample; CPU uses round-to-nearest ismMapRingIndexForRadius — RULING: parity fix (port round-to-nearest for the divisor lookup only; numerator floor semantics stay). Mirror the CPU's mixed-semantics ratio, don't "fix" it.
  2. placeDust.wesl's DUST_SURVIVAL_FLOOR_FRAC comment claims parity-test coverage that doesn't exist — extend constants.parity.test.ts single-file check to a files loop.
  3. Stale setFieldTuning comment (createGalaxyModel.ts:1041-1049) describes the deleted CPU-readback determinism tradeoff.
- Deferred minors PARKED (final whole-branch review triages): (4) PLACE_DUST_POP_CHILD reuses CDP_POP_CHILD's numeric value with an implicit slots-0-5/slot-6 split contract undocumented in either file — CARRY A POINTER INTO TASK 13'S DISPATCH (its mode-2u addition could silently collide with slot 6 if it adds a genNormal to the shared child scatter); (5) size-floor test asserts only sizeMin>0/sizeMax>sizeMin — tautological; (6) PLACE_DUST_PARAMS_FLOATS=32 comment says 8 vec4 rows, struct is 7 (28 scalars) — one slack row unexplained.
- ⚠️ items resolved by orchestrator: probe PASS accepted on report evidence; wesl-shaders skill was in the dispatch; ring-index visual detectability mooted by the parity ruling; COPY_DST bug already parked.
- On fix round 2 DONE: regenerate review-package cff5707a8..HEAD, scoped re-review by SAME reviewer (findings 1-3 only), then on approval → completion line, board #24 completed, dispatch Task 14 implementer.

## Fix round 2: watchdog stall + resume (2026-08-11)
- Implementer stalled mid-round (600s watchdog, ambient infra — stall #1 on THIS transcript). Tree intact with in-progress edits (both .wesl + constants.parity.test.ts), HEAD d0cfbfc5d. Resumed via SendMessage. If this transcript stalls twice more, round 3 goes to a FRESH implementer per protocol.
- Stall #2 on this transcript (same watchdog signature). Tree unchanged/intact, resumed again via SendMessage. NEXT stall on this transcript → dispatch a FRESH implementer for round 2 (carry brief + report + the 3 findings; uncommitted tree state is the handoff).
- Stall #3 on the Task 7 implementer transcript → protocol tripped: FRESH implementer dispatched (background sonnet) to complete round 2 from the uncommitted tree (4 files: both .wesl, constants.parity.test.ts, createGalaxyModel.ts — all four findings' target files already touched). Verified no orphaned probe process. Fresh agent audits inherited diff against findings 1-3, completes, checks, commits one commit on d0cfbfc5d, appends "Fix round 2" to task-7-report.md. Original Task 7 transcript is RETIRED — do not resume it again.
- On DONE: regenerate review-package cff5707a8..HEAD → scoped re-review by the SAME reviewer (findings 1-3 only).

## Task 7: fix round 2 DONE, re-review dispatched (2026-08-11)
- Commit 10f96bb81 (fresh implementer verified inherited edits verbatim-correct, committed as-is). tsc x2 clean, vitest 1011/6837, probe PASS; survival-floor count 3/6500 → 4/6500 (expected from round-to-nearest ring-index fix).
- Scoped re-review dispatched to SAME reviewer over review-cff5707a8..10f96bb81.diff, findings 1-3 only. On all-resolved: Task 7 COMPLETE (board #24), then dispatch Task 14 implementer (scout premises near-perfect; explicit setFieldTuning encoder-ownership decision in dispatch; carry brief-premises-8-13-14.md path + the PLACE_DUST_POP_CHILD slot-contract pointer is for TASK 13's dispatch, not 14).

## Task 7: COMPLETE (2026-08-11)
- Re-review verdict: all resolved. Commits 6a1c2de44 + d0cfbfc5d + 10f96bb81, pushed (cff5707a8..10f96bb81 → origin/gpu-side-v2-placement). Board #24 completed.

## Task 14: implementer dispatched (2026-08-11)
- BASE 10f96bb81. Background sonnet. Board #26 in_progress.
- Dispatch carried: brief + brief-premises-8-13-14.md paths; Task 12 armRidge.wesl import contract (never generate.wesl's v1 copies); records.wesl SSoT; createGrowOnlyRecordBuffer; RULING — rebuild-encode shape follows Task 7's createKeyedRebuild+ensureFresh pattern, setFieldTuning gets NO encoder (NEEDS_CONTEXT escape hatch if a synchronous dependency blocks deferral); no flux-renorm baking (Task 15's consume-time uniforms); slot-hash RNG only; amplitude-as-liveness; symlink rules (field/ per-file farm needs a leaf symlink for any new field/ .wesl); backtick + storage-format landmines; probe self-run with strict sequencing.
- On DONE: review-package 10f96bb81..HEAD → task reviewer (lens: armRidge import fidelity vs re-port, RNG population tags distinct from dust's, keyed-rebuild wiring correctness, no baked renorm). Then Task 13 next (its dispatch carries: extraction already done — add mode 2u to clusteredDiscPlacement.wesl; the PLACE_DUST_POP_CHILD slots-0-5/slot-6 contract warning; encoder pattern now set by Task 14's landed wiring).

## Task 14: infra stalls (2026-08-11)
- Stalls #1 and #2 on the Task 14 implementer transcript, tree clean at 10f96bb81 both times (agent was in reading phase; nothing lost). Cause: model availability outage (SendMessage classifier reported the model temporarily unavailable between the stalls). Resumed twice; second resume told it to commit in small increments (shader+host once typechecking, then wiring) to cheapen future recoveries. NEXT stall on this transcript → fresh implementer with the same dispatch content.

## Task 14: implementer DONE_WITH_CONCERNS, reviewer dispatched (2026-08-12)
- Commits b92fb3226 (feat: placeArmSpurCloud.wesl + host + packers + wiring + GalaxyFieldMixtureResult type) + 2ed74ee21 (probe step) on BASE 10f96bb81. tsc x2 clean, vitest 1011/6839 green, probe PASS (new step: 15 records, bit-identical, count matches deriveArmSpurCloudCount, all live/finite).
- CONCERN RULINGS (orchestrator):
  1. EXTRAS LOSE GPU-PLACED CLOUDS (buildGalaxyFieldMixture shared by central + MultiGalaxySection extras; GPU fill is central-only — applies to dust since Task 7 too). Dev-tool-only blast radius. TREATED AS PLAN-WIDE SCOPE CUT pending USER SIGN-OFF — surfaced to user in chat 2026-08-12; if user objects, becomes a backlog item or plan amendment. Reviewer asked to fact-check blast radius.
  2. GalaxyFieldMixtureResult return-type ripple + reworked flux-conservation tests → reviewer verifies not-tautological.
  3. Spur cloud OVER-BRIGHT until Task 15's renorm uniform — expected sequencing; warn user before any visual pass.
  4. CPU buildArmSpurParticleCloud left in place per Task 16 convention. 5. No visual/perf pass — out of scope.
- Reviewer dispatched (background sonnet) over review-10f96bb81..2ed74ee21.diff. Lens: armRidge import fidelity (never generate.wesl v1), RNG mapping, keyed-rebuild wiring (no setFieldTuning encoder), flux-test tautology check, extras blast-radius fact-check.
- Editor diagnostic about requestArmSpurCloudPlacementReadback missing on GalaxyEngineHandle = stale-editor noise (implementer's tsc clean x2); do not chase.
- Pipelining OFF (Task 13 would edit createGalaxyModel.ts, in this diff). On review approved: Task 13 dispatch carries — mode 2u goes into existing clusteredDiscPlacement.wesl (extraction done); PLACE_DUST_POP_CHILD slots-0-5/slot-6 contract warning; encoder pattern = whatever Task 14's landed wiring established; premises file path.

## Parallel prep round 2 (2026-08-12)
- Briefs extracted for ALL remaining tasks: 9, 15, 10, 16, 11 (8/13/14 already had briefs).
- Second premise scout dispatched (background sonnet, read-only) over briefs 9/15/10/16/11. Task 16 gets special attention: full importer inventory (src/ + tests/) for the four CPU files it deletes/trims. On arrival: save report to brief-premises-9-15-10-16-11.md and fold into dispatches.
- Two agents now live: Task 14 reviewer + this scout (both read-only over mostly disjoint areas; reviewer owns the Task 14 diff, scout reads CPU sources + briefs).

## Task 14: review verdict + fix round 1 (2026-08-12)
- Review (task-14-review.md): spec ✅ (full contract verified incl. RNG mapping, armRidge import-not-report, no baked fluxWeightSum, no production mapAsync/encoder); quality needs-changes. Critical 1, Important 2, Minor 2.
- Fix round 1 dispatched (same implementer, round 1 of 5):
  1. CRITICAL: dust-only setFieldTuning path repacks/zeroes spur slots without invalidating spurCloudPlacementRebuild → spur cloud vanishes on dust-only slider drag until an arms/disc change. Fix guidance: invalidation lives with whoever zeroes the slots (check dust's own mechanism, mirror if sound); regression = probe assertion driving a dust-only change then re-reading spur records (one-shot boot readback provably cannot catch this).
  2. IMPORTANT: flux-ledger vitest now credits spurCloudReservation.flux (circular) — restore real coverage; honest home is probe-side raw-flux sum vs CPU expected (raw parity, Task 15 renorm not baked).
  3. IMPORTANT (extras lose spur cloud): NOT in the loop — already adjudicated as plan-wide scope cut pending user sign-off (see Task 14 concern rulings above). Reviewer confirmed dev-tool-only blast radius.
- Minors parked (deferred): see review file (2).
- On DONE: review-package 10f96bb81..HEAD, scoped re-review by SAME reviewer (findings 1-2 only).

## Scout 2 report landed (2026-08-12)
- Saved to brief-premises-9-15-10-16-11.md — hand its PATH to each remaining dispatch. Headlines:
  - TASK 16 CRITICAL: brief's Files list omits dustParticleCloud.ts, which still imports+calls buildClusteredDiscPlacement (:243) — executing as-briefed breaks the build. Dispatch MUST extend scope: trim buildDustParticleCloud (constants survive — consumed by computePlaceDustBudget/createIsmMapPlaceDust/deriveDustHeaderLanes), handle its test. Also: armSpurParticleCloud.test.ts NOW calls buildArmSpurParticleCloud (brief's "none found" stale).
  - Tasks 9/15: briefs cite a variable `dg0` that has NEVER existed — actual is rec.amplitude (dustMap/fragment.wesl:240; fieldSplat/fragment.wesl:49). Correct in dispatches.
  - Task 10: dust half of its "today" description already done by Task 7 — only rebuildHiiIfSeeded() calls remain to strip; post-Task-8 only; its `npm test -- createGalaxyModel` checkbox is dead (no such tests — probe-only coverage).
  - Task 11: gating confirmed accurate.

## Task 14: fix round 1 DONE, re-review dispatched (2026-08-12)
- Commit c1f450fc1 (3rd commit of task). tsc x2, vitest 1011/6839, probe PASS. New probe assertions: flux parity 11.3885 vs 11.3885 (rel err 1.4e-7); dust-only-change regression (15 live before/after). Critical fixed by MOVING invalidation into repackFieldComponents() (slot-zeroer owns invalidation); added requestArmSpurCloudBufferPeek (no-dispatch copy) for the regression probe.
- NEW REOPENED-TASK-7 DEFECT (implementer-confirmed): dustPlacementRebuild has the identical invalidation-ownership bug — fieldMoved-only repack zeroes dust slots without invalidating → dust vanishes on arms-only slider drag. NOT fixed in c1f450fc1 (out of Task 14 scope). PLAN: after Task 14 re-review approves, dispatch the SAME implementer for a targeted twin fix (own commit: dustPlacementRebuild.invalidate() into repackFieldComponents alongside spur's, + probe regression driving an arms-only change re-reading dust records) + scoped review. Sequence BEFORE Task 13 dispatch (same file).
- Disclosed residual gap in flux parity check: product-preserving sigma permutations invisible (only sigma product recoverable from det(invCov)) — accept, noted for final review.
- Scoped re-review dispatched to same reviewer (findings 1-2 only) over review-10f96bb81..c1f450fc1.diff.

## Task 14: COMPLETE (2026-08-12)
- Re-review: all resolved (invalidation-in-repack covers all 4 call sites incl. setExtras; flux check genuinely independent — expected side from det(invCov)+CPU armExcessSurfaceShape, never touches amplitude). Commits b92fb3226+2ed74ee21+c1f450fc1 pushed. Board #26 completed.

## Dust twin fix: dispatched (2026-08-12)
- Same implementer (Task 14's, context intact), own commit on c1f450fc1: dustPlacementRebuild.invalidate() into repackFieldComponents; reason through per-caller redundancy (rebuildDustMixture's invalidate may still cover budget-change-without-repack); probe regression = arms-only change + no-dispatch dust peek (add requestDustBufferPeek mirroring spur's). On DONE: scoped review (can be the Task 14 reviewer — it knows the mechanism), then Task 13 dispatch.

## Dust twin fix: DONE, scoped review dispatched (2026-08-12)
- Commit d4ffebde2. tsc x2, vitest 1011/6839, probe PASS (6494 live dust records before/after arms-only change). Invalidation into repackFieldComponents; rebuildDustMixture's own invalidate removed (3 call sites traced, all unconditionally repack after); rebuildIsmMap's invalidate KEPT (load-bearing for bare ismMapFluid-drag path); dispatchDustCdfScan's redundant invalidate untouched (out of scope).
- Implementer's "would fail pre-fix" is code-path-traced, not revert-verified (probe sequencing constraint) — reviewer asked to assess whether the trace suffices or an empirical revert-check is warranted.
- On approved: push, then Task 13 dispatch (createGalaxyModel.ts now settled). Task 13 dispatch must carry: brief-premises-8-13-14.md path (extraction done, mode 2u into clusteredDiscPlacement.wesl), the PLACE_DUST_POP_CHILD slots-0-5/slot-6 RNG contract warning, encoder pattern = keyed-rebuild+ensureFresh per Tasks 7/14 landed precedent (incl. the NEW invalidation-in-repack ownership), no flux renorm baking (Task 15), radialTilt must be ported fresh (not in armRidge.wesl — scout-verified).
- Stale-editor diagnostic re requestDustBufferPeek on GalaxyEngineHandle: noise, tsc clean x2.

## Dust twin fix: APPROVED + pushed; Task 13 dispatched (2026-08-12)
- Scoped review 2: approved, no findings (reviewer independently reconstructed the pre-fix trace, accepted without revert-rerun; asymmetry noted for awareness only). d4ffebde2 pushed.
- Task 13 implementer dispatched (background sonnet), BASE d4ffebde2. Board #27 in_progress. Dispatch carried: brief + premises paths; extraction-already-done (mode 2u into clusteredDiscPlacement.wesl); RNG slot contract (CDP/PLACE_DUST pop 0xC41D, slots 0-5 shared + 6 dust size — choose non-colliding, document at the constants); placeArmLaneComplex + ARM_FADE_REJECTION_TRIES part of port; radialTilt fresh port (armParticleCloud.ts:149-152); armRidge.wesl imports; spur-pattern wiring (keyed rebuild + ensureFresh, invalidation joins repackFieldComponents, GalaxyFieldMixtureResult reservation); no renorm baking; probe steps mirroring spur's incl. liveness regression; incremental commits.
- On DONE: review-package d4ffebde2..HEAD → task reviewer (lens: analytic-mode port fidelity vs placeArmLaneComplex + rejection-tries semantics under amplitude-as-liveness, RNG slot non-collision, shared-branch non-regression for modes 0/1, invalidation ownership, flux-parity independence). Then Task 8 (premises file warns: rebuildHiiIfSeeded is ONE unified rebuild — restructuring decision goes in its dispatch).

## Task 13: implementer DONE, reviewer dispatched (2026-08-12)
- Commits 4096ebb97 (shader+host+mode 2u+reservation) + 3b85813b0 (wiring+probe) on BASE d4ffebde2. tsc x2, vitest 1011/6839, probe PASS (readback:placeArmCloud: determinism, budget count, liveness, flux parity 1.6e-7, survives-dust-only-change).
- Concerns: (1) extras cut — already adjudicated plan-wide; (2) ARM_CLOUD_FLUX_TOLERANCE copied from spur not calibrated — minor, park; (3) four files hand-mirror TAU_ROOT3-etc constants, no parity test — reviewer asked to inventory + assess drift danger; (4) CPU path dead per Task 16 convention.
- Reviewer dispatched (background sonnet) over review-d4ffebde2..3b85813b0.diff. Lens: shared-branch (modes 0/1) byte-for-byte non-regression, RNG slot contract non-collision + documented, placeArmLaneComplex + rejection-tries fidelity under amplitude-as-liveness (all-tries-fail case!), radialTilt fresh port present, flux-parity independence (not amplitude-circular), reservation not tautologizing flux tests.
- On approved: push, Task 8 next (dispatch must carry: premises Task-8 section incl. rebuildHiiIfSeeded-is-unified restructuring question, hiiRegions.ts systemic line drift warning, deferred armBias>1 clamp context from Task 6 entry, Task 6 CDF host armBiased mode pointers).

## Task 13: review verdict + fix round 1 (2026-08-12)
- Review (task-13-review.md): spec ✅ (port fidelity fully verified incl. keep-last-draw rejection semantics, spanStartLogR equivalence, weighted-pick fallback; flux probe independent; ledger test not tautological); quality needs-changes. 0 Critical, 1 Important, 4 Minor.
- Important: arm-cloud draws bit-identical to dust's at coincident (pop,idx,slot) — same untagged seed + reused 0xC41D pops; CPU used per-tier seed salts, spur used a distinct pop tag. Fix round 1 dispatched (same implementer): distinct pops for BOTH complex+child level (spur precedent preferred), dust/spur outputs must be byte-for-byte UNCHANGED (probe-pinned), 3-tier slot contract documented. Arm values re-baseline.
- Minors parked: 4 hand-mirrored constant sets w/o parity test (also Task 13 concern 3 — final review triages, note Task 16 deletes some mirrors); ARM_CLOUD_FLUX_TOLERANCE uncalibrated copy; dead CPU path (Task 16); extras (adjudicated).
- On DONE: package d4ffebde2..HEAD, scoped re-review same reviewer (the 1 Important only).

## Task 13: fix round 1 DONE, re-review dispatched (2026-08-12)
- Commit 7f6230698. Fix: buildClusteredDiscPlacementChild parameterized on popComplex/popChild; dust passes original CDP constants (byte-identical, MUTATION-VERIFIED against pre-fix commit in a disposable worktree); armCloud passes distinct ARM_CLOUD_POP_* tags; 3-tier slot doc updated. Arm flux parity re-baselined 1.5e-7. tsc x2, vitest, probe PASS multiple runs.
- NEW PRE-EXISTING PROBE FLAKE (Task 7 artifact, implementer-proven present pre-fix): readback:placeDust survival-floor assertion hard-fails when a run lands on exactly 0 zeroed particles — across-run fluctuation from fluid-sim GPU noise (within-run determinism intact). HANDLE AFTER RE-REVIEW: targeted fix dispatch (same implementer) to make the assertion robust without weakening it (e.g. fixture/preset that guarantees a nonzero floor-miss population, per Task 7's own brief language, or assert on a deterministically-seeded fixture rather than the evolving fluid state). Flake threatens every remaining task's probe runs (8/9/15/10/16/11).
- Scoped re-review dispatched (the 1 Important only). On approved: push, flake fix, then Task 8.

## Task 13: COMPLETE (2026-08-12)
- Re-review: RESOLVED, no unresolved findings. Commits 4096ebb97+3b85813b0+7f6230698 pushed. Board #27 completed.

## Probe flake fix: dispatched (2026-08-12)
- Same implementer (characterized the flake). Scope: probe harness only — survival-floor assertion against a deterministic fixture/tuning guaranteeing nonzero floor-miss (NOT weakened); 3 consecutive probe PASSes required; NEEDS_CONTEXT if production-side change needed. On DONE: scoped review (Task 13's reviewer), push, then Task 8 dispatch (createGalaxyModel.ts + probeGpuErrors.ts settled).

## Probe flake fix: DONE, scoped review dispatched (2026-08-12)
- Commit e5c8afddd (probe-harness-only). Fix: survival-floor assertion drives dust.cloud.dustPlacementCap=0.001 through production setFieldTuning before a dedicated readback (cap flattens CDF → hundreds of guaranteed floor-missers; survival check still reads raw uncapped map = real shader logic), restores tuning after. 3 consecutive probe PASSes (242/245/254 zeroed vs 100 floor). Determinism/count parts untouched.
- Concern noted: FLOOR_FIXTURE_CAP=0.001 empirically calibrated, margin documented — acceptable, park.
- Scoped review dispatched (3-point scope). On approved: push, then Task 8 dispatch.

## Probe flake fix APPROVED + pushed; Task 8 dispatched (2026-08-12)
- Scoped review: all 3 claims verified, no findings (cap reaches only CDF stage, restore uses canonical defaults, parts 1/2 pre-fixture). e5c8afddd pushed.
- Task 8 implementer dispatched (background sonnet), BASE e5c8afddd. Board #25 in_progress. Dispatch carried: brief + premises (hiiRegions.ts systemic drift, corrected anchors); STRUCTURAL CORRECTION + coordinator resolution (unified rebuildHiiIfSeeded → minimal restructure: DIG GPU-side, shells/young-stars unchanged CPU, wasted-work noted-not-fixed, NEEDS_CONTEXT if ambiguous); Task 6 armBiased mode + armBias>1 clamp AT CALL SITE; RNG distinct DIG pop tags extending 3-tier contract doc; established keyed-rebuild + invalidation-ownership patterns; WarpSurfaceFrame/CloudFrame nominal-typing gotcha; DIG_MAX_COUNT=1440 at :108; probe sibling steps incl. independent parity check; standard landmines; incremental commits.
- On DONE: package e5c8afddd..HEAD → reviewer (lens: restructure minimality, armBias clamp, RNG tags, unified-rebuild non-regression for shells/young-stars). Then Tasks 9+15 (renorm pair — check file overlap for possible pipelining), 10, 16, 11.

## Task 8: implementer DONE, reviewer dispatched (2026-08-12)
- Commits 6c60e4547 (shader+host+hiiRegions.ts behavior-preserving split) + 9bd453ec9 (wiring+probe) on BASE e5c8afddd. tsc x2, vitest 1011/6839 (zero test changes — split behavior-preserving), probe PASS (readback:placeDigVeil: 372 records bit-identical, count match, all live, flux parity 3.263e-8, extras-only invalidation regression).
- Concerns (all non-blocking): rebuildHiiIfSeeded call sites now provably-redundant CPU work (noted-not-fixed per dispatch); dispatchDigCdfScan runs when DIG disabled + double-dispatch in setParams (mirrors dust's accepted precedent — park with dust's for final review); CPU buildDigVeil orphaned until Task 16.
- Reviewer dispatched over review-e5c8afddd..9bd453ec9.diff. Lens: hiiRegions split purity (diff vs pre-image), armBias>1 clamp vs CPU semantics (:461-470), DIG RNG tags distinct, invalidation ownership, flux-parity independence, "provably redundant" claim verification.
- Stale-editor diagnostics re buildHiiRegionsWithSegments export + requestDigVeilPlacementReadback: noise (tsc clean x2, vitest green).
- On approved: push, board #25 completed. NEXT: Tasks 9+15 (renorm pair) — BOTH extend ringReduce.wesl + createIsmMapRingReduce.ts + io.wesl + createGalaxyModel.ts = HEAVY overlap, must be SERIAL (9 then 15); premises file brief-premises-9-15-10-16-11.md corrects the dg0 ghost + line drift. Then 10 (needs 8 landed — its premise: only rebuildHiiIfSeeded() calls remain to strip), 16 (MUST extend scope: dustParticleCloud.ts trim — see scout 2 CRITICAL), 11.

## Task 8: review verdict + fix round 1 (2026-08-12)
- Review (task-8-review.md): spec ✅, quality approved-with-one-Important. Everything independently re-derived against pre-image ground truth holds: RNG tags (DIGC/DIGc) no collisions, armBias clamp exact, hiiRegions split pure, "provably redundant call sites" claim TRUE (nothing reads CPU ismMap readback any more).
- Important: DIG flux-parity check tautological in sigma (both sides from same shader-local sigma). Fix round 1 dispatched (same implementer, probe-harness-only): independent expected side via det(invCov) recovery + CPU brightness-law re-evaluation; if DIG's law is genuinely flat per-record, pin the sigma distribution range instead — no check that passes for any sigma.
- On DONE: scoped re-review (same reviewer, this finding only) → push → board #25 completed → Task 9 dispatch (then 15 serial; premises file corrects dg0 ghost → rec.amplitude, dustMap/fragment.wesl:240).

## Task 8: fix round 1 DONE, re-review dispatched (2026-08-12)
- Commit 88b745f64 (probe-only). DIG brightness law confirmed position-independent → sigma-distribution check per review fallback (372/372 in [0.059999,0.179996], mean 0.117467 vs 0.119998, tol 1.08e-2, range reaches both bounds within 5%). Disclosed residual: placement radius/angle unverifiable under flat law — parked for final review.
- Scoped re-review dispatched (premise + failure-sensitivity + residual accuracy). On approved: push, #25 completed, Task 9 dispatch (BASE = 88b745f64; carry premises file with dg0→rec.amplitude correction, dustParticleCloud.ts lines 290-291/293).

## Task 8: COMPLETE (2026-08-12)
- Re-review: accepted (position-independence premise confirmed vs hiiRegions.ts:632-638; sigma check genuinely independent). New Minor parked: center finiteness/radius-bound check left on the table (record offsets 12-14 unread in probe step) — final review triages. Commits 6c60e4547+9bd453ec9+88b745f64 pushed. Board #25 completed.

## Task 9: implementer dispatched (2026-08-12)
- BASE 88b745f64. Board #28 in_progress. Dispatch carried: brief + premises (dg0 ghost → rec.amplitude at dustMap/fragment.wesl:240; sumR2 290-291, massPerR2 293; ringReduce seam reserved by Task 3's own docstring; io.wesl vec4-lane pattern); comps-buffer/keyed-rebuild integration + freshness-tied-to-placement guidance; survivor-semantics must match CPU 283-293 exactly (amplitude-weighted vs gated — implementer reads); NO-mapAsync mechanism warning with NEEDS_CONTEXT escape hatch (storage-buffer-sourced scale vs CPU uniform); probe: GPU sum vs CPU recompute + multiply-actually-applies assertion.
- On DONE: package 88b745f64..HEAD → reviewer. Then Task 15 (SERIAL — same ringReduce/host/io/createGalaxyModel files).

## Task 9: implementer DONE, reviewer dispatched (2026-08-12)
- Commits ac2083530 (kernel + placeDust mass output) + e01ea55d5 (wiring) + 90779099c (probe) on BASE 88b745f64. tsc x2, vitest 1011/6839, probe PASS (gpu=0.8449926376 vs cpu=0.8449926763, rel err 4.6e-8).
- Mechanism: csSurvivorSum → dedicated 4-byte STORAGE|COPY_SRC buffer → storage read at dustMap/fragment.wesl binding 14 (dustDetail bindings-3/7/8 precedent). No CPU round trip. First-ever dispose() on IsmMapRingReduce wired into engine teardown.
- Concerns: dispose() worth second look (reviewer lens); central-only scope (adjudicated pattern); csSurvivorSum not parameterized for Task 15 (fold-candidate — Task 15 implementer decides, note in its dispatch).
- Reviewer dispatched over review-88b745f64..90779099c.diff. Lens: no production readback, CPU 283-293 sum semantics + application-point equivalence at :240, placement-then-reduce ordering on EVERY invalidation path, binding-14/barriers/dispose WebGPU correctness, probe checks application-not-just-sum.
- On approved: push, #28 completed, Task 15 dispatch (SERIAL; carry fold-candidate note + premises: armSpurParticleCloud fluxWeightSum actual 199-203, fieldSplat/fragment.wesl:49 rec.amplitude single hit).

## Task 9: review verdict + fix round 1 (2026-08-12)
- Review (task-9-review.md): spec ✅ (storage-buffer deviation from io.wesl lane verified mathematically equivalent); quality needs-changes. 1 Important, 1 Minor.
- Important: probe reads renormScale off the same buffer the kernel wrote — validates reduction only, never the consumption at dustMap/fragment.wesl:77; dropped-multiply passes silently. Fix round 1 dispatched (same implementer, probe-harness-only): assertion must couple to shader OUTPUT (e.g. texel readback tracking a driven survivor-sum change), fails on dropped multiply.
- Minor parked: module headers over budget (ringReduce.wesl 25 lines, host 13) with plan-narrative content — final review triages (likely trim to ≤10 + link spec).
- On DONE: scoped re-review (same reviewer), push, #28 completed, Task 15.

## Task 9: fix round 1 DONE, re-review dispatched (2026-08-12)
- Commit 2d85bcd6c. requestDustMapChannelSum() (debug-only) sums rendered dustMapTex; dust.tau 2x drive → exact 2x sum assertion (ratio=2.000000). MUTATION-VERIFIED (read-but-not-apply → fails ratio=1; restored byte-identical; green). 3 mock fixtures gained the stub.
- Scoped re-review dispatched (observes-consumption, tau-premise purity, debug-only gating). On approved: push, #28 completed, Task 15 dispatch.
- Stale-editor diagnostic re requestDustMapChannelSum: noise, tsc clean x2.

## Task 9: COMPLETE; Task 15 dispatched (2026-08-12)
- Re-review: resolved, no unresolved findings. Commits ac2083530+e01ea55d5+90779099c+2d85bcd6c pushed. Board #28 completed.
- Task 15 implementer dispatched (background sonnet), BASE 2d85bcd6c. Board #29 in_progress. Dispatch carried: brief + premises (dg0 ghost → fieldSplat/fragment.wesl:49; fluxWeightSum 199-203); Task 9 as the explicit pattern (storage-buffer scale, binding precedent, dispose, freshness); kernel fold-vs-sibling decision delegated with dust-byte-for-byte constraint; per-tier slot ranges + records.wesl provenance lanes; probe standard = sum parity + CONSUMPTION assertion per tier (Task 9's fix-round lesson stated); header ≤10 lines warning (Task 9's Minor).
- On DONE: package 2d85bcd6c..HEAD → reviewer. Then Task 10 (premises: only rebuildHiiIfSeeded() strip remains; dead test checkbox), 16 (CRITICAL scope extension: dustParticleCloud.ts trim), 11.
- AFTER TASK 15 LANDS: brightness carve-outs closed → image honest → offer the user the pre-attestation visual look (dev server on :5400).

## Task 15: implementer DONE, reviewer dispatched (2026-08-12)
- Commits ec973a72d (impl) + 7a0f6f35b (probe) on BASE 2d85bcd6c. tsc x2, vitest 1011/6840, probe PASS x3 consecutive.
- BRIEF FORMULA CORRECTION (implementer): scale = bare 1/weightSum, NOT totalFlux/weightSum — arm/spur shaders already bake cloudFlux/spurFlux into raw output (dust bakes neither). Reviewer's TOP lens: verify rigorously; error either way = Critical (image off by tier totalFlux).
- Concerns: spur consumption tolerance 10% (N=15 quantization; arm 2%/0.06% same path = evidence) — reviewer weighs; readDustMapChannelSum reused for fieldTex under dust name (rename-incumbent convention — reviewer weighs); fieldTex +COPY_SRC debug-only.
- NEW BACKLOG CANDIDATE (pre-existing, out of scope): ridge chain carries residual emission at arms.cloud.share/arms.spurs.share boundary values (0/1), contradicting pushArmRidges' flux-conservation doc — add to plan-end backlog entries alongside the COPY_DST generator='none' bug.
- On approved: push, #29 completed → USER VISUAL LOOK OFFER (brightness now honest) + Task 10 dispatch.

## Task 15: review verdict + fix round 1 (2026-08-12)
- Review (task-15-review.md): spec ✅, quality approved. 0 Critical, 1 Important, 2 Minor. Formula correction VERIFIED (bare 1/weightSum right; brief's totalFlux/weightSum would inflate both tiers by weightSum×; independent numeric recheck 1/443.748 matches GPU to 8 digits). Spur 10% tolerance: honestly evidenced, N=15 confirmed natural derive output.
- Important → fix round 1 (same implementer): rename readDustMapChannelSum (second consumer = rename incumbent); MUST use npm run refactor -- move / move-files tooling, never git mv; grep old name after; engine-handle names reasoned per fields-track-types.
- Minors parked: probeGpuErrors.ts:130 stale 0.03% (actual 0.06%); spur tolerance evidence-not-proof.
- On DONE: scoped re-review, push, #29 completed → USER VISUAL OFFER + Task 10.

## Task 15: fix round 1 DONE, re-review dispatched (2026-08-12)
- Commit 5a1a8f6a4: readDustMapChannelSum → readTextureChannelSum via refactor tooling + 6 prose refs + 2 debug labels hand-swept; bridge methods stayed per-target-named (each genuinely single-target — documented). Probe ratios match pre-rename (arm 1.000329, spur 1.078774).
- Scoped re-review dispatched (completeness, behavior, naming rationale). On approved: push, #29 completed → USER VISUAL OFFER + Task 10 dispatch.

## Task 15: COMPLETE; Task 10 dispatched (2026-08-12)
- Re-review approved (rename complete, behavior unchanged, bridge naming rationale holds). Commits ec973a72d+7a0f6f35b+5a1a8f6a4 pushed. Board #29 completed.
- >>> IMAGE NOW HONEST: all four tiers GPU-placed at correct brightness. USER VISUAL LOOK OFFERED in chat (dev server :5400). <<<
- Task 10 implementer dispatched (background sonnet), BASE 5a1a8f6a4. Board #30 in_progress. Dispatch carried: premises corrections (dust half already done; only schedule-body rebuildHiiIfSeeded() calls to strip — setParams/setFieldTuning/regenerate calls LOAD-BEARING; dead test checkbox); Task 8's proven no-consumer claim; consumer-sweep-with-classification requirement + BLOCKED escape hatch; diagnostics must survive; smallest-demotion preference on ambiguity.
- On DONE: package 5a1a8f6a4..HEAD → reviewer. Then Task 16 (CRITICAL scope extension from scout 2: dustParticleCloud.ts trim + its test; armSpurParticleCloud.test.ts now calls buildArmSpurParticleCloud), then Task 11.

## Task 10: stall + resume (2026-08-12)
- Watchdog stall at the finish line (post-verification, mid-cleanup). Tree intact (uncommitted createGalaxyModel.ts edits). Resumed with: scratch-file cleanup (checkDebugViews.ts variants — must not be committed), DO-NOT-KILL guard for the user's :5400 dev server (PID 49536; only its own instance), skip-already-green-checks guidance, then commit + report.

## Task 10: implementer DONE_WITH_CONCERNS, reviewer dispatched (2026-08-12)
- Commit 864352bfd on BASE 5a1a8f6a4. tsc x2, vitest 1011/6840, probe PASS, Playwright visual check of both debug views + coherence panel green.
- CONCERN RULING: youngStars getter → invMeanNormFor(readbacks.ismMapData) → FieldUniforms.youngStars.y → youngFragment.wesl is a LIVE always-on shading input from the CPU readback — neither placement nor diagnostics. ADJUDICATED: accepted out-of-scope residual (pre-existing, not this plan's scope); BACKLOG CANDIDATE at plan end: "move young-star mean-norm GPU-side" (Task 3's ring-means reduce is the natural foundation). This is why readback machinery can't be debug-gated yet.
- Other: stale getIsmMapData comment naming deleted buildDustParticleCloud (out of file scope — Task 16 or final review sweeps); dead test checkbox confirmed.
- Reviewer dispatched (lens: exact-strip verification, classification-table audit, youngStars facts, diagnostics survival, no dead machinery left unexplained).
- On approved: push, #30 completed, Task 16 dispatch (WITH the scout-2 CRITICAL scope extension: dustParticleCloud.ts trim + tests; armSpurParticleCloud.test.ts handling; premises file path).

## Task 10: COMPLETE; Task 16 dispatched (2026-08-12)
- Review: spec ✅ quality approved, 0C/0I/2M (both = pre-existing stale comments naming buildDustParticleCloud — folded into Task 16's dispatch as a sweep item). youngStars residual independently confirmed pre-existing (verified at main merge-base). 864352bfd pushed. Board #30 completed.
- Task 16 implementer dispatched (background sonnet), BASE 864352bfd. Board #31 in_progress. Dispatch carried: brief + premises (CRITICAL dustParticleCloud.ts scope extension; stale no-test claim; inventory-is-a-map-not-truth re-grep rule; trim-list gaps; mulberry32 zero-consumer rule); stale-comment sweep (createGalaxyEngine.ts:1133-1136, createGalaxyModel.ts:214); deleted-symbol repo-wide grep; DoD checklist verification; expect test-count drop (report old vs new).
- On DONE: package 864352bfd..HEAD → reviewer (deletion review: nothing load-bearing deleted, nothing dead kept, test-trim judgment per testing convention). Then TASK 11 — needs USER for the visual attestation; prepare its dispatch as recalibration-support + assemble the attestation checklist for the user.

## Task 16: implementer DONE, reviewer dispatched (2026-08-12)
- Commit 4bf90f02d on BASE 864352bfd. tsc x2, vitest 1007/6822 (down exactly the 4 deleted test files' counts from 1011/6840), probe PASS x2.
- Deleted: clusteredDiscPlacement.ts + test; 3 CPU builders trimmed to constants/budget halves (incl. coordinator-mandated dustParticleCloud.ts extension); 4 test files total (incl. rotateFrameToOrientation.test.ts — missed by brief AND scout); comment sweep TS + 9 .wesl.
- SELF-CAUGHT over-deletion: brief's trim list stale for COMPLEX_HEIGHT_RATIO/COMPLEX_SPREAD_RATIO/tiltReferenceRadius/radialTilt (consumed by createIsmMapPlaceArmCloud.ts + probe) — restored pre-verification. OrientationDeltaStats relocated to own .d.ts (host file gone).
- Reviewer dispatched (deletion lens: nothing load-bearing deleted / nothing dead kept / test-coverage-loss check / comment sweep / .wesl comment-only verification / DoD facts).
- Stale-editor diagnostics re COMPLEX_HEIGHT_RATIO exports: noise (implementer restored them; tsc clean x2).
- On approved: push, #31 completed → TASK 11 SETUP: recalibration-support dispatch + user attestation checklist. Plan-end queue after 11: deferred-minors triage → final whole-branch review (MOST CAPABLE model per SDD) → BACKLOG entries (COPY_DST generator-none bug; ridge share-boundary residual; young-star mean-norm GPU-side; extras GPU placement) → ledger archive → /feature-done.

## Task 16: COMPLETE (2026-08-12)
- Review: spec ✅ quality approved, ZERO findings (reviewer independently re-ran tsc x2 + vitest: 1007/6822 exact; all deleted symbols zero callers; restoration complete; 4 deleted test files covered only deleted symbols; 9 .wesl diffs comment-only). 4bf90f02d pushed. Board #31 completed.

## Task 11: AWAITING USER (2026-08-12)
- Board #32 in_progress. All gates (4,7,8,9,10,13,14,15,16) landed + pushed through 4bf90f02d. Dev server :5400 serves this branch.
- Task 11 is the plan's final gate, human-in-the-loop, no code diff unless preset nudges are needed. Checklist presented to user in chat (from task-11-brief.md): fluid generator on; m74-jwst character checks (dust CDF-weighted, DIG haze near arms under armBias>0, NO uniform-tail leak — leak = Task 6/7/8 bug not recalibration); arm/spur clustering + brightness balance vs ridge chain (shift = Task 13/14/15 bug); young-stars sharp-line artifact gone (user pre-attested this at the early checkpoint: "the young stars layer looks better indeed" — re-confirm cheaply); slider nudges toward pre-change character allowed (calibration, or preset-default commit if needed).
- On user attestation PASS: tick plan checkboxes, then plan-end queue: deferred-minors triage → final whole-branch review (MOST CAPABLE model) → BACKLOG entries (4: COPY_DST generator-none crash; ridge share-boundary residual emission; young-star mean-norm GPU-side; extras GPU placement) → ledger archive → /feature-done → merge decision (user).
- If user reports a character regression: classify per the brief's bug-vs-recalibration routing before dispatching any fix.

## Task 11: USER ATTESTED — ALL 16 TASKS COMPLETE (2026-08-12)
- User: "visual pass done, all good". No preset changes needed → no Task 11 commit. Board #32 completed.

## Plan-end sequence started (2026-08-12)
- Deferred minors compiled to deferred-minors.md (11 OPEN to triage, 4 RESOLVED-LATER to verify, 6 ADJUDICATED).
- FINAL WHOLE-BRANCH REVIEW dispatched (background OPUS — most capable allowed for subagents) over review-1667f31f0..4bf90f02d.diff (41 commits, merge-base 1667f31f0). Writes final-review.md: verdict, findings, complete minors-triage table, fold-candidates.
- Doc agent dispatched (background sonnet): ticks all ~101 plan checkboxes vs ledger (LEAVES PLAN UNCOMMITTED for /feature-done), adds Task 11 attestation note, writes 4 backlog entries (ism-generator-none-copy-dst-crash, ridge-share-boundary-residual, young-star-mean-norm-gpu-side, extras-gpu-placement) + detail files, commits ONLY the backlog files.
- On final review: if findings → ONE fix dispatch + ONE scoped re-review + adjudicate residuals (SDD final-review protocol). Then /feature-done (audit → plan+spec to completed/ → ledger archive to docs/superpowers/plans/completed/2026-08-11-gpu-side-v2-placement.ledger.md → backlog sweep → completion commit + push). Merge decision = USER (draft PR #547; squash-merge; no gh pr merge from worktree).

## Final review verdict + fix dispatch (2026-08-12)
- final-review.md: needs-fixes (NARROW) — 0 Critical, 5 Important, 15 Minor (triaged: 8 accept-with-note, 2 promoted into I2/I3, #6 split), 6 fold candidates (follow-up material). No functional defect anywhere.
- I1 duplicated PLACE_DUST_POP_CHILD constant (doc-only resolution earlier — real fix now: derive from import); I2 stale comps layout-authority comments (io.wesl + 3 shaders); I3 comment-budget debt on new files (headers, ratios, 145 Task-N refs, 2 option surveys); I4 dead Map-seeding slider chain (field's reader deleted in Task 2 — remove slider/field/default/migration/tautological test; CAREFUL: rebuildHiiIfSeeded condition term); I5 requestFieldTexChannelSum zero-caller + fieldTex COPY_SRC removal (verify-first escape hatch).
- ONE fix dispatch (background sonnet) per SDD final-review protocol. Constraints: pinned probe values unchanged; plan file's uncommitted checkbox ticks preserved uncommitted; no push.
- On DONE: scoped re-review by the FINAL reviewer (same agent) → adjudicate residuals → /feature-done (audit, moves, ledger archive, completion commit, push) → user merge decision on PR #547.

## Final fixes DONE + scoped re-review dispatched (2026-08-12)
- Fix agent (1 infra stall, resumed, then DONE): bc9bdcd0c (I1+I2+I3), 21517a85a (I4), 45d60bbff (I5). tsc x2 clean, vitest 1007/6820 (−2: tautological ismMapSeeding + retired sfMapSeeding migration tests), probe PASS x2, pinned values unchanged. Report: final-fixes-report.md.
- I5 ESCAPE HATCH TAKEN: fieldTex KEEPS COPY_SRC — requestArmCloudRenderedFluxSum/requestArmSpurCloudRenderedFluxSum (live) depend on it via readTextureChannelSum; the review's flag-removal instruction was wrong. Only the dead method + stale comment went. Do not re-litigate as missed cleanup.
- Coordinator docs: 8da6ff73e adds probe-api-decomplect backlog entry (user directive: decomplect the model/handle probe surface post-merge — probe sub-object + generic slot-range peek).
- Fresh package review-1667f31f0..8da6ff73e.diff (46 commits). Scoped re-review dispatched to the SAME final reviewer (ad07a347245c7847e), scope I1-I5 only; specific checks: I4 rebuildHiiIfSeeded condition, I5 partial-resolution acceptance.
- On all-resolved: /feature-done (audit → plan+spec moves → ledger archive → backlog sweep → completion commit staging the ticked plan → push) → USER merge decision on PR #547. NOTHING PUSHED YET past 4bf90f02d — the 5 new commits push with /feature-done.

## Scoped re-review: ALL RESOLVED (2026-08-12)
- I1/I2/I4/I5 fully resolved; I3 resolved for branch-specific debt (headers 52/39/28/26/21/19 → ≤11, surveys gone, dupes deduped) with the Task-N-refs residual RECLASSIFIED: pre-existing repo-wide idiom (269 refs incl. untouched files), backlogged as a convention decision, not merge-gating.
- I4 check: rebuildHiiIfSeeded + both call sites were already deleted by 864352bfd, so no condition term survived to mis-edit; RenderSettings.d.ts comment was wrong AT BASE and the fix corrected it.
- I5: reviewer confirms its own flag-removal instruction was wrong (rendered-flux-sum methods need fieldTex COPY_SRC via readTextureChannelSum copyTextureToBuffer); partial resolution accepted.
- Reviewer corroborated no-behaviour-change structurally: bc9bdcd0c touches 7 non-comment lines, all value-identical.
- Carry-over M12 (uncommitted plan ticks) = intentional, staged by /feature-done's completion commit.
- NEXT: /feature-done audit → moves → ledger archive → completion commit → push → USER merge decision on PR #547.
