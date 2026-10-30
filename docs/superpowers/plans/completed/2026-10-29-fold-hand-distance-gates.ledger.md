# SDD ledger — fold hand-written foreground gates

Plan: docs/superpowers/plans/2026-10-29-fold-hand-distance-gates.md
Spec: docs/superpowers/specs/2026-10-29-fold-hand-distance-gates-design.md
Branch: worktree-fold-hand-distance-gates (wt .claude/worktrees/fold-hand-distance-gates)

## Plan-start answers (user, 2026-10-29)
- Dispatch grouping: D1 = T1+T3, D2 = T2+T4. Serial, this wt.
- Perf gate: skipped (priced ≈ 0 per frame).
- Rulings: admission reads bands at the frame camera (D); Sgr A* marker = Layer-owned far fade (E2).

## Progress
Draft PR: #972.

- [x] D1 (T1+T3) — opus, 185k tokens / 95 tools. T1 `401290c47`, T3 `c798f1247`. Deviations: frameContext filters hostless mesh rows by `slabRowActive` too; old gate tests deleted (covered by bodySlabRows test); atmosphere fixtures supply `slabBodyCandidates`; new blackHoleMarkerBrightness test file. Glint backdrop gone at 1.47e-9 Mpc vs 0.23 Mpc cutoff.
- [x] T1 mid-branch review — opus: SHIP, no behaviour bugs. 2 findings folded into D2: pin frameContext's hostless-row filter with a deriveFrameContext test; drop dead `cam.distance` in body/frame.test.ts.
- [x] D2 (T1 fixes + T2 + T4) — opus, 173k / 116 tools. `cba820576` T1 fixes, `671392f1b` T2, `b8beb9f2b` T4; pushed. Deviations: craft presence mocked in slab-candidate test; new helper `starCatalog/present/seededStarsHandedZero.ts`; ratchet test file created; admission test helper eye defaults to 1 AU (100 Mpc pose would band the Sun out — final review checks Sun/star consumers past the cutoff).
- [x] Final whole-branch review (fable): SHIP. Admission safe: sceneBodies read only by sceneBodyPresentation (star passes, partition, occluders); focus/captions/picks read bodyStates; Sun caption dies at 9.2 kpc, star captions 2.3 kpc, band starts 115 kpc. 5 slop findings.
- [x] Fix round (sonnet): `c1c0164c6` pushed. CI green on b8beb9f2b; re-running on c1c0164c6.
- [x] CI green on c1c0164c6. Eye pairs (Earth, Saturn, Sgr A*, Sirius, M31): all Identical (user, ask AuMP).
- [x] /feature-done: tests 1722 files green, typecheck clean, no new TODOs; deletion audit −50 LOC applied in `8efd1364c`; READY.
- Eye pairs shot (main snapshot :5199 from scratchpad/main-before, branch :5198), shots in wt data/shots/; dash ask AuMP open.
- [ ] Merge ask
