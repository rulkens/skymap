# SDD ledger — plan: docs/superpowers/plans/2026-09-24-black-holes-layer-02-layer.md

Branch `worktree-black-holes-layer-2`, draft PR #825. Plan commit 70e55cff9.
User answers (2026-09-24): 3 sequential dispatches — D1 = Task 1, D2 = Task 2, D3 = Tasks 3+4. NO perf gate.
Protocol: lean SDD (docs/superpowers/conventions/sdd-execution.md). All of T1–T3 tagged review: yes → Opus implementers + one mid-branch review each (one round, no re-review); one final review.
Pre-flight scan: no conflicts beyond the plan's own P1–P6 rulings (already user-approved).

D1 (Task 1): dispatched opus, BASE 70e55cff9, bg agent — running
D1 (Task 1): DONE opus, 70e55cff9→877436bbc; deviations: test at tests/layers/blackHoles/present/blackHoleSlabRow.test.ts; pass rewritten as factory (no refactor rename); SgrAStarLensingTuning type name kept; 3 extra tests edited; DebugPanel lens section order moved before MW tuning
D1 review (opus): APPROVED, 4 minors → carried into D2 as a separate fixup commit first (extract SKY_CUBEMAP_TARGET to render/skyCubemapTarget.ts; stale SgrAStarLensingTuning.d.ts:35-36 comment; move SgrAStarLensingRenderer.d.ts to Layer @types + fix 'billboard' header; trim blackHoleSlabRow.ts header)
Task 1: complete (commits 70e55cff9..877436bbc, review clean, 4 minors → D2)
D2 (Task 2): dispatched opus, BASE 877436bbc
D2 (Task 2): DONE opus, 877436bbc→c31fc15c9 (fixup minors)→584750f45; deviations: blackHole row carries label/detailLabel/massSolar (boundary test forbade buildFocusable→Layer import); bodyCaption gains footprintRadiusM param; blackHoleFadeRows.ts key 'bodyLabel'; card image renamed blackhole-sgr-a-star.webp; bodyRowChip dedupe branch deleted; layerSearchCleared from saga finally on cancel; tests written after code
D2 review (opus): FIXES NEEDED — 2 Important (tour bodyLabel hide no longer reaches blackHoles.items → caption stays up in earthCosmicWebLoop; cancel-only layerSearch clear untested), 3 minors; fix round 1/1 sent to D2 implementer
Adjacent (ask user at end): sceneBodyLabelId (sceneBodyLabels.ts:55-62) zero readers + false claim — delete or wire
D2 fix round 1/1: 584750f45→5b63498cb; all 5 addressed; saga test exposed real bug (one-yield feed finished before cancel → rows never cleared) → runLayerSearchSaga parks after feed
Task 2: complete (commits 877436bbc..5b63498cb, review fixes applied)
D3 (Tasks 3+4): dispatched opus, BASE 5b63498cb
CI on 5b63498cb: GREEN. D3 agent stalled (network, 600s watchdog) mid-Task 3 after row edits; resumed same agent via SendMessage
D3 (Tasks 3+4): DONE opus, 5b63498cb→bee97ab05 (T3)→735690c6d (T4); deviations: starPointsPass pickEnabled deleted (served only the caption stamp); missing anchor → marker brightness 0 (was Infinity); ContentPass doc bullet rewritten; docs/layers/README.md does not exist (skipped). Pushed.
Ruling: Task 3's review: yes mid-branch review is folded into the final whole-branch review — D3 is the last dispatch, so a separate review would see the same diff one step earlier — cost if wrong: one fewer review seat on Task 3's pick/exclusion logic
Final review: dispatched opus over d415deefd..735690c6d
Final review (opus): READY, 0 Critical/Important, 10 minors + RENDERER.md newline → one fix round to the D3 implementer (no re-review, per lean protocol)
Final fix round: 735690c6d→c9de8bf4b, all 11 addressed (sgrAStarCaptionTarget inlined; galacticCentre place test moved to tests/data/places/). Pushed.
PLAN EXECUTION COMPLETE — next: user smoke (DoD observable behaviours) + /feature-done (DoD audit, deletion audit, plan/spec/ledger → completed/). Open ask: sceneBodyLabelId adjacent.
Ruling (user, 2026-09-25): BlackHoleId audit — keep as is (BLACK_HOLES stays an array, pick stays Source.SgrAStar + row index, AnyEntry aliases stay). Do not re-propose.
Post-review (user): selection body/blackHole arms = Info & {driver} — c8befbab6 (controller inline)
Ruling (user-directed, 2026-09-25): lens stack made generic — BlackHoleRow.band → capture: SkyCaptureKey (band read off CUBEMAP_CAPTURES[row.capture]); SgrAStarLensing* renderer/uniform packer/types/tuning/UI/WESL renamed BlackHoleLensing*; sgrAStarLensEnvelopeM → blackHoleLensEnvelopeM(row). Reverses plan deferral 'renderer and WESL keep their names'. Capture key 'sgrAStar', Source.SgrAStar, caption kind keep names. Tuning stays one global knob (per-hole emission deferred to M87*).
D4 (generic lens): dispatched sonnet, BASE c8befbab6
D4 handling on report: verify grep-clean + npm run build passed → push → watch CI (gh pr checks 825) → report to user. No review round (rename-only, user-directed).
QUEUED after D4: user smoke pass on dev server http://localhost:5173 (bg shell from this wt, plan DoD 'Observable behaviours') → /feature-done (DoD audit, deletion audit, plan+spec+ledger → completed/, ledger archive) → merge ONLY on user's explicit word. Open ask: delete sceneBodyLabelId (sceneBodyLabels.ts:55-62, zero readers)? — unanswered.

D4 complete: d5a8e8f8a (the first agent hit its context limit and handed off in d4-handoff.md; a second agent finished the work). Typecheck, tests and build pass; the grep finds only the sanctioned SCALE_FADE_BANDS.sgrAStarLensing key. Pushed with c8befbab6. CI watch running.
NEXT: CI green → user smoke on :5173 → /feature-done → merge only on the user's word. Open question: delete sceneBodyLabelId?

/feature-done: full suite 1417 files/14778 tests green, tsc clean; CI green on c5bdb5cd5 (sceneBodyLabelId deleted, user "sure").
Deletion audit: deletion-audit.md. Safe-now S1–S13 → 0a170da09. User rulings: N1 move emission→initialState YES, N2 derive anchorId YES, N3 leave, N4/N5 skip. N1+N2 agent in flight.
User: "you can merge when CI ready" (2026-09-25). NEXT: N1/N2 commit → completion moves (plan+spec→completed, ledger archived, checkboxes ticked) → push → CI green → squash-merge #825 → cleanup.
User 2026-09-25: after merge run /wt-close.
