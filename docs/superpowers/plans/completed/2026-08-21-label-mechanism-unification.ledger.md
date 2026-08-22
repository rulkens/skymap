# SDD ledger — plan: docs/superpowers/plans/2026-08-21-label-mechanism-unification.md

Branch: refactor/label-unification (feature PR #618). Start HEAD: a4e3d1cf6.
Spec: docs/superpowers/specs/2026-08-20-label-mechanism-unification-design.md (binding authority).
Dev server: http://localhost:5173 (shell blqkpo2jf) — do not kill; perf runs MUST pass --url http://localhost:5173.
Controller watch-items: scratchpad rung8-plan-report.md §"What the SDD controller should watch" (6 items).

## Pre-flight

PR A precondition: all five facts verified on this HEAD (Label2D.d.ts, Label2DProducer.d.ts,
Label2DProducerOutput.d.ts, produceFamousGalaxyLabels.ts, lib/msdf.wesl with @binding(2)/(3) inside). PASS.

Conflict scan — shared-file/interface pairs:

| pair | shared surface | produced vs consumed | finding |
| ---- | -------------- | -------------------- | ------- |
| T1↔T2 | labelDirectorSubsystem.ts | T1 edits director in place; T2 tool-moves it to label2DDirector.ts | clean — sequential, move after edit |
| T1↔T3 | Label2DLift | T1 mints (unread); T3 lift stage reads subjectSizePx/lineBottomLiftPx | clean — field names match |
| T2↔T3 | label2DDirector.ts + policy unions | T2 mints BOTH union arms (verbatim types) but implements only bboxOverlap/smoothstepRamp; T3 implements the second arms | see Ruling R1 |
| T2↔T5 | cosmoLabelProjection memoisation | T2 mints; nothing in T5 consumes it directly | clean |
| T3↔T5 | foregroundLabelDirector, near0LabelProjection | T3 mints both; T5 registers producers on the instance + thin layer calls near0LabelProjection(ctx) | clean — names/arity match |
| T4↔T5 | foregroundLabelsLayer.test.ts case lists | T4 moves :498,:541,:566,:600,:644,:677,:699,:718,:756,:818,:857,:1096,:1114; T5 deletes :316,:353,:365,:1064, keeps :403,:454,:1036,:1046, moves :880,:970 | clean — no overlap between lists |
| T4↔T6 | produceSceneBodyCaptions | T4 creates; T6 adds fadeHandle composition | clean; T6 is the park point — verified T7–T10 nowhere reference fadeHandle |
| T3↔T9 | runFrame wake fold | T3: two statements + OR; T9 inserts third statement | clean — T3 text anticipates T9's insertion |
| T3↔T7 | runFrame.ts | T3 touches :642, T7 touches :666-669 | clean — disjoint sites, sequential |
| T8↔T9 | Label3DRenderer surface | T8 mints setLabels/draw(pass,vp,viewportPx)/glyphCount + gpu handle; T9 walker + postBlit consume | clean — signatures match verbatim |
| T9↔T10 | outlier rows | T9 deletes atlases param etc.; T10 records it | clean |

Per-task self-consistency:

| task | finding |
| ---- | ------- |
| T1 | clean — tests match flush contract; signatureOf keeps leader.toWorld keying |
| T2 | R1 (union arms); R2 (refactor-CLI rename syntax) |
| T3 | clean — six tests ↔ implementation list agree |
| T4 | R3 (one-commit in-tree duplication is plan-mandated) |
| T5 | clean — :1064 retirement reasoned in plan text |
| T6 | clean — FadeId import needed in captionFadeRules; standard |
| T7 | clean |
| T8 | R4 (how a Vitest case observes shader-side world position) |
| T9 | clean — deletion list ↔ grep gates agree |
| T10 | clean |

Ruling R1: T2 mints the full 2-arm policy unions (spec §4.2 verbatim types) while only the
COSMO arms are implemented until T3. A reviewer flagging the unconsumed arm as speculative
generality is overruled — plan-mandated, consumed one task later. Costs nothing if wrong.

Ruling R2: plan spells `npm run refactor -- rename createLabelDirectorSubsystem createLabel2DDirector`;
the CLI's canonical form is `rename <file>#<symbol> <newName>`. Implementer uses whichever
form the CLI accepts; the outcome (project-wide AST rename) is what's binding. Cost if wrong: nil.

Ruling R3: T4 deliberately lands one commit of in-tree duplication (producers extracted,
layer untouched) so T5's switchover diff reads as pure deletion. A duplication finding
against T4 alone is plan-mandated and parked; the duplication must be GONE after T5.

Ruling R4: T8's placement test asserts world position that the vertex shader computes.
testing.md's WGSL/TS-parity keep-rule is the sanctioned pattern: a TS twin of the arc
placement math with HAND-COMPUTED expectations (never derived by re-running the formula).
Implementer decides where the TS twin lives; reviewer checks it against testing.md.
Cost if wrong: one redundant test, or a missed shader-math drift — small either way.

## Task progress

Task 1: minor (deferred): Label2DLeader/Label2DLift .d.ts comment-to-code ratio at ~1:1 (reviewer judged earns-its-place; note only).
Task 1: minor (deferred): two ownerLabelId-branch tests repurposed/renamed rather than deleted+recreated — end state clean, process letter only.
Task 1: minor (deferred): prevSignature comment (labelDirectorSubsystem.ts:596-598) still says "(labels, lines) tuple"; signatureOf now hashes labels only. Comment-audit sweep will catch.
Task 1: complete (commits a4e3d1cf6..5a2b03cbf, review clean).
Task 2: dispatched (BASE 5a2b03cbf, sonnet implementer). Implemented at f4758e9ca.
Task 2: minor (deferred): DECLUTTER_PAD_PX/ENVELOPE_MS docblocks condensed rather than moved verbatim (info survives in declutterByBboxOverlap docblock).
Task 2: minor (deferred): label2DDirector.ts module header grew ~11 lines on top of pre-existing ~78-line debt — comment-audit sweep target.
Task 2: fix round 1/5 (2 addressed, 0 open — stale filename mentions fixed + COSMO_LABEL_DIRECTOR exported/imported; commits f4758e9ca..142bcdc67).
Task 2: complete (commits 5a2b03cbf..142bcdc67, review clean after 1 fix round).
Ruling: perf baseline captured at post-Task-2 HEAD 142bcdc67, not pre-Task-1 — racing the harness against an active implementer's CPU load would corrupt GPU medians; Tasks 1-2 are behaviour-neutral CPU-side reshuffles with no GPU-pass change. Cost if wrong: baseline slightly flatters/hides a T1-T2 delta, bounded by harness noise.
Perf BEFORE (HEAD 142bcdc67, 30 frames, --url http://localhost:5173, MERGED totals; files perf-before-*.txt in workspace):
solar-system 26.5 ms | star-field 23.3 ms | local-group 25.3 ms | full-survey 25.1 ms | milky-way-outside 25.3 ms.
Note: NO zone-of-avoidance pass appears in any scenario's per-layer list — the ZoA band/lettering is not exercised by the harness poses/settings. Task 9's perf delta will be structurally ~0 there; its real verification is shader-compile smoke + the user's visual pose 4.
Task 3: dispatched (BASE 142bcdc67, sonnet implementer; opus review planned per watch-item — triple landmine).
Task 3: implemented at 2934c0239 (suite 7202 green). Implementer concerns: (a) runFrame wake-fold test uses a heavier fixture (module-scope mocks of renderFrame/drawPickDebugOverlay) than suite norm; (b) collateral stubs for foregroundLabelDirector added to buildSwapRenderers.test.ts + initGpu.hdrCapabilityWiring.test.ts. Opus review: both concerns checked out as justified, no finding.
Task 3: opus review — 1 Critical (exponential arm has no "culled" state: declutter hands envelope a filtered array, so a culled caption pops both directions; spec §4.6 target row requires 0-when-culled), 2 Important (zero-target captions occupy declutter space — source's baseTarget===0 candidate skip didn't move; survivors-only lift test doesn't pin after-the-envelope), 4 Minor.
Ruling: declutter→envelope contract reshaped per spec §4.6 (spec is binding): declutter yields the FULL projected set plus survivorship (set or flag), envelope arms consume both — exponential targets 0 for emitted-but-culled and drops only truly-absent ids; smoothstep keeps today's outcome (culled = remembered-emission ramp-down, identical to current behaviour). Cost if wrong: a pipeline-stage signature that Task 5 would have had to reshape anyway.
Ruling: opus Minor 4 (two docblocks stale in the commit that invalidated them: Label2DLift.d.ts:2-5, Label2DDirectorConfig.d.ts:8-9) promoted into the fix round — they are read-first files for Task 4's implementer and actively mislead. Cost if wrong: a few lines of churn.
Task 3: minor (deferred): label2DDirector.ts comment lines 326 vs 389 code (over budget, pre-existing + extended); interim-zero-producers paragraph and wake-fold rationale each duplicated at two sites — comment-audit targets.
Task 3: minor (deferred): leader colour shares label.color by reference (label2DDirector.ts:692) where source copied ([...label.color]) — nothing mutates today.
Task 3: fix round 1/5 dispatched — findings: Critical 1 (culled-state), Important 2 (zero-target candidate skip), Important 3 (lift-after-envelope test), promoted Minor 4 (stale docblocks). Fix committed 86faa71ae (suite 7204 green); re-review: all 4 ADDRESSED, no new breakage, COSMO neutrality verified (zero diff hunks in applySmoothstepEnvelope).
Task 3: minor (deferred): Label2DEnvelopePolicy.d.ts + Label2DDeclutterPolicy.d.ts still carry Task-2-era "unimplemented until…" language, now false — comment-audit / final-review target.
Task 3: complete (commits 142bcdc67..86faa71ae, review clean after 1 fix round).
Task 4: dispatched (BASE 86faa71ae, sonnet implementer). Implemented at 7b0e3d081 (suite 7205 green; layer suite 23→10 cases). Implementer flagged: sgrAStarCaptionTarget not literally moved — claims the generic CAPTION_FADE_RULES loop reproduces its number; reviewer directed to verify equivalence (Critical if any reachable state differs).
Task 4: review — spec ✅; sgrAStar equivalence VERIFIED bit-identical by construction (positionMpc shared by reference, RENDER_ORIGIN [0,0,0], same fadeTarget ignoring camDist). 1 Important: comment budget blown in both new files (headers 24/14 lines vs cap 10; ratios 59%/52% vs cap 50%). 1 Minor folded into fix (tighten equivalence note).
Task 4: fix round 1/5 (all addressed — headers 10/9 lines, ratios 26%/36%, load-bearing comments survived, comment-only diff verified; commits 7b0e3d081..4feba8d83).
Task 4: complete (commits 86faa71ae..4feba8d83, review clean after 1 fix round).
Task 5: dispatched (BASE 4feba8d83, sonnet implementer). Watch: enabled-gate port is THE silent-blank risk; :119-122 comment deleted not re-pointed.
Task 5: implemented at 54ee862a3 (suite 7203 green zero-skipped; layer 441→45 lines). Implementer flagged 2 unplanned migrations: foregroundLabelsLayerFarStar.test.ts → label2DDirectorFarStar.test.ts (drives director), foregroundLabelsOcclusion.test.ts fixtures fixed in place. Reviewer directed at gate-test fidelity, 7205→7203 count reconciliation, and both migrations.
Task 5: review — structural port clean (count reconciles, migrations preserve assertions, latch comment gone, production ordering verified at runFrame.ts:650 vs :687). 1 Critical: gate test stubs glyphCount constants — cannot detect the ordering regression. 1 Important: declutter-flip "move" became deletion; wake vote unasserted for cull-driven path.
Task 5: minor (deferred): label2DDirectorFarStar.test.ts makeCtx pins nowMs:0 (dt=0 on second runFrame) — benign for its assertions, divergence from old auto-advancing clock worth a comment.
Task 5: fix round 1/5 (2 addressed — stateful gate test through real director w/ interleaved enabled() reads + real settle; cull-test wake votes asserted all four frames; commits 54ee862a3..340a05e73).
Task 5: complete (commits 4feba8d83..340a05e73, review clean after 1 fix round).
Task 6: dispatched (BASE 340a05e73, sonnet implementer). PARK POINT — own commit, nothing later builds on fadeHandle.
Task 6: implemented at 22bf423ee (suite 7207 green zero-skipped). Implementer flagged out-of-brief edit: label2DDirectorFarStar.test.ts fixture gained neutral fades mocks (opacityOf/clipOpacityOf → 1) — needed once producers read state.subsystems.fades; reviewer judging neutrality + revert-safety.
Task 6: review clean (composition/handles/gate/LANDMINE deletion verified against real types; fixture edit numerically neutral + revert-safe; fadeHandle grep hits only this task's files).
Task 6: minor (deferred): captionFadeRules.ts file-wide comment ratio 118/58 — pre-existing on base (110/50), task kept it flat; comment-audit target.
Task 6: complete (commits 340a05e73..22bf423ee, review clean). PARK POINT preserved: revert = park.
Task 7: dispatched (BASE 22bf423ee, haiku implementer — complete code in plan).
Task 7: implemented at 5cf1077f2. NOT yet reviewed — task review NOT dispatched.
== PAUSED by user 2026-08-21, mid-plan ==
== RESUMED 2026-08-22 after machine reboot. Dev server relaunched — now http://localhost:5176 (shell botvaoqlz); 5173-5175 held by OTHER sessions' servers. All shader smoke + perf AFTER runs MUST pass --url http://localhost:5176 or they measure another branch. Ledger line 5 superseded. ==
Task 7: suite claims independently verified at 5cf1077f2 — typecheck clean, 1068 files / 7208 tests ALL passed, zero skipped, no timeout (implementer's "7203 + pre-existing timeout" was misreporting; commit trusted).
Task 7: review — spec ✅ (verbatim type/array/walker, no sort/filter/dedupe, runFrame wiring + import clean, stub test exercises pick-index contract; array-identity risk checked, no behaviour change). 1 Important: comment budget blown in both new files (runMarkerProducers.ts header 11 lines + ratio 11/15; test header 14 lines). 1 Minor folded into fix: runFrame "Per-frame marker upload" comment still names produceStructureMarkers at a call site that now calls runMarkerProducers.
Task 7: fix round 1/5 (all 3 addressed — headers 6/5 lines, ratios 0.4/0.19, landmine preserved, runFrame comment re-pointed; comment-only diff verified; commit c71ccc089).
Task 7: complete (commits 22bf423ee..c71ccc089, review clean after 1 fix round).
Task 8: dispatched (BASE c71ccc089, sonnet implementer — wesl-shaders skill mandated, R4 ruling carried; dev server 5176).
Task 8: implemented at 7f57a6c55 (suite 7214 green, typecheck clean, shader smoke passed vs 5176). Implementer flagged: (a) caught+fixed writeBuffer size-units bug (element units vs bytes, 4x under-upload) mid-task; (b) out-of-brief edits to engine.ts + initGpu.hdrCapabilityWiring.test.ts (mock-every-factory suite needed stub for new row). Opus review dispatched — directed at 10 named risks incl. handedness, vertex-formula reduction vs ZoA, additive-blend header, vertex-stage px→Mpc conversion, writeBuffer fix, out-of-brief edits.
Task 8: opus review — spec ✅ on all 10 named risks (formula reduced term-for-term vs ZoA by hand, no drift; bindings/byte layouts/writeBuffer units verified; both out-of-brief edits legitimate consequences). 1 Important: placement test degenerate (localOffset=0, repeatIndex=0, startAngle=0 ⇒ binormal/arc-sign/lat-sign terms all ×0 — cannot fail on the handedness bugs it guards); fix = add second twin call at a non-degenerate point w/ hand-computed expectations. Minors 2 (unused exports LABEL3D_*_BYTES), 3 (task-number comments in engine.ts/EngineGpuHandles — stale at Task 9), 4 (inline flat-basis guard comment not carried to vertex.wesl code site) folded into fix round. Minor 5 (vertex.wesl header 11 lines, mandated sign derivation — earns place, no action) + Minor 6 (repeatCount=0 / missing-font edge cases untested, consistent w/ labelRenderer) deferred.
⚠ ledgered for final review: shader-smoke transcript corroborating-not-conclusive (GPUValidationError need not surface as page error); binding/linker risk independently verified by inspection.
Task 8: fix round 1/5 (all 4 addressed — non-degenerate twin case added w/ hand-computed literals INDEPENDENTLY re-derived by re-reviewer incl. all 3 mutation outputs; exports privatized; task-number comments made timeless; flat-basis guard re-sited at code; commit 91b5500ce, suite 7215 green).
Task 8: complete (commits c71ccc089..91b5500ce, review clean after 1 fix round).
Task 9: dispatched (BASE 91b5500ce, sonnet implementer — wesl-shaders skill mandated for the .wesl deletions; dev server 5176; harness has no ZoA pass, so "lettering still on screen" cannot be perf-verified — visual pose 4 is the user's smoke, ledgered).
Task 9: implementer killed mid-task by machine sleep (tree held partial edits at the .d.ts step); resumed same agent, completed cleanly.
Task 9: implemented at 43cdfdf58 (suite 1070 files / 7218 green, typecheck clean, grep gates clean, shader smoke clean vs 5176; on-screen lettering NOT harness-verifiable — user visual pose 4). Implementer flagged: renderer 294 lines vs brief ~390 estimate (claims traced-verified); out-of-brief fixes to two stale EngineGpuHandles.d.ts docblocks. Opus review dispatched — top target = deletion precision (294-line claim), plus wake-fold shape, postBlit contract, producer equivalence vs deleted minus-lines.
Task 9: opus review — APPROVED. Behaviour-neutrality verified against deleted shader math term-for-term (placement, colour, discard-under-additive all equivalent); deletion complete AND precise (294-line variance = real listed deletions, band path + fenced uniform intact); wake fold + postBlit landed verbatim. 1 Important: four surviving "generalizes zoneOfAvoidance/label/…" comments falsified by the deletion (labels3d/io.wesl:2, vertex.wesl:2, label3DRenderer.ts:5-7+:31-33, Label3DRenderer.d.ts:7, EngineGpuHandles.d.ts:314). Minors: labelColor pass-through lost its only test (tuning.color confusion reachable); wake-fold short-circuit guard doesn't observe the third statement; one change-narration line in producer header.
Ruling: fix round 1 runs Important + all three minors with the Task 9 implementer (not batched into Task 10 — the files are Task 8/9's, keeps Task 10's diff pure). Cost if wrong: one dispatch cycle.
Ruling: spec §3's "merge → signature → flush" Label3DProducer pipeline vs brief's merge → unconditional setLabels — brief's shape stands. The signature/flush-skip stage would save re-laying-out ~17 glyphs × 3 repeats (~2.3 KB upload) per live-band frame — negligible payoff vs added code liability. Divergence goes in the user roll-up; a future signature stage is an ordinary optimization, unowned by this plan. Cost if wrong: trivial per-frame CPU/upload while band live.
Task 9: fix round 1/5 (all 4 addressed — six stale-comment sites rewritten timelessly w/ load-bearing content preserved; labelColor assertion added w/ distinguishable fixture values; wake-fold spy verified by mutation (inline || form failed, revert green); narration line fixed; commit aa8ebe4e3, comments+tests only).
Task 9: complete (commits 91b5500ce..aa8ebe4e3, review clean after 1 fix round).
Task 10: dispatched (BASE aa8ebe4e3, sonnet implementer — docs-only; carried execution facts: DeclutterResult reshape, Label3D walker unconditional flush, layer 45 lines).
Task 10: implemented at 7109799db (all 5 sites + #19 verified accurate vs landed code by reviewer; typecheck green). Implementer used bare git stash for a prettier-dirt check — house-banned, no residue (stash list checked: 8 entries all from other old branches), reprimanded in fix dispatch; roll-up item.
Task 10: review — Needs fixes. 2 Important: outliers.md:65 "Uploads inside draw" row (setLines dead) + §4 item 1 drawLabels reference (dead method) — both branch-falsified rows in the file this task edited. 2 Minors folded: decisions.md:178 sketch names pre-rename LabelProducer; mermaid F6/R8 + :215 ladder row still styled future-work. Fix round 1 dispatched w/ all four.
decisions.md pre-existing prettier-dirt: left unformatted (ruling: correct call — ~130 unrelated reflow lines don't belong in this diff).
Task 10: fix round 1/5 (all 4 addressed — both stale rows truthful, sketch renamed, mermaid/ladder rows done-status; re-review verified rewritten claims against source; commit 67f34aef0).
Task 10: complete (commits aa8ebe4e3..67f34aef0, review clean after 1 fix round).
== ALL 10 TASKS COMPLETE at 67f34aef0. Remaining: perf AFTER (5 scenarios, --url http://localhost:5176, vs perf-before-*.txt), final whole-branch review (opus, deferred minors as lens), one fix wave max, rulings roll-up to user, workspace deletion, finishing-a-development-branch. ==
Perf AFTER (HEAD 67f34aef0, 30 frames, --url http://localhost:5176, MERGED medians, files perf-after-*.txt): solar-system 25.3→20.2 | star-field 26.5→22.1 | local-group 23.3→21.7 | full-survey 25.1→22.5 | milky-way-outside 25.3→25.4 ms. All neutral-or-better; improvements likely cross-day/reboot thermal noise, not claimed as wins. No perf-halt. NOTE: the earlier baseline one-liner in this ledger had scenario labels shifted; the perf-before-*.txt files are authoritative (values above re-read from files).
Comment-audit: committed a7695357b (11 fixed / 59 clean, suite 7218 green; agent stalled once at commit step, resumed cleanly). Flagged for USER adjudication (roll-up items): EngineGpuHandles.d.ts ~470-line pre-existing overage; label2DDirector.ts + captionFadeRules.ts still over ratio after trims (survivors pass landmine test); labelLeaderLine.ts derivation-heavy header over budget, not clearly carve-out-exempt. Audit report: comment-audit-report.md in workspace.
Final whole-branch review: dispatched (opus, range a4e3d1cf6..a7695357b).
Final review: READY WITH FIXES, no Criticals. Verified: neutrality term-by-term at every seam (incl. NEAR0 three-branch target rule, leader alpha, ZoA arc/premultiply chain); cross-instance isolation airtight (closure-local state only); teardown compiler-enforced; swap-format re-attach correct + newly required; all 5 fadeHandles resolve. 2 Important: (1) current-contracts-map.md:181/189/190/191 + subsystem-sweep.md:22 assert closed 🔴s still open; (2) runMarkerProducers.ts:19 push(...spread) = RangeError on open-ended catalog + O(N) copy — loop-push like label2DDirector.ts:762 (also runLabel3DProducers.ts:18 for family). Minors: SgrA* reach lost its only pin (add producer test); spec §9.4/decisions D5 atlas-copy claim vs moved-and-widened reality (fix decisions wording); narration comments in runMarkerProducers.test.ts; MarkerLine.d.ts color/fromWorld/toWorld not readonly (aliased label.color rests on convention); Label3D.repeatCount=0 docblock clause. Recommendations adopted into wave: static WESL binding-parity test (closes the ledgered smoke ⚠); parity-test header honesty sentence.
Fix wave (the ONE sanctioned dispatch): fresh sonnet, two commits (code/tests + docs).
Fix wave: landed 9b19bfa6d (code/tests) + e3efcd859 (docs); suite 7220 green, typecheck clean. Scoped re-review: ALL 10 ADDRESSED, no new breakage (walker idiom both sites; readonly w/o casts; SgrA* test binds via real fadeBand chain, mutation-checked; WESL parity test proven to inspect LINKED output; doc rows spot-checked true incl. cited line numbers).
== PIPELINE COMPLETE at e3efcd859 (branch a4e3d1cf6..e3efcd859, PR #618). Suite 7194→7220, zero skipped. Awaiting USER: 4-pose visual smoke (pose 1 = fade wire, revert 22bf423ee to park; pose 4 = ZoA lettering), then /feature-done (archives THIS ledger — do not delete workspace before it), then merge on user's explicit word. ==

== POST-PIPELINE FOLLOW-UPS (user-requested, 2026-08-22) ==
- Ruling: user flagged labelDirector/foregroundLabelDirector asymmetry (naming convention: rename incumbent on 2nd variant). User chose scope A (incumbent only → cosmoLabelDirector; foreground↔near0 vocabulary mix stays, pre-existing, backlog candidate). Commit 1fac1b965.
- Ruling: user ruled config constants must not live in engine.ts; destination src/data/labels/ (user's call, overriding my subsystems/ suggestion). COSMO_LABEL_DIRECTOR → cosmoLabelDirectorConfig.ts; FOREGROUND_LABEL_DIRECTOR + STAR_CAPTION_MIN_SEPARATION_PX/CAPTION_ENVELOPE_TAU_MS/CAPTION_ENVELOPE_SETTLE_EPS → foregroundLabelDirectorConfig.ts; importers repointed off engine.ts; Label2D.d.ts:108 mechanism-name comment fix rode along. Commit f0d5d3da9.
- Gates after each commit: typecheck clean, 7220/7220 green. Pushed e3efcd859..f0d5d3da9. HEAD = f0d5d3da9. Report: rename-cosmoLabelDirectorConfig-report.md (agent-appended) in workspace.
- Still open (unchanged): USER 4-pose visual smoke on http://localhost:5176, /feature-done, merge word.
- Entanglement radar (user-invoked, 3 parallel sonnet reviewers over main...f0d5d3da9): 6 findings. USER ruled: fix 1-3 on this branch. LANDED: 2e1f28996 (forwardProjectPoint primitive shared by director/pick/leader — Step-A divergence check passed, all three copies agreed), 9076cf629 (attachLabelDirectors table walked by both bootstrap phases), 56b8e0392 (ATLAS_EM_PX parity test over both linked WGSL outputs vs ATLAS_FONT_SIZE, mutation-verified). Implementer stalled at final commit (watchdog) but ALL commits had landed; report radar-fixes-report.md written on resume; gates re-run by controller: typecheck clean, 7225/7225 zero-skipped. Findings 4-6 captured as backlog: docs/backlog/2026-08-22-label-entanglement-residuals.md + index line, commit 6ba3307c0. All pushed; HEAD = 6ba3307c0. Implementer concerns (parked, non-blocking): module-level scratch in projectToScreenPx/labelLeaderLine assumes non-reentrancy; no direct unit test for forwardProjectPoint (transitively pinned); attach table uses closure accessors not keyof rows. ==
Resume point: (1) VERIFY Task 7's suite claims first — implementer reported "7203 total passed (excluding pre-existing timeout)": the timeout mention is NEW (all earlier runs fully green) and the count is odd (Task 6 ended at 7207; +1 new test should be 7208) — run npm run typecheck + npm test yourself before trusting the commit; (2) then review-package 22bf423ee..5cf1077f2 + task-reviewer for Task 7; (3) then Tasks 8-10 per plan (Task 8 brief already extracted at task-8-brief.md; wesl-shaders skill load + R4 ruling apply; shader smoke against dev 5173, do not restart it); (4) perf AFTER run at the end, same 5 scenarios + --url http://localhost:5173, compare to perf-before-*.txt.
