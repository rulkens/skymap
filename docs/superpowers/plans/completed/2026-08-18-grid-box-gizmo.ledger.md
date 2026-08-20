# SDD ledger — plan: docs/superpowers/plans/2026-08-18-grid-box-gizmo.md

Spec: docs/superpowers/specs/2026-08-18-grid-box-gizmo-design.md (authority).
Ground prep: .superpowers/sdd/2026-08-18-mcpm-workbench/gizmo-ground-prep.md.
User approved execution 2026-08-18 ("you cn implement the gizmo").
Rides PR #570, branch worktree-polyphorm-webgpu-tool, same worktree as the
mcpm-workbench plan. Implementers strictly serial with that plan's remaining
tasks (S15 runs first); reviews pipelined STATIC when an implementer edits.

## Pre-flight conflict scan (2026-08-18)

Task-pair rows (shared files/interfaces):

| Pair | Producer vs consumer | Finding |
|---|---|---|
| A1 ↔ F2.3 | worldToBoxLocal/boxLocalToWorld: A1 identity, F2.3 adds R | Consistent — A1's header text explicitly defers R to F2.3 |
| A1 ↔ F2.4 | boxPreviewPass worldBounds: A1 funnels via boxHalfExtentMpc, F2.4 replaces outright | Consistent — spec §3 pins "legitimate at Prep A, replaced not refactored in F2" |
| B1 ↔ F2.3 | cameraBasis box param: B1 unused, F2.3 rotates by conjugate | Consistent — byte-identical argument holds (nothing to rotate until F2.1's field exists) |
| F1.2 ↔ F2.5 | gizmoHandleGeometry/pickGizmoHandle rings | Consistent — contract §3: F1 stubs radiusMpc 0, pick skips radius<=0, F2 changes values not shape |
| F1.4 ↔ F2.4 ↔ F2.5 | boxLines.wesl: glyph draw → BoxUniform reshape → ring glyphs | Sequential per DAG; F2.4's 80-byte layout table is the single byte-layout authority |
| F1.5 ↔ F2.5 | Viewport gizmoDragging: rotate branch "inert until F2.5" | Consistent — GizmoDragState union (contract §2) already carries the rotate variant |
| F1.3 ∥ F1.4 | declared parallel | File sets disjoint (gizmo/ pure math vs wesl+render) — OK |
| F2.1 ∥ F2.2 | declared parallel | File sets disjoint (workbench state/export vs src/utils/math) — OK |

Per-task self-consistency: each task's test list matches its produced
interfaces; file-create lists match later-touch lists; checked while reading.

Findings + rulings:

1. **F2.1 path error**: lists `tools/mcpm-workbench/src/export/exportParams.ts`
   — the file lives at `src/state/exportParams.ts` (verified on disk; V3
   created it there beside importParams). Ruling: use src/state/; carry the
   correction in F2.1's dispatch. Cost if wrong: none (tsc would catch).
2. **F2.5 label slip**: lists `gizmoHandleGeometry.test.ts` under Files
   (create) with "(extend)" — it exists from F1.2. Ruling: treat as modify.
3. **Line-number drift**: F1.5 cites Viewport.tsx:717/:487, F2.1 cites
   importParams.ts:35-45 — S14/S15 land before A1, numbers will shift.
   Ruling: dispatches say "read the file; cited lines are anchors not
   addresses".
4. **Probe script name verified**: `npm run mcpm-workbench:probe` exists
   (package.json:62). `npm run typecheck` covers both tsconfigs. No ruling
   needed.
5. **F1.6 probe hover mechanics** unspecified (how a headless step sets
   hoverHandle) — left to the implementer; the probe drives Playwright
   mouse events already (params:save-load precedent). Not a defect.
6. **S15 interaction**: S15 (mcpm plan) edits importParams/exportParams
   before F2.1 does; F2.1's implementer must read the post-S15 file state.
   Carried in sequencing note above.

## Task board

- A1: pending (dispatch after S15 lands + its review clears)
- B1 → F1.1 → F1.2 → F1.3∥F1.4 → F1.5 → F1.6 → F1-GATE (user checklist)
- F2.1∥F2.2 → F2.3 → F2.4 → F2.5 → F2-GATE (user checklist)
- A1 dispatched (task-A1-brief.md written from plan; base 6c9ef3d8d; sole gate-runner). S16 review running static in parallel.
- A1 landed: c247ed1ce (typecheck green, 104 workbench + 7093 full-suite tests, zero expected-value edits = byte-identical proof). Reviewer dispatched (gates allowed) on review-6c9ef3d8d..c247ed1ce.diff → task-A1-review.md. Per plan sequencing, B1 dispatches only after this review clears. Special attention flagged: F2.3-compatibility of the pair's algebraic shape.
- A1 review: PASS/PASS, 0 majors. A1 COMPLETE. Parked: 2 comment-ratio
  overages (justified deferral content). Real finding: exportScfd.ts
  origin math is a 6th funnel site the inventory missed. Ruling: folded
  into B1 as its own byte-identical commit ahead of the cameraBasis one.
- B1 dispatched (task-B1-brief.md, base c247ed1ce, sole gate-runner,
  probe required).
- B1 landed: 47b4ae7a4 (exportScfd funnel) + 1ad4a7127 (cameraBasis box
  param). Gates: typecheck, 104 tests unchanged, probe exit 0.
- Pipelined: F1.1 implementer (task-F1.1-brief.md, base 1ad4a7127, sole
  gate-runner, new src/gizmo/ module) ∥ B1 STATIC reviewer
  (review-c247ed1ce..1ad4a7127.diff → task-B1-review.md). Disjoint files.
- B1 review: PASS/PASS, 0 majors. B1 COMPLETE. Prep phase done. PUSHED through 1ad4a7127. F1.1 still running.
- F1.1 landed: c5aeee43c (Ray.d.ts + screenToRay/closestPointOnRayToLine/
  rayPlaneIntersect, 6 tests, full suite 7099 green).
- Pipelined: F1.2 implementer (task-F1.2-brief.md, base c5aeee43c, sole
  gate-runner) ∥ F1.1 STATIC reviewer (review-1ad4a7127..c5aeee43c.diff
  → task-F1.1-review.md; asked to independently re-derive the math and
  probe the behind-origin/epsilon questions).
- F1.1 review: spec PASS, quality PASS-WITH-FINDINGS, 1 MAJOR (test
  rigor: both screenToRay tests fix aspect=1/fov=π/2, can't catch an
  axis/aspect swap; implementation itself verified correct vs
  fragment.wesl:59 + tracePass.ts:183-189). Fix round 1 QUEUED until
  F1.2 lands (gate-runner busy): resume F1.1 implementer to add a
  hand-computed non-degenerate case (aspect≠1, fov≠π/2, both ndc axes
  nonzero), no production change expected.
- F1.2 landed: 59846ab8a (4 @types + encode/geometry/pick, 18 gizmo
  tests, full suite 7111 green).
- Pipelined: F1.1 fix round 1 dispatched (resumed implementer;
  non-degenerate screenToRay test, gate-runner) ∥ F1.2 STATIC reviewer
  (review-c5aeee43c..59846ab8a.diff → task-F1.2-review.md; scrutiny:
  nearest-hit determinism, encoding injectivity, resize axisDir sign
  convention F1.3 depends on).
- Next after both: F1.3 (drag math), then F1.4 (glyph draw, wesl skill +
  probe).
- F1.1 fix round 1 landed: 79bcb8ead (non-degenerate case tanHalf=2,
  aspect=1.5, ndc=[0.5,-0.25], passed first try — production confirmed
  correct). Ruling: CLOSED, controller-adjudicated by re-deriving the
  hand arithmetic (single-test diff, review seat not warranted). Cost if
  wrong: one weak test. F1.1 COMPLETE.
- F1.2 review: spec PASS, quality PASS-WITH-FINDINGS, 1 MAJOR (axisDir
  +axis-always convention undocumented in Handle.d.ts — geometry itself
  correct). Ruling: folded into F1.3 dispatch as commit 1 (doc line).
  Parked minors (task-F1.2-review.md): vestigial no-op ring loop in
  pickGizmoHandle; cross-hit test comfortable not adversarial (8x margin
  by construction); no non-cubic min(halfExtent) test; tied-tips comment
  overclaim. F1.2 COMPLETE.
- F1.3 dispatched (task-F1.3-brief.md, base 79bcb8ead, sole gate-runner,
  commit 1 = Handle.d.ts convention pin). PUSHED through 79bcb8ead.
- PAUSE (user presentation, 2026-08-18 afternoon): F1.3 implementer
  still running — on its notification, LEDGER ONLY, no review dispatch,
  no push, no new tasks until the user resumes. Resume point: F1.3
  review → F1.4 (wesl skill + probe) → F1.5 → F1.6 → F1-GATE user
  checklist. Task board artifact refreshed (label gizmo-underway).
- F1.3 landed DURING PAUSE: f32c20ca9 (Handle.d.ts convention pin) +
  3c46a8afd (drag math; full suite 7117 green). LEDGER ONLY per pause.
  DEVIATION (implementer, verified by my own re-derivation): spec §5's
  resize center formula `center += axisDir·sign·delta/2` drifts the
  anchored face at sign=-1; implemented general form
  `center = anchor + sign·newHalf·axisDir` (coincides at sign=+1),
  with a sign=-1 regression test. SPEC ERRATUM — on resume: reviewer
  verifies, and a one-line spec §5 correction rides the next docs commit
  (F1-GATE). Resume: F1.3 review → F1.4.
- RESUMED (user: "can you continue the work", 2026-08-18). PUSHED through
  3fafab264. Pipelined: F1.4 implementer (task-F1.4-brief.md, base
  3fafab264, sole gate-runner incl. probe; ruling: probe required this
  task despite plan's F1.6-only gate — wesl edits reach the live HMR
  page, cost if wrong: one probe run) ∥ F1.3 STATIC reviewer
  (review-79bcb8ead..3c46a8afd.diff → task-F1.3-review.md, erratum
  verification mandated) ∥ S17 STATIC reviewer (mcpm plan, see that
  ledger). F1.4 brief notes Viewport call site may take null,null
  placeholders (F1.5 replaces).
- F1.3 review: spec PASS, quality PASS-WITH-FINDINGS, 0 MAJOR. ERRATUM
  CONFIRMED by independent re-derivation: spec §5's
  `center += axisDir·(sign·delta/2)` holds only at sign=+1; the correct
  sign-independent form is `center += axisDir·(delta/2)` (no sign
  factor) — implementation's `anchor + sign·newHalf·axisDir` expands to
  it at both signs and under the MIN_SIZE_MPC floor. F1.3 COMPLETE.
  Spec §5 one-line correction (no-sign-factor form) rides the F1-GATE
  docs commit. Parked minors (task-F1.3-review.md): MIN_SIZE_MPC
  exported not module-local; Handle.d.ts doc comment 3 lines vs 1-2.
- F1.4 landed: d95dec651 (glyph storage buffer + second draw + highlight
  chain; typecheck, 130 tests, prettier, probe exit 0 on retry — attempt
  1 hit the documented raymarch:preview-packed flake, 0 GPU errors both
  runs).
- Pipelined: S17 fix round 1 implementer (mcpm plan, test-fixture
  non-default values, sole gate-runner) ∥ F1.4 STATIC reviewer
  (review-3fafab264..d95dec651.diff → task-F1.4-review.md; scrutiny:
  storage-buffer stride vs WGSL struct, encoding agreement, highlight
  precedence, per-frame buffer reuse). F1.5 dispatches after the S17 fix
  lands (implementers serial).
- S17 fix closed (mcpm ledger). F1.5 implementer dispatched
  (task-F1.5-brief.md, base da47652df, sole gate-runner incl. probe;
  brief pins: gizmo drag through existing setters — importedBox clearing
  CORRECT for drags; hoverHandle stays a closure var; boxPreviewUntil
  gate OR-composed not replaced). F1.4 STATIC review still running.
- F1.4 review: spec PASS, quality PASS-WITH-FINDINGS, 0 MAJOR. F1.4
  COMPLETE. Parked minor (task-F1.4-review.md): boxPreviewPass.ts module
  header 13 lines vs ≤10 budget — joins the parked-minors trim
  inventory. Byte-layout/encoding/buffer-reuse scrutiny all clean.
- F1.5 landed: ace55e22b (hit-test gate + drag dispatch + hover closure +
  drawBoxPreview wiring; typecheck, 130 tests, probe 18/18 0 errors).
  Implementer deviation declared: isAxisDrag type predicate (nested
  handle.kind discriminant defeats plain narrowing) — reviewer rules.
  PUSHED through da47652df earlier this block.
- Pipelined: F1.6 implementer (task-F1.6-brief.md, base ace55e22b, sole
  gate-runner — probe IS the deliverable; hover+active steps must appear
  in step list) ∥ F1.5 STATIC reviewer
  (review-da47652df..ace55e22b.diff → task-F1.5-review.md; scrutiny:
  gate ordering, ndc y-flip/aspect agreement, resize dual-write,
  predicate deviation). After both + F1.6 review: spec §5 erratum
  correction + F1-GATE user checklist.
- F1.5 review: spec PASS, quality PASS, 0 majors 0 minors. isAxisDrag
  predicate deviation ACCEPTED (genuine cast-free narrowing; contract
  type untouched). Reviewer independently verified ndc y-flip vs
  vertex/fragment.wesl, screenToRay pre-scaling vs tracePass.writeView,
  miss-path byte-identical, resize dual-write. F1.5 COMPLETE. Pushing
  ace55e22b.
- F1.6 landed: 8c925a871 (probe step gizmo:hover-drag, 19→20 steps, 0
  errors; drag verified empirically — center-y slider moved 0→4.92, so
  the pointerdown genuinely hit the handle). Pipelined: F1.6 STATIC
  reviewer (review-ace55e22b..8c925a871.diff → task-F1.6-review.md;
  scrutiny: both uniform paths render a frame, no prod backdoors) ∥
  spec §5 erratum docs implementer (no-sign-factor form + anchored-form
  note; docs-only commit). After both: F1-GATE user checklist.
- Spec erratum corrected: cb9c106f1 (docs-only; §5 resize center is
  axisDir·(deltaMpc/2) no sign factor, anchored-form note added).
  Erratum thread CLOSED. Awaiting F1.6 review, then push + F1-GATE.
- F1.6 review: spec PASS, quality PASS-WITH-FINDINGS, 0 MAJOR, 1 MINOR
  (hardcoded aim (640,306), no self-check — silent no-op on drift).
  Ruling: PROMOTED to fix round 1 rather than parked — a probe step
  that can silently stop testing its subject defeats the probe's
  purpose; fix = in-step assertion that manualCenterMpc changed. Cost
  if wrong: one small dispatch. Fix implementer dispatched (sole
  gate-runner). After it lands + my diff check: push all, F1-GATE.
- F1.6 fix round 1 landed: 8b660fef7 (before/after aria-valuenow read on
  the "center y" slider straddling the drag, hunks at :377/:386
  verified; probe 20 steps green with assertion live). Ruling: CLOSED,
  controller-adjudicated by reading the diff. F1.6 COMPLETE. ALL F1
  TASKS COMPLETE. Pushed through 8b660fef7 (incl. cb9c106f1 spec
  erratum). NOW AT F1-GATE: user visual checklist presented — spec §7's
  F1 items: hover highlight, translate drag moves box, resize drag
  anchors far face, empty-space drag still orbits, slider edits still
  work, dims readout tracks. F2 dispatches only after user pass.
- F1-GATE round 1: USER FAIL — "cube disappears within 200ms", hover/
  drag unreachable (can't reach a handle inside the slider window; drag
  hold is unreachable chicken-and-egg). Plan gap: no persistent
  visibility path. Ruling: F1-GATE fix = showGridBox toggle (default
  ON) in GridBoxPanel, following the existing overlay-toggle
  convention; visibility = toggle || boxPreviewUntil window ||
  gizmoDragging (OR-composed). Implementer dispatched
  (task-F1.7-brief.md, sole gate-runner). Re-present checklist after.
- F1.7 landed: d4980e1db (showGridBox on gridSlice default true, "show
  box" checkbox in GridBoxPanel, Viewport visibility+picking gated on
  the composed condition; 4 files, probe green incl. gizmo:hover-drag,
  probe file untouched — report's 19-step count is a counting quirk,
  step present). Review: fold into next boundary (static) alongside
  F1-GATE re-check. F1-GATE round 2 presented to user.
- F1-GATE round 2: USER FAIL — "the gizmo doesnt actually work
  properly" + request: Blender-style gizmo (per-axis RGB, cone-tipped
  arrows, rings). DIAGNOSIS (mine, from reading Viewport.tsx:822-846):
  move handler measures param against deriveGridBox(current).centerMpc
  — a MOVING origin — while anchorAxisParam is from the drag-start
  center. Translate cancels exactly (e_{k+1}=u_k) but resize's center
  moves delta/2 per event → recurrence e_{k+1}=(e_k+u)/2 → dragged face
  converges to 2× cursor displacement and creeps on pointer jitter.
  Fix ruling: fixed-anchor drag — GizmoDragState gains anchorBox
  captured at pointerdown; every move computes param vs
  anchorBox.centerMpc and applies drag math to anchorBox with total
  delta (same fixed-anchor principle spec §5 already mandates for F2
  rotation). Probe's single-step drag couldn't catch it (few move
  events, creep small). Dispatched as F1.5 fix round 1.
