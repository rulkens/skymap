# Milky Way structures — PR 2 feature ledger

- Plan: docs/superpowers/plans/2026-10-05-milky-way-structures-feature.md
- Spec: docs/superpowers/specs/2026-10-05-milky-way-structures-design.md
- Worktree: .claude/worktrees/milky-way-structures-feature · branch worktree-milky-way-structures-feature · draft PR #852
- PR 1 (#844) merged as e566dd7aa.
- Rulings (ask VBrv, 2026-10-05): start; seed rows in parallel with clamp + card; keep `source` on the seed row; perf gate ON.
- Mid-branch reviews owed: Tasks 2, 3.
- Seed research runs as two background agents writing JSON fragments (no commits) to
  `.superpowers/sdd/2026-10-05-milky-way-structures-feature/seed-fragments/{open-clusters,globular-clusters,nebulae,galactic-centre}.json`;
  the controller's later dispatch merges them into the seed file as Tasks 4–7 once Tasks 1–2 have landed.
- Never bake in this worktree: public/data is a symlink to main's.

## Progress

- Dispatch 1 (Tasks 1–2) and both seed-research agents launched 2026-10-05.
- Star-cluster research done: 25 open (Hunt & Reffert 2024 r50pc/rtpc/dist50; Westerlund 1 from Navarete+ 2022, apparent = 3×R50, values partly from a fetch summary — re-verify) + 21 globular (Baumgardt db rh,l / rt, B&V 2021 distances). NGC 2419 rt = 735 pc (table value). Descriptions written from general knowledge — review before merge.
- Nebulae + GC research done: 22 nebulae (Zucker+ 2020 dust distances; Gaia EDR3 for planetaries; per-remnant papers; sizes SIMBAD/Sharpless/RCW/Green) + 3 GC rows (NSC 4.2 pc Schödel 2014; Arches 0.48/2.8 pc Hosek 2015; Quintuplet 1.05/3 pc Rui 2019). Soft spots: Coalsack 7° size from Wikipedia; Horsehead/Rosette/Carina use nearest Zucker sightline; Cat's Eye core only + weak parallax; Tycho 2.83±0.79 kpc; Kepler 5 vs 6 kpc; Cas A 3.4 vs 3.3 kpc. Two description numbers unsourced (Cygnus Loop age, Crab 1054).
- Task 1: complete (c9518e564). Task 2: complete (69f9d6023) — parser reviewed by controller, OK; NEBULA_KINDS is a hand list (audit candidate).
- Tasks 4–7: complete (827f439ba, a4b503af7, 4e0c398a7, 5777d1c3d) — merged by controller from the research fragments; deleted a category-count test in buildStaticAnchorStructures.test.ts. Pushed.
- Dispatch 2 (Tasks 3 + 8) launched.
- OWED to user: ruling on soft nebula distances (Orion/Horsehead 433 pc dust sightline vs ~390-410 direct; Tycho; Kepler; Cas A; Cat's Eye; Coalsack size) and a description review.
- Task 3: complete (40df1e669) — reviewed by controller: clamp in f64 packing, k scales pos + radius, pick shares buffer. Near-plane pinning NOT added (unverified whether a ring can sit inside the near plane; watch on screen). Task 8: complete (effb95fdb) — formatDistance already adapts to pc; no tooltip added.
- Orion fixed to 388 pc (Kounkel+ 2017, fetched) + names arrays collapsed + plan boxes 1-8 ticked: 40d127363. Pushed; CI run 37380249713 in flight.
- Dev server: http://localhost:5177 (task b4xwn8tbs).
- NEXT: Task 9 on-screen tuning with the user (smoke links in the plan DoD), then Task 10 (skill Path B + perf), final review, /feature-done.
- User smoke 2026-10-06: picking broke — near pick pipeline hard-coded depth24plus vs NEAR0 pick pass depth32float. Fixed ab6725890 (factory takes pickDepthFormat(slab); regression test). CI run 37500191658. Still awaiting the rest of the user's on-screen feedback (Task 9).
- CI green on ab6725890 (pick fix).
- Rulings (asks DWxG + svKi, 2026-10-06): focus dims EVERYTHING not part of the focused structure, all four MW categories, in #852; MW glow recedes on every focus (cluster focus too); constellation lines+captions, star names, body names recede; dimmed stars NOT pickable. Plan Tasks 11-14 added (4f178ac66). Dispatch 3 (Tasks 11, 12, 14, 13) launched.
- User finding 2026-10-06: globulars (M13, M22) sit on a radial finger of Gaia stars = per-star Bailer-Jones distance error at kpc range, not motion. NOT in #852. Offered a backlog item (snap cluster members to the cluster distance at star-build time; Vasiliev & Baumgardt 2021, Hunt & Reffert members) — user has not answered.
- Tasks 11 (479fff11c), 12 (ca35b2e2f), 14 (b8417f603), 13 (5bc1e5e80): complete. Controller reviewed the star shader diff: StarUniforms 112 → 144 bytes, vec3 at 112, f32 in its tail at 124, one packer (writeStarFocus) for visual + pick, reuse of focusAlphaMultiplier, FOCUS_PICK_EXCLUDE_BELOW shared with the galaxy shader. NOT GPU-verified by the agent; needs the user's eyes. starSpheresPass does not dim (resolved spheres).
- Backlog item for the cluster-star finger written (5d4ee8f21): docs/backlog/2026-10-06-cluster-member-star-distances.md.
- Comment nits 26c10f0d4. Pushed; CI run 37503245040.
- NEXT: user eye-check of dimming + tuning (Task 9); then Task 10 (skill Path B + perf), tick plan boxes 11-14, final whole-branch review, /feature-done.
- User 2026-10-07: dimmed stars were still hoverable/selectable. Cause: pickFrameContext derives a fresh snapshot with focus = ZERO_FOCUS (galaxy pick escaped this because it reads the GPU focus buffer). Fixed 4c68231d7: structureFocus.lastFocusUniforms() + pickFrameContext stamps it. Full suite green (15,371). CI run 37611278230.
- Still pickable while a structure is focused (not changed, flagged to user): star NAME captions (label pick) and resolved star spheres.
- Labels above MW rings: faf86eeb4 (+ 9fac6d3af import cleanup), pushed. labelPlacement on the style row, 8 px gap, aboveRingAnchor util, MARKER_RADIUS_RETUNE TS twin + parity test. Not GPU-verified (roll / non-default upBasis untested).
- 2026-10-07: main moved (#856 'octree star cut runs on the GPU' rewrote the Gaia star renderer) → PR CONFLICTING, CI not running. Merge IN PROGRESS in the worktree: controller took main's side for all star-catalog conflicts, so Task 13's survey-star dimming is gone from the renderer. Agent dispatched to (1) conclude the merge green, (2) re-implement the dimming + pick exclusion on the new GPU-cut renderer as its own commit. NOT pushed. After it returns: review the shader/layout diff, push, watch CI, ask the user to re-check dimming + pick + label placement.
- Merge concluded 9256a4302 (main through #856); survey-star dimming re-landed on the GPU-cut renderer 2ac3cd35f (StarUniforms 112 → 144, writeStarFocus, drawStarCut/drawStarPick rebase via cut.originMpc, new starUniformsLayout parity test). Pushed; CI run 37653234228.
- GPU-verified by controller with `npm run shot -- 'focus=open-cluster-pleiades' --url http://localhost:5177`: shader compiles, stars outside the sphere dim, card correct. FOUND: with the label above the ring, the focused structure's label is off-screen (the focus framing puts the ring's top outside the viewport). Flagged to user.
- 2026-10-07 rulings (ask PWvM): selected ring brightens by COLOUR (2786ec3e0, SELECTED_RING_BRIGHTEN 1.6; before/after shots sent as ask Wxok, unanswered); focused label falling off-screen is FINE, no change; dimmed stars' name labels not pickable (5f3ed7395 + fixture 'test: far-star director fixture').
- Wikipedia links on structure cards: e4e0f2c72 (field + card) + 2da106c6e (108/113 titles verified via REST; none for ophiuchus, shapley-a3558, a3571, cvn-i-cloud, ngc-6946-group). Link sits after the description (star/body cards put it before).
- Full suite green locally (15,333). PUSH FAILING with GitHub 'Internal Server Error' since 16:56Z; background retry loop running. Unpushed: everything after 2ac3cd35f. After push: watch CI.
- Docs sync ffba9aec5 + skill trailer fix 53b0c58e7; perf A/B vs main recorded in the plan (no attributable cost; hdr·NEAR0 slot unchanged). Scratch perf worktree + server removed.
- Selection brightening APPROVED by user (ask Wxok, all three shots pass, keep 1.6×).
- OPEN with user: hover highlight for structure rings (offered 1.3× + render wake on hover change; awaiting yes); Wikipedia link placement (after description vs before, like star/body cards).
- NEXT: final whole-branch review (dispatched), then smoke list, /feature-done (deletion audit), merge word.
- Final whole-branch review done 2026-10-07: no must-fix. Should-fix: F1 far clamp is INERT (NEAR0 reversed-Z has an infinite far plane) → delete Task 3's clamp; F2 near ring pick is a filled disc at true depth, rank vs star pick bands flips with orbit distance → controller ruling: ring band below all star bands, above MW backdrop; F3 above-ring label anchor misses the ring top off-axis (ring is eye-facing; lift must be perpendicular to the sight line). Optional: detached comments, focus constants parity (0.6 / 0.08), NEBULA_KINDS / LENGTH_UNITS derived, near/cosmo pass factory, dead constant-1 fade buffer. Fix agent dispatched (6 commits).
- Review items for the USER (not auto-fixed): globular apparentRadius = Baumgardt tidal radius → rings 2-3x wider than Harris-style, body ~1/40 of the ring at focus framing; westerlund-1 apparent = 3×R50 (constructed); coalsack size from Wikipedia; trumpler-14 (2390 pc) sits 100 pc outside carina's 76 pc sphere (2492 pc); body/black-hole captions dim but stay pickable; possible sky-cubemap bake mixing focus states (unverified, pre-existing for cluster focus).
- Review fixes landed + pushed: 64eb242bb (far clamp deleted), abb2f2c39 (marker pass factory), 79222b6af (near ring pick band 0.375e-4 via second fragment entry point fsRingPickBanded, ctor arg pickInStarBand), de8cdcec2 (ring-up anchor), a9ec8e262 (focus constants parity, derived NEBULA_KINDS / LENGTH_UNITS), d44d163c1 (comments, dead fade buffer). Draw verified by shot (M22); pick pipeline NOT GPU-verified.
- Rulings 2026-10-07: (ask DRJn) during ANY focus only what is inside the focused sphere is clickable, cluster focus too, sibling MW rings included; hover highlight for structure rings YES (1.3x). Agent dispatched for both (2 commits).
- USER REVERSED the F2 ranking: rings must win clicks over stars ('select structures first; labels already work like that'). Asked (4BJk) whether the whole disc wins except the focused structure's own ring (recommended) / always / ring line only. PENDING. After answer: raise the ring pick band above the star bands (pickDepthBands.wesl) + exemption per answer.
- Still open (ask 82Vi): globular ring size, Tr14 vs Carina, two weak radii, Wikipedia link position.
- Pick rule 79f682c28 (isPickableUnderFocus; rings carry a per-instance pickable float, stride 52 B; labels/captions strip pickId; procedural disc pick discards on focusDim) + hover highlight b15d76f0d (HOVERED_RING_BRIGHTEN 1.3, wake in watchSelectionWakeSaga for structure hover changes). Pushed; CI run 37664837539. Shot renders without page errors; real click behaviour NOT verified — needs the user.
- Unfiltered pick paths during focus (reported to user): planet/Earth/mesh sphere picks, body glints, Milky Way impostor/backdrop pick.
- 2026-10-08: user repeated that stars must not be in front of MW rings in the pick buffer. Flipped: PICK_BAND_STRUCTURE_RING_EPS 0.375e-4 → 2.0e-4 (above scene + survey star bands, below glints), dd8b0d83b, pushed, CI 37758042851. Whole disc wins whenever the ring is visible; NO focused-ring exemption added (ask 4BJk unanswered). Caveat told to user: a curated star nearer than ~half the orbit distance keeps true depth and still wins; inside a visible ring, stars are not clickable.
- 2026-10-08: merged main (#853) → 57fcb7eac, suite green (15,380). Hovered structure LABEL whitens (HOVERED_LABEL_WHITEN 0.6) 3c469e80a; open-cluster colours muted (#A3B3D1 / #7B8AAD / #7B8AAD38) 6f598c552. Pushed, CI 37758465193.
- Still open with user (asks 82Vi + 4BJk): globular ring size, Tr14 vs Carina, two weak radii, Wikipedia link position, focused-ring pick exemption. Then: spec/plan sync for the post-review changes (pick rule, hover, ring-over-star), /feature-done (deletion audit), merge word.

## State at compaction (2026-10-08)

- Branch worktree-milky-way-structures-feature, HEAD 6f598c552, pushed, tree clean, CI GREEN on it (run 37758465193). Draft PR #852. Includes main through #853.
- No background agents in flight. Only the dev server: http://localhost:5177 (task b4xwn8tbs); leave running.
- AWAITING the user (do not act on these until answered): ask 82Vi — globular ring size (tidal radius vs a few half-light radii vs split), Trumpler 14 vs Carina distance, two weakly sourced radii (Westerlund 1, Coalsack), Wikipedia link position (after description now; star/body cards put it before). Ask 4BJk — focused-ring pick exemption (NOT built; whole disc wins whenever the ring is visible). Hover highlight was answered YES and is built.
- AWAITING the user's eyes after a reload: ring-over-star click priority, 'only inside the focused sphere is clickable', ring + label hover highlight, muted open-cluster colour (judge on an UNSELECTED ring), label-above-ring off-axis. None of the pick behaviour is GPU-verified by the controller (shots only prove the shaders render without page errors).
- Remaining before landing, in order: (1) apply the user's answers; (2) sync spec 'Decided during review' + plan for the post-review changes not yet in the docs: far clamp removed, marker pass factory, pick rule (isPickableUnderFocus, per-instance pickable float), hover highlight for ring and label, ring pick band ABOVE the star bands (2.0e-4), muted open-cluster colours, smoke list items; (3) /feature-done with the deletion audit (frame as 'a less careful model wrote this, surplus presumed'); (4) once-per-PR line-diff breakdown (code/comment/test/doc); (5) the user's explicit merge word naming #852, then mark ready, squash-merge with --repo (never from a worktree checkout), /wt-close.
- Verification recipe that works here: `npm run shot -- 'focus=<id>' --url http://localhost:5177 --size 1280x720 --dpr 1 --hide-ui` writes data/shots/*.jpg (gitignored); before/after pairs go to the user through ask_user check questions with attachments.
- Worktree guard: no compound commands with shell variables, heredoc + git, subshells, or cd; use scratchpad Node scripts for multi-file text edits and `git commit -m ... -- <paths>`.
- If main moves: merge origin/main, npm run typecheck + full npm test, push, watch CI (gh run list --branch … then gh run watch <id>). #856 rewrote the Gaia star renderer once already; star-catalog conflicts are resolved by taking main and re-landing the focus fields on StarUniforms (see 2ac3cd35f).

## State 2026-10-08 afternoon (supersedes "State at compaction")

- HEAD aadd8d550 pushed; includes main through #864 (light-time spheres). CI green on 59725ac3f; aadd8d550 is docs-only.
- Built since compaction: selected label whitens (0.9); nested ternaries removed; naming change (scale: 'cosmic' | 'milkyWay' replaces slab + galaxyMembers; ids galaxy-cluster / galaxy-group; Source.GalaxyCluster / GalaxyGroup; labels; settings split Cosmic / Milky Way, heading spacing approved on a shot).
- User rulings: old #focus=cluster-… / group-… links break, no redirect; Labels & Guides stays flat; hover look approved.
- Spec §11 synced with all post-review rulings. Plan not yet re-read for stale slab/galaxyMembers wording.
- Still open with the user: ask 82Vi (globular ring size, Trumpler 14 vs Carina, Westerlund 1 + Coalsack radii, Wikipedia link position), ask 4BJk (focused-ring pick exemption), eye-check of ring-over-star clicks and inside-sphere-only clicks.
- Note: light-time spheres declare "stays put under focus" in focusRecession (main's choice); not dimmed by structure focus.
- Panel screenshot recipe: scratchpad panelshot.cjs (playwright via createRequire on the worktree package.json, dispatchEvent('click') on the section title).
- Next: answers → /feature-done (deletion audit, line-diff breakdown) → merge word naming #852 → squash-merge with --repo → /wt-close.

## State 2026-10-08 evening (supersedes the afternoon state)

- HEAD d7cbe495a pushed, CI run 37813647706 watching. Tree clean.
- Cleanup done: deletion audit + quality review (no must-fix), 26 items applied (-407 lines net), then four rulings: category id galactic-centre -> gc-cluster (place id untouched; Source.GcCluster, code 36), RING_PICK_MIN_ALPHA 0.1 (faded ring stops taking clicks), labelPlacement deleted (derived from scale), lineOfSightAssumed deleted.
- User rulings today: globular rings stay tidal; Carina at Trumpler 14's distance; weak radii flagged in source; Wikipedia link before description; no focused-ring exemption; overlapping rings resolve by draw order; bodies/glints/MW disc pickable during focus = recorded known gap; selected label whitens on selection.select (same field as the ring).
- All recorded in spec section 11. Backlog added: docs/backlog/2026-10-08-label-hover-selected-highlight.md.
- Kept on purpose after audit: StarFocusSphere type, the cluster-member-star-distances research note, constant file placement.
- Not eye-checked by me: reshaped ring renderer (slab arg) and caption pick strip in composeForegroundCaption; faded-ring click rule.
- Flake: one full npm test run showed 6 failures for an agent, two reruns and mine were clean; unidentified.
- Next: user eye-check -> /feature-done (line-diff breakdown; deletion audit already done today) -> merge word naming #852 -> squash-merge with --repo -> /wt-close.
