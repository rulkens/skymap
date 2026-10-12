# SDD ledger — plan: docs/superpowers/plans/2026-10-04-accurate-planet-positions.md

Asks (2026-10-04): parallelism = stack (feature starts right away on `accurate-planets` atop `accurate-planets-prep`); perf gate = SKIP. Lean protocol: one final review per PR; T5/T6 tagged review: yes.
Base: prep branch off origin/main d435719c0 (main moved from a600d661f; #827 touches no planned file).

## Pre-flight scan
| Rows | Produces → consumes | Finding |
|---|---|---|
| T1 ↔ T6 | T1 test reads eye-relative km basis (floats 34..45); T6 on-trail test reuses it | consistent |
| T2 ↔ T6 | both regenerate bodyStatesJ2000 + golden traces + EARTH_TARGET | T6 re-does after T2; consistent (sequential) |
| T2 ↔ T5 | T5 fit must run AFTER T2's obliquity (residual in app frame) | stacked branch guarantees order |
| T3 ↔ T5 | `EphemerisCorrection`, `ephemerisCorrectionMpc` → T5 verifies with it | consistent |
| T4 ↔ T5 | `data/raw/horizons/planets/<naif>.csv` via rawDataPath('horizons.planets') | consistent |
| T5 ↔ T6 | `PLANET_EPHEMERIS_CORRECTIONS` keyed by planet id | consistent |
| T1 self | test fails today, passes after | ok |
| T2 self | no new test (constant) | ok per testing.md |
| T3–T6 self | tests match code | ok |
Dispatch A (Tasks 1–2, Sonnet) launched on accurate-planets-prep; draft PR #834; base c798ac56a
Task 1: complete (commits c798ac56a..2183ed6b7, final review pending)
Task 2: complete (commits 2183ed6b7..7edf35cb5, final review pending)
Ruling: Task 1 on-trail tolerance 0.1 km, not 1 m — the eye-relative basis is packed f32 (~30 m step at the Moon's 4e5 km); injected offset 1e6 km is 4 orders above — costs: a sub-100 m anchoring regression would pass. Same tolerance for Task 6's on-trail test.
Ruling: 18–20-digit keplerianEllipse comparisons left unloosened — they still pass, loosening would be churn — costs nothing.
Golden traces checked: same structure (26/26, 47 entries), only J2000 Earth coordinates rotated by the obliquity fix.
Prep pushed 7edf35cb5; CI watch on #834; final review (Opus) dispatched. Feature branch accurate-planets created at 7edf35cb5; Dispatch B (Tasks 3–5, Opus) launched.
Prep final review: 3 Minor (propagateElements.test.ts:93-94 garbled comment; orbitalElements.ts:4 header not re-wrapped; settleGoldenTrace.json minified by re-record). No Critical/Important.
Ruling: controller fixes the 3 Minors inline on accurate-planets-prep (<50 lines, lean protocol) AFTER Dispatch B finishes (worktree is on accurate-planets), then merges prep into accurate-planets — avoids switching branches under a live agent — costs: prep PR waits ~1 dispatch.
Prep CI RED (1/1426): cameraFraming.test.ts:76 GALACTIC_DISC_FORWARD decodes to yaw −1.4208018 vs −1.4208 @1e-6 — the exact-obliquity ecliptic frame shifts the decode ~2e-6 rad.
Ruling: relax yaw/pitch to toBeCloseTo(…, 4) with a one-line why (still catches a mistyped 4th decimal, 1e-4 > 5e-5); do NOT re-derive GALACTIC_DISC_FORWARD (a 1e-5 rad view change nobody sees) — costs: the pin is 50× looser. Folded into the controller's prep fix commit after Dispatch B.
Prep fix commit 309d53be8 (3 review Minors + cameraFraming 4-place ruling; settle recorder now writes 2-space JSON and trace re-recorded) pushed; CI re-watch running.
Task 3: complete (commits 7edf35cb5..428f92fdc, final review pending)
Task 4: complete (commits 428f92fdc..e79ff43f2, final review pending)
Task 5: complete (commits e79ff43f2..2f0c8f0d3, final review pending) — 525 terms, max verified 900 km (Earth), 36.2 kB text
Ruling (Dispatch B deviations accepted): golden-section frequency refine instead of parabolic (2 vs 21 terms on two-tone test); fit grid always includes the final row (Uranus failed 1,012 km at 2100 otherwise); generated file 36 kB text not ~17 kB (plan assumed f32 binary; text with 12-digit ω is the honest size) — costs: bundle +36 kB raw (~less gzipped).
Prep merged into accurate-planets (948758534); feature draft PR #835 (base accurate-planets-prep). Dispatch C (Task 6, Opus) launched.
Prep PR #834 CI GREEN at 309d53be8; review clean after fixes → ready for user smoke/merge ruling.
Task 6: complete (commits 948758534..b707c020b, final review pending) — vs Horizons fixture: Me 593, V 616, E 621 (vs 399), Ma 868, J 307, S 333, U 279, N 300 km; k=0 mutation → Earth 4,830 km, reflex test fails.
Ruling (accepted): BARYCENTRIC_REFLEX_BY_PRIMARY as 2nd export of data/bodies/barycentricPairs.ts (frameFilePurity bans the module-level map in deriveBodyStates) — costs: data file with two exports. Saturn on-trail check at 1 m on the f64 conic (packed f32 step 128 km at Saturn); Moon/Hubble 0.1 km on packed basis. HorizonsSeries type moved to tools/bodies/@types (noInlineTypes).
Feature final review: clean of Critical/Important; 6 Minors (unused maxErrKm; BARYCENTRIC_PAIRS export unused + test restates k; inline dot helper; golden-section double eval; lo=0 NaN probe; parser throw-case test). Ruling: fix all 6 in ONE fix dispatch after local CI finishes (stacked PR gets no GitHub CI — base ≠ main; local typecheck+lint+test run as the gate).
Local CI on b707c020b: typecheck+lint+test GREEN (1432 files / 14950 tests). Fix dispatch (6 Minors, Sonnet) launched.
Fix dispatch 8eea5fe69: 6 Minors fixed; fixer reverted the regenerated file (1e-10 rounding noise broke exact fixtures).
Ruling: controller regenerated corrections from the final tool + re-blessed bodyStatesJ2000 and both golden traces (60a10eec9) so the committed generated file equals tool output — costs: fixture churn of rounding noise only (same term counts, same max errors).
Local CI on 60a10eec9: 1429/1429 files, 14943 tests pass; 3 worker-start timeouts (load) re-run green (3 files, 7 tests). Both PRs review-clean. NEXT: user smoke (plan DoD) → /feature-done → merge on user's word (prep #834 first, then retarget #835 to main).

## /feature-done IN PROGRESS (2026-10-04) — user smoke PASSED ("looks good")
DoD findings so far: tests+typecheck GREEN (local full run on 60a10eec9, no change since); checkboxes 0/31 ticked (tick all on READY); DoD section PRESENT; spec Ground preparation PRESENT; unexpected files (all explained): earthUniverseLoop.test.ts, settleGoldenTrace.test.ts (recorder), mergeHorizonsChunks(.test).ts, tools/@types/math/FitResult.d.ts, tools/bodies/@types/HorizonsSeries.d.ts, tools/parsers/@types/HorizonsVectorRow.d.ts, tools/utils/math/dot.ts; untouched planned: none; new TODOs: 0; comment density OK; test parity grew; smoke FOUND; deferred = plan "Out of scope" list (moons, Pluto pair row → backlog detail updated, Voyager → mission-trails spec next, runtime TDB, orbitReachByRegion margin).
IN-FLIGHT: deletion-audit agent (opus, GREENFIELD/--justify, read-only) → report at scratchpad `deletion-audit-accurate-planets.md`. ON RESULT: apply SAFE-NOW bin as its own deletion commit on `accurate-planets` (dispatch Sonnet if >2 files), run targeted tests, push; NEEDS-RULING items → ask user. Then READY → tick plan checkboxes; git mv plan → plans/completed/, spec → specs/completed/; copy this ledger → plans/completed/2026-10-04-accurate-planet-positions.ledger.md; backlog sweep (barycentric-pairs item STAYS, only its clause was updated); commit "docs(plan): mark accurate-planet-positions complete" (NO Co-Authored-By per user memory); push accurate-planets.
THEN: merge ONLY on user's "merge this PR": #834 first (squash), then retarget #835 base → main, rebase/merge main, GitHub CI, merge. After both land: Voyager mission-trails spec (memory project_mission_trails.md).
Dev server for this wt: localhost:5176 (bg, started this session) — leave running.
Deletion audit done (report: scratchpad deletion-audit-accurate-planets.md): safe-now ~27 LOC (FitResult.d.ts, import guard, keplerKm reuse, edge-continuity test, HorizonsSeries.d.ts) → Sonnet dispatch applying. NEEDS-RULING asked as dash ask 4UUQ (site test keep(rec) · real-data on-trail test delete(rec) · pair table keep(rec) · mergeHorizonsChunks keep(rec)).
Safe-now deletion commit 788c5f627 pushed (typecheck both tsconfigs + tests/tools tests/utils/orbit green). Waiting on ask 4UUQ.
DoD audit READY 2026-10-05: deletion audit ~27 LOC safe-now (788c5f627) + ruled on-trail test drop (3ff4005a5); 4UUQ: keep site test, keep pair table, keep mergeHorizonsChunks. Plan/spec moved to completed/.