- Blender restyle accepted as F1.8 (gate-driven scope add, user
  request): per-axis RGB from handleId (axis=(id/10)%10 in shader),
  hover=brighten, active=white, cone-ish arrowhead line fans; rings
  arrive with F2.5 per plan. Dispatch after fix round lands (serial).
- F1.5 fix round 1 landed: 0f73bbe0c (GizmoDragState.anchorBox captured
  at pointerdown; move recomputes vs fixed anchor with total delta;
  probe 19 steps green first attempt). Awaiting my diff check at next
  boundary; user is the real verifier (F1-GATE round 3 after F1.8).
- F1.8 dispatched (task-F1.8-brief.md, base 0f73bbe0c, sole gate-runner,
  wesl skill mandated): per-axis Blender RGB from handleId axis digit,
  hover brighten/active white, cone-tip line fans, screen-space quad
  expansion for constant pixel width (~3px shafts) — user asked for
  pixel-space thickness mid-turn. Pick geometry untouched.
- F1.8 landed: 8f32d4ecf (per-axis RGB, cone tips, screen-space quad
  expansion; probe 19/19 green; report carries a w-scaling architecture
  note). Batch STATIC reviewer dispatched over 8b660fef7..8f32d4ecf
  (F1.7 + drag-anchor fix + F1.8 → task-F1.7-F1.8-review.md; w-scaling
  math is the critical check). F1-GATE round 3 presented to user in
  parallel.
