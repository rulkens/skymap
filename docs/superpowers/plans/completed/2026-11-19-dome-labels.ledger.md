# dome-labels ledger
Plan: docs/superpowers/plans/2026-11-19-dome-labels.md
Rulings 2026-11-19: mask now (spec D9), upright bounds for declutter, start. Perf gate: yes (M3, D1). Parallelism: 1.

Dispatch 1 (A1-A3, B1-B2, C1): in flight
Dispatch 1 (A1-A3, B1-B2, C1): complete (e18e47497 6979d8ef4 c39133ba8 b1a57943a a69071243 428f4e14f). WGSL not GPU-compiled yet.
Controller calls: near-hide by distance (drop depthMpc); equidistant radius per axis (resample is an ellipse on non-square canvas).
Dispatch 2 (fix1, fix2, M1, M2): in flight, same agent
Dispatch 2: fix1 958a7cf69, fix2 ccb2dc910, M1 72a85cdf6 complete; M2 blocked on per-face layer routing (ask p1q5 open: ViewSpec.layer). M1 note: pass not in CONTENT_PASSES until a program lists it; stale-mask risk when foreground:0 not drawn.
Dispatch 3 (M3 measurement, scratch only): in flight
Dispatch 3 (M3): measured, nothing committed. earth-surface mask pass 0.7-2.0 ms floor-subtracted, MERGED +0.5..1.7 ms (inside 3 ms drift); solar-system pass off (no foreground:0); 66.4 MB at 4K. No wall-clock probe run. Files: scratchpad/m3/. Ask Kx (viewspec-layer + mono-mask) open; closes p1q5.
Rulings 2026-11-19 (ask 7LwD): ViewSpec/FrameView gain layer?: number; M3 = two sources (mono keeps sampled depth, dome mask variant).
Dispatch 4 (layer contract, M2, M4, C2, GPU shots) : in flight, fresh agent
Dispatch 4: complete — caa457aba (layer), e8a9594e9 (M2), 9bf2d4238 (M4), 8dc527689 (C2), 414d01513 (plan P3). New step field mask:{sample}; occlusionMaskPass always enabled, early-return draw; canvas is boxed square by CSS on the dome. UNPROVEN: mask distance verdict. Draft PR #1145 pushed, CI watch in bg.
Dispatch 5 (verify: mask verdict pose, C3 shots, D1 perf): in flight, fresh agent
Ruling 2026-11-19: option 2 — widen each label by theta/sin(theta) at its anchor (plan Task B3). Dispatch after verify agent finishes (same tree, shots in progress).
Ruling corrected 2026-11-19: option 3 (glyphs on the sphere). Controller design: tangent card at the anchor, per-corner projection (labelCornerPx + unprojectLabel); replaces rotatedBoxBounds. Dispatch after verify agent.
CI green on 414d01513.
Dispatch 5 (verify): done, nothing committed. Mask distance verdict HOLDS on dome (Hubble mesh pose). Found: leader vanishes at pxScale 0.75; size fade uses short side (180deg on dome) + lift crosses zenith. No main server -> no mono pixel diff, weak perf comparison (mono GPU label rows 0.3-0.7 ms, CPU 0.08-0.14 ms; no mask/dome pass in mono). Files: scratchpad/verify/.
Dispatch 6 (B3 tangent card, leader floor, fill fade + lift cap, final shots): in flight, fresh agent
Dispatch 6: complete — 4bc92fd4b (B3 tangent card), d003feae0 (leader >= 1 px), ddc5ac394 (fill fade + lift cap). Pushed ddc5ac394; CI watch in bg. Shots in scratchpad/final/. Open with owner: dome crops checks, mono wide-lens fade (changed above 60deg lens), dome text size. Unshot: mono lift past view-up now visible off-top (leader to screen edge?).
Remaining: owner answers -> small fix dispatch; D2 docs; whole-branch review; /feature-done.
CI green on ddc5ac394. Owner (ask RaGq): 4 dome checks PASS; wide-lens mono fade stays as built; dome text 1.5x.
Dispatch 7 (dome text 1.5x, mono lift-past-up check, D2 docs): in flight (agent ad1c)
Dispatch 7: complete — 08d735efd (dome 1.5x), 345c16e37 (pinhole lift past view-up hides, reasoned not shot), 3a5b8f205 (docs D2). Pushed 3a5b8f205; CI watch in bg. Leader faint at 1.5x -> ask open (leader-rule). Whole-branch review: in flight (fresh, read-only).
Remaining: review fix round; leader ruling; /feature-done (plan+spec moves, ledger archive, deletion audit); then merge ask.
CI green on 3a5b8f205.
Whole-branch review: done. BUG: liftedAnchor px-floor push crosses zenith (confirmed by reviewer). Leader 1.25 threshold unsound (ask Yk96 open). Mono builds mask pipelines eagerly. Dome mask memory 233 MB at 2205, unpriced. Slop list (gate, text-grep tests, comment budget, loop).
Dispatch 8 (review fix round + dome mask pricing): in flight, fresh agent. Leader rule excluded pending ruling.
Dispatch 8: complete — HEAD a23c93580 (zenith px-floor clamp, lazy mask pipelines, slop). Review claim on dome-occlusion gate was wrong (DebugPanel disabledPasses) — gate kept. Dome mask price (headless Mac, 2205^2): +3.4..4.8 ms on ~85 ms (4-5%), 233.4 MB of 788.8 MB GPU. Pushed; CI watch in bg. Ask replaced: leader rule, 1.5x text check, mask cost.
CI green on a23c93580. Owner: try half-size mask (ask ehc8 still open for leader rule + 1.5x check; mask-cost answered in chat as a trial). Dispatch 9 (half-size mask trial, one unpushed commit, shots + numbers): in flight (agent a480).
Owner (ask ehc8): leader = one rule, full brightness everywhere; 1.5x text PASS; mask = half size. Queued to agent a480 after the half-size commit.
Dispatch 9: complete — 6e594fba4 (half-size mask: 58.3 MB, 1.7-2.0 ms), 675457efb (leader quad = max(width, 2)). Pushed 675457efb; CI watch in bg. Ask open: half-mask edge check, mono dpr1 leader check.
Dispatch 10 (mono vs base pixel diff + A-B perf, scratch worktree base-wt): in flight, fresh agent. Closes the two open DoD lines.
Then: /feature-done housekeeping (plan + spec -> completed, ledger archive, fix viewRigs.ts spec path comment + RENDERER refs), memory, merge ask.
CI green on 675457efb. Owner (ask DSpX): half-mask edge PASS, mono dpr1 leader PASS.
Dispatch 10: done. Mono vs base d4051fb77: dpr2 identical bar 4 px glyph edges at star-field (unexplained, tiny); dpr1 leaders only. Perf: GPU inside spread; CPU labels:near0 +0.02-0.035 ms. Scratch worktree removed.
/feature-done: READY; plan + spec moved to completed, ledger archived.
