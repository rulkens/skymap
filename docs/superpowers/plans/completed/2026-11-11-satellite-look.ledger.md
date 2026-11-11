# SDD ledger — plan: docs/superpowers/plans/completed/2026-11-11-satellite-look.md

Spec: docs/superpowers/specs/completed/2026-11-11-satellite-look-design.md
Branch: worktree-satellite-look-sunlight-colours-glints, BASE 1674cef62. Dev server :5173 (this worktree).
Protocol: docs/superpowers/conventions/sdd-execution.md. Dispatches: D1 T1-2, D2 T3-4 + review, D3 T5-6, final review.

Ruling: serial dispatches in this one worktree — owner AFK, sdd-execution's parallelism question has one sensible answer here — wasted time only.
Ruling: perf gate runs — CLAUDE.md requires before and after for shader changes — one extra perf run.
Ruling: panel area for OneWeb, Kuiper, Qianfan, Guowang is the 3.88 m² default — no public figure exists — those groups' brightness is approximate.
Ruling: dropped the per-row attitude `axis` from the signed-off shape — orbit normal covers LEO and GEO alike, so the column would never vary — a later per-group attitude adds a column.
Ruling: DEB token and R/B token rules added to group assignment — the daily file can carry them under active — one line each.
Ruling: no draft PR until the branch is verified; merging stays with the owner — CLAUDE/feedback rule — none.

Perf baseline (satellites temporarily on, earth-surface, 60 frames, before any code): TOTAL merged 13.6 ms; satellites ≈ 0.5 ms real. File: scratchpad/perf-before.txt in the session scratchpad. Recipe: sed `enabled: false` → true in state/satellites/initialState.ts and epochFullDays/epochGoneDays → 300/400 in points/data/satelliteFades.ts, run `npm run -s perf -- --url http://localhost:5173 --scenario earth-surface --frames 60`, then git checkout both files.

Preflight scan, tasks sharing files or interfaces:
| Pair | Produced vs consumed | Found |
| --- | --- | --- |
| T1 / T5 | DebugColorRow props | agree |
| T2 / T3 | SATELLITE_PROFILES, capacity, satelliteProfileCodes | agree |
| T3 / T4 | io.wesl, vertex.wesl, renderer; T3 leaves `color` unread, T4 renames it | agree |
| T3 / T5 | writeProfiles, packSatelliteProfiles; frame.ts both edit | agree |
| T4 / T5 | SATELLITE_POINT_STYLE.color: T4 stops using it for uniforms, T5 deletes it | agree |
Each task's own text agrees with itself. Scan clean.

D1 (T1-2): model sonnet, 1674cef62→2fa96f74e, done.
Task 1: complete (9f8fd05f7)
Task 2: complete (2fa96f74e)
D2 (T3-4): model opus, 2fa96f74e→990b02ec2, done.
Task 3: complete (f6930520d)
Task 4: complete (990b02ec2)
T3-4 mid-branch review (opus): no Critical/Important. Minor to apply in tuning pass: eclipse residual is multiplied by phase, so it fails on the night side (use mix(ECLIPSED_RESIDUAL, phase, lit)); rewrap satellitePointRenderer.ts:4; SatellitePointRenderer.d.ts:3 omits profile.
Ruling: follow the spec on the eclipse residual, not the plan's formula — the spec's intent is that an eclipsed object is not lost entirely — the night-side wedge is slightly less black.
D3 (T5-6): model opus, 990b02ec2→80bc04db9, done.
Task 5: complete (079f0d1f7)
Task 6: complete (80bc04db9)
Controller inline: 6abdbe9de (eclipse residual + comment wraps), 05bc095e4 (docs debug section row, caught by full suite).
Perf after (same recipe): TOTAL merged 14.9 ms vs 13.6 (p90 21.3 vs 22.2); satellites ≈ 0.6 ms vs 0.5 real, per-layer row 1.6 both. Neutral within the harness's stated noise.
Full suite at 6abdbe9de: typecheck clean; 33284 passed, 1 failed (docsProject, fixed in 05bc095e4, rerun alone passes).
Final review (opus) 055db260b..6abdbe9de: 1 Important (copy output not pasteable), 7 Minor. All sent to one fix dispatch per sdd-execution; no re-review.
Ruling: all eight findings accepted — each is defensible from the code and cheap — none.
Fix dispatch: model sonnet, 05bc095e4→9147b8817, done, 8 of 8 applied.
Full suite at 9147b8817: typecheck clean; 33286 passed, 1 skipped.
Ruling: stopped before pushing — the owner asked to implement, not to push or open a PR — one word to continue.
Owner request: ambient slider. Dispatch opus, 9147b8817→d4c23a3af; spec commit after. Slice renamed satelliteColors → satelliteTuning { colors, ambient }; ECLIPSED_RESIDUAL replaced by uniform ambient (default 0.04), diffuse = ambient + phase·lit.
Ruling: ambient replaces the eclipse residual rather than adding a second floor — one knob, same default look — sunlit dots gain 0.04, invisible.
Ruling: slice restructured into one cluster per section instead of a second slice — matches the lensing precedent — a dozen-file rename.
Owner request: dot size slider (0.5-30 px, default 2), controller inline dc5af6c90. SATELLITE_POINT_STYLE → SATELLITE_PICK_RADIUS_PX (8); pick footprint = max(8, dot). Sliders share setSatelliteSlider({ key, value }). Targeted tests + typecheck green.
Owner approved plate glint + twilight tint: controller inline 7f8546fe3 (plateGlint, sunlightTint in illumination.wesl; plate gated by glintGain, PLATE_PEAK 8, no table column). Ambient default 0.45 per owner, d668b5db0.
Ruling: plate reuses glintGain rather than a new column — every glinting group is treated as having a flat body — Starlink and a GEO bus flash alike.
Owner request: no fade after the fetch, age chip on the card past 14 days, brightness note as a row; inline 00024c244. Fade keys are now pastFullDays/pastGoneDays, so the perf recipe no longer needs the epoch widening for a live-clock pose.
RESUME HERE: awaiting the owner's smoke checks and go on pushing a draft PR (dash). Then /feature-done, ledger archive, CI watch; merge only on "merge this PR".
D2 deviations reported: binding 2 VERTEX-only; lambertPhase floors at 0; 1 km minimum penumbra; EARTH_RADIUS_KM 6378; vertex constants in vertex.wesl.
Owner smoke p2R2: all five pass; push go. Draft PR #1123. Main merged in (34e7ba9a9).
Deletion audit (opus): safe-now 4 of 5 applied in 73c3e0bb0 (kept the exact-string copy test, the only two-row join check); R1-R4 (about -60 LOC) asked in the dash.
Full suite on merged tree: 33334 passed, 1 failed (noStoredRegimeFlag, untouched area, passes alone: load flake); typecheck clean.
DoD audit READY; completion moves follow.
