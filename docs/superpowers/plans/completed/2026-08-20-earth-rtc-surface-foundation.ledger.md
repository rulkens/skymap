# SDD ledger — plan: docs/superpowers/plans/2026-08-20-earth-rtc-surface-foundation.md

Worktree: /Users/rulkens/Development/js/skymap/.claude/worktrees/earth-rtc-foundation
Branch: earth-rtc-foundation (off origin/main @ 4f7a41fd7 — all five #608-split PRs merged, prerequisite satisfied)
Spec: docs/superpowers/specs/2026-08-20-earth-rtc-surface-camera-design.md (present in worktree)
Execution addendum: docs/superpowers/conventions/sdd-execution.md (pipelined reviews, ledger archived before workspace deletion)
Task board artifact: https://claude.ai/code/artifact/b5894b4b-37b0-43bb-8c52-b3af1b0c52cd (source: scratchpad/rtc-board.html — republish same path to update)

## Pre-flight conflict scan (2026-08-20)

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 × T5 (earthLayer.ts, runFrame.ts shared) | T1 produces prepareEarthFrame; T5 consumes it at the cutSurfaceTiles call site and rewrites draw again | Consistent — sequential edits of the same files, interfaces agree |
| T2 × T5 (EarthTilePlan.d.ts reshape vs surviving readers) | T2 says "EarthTilePlan RESHAPED (this task)" dropping winX0/winY0; but planEarthTiles.ts (producer, unmodified until T5) and earthTileSubsystem.update()'s windowMoved comparison (reader, until T5) still reference those fields; Global Constraint requires typecheck clean after every task | **CONFLICT** — Ruling below |
| T2 × T3 (tile-origin convention) | T3's bake origin "must match whatever cutSurfaceTiles's originLocal uses"; both tasks label it implementer's-call, but two different implementers each see only their own task | **CROSS-TASK CONTRACT UNPINNED** — Ruling below |
| T3 × T4 (mesh resolution constant) | T4's VERTS_PER_TILE = (resolution+1)² must equal T3's bake resolution; neither task names where the single constant lives | Note — T4 dispatch instructs: take resolution/VERTS_PER_TILE as a construction argument, never an independently hardcoded constant; T5 wires one shared constant |
| T4 × T5 (atlas binding) | T5 expects the new renderer to bind the subsystem's existing atlas texture view; T4's draw-args sketch omits the atlas view/sampler | Note — T4 dispatch instructs: accept the atlas view+sampler from outside (construction or draw args), never allocate its own atlas |
| T1 self | Interfaces vs steps vs test-fixture fix | Consistent (NEAR_CTX fixture split specified concretely) |
| T2 self | Tests vs interface | Consistent modulo the reshape ruling |
| T3 self | Tests vs interface | Consistent |
| T4 self | Layout writers vs parity test | Consistent |
| T5 self | Deletion list vs verify-before-delete steps | Consistent |
| T6 self | Perf gate ordering | Note — T1–T4 land no production-path GPU change (T2/T3/T4 are callerless additions), so the perf BEFORE run may be captured any time before T5 lands; schedule it during T4's review window |
| Plan-mandated vs review rubric | — | Nothing the plan mandates matches a rubric defect pattern |

Ruling: EarthTilePlan.d.ts reshape MOVES from Task 2 to Task 5 — in Task 2, cutSurfaceTiles types its requests product as `Omit<EarthTilePlan, 'winX0' | 'winY0'>` (temporary annotation; Task 5 reshapes the type and simplifies the annotation to bare EarthTilePlan when the last winX0/winY0 producer+reader die in the same commit). Why: the plan's own Global Constraint (typecheck clean after every task) is unsatisfiable with the reshape in T2 while planEarthTiles.ts and earthTileSubsystem.ts survive to T5; the spec (§3.1) defines final shapes, not migration order. Cost if wrong: a few lines of annotation churn in T5.

Ruling: tile origin convention = the direction of the tile's uv-origin corner, originDir = equirectUvToDirection([u0, v0]) — binding for BOTH cutSurfaceTiles.originLocal (T2) and bakeSurfaceTileMesh (T3); carried in both dispatches. Why: someone must pin the cross-task contract before two blind implementers choose differently; corner beats centre on simplicity (origin vertex exactly [0,0,0], no half-texel maths) and both satisfy the f32-precision requirement. Cost if wrong: max vertex offset is 2× the centre convention's — still orders of magnitude inside f32 resolution at every z.

Ruling: model plan — implementers + task reviewers on sonnet (house rule: never Fable for subagents; all edits delegated); final whole-branch review on opus. Cost if wrong: an extra fix round.

Note: cited line numbers in the plan (runFrame.ts:578–626, earthTileSubsystem.ts:224ff etc.) predate the #613/#614/#616 merges — dispatches say "anchor, may have drifted; locate by symbol".
Note: draft PR opens after Task 1's commit lands (house rule: branch+PR always, draft at start).
Note: this worktree's public/data must exist before Task 6's perf/dev-server runs (symlink to main checkout's public/data if absent) — check before Task 5's manual smoke step.

## Progress

BASE(Task 1) = 4f7a41fd7
Task 1: implementer DONE — commit 63f76c2da, full suite 1064 files/7186 tests green, typecheck clean. Report: task-1-report.md.
Draft PR #617 opened (base main). Branch pushed.
Task 1: reviewer dispatched (sonnet) on review-4f7a41fd7..63f76c2da.diff.
Task 2: implementer dispatched (sonnet) in parallel (files disjoint from Task 1). BASE(Task 2) = 63f76c2da. Dispatch carries rulings: EarthTilePlan reshape deferred (Omit annotation), corner origin convention.
Task 1: minor (deferred): earthLayer.ts comment-to-code ratio over budget (pre-existing, not worsened proportionally).
Task 1: minor (deferred): prepareEarthFrame doc comment has borderline history framing (earthLayer.ts:52–61).
Task 1: minor (deferred): tests written test-after (brief's own checkbox ordering); pre-existing pinning tests covered the drift risk.
Task 1: complete (commits 4f7a41fd7..63f76c2da, review clean)
Task 2: implementer DONE — commit 250626e36, 16 new tests + planEarthTiles.test.ts unmodified green, full suite 1065/7205 green, typecheck clean. Report: task-2-report.md. Forward notes: window-clip smoke → Task 6; residentSlot call count per leaf → watch at Task 5.
Task 2: reviewer dispatched (sonnet) on review-63f76c2da..250626e36.diff (pre-authorized named risk: moved-not-rewritten comparison vs planEarthTiles.ts).
Task 3: implementer dispatched (sonnet) in parallel (files disjoint from open reviews). BASE(Task 3) = 250626e36. Dispatch carries corner-origin ruling + resolution-as-parameter note.
Task 2: minor (deferred): cutSurfaceTiles.test.ts module header 2 lines over budget by the delimiter-counting yardstick (boundary call).
Task 2: minor (deferred): resolveCutResidency is O(z−baseLevel) residentSlot calls per leaf — watch when Task 5 wires the real lookup.
Task 2: complete (commits 63f76c2da..250626e36, review clean)
Perf-baseline scheduling refinement: dev-server HMR tracks the WORKING TREE, so the baseline run needs a quiet tree — run it after Task 4 reports DONE and BEFORE dispatching Task 5's implementer (Task 4's reviewer is read-only and may run concurrently).
Task 3: implementer DONE_WITH_CONCERNS — commit fe8e019fa, focused 2 files/6 tests + full suite 1067/7214 green, typecheck clean. Report: task-3-report.md.
Task 3: Ruling: baker's EARTH_TILE_PX hardcode (brief's (id, resolution) signature has no tilePx slot) is ACCEPTED — earthTileSubsystem.ts:147-148 asserts manifest tilePx === EARTH_TILE_PX and refuses to engage otherwise, so a divergent tile edge cannot reach this path; verified before ruling. Cost if wrong: a future non-512 manifest needs a signature change here (it would also need the subsystem gate lifted, so the two move together).
Task 3: reviewer dispatched (sonnet) on review-250626e36..fe8e019fa.diff (pre-authorized risks: origin-convention match vs cutSurfaceTiles, LRU shape vs textureAtlas).
Task 4: implementer dispatched (sonnet) in parallel (new files only, disjoint from open reviews). BASE(Task 4) = fe8e019fa. Dispatch carries rulings: resolution-as-construction-parameter, atlas-view-from-outside; wesl-shaders skill mandated first.
Task 3: minor (deferred): tangent field has no dedicated unit test (formula verified identical to cubeSphereMesh.ts:170 by reviewer; a sign flip would surface only via Task 4's lighting).
Task 3: minor (deferred): createSurfaceTileMeshCache(0, …) caches one entry despite zero capacity (degenerate config, unexercised).
Task 3: complete (commits 250626e36..fe8e019fa, review clean)
Task 4: implementer DONE — commit d216eb4aa (7 new files, +1000), parity test 4/4, WESL compile via npm run build clean, full suite 1068/7218 green. Report: task-4-report.md. Self-flagged: no pixel verification pre-wiring; CPU mesh-expansion cost unmeasured; altitude-precision assumption (reviewer assessing).
Task 4: reviewer dispatched (sonnet) on review-fe8e019fa..d216eb4aa.diff (pre-authorized risks: WGSL-vs-TS byte layout, f64-narrow discipline, pbr/binding parity).
Perf BEFORE captured at d216eb4aa (quiet tree): earth-surface TOTAL merged 23.2 ms, solar-system 23.4 ms — full record + exact re-run flags in perf-baseline.md. Dev server port 5177 (shell bhtnyz9yn) left running.
Task 4: review NEEDS FIXES — Important #1 rotateByMat3 duplicates rotateVec3ByTightMat3 (call the util); Important #2 SurfaceTileUniforms (176B, 15 fields) has no WGSL/TS parity test; Important #3 (plan-mandated) f32 normal-reconstruction assumes camera-near-Earth invariant, unguarded.
Task 4: Ruling: sampler-ownership question — locally-created samplers are COMPLIANT with ruling 2's intent (the ruling targets atlas allocation/lifecycle; samplers are weightless and earthRenderer's precedent creates its own). No code change. Cost if wrong: none observable.
Task 4: Ruling: finding #3 — do NOT add a defensive assert or reshape NodeParams; the invariant is structurally guaranteed (tiles exist only while the subsystem is engaged, and engagement is altitude-gated). Fix = document the caller contract at the renderer/vertex shader header; Task 6's smoke pass watches for the flat-shading tell. Cost if wrong: a glaring uniform-flat-shading artifact, immediately visible.
Task 4: minors (deferred): dirToEquirectUv duplicated from earth/fragment.wesl (follow-up lib extraction); rotate helpers untested standalone; per-frame mesh-expansion CPU cost unmeasured until Task 5 wires real counts (covered by perf AFTER run).
Task 4: fix round 1 QUEUED behind in-flight Task 5 implementer (fixes edit the tree; implementers strictly serial). On Task 5 DONE: dispatch T5 review-package + reviewer AND resume Task 4 implementer with findings #1/#2/#3-as-ruled.
Task 5: implementer dispatched (sonnet). BASE(Task 5) = d216eb4aa. Files disjoint from Task 4's open review (T5 edits existing files only). Dispatch carries: EarthTilePlan reshape lands here + Omit-annotation simplification; incumbent subsystem state consolidation folded in (user directive, two commits preferred); shared resolution constant + cache capacity choice; manual smoke step deferred to controller/Task 6.
Task 5: implementer DONE_WITH_CONCERNS — single commit 517017e34 (consolidation + swap too entangled to split; rationale in report). typecheck clean (controller re-verified independently — editor phantom diagnostics again), full suite 1065/7198 green ×2, npm run build clean. Report: task-5-report.md.
Task 5: implementer-flagged behaviour changes: (a) earth-lod-overlay debug toggle DELETED (data source = page-table cell, gone); (b) per-tile 400ms load crossfade GONE — tiles pop in (Task 4 renderer has no weight input).
Task 5: Ruling: (a) accepted — honest deletion beats an inert knob (code-is-liability); surfaced to user at Task 6. Cost if wrong: re-add a cut-based overlay later as a designed feature.
Task 5: Ruling: (b) PARKED for the USER's visual ruling at the Task 6 gate — restoring fade needs a NodeParams reshape + subsystem fade plumbing (a designed change, not a fix-round patch); pop-in may or may not matter at real tile cadence. Cost if wrong: one more design-and-implement round on the renderer's byte contract. FLAG PROMINENTLY at Task 6 hand-off.
Task 5: reviewer dispatched (sonnet) on review-d216eb4aa..517017e34.diff (212 KB; pre-authorized risks: deleted-symbol rg sweep, consolidation no-behaviour-change, draw-call wiring vs Task 4 API).
Task 4: fix round 1 dispatched — original implementer resumed with findings #1/#2/#3-as-ruled; FIX_BASE = 517017e34.
Task 5: minor (deferred): earthLayer.ts module header grew ~21→~28 content lines (added content load-bearing but header long over budget).
Task 5: minor (deferred): earthTileConstants.parity.test.ts fully DELETED where brief said Modify — justified (all mirrored constants gone from fragment.wesl, rg-verified) and disclosed; scope note.
Task 5: minor (deferred): earthTileSubsystem.ts header ~12 content lines (pre-existing debt, left flat).
Task 5: complete (commits d216eb4aa..517017e34, review clean)
Task 4: fix round 1/5 — implementer DONE, commit ebee2dd69 (rotate helper deduped → rotateVec3ByTightMat3; 3 new SurfaceTileUniforms parity tests RED-verified, layout suite 7/7; invariant documented per ruling; caught+fixed own backtick regression pre-commit). Full suite 1065/7201 green. Scoped re-review dispatched (sonnet) on review-517017e34..ebee2dd69.diff.
Task 4: fix round 1/5 verdict — ALL 3 ADDRESSED, no new Critical/Important breakage. New minor (deferred): io.wesl:100-103 stale pointer — writeSurfaceTileUniforms moved to earthSurfaceTileLayout.ts but io.wesl still names earthSurfaceTileRenderer.ts.
Task 4: complete (commits fe8e019fa..d216eb4aa + fix ebee2dd69, review clean after 1 fix round)
Branch pushed through ebee2dd69; PR #617 body updated (tasks 1–5 ticked, behaviour changes disclosed).
Final whole-branch review dispatched (OPUS) on review-4f7a41fd7..ebee2dd69.diff (6 commits, ~300 KB), with the 12 deferred minors listed for triage and the fade-parking flagged for consequence check.
FINAL REVIEW (opus): NOT READY. Critical C1 ancestor crop computed but never applied (kaleidoscope on every levelDelta>0 tile); C2 intra-tile v south-up vs atlas north-down → tiles mirrored; C3 half-texel in-slot clamp dropped → neighbour bleed. Important I4 ocean-glint f32 cancellation copied verbatim into new shader (headline goal unmet — fix = camera-relative varying, drop camPosLocal uniform); I5 cut unbounded (instrument cut.length); I6 dead nowMs param + stale bitmapReadyTime docs; I7 setLastCut not unconditional though comments claim it; I8 BACKLOG.md:93 references deleted buildEarthPageTable. M10 quadrantOffset south-edge wrap (fold into C1 via north-anchor). Deferred-minor triage: #12 io.wesl stale pointer MUST FIX; all others OK TO DEFER. M12–M16 ledgered (header trims; resolution passed twice; redundant round-trip test — fixer applies M14 while reshaping uniforms; 4.7× expansion lever; module-global frame counter).
Ruling: ONE fix wave (sonnet) covering C1+C2+C3+I4 (one addressing-seam commit + the levelDelta=2 sub-rect seam test) and I5/I6/I7/I8/M9/M11/M14 (loose-ends commit). SurfaceCutTile drops levelDelta/quadrantOffset (no readers post-flatten). Perf AFTER at ebee2dd69 is INVALIDATED by the fragment-shader fixes — re-run both scenarios after the fix wave lands. FIX_BASE(final wave) = ebee2dd69.
Task 6: perf AFTER captured at ebee2dd69 (superseded — environmentally contaminated, discarded)
Fix wave DONE: e62951c33 (seam: C1+C2+C3+I4+M10+M14) + 574620a0a (loose ends: I5+I6-first-half+I7+I8+M9+M11). Full suite 1065/7201 green, typecheck + build clean. I6's bitmapReadyTime half rested on a WRONG PREMISE (lives in texturedDiskSubsystem.ts with a real reader + correct docs) — no change, documented. Report: final-fix-wave-report.md. Scoped re-review dispatched (OPUS) on review-ebee2dd69..574620a0a.diff with hand-derivation instructions for the uv math.
Fix-wave re-review (opus): ALL findings ADDRESSED, uv math hand-derived + verified (incl. discrimination checks). Residuals: Minor sub-texel clamp degeneracy (levelDelta≥~7 → min>max, indeterminate clamp); Minor prettier drift on 3 touched files; out-of-scope: RENDERER.md page-table prose stale; 2 page-table-era backlog detail files deserve re-read.
Ruling: clamp degeneracy is load-bearing for the imminent visual pass (deep descents are exactly what the user will fly) → one mechanical polish dispatch (clamp guard via min(halfTexel, scale/2) + prettier the 3 files + RENDERER.md paragraph); controller reads that diff directly instead of a fourth review seat — proportionate to a 3-file mechanical change. Cost if wrong: a mechanical diff lands under-reviewed.
Ruling: the 2 page-table-era backlog detail files (2026-07-30-earth-tile-kind-singularity, 2026-07-30-earth-tile-uv-conversion-dead-home) are parked for the /feature-done backlog sweep, which audits backlog against git log anyway.
Task 6: perf AFTER (definitive, at 574620a0a): earth-surface 23.1 vs baseline 23.2 = NEUTRAL; control 18.7 (session variance dominates — control read 23.4/14.8/18.7 across sessions). GATE: neutral → HALTS per perf-halt rule; land/park is the USER's ruling at handoff. Full record in perf-baseline.md.
Fix-wave re-review VERDICT: all findings ADDRESSED, no new Critical/Important. Polish commit 2eab864c4 (clamp guard min(halfTexel, scale/2), prettier ×3, RENDERER.md rewrite) — controller read the diff directly, correct. Controller follow-ups: 74ce581c9 (three residual RENDERER.md pointer stragglers), 6437874c0 (backlog line: dirToEquirectUv WESL duplication, per triage).
Branch pushed through 6437874c0. PR #617 still draft.
VISUAL PASS (in progress, user at dev server 5177): BUG found+fixed — black blob at <~3.3 km altitude = viewDirLocal varying's raw Mpc magnitudes squaring into f32 denormal range → flush-to-zero → normalize NaN. Probe-confirmed (magenta under dot==0 probe at 3.8 km Copenhagen; arithmetic matched: all component squares < 1.18e-38). Fix 106a2643f: scale varying by 1/radiusMpc at the vertex (probe fully reverted before commit; build+typecheck clean; user CONFIRMED blob gone). Pushed.
VISUAL PASS findings adjudicated: far-zoom coverage "holes" visible ONLY under the probe — production shading falls back seamlessly (designed); dropped/cutCount instrumentation stays for grazing poses. EOX-adjacent blur report: consistent with band-boundary sharpness step (coveredMaxLevel drops outside deep bands) — user to re-judge in daylight sim time during the rest of the pass.
NEW LANDMINE (record in memory): varyings/uniforms carrying Mpc-scale magnitudes must be rescaled (body radii) before any GPU squaring op — f32 denormal flush; tell = camera-anchored black disc growing on descent.
VISUAL PASS finding 2 (user): EOX-adjacent blur IS A REGRESSION (user's ruling — they know shipped behaviour). Prime suspect: starvation lock — unclipped requests > 256 slots → every requested tile LRU-touched every frame → nothing evictable → deterministic tail starvation (stable blur ring, "not loading at all"). AWAITING user's debug numbers at a blur pose (requests/misses/dropped/cutCount + per-level table) before fixing — dropped nonzero+stable confirms; dropped 0 → look at band predicates/ancestor resolution with the restored overlay.
VISUAL PASS finding 3 (user): earth-lod-overlay toggle WANTED BACK (my Task-5 deletion adjudication overturned by user). Restore dispatched (sonnet, background): same settings key/row, new data source = shader-derived levelDelta (log2(slotScale/atlasUvScale)), flag via spare uniform padding or proper struct growth + parity tests. Report: overlay-restore-report.md.
IN-FLIGHT AGENT (overlay restore): on DONE → read its diff directly (controller-read, same proportionate ruling as the polish commit — it touches uniform struct + parity tests, verify byte-table/writer/test agree), push, tell user to flip `earth-lod-overlay` in DebugPanel via HMR and use it on the blur pose. On BLOCKED → answer or re-dispatch with the actual old-wiring shape.
QUEUED SEQUENCE (verbatim): (1) user posts blur-pose debug numbers → dropped nonzero+stable = starvation lock confirmed → fix = bound consumed demand in update() to atlas capacity by priority (touch+allocate only top-N) — dispatch as one implementer + controller-read or scoped review; dropped 0 → investigate band predicates/ancestor resolution USING the restored overlay. (2) rest of user §8 pass (daylight sim time). (3) user's three rulings: perf land/park (NEUTRAL halts), crossfade keep-or-redesign, blur-fix acceptance. (4) finish: PR #617 body update → merge on user's word → /feature-done (ARCHIVE THIS LEDGER to docs/superpowers/plans/completed/ before workspace rm) → memory sweep → retire powers-of-ten-earth-zoom worktree (restore its public/data symlink first).
STATE: all code work COMPLETE and review-clean. AWAITING USER (Task 6 closes on their input): (1) perf land/park ruling — NEUTRAL result halts per rule; (2) §8 visual pass on dev server port 5177 (shell bafa80dav in this session); (3) crossfade-loss ruling (parked). After user rulings: update PR body, undraft/merge per user, /feature-done (archives this ledger to docs/superpowers/plans/completed/<basename>.ledger.md BEFORE rm -rf workspace — sdd-execution.md Rule 3), memory sweep.
Still deferred (final-review triage, all OK-TO-DEFER): M12 header trims (earthSurfaceTileRenderer/vertex.wesl/earthLayer/io.wesl); M13 resolution passed twice at gpuHandleRegistry (cache could expose it); M15 4.7× mesh-expansion upload lever (vertex-index derivation) if perf ever needs it; M16 module-global earthFrameCounter; tangent-field no dedicated test; zero-capacity cache degenerate; two page-table-era backlog detail files (2026-07-30-earth-tile-kind-singularity, 2026-07-30-earth-tile-uv-conversion-dead-home) to re-read at /feature-done. (dev server restarted, same port 5177, same flags): earth-surface 23.2→13.7 ms, solar-system control 23.4→14.8 ms. GATE: not neutral/negative — does not halt. Control moved too → environmental share unknown; recorded with caveat in perf-baseline.md. Typecheck + suite green at same HEAD (fix round's run).
public/data: symlinked to main checkout's public/data (2026-08-20) — ready for dev server/perf later.

## Overlay restore: DONE (2026-08-20 late)

`3b859737f` pushed — earth-lod-overlay toggle restored on the cut-walk path.
Controller read the full diff: struct 160→176 (debugLodOverlay f32 @160,
bytes 164..175 true padding), packer + SURFACE_TILE_UNIFORM_BYTES + byte
table + parity tests all agree; fragment derives
levelDelta = round(log2(TILE_SLOT_SCALE / atlasUvScale.x)) with max(,1.0)
guard; palette green/yellow/orange/red = 0/1/2/3+ levels of ancestor
fallback, 60% mix; base globe intentionally plain (nothing resident there).
Full suite 1065/7203 green, typecheck + build clean. Report:
overlay-restore-report.md.

NEXT (unchanged from QUEUED SEQUENCE): user flips `earth-lod-overlay` in
DebugPanel (HMR on port 5177), uses it on the EOX-adjacent blur pose, and
posts the EarthTileAtlasSection numbers (requests/misses/dropped/cutCount)
→ adjudicate starvation-lock branch.

## Visual pass round 2 (2026-08-20 late evening)

- **Blur/untinted root cause FOUND + FIXED `de1807f4a`** (pushed): cut walk
  dropped band-edge leaves (requestable conflated with drawable at the old
  line-214 continue). User's debug numbers refuted starvation (0 miss, 0
  pending, atlas 256/256 but nothing evicted). Fix: skip only requests.push
  for no-file leaves; always resolveCutResidency + draw flattened ancestor
  rect. Failing-first test; suite 7205 green. Controller read full diff.
- **Søndermarken "missing layer" = DATA not code**: GD z14-19 band exists
  only in vdemo manifest (old worktree). Rebuilt THIS worktree's public/data
  as a symlink tree (script: scratchpad/wire-vdemo.py): all targets in MAIN
  repo (v3 store z3-13 + data/raw/geodanmark/soendermarken z14-19), vdemo
  manifest copied as real file, RESTORE-NOTE.md inside
  public/data/images/earth-tiles/. User confirmed GD imagery renders sharp.
- **NEW OPEN FINDING — base-globe/tile depth fight**: user sees shimmering
  dark patches at GD zoom = base globe (non-RTC f32 depth, metre-scale
  jitter at low altitude) stochastically beating the tile mesh's clean RTC
  depth; nearer-or-equal tiebreak can't help since depths aren't ties.
  Options presented: (1) RTC earthRenderer's vertex path too [RECOMMENDED],
  (2) depth bias band-aid, (3) drop base globe near-surface (needs pinned
  base residency — the filed tiles-only backlog item). AWAITING user ruling
  on dispatching option 1.
- Main merged in (`340e2c78b`, only #610 fade rows, clean; suite+typecheck
  green before push).

## Visual pass round 3 (2026-08-20 night)

- User CONFIRMED: Søndermarken back + blurry band-edge tiles gone (fix
  `de1807f4a` verified live).
- **Base-globe descent fade LANDED `92c61710f`** (pushed): user ruled fade
  over RTC-ing the base globe. 300→150 km smoothstep, gated on cut
  non-empty (failure floor alpha-1), alpha rides byte-116 ex-pad slot in
  EarthSurfaceUniforms, straight-alpha OVER blend (identical at alpha 1),
  draw skipped at 0. Controller read diff; typecheck re-verified after
  stale-diagnostic flag. Report: base-globe-fade-report.md. OPEN visual
  check: 150-300 km fade band vs cloud/atmosphere shells (report concern).
- **Tile crossfade IN FLIGHT** (user ruled: crossfade wanted — overturns
  the parked pop-in acceptance): per-tile 400 ms real-time fade of fresh
  tile over next-resident-ancestor flattened rect; instance layout +4+1
  f32; w=1 fast path pixel-identical. Handling on DONE: read diff (layout
  parity seam!), push, user visual check at EOX/GD band crossings. Report:
  tile-crossfade-report.md.
- **EOX batch-2 harvest IN FLIGHT** (user go, EOX approved by email):
  paris/sydney/hong-kong/buenos-aires/cape-town/great-barrier-reef/
  sossusvlei → MAIN checkout data/raw/eox/<region>/13/. Handling on DONE:
  read report (eox-batch2-harvest-report.md), verify counts vs memory's
  estimates; NEXT after harvest = re-bake `--only eox-s2cloudless-2016` +
  v4 prefix bump + R2 sync (recipe in project_eox_multi_region memory) —
  bake runs cwd=MAIN; NOTE this worktree now serves the vdemo manifest
  (local symlink tree), so v4 bake lands in main's v4 dir; vdemo tree's
  z3-13 symlinks point at v3 and would need re-pointing after a v4 bake.

## Visual pass round 4 — collapsing-cut bug + horizon-cull fix (2026-08-20 night, pre-compact)

STATE OF THE TREE: HEAD `8c561d74e` pushed (last landed: backlog entries
556a3041b/8c561d74e, crossfade bb0379020, fade 92c61710f, band-edge fix
de1807f4a). TWO UNCOMMITTED TEMP PROBES (marked "TEMP PROBE — do not
commit"): earthSurfaceTileRenderer.ts draw() ([tileprobe]: drawAltM/zHist/
origin0M every 32 frames) and runFrame.ts tile-planning block ([cutprobe]:
full JSON of camLocal/mvpLocal/viewportPx/bands/cutCount/zWin every 128
frames). REVERT BOTH after diagnosis — never commit. Any code-fix agent
must stage only its own files (never add -A) because of these dirty probes.

### BUG A: cut collapses on descent over Søndermarken (OPEN, live repro pending)
Symptom: below ~322 m tiles stop growing on screen, vanish from screen
edges inward until ~4 remain at 25 m; stars through gaps (base globe faded
<150 km). Evidence chain (all ledgered fact, not theory):
- Planner ALIVE: user panel 300 m {plan 101, zWin 18, cut 50} → 150 m
  {plan 60, zWin 19, cut 21}; overlay pattern all-green, tile count falls.
- Residency PERFECT: 0 miss at every reading.
- Draw inputs LIVE+precise: [tileprobe] drawAltM tracks 2420→24.6 m
  smoothly, vpT ~1e-27 (rebase correct), origin0M shrinks correctly.
- Walk-geometry repro with RECONSTRUCTED inputs (identity roll) showed
  0/19200 uncovered at all altitudes — but its cut counts (80→38→15→7→4)
  match the live collapse, so the 4-tile cut may cover the screen ONLY
  under the repro's approximated matrix; live it does not.
- ⇒ live planner inputs (prepared.mvpLocal/camLocal from composeBodyMvp,
  f32-narrowed, true roll) differ materially from repro's. NEXT: user
  pastes one [cutprobe] JSON at the broken pose + [tileprobe] zHist lines;
  then replay the REAL cutSurfaceTiles offline with those EXACT inputs
  (adapt scratchpad/cutRepro.mts — session scratchpad), find which test
  (horizon / 9-sample frustum bbox / straddle / refine) drops coverage,
  fix with failing-first test. Suspect list: 9-sample bbox under-
  approximation for big near patches; f32 mvpLocal narrowing at metre
  altitudes; roll-dependent frustum orientation.

### BUG B: scattered horizon holes at 46-56N (FIX IN FLIGHT)
Alps 161 km pose + North Sea: leaf-sized star-holes near horizon.
Root cause: cutSurfaceTiles patchAngle measured centre→NW corner ONLY;
meridian convergence makes south corners farther for northern patches →
horizon cull `centreAngle - patchAngle > capAngle` falsely rejects
straddlers. Same defect as the earlier "far-zoom holes (probe-only)" —
unmasked by the base-globe fade. BACKGROUND AGENT is implementing: 4-corner
max patchAngle + failing-first test, touches ONLY cutSurfaceTiles.ts + its
test, report → horizon-cull-fix-report.md. ON DONE: read diff, confirm only
2 files staged (probes dirty!), push, ask user to re-check Alps/North Sea
poses. NOTE: Bug A replay must use the POST-FIX walk.

### Other state this round
- EOX batch-2 harvest DONE (report eox-batch2-harvest-report.md): paris
  360 · sydney 456 · hong-kong 494 · buenos-aires 285 · cape-town 560 ·
  great-barrier-reef 672 · sossusvlei 361 = 3,188 tiles, zero errors, in
  MAIN checkout data/raw/eox/. NEXT on user word: re-bake `--only
  eox-s2cloudless-2016` + v4 prefix bump (cwd=MAIN) + R2 sync; REMEMBER
  this worktree's public/data vdemo symlink tree points z3-13 at v3 —
  re-point after a v4 bake. Strategy ruling in memory: STAY CURATED,
  slow extension; mass crawl OFF without explicit EOX yes (bulk = €1.5k,
  declined).
- Follow-ups filed on the branch: zoom-out crossfade (d10b1ef04), EOX
  colour grade (556a3041b), inside-atmosphere (8c561d74e).
- User visual confirms: Søndermarken sharp (vdemo tree works), band-edge
  blur/untinted FIXED, blob FIXED. Crossfade + fade-band visual checks
  still pending user; Task-6 gate rulings (perf land/park, merge) pending.

## Visual pass round 5 — Bug A exact-input replay (2026-08-20 night)

- User pasted the `[cutprobe]` JSON (broken pose, ~60 m alt, cut=6, zWin=19). Saved verbatim:
  session scratchpad `cutprobe-exact-inputs.json`.
- Pre-dispatch analysis: probe `mvpLocal` is f32-narrowed (elem 15 = f32(radiusMpc)=2.0647e-16,
  elem 14 = f32(2e-22)). Its w-row dotted with sub-camera dir cancels against mw3: w for nearby
  ground ~1e-21 from ±2.06e-16 terms → per-element f32 rounding (~1.2e-23) is percent-scale error
  on w, worse as altitude drops. PRIME SUSPECT: planner viewProjLocal f32 narrowing (draw path
  rebases at camera in f64 first, so draw is unaffected — matches symptoms: draw live, cut collapses).
- Dispatched background sonnet replay agent: run REAL cutSurfaceTiles with exact inputs, classify
  which test kills on-screen z19 tiles, 1-ulp jitter sensitivity test, cancellation-ratio analytics.
  Report → workspace `cut-replay-exact-report.md`. Agent told NOT to touch src/ (horizon-fix agent
  editing cutSurfaceTiles.ts concurrently) and to record which walk version it ran against.
- ON REPLAY DONE: read report. If f32-narrowing confirmed → fix = keep planner's viewProjLocal in
  f64 end-to-end (prepareEarthFrame mvpLocal + walk math; narrowing only needed at GPU upload),
  failing-first test with the exact probe matrix, dispatch fix agent (stages only its own files).
  If a walk test defect instead → fix that test with failing-first repro from the report.
- Horizon-cull agent (Bug B) still in flight; handling plan unchanged (round 4).
- Bug B LANDED: horizon-cull 4-corner fix committed e0bdf59bd + PUSHED. Commit verified scoped to
  cutSurfaceTiles.ts + its test only (probes untouched). 2 new tests failing-first; suite 7218/7218.
  Report: workspace horizon-cull-fix-report.md. AWAITING USER: re-check Alps pose (alt ~161 km,
  lon 7.322 lat 45.977) + North Sea star-holes after HMR.
- Replay CONFIRMED Bug A root cause: exact-input replay REPRODUCED cut=6/zWin=19; killer =
  spurious bbox-culls at ancestor nodes from f32 w-row cancellation (~1e5x, ~1.25% NDC error,
  deterministic); no precision-independent walk defect. Report: workspace cut-replay-exact-report.md.
  Mechanism also read directly in code: composeBodyMvp returns narrowMat4(mvp64) — f32 — and
  prepareEarthFrame feeds that to the planner; header comment's "harmless narrowing" claim is
  wrong for near-camera CPU evaluation.
- USER RULINGS: (1) Bug B is NOT fixed by the 4-corner commit (e0bdf59bd stays — genuine defect —
  but the visible holes have another cause; hole-size analysis says culled z<=7 leaves could only
  look "small" at the limb, so consider cracks/alpha next; PARKED, no more fix dispatches for now).
  (2) User wants an EARTH-LOCAL SLAB ("everything earth related and down") — brainstorming started
  (architectural; refactor-ground before spec). (3) Sequencing ruling via AskUserQuestion:
  SMALL F64 FIX FIRST on #617, finish its gate, THEN slab as its own effort.
- Dispatched background sonnet fix agent: composeBodyMvp returns f64, callers narrow at GPU-upload
  sites, planner stays f64 end-to-end, failing-first low-altitude coverage test. Report →
  workspace planner-f64-fix-report.md. ON DONE: verify commit scope (probes uncommitted!), push,
  user re-tests descent below 322 m over Søndermarken; then probes revert + gate resumes.
- Earth-slab brainstorm context so far: slabs.ts designed for a third row; slab vp narrowed to f32
  in slabViewOf (every layer sees f32); tile draw survives only via ad-hoc camera rebase; slab
  should be camera-rebased + km/m units (retires Mpc-denormal class); open design problems:
  cross-slab occlusion (Earth vs Sun/Moon share NEAR0 depth today), altitude-dependent layer→slab
  assignment.
- Bug A FIX LANDED: b388ba2c9 PUSHED — composeBodyMvp returns f64; 9 GPU callers narrow at their
  upload sites; planner mvpLocal/viewProjLocal f64 end-to-end. Failing-first regression test needed
  a GENERIC (non-axis-aligned) low-altitude pose (nadir poses too symmetric to trigger). Suite
  1066/7219 green, typecheck clean. Probes still uncommitted. Report: workspace
  planner-f64-fix-report.md. AWAITING USER: re-test descent below ~322 m over Søndermarken
  (expect: tiles keep scaling to the z19 floor, no edge-inward disappearance). After confirm:
  revert both TEMP probes, resume #617 gate.
- GRILL-ME session on Earth slab STARTED (user-invoked). Q1 (camera-pose provider seam: derived-(a)
  now / native-Earth-fixed-(b) in Plan 2) argued — (a) survives as far-regime provider, (b) additive
  — ANSWER PENDING. Transcript to docs/grill-sessions/ at session end.
- USER: still broken after f64 fix. Fresh probes CONFIRM f64 live (full-f64 digits) — captures
  saved: cutprobe-exact-inputs-2.json (~149 m, cut=30, was 21 pre-fix) and -3.json (~15 m
  "completely zoomed in", cut=5). f64 arithmetic exonerated at 15 m (cancellation ratio ~4e5,
  f64 rel err ~4e-11). KEY REFRAME: at 15 m the visible ground (~20-40 m) is SMALLER than one z19
  tile (76 m) — cut=5 may be geometrically correct, bug possibly DOWNSTREAM of planner.
- Dispatched coverage-replay agent (sonnet, bg): real walk on both exact f64 captures + ray-cast
  coverage grid via mat4d.inverse + gap classification + visible-region size at 15 m. Report →
  workspace coverage-replay-report.md. ON DONE: if COVERED → chase draw/residency/atlas side
  ([tileprobe] zHist from user, renderer path); if GAPS → walk test named with numbers, fix TDD.
- Coverage replay: planner FULLY EXONERATED (exact repro both captures; 0 uncovered cells;
  15 m visible ground 36.7x28.9 m < one z19 tile so cut=5 correct). Report:
  coverage-replay-report.md.
- USER SCREENSHOT: only the deep GD tile island renders (stepped rect union ~530x170 m),
  stars everywhere else; base-globe fade (built tonight) unmasked it. USER CORRECTION:
  zooming out brings the REST OF GD tiles back (progressive with altitude, not band-fixed).
  User supplied FULL camera state at 89.5 m + synchronized [cutprobe] (cut 15-17, 0 miss)
  → saved scratchpad camera-state-89m.json.
- TWO RIVAL WORLDS: (A) draw projects from effectively-higher camera (drawn scene scale
  stalls while planner follows true altitude); (B) scale fine, non-GD (EOX/base) tiles fail
  to produce pixels. Screenshot patch spans ~530 m of ground in about half the screen —
  at 89.5 m true footprint is only ~200x110 m → leans (A), but screenshot pose altitude
  unconfirmed.
- Dispatched projection-divergence agent (sonnet, bg): reconstruct BOTH pipelines from
  source (slabs.ts deriveSlabs -> composeBodyMvp planner path; rebaseViewProj+narrow+
  NodeParams+vertex.wesl draw path, f32-faithful), validate reconstruction against captured
  mvpLocal, compare both vs pure-f64 ground-truth pinhole projection of the z19 block
  corners; if draw diverges, bisect which narrowing step. Report →
  projection-divergence-report.md. ON DONE: fix the guilty transform with failing-first test.
- Still wanted from user: [tileprobe] zHist line post-fix (does renderer receive z<14
  tiles?), whether stars visible at the 89.5 m pose, screenshot's altitude.

## SHIP RULING (2026-08-21, user)

- Projection-divergence agent: NEITHER pipeline diverges (planner/draw/f64 ground truth agree
  to ~0.001 px at the 89.5 m state; apparent scale gap = 8.7 m capture skew between async debug
  outputs). Island bug remains open, suspects: fetch/residency stall vs per-tile draw loss.
- USER RULING: SHIP #617 now with the island bug as a known issue; implement Plan 2; re-check
  the bug after. Perf-NEUTRAL = LAND (implied by ship ruling). Crossfade gate item moot (built
  as bb0379020).
- Known-issue filed + pushed 771f6e5a0: docs/backlog/2026-08-21-earth-tile-descent-island.md
  (self-contained evidence trail). Temp probes REVERTED (were pure additions; tree clean).
- Earth-slab grill session PAUSED mid-Q1 (user pivoted to ship+Plan 2); partial transcript to
  docs/grill-sessions/ pending.
- NEXT: /feature-done (archive THIS ledger to plans/completed/2026-08-20-earth-rtc-surface-foundation.ledger.md
  FIRST), squash-merge #617, then author Plan 2 (surface navigation, spec §4).
