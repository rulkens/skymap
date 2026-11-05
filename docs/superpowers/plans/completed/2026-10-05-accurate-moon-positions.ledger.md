# SDD ledger — plan: docs/superpowers/plans/2026-10-05-accurate-moon-positions.md

Setup 2026-10-05: lean SDD (user cQgq), perf gate SKIPPED, parallelism 1 (serial, this wt). Prep branch `accurate-moons-prep` off origin/main ea9dafa88; spec+plan commit 0cace59b5. Feature branch `accurate-moons` stacked later.
Dispatch grouping: D1 = Tasks 1–2 (prep, opus: T1 review:yes); D2 = Tasks 3–5 (feature, opus: T4 review:yes).
Moon Horizons cache from measurement (f64, not CSV) in session scratchpad `moons/` — not reused by the tool; T4 fetches fresh.
D1 Tasks 1–2 opus, 0cace59b5→6d0eae99b (T1 5365db1c0, T2 6d0eae99b), DONE, 95 tool uses. Deviations: fixture nests only orbit.meanAnomalyRad (no regen script exists); 1-ch fit test tol 5e-4×amp (fitter single-pass ω refine, planets must stay bit-identical); HorizonsBody.d.ts (convention test); raw CSVs → data/raw/horizons/500@10/. Planet literals 3811/3811 identical.
Ruling: accept all 4 deviations — each forced by an existing constraint (no regen script / planets unchanged / convention test) — cost if wrong: a looser 1-ch fit pin.
Adjacent: stale planet plan+spec at docs/superpowers/{plans,specs}/2026-10-04-accurate-planet-positions*.md on main (duplicates of */completed/) — ask user.
T1 mid-branch review opus: CLEAN, 2 comment nits fixed inline + stale planet plan/spec copies deleted (user "yes delete") → 7ec118623. Prep PR #843 DRAFT pushed. Feature branch `accurate-moons` created at 7ec118623. NEXT: full-suite gate result (bg) → dispatch D2 (Tasks 3–5, opus).
Prep local gate: full suite 1452 files / 15172 tests GREEN at 7ec118623. User "pr looks good" (#843) — NOT a merge word. D2 Tasks 3–5 opus dispatched on `accurate-moons` from 7ec118623.
D2 Tasks 3–5 opus, 7ec118623→9689a0a58 (T3 45f5a8d9c, T4 58f9e44eb, T5 9689a0a58), DONE. 158 phase + 84 cart terms, all moons ≤ 896 km; +17.5 kB source. Deviations: minute steps + ≤89k-row pieces (Horizons cap); Iapetus fitStep 2 d (10 d aliased Titan); periodKind required on all satellite rows; fixture test no barycentre allowance (offsets 220/312 km noted); trail body-on-orbit 5e-7·a (f32 staging); rides-parent test Io→Phobos; golden traces unchanged; build tool ~50 min.
Ruling: accept all — each measured/forced — cost if wrong: slow regen only.
Ruling: T4 mid-branch review folded into the final whole-branch review (same diff, one seat) — cost if wrong: none, final review gets T4 contract explicitly.
Feature local gate: full suite 1453/15180 GREEN at 9689a0a58. Feature PR #846 DRAFT (base accurate-moons-prep). Final review running.
Final review opus: APPROVE, no bugs; 6 findings. Fix round (sonnet) dispatched for #1 sidereal-helper header, #2 unreachable throw in orbitTrailsPass, #3 narrow satellite→moonRatesFromPeriods args, #6 JSDoc wrap.
Ruling: #4 (moon inferred from focusId !== 'sun' in build tool) kept — documented, an explicit field is a knob — cost if wrong: one extra field later. #5 (reflex secondary propagated without ΔM) kept — no paired secondary has a correction — cost if wrong: wrong Earth reflex only if the Moon ever gets a ΔM row.
feature-done audit started at 98eff95b5: deletion audit (opus) + full suite/typecheck running; 0 new TODOs; DoD smoke box open (user).
Gate at 98eff95b5: typecheck PASS, suite 1453/15180 GREEN. Deletion audit: ~15 safe-now (sonnet applying) + 6 needs-ruling (~125) asked (dash xNVX, rec keep all).
Safe-now applied ac98af603 (sonnet), pushed to #846.
xNVX RULED: keep all 6 needs-ruling items. Remaining before feature-done READY: user smoke (DoD).
User smoke PASSED 2026-10-05 (deep links). feature-done READY: moves + ledger archive.
