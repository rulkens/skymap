# SDD ledger — plan: docs/superpowers/plans/2026-10-05-voyager-mission-trails.md

User 2026-10-05: approved spec, "start implementing directly", then AFK.
Prep branch `mission-trails-prep` off origin/main 3808c7a74; spec+plan 0c15f4a2b; draft PR #851 (base main).

Ruling: parallelism = this plan only; perf gate SKIPPED — user AFK, moons precedent (cQgq skip perf); new pass draws ~20k vertices — cost if wrong: one perf run before merge.
Ruling: execution = lean SDD; Sonnet implementers; dispatches PR1: A = T1+T2 (regions, registry), B = T3 (trail occlusion, review), C = T4+T5 (exhibit switch, time capture, review T5), D = T6 (Horizons rows, review). Mid-branch reviews for review:yes tasks, one round each.
Ruling: main moved since spec (Uranus moons #850 joined Horizons corrections) — T6 brief must read current horizonsBodies.ts.

## Progress
- Task 1: complete — e94e504cf (membership pinned as literal, identical)
- Task 2: complete — 42b463f07 (deviation: deriveBodyStates cache folded into one object; frameFilePurity row 3→2)
- Task 3: complete — 45bc014e7 (dev1: lib declares @group(0) occ+sceneDepth bindings itself like lib/sceneDepth.wesl — T10 shader must use same binding slots; dev2: MAX_OCCLUDERS/DEPTH_CLEARANCE_REL moved to lib). Review + visual owed.
- Task 3 visual: PASS (my npm run shot, Saturn 1980-11-12: moon orbits cut at the disc) — scratchpad t3-saturn.jpg. Opus review dispatched.
- Dispatch C (T4+T5) running.
- T3 review: clean behaviour; fixes owed (after dispatch C, inline): lib header 'importers reserve @group(0) bindings 0-1'; move TrailOcclusionUniforms type to src/@types/rendering/; stale pointers orbitTrailConstants.ts:2-7,11, occlusionCoverageGroup.ts:79, parity test :41-42; rewrap orbitTrailRenderer.ts:10. Packer path renderers/bodies/ accepted (mission trail renderer also under bodies/).
- Task 4: complete — 61a9fd553 (overlay hairline via new util exhibitSectionHasRule.ts)
- Task 5: complete — ead0407d9 (SceneSnapshot.time + capturedAtMs; restoreTime reducer; clipBodySaga NOT wrapped by withSceneSnapshotSaga → its own clock restore stays; so P5 covers exhibits+tours, not clips). Review owed.
- T3 review fixes: d5b15f9fc (inline)
- T5 opus review + dispatch D (T6) running.
- User 2026-10-05: asked for a UI/UX design agent (engaging, teaches the mission, skymap style) — opus design agent dispatched → scratchpad voyager-ux/{design.md,sketch.html}. Then user: 'im going afk, build it'.
Ruling: build the design's CORE tier as Task 11 (replacing the plan's thinner timeline-only Task 11); Next/Later tiers → backlog detail file; any camera-moving deviation the design proposes is NOT built without the user (10-03 ruling: camera doesn't move) — cost if wrong: Task 11 rework.
- T5 review: 2 Important, 3 Minor. Rulings: (1) live+paused clock restores to the captured instant, paused (deriveSimDays at capture) — a paused clock shows a fixed instant; returning to it is least surprise — cost if wrong: one-line flip. (2) deep link t= superseding a running takeover must win: apply the link clock only after the superseded takeover's restore settles; test it — cost: saga ordering change in navigateSaga. (3) drop capturedAtMs: re-anchor at capture. (4) assert manual-playing anchor. (5) trim the bracket test to 'capture includes time'. Fix round → T5 implementer after dispatch D lands (avoid concurrent commits).
- Task 6: complete — 912e04f66 (separate FITTED_BODIES list; stepMinutes; horizonsFetchPieces util; readSeries reads 4 cols only — fitted rows are position-only). Review (sonnet) running.
- T5 fix round sent to T5 implementer (rulings above).
- T6 review: clean (byte-identical). Minor owed (inline after T5 fix): trim horizonsBodies.test.ts to the 'every fitted id has a fetch row' check; restore blank line fetchHorizons.ts ~22.
- T5 fix: 39fe93fc1 (capturedAtMs dropped; live-paused → captured instant; navigateSaga: exitTakeover + take(takeoverEnded) before link clock when a takeover is active).
- T6 minors: 0ddc2e761 (inline). PR1 local gate running; then push #851, ready-for-review, watch CI; branch mission-trails off prep.
- PR1 gate green (1470 files/15324 tests), pushed, #851 ready for review, CI watch bg. NOT merging (needs user word).
- Feature branch `mission-trails` created off prep HEAD 0ddc2e761. Dispatch E (T7 fetch+asset) running. Plan: F = T8+T9, G = T10, H = T11 (design core tier) + T12.
- Task 7: complete — 0956931d0. V1 1,804 / V2 1,924 samples, bin 164,080 B (2x estimate), worst err 1.000 km. DEFECT SUSPECTED: closest approaches off — V1 Titan 5,384 km centre @05:39:58 (pub 6,490 / ~4,394 alt), V2 Neptune 33,649 (pub ~29,700 centre), Uranus 102k (pub ~107k). Launch events date-granular (+~1 d). Manifest skipped (symlinked public/data) — hash on main at close-out. Debug agent (opus) dispatched, scratch only.
- UX design done → committed as docs/superpowers/specs/2026-10-05-voyager-mission-ux-design.md (6c26c14a9). Core C1–C5 = Task 11 scope (+ , . shortcuts). Provisional rulings appended in the doc (whole-mission framing; no N2; widened event kinds; V2 deeper copper; clock rate untouched). Next/Later → backlog in T12.
- Dispatch F (T8+T9) running.
- DEBUG RESULT: Horizons Sun-centred craft (Voyager file's own planet chain) vs DE441 planets: off 0.4k Jup, 1.4k Sat, 5.3k Ura, 13.6k km Nep → craft positions WRONG near planets. Our code correct. Horizons direct craft-vs-body = published (Titan 6,598 @05:40, Ura 107,154 @17:59, Nep 29,240 @03:56). Horizons-data jumps: V1 1981-01-01 65k km, V2 1989-08-29 13k km.
Ruling: per encounter blend to DE441 barycentre chain (w=1 ±20 d, cosine taper to 0 at ±120 d); flyby events from Horizons craft-vs-body direct; leave the data jumps, report them; real launch instants as literals. Cost if wrong: re-fetch + rebuild. Fix sent to T7 implementer.
- T7 fix: 93f0d71df — blend to DE441 barycentre chain (max shift Nep 13,600 km), events from Horizons direct (Titan 6,587 @05:40:22, Nep 29,236 @03:55:40, Ura 107,154 @17:58:51), real launch literals, tracks start at first minute. V1 1981-01-01 64k km Horizons segment jump left. bin 164,392 B. T7 review dispatched.
- Task 8: complete — d708f32ca; Task 9: complete — 0d8b98db3 (load saga waits engine ready; sceneBodyLabels takes simDays; fixture voyager rows removed; Vec3 not Vec3d). Review (opus) running.
- T7 review: 2 Important (worstErrorKm used a 2nd Hermite copy; events unsorted) + 6 Minor → fix round sent to T7 implementer.
- Dispatch G (T10 trail pass) running, concurrent with T7 fix (different files).
- T7 review fixes: 93054d650 (hermitePositionKm kept for decimator loop only; timed span restricted to one chunk; readSeries + time constants left).
- T8/T9 review: no Critical. Fix round sent: rotationLookAt zero-vector fallback; presence filter moved to frameContext once/frame (covers hostless slab rows, partition drops per-call filter); assetWiring demand-load gate; extent test with a 150 au track; dead hyperbola test/doc. OPEN for user: should arrival/palette refuse focusing an absent craft (today: frames Earth, craft-sized distance).
- Task 10: complete — 6d97d1f34 (geometry cache in src/services/bodies/missionTrailGeometry.ts; dynamic-offset per-craft uniforms @group0 binding2; head segment separate draw). My look at t10-neptune.jpg: V2 mesh at Neptune, copper trail welds to the mesh, Triton orbit visible — PASS; occlusion behind a planet not yet seen. Review owed after F fix lands.
- T8/T9 fixes: cd4a20dc8 (presence once in frameContext; assetWiring demand gated; rotationLookAt fallback). Known red: renderFrame.test + renderFrame.timing.test — missionTrailsPass reads state.settings.orbitTrails absent in their stub state → T10 fix round.
- T10 review (opus) + dispatch H (T11 = UX core C1–C5 + , . shortcuts; T12 backlog) running.
- T10 review: no Critical; 4 Important (stub gap → add missionTrailRenderer:null; duplicate colours → colour on SAMPLED_BODIES row from palette; per-frame allocs → scratch; upload-in-getter → renderer.setTracks(version)). Write-hazard checked: not a bug (per-craft slots, per-view submits). Fix round sent to T10 implementer incl. an occlusion shot. H told: read colour from SAMPLED_BODIES row, don't touch palette/missionTrailStyle/spacecraftBodies.
- T10 fixes: 5fe5a4a81 (trailColor on SAMPLED_BODIES rows; scratch writes; cache in renderer; missionTrailGeometry deleted). OCCLUSION PASS — my look at t10-saturn.jpg: V1 gold trail hidden across Saturn's disc, resumes past the limb. Dispatch H still running.
- Task 11: complete — e84a5f2ad; Task 12: complete — cf2c2814c. My look at t11-exhibit.jpg: fork of both trails from the planets' plane, two-lane era timeline, event list w/ captions — matches mockup; axis '1977/1980' collision fixed after shot (re-shoot owed). Deviations: V2 heliopause source row dropped; lanes V2 above V1; shortcut key split regex fix; no thumbnail until capture-featured.
- NEXT: whole-branch final review (opus) → one fix round → local gate → push + PR (stacked on #851) → /feature-done (deletion audit) → user smoke.
- Final review: fix first (2 Important: Neptune caption wrong; missing clip-clock backlog item) + Minors 3-8,10 → one fix round to H agent. Item 9 (frameContext filter alloc) accepted. Gate: 1 red (visual baseline stub) fixed cb9eb7bed.
- Final review fixes: fd69eaaca (captions, clip-clock backlog, SampledBody type, drawTrail param, ARIA, timeline split, card const, perifocal comment). Axis labels re-shot OK. /feature-done: deletion audit (opus) running.
- Feature branch pushed; draft PR #854 (base mission-trails-prep, stacked on #851; no GitHub CI → local gate). Deletion audit running; then safe-now commit, gate, /feature-done moves, smoke links to user.
- Deletion audit: ~296 LOC safe-now. Ruling: NOT reverting P4 switch/exhibitSectionHasRule (ruled prep; auditor's 'restore if-chain' = silent default P4 removed). Applying the rest via a fresh sonnet agent. Needs-ruling left for user: renderTimeline prop vs store-aware NoteSection; generic phone CSS (kept, design C4); VOYAGER_CARD in two tabs (kept); Titan surface console note (kept).
- Deletion safe-now: ebff7ec63 (+131/-405; bin sha1 unchanged 3642e6c0; events identical minus targetId). Full gate running. Then push #854; smoke links to user; /feature-done after user smoke.
- Gate green after trims: 1481 files / 15472 tests, typecheck, prettier on all 146 touched files. Pushed #854 @ ebff7ec63. NEXT: user smoke via deep links → /feature-done moves (plan+spec+UX spec+ledger to completed) → user merge word for #851 then #854 (retarget). Before merge: R2 sync spacecraftTracks.bin + build-data-manifest on main; capture-featured thumbnail. OPEN for user: absent-craft focus ruling; UX provisional rulings; 4 needs-ruling deletion items; N2 Look closer.
- ASKED user (dash aUa3, unanswered): smoke pass? · keep provisional UX rulings? · absent-craft focus (rec: leave, backlogged / redirect to Earth / refuse) · merge #851 then retarget+merge #854 (after R2 sync + manifest on main). On 'smoke passed': run /feature-done on #854 (moves plan + both specs + this ledger to completed, tick DoD), push, then merge only on the user's word. No agents in flight; tree clean @ ebff7ec63.

## Revision 1 — one craft at a time (2026-10-06)
User rulings (asks hnUt + NENh): V1/V2 craft switch; story-first time control (chapter bar + Prev/Next, faint scrubber); event card replaces list; era-split axis KEPT; other craft's trail + label DIM.
Seam (Plan agent): `orbitTrails.emphasis: string|null` (captured/restored by takeover for free); emphasisDim helper; trail pass opacity; caption dim applied after produceSceneBodyCaptions memo. Exhibit entry sets emphasis 'voyager1'.
Ruling: trail opacity snaps on switch (no per-craft fade envelope) — cheap; if wrong, add an eased value.
Brief: rev1-brief.md. Implementer (Sonnet) dispatched in bg → report rev1-report.md. NEXT: review diff + shot → dash check to user → push. Then aUa3 landing questions still open.

## Rev1 follow-ups landed (pushed to #854)
aea1d71e7 tab order V1 left + authored route subtitles (crafts list) · d382e5779 Exhibit.drift?: false, Voyager no hold drift · df4526eb6 UX doc Revision 2 (ride-along APPROVED).
## Ride-along: refactor-ground IN FLIGHT (2026-10-07)
Two bg agents: call-graph/seams (Plan, opus) + greenfield cross-check (opus). On both back → checkpoint to user (ideal shape, tension options, joints, prep list, adjacent, ask incl. PR packaging) → spec → plan.
Checkpoint presented (ask ss3a, pending): TimeState.profile wall→sim table (cleared by every time action; only startRide sets; captureScene + t= strip it); camera.ride + CAMERA_DRIVERS 'ride' row; MissionEvent.targetId; exhibitBodySaga hold → loop race(exitTakeover, stepToMissionEvent), finally clear camera.ride; new hermiteTrackVelAt, flybyRelativeState, buildRideProfile, ride pose. Prep P1 stepToMissionEvent action from all 4 step sites (+dots as buttons, dedupe next-event x3); P2 followsMovingTarget row flag replacing isFollowDriverId.ts:7 (replayInput.ts:212, commitOnEdge.ts:41, shouldKeepTicking.ts:26). Correction: exit does NOT restore camera pose (captureScene). Adjacent→backlog: BodyState velocity. Packaging rec: all on #854.
