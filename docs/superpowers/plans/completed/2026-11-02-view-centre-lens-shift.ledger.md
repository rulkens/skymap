# Ledger — 2026-11-02-view-centre-lens-shift

Plan: docs/superpowers/plans/2026-11-02-view-centre-lens-shift.md
Worktree: .claude/worktrees/view-navigation-center
Branches: lens-shift-prep (PR 1) → lens-shift (PR 2, stacked)

Ruling: serial, one worktree, two stacked PRs — user said "build both, im going afk" — cost if wrong: none, PR 2 rebases.
Ruling: no perf gate — the shift changes four frustum tangents, no per-frame GPU or per-galaxy CPU work — cost if wrong: a frame-time regression caught by the next perf run.
Ruling: builder-check Q1 no re-fit on late covers; Q2 clamp 0.6; Q3 plain shots show the shift; sheet → probe — user afk, flagged in spec §9.

Task 0: complete (26e82da66)
Dispatch A: Task 1 — opus — 26e82da66→8c2360991 — complete — 45 tool uses. Eye check: horizon mean |Δ| 0.11/255; ZoA band identical, diffs are star-field noise. Deviations: ZoA aspect now from canvas frustum (was floored zoa target); drawPick takes frustum as 3rd arg.
Dispatch B: Tasks 2–3 — opus — 8c2360991→d21172fb0 — complete — 102 tool uses. Deviations: mainViewSpec dropped cam; DriverCtx.projection→framing; cursor ray centre+ndc·half (bit-identity); frustumFovYRad kept.
Task 4: complete inline (4e12d741c). PR 1 = #996 opened; CI + mid-branch review (Tasks 1–3) in flight.
Dispatch C: Tasks 6–7 — opus — 4e12d741c(+tick)→f4f03ddf6 — complete. Deviations: phone exhibit measures caption kicker; animationend re-measure; prop coverActive. Concern → final fix round: presentational BottomStack/ExhibitOverlay dispatch via hook (container rule).
Review (Tasks 1–3) — opus — no high/med; fixed inline fb61666f8 (frustumFovYRad shift-invariant, off-axis lightTime packing test); gizmo centred outline left (debug-only). Merged prep into lens-shift (566f049e8).
Dispatch D: Tasks 8–9 — opus — 566f049e8→3db5aa55f — complete. Deviations: dt cap 1/30 s (idle→ease, not snap); NO_INSETS_PX; clampedAxisCover helper.
Bug found in eye check: pre-context wake write crashed sagas (phone hang) → failing test + fix 54274633b. Phone disconnected; on-device checks left for user.
Final review — opus — 3 fidelity (structure fill, exhibit pre-cover fit, scrolled caption), container violation, slop. Fix round dispatched (all but exhibit pre-cover fit → owner ruling).
Fix round — opus — →952244d24 — complete; full suite 20082 pass locally, typecheck clean. Final shots good. Dash ask B6tx: 3 eye checks, on-device, exhibit pre-fit ruling, away-calls sign-off. Then: merge #996 on word, retarget #997 to main, CI, /feature-done, merge on word.
Owner rulings 2026-11-02 eve: bodies height (tried) → then option A: size from whole canvas, covers only shift. Dead code removed: Task 3 reverted on prep (FramingWindow plumbing), coveredFramingWindow deleted, Task 9 reverted; merged prep → lens-shift 7cd7e6967; full suite 20065 pass. Next: walk remaining away calls one by one (clamp 0.6, phone probe; structures + late-cover now moot).
Owner kept probe + 0.6 clamp; all away calls resolved. #996 CI green after the Task 3 revert. Open: on-device phone check (needs USB), then merge #996 → retarget #997 → CI → /feature-done → merge.
