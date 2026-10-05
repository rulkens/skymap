# SDD ledger — search palette tabs PR1

Plan: docs/superpowers/plans/2026-09-19-search-palette-tabs-pr1.md · Spec: docs/superpowers/specs/2026-09-19-search-palette-tabs-design.md
Branch: worktree-search-tabs (wt .claude/worktrees/search-tabs) · Draft PR #762 · BASE b8430e063
Parallelism: this plan only, serial dispatches in this worktree. Perf gate: none (no renderer). Both are stated in the plan, which the user approved ("ok", 2026-09-19).

## Dispatches
- A (T1–T3, sonnet, 102 tool uses): b8430e063→d193c77c0 done. Controller fix 02748956a: 4 Galaxies labels were designations (pickProperName ignores commonName) → Centaurus A / Phantom Galaxy / NGC 5248 / Fireworks Galaxy. Solar System = 25 cards (the DoD's "26" was wrong).
- B (T4–T6, sonnet, 146 tool uses): 02748956a→66c6bdd10 done, pushed. The agent added `paletteTab` to 6 existing UiState test literals.
- Ruling: T5's mid-branch review folded into the final review (all tasks had already landed) — why: one review instead of two over the same diff — cost if wrong: none, since the review mandate puts T5 first.
- Final whole-branch review (opus, 19 tool uses): T5 clean. 3 bugs (the m31 tile reused across tabs; Enter hijacking a focused button; the highlight scrolls off-screen), plus a highlight reset on reopen, dead guards, FeaturedGrid still taking famous (spec §5.2), stale comments and headers over budget.
- Controller a682bc1b0: the active tab's underline is `--gradient-accent-bar` (user asked for the canvas gradient).
- Fix round (sonnet, 50 tool uses): →77b89df33, all 8 findings fixed, 2 regression tests. Pushed.
- User requests, all done and pushed:
  - 5e3b58805: 4 inert view placeholder cards in Highlights (ViewId type, PaletteAction `view` variant, no-op container row, disabled button + Enter guard).
  - 95453f3e9: Solar System = 15 cards (planets, Pluto in row 2, then Moon/Io/Europa/Titan/Enceladus). User rule: max 15 cards per tab.
  - 56b8cc2a8: I drafted all blurbs (user said "draft all blurbs"). c45 → c30 NGC 7331 (c45 really is NGC 5248; the old list meant 7331).
  - d4071709b: tooltips clipped by the panel (backdrop-filter makes it the containing block + overflow hidden) → InfoTip placement 'auto'; the grid scroll box and the scrollIntoView effect removed.
  - a2cca0b4a: merged origin/main (user asked).
- The user smoked the palette: "palette looks good". Their final-check go = /feature-done IN PROGRESS.
- /feature-done state:
  - The full `npm test` + `npm run typecheck` were stopped mid-run for the merge. RERUN both after the deletion commit.
  - The deletion audit (opus) found ~75 LOC safe-now. Applied as 934604aa1 (sonnet, 41 tool uses, −87/+12), pushed.
  - User rulings on the needs-ruling items ("go"): KEEP the tab filter, the RUN_ACTION table, cardImageSrc (no test) and FeaturedCard .root. APPLY: (4) delete the two paletteTab tests in tests/state/ui/uiSlice.test.ts; (5) drop the `GridKey` type from gridIndexStep.ts (key: string, no casts; usePaletteSearch's GRID_KEYS as string[]); (7) FeaturedCardTip `aliases` required, drop `aliases &&`. The controller does these inline AFTER the agent lands, as one commit.
  - Then: full test + typecheck → report → on READY: git mv the plan to plans/completed/, copy this ledger to plans/completed/2026-09-19-search-palette-tabs-pr1.ledger.md, commit + push. The SPEC STAYS (PR2/PR3 use it). Then gh pr checks → squash-merge on the user's word.
- NEXT after merge:
  - PR2: new branch off main. The plan is drafted UNCOMMITTED at docs/superpowers/plans/2026-09-19-search-palette-tabs-pr2.md (default capture t 2026-09-18T12:00:00Z, user-approved). The file is untracked in this wt; carry it over.
  - Then PR3.
- Dev server: :5174 (bg shell bqrv7dcfn) in this wt.
