# SDD ledger — plan: docs/superpowers/plans/2026-09-18-local-bubble-shell.md

Spec: docs/superpowers/specs/2026-09-18-local-bubble-shell-design.md
Worktree: .claude/worktrees/pr-755-local-bubble · push target: origin claude/per-tau-shell-milky-way-qm66h4 (PR #755)
User answers (2026-09-18): perf gate SKIPPED; serial dispatches A (T1–2) → B (T3–4) → C (T5–8); T9 inline. Lean protocol: review:yes tasks (2, 3, 6, 7) get one mid-branch review; one final review.
Start HEAD: ea950c328

## Pre-flight scan

| Rows | Produces → consumes | Finding |
| --- | --- | --- |
| T1 → T6 | `fadeWindow(bands, v)` → `localBubbleOpacity` | agree |
| T2 → T6 | `FRAME_TO_WORLD` → model matrix | agree |
| T3 → T4, T5, T6 | `ShellMesh`, `ShellMeshDtype`, encode/decode | agree |
| T5 → T6, T7 | renderer `upload`/`hasMesh`/`destroy` | agree; T6 extends the same file |
| T6 → T7 | `localBubbleOpacity(camDist, fadeAlpha, intensity)` | T6 lands before the fade row exists → Ruling 1 |
| T5–T8 | all touch `layer.ts` | sequential in one dispatch; fine |
| T3 self | "reuse SCFD id maps, don't copy" | maps may be module-private → Ruling 2 |
| T4 self | "raise the preview's MAX_FACES" vs "preview reads .shell instead of rebuilding" | contradiction → Ruling 3 |
| T4 self | `vertexNormals` signature vs the preview's private one | Ruling 4 |
| T1, T2, T8, T9 self | consistent | — |

Ruling 1: T6 feeds `fadeAlpha = 1` at the pass call site; T7 replaces it with the fade row's alpha in the same dispatch — the spec requires the fade row, the interim constant never ships — cost if wrong: none beyond one edited line.
Ruling 2: if `FRAME_KIND_TO_ID` / `ID_TO_FRAME_KIND` are private in `scalarFieldFormat.ts`, export them from there (no copy, no new file) — spec says SCFD numbering, one source of truth — cost if wrong: a later move of two exports.
Ruling 3: the face cap moves to the bake (the preview no longer meshes); the bake's cap must admit ~570k faces at 4 pc (use ≥ 800k) — spec §4.1 says ≤4 pc edges — cost if wrong: a coarser mesh, visible as a printed longest-edge > 4 pc.
Ruling 4: the plan's `vertexNormals(positions, faces): Vec3[]` signature binds; adapt the extracted body to it — cost if wrong: one signature tweak.

## Progress
Task 1: complete (commit 04ae37030; no per-task review, not tagged)
Task 2: implemented (commit a40927f32); mid-branch review dispatched (Opus)
Dispatch B (T3–4) dispatched from a40927f32
Task 2: complete (commit a40927f32, review clean — spec ✅, frame maths verified independently)
Task 2: minor (deferred): frameToWorld.ts:14-36 16-arg toWgpuMat4 surplus (Float32Array.from / mat4.clone)
Task 2: minor (deferred): frameToWorld.ts:15 comment says tuples "above" but they are imported
Task 2: minor (deferred): superGalacticTransform.ts:86 comment points at the wrong symbol
Task 2: minor (deferred): frameToWorld.test.ts:43-59 identity test restates code — delete

## Resume map (written for compaction, 2026-09-19)
- IN FLIGHT: dispatch B (Sonnet) = Tasks 3–4, from a40927f32. On return: record T3/T4 commits; T3 is review:yes → run task-brief 3 + review-package <a40927f32>..<T3 commit>, dispatch Opus reviewer (brief + spec §4.2 + diff). T4 untagged → no per-task review.
- THEN dispatch C (Sonnet) = Tasks 5–8, carrying Ruling 1 (T6 feeds fadeAlpha=1 until T7 wires the fade row). T6 + T7 are review:yes → one mid-branch review each after C.
- THEN Task 9 inline (DATA.md row SHEL v1, "Six formats", layout line; PR #755 description incl. 3 eye-check open questions).
- THEN one final whole-branch review (Opus) over merge-base..HEAD, pointed at the deferred-minor lines above; ONE fix dispatch; one scoped re-review.
- Push: `git push origin HEAD:claude/per-tau-shell-milky-way-qm66h4` (never force). No Co-Authored-By trailer.
- User directives this session: everything on PR #755 (data + prep + layer); perf gate skipped; serial dispatches; user runs `npm run build-local-bubble` themselves (public/data is a symlink to main's — agents must not bake into it or run build-data-manifest); then user does the DoD manual smoke.
- Dev server for the user: http://localhost:5175 (background shell bfg1oogtk, started from this worktree).
Dispatch B done: Task 3 449196848, Task 4 a1630a90b. Bake dry-run (scratch output): 569,382 faces, 284,693 verts, 11.39 MB f16, longest edge 7.66 pc, chimney 22.0° from NGP.
Task 4: complete (commit a1630a90b; untagged, no per-task review)
Ruling 5: longest displaced edge 7.66 pc > the spec's "≤4 pc" — 4 pc is the refinement TARGET, and the pass limit (8) stops refinement at the measured tail the user already saw in the preview (backlog doc recorded "7.7 pc max in 569k") — accept; fix spec §4.1 wording in the final docs pass — cost if wrong: raise MAX_REFINE_PASSES and re-bake (+ size).
Task 3: mid-branch review dispatched (Opus); dispatch C (T5–8) dispatched from a1630a90b in parallel (disjoint files)
Task 3: review — spec ✅, binary layout verified; 1 Important: decode lacks byteLength check (truncated download → bare RangeError, trailing bytes pass; `< HEADER_BYTES` message lacks hint) — fix = one `byteLength !== expected` throw with REGENERATE_HINT + one test
Ruling 6: the Task 3 Important goes into the final fix wave, not an immediate fix round — dispatch C is committing in the same worktree now (shared index), and nothing downstream builds on length validation — cost if wrong: a truncated file fails with a worse message until the final wave lands.
Task 3: complete (commit 449196848, 1 Important carried to final fix wave per Ruling 6)
Task 3: minor (deferred): shellMeshFormat.ts:~87 f16 dtype with a Float32Array silently truncates — instanceof check
Task 3: minor (deferred): shellMeshFormat.ts:28 cites SHELL_VERTEX_FORMAT (verify it lands in Task 6)
Task 3: minor (deferred): ShellMesh.d.ts 5-line essay repeats module header; decode JSDoc narration line
Dispatch C done: T5 72a548885, T6 82f6c6a4e, T7 cb931f5e1, T8 a91de6f25. typecheck:fast + `npm run build` (WESL links) green; 178 targeted files / 1109 tests green. Implementer choices: separate @group(1) camera uniform (viewProj+eye, 80 B) beside the 96 B block; structs duplicated in vertex/fragment.wesl; asset priority 83; new LOCAL_BUBBLE_TINT data file + clampLocalBubbleIntensity util; expandFrameOrder.test roster updated.
Task 5: complete (72a548885; untagged)  ·  Task 8: complete (a91de6f25; untagged)
Tasks 6 + 7: mid-branch reviews dispatched (Opus), in parallel
Tasks 6 + 7 reviews running (Opus). Dev server restarted → background shell balh627sf (was bfg1oogtk).
Ruling 5 is PROVISIONAL: user will eye-check the 7.66 pc tail edges in the app before we accept it.
User can look now: run `npm run build-local-bubble` in the worktree, then open the dev server.
(dev server now http://localhost:5174, shell balh627sf)
Task 7: review — spec ✅ (fade reaches draw, default-on seed 0 fades in on arrival, missing file safe, Redux clean). Important → final fix wave: localBubbleOpacity.ts:3-4 stale "fadeAlpha is a plain 1 until Task 7" comment.
Task 7: complete (cb931f5e1, 1 Important carried to final fix wave, same reasoning as Ruling 6)
Task 7: minor (deferred): localBubblePass.ts:1-9 header 8 lines > 5, re-explains the guard
Task 7: minor (deferred): focusRecession.ts:53 stray blank line in table
Task 7: OPEN QUESTION for user: RECESSION_BY_KIND.localBubble = undefined (does NOT recede on object focus), where filaments recede — deliberate deviation from "filaments pattern"; ask at finish
Task 6: complete (82f6c6a4e, review clean — spec ✅, TS↔WGSL byte-exact, maths verified)
Task 6: minor (deferred): localBubbleRenderer.ts:1-23 header lacks byte-layout-exemption first line; cites renderTargets.ts:198 (line numbers banned), also ~l.127
Task 6: minor (deferred): localBubbleRenderer.ts:31-35 BYTES_PER_COMPONENT redundant (use BYTES_PER_ELEMENT); dtype-keyed pipeline Map surplus
Task 6: minor (deferred): localBubbleRenderer draw allocates two ArrayBuffers per frame — hoist scratch
Task 6: minor (deferred): localBubblePass draw re-checks opacity<=0 already gated by enabled
Task 6: minor (deferred): camera distance via distanceMpc(view.camPos, RENDER_ORIGIN_MPC) on an origin-relative position — use Math.hypot(...view.camPos)
Task 6: minor (deferred): Uniforms/Camera/VSOut structs duplicated across vertex/fragment.wesl — share a local io.wesl like mesh-body shaders
Task 9: complete (6a863f9be — DATA.md SHEL row + layout line; spec §4.1 edge-tail wording). PR description update still TODO at push time.
Final whole-branch review dispatched (Opus) over 85085237c..6a863f9be → writes final-review.md (numbered fix list). NEXT: ONE fix dispatch (Sonnet) from that list, one scoped re-review, push, PR description, report rulings + open questions (recession, edge tail) to user.
Final review: 0 Critical, 5 Important, 13 Minor (final-review.md). User rulings 2026-09-19:
- Release: user asked "isn't that a special case?" → answered: no, it's the generic loader contract (row `release` + slot `onRelease` = inverse of commit, as meshSlotRegistry does) → wire `onRelease: () => renderer.clearMesh()`.
- Preview tool: DELETE (plus the dead .f32 intermediate and d_inner/d_outer columns that only fed it).
- Recession: YES, recede like filaments (RECESSION_BY_KIND.localBubble = the filaments curve).
- Rename data/raw/localBubble/ → data/raw/localbubble/ (user moves main's gitignored FITS by hand afterwards) + fix horizonShellPass.ts "UV-sphere mesh" header in its own commit.
- Edge tail (Ruling 5): still pending the user's in-app eye-check.
Fix dispatch (Sonnet) dispatched with final-review.md + these rulings.
Fix wave done: 3d0056f10 release, e7779cb24 preview deleted, b7c041d96 recession, e5aec1b36 lowercase raw dir (case-insensitive APFS → no disk move needed, main too), 267b869c5 review cleanups (shaders merged into shell.wesl), 1cf22e721 horizonShell header. HEAD 1cf22e721, not pushed. Targeted 2078 tests green.
Scoped re-review (Sonnet) dispatched over 6a863f9be..1cf22e721. NEXT: adjudicate → push → PR description → report rulings; user bakes + eye-checks (edge tail still pending).
PR #755 updated; pushed 1cf22e721; re-review clean. NEXT: user bakes + eye-checks 4 open questions (PR body), then /feature-done.
c21d2f7c2 (user-approved): shell uses lib::camera CameraUniforms prefix in one @group(0) block (176 B); dropped @group(1) camera buffer. typecheck/build/432 tests green. Not pushed yet — awaiting user visual check.
f0f8c2633: user tuned approach band to 0.4–1 kpc (spec synced). Unpushed: c21d2f7c2, f0f8c2633.
Pushed cec013db5 (camera-uniform cleanup, 0.4–1 kpc band, backlog item layer-owned fade bands). NEXT: CI, remaining eye-checks (Milky Way readability, smoothing, 7.66 pc edges), then /feature-done.
Eye-check DONE 2026-09-19: reads vs MW yes, 2.5° smoothing right, 7.66 pc edges invisible → Ruling 5 ACCEPTED. c84f14c35 default OFF (user ruling), pushed. NEXT: CI green → /feature-done.
feature-done: full suite 1327 files/8961 green, tsc clean. Deletion audit → deletion-audit-branch.md (S1–S10 safe-now, R1–R8 needs-ruling). Safe-now dispatch (Sonnet) running. Rulings R1–R8 asked of user. Deferred items (Per-Tau, double wall, SKMH/glTF consolidation, 7 fade tables) not in backlog — asked.
User rulings (feature-done): apply R1+R2 (bake instrumentation, --smooth-deg, healNonFinite) and R6+R7 (fadeWindow.test, allowDataFile row test); KEEP R3, R4, R5, R8. Backlog: file SKMH/glTF consolidation + 6 fade registration tables; DROP Per-Tau + double wall. BACKLOG edits uncommitted pending safe-now agent.
Deletions: d6e86e7c2 safe-now S1–S10 (net −90), c6254ea61 R1+R2+R6+R7 (net −133). Completion commit: plan+spec → completed/, ledger archived, backlog lines (mesh formats, 6 fade tables, prettier trimmed). DONE pending merge on user's word.
