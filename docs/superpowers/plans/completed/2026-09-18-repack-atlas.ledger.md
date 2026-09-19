# repack-atlas — SDD ledger

Plan: `docs/superpowers/plans/2026-09-18-repack-atlas.md` · Spec:
`docs/superpowers/specs/2026-09-17-repack-atlas-design.md` · Branch
`worktree-soendermarken-atlas-repack` (wt soendermarken-atlas-repack) · draft PR #754.
Lean protocol: grouped Sonnet dispatches, review on tasks 5 and 8, one final whole-branch review,
CI is the gate. Workbench dev server on :5601 (background task b9os7i3gd) — leave running.

Pre-plan commits on the branch: ec90546b3 bake labels · e5d40bed5 spec · c1b661a58 plan.

## Groups

- [x] A — task 1 (derive extraction) — 1962167f5
- [x] B — tasks 2–8 — 368094f93 b8dfeb371 4a743a527 cf364fea3 6693534de de812b835 35e97cea9;
      review of 2–5 → all 7 findings fixed in 3e4a0a904
- [x] C — tasks 9–10 — c8d36e5a1, 510250724
- [x] Final whole-branch review — no blockers; 8 minors → 88ed647b6 + spec dc53a2fa8
- [x] Real-data bug: xatlas MIRRORS charts of negatively-wound source UVs (6,393 of 12,945); the
      4-turn fit picked a bogus turn. Mirror added, fit bound derived from xatlas's per-axis
      ceil-to-texel (≤ 1 px + noise) — a40d94b39. Both sizes published from the real CLI.
- [ ] `/feature-done`, user eye-check, merge on the user's word

Open for the user: 4:4:4 chroma at 4K costs +17.7 % (4.58 → 5.39 MB) — default 4:2:0 kept.

## Log
