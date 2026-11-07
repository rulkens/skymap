# SDD ledger — plan: docs/superpowers/plans/2026-11-07-blending-seq.md

Spec: docs/superpowers/specs/2026-11-07-blending-seq-design.md (approved 2026-11-07).
Owner answers (ask gUZd): execute the plan; keep the blendIn window; no perf gate; serial, one PR.
Branch worktree-blending-seq, BASE f404c92e3 (spec), plan e277992cd.
Parity probe: untracked tests/zz-probe/parity.probe.test.ts (NEVER stage); baseline
<scratchpad>/parity-base.json = 62 clips at f404c92e3; check = `bash <scratchpad>/parity-check.sh`
(scratchpad = /private/tmp/claude-501/-Users-rulkens-Development-js-skymap/8886b604-fee4-457b-b132-80ed221384eb/scratchpad).

## Pre-flight scan

| tasks | produces → consumes | finding |
|---|---|---|
| 1 → 2 | segmentValueAt (1) reads `curve` after 2 reshapes it | ok: 2 adds `curveProgress` inside segmentValueAt |
| 1 → 6 | lerpChannel, segmentValueAt at endSec as planned end | ok |
| 2 → 7 | SegmentCurve one arm → hermite arm | ok |
| 3 → 4 | resolveClipFoci spread → overlap round-trip test | ok |
| 4 → 5, 6 | SeqSteps/StepSpan index ranges (push order) | ok; 5 reads acc.cues in push order, not sortedCues |
| 6 → 7 | buildFrameLegs/legIndexAt, classification skeleton | ok |
| 1 | extraction; no test; parity | self-consistent |
| 2 | type reshape; no test | self-consistent |
| 3 | spread; test deferred to 4 | self-consistent |
| 4 | tests match placement rules (8.5 s case: 4+4+2 −1 −0.5) | ok |
| 5 | hide/show inversion test matches key rule | ok |
| 6 | zero-length snap → rule 3 via pair classification | ok |
| 7 | abutting pair where one side is zero-length (trailing snap at seq end) | GAP — ruled below |

Ruling: an abutting pair with a zero-length writer on either side is a rest, never a matched join — a snap has no speed to match, and Hermite on a zero-length window is undefined — cost if wrong: a trailing snap at a seq's end could be expected to "flow", which nothing authors today.