- Batch review (F1.7 + drag-anchor fix + F1.8): 3× spec PASS / quality
  PASS, 0 MAJOR, 1 MINOR parked (F1.7 report cites wrong no-test
  precedent — misattribution in a report file, not code). W-scaling
  deviation ruled CORRECT (voxelToNdc divides by hand, outputs w=1;
  factor matches brief's formula simplified; perpendicular shared per
  segment — no discontinuity). Drag-anchor fix independently re-traced:
  idempotent, 1:1. F1.7/fix/F1.8 COMPLETE. Pushing through 8f32d4ecf.
  HOLDING at F1-GATE round 3 for the user's verdict.
- F1-GATE round 3 user findings: (a) "show box" toggle invisible —
  diagnosed stale HMR store (checkbox verified present unconditionally
  at GridBoxPanel.tsx:116), user told to hard-refresh, unconfirmed;
  (b) galaxy defaults 0.45/1px done in-context d949bf6f9 (user
  micro-ask); (c) gizmo 4px widths done in-context f1b38deeb (shaft/
  cross 4, arrowhead base 7); (d) "cant drag the gizmo itself, just
  the + buttons" — DIAGNOSIS: pickGizmoHandle.ts:51 measures distance
  to handle.positionMpc POINT; translate tip is one point on a long
  visible shaft → shaft grabs miss; crosses coincide with their point
  so they work. Ruling: F1.9 = segment picking for translate arrows
  (clamp closestPointOnRayToLine t to [0, reach] from box center along
  axisDir), resize stays point-based. Dispatched.
- Round-3 user finding (e): "cone of the translate arrow is not
  completely filled in" — F1.8's line-fan cone reads as outline.
  Ruling: F1.10 = replace fan with ONE tapered segment (base ~12px →
  tip 0.5px) so the quad expander yields a solid screen-facing
  triangle; degenerates to a dot looking down-axis (accepted, Blender
  foreshortens too). QUEUED behind F1.9 (same file boxPreviewPass.ts +
  gate seat).
- F1.9 landed: fea2b578a (segment pick for translate, clamp t∈[0,reach];
  132 tests incl. shaft-midpoint regression + beyond-tip clamp pin;
  probe 20 steps green). Controller diff check pending at next
  boundary. F1.10 (cone fill, single tapered segment base 12px)
  dispatched.
