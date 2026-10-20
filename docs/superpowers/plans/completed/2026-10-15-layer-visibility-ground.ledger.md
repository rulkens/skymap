# PR 1 ledger: layer visibility ground prep

Plan: docs/superpowers/plans/2026-10-15-layer-visibility-ground.md. Branch worktree-layer-declared-fades, draft PR #903. Docs commit 92349268a on main 7ab7ec0fd.
Rulings log: .superpowers/grill/2026-10-13-layer-declared-fades-rulings.md.

- Group A (tasks 1-4, Opus, bg, in this wt): DISPATCHED 2026-10-15. On return: mid-branch review of tasks 2 + 4 (diff + task contract + spec section), one fix round; then dispatch group B.
- Group B (tasks 5-8): queued.
- Then: whole-branch review (Review Focus + entanglement-radar, no deletion audit), CI gate, pixel-identical shot pairs (main vs branch) as dash checks, then the merge ask alone.
- Docs PR #904 (branch docs/layer-declared-visibility = commit 92349268a, user: separate docs PR). #903 still carries 92349268a underneath group A's commits; after #904 merges, merge main into #903 (add/add conflict on the plan file from checkbox ticks -> take the branch version).
- #904 MERGED 32712c3b6 (2026-10-15). After group A returns: merge main into #903.
- Group A DONE: T1 01454abbd, T2 0295e30b4, T3 4eb9593a1+4730da15b, T4 aaf395bbf; main (incl #904) merged in, pushed. Mid-branch review of T2+T4 DISPATCHED (read-only); CI watch running. On review return: one fix round, then group B.
- Review T2+T4: one nit (missions header), fixed inline fab58f882. Group B DISPATCHED (tasks 5-8, Opus, bg). On return: mid-branch review of T6+T8, fix round, then whole-branch review, CI, pixel A/B shots (main vs branch: #focus=body-sun, #exhibit=voyager-missions, a galaxy view, Labels & guides panel).
- A/B: temp checkout of main at .superpowers/ab-main (git worktree, detached 32712c3b6; node_modules + public/data symlinked). REMOVE after shots: git worktree remove .superpowers/ab-main
- Group B DONE: T5 9145bcbd9, T6 28547dbd8+da69d2f70, T7 632d3e65b+474ab2067, T8 7c46f6a49; greps clean, tsc clean. Combined review (T6+T8 deep + whole-branch) DISPATCHED. Dev servers: branch :5178, main :5179 (.superpowers/ab-main). Shots in scratchpad/ab; noise floor main-vs-main is large (Sun 58, M31 144, Earth 166, Voyager 33); branch diffs under noise except Voyager 199 (looks identical). Dash ask 2pKT: 4 A/B checks + operable checks.
- Whole-branch review: no bugs; 2 should-fix (shader console box unticked -> verified by headless shots, ticking; star-sphere inner/outer test names can't fail, reliefM [0,0] -> rename) + nits (frameContext settings capture, sourceMaskOf header 34 lines, sampledBodyIds comment budget). Fix round DISPATCHED (Sonnet). Then CI watch, A/B verdicts (ask 2pKT), merge ask alone.
- Fix round DONE 7e5f02988, pushed. CI watch running.
- CI RED on group B + fix commits: 1 test, tests/visual/renderFrameSplitBaseline.test.ts (fixture lacked galaxyCatalogs.items; the point pass now derives its own mask, V3). Fixed 03eb351cd (makeGalaxyCatalogItems), passes locally; CI watch running.
- CI GREEN on 03eb351cd (run 38734870440). Waiting: A/B verdicts (ask 2pKT). Then merge ask alone.
- A/B + operable checks PASSED by user (ask 2pKT, all identical). Diff: code 103 files +529/-432, shader 4 +20/-16, test 66 +518/-394, doc 2 +37/-35. NEXT: merge ask (alone).
- nearSpheres REVERTED: 5ebb14a73, 1c4603e33, f99a8d00e (M2 test fix restored); tsc clean, targeted green. Re-shot A/B: Sun max d4; Voyager diff = side-panel text 1-2 px. Dash ask mVMT (Sun after revert), rsQe (planner fade? consent). Docs agent running. Main moved (#905-907): merge main in after docs agent, then CI, then merge ask.
- Docs agent DONE: PR 2 Task 7 'Stars join core's scene-body partition' (uncommitted in PR 2 plan + spec). MY CONCERNS to raise at PR 2 start (not yet asked): star rows vs body rows have different shapes (+starSpheres/starPoints branches); SCENE_STAR_ROWS in src/data/bodies names 'starCatalog' (core data names a Layer key); planets visibility:null; ReadyFrameContext.sceneBodies unruled; a clipped-to-0 star still occludes. PR 1 plan commit a644b00ce; main merged e3204d8e4 (tsc clean); pushed; CI watch running.
- CI GREEN on e3204d8e4 (run 38741182779). Waiting on dash: mVMT (Sun A/B after revert), rsQe (planner fade? consent). Then merge ask alone.
- Sun A/B after revert PASSED (mVMT). Merge ask sent.
- #903 MERGED dc3c2cddc (2026-10-15). Cleanup: ab-main worktree removed, main dev server stopped, remote branch deleted. Wt now on new local branch layer-declared-visibility (from dc3c2cddc) carrying uncommitted PR 2 plan + spec edits. PR 2 NOT started: first grill Task 7 (star/body partition design concerns) + planner fade? consent (ask rsQe pending). Branch dev server :5178 still up.
