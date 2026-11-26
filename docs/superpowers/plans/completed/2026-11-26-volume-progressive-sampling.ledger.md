# Progressive volume sampling — SDD ledger

Plan: `docs/superpowers/plans/completed/2026-11-26-volume-progressive-sampling.md` (on branch `feat/volume-progressive-sampling`, draft PR #1175, base main 61e001926, plan commit cacab8210).
Controller session works from the spike worktree `volume-progressive-octree`; implementers run in isolated worktrees on a local branch tracking `origin/feat/volume-progressive-sampling` and push `HEAD:feat/volume-progressive-sampling`.

## Owner rulings (ask oqtQ, 2026-11-26)
- Mask delivery: the Layer fetches it itself (no Layer contract growth).
- Mask source: build our own (NVIDIA STBN licence forbids bundling).
- Shots wait for convergence only when the view is still.
- Rays: keep today's back-face cube draw; no full-screen pass.
- Build it.

## Dispatches
- D1 (opus): Tasks 1–4 — mask builder + bin, jittered march + deps bag, Layer loads mask, decay draw. — COMPLETE (7aa961fff, 28e5176ec, 6a09de568, 34e01a998, follow-up 432a8c557; suite green locally; nothing run on a GPU yet)
- D2 (opus): Tasks 5–7 — per-tier tables, pure planner + key, planner wired in; plus fix: mask writeTexture after Layer teardown. — COMPLETE (721c12477, 5123ec90e, 78b0a390c, f0d78914b; suite green locally). Task 7's shot/dome/Memory checkbox left for the controller (Task 10).
- D3 (sonnet): Tasks 8–9 — trim fix, RENDERER.md. — COMPLETE (10e865f29, 19f7df024; suite green locally; no test for Task 8 per plan)
- Task 10 (controller): wall-clock A/B bench, converged image check, dolly registration 600/2000 Mpc, dome faces, owner dash checks.
- Then: whole-branch review, /feature-done, merge ask.

## Findings to carry
- D1 deviations: decay shader split into vertexDecay.wesl + decayFragment.wesl; golden-ratio shift computed in u32; site copy for build-blue-noise-mask row (owner may reword).
- Whole-branch review: /comment-audit on volumeFieldRenderer.ts and fragment.wesl (over budget before the branch).

- D2 adjacent: retained target sized from the canvas per dome face (confirm in dome Memory check); nothing enforces 'reallocation implies restart' for retained targets (ask owner: guard or backlog).

## Whole-branch review (done, CI green at 19f7df024)
No must-fix correctness bug; math, restart/clear pairing, key coverage, multi-view, settle gating traced clean. Fix agent dispatched for: (1) failed mask fetch kills the volume for the session → retry + size check + resolve with warn; (2) delete golden-ratio cycle shift (breaks the toroidal 16-slice spread, buys nothing at cap ≤ 16); (3) stale/over-budget comments.

Review fixes COMPLETE: d5c9369ee (mask fetch retry + size check + resolve with warn), b3cd56a36 (cycle shift deleted; JITTER_INDEX_WRAP = slices × 62_500), 980b79b86 (comments). Tip 980b79b86, suite green locally.

## Task 10 interim (2026-11-26)
Timing while moving, main → branch (vsync-quantised, rounds 2–5): medium ≈ 0–2%; small −43..−50% (64 steps); LARGE +5–10% (inside K=64 77.3 → 85.3 ms). OWNER RULING: "10% regression is noted, but not that much of a problem for large tier" — accepted, not a merge blocker; record it in the PR body. Agent scope cut to: rest, converged image, zoom registration, before/after pairs. Items 6–11 (restarts, dome, shots, trim, mask failure, console) OWED → fresh agent.

## Task 10 results, items 1–5 (measuring agent, vs main 61e001926, vsync-quantised slopes, 4 rounds)
- Moving, ms per extra draw pair, branch/main: medium inside 1.058, medium 600 Mpc 1.093 (FAILS plan's ≤ +5%), large inside 1.096, large 600 Mpc 1.115 (owner accepted ~10% on large), small 0.52 / 0.50. Unverified hypothesis: blue noise hurts texture-cache locality on big cubes (mask read itself is free: small is exactly half).
- At rest: 15 march draws after a stop then 0; idle heartbeat same as main; accumulation frames no dearer than moving frames. PASS.
- Converged vs mean of 16: RMS 0.09–0.32 (pass ≤ 0.5); brightness 0.994–0.996 of main. PASS.
- Both fields: MCPM-only ratio 1.001. PASS.
- Registration branch vs main at 600 Mpc: ≤ 0.013 px, tiles 0.07–0.09 px. PASS. 2000 Mpc not measurable (volume does not draw there on either side).
- Pre-existing bug (also main): tier → large in headless gives 'Maximum update depth exceeded' on mcpm/2mrs loads; needs up to 7 forceReload. Not ours; ask owner fix/backlog.
- Pairs for the owner: .claude/desk/volume-progressive/ (links.md). Missing: trim 0.5 pair, no-galaxy grain pair.
- OWED: items 6–11 (restarts, dome+memory, shots under auto-rotate, trim, mask failure, console) — fresh agent dispatched; scripts restarts.mts, dome.mts, shots.mts, mask.mts in the session scratchpad.

## OWNER RULING 2026-11-26 — moving cost accepted on ALL tiers
"yes this is totally acceptable. we have way better visuals now with basically similar performance" (asked about +0.05..+0.10 ms/frame on medium; large +0.08..+0.50 ms accepted earlier). Not a merge blocker; state the numbers in the PR body. Per frame, both volumes, 1600×900, main → branch: medium inside 0.82 → 0.87 ms, medium 600 Mpc 1.07 → 1.17, large inside 0.86 → 0.94, large 600 Mpc 4.34 → 4.83, small 0.85 → 0.44 / 0.74 → 0.37. Frame rate unchanged at 120 fps on the Mac.

## Closed (2026-11-26)
Owed items 6-11 ran and passed; the full numbers are in the plan's Results section and the PR body.
/feature-done moved plan and spec to completed/. Open follow-ups are on the backlog: retained-target
reallocation must restart accumulation; large-tier switch fails in headless.