- Round-3 user finding (f): "size of the translation arrows should not
  change with the size of the box" — Blender keeps constant SCREEN
  size. Ruling: F1.11 = gizmoHandleGeometry grows an arrowLengthMpc
  param computed from camera (fraction ~0.12 of viewport height:
  worldLen = 0.12·2·dist·tan(fovY/2)); Viewport pick AND
  boxPreviewPass draw must pass the SAME value (single source — thread
  it, don't compute twice from different inputs if avoidable);
  translate pick tolerance rebased onto arrow length (box-based
  tolerance goes greedy/impossible at extreme box sizes); crosses stay
  face-anchored box-scaled. QUEUED behind F1.10 (same files).
- F1.10 landed: 31419745a (fan → one tapered segment 12px→0.5px per
  arrow; shaft already ended at cone base; probe green on retry, known
  flake). F1.11 dispatched (task-F1.11-brief.md, base 31419745a, sole
  gate-runner): gizmoArrowLengthMpc.ts (0.12 viewport-height fraction),
  geometry third param, translate tolerance rebased to arrow scale,
  probe aim retune allowed same-commit. User told rings = F2, gated on
  their F1 pass.
- F1.11 landed: b33ccb798 (gizmoArrowLengthMpc.ts, geometry third
  param, tolerance rebase; 135 tests; probe 20 steps, aim survived
  without retune). PUSHED through b33ccb798. Batch STATIC reviewer
  dispatched over 8f32d4ecf..b33ccb798 (5 commits: defaults, widths,
  F1.9 segment pick, F1.10 cone fill, F1.11 constant size →
  task-F1.9-F1.11-review.md; critical check = pick/draw same-length
  invariant). F1-GATE round 4 presented.
- Batch review F1.9-F1.11 (+trivial pair): all PASS, 0 MAJOR, 2 MINOR
  parked on b33ccb798 (pick/draw invariant restated in 3 places incl.
  over-budget boxPreviewPass header; gizmoArrowLengthMpc 7/13 comment
  ratio). Trim inventory now: boxPreviewPass header (13→ over budget,
  twice flagged), triple invariant restatement, MIN_SIZE_MPC export,
  Handle.d.ts 3-line comment, F1.2 minors, F1.7 report misattribution.
  HOLDING at F1-GATE round 4 for the user's verdict; F2 next on pass.
- Round-4 user finding (g): gizmo must draw OVER the raymarcher, not
  additively. Confirmed: boxPreviewPass uses LAYER_BLEND one/one
  (RenderGraph.ts:41,:220) — additive washout on bright fields. Ruling:
  F1.12 = OVERLAY_BLEND premultiplied-over (one / one-minus-src-alpha)
  for this pass only, fragment alpha 1.0 both paths, layer-contract
  comment amended to name the exception; pass order unchanged (already
  last); still pre-tonemap (accepted — revisit post-blit overlay only
  if user finds tonemapped colors off). Dispatched.
- F1.12 landed: f5fca3777 (OVERLAY_BLEND premultiplied-over, fs/fsGlyph
  alpha 1.0, contract comment names the exception; probe 19 steps
  green). Widths doubled in-context d369d798e (8px/8px, head 24px/1px,
  user micro-ask). PUSHED through d369d798e. F1.12 review: fold into
  next batch boundary. Still holding at F1-GATE for user verdict.
- F1-GATE PASSED (user: "that looks great.", after rounds 1-4 fixes
  F1.7-F1.12 + widths). F1 phase CLOSED. F2 begins.
- Pipelined: F2.2 implementer (task-F2.2-brief.md, base d369d798e, sole
  gate-runner, src/utils/math quaternion primitives) ∥ F1.12+widths
  STATIC reviewer (review-b33ccb798..d369d798e.diff →
  task-F1.12-review.md; scrutiny: alpha=1.0 discarding a former
  intensity fade, blit alpha consumption). F2.1 brief next (paths
  verified on disk: src/state/exportParams.ts per pre-flight ruling 1,
  src/export/emitTraceSidecar.ts as planned); dispatches when F2.2
  frees the seat.
- COMPACT CHECKPOINT (2026-08-18 late): HEAD = d369d798e = origin (all
  pushed). IN FLIGHT: (1) F2.2 implementer — on DONE: controller
  ledgers, then dispatch F2.1 (task-F2.1-brief.md ready on disk) and
  pipeline F2.2 STATIC review; (2) F1.12+widths STATIC reviewer — on
  return: adjudicate (majors → fix round, minors → park in trim
  inventory), ledger. QUEUED SEQUENCE: F2.1 → F2.3 (R into transform
  pair + cameraBasis) → F2.4 (boxBasisVectors + 80-byte BoxUniform
  reshape, byte-layout table in plan contracts §5) → F2.5 (rings +
  setRotation + Viewport rotate branch) → F2-GATE user checklist.
  F2.1 dispatch must carry: exportParams at src/state/ (NOT
  src/export/), read post-S15/S17 file state, line numbers are anchors.
  Standing user directives this session: gizmo Blender-look (done for
  arrows; rings F2), constant screen size (done), opaque overlay
  (done), 8px widths (done), galaxy defaults 0.45/1px (done d949bf6f9).
  mcpm plan: S17 was its last open task — CLOSED; no mcpm-side work
  queued. Taskboard artifact refresh due at next boundary (F1 shipped,
  F2 underway).
- F1.12+widths review: all PASS, 0 findings. CLOSED.
- F2.2 landed: d9bd1706c (3 quat primitives + 6 tests; 343 math tests
  green). User micro-ask: box-slider spacing matched to rest of UI —
  in-context 247c3561b (six sliders share one wrapper, ParamSlider's
  own 9px margin governs; pushed).
- Pipelined: F2.1 implementer (task-F2.1-brief.md, base 247c3561b, sole
  gate-runner; brief carries the src/state/exportParams.ts path
  correction) ∥ F2.2 STATIC reviewer
  (review-d369d798e..d9bd1706c.diff → task-F2.2-review.md; scrutiny:
  multiplyQuat argument-order — same-axis tests can't catch a swap;
  MAJOR if no non-commuting composition test).
- F2.2 review: spec PASS, quality PASS-WITH-FINDINGS, 1 MAJOR (test
  rigor: multiplyQuat only composes q with itself — same-axis commutes,
  can't catch arg-order swap; Hamilton product itself hand-verified
  CORRECT). Fix round 1 QUEUED until F2.1 lands (tree mid-ripple):
  fresh cheap implementer adds one non-commuting test (90°X∘90°Y
  applied to a vector vs sequential rotateVec3ByQuat), no production
  change expected. Parked minors: comment ratio quatFromAxisAngle 5/7,
  rotateVec3ByQuat 6/11.
- F2.1 landed: f15e0ed13 (rotation field + vec4 validator, missing →
  identity, |q| tol 0.01 by VOXEL_SPREAD_LIMIT analogy — implementer
  ruling, reviewer to weigh; 138 tests). Pipelined: F2.2 fix round 1
  (non-commuting multiplyQuat test, sole gate-runner) ∥ F2.1 STATIC
  reviewer (review-247c3561b..f15e0ed13.diff → task-F2.1-review.md;
  scrutiny: missing-field path, genuine round-trip, inert-ripple scan,
  no version bump). Next after both: F2.3 (R into transform pair +
  cameraBasis).
- F2.2 fix round 1 landed: fd289da33 (non-commuting X/Y composition
  test, swapped-order divergence verified empirically by implementer;
  28-line test-file-only diff confirmed via stat). Ruling: CLOSED.
  F2.2 COMPLETE.
- F2.1 review: spec PASS, quality PASS-WITH-FINDINGS, 0 MAJOR, 1 MINOR
  parked (vec4 JSDoc forward-references rotateVec3ByQuat before any
  consumer wires it — self-resolving at F2.3). F2.1 COMPLETE. PUSHED
  through fd289da33.
- F2.3 dispatched (task-F2.3-brief.md, base fd289da33, sole gate-runner
  incl. probe): R/R⁻¹ via conjugate inline, cameraBasis conjugate on
  directions, identity byte-identical invariant. After F2.3 + review:
  F2.4 (boxBasisVectors + 80-byte BoxUniform), then F2.5 (rings).
- F2.3 landed: bf4b72db2 (R/R⁻¹ in pair + cameraBasis; 142 tests, probe
  19 checks clean first try). Taskboard artifact republished
  (f1-approved-f2-underway, 12/15).
- Pipelined: F2.4 implementer (task-F2.4-brief.md, base bf4b72db2, sole
  gate-runner; 80-byte BoxUniform table copied into brief verbatim;
  probe must exercise non-identity rotation — preset-load or direct
  store route, implementer's choice) ∥ F2.3 STATIC reviewer
  (review-fd289da33..bf4b72db2.diff → task-F2.3-review.md; scrutiny:
  R-direction swap — round-trips can't catch it, only the hand-worked
  example can; identity reference-vs-copy). After F2.4 + reviews: F2.5
  (rings) — the last implementation task.
- F2.3 review: spec FAIL / quality PASS-WITH-FINDINGS, 1 MAJOR.
  R/R⁻¹ direction hand-proven CORRECT (conjugate on world→local ✓).
  MAJOR: Viewport.tsx rayFromPointer (~:789) is a third cameraBasis
  call site the spec missed ("no third call site exists" — spec §4
  erratum #2, docs note at F2-GATE); spec §5 requires the pick ray use
  the UNROTATED basis (world-space ray vs world-space handles), but
  F2.3 made cameraBasis rotate unconditionally → picking breaks at
  non-identity rotation, reachable TODAY via preset import; no test or
  probe covers it (probe is identity-only until F2.4 lands its
  rotation step). Fix round 1 QUEUED behind F2.4 (gate seat): in
  rayFromPointer, build the basis from an identity-rotation box
  ({...box, rotation: [0,0,0,1]} or equivalent) with a comment citing
  spec §5's world-space pick contract, PLUS a regression test pinning
  pick-at-rotated-box (geometry still UNIT_AXES world-space until
  F2.5). F2.5's brief must ALSO restate the world-vs-rotated basis
  split — its ring drag math builds rays through the same helper.
- F2.4 landed: aeb2df7c4 (boxBasisVectors + 80-byte BoxUniform +
  cornerPos FMAs; 144 workbench / 7150 full tests; probe green on
  retry with NEW gizmo:rotated-box step — 90°-Y via real preset
  import).
- Pipelined: F2.3 fix round 1 implementer (unrotated pick basis in
  rayFromPointer + regression test, sole gate-runner) ∥ F2.4 STATIC
  reviewer (review-bf4b72db2..aeb2df7c4.diff → task-F2.4-review.md;
  HIGHEST-RISK check = frame mixing: voxel-space center vs world-space
  basis vectors in the corner reconstruction; also which box's
  rotation feeds the basis). After both: F2.5 (rings) — last
  implementation task, then F2-GATE.
- F2.4 review: spec PASS, quality PASS, 0 MAJOR. Frame-mixing check:
  upload construction proven algebraically exact for ANY independent
  builtBox/pendingBox rotations (hand-expanded chain), reachable state
  is its identity specialization. 1 cosmetic MINOR parked
  (boxBasisVectors 8/15 comment ratio, load-bearing content). F2.4
  COMPLETE. Awaiting F2.3 fix round; then F2.5.
- F2.3 fix round 1 landed: 99589b52d (rayFromPointer uses
  identity-rotation cameraBasis; regression test drives the real
  cameraBasis→screenToRay→pickGizmoHandle pipeline at 90°-Y — rotated
  basis misses, identity hits; 146 tests, probe 21/21 first try).
  Ruling: CLOSED. Residual gap (probe drags only at identity box)
  carried into F2.5's brief — its rotate-drag step closes it. F2.3
  COMPLETE. PUSHED through 99589b52d.
- F2.5 dispatched (task-F2.5-brief.md, base 99589b52d, sole gate-runner
  incl. probe). RULING in brief: ring radius = RING_RADIUS_FRACTION ·
  arrowLengthMpc (constant screen size — user's F1.11 directive
  supersedes spec §5's half-extent sizing; spec erratum #3 for the
  F2-GATE docs commit). Axes swap UNIT_AXES→boxBasisVectors both call
  sites rides this task. After F2.5 + review: F2-GATE user checklist
  (rings visible, drag rotates, sim/export honor rotation).
- COMPACT CHECKPOINT (2026-08-19): HEAD = 99589b52d = origin. ONE agent
  in flight: F2.5 implementer — on DONE: ledger, verify report, then
  dispatch F2.5 review (gates ALLOWED, seat free — deepest-scrutiny
  seat of the plan: dragRotate angle math, ring pick, quaternion
  fixed-anchor, axes swap, no 99589b52d regression), fix rounds as
  needed. THEN: push → taskboard refresh (F2 complete) → F2-GATE user
  checklist (rings render per-axis colored + constant screen size,
  ring drag rotates smoothly, arrows follow rotated axes, sim/raymarch/
  export honor rotation, presets round-trip it, identity behavior
  unchanged). AFTER user pass: spec-errata docs commit (#2 §4 "no
  third call site" false — rayFromPointer; #3 §5 ring sizing now
  arrowLength-based per user directive; §5 resize formula already
  fixed cb9c106f1), THEN plan's final whole-branch review + trim
  commit candidates (parked-minors inventory in this ledger), then
  /feature-done audit (user gate). PR #570 carries everything; user
  merges, never from worktree.

## F2.5 mid-task user feedback (2026-08-19, relayed to implementer via SendMessage)
- User (live HMR testing): (1) rotating the box does NOT mark the sim for a new run — translate/scale do; rotation must propagate into the pending-vs-built run path like the sibling setters, with a test. (2) Rings too close to translate arrows.
- Ruling: RING_RADIUS_FRACTION = 1.3 (rings OUTSIDE arrow tips, 1.3 × arrowLengthMpc) — supersedes the brief's 0.8. Pick-tolerance basis unchanged. — user directive for visual separation — cost if wrong: one-constant retune.
- Both items are in F2.5 scope; implementer re-runs gates after. Reviewer must check item 1's propagation fix (the dirty/run path including rotation) alongside the original scrutiny list.

## Task F2.5: complete (pending review)
- Commit 68e4601ed (BASE 99589b52d). Report: task-F2.5-report.md. All gates GREEN incl. probe first-run with new gizmo:rotate-drag self-check.
- Both mid-task user fixes folded in: (1) manualRotation added to buildKey/gridShapeKeyFor (extracted to state/buildKey.ts + state/gridShapeKeyFor.ts, unit-tested rotation-only key change); (2) RING_RADIUS_FRACTION 1.3.
- New state home: GridSlice.manualRotation mirrors manualCenterMpc/manualSizeMpc; installImportedBox syncs it (prevents rotated preset snapping to identity on first manual edit).
- Review dispatched: deepest-scrutiny seat — dragRotate angle math, ring pick, fixed-anchor quaternion, axes swap both call sites, 99589b52d non-regression, rebuild-key propagation fix.

## Task F2.5: review PASS — task complete
- Review verdicts: spec PASS, quality approve. 0 MAJOR, 3 MINOR (review file: task-F2.5-review.md). Hamilton-product order hand-verified numerically by reviewer.
- MINORS PARKED → trim inventory: (1) GizmoDragState.d.ts stale "stays INERT until F2" comment (now live); (2) comment budget marginal: dragRotate.ts 11-line header, state/buildKey.ts 10 comments/15 code lines; (3) no dedicated test for distanceToRing near-parallel fallback.
- F2 implementation COMPLETE. Next: push → taskboard refresh → F2-GATE user checklist → spec-errata docs commit (#2 §4, #3 §5 ring sizing now 1.3×arrowLength) → whole-branch final review + trim commit → /feature-done.

## HF1: path-tracer accumulation resets every couple of iterations (user report, 2026-08-19)
- Fix agent dispatched (sonnet, BASE 68e4601ed). Brief inline in dispatch; report → task-HF1-report.md. Suspects flagged: key stability in buildKey/gridShapeKeyFor consumption post-F2.5 extraction, hover/preview-timer state feeding the reset path. On DONE: verify root cause has file:line evidence, review diff myself (small fix — controller review acceptable; escalate to reviewer seat if diff is non-trivial), push at boundary.
- Meanwhile: grill-me session running on grid-divisor redesign. DECIDED so far: problem = wrong currency (only); new currency = voxelSizeMpc stored directly (presets store it; dims = ceil8(extent/voxelSize); budget refusal guards blow-up). Transcript will go to docs/grill-sessions/ at session end.

## V1 queued + production radar dispatched (2026-08-19)
- Grill session COMPLETE → docs/grill-sessions/mcpm-grid-voxel-size-currency-2026-08-19.md (uncommitted; V1 brief tells implementer to commit it). Decisions: voxelSizeMpc currency, log ParamSlider 0.25–4, default 0.75 (boot 272³ deliberate), field manualVoxelSizeMpc, formula-free preset migration via installImportedBox sync, lands NOW on PR #570.
- V1 brief WRITTEN: task-V1-brief.md. DISPATCH V1 implementer (sonnet) only AFTER HF1 lands (serial, shared index). Then V1 review seat as usual.
- Production-readiness radar: 4 read-only sonnet reviewers in flight (state+ui, sim+field, render+Viewport, main-app alignment) → scratchpad/radar-{state-ui,sim-field,render-viewport,alignment}.md. On ALL done: synthesize honest improvement list for user (deliverable = assessment in chat; no fixes without ask), cross-ref simplicity.md known entanglements, drop taste findings.
- Sequencing note: F2-GATE user checklist now combined with V1 visual check (user's packaging call Q5).

## Production radar: ALL 4 REPORTS IN (scratchpad/radar-*.md), synthesis delivered to user in chat
- Verdict tiers: (T1 trust) Phase-4 validation gap 79×–7300× + 9.28× mass ratio = the real production blocker; no durable promotion path (quick-look self-clobbers). (T2 robustness) budget refusal never hits statusMessage; no runtime device-loss handling. (T3 braids) TS↔WESL parity tests missing (selectionEncoding exemplar); density-sample logic ×3 by convention; buildKey field list (bit us in F2.5); Viewport god object (extract pointer input first); subscriber token-diff ×4; axesFor + helper-axis dup; orbit-camera ×3 cross-tool; param key lists ×2; harness self-initGpu vs spec §2 device injection; RenderGraph T18 bypass; draw order unpinned; per-frame JSON.stringify (measure first).
- Clean: presets, sim-core extractability, NaN hygiene, UI reuse, blend asymmetry essential, canvas sizing.
- Next: await user's pick of which improvements to act on (backlog files vs immediate). HF1 still in flight; V1 queued behind it.

## HF1: FIXED and pushed — 085ebfc98
- Root cause: volpathKey floored sim.stepCount/16 (from 054b0e051, NOT F2.5 — verified innocent via instrumented headless runs) → full accumulator wipe every 16 steps. Fix: stepCount term dropped; resets remain on camera/params/clear/reset/harness-rebuild. Controller reviewed diff directly (10-line change) — no reviewer seat. Trade-off in commit msg: running sim blends samples across steps indefinitely; user verifies at combined gate.
- Not unit-testable (inline render-loop key) — no fake test, per guidance. Strengthens the radar's "extract inline keys" finding.
- V1 implementer dispatched (serial slot free).

## Task V1: complete (pending review) — 446a5984a
- BASE 085ebfc98. Report: task-V1-report.md. All gates GREEN incl. rewritten grid:box-preview probe step (slider-driven, self-checked).
- Accepted deviation: slider LINEAR 0.25–4 step 0.05 (ParamSlider has no log mode — verified). Possible follow-up: log-scale ParamSlider mode (do NOT fold into this task). Memory readout = live estimate (f32 pre-build, no agent lanes) — reviewer judges if misleading.
- Review dispatched → task-V1-review.md. On PASS: push, then USER GATES: combined visual pass (F2-GATE checklist + voxel-size slider + path-tracer convergence check).
- OPEN with user: path-tracer interactivity design (2-7fps → per-tracer divisor + auto interaction boost max(d,4), settle ~200ms idle). AWAITING approval; dispatches after V1 review closes. Also open: which radar improvements to act on.

## Task V1: review verdicts — spec PASS, quality 1 MAJOR → fix round 1
- MAJOR-1: GridBoxPanel estimateGridBytes omits agent-lane bytes (7 lanes × count × 4 ≈ 267MB at 10M agents; up to ~128× under-report at coarse voxel size); implementer comment "stays tiny" factually wrong. Reviewer independently re-ran typecheck/vitest/prettier — all green.
- Fix round 1 sent to SAME implementer (resume): reuse planGridBudget arithmetic (ONE home — no formula copy), include live agentCount, fix comment, hand-computed test, new commit, no push. On DONE: controller reviews fix diff directly (scoped, small) — ruling: re-review seat not warranted for a one-function fix; cost if wrong = one more round.

## Task V2 QUEUED: allocation-aware voxel-size floor (user-approved design)
- Brief WRITTEN: task-V2-brief.md. Design: minFeasibleVoxelSizeMpc joint (ONE home with planGridBudget arithmetic), gridSlice.maxBufferBytes set once post-GPU-init (non-user setter), deriveGridBox clamps manual path (importedBox stays verbatim/unclamped — ruling: round-trip fidelity beats silent mutation), slider min = live floor.
- DISPATCH ORDER (strictly serial, shared index): V1 fix round (in flight) → V2 implementer → V2 review → push → COMBINED USER GATE (F2 checklist + voxel-size slider + path-tracer convergence + autofit-no-longer-throws).
- STILL OPEN with user: path-tracer divisor + interaction-boost design (proposed, NOT yet approved — "ok" was for V2 only); radar improvement picks.

## Task V1: CLOSED — fix round 1 approved by controller, pushed
- 132b850b0: estimateGridBudgetBytes extracted in planGridBudget.ts (planGridBudget calls it — one home), panel passes live sim.agentCount, wrong comment deleted, hand-computed tests incl. agent-dominance case. Controller-adjudicated (diff read in full); pushed 085ebfc98..132b850b0.
- V2 implementer dispatching now (task-V2-brief.md, BASE 132b850b0).

## Task V3 QUEUED: path-tracer divisor + interaction boost (user said "go")
- Brief WRITTEN: task-V3-brief.md. Design: view.pathTracer.divisor (int 1-4, default 2) → floor(size/d) accumulator via reducedTraceSize + bilinear-upsample blit; effectiveVolpathDivisor(userDivisor, msSinceCameraChange) pure policy (boost 4, settle 200ms); ControlsPanel IntSlider mirroring raymarch divisor row.
- DISPATCH ORDER: V2 implementer (in flight) → on V2 DONE: dispatch V2 review (static, pipelined) AND V3 implementer in parallel → V3 review → push → COMBINED USER GATE (F2 checklist + voxel slider + allocation floor + interactive path tracer).
- Radar picks from user: still open.

## USER DIRECTIVES (mid-V2): production review written up + tier 3 GREENLIT
- Review doc: docs/research/mcpm-workbench-production-review/README.md + 4 radar reports copied beside it (scratchpad is ephemeral — repo copies are canonical now). UNCOMMITTED — commit `docs(mcpm-workbench): production-readiness review` at next serial boundary (V2 landed), before R-series starts.
- R-SERIES QUEUE (tier 3, all approved, strictly serial after V3; briefs written JUST-IN-TIME referencing the radar reports for file:line):
  R1 one-home batch: canonical grid-shape field list (buildKey/gridShapeKeyFor) + Record<keyof McpmParams> param keys + axesFor dedup [batched: same-shape S fixes]
  R2 TS↔WESL parity tests (6 pairs; selectionEncoding.ts exemplar) [test-only]
  R3 store-subscriber token-diff dedup (4 blocks)
  R4 density-sample→mean-log-trace consolidation ×3 (M; cross WESL/TS)
  R5 harness device injection (initGpu out of createMcpmHarness)
  R6 Viewport pointer/gizmo input extraction (M/L; biggest job, cleanest boundary)
  R7 T18 preview pass back under RenderGraph ownership (after R6 — same seams)
  R8 orbit-camera consolidation ×3 tools (last; touches galaxy-renderer + flow-workbench)
- Reviews: R1-R3 small → controller-adjudicated diff reads; R4-R8 → reviewer seats.
- FULL ORDER NOW: V2 impl (in flight) → [V2 review ∥ V3 impl] → V3 review → docs commit + push → R1..R8 → COMBINED USER GATE → gizmo wrap-up (F2 spec errata, whole-branch review + trim, /feature-done).

## V2: complete (impl) — review dispatched
- V2 implementer DONE: 1e1fcd37a `feat(mcpm-workbench): voxel-size floor keeps every derivable grid allocatable`.
  Gates GREEN (typecheck both, workbench 48f/175t, full 1089f/7175t); probe flake raymarch:preview-packed
  proven pre-existing (re-run against clean 132b850b0, same flake, 0 GPU/page/console errors).
  Report: task-V2-report.md. Concerns both brief-sanctioned (planGridBudget 3 exports; pre-first-build unclamped by ruling).
- Review package: review-V2.diff (BASE 132b850b0 → HEAD 1e1fcd37a).
- DISPATCHING NOW in parallel: V2 reviewer (static, reads review-V2.diff) ∥ V3 implementer (BASE 1e1fcd37a, brief task-V3-brief.md).
- On V2 review verdict: PASS → ledger; findings → adjudicate, fix round rides after V3 impl finishes (serial index).
- On V3 impl DONE: verify report → package review-V3.diff (BASE 1e1fcd37a) → dispatch V3 review → then docs commit
  (docs/research/mcpm-workbench-production-review/ + grill transcript if missing) + push → R-series per queue.

## V2 review verdict + adjudication (V3 impl still in flight)
Review: task-V2-review.md. Spec PASS / quality PASS except:
- MAJOR (must fix): minFeasibleVoxelSizeMpc.ts:41-61 — maxBufferBytes < 512·elementBytes ⇒ growth loop
  exhausts 64 iters and returns a huge NON-fitting value, violating the "returned floor always fits"
  invariant. Ruling: FIX ROUND 1 after V3 impl frees the index — resume V2 implementer (task aa01fdacd000e17d9):
  make the no-feasible-hi case explicit (return Infinity or throw — implementer picks, must document + test
  the below-minimum case, e.g. maxBufferBytes 2047 f32). Cost if wrong: none live (real adapters ≫ 2048 B).
- minor (fold into same fix round, one prop): GridBoxPanel slider pill shows raw manualVoxelSizeMpc, dims
  readout shows clamped — display the clamped value when floor active, ONLY if a one-line prop change; else park.
- minor (PARKED → /comment-audit at wrap-up): deriveGridBox.ts + GridSlice.d.ts comment budget over, pre-existing.
- info (ledger note only): maxBufferBytes is actually re-written after EVERY rebuild (fresh device per initGpu),
  not once/session; conclusion unchanged (stable limits), report wording imprecise.
Sequence unchanged: V3 impl DONE → V2 fix round 1 (serial) → V3 review package+dispatch → V2 re-review scoped →
docs commit + push → R-series.

## V3: complete (impl) — V2 fix round + V3 review dispatched in parallel
- V3 implementer DONE: 1a9b0a9b6 `feat(mcpm-workbench): path tracer accumulates at divisor resolution with interaction boost`.
  Gates GREEN (typecheck, workbench 175t, full 7181t, probe 22/22 incl. new divisor drive, no flake).
  Report: task-V3-report.md. Judgment call accepted: slider labeled "path tracer divisor" (accessible-name
  collision with raymarch "divisor"); divisor>1 goes via private reduced texture + traceUpsample.wesl
  (necessary: blit indexes accumulator by target pixel coords); volpathKey excludes effective divisor (comment at key).
- Review package: review-V3.diff (BASE 1e1fcd37a → 1a9b0a9b6).
- DISPATCHING NOW in parallel:
  (a) V2 FIX ROUND 1 — resume V2 implementer (task aa01fdacd000e17d9), sole index holder: explicit
      no-feasible case in minFeasibleVoxelSizeMpc + below-minimum test; slider pill clamped-display if one-line.
  (b) V3 reviewer (static, reads review-V3.diff, NO git commands).
- On V2 fix DONE: package review-V2-fix.diff → scoped re-review (cheap tier). On V3 review verdict: adjudicate.
- After both clean: docs commit (production-review dir + grill transcript check) + push → R-series.

## V2 fix round 1: DONE — scoped re-review dispatched
- 73f2eeec4 `fix(mcpm-workbench): voxel-size floor refuses infeasible device limits explicitly`.
  Gates GREEN (typecheck, workbench 49f/177t, full 1091f/7183t, probe 22/22). Slider-display minor TAKEN
  (pill now shows clamped box.voxelSizeMpc).
- Package: review-V2-fix.diff (1a9b0a9b6 → 73f2eeec4). Scoped re-review dispatched (static, parallel w/ V3 review).
- Index is FREE. Next serial slot after both reviews clean: docs commit (production-review dir + grill
  transcript check) + push → R1.

## Docs commit landed early (index was free)
- 5d1f515fd `docs(mcpm-workbench): production-readiness review` (README + 4 radar reports).
- Grill transcript verified committed by V1 (446a5984a) — nothing missing.
- Push happens at the review boundary (after V3 review + V2 fix re-review verdicts, both clean or adjudicated).

## V3 review verdict: PASS/PASS — task complete, minors PARKED
Review: task-V3-review.md. No MAJORs. Two minors parked for the whole-branch trim commit (wrap-up phase):
- volpathPass.ts:520-530 — reduced texture not freed when divisor returns to 1 (bounded idle memory, not a leak).
  Ruling: park; fold into trim commit if one-line destroy-on-divisor-1, else leave (disposal covers it).
- Viewport.tsx:499,524-529 — volpathKey double-stringifies camJson (correct but obscure). Ruling: park → trim commit,
  trivial: embed raw cam object.
Notable review confirmation: private reduced texture is NECESSARY (raymarch + pathTracer can render same frame
with independent divisors; sharing RenderGraph's would thrash). V3 task COMPLETE pending nothing.
Remaining gate before push: V2 fix re-review (in flight).

## V2 fix re-review: both ADDRESSED — V2 COMPLETE. Pushing, then R1.
- Re-review verdict (appended to task-V2-review.md): MAJOR addressed (Infinity return, both call sites guard —
  deriveGridBox folds non-finite→0 pre-clamp, GridBoxPanel folds→null; 2047-byte fixture correct one-under).
  Minor addressed (no feedback loop — Slider drag never reads value prop, setter writes raw unclamped).
  No new defects. V-series (V1,V2,V3,HF1) ALL COMPLETE.
- Pushing 1e1fcd37a..5d1f515fd now, then dispatching R1 (one-home batch: canonical grid-shape field list +
  Record<keyof McpmParams> + axesFor dedup; brief task-R1-brief.md; review mode = controller-adjudicated diff read).

## Pushed + R1 dispatched
- Pushed 132b850b0..5d1f515fd (V2 + V3 + V2-fix + docs) to PR #570.
- R1 implementer IN FLIGHT (BASE 5d1f515fd, brief task-R1-brief.md): canonical grid-shape projection feeding
  buildKey/gridShapeKeyFor + Record<keyof McpmParams> single home + axesFor extract. On DONE: verify report,
  package review-R1.diff, CONTROLLER-ADJUDICATED diff read (no reviewer seat per queue ruling), then R2
  (TS↔WESL parity tests, brief just-in-time).

## R1: COMPLETE (controller-adjudicated PASS)
- fb4e1edf6 `refactor(mcpm-workbench): one home each for grid-shape keys, param key lists, axesFor`.
  Gates GREEN (typecheck, 50f/178t, full 1092f/7184t, probe 21/21 first try). Report: task-R1-report.md.
- Controller diff read verified: buildKey array reorder inert (JSON.stringify equality only);
  MCPM_PARAM_KEY_SENTINEL preserves old key order (slider order + sidecar/preset order unchanged);
  PARAM_SLIDER_SPECS Record exhaustive, id = key; gridShapeOf Pick + tripwire test correct;
  boxAxesFor accepted on probe coverage (gizmo steps green). No findings.
- DISPATCHING R2: TS↔WESL parity tests (6 pairs, selectionEncoding.ts exemplar), BASE fb4e1edf6,
  brief task-R2-brief.md, review mode = controller-adjudicated.

## R2: COMPLETE (controller-adjudicated PASS)
- 3197b02e2 `test(mcpm-workbench): TS-WESL parity tests pin the six byte-layout contracts`.
  Gates GREEN (typecheck, 56f/194t, full 1098f/7200t; probe rightly skipped — only const→export const).
  6/6 pairs, each mutation-verified then reverted (.wesl byte-identical). Report: task-R2-report.md.
- Controller diff read: production diff is 3 export-only changes; spot-checked mcpmUniforms.parity.test.ts —
  parses .wesl struct text vs exported TS constants + hand-listed field order, genuine tripwire. PASS.
- PARKED follow-up: GizmoUniform (7th hand-mirrored struct in boxLines.wesl/boxPreviewPass.ts) uncovered —
  one-test addition following the established pattern; fold into wrap-up trim commit alongside V3 minors.
- DISPATCHING R3: subscriber token-diff dedup (4 copy-pasted blocks in Viewport's store subscriber),
  BASE 3197b02e2, brief task-R3-brief.md, review mode = controller-adjudicated.

## R3: COMPLETE (controller-adjudicated PASS)
- 4bbb66179 `refactor(mcpm-workbench): one token-diff idiom for the store subscriber's four watchers`.
  Gates GREEN (typecheck, 57f/200t, full 1099f/7206t, probe pass on retry — documented flake). Report: task-R3-report.md.
- Controller diff read: createTokenWatcher (state/tokenWatcher.ts) changed()/sync() minimal; four call sites
  keep comments + order; init-from-snapshot preserves no-first-fire; unconditional remember is observably
  identical to old conditional assignment; boolean-edge (sampleRandomly/previewPacked) + frame-loop (volpathKey)
  watchers rightly untouched. No findings.
- DISPATCHING R4: density-sample consolidation ×3 (histogram.wesl / dataPointHistogram.ts / histogramSlice.ts),
  BASE 4bbb66179, brief task-R4-brief.md. REVIEWER SEAT (R4–R8 per queue ruling).

## R4: impl DONE — reviewer seat + R5 impl dispatched in parallel
- e90960cd2 `refactor(mcpm-workbench): one home for the density-sample statistic, WGSL copy pinned`.
  Gates GREEN (typecheck, 59f/207t, full 1101f/7213t, probe first-pass). THREE COPIES AGREED — no divergence.
  Brief path erratum: CLI site is validate/dataPointHistogram.ts (radar was right, brief wrong; implementer
  followed radar). Report: task-R4-report.md. Package: review-R4.diff (4bbb66179 → e90960cd2).
- DISPATCHING in parallel: R4 reviewer (static seat, NO git) ∥ R5 implementer (BASE e90960cd2,
  brief task-R5-brief.md: inject GPU device into createMcpmHarness; callers own initGpu; Viewport's
  setMaxBufferBytes wiring moves with it; probe/tests own their device the same way).
- On R4 verdict: adjudicate (fix round rides after R5 impl if MAJOR). On R5 DONE: package review-R5.diff →
  R5 reviewer seat ∥ R6 impl.

## R4: COMPLETE (review PASS/PASS, one minor PARKED)
- Review task-R4-review.md: spec PASS (WGSL math independently re-traced — floor-before-cast, -1.0 sentinel,
  post-check counter all confirmed; TS extraction bit-identical incl. density<=0 identity; parity test no
  overlap w/ histogramFlags). Quality PASS.
- minor PARKED → wrap-up /comment-audit sweep: meanLogTraceAtPoints.ts header 13 lines (>10), comments > half code.
- R5 implementer still in flight. On DONE: package review-R5.diff → R5 reviewer seat ∥ R6 impl (Viewport
  pointer/gizmo input extraction — biggest R task; brief must fence off R3's tokenWatcher ground + volpathKey).

## R5: impl DONE — reviewer seat + R6 impl dispatched in parallel
- 61d33be08 `refactor(mcpm-workbench): harness takes an injected GPU device, callers own acquisition`.
  Gates GREEN (207t workbench, 7213t full, probe 22/22 no retry). Concern noted (inert): initGpu now runs
  before harness's internal validity checks — always satisfied by current caller. Report: task-R5-report.md.
  Package: review-R5.diff (e90960cd2 → 61d33be08).
- DISPATCHING in parallel: R5 reviewer (static seat, NO git) ∥ R6 implementer (BASE 61d33be08, brief
  task-R6-brief.md — pointer/gizmo extraction; landmines fenced: rayFromPointer identity basis 99589b52d,
  dragRotate fixed-anchor quat, V3 setter/importedBox semantics; do-not-touch: tokenWatcher, volpathKey,
  T18 (R7 ground), harness lifecycle).
- On R5 verdict: adjudicate. On R6 DONE: package review-R6.diff → R6 reviewer seat ∥ R7 impl.

## R5: COMPLETE (review PASS/PASS)
- Review task-R5-review.md: spec PASS (no other real call sites — grep-verified; setMaxBufferBytes/refusal path
  unchanged; no device.lost handling existed to preserve). Quality PASS. One minor: initGpu-before-guards
  ordering, verified doubly inert, no cheap better shape — RULING: accepted as-is, no action (already documented
  in impl report + review; not a trim-commit item).
- R6 implementer still in flight (pointer/gizmo extraction). On DONE: package review-R6.diff → R6 reviewer
  seat ∥ R7 impl (T18 preview pass under RenderGraph ownership).

## R6: impl DONE — reviewer seat + R7 impl dispatched in parallel
- 958eab077 `refactor(mcpm-workbench): pointer/gizmo input extracted from Viewport`. Gates GREEN
  (60f/208t, full 1102f/7214t, probe on retry — documented flake, gizmo steps green both runs).
  Landmines verified + unit-pinned per report. Report: task-R6-report.md. Package: review-R6.diff (1019 lines).
- DISPATCHING in parallel: R6 reviewer (static seat — extraction diffs need line-by-line moved-verbatim
  verification) ∥ R7 implementer (BASE 958eab077, brief task-R7-brief.md — T18 preview pass under RenderGraph;
  flake-vs-real discipline spelled out since raymarch:preview-packed IS the covering step).
- On R6 verdict: adjudicate. On R7 DONE: package review-R7.diff → R7 reviewer seat ∥ R8 impl (orbit-camera
  consolidation ×3 tools — LAST R task).

## R6: COMPLETE (review PASS/PASS, zero findings)
- Review task-R6-review.md: all three landmines verbatim (identity-basis ray + relocated regression test;
  fixed-anchor quat in createViewportInput.ts:337-349; V3 setter routing, importedBox-clear unit-pinned).
  Line-by-line moved-verbatim audit clean; boxWireframeVisible split = documented mechanical consequence.
  New input test independently re-derives NDC↔world math (not a mirror). NO findings.
- R7 implementer still in flight (T18 → RenderGraph; live Viewport.tsx diagnostics are its mid-edit state).
  On DONE: package review-R7.diff → R7 reviewer seat ∥ R8 impl (orbit-camera ×3 — final R task).

## R7: impl DONE — reviewer seat + R8 impl (FINAL R task) dispatched in parallel
- 4928074a8 `refactor(mcpm-workbench): T18 preview pass owned by RenderGraph`. attachPreviewTrace/
  drawPreviewTrace/hasPreviewTrace/disposePreviewTrace symmetric with attachTrace family; Viewport no longer
  imports createTracePass/LAYER_BLEND. Gates GREEN (208t, 7214t, probe retry-clean 0 errors both).
  Report: task-R7-report.md. Package: review-R7.diff (958eab077 → 4928074a8).
- DISPATCHING in parallel: R7 reviewer (static seat) ∥ R8 implementer (BASE 4928074a8, brief task-R8-brief.md —
  orbit-camera core shared ×3 tools; per-tool constants NOT silently unified; galaxy-renderer own-build
  coverage check required (memory: npm misses it)).
- On both DONE + clean: push R-series batch → COMBINED USER GATE message (F2 rotation checklist + voxel slider +
  allocation floor + interactive tracer + convergence) → gizmo wrap-up (spec errata, whole-branch review+trim
  incl. parked minors [GizmoUniform parity test, V3 reduced-tex free + double-stringify, comment-budget items],
  /feature-done).

## R7: COMPLETE (review PASS/PASS, zero findings)
- Review task-R7-review.md: attachPreviewTrace family mirrors attachTrace idiom exactly; all 4 dispose paths
  preserved; TracePass.dispose never frees source.traceBuffer so Viewport buffer ownership correct, no leak;
  explicit-dispose deviation from radar sketch adjudicated justified (preview needs early free; radar wasn't
  specific). No findings.
- R8 implementer (FINAL R task) still in flight. On DONE + clean: push R-series batch → COMBINED USER GATE →
  wrap-up (spec errata, whole-branch review+trim, /feature-done).

## R8: impl DONE — final reviewer seat dispatched
- ced975b31 `refactor(tools): one orbit-camera drag core shared by the three dev tools`. Gates GREEN incl.
  galaxy-renderer:build (own-build landmine handled) + probe first-try clean. Shared: orbitDragDelta +
  exponentialZoomDistance (tools/utils/camera/). Drift kept per-tool + documented: yaw sign, drag speed
  0.006 vs 0.005, flow's linear zoom "(spike)", clamp policies; pan un-shared (azimuth-convention reconcile
  out of scope). Report: task-R8-report.md. Package: review-R8.diff (4928074a8 → ced975b31).
- R8 reviewer dispatched (static seat). On PASS: push batch (61d33be08? no — last push was 5d1f515fd; push
  5d1f515fd..ced975b31: R1-R8) → COMBINED USER GATE message → wrap-up.

## R8: COMPLETE (review PASS/PASS) — R-SERIES DONE (R1..R8 all complete)
- Review task-R8-review.md: arithmetic hand-traced per tool, constants/signs/clamps exact, pan absent,
  R6 tests unmodified. 3 minors PARKED → wrap-up trim/comment-audit:
  (1) orbitDragDelta.ts header ratio ~0.73; (2) exponentialZoomDistance.ts ratio ~1.29;
  (3) drift docs (0.006 vs 0.005; flow's deliberate non-adoption of exponential zoom) report-only —
  trim commit adds one-clause in-source notes at orbitDragDelta header + flow Viewport onWheel.
- PUSHING 5d1f515fd..ced975b31 (R1..R8). Then COMBINED USER GATE (turn ends awaiting user):
  F2 rotation checklist · voxel-size slider · allocation floor · interactive path tracer · convergence.
- After gate: wrap-up = spec errata commit (#2 §4 rayFromPointer, #3 §5 ring 1.3×) → whole-branch final
  review (most capable model) + trim commit (parked minors inventory: GizmoUniform parity test; V3 reduced-tex
  free on divisor-1 + volpathKey double-stringify; comment-budget items deriveGridBox/GridSlice.d.ts/
  meanLogTraceAtPoints/orbitDragDelta/exponentialZoomDistance; R8 drift notes; F2.5 parked minors
  [GizmoDragState stale comment, distanceToRing fallback test]) → /feature-done audit.

## COMBINED USER GATE: PASSED (2026-08-19, user: "the visual gate has passed, all work")
- All six items green: F2 rotation checklist, voxel-size slider, allocation floor,
  interactive path tracer, convergence, regression sweep. No fix round needed.
- WRAP-UP STARTED. Ruling: trim commit lands BEFORE the whole-branch final review
  (reviewer sees final state; parked minors don't get re-flagged) — review findings
  then get one fix dispatch + scoped re-review if needed. Cost if wrong: none
  (ordering only).
- W1 dispatch (single implementer, three commits in order): (1) spec errata docs
  commit (#2 §4 rayFromPointer third call site; #3 §5 ring sizing 1.3×arrowLength);
  (2) backlog capture: frame-loop economy (render-on-demand idle skip + interaction-
  priority quality window — from this session's design discussion); (3) ONE trim
  commit = full parked-minors inventory (GizmoUniform parity test; V3 reduced-tex
  free on divisor→1 + volpathKey double-stringify; comment-budget: deriveGridBox/
  GridSlice.d.ts/meanLogTraceAtPoints/orbitDragDelta/exponentialZoomDistance;
  R8 drift notes at orbitDragDelta header + flow onWheel; F2.5 minors: GizmoDragState
  stale comment, distanceToRing near-parallel fallback test).
- BASE recorded: ced975b31. After W1 + gates: whole-branch review 6c9ef3d8d..HEAD
  (most capable non-Fable model) → adjudicate → push → /comment-audit → /feature-done.
- W1 DISPATCHED (sonnet, background, brief task-W1-brief.md, BASE ced975b31).
  On DONE: verify report + spot-check diff, then package 6c9ef3d8d..HEAD via
  review-package and dispatch the whole-branch final reviewer (opus). Findings →
  one fix dispatch + scoped re-review → push → /comment-audit → /feature-done.
- USER DIRECTIVE (2026-08-19): production tiers 1+2 proceed NOW, all on this
  branch — wrap-up continues as planned but PR #570 does NOT merge after
  /feature-done; Phase 4 (T24/T25, mcpm-workbench ledger) + promotion path +
  tier 2 ride first. Gizmo whole-branch review span must be packaged at W1's
  HEAD BEFORE T24 commits land (pins a clean span).
## W1: COMPLETE — wrap-up commits landed
- 629b1bb50 spec errata · 4411a15d4 backlog frame-loop economy · e06667020 trim.
  Gates GREEN (61f/211t workbench, full 1105f/7222t, probe first-pass 0 errors).
  Report task-W1-report.md. Concern rulings: (1) GridSlice.d.ts header 21 lines
  ACCEPTED (six load-bearing field contracts; cut from 47; further compression
  drops landmines); (2) drift note's corrected grouping ACCEPTED (implementer
  verified 0.006 galaxy / 0.005 flow / 0.005 mcpm against call sites + R8 review —
  brief's grouping was wrong).
- NOW: package whole-branch span 6c9ef3d8d..e06667020 (pre-merge pin) → dispatch
  final reviewer (opus, static) ∥ merge origin/main (user directive; brings new
  volume source) → gates → push → T24 dispatch (mcpm ledger).

## 2026-08-19 — whole-branch final review returned + adjudicated

- Verdict: SPEC FAIL / QUALITY FINDINGS — 2 MAJOR + 13 minor (`review-final.md`).
  All shipped math independently re-derived and CLEAN (see report's "Verified clean");
  both MAJORs are missing deliverables.
- Ruling: MAJOR-1 (README gizmo section never landed) ACCEPT. MAJOR-2 (exportScfd
  writes identity rotation) ACCEPT — fix = write box.rotation after verifying the
  scalarFieldFormat consumer single-applies; fall back to refuse/warn if it would
  compound. Minors 1-8, 10-13 ACCEPT. Minor 9 (center-click translate-over-orbit
  tie) PARKED — tests document it as an accepted trade-off; revisit only on user
  complaint.
- Fix round: ONE dispatch, brief at `task-FR-brief.md` (4 commits), then ONE scoped
  re-review, then /comment-audit → /feature-done. QUEUED behind the running T24
  implementer (implementers serial, shared index). FR must not touch T24's files
  (constants.wesl, README Validation section — FR adds a NEW README section only).

## 2026-08-20 — FR complete (f656effb0..12a18b979, pushed)

- All 4 fix commits landed; gates green incl. probe first-pass. MAJOR-2:
  single-apply CONFIRMED (buildCubeModelMatrix composes FRAME_TO_WORLD and
  box.rotation independently; exportScfd uses equatorial-cartesian = identity
  frame) — box.rotation now written, round-trip test pins it.
- Scoped re-review (sonnet) IN FLIGHT on review-8df07470e..12a18b979.diff.
- On ALL ADDRESSED: /comment-audit sweep → /feature-done audit (gizmo plan) —
  then this ledger closes. T24-fix1 implementer running in parallel (mcpm
  ledger owns it).

## 2026-08-20 — FR re-review: ALL ADDRESSED (task-FR-review.md)

- Re-reviewer independently re-derived MAJOR-2 single-apply, the √13
  near-parallel test, the 180°-about-Y case, and the gridShapeOf reader grep.
  No problems. Fix loop CLOSED.
- Close-out (/comment-audit → /feature-done) WAITS for the in-flight T24-fix1
  implementer (it edits comments/README — comment-audit would race it). Next
  serial slot after T24-fix1: close-out, then T25.

## 2026-08-20 — /comment-audit dispatched

- Scope: 129 files (first-parent-only — the naive 6c9ef3d8d..HEAD list was
  356 incl. main's merge side; scope file comment-audit-scope.txt).
- Constants.wesl registry exemption + already-trimmed files flagged in the
  dispatch. On its commit: push → /feature-done audit (gizmo plan) → T25.