## Dispatches
Dispatch A: Tasks 1–3, opus, BASE e277992cd, running
Task 1: complete (commits e277992..d93026d, parity OK; mid-branch review pending)
Task 2: complete (commits d93026d..a8c6b8c, parity OK)
Task 3: complete (commits a8c6b8c..53ddd21, parity OK)
Dispatch A done: opus, 47 tool uses, HEAD 53ddd21a3. Deviations: evaluateBaseTarget fresh-array wrapper; compileClip.test unchanged (no compiled ease).
Dispatch B: Tasks 4–5, sonnet, BASE 53ddd21a3, running. Task 1 mid-branch review (opus) running in parallel (read-only).
Task 1: mid-branch review clean (spec ✅, Approved).
Task 1: minor (deferred): lerpChannel.ts:26-30 re-implements utils/math/lerpVec3 — use it.
Task 1: minor (deferred): segmentValueAt.ts:4-5 header names the spin delta both `to` and `by`.
Task 1: minor (deferred): spec line 96 still names segmentEndValue / three ease sites; update to what shipped at feature-done.
Task 4: complete (commits 53ddd21..f1dad72, parity OK). Deviations: SeqOverlap = number | number[] (Immer Draft<ClipData> breaks on readonly); extra files validateSeqOverlap.ts, cueOrderKeys.ts.
Task 5: complete (commits f1dad72..f3548ab).
Task 4: minor (deferred): validateSeqOverlap called twice, first with Infinity durations to run rule 1 only — split rule 1 from rule 2 instead of a vacuous pass?
Dispatch B done: sonnet, HEAD f3548ab1d.
Dispatch C: Task 6, opus, BASE f3548ab1d, running
Task 6: implemented (commits f3548ab..f40181d, parity OK; mid-branch review pending). Deviations: resolveSeqJoins without start param (Task 7 adds); new baseTracksOf.ts shared by compileClip + rule 4; error names later of the two spans; writers sorted by start then end.
Task 6: review ❌ — 1 Critical (yaw/roll crossfade mixes shortest-arc; spec says unwrapped), 1 Important (rule 4 misses frame change at in.start === out.start), 3 Minor (validateSingleWriter i+2 scan incomplete; baseTracksOf vs resolveSeqJoins comparator mismatch; ALL_CHANNELS module const in baseTracksOf).
Ruling: crossfade mixes angles unwrapped (linear) and starts `in` from out's UNWRAPPED planned end (from + wrap(to−from) for a yaw/roll tween) — the plan's lerpChannel-with-CHANNEL_SPACE mix contradicted the spec ('unwrapped angles'); spec wins — cost if wrong: none visible, angles differ by 2πk only at numeric level.
Ruling: fold all 3 minors into fix round 1 — each is a few lines in files the round already touches — cost if wrong: a slightly larger fix diff.
Task 6: fix round 1/1 (5 addressed; commit f40181d..0cadbe0, parity OK). Deviations: rule 4 = frames differ OR legIndexAt(a) frame ≠ a's frame (not every leg at a.start — snap false-positive); validator scans all segments starting before a.end, half-open test kept; shared comparator utils/animation/byStartSec.ts start-only (stable) for parity; new helpers lerpUnwrapped, unwrappedEndOf.
Task 6: complete (commits f3548ab..0cadbe0, review round 1, no re-review per sdd-execution).
Dispatch D: Task 7, opus (fresh), BASE 0cadbe0a3, running
Pushed 0cadbe0a3; draft PR #1087 opened; CI watched in background.
CI green on 0cadbe0a3 (typecheck · test · format, Workers Builds).
Task 7: implemented (commits 0cadbe0..add7d1d, parity OK). Deviations: tighter ratio + live-start tests; D8 backlog premise wrong (compileClip.test already covers composite throws + channelValueAt) — filed as deferred anyway.
Ruling: delete the D8 backlog line + detail file in the final fix wave — its premise is disproved, and a backlog item for a test-file split is noise — cost if wrong: a missing focused test file nobody asked for.
Ruling: Task 7's mid-branch review folds into the final whole-branch review (it is the last task; one Opus reviewer gets the Task 7 contract plus the whole branch) — cost if wrong: one less independent read of the Hermite maths.
Task 7: complete (commits 0cadbe0..add7d1d; review folded into final).
Final review: opus, package 5ed79db71..add7d1db5, running. CI on add7d1db5 watched in background.
Final review: Needs fixes — 2 Important (missing resolveClipFoci overlap round-trip test; D3 frame-leg error lacks the snap remedy in message + docs), 6 Minor (rule-3 three-writer throw untested; abut exact float equality; rule-4 branches untested; dead easeEndSlopes fallback arm; lerpUnwrapped target detour; docs overclaim/format). Deferred minors triaged: lerpChannel→lerpVec3 fix; segmentValueAt header fix; spec line 96 drop (already corrected by Task 7); validateSeqOverlap double call drop; D8 backlog delete.
Ruling: one fix wave takes both Importants and all 6 Minors — each is a few lines and a test, and nothing parks better than it fixes — cost if wrong: a slightly larger fix diff.
CI green on add7d1db5. Final fix wave: sonnet, BASE add7d1db5, running.
Final fix wave done: df9311925 (10 items; mutation-checked keeps-overlap + ABUT_EPS tests; parity OK). Pushed.
Deletion audit: opus, greenfield framing, whole branch 5ed79db71..df9311925, running.
Deletion audit: ~15–25 src + 3–12 test LOC removable (<5%); report deletion-audit-branch.md.
Ruling: apply audit items 2–5 (walkOverlappedSeq flags, segmentValueAt u once, drop the toEqual plain-seq test that can't fail, comment trims); skip 6 (low value).
Ruling: keep validateSingleWriter's three-writer backstop (audit item 1) — it is the evaluator's precondition at the compile boundary, same spirit as the blendIn equality check the owner kept; resolveSeqJoins may change later — cost if wrong: ~15 lines of unreachable guard + test.
CI green on df9311925.
Trims: 576e0ce22 (net -18 LOC, parity OK). Probe tests/zz-probe removed (untracked).
Trims: 576e0ce22 (net -18 LOC, parity OK). Probe tests/zz-probe removed (untracked).
Done audit: READY (31111 tests pass, typecheck clean, 29/29 boxes). Completion moves next.
