# Ledger: labels as data, prep PR

Plan: docs/superpowers/plans/2026-11-17-labels-as-data-prep.md
Spec: docs/superpowers/specs/2026-11-17-dome-labels-design.md
Branch: worktree-dome-2d-labels-simplify (base ee682ac07). Dev server: http://localhost:5176
Parallelism: 1 plan, serial dispatches. Perf gate: ON (owner). Baselines in this folder
(gpu-/cpu-/alloc-ee682ac07.txt, allocProbe.mts).
Open owner checks: ranking bands, LABEL_TEXT_PX.max, missing stagger (Task 11); fade behaviour
(Task 12); DPR, light-time sphere (Tasks 14, 15).
Rules: no Co-Authored-By; merge only on "merge this PR"; dome PR gets its own plan after this lands.

## Dispatches

- Group A (Tasks 1–4 + Gate A): Opus, base = docs commit, status: RUNNING
- Group A (Tasks 1–4 + Gate A): Opus, 544c1942c→37b214026, DONE. ~95 tool uses over 3 runs (one network drop, resumed). Gate A neutral after undoing the section split (ruling below). Report: groupA-report.md.
- Ruling: overlays stay ONE section, rings a parameter (`overlays({ selectionRings })`) — the two-section split cost a third swap pass (+1.4–2.0 ms) and changed draw order — cost if wrong: dome PR needs its own section variant, already covered by the parameter.
- Carry to Task 8: interim `viewFromSlab` + `nearClipMpc` go away (behaviour check: labels nearer than COSMO's 10 kpc near plane); never square raw Mpc view vectors in WGSL (f32 underflow < ~3 km).
- Review A (Tasks 2, 4): Opus, RUNNING (read-only). Fix round goes to the Group B agent.
- Group B (Tasks 5–6 + Gate B): Opus, base 37b214026, RUNNING.
- Review A: DONE, no behaviour bug in mono. 6 fixes queued to the Group B agent (parity sentinels per component, off-axis lifted shot, orphaned JSDoc, uniform offsets to data/, reuse projection.vp, rename atlasToPx). Declined: CPU twin ignores nearClipMpc (pre-existing; the CPU/GPU split disappears in Task 10), per-rig cache key and double outputProjectionOf (interim files deleted in Task 10).
- Carry to DOME PR: `outputProjectionOf` ignores `ViewSpec.clipYFlip`; `ViewRig.outputProjection` is optional and defaults to pinhole (make it required when the dome names its own).
- Group B agent 1 (Opus): 37b214026→361f04754 (Task 5 DONE), Task 6 uncommitted, stopped at context limit (188 tool uses). Handoff: groupB-handoff.md.
- Group B agent 2 (Sonnet): finish Task 6 + review-fix commit + Gate B. RUNNING.
- FINDING for Tasks 7/9/10 + spec D5: today's lift is NOT "rim + gap". It is anchor = subject + up × max(28, 1.5·D, 28 + inkDrop) px (D = apparent diameter); leader from rim+gap (captions, gap 4) or from centre (famous, Milky Way, gap 0) to text bottom − 6 px. The angle lift needs a style factor (lift = k × angular radius, k = 3 for these) and a minimum lift in px; Group B reproduces the screen-space rule via a `lift` kind in the row. NEAR0 declutters at the proposed lift, COSMO at the drawn one (`declutterLift`, transitional).
- Group B agent 2 (Sonnet, 53 tool uses): 361f04754→89f866cf5. Task 6 a1c36d2da, review fixes 89f866cf5. DONE. Gate B: labels:near0 -21% (0.895→0.704 earth-surface), label alloc -13..18% near poses, 2 swap groups, marker-lines row gone. Report: groupB-report.md.
- Star-field total (7.1 baseline → ~9.5): controller A-B-A-B vs another checkout's server on :5173 (no label changes) reads the same swap rows (1.0–1.4 ms, 12%) on both → machine drift since the baseline run, not this branch.
- Docs amended (lift rule: radii factor + px floor + leader origin), committed after 89f866cf5.
- Group C part 1 (Tasks 7–9): Opus, RUNNING.
- Group C part 1 (Opus, 124 tool uses): →14dee2194. Tasks 7 cf5d73a5b, 8 3782850a9, 9 14dee2194. DONE, nothing on screen. Report: groupC1-report.md (signatures + wiring recipe).
- Rulings for Task 10 (controller): (1) hover/select whitening in the shader from two pick words in the uniform; (2) the "never sample depth" rule for a sub-pixel subject on a body's ground is derived by core per frame and stored as a flag bit in the high 16 bits of the record's `style` word, written only when it changes; (3) a director whose sources' toggle fades are all 0 and that has nothing ramping skips its stages; (4) COSMO's 10 kpc hide stays as `nearHideMpc` on the director row, applied in targetAlpha; (5) body-occluded labels hide whole (D6.2), sampled-depth verdict stays in the shader.
- Task 10 split into three dispatches with old and new paths coexisting mid-branch: 10a core switch + streams + constellations; 10b caption family (bodies, stars, black holes, missions, light-time); 10c structures, famous, Milky Way + delete the old path. Review of Tasks 8+10 after 10c.
- 10a: Opus, RUNNING.
- 10a (Opus, 176 tool uses): →3fbb5ba50. 496b2f60c record path draws beside the old one; 3fbb5ba50 streams + constellations. DONE. Report: task10a-report.md. Gaps: leaders/lift/depth test unseen on screen until 10b; f32 occlusion cutoff ~0.4 m at Earth's surface.
- OPEN owner ask (dash): long streams (GD-1, Svol, M68-Fjorm, NGC3201-Gjoll) lose names to the fills-the-view rule. Options: style opt-out / width as radius / keep.
- 10b caption family (Opus): RUNNING.
- 10b (Opus): →4f25401dd. black holes d6fa2a0eb, bodies 26826defc, stars fa957978f, light-time 69c85e73b, + 4f25401dd (oneMpcSeam ratchet: footprintRadiusMpc). Missions left on the old path (per-craft fade would grow the visibility contract). Report: task10b-report.md.
- Ruling: missions' settings dim goes into the description's colour alpha with `changes: settings.missions.craft`; shared fadeKey as today — stays inside the approved contract — cost if wrong: a re-encode of ~N craft records when the setting changes.
- Adjacent (pre-existing, old path): Perseverance caption shows its leader but no text. Check on the new path in 10c.
- 10c (Opus): missions, structures, famous, Milky Way, then delete the old path. RUNNING.
- 10c (Opus, 223 tool uses, 360k tokens): →132d3db48. missions 6b38194f2, structures f275ed4f8, famous c83c2aa47, Milky Way a6ac6344c, old path deleted 132d3db48. DONE. Task 10: complete. Report: task10c-report.md. Core addition: `LabelFrameInputs.meshBodies` presence gate in resolveAnchors (craft before launch). Branch diff vs base: 298 files, +5279 −10869.
- Carry to Task 11: (1) angle lift pushes text off-frame for big subjects (Andromeda at mw-1mpc, focused Mars at standoff); (2) a body focus gives `focusPickId: null`, so focused-only hides every label; (3) Perseverance caption text occluded by terrain LOD error (pre-existing, owner threshold question); (4) `occludeAgainstScene` is a one-value knob; (5) test gaps: renderer `set` full upload after rebuild.
- Review of Tasks 8 + 10 (Opus, read-only): RUNNING.
- Task 11 (Sonnet): tune text cap + ranking bands (commit), mock off-frame lift / constellation size / stream radius candidates for owner checks. RUNNING in parallel with the review.
- Review 8+10 (Opus): DONE, report review-8-10.md. BUGS: (1) focused-only with a body focus hides all (focusPickId from receding-focus ref; fix = encodeSelectionPick(selection.focus)); (2) D6.4 half holds (hovered/selected must also skip focused-only, recession, and win declutter); (3) low: 'above' labels CPU visible while subject behind eye (require view[2] > 0). Cleanup + test gaps listed there. Dome risks carried: text size divides by view depth, apparent diameter uses pinhole focal, uniform written per draw, silent capacity overflow.
- Fix round QUEUED until Task 11 finishes (its mock edits need a quiet tree).
- Owner note: the tour turns focused-only on for its whole run; under ruling BvhP that now hides body/star/constellation captions too. Raise with the Task 11 ask set.
- Task 11 (Sonnet, 134 tool uses): DONE, no commit (no value changed: LABEL_TEXT_PX.max stays 72, ranking bands unchanged). Report: task11-report.md, shots/task11/. Mocks reverted.
- OPEN owner ask (dash, replaces cSHG): lift gap cap 60 px (Mars, Andromeda checks); constellation text size (mpc 2e-6 vs cap); stream style opt-out of fills-view fade vs keep; tour + focused-only.
- Fix round (Opus): review bugs 1–3 + cleanup + tests; investigates the 2x famous lift vs base and Triangulum caption over Mars. RUNNING.
- Seen in shots/task11/gd1-near-a.png: "M92" drawn twice side by side (top right). Check after the fix round.
- Fix round (Opus): →0f4ae8fd5. efac48657 focused-only follows the focused selection + hovered/selected keeps its place + behind-eye; 0f4ae8fd5 review cleanup. DONE. Report: fixround-report.md. Finding A: no radius bug; base text hung ~26 px under its anchor (line-top alignment) and the 3D-turn lift stretches off axis (1.34x at 27°). Finding B: COSMO labels no longer hide over a body's disc (base faded per pixel by body coverage) = regression.
- Ruling: COSMO runs the same body-sphere hide as NEAR0 (one rule on both directors, removes the NEAR0-only special case) — cost if wrong: text overlapping a disc with its subject beside it still draws; revisit with per-pixel coverage.
- Group D part 1 (Sonnet): COSMO body hide, duplicate "M92" check, Task 13 (pick sentinel), Task 15 (light-time sphere by pixels). RUNNING.
- Owner asked for live links to the proposed behaviour. Change of order: Group D part 1 NOT dispatched yet. Instead (Sonnet, RUNNING): three provisional commits, each revertable alone — lift gap cap 60 px, constellation text mpc 2e-6, stream style `keepsWhenFillingView`. Revert whichever the owner rejects (ask cAAK open). Then Group D part 1 (COSMO body hide, Task 13, Task 15).
- Provisional commits (Sonnet): 1f5ad6491 lift gap cap 60 px; 6940081cf constellation text size; af7f9f77b stream `keepsWhenFillingView` (CPU-only flag). Shots: shots/task11b/. Owner verdict pending (ask cAAK); revert any rejected one. Notes: cap is an angle, so the on-screen gap can exceed 60 px for a very big subject (~84 px seen); "M92" twice = a stream named M92 and the globular cluster M92 (two subjects, not a bug); GD-1's name lands on Andromeda's disc at the near pose.
- Group D part 1 (Sonnet): COSMO body hide, Task 13, Task 15. RUNNING.
- Owner: constellation names differed in size from Earth → 445483d33 constellation `textHeight: { mpc: 0 }` (always the minimum size, as lightTime).
- Owner ruling: stream names should NOT stay when close → revert af7f9f77b. Handed to the Group D1 agent (its uncommitted edits blocked my revert). Verify the revert landed when it reports.
- Owner ruling: the lift gap cap goes, keep the lift as it was (3 radii, 28 px floor) → revert 1f5ad6491, also handed to the Group D1 agent. Consequence accepted by the owner's ruling: captions of very big subjects leave the frame, as on the base.
- Group D part 1 (Sonnet, 79 tool uses): 8b945f7c0 far-scene labels hide behind bodies; 2d8221a75 Task 13: complete (packPickWord in data/selectionEncoding.ts); 7adf946fb Task 15: complete (shared `subjectSizeFade`; sphere approach edge moved 1.2–2 → ~2.08–2.6 radii, far edge same; no long-lens shot, unit tests at 1x/10x focal). Report: groupD1-report.md, shots/groupD/.
- Reverts by the controller on the owner's direct rulings (agent's attempt was denied): 2be569b3f reverts stream names stay (flag gone from subjectSizeFade too); cc4a77a24 reverts the lift gap cap. Grep clean, typecheck:fast + 16904 tests pass. HEAD cc4a77a24.
- Owner is testing hovered/selected-keeps-label live (efac48657); may ask to remove it.
- Dash ask cAAK closed (answered in chat). Tour + focused-only: bring beat shots, not an abstract question.
- Group D part 2 (Opus): Task 14 (DPR via pxScale) + Task 16 (backlog/docs). RUNNING.
- Group D part 2 (Opus): 1a0eb8fb4 Task 14: complete (pxScale = canvas px per CSS px; 15 constants halved so @2 is unchanged; @1 text halves in device px: 24 → 13 CSS px); 434d997d3 Task 16: complete. Report: groupD2-report.md, shots/task14/. HEAD 434d997d3.
- OPEN owner asks: (1) `FrameView.pxPerCssPx` is a new field on every pass's ctx (contract growth, needs a yes); (2) at 1x (4K recorder --dpr 1, 1x kiosk) label text is now half its old size; keep / re-base on the 1x look / revert Task 14.
- Debt seen: tools/shot/README.md has "Page stability" twice.
- OPEN owner ask v8cn (dash): text size at 1x (revert / keep / re-base at 1x size); pxPerCssPx ctx field. Meanwhile (Sonnet, RUNNING, no commits): Gate C perf with a same-session base A-B-A-B, Task 12 fade clips (W/clips/), tour beat pairs under focused-only (W/shots/tour/). Report: gateC-report.md.
- Owner: 1x sizing is right (Retina look is the tuning reference) → Task 14 stays as is. Ask v8cn replaced by a one-question set: the pxPerCssPx ctx field (OPEN).
- Owner answer (ask 9B3y): NO new field on the pass context; find another way. Plan: remove `FrameView.pxPerCssPx` and `ViewSpec.pxPerCssPx`; core passes the ratio as an argument (`outputProjectionOf(view, rig, pxScale)` from `canvasPxPerCssPx(deps.canvas)` in runFrame / pickFrameContext); the one Layer reader (light-time sphere pass) reads the canvas already reachable through `state.gpu` (PassState). QUEUED until the Gate C agent finishes (its perf runs need a quiet tree). Dome note: faces must get their own scale from the rig, not the main canvas ratio.
- Owner (supersedes the line above): the field MAY stay on the pass context, renamed `dpr`. Plan now: rename `FrameView.pxPerCssPx` / `ViewSpec.pxPerCssPx` → `dpr` (and `canvasPxPerCssPx` → `canvasDpr`, the `mainViewSpec` parameter, tests, docs) via `npm run refactor rename`; no structural change. QUEUED until the Gate C agent finishes.
- Gate C (Sonnet, 73 tool uses; same-session base A-B-A-B): labels:near0 CPU 0.79→0.17 / 0.75→0.16 / 0.73→0.18 ms (local-group 0.04→0.14); labels:cosmo −0.05..0.1 ms; GPU label passes neutral, 2 swap groups; label allocation 954→171 / 897→159 / 823→169 KB/frame (local-group 141→147): better but NOT near zero (liftedAnchor, projectRecords, Math.hypot, partitionBodiesByPresentation, targetAlpha). Report: gateC-report.md.
- Fade clips for Task 12: clips/fade-smoothstep.mp4, clips/fade-exponential.mp4 (same 10 s flyout, 720p). Owner pick pending.
- Tour: no near-scene captions appear in the tour, so focused-only changes nothing there. BUT recordings run at dpr 1, so label text is now half size on film (shots/tour/07-virgo-{base,now}.jpg: structure names tiny). Owner decision needed: recorder label scale.
- Writer (Sonnet, RUNNING): rename → `dpr`/`canvasDpr`; remove remaining per-frame label allocation. Report: alloc-report.md.
- Writer (Sonnet, 40 tool uses): bd3b3c0c0 rename → dpr / canvasDpr; a9d3256ca allocation (title amended by the controller). Label KB/frame 170→33, 158→29, 170→32, 144→22 (base ~950). CPU near0 0.159→0.120, cosmo 0.103→0.078 ms (12-pose mean). Remaining ~30 KB: scratch-object doubles, occluder array, director .map arrays; stopped for clarity. Report: alloc-report.md. HEAD a9d3256ca.
- OPEN owner ask zywg (dash): recorder label scale; fade behaviour pick (Task 12).
- Final whole-branch review (Opus, read-only): RUNNING → review-final.md. Remaining after it: fix round, Task 12 deletion, recorder scale if chosen, /feature-done, PR.
- Final review (Opus): DONE → review-final.md. BUGS: (1) light-time sphere on dome faces now depends on face px and dpr (full to 17 radii / gone at 57 at 2205 px dpr 1, was 12/40) — owner ask; (2) structure rings (device px) vs their labels (CSS px) disagree at dpr ≠ 2 — fixing. Mid-review fixes, reverts, allocation caches: confirmed clean. Cleanup + test gaps: fixing.
- Final fix round (Sonnet): commit 1 rings in CSS px + parity; commit 2 cleanup. RUNNING → finalfix-report.md.
- OPEN owner ask (dash, replaces zywg): recorder label scale; fade pick (Task 12); dome light-time sphere (keep distance rule vs accept).
- Final fix round (Sonnet, 122 tool uses): d45742db5 rings in CSS px + parity test (8/24 failed before); f06d24ea5 cleanup. Full npm test: 34007 passed, 2 failed (website roadmap row naming the old backlog title) → fixed by the controller in 465772008. HEAD 465772008. `forwardProjectPoint` kept (reference projection in two tests).
- REMAINING: owner ask r2Yo (recorder label scale; fade pick → Task 12 deletion; dome light-time sphere). Then: full test rerun, /feature-done, open PR, watch CI. Merge only on "merge this PR".
- Owner answers (ask r2Yo): recordings KEEP the small text (no recorder scale); fade = smoothstep 300 ms for all labels; dome light-time shift ACCEPTED (dome PR sets the dome's pixel scale).
- Task 12 (Sonnet, RUNNING): delete the exponential policy + policy plumbing; dome backlog notes; full typecheck + full npm test.
- Task 12: complete (004c9f6e8 one fade, LABEL_FADE_MS; policy type, row field, two dead frame columns deleted). 7c957f419 dome backlog notes. Full typecheck clean; full npm test 34007 passed, 1 skipped (one timeout flake, passed on rerun). HEAD 7c957f419. All 16 tasks done. Next: /feature-done, PR, CI.
- /feature-done audit: tests + typecheck green at 004c9f6e8/7c957f419; 26/26 boxes; no new TODOs; no old names. Deletion audit (Opus) → deletion-audit.md: SAFE-NOW ~66 lines (S1–S5, S7, S8 being applied by a Sonnet agent, RUNNING; S6 pre-existing, S9 low confidence: not applied); NEEDS-RULING R1–R4 + S6 in a dash ask (OPEN). Not explicitly owner-signed: ranking, 72 px cap, dropped stagger, light-time sphere fade (links given).
- After the safe bin + rulings: completion moves (plan, spec → completed/, ledger archive), push, open PR, watch CI. Note: spec stays the dome PR's source — move only the plan? DECIDE at the moves: the spec covers BOTH PRs, so it stays in specs/ until the dome PR ships; only the plan and ledger move.
- Safe bin applied: 8ea55991e (27 files, +51 −70; S1–S5, S7, S8). typecheck clean, 30653 tests pass. HEAD 8ea55991e. Waiting on ask nHRm (R1–R4 + S6) before the completion moves and the PR.
- Owner: "open draft pr" → pushed, draft PR #1144 opened (https://github.com/rulkens/skymap/pull/1144). CI watch running in background. Completion moves (plan → completed/, ledger archive) NOT yet done: waiting on ask nHRm. Merge only on "merge this PR".

## After the draft PR (2026-11-18/19)

- Merged main twice (fefd7602e, 26c744d33): film-look letterbox step kept last in the overlays; old-path body caption test dropped.
- 861f48253 authored label colours as hex (`hexToGl`), owner request.
- Owner ruling on the larger deletions (ask nHRm): R1 and R2 only. 129a89e38 one `labelsPass` factory for both directors; 8feb2b6c6 the director owns the one source list. Declined: unused text alignment options, the five unread record words, the ring max-size knob.
