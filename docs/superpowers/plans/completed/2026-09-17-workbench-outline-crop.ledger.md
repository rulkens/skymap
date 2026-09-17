# Ledger — 2026-09-17-workbench-outline-crop

Plan: docs/superpowers/plans/2026-09-17-workbench-outline-crop.md · PR #746 · wt sondermarken-mesh-z-clip
Start BASE fc51d1174.

Pre-flight: parallelism = this plan only (user AFK, authorized autonomous build); perf gate = none (plan ruling).

Ruling: mid-branch reviews collapse to one per dispatch group that holds `review: yes` tasks (A, B, C, D), and those groups run on Opus — 10 per-task reviews is the per-task chain the lean protocol retired; groups already share one mental model — cost if wrong: a spec drift inside a group surfaces at group end instead of task end (one extra fix commit).
Ruling: groups run serially (A→B→C→D), not A∥B — one worktree shares one git index; B's independence saves wall-clock the AFK user is not waiting on — cost if wrong: ~30 min longer.

## Dispatches

- A (T1–3) opus · fc51d1174→0ad1d4b5d · DONE · P1 golden bit-identical; deviations: parity fixture projection obj, ortho half-height from perspective FOV const
- A review opus · maths correct · 4 findings: (M) splat.wesl scales by view depth → broken under ortho; (L) spec §4.4 bullets stale vs rulings + affine picking; (L) local `type Row<K>` in cameraProjections.ts; (L) isZOnlyRotation test can't catch [0]-only check. Fix round deferred until B lands (shared index): 2–4 inline by controller; 1 rides D.
  Ruling: splats are skipped while projection is orthographic (not an ortho J in splat.wesl) — draw mode only needs the mesh; smallest diff — cost if wrong: no splats while drawing, which the user can't use for tracing anyway.
- B (T4–11) opus · 0ad1d4b5d→4d4167d43 · DONE · earcut 3.2.3 (own d.ts); gitignore negation; deviations: bow-tie check before area, cut vertex lerped from key-first endpoint (bit-identical), TexturedMeshGeometry left in pack/, CLI validates formatVersion; T11 test not run red first. A fix items 2–4 folded into C dispatch (index).
- B review opus · no blockers · L1 fast-path uses proper-crossing segmentsCross (reflex-corner touch) → shared inclusive segmentsTouch, delete segmentsCross; L2 earcut → devDependencies; L3 uvCoverage clamp contradicts header; L4 cosmetic (skipped). L1–L3 fold into D dispatch.
- C (A-fixes + T12–15) opus · 4d4167d43→a8d103baf · DONE · 52 workbench tests; texturedMesh.wesl validated by hand-link + naga (not browser); deviations: sample before discard, binding name maskPolygon, endpoint 500 on IO, takeEvery predicate, outlineSaveFailed on network error.
- C review opus · endpoint/layout/shader clean · M1 stale outline GETs/save across group switch (takeLatest on manifestLoaded only); M2 group switch mid-draft leaves ortho camera; L3 double draw-enter loses returnPose; L4 cornerMoved no bounds; slop MASK_MIN_BYTES dup of packMaskPolygon(null); nit dup reducers (deletion audit). Fix after D lands (shared index), with D review findings in one round.
- D (B-fixes + T16–19) opus · a8d103baf→acb04fe24 · DONE · splat skip under ortho in sceneRenderers.draw; corner controls left-button + ortho only; plan ruling 12 + DoD segmentsCross line now stale. Next: final whole-branch review (fc51d1174..acb04fe24) ∥ C-review fix dispatch.
- FINAL review opus · no blockers · D: M handle px (device) vs hit radius (CSS) mismatch; L zM lift comment wrong/dead; L draft-asset lookup ×3; L overlay realloc per corner; L literal \*4, inline held type, threshold <= vs <; L setPointerCapture desktop-only note; L splat re-sort in ortho. Stale spec/plan: §4.6 fast path, §4.3 slice snippet, §4.4 line-list, §10 maskPolygon.wesl + earcut dep, plan T19 + ruling 12 + DoD segmentsCross. Deletions: zM lift, `?? false`, dup font-size, MeshOutlineControls test.
  Ruling: final fix round applies all except overlay realloc (L4: a hand-drawn ring has tens of corners; realloc per click is invisible) — cost if wrong: none measurable.
  Ruling: delete MeshOutlineControls.test.tsx despite the plan — it restates `disabled={!closed}` (testing.md) — cost if wrong: a regressed Save gate the user notices on first draw.
- C-fix sonnet · acb04fe24→df6939791 · DONE · 59 workbench tests; group-switch restore uses a saga-local liveReturnPose mirror (reducer clears draft first) → un-braid in final fix round.
- final fix opus · df6939791→8e25d77ef · STALLED (watchdog) after 2 commits, code items 1–9 landed; docs 10–11 done inline by controller 96d14fd33. CI pending.
- CI green 96d14fd33 (typecheck·test·format 5m33s, Workers build).
