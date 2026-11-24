# Ledger: refactor CLI on TypeScript 7, PR A

Plan: docs/superpowers/plans/2026-11-24-refactor-cli-native-engine.md
Branch: refactor-native-spec (worktree layer-refactor-status), base 7a2cd51fb, plan commit 7760e09d7
Pre-flight: one PR at a time (PR B stacks after A); no perf gate (no renderer code). Not asked: both follow from the spec.

Ruling: single-file syntax via the TypeScript 6 parser, engine for references only — keeps unstable API in one folder — if wrong: ~100 ms extra parse per run, classifiers re-done on engine nodes.

## Dispatches

- D1: Tasks 1–2 (prep), sonnet — dispatched
- D1 done: Task 1: complete (047d74090), Task 2: complete (62d72c9ae). sonnet. Deviations: @types files are .d.ts (convention test); refactor.ts also left the allow-list; arity errors now print after the preview (goes away when rows become plan/report kinds).
- D2: Tasks 3–5, sonnet — dispatched
- D2 done: Task 3: complete (f1eb1d477), Task 4: complete (9a7d553f6), Task 5: complete (0ea582719). sonnet. In-memory fixtures work. refs on EngineState: 573 refs / 203 files, 2.1 s wall (0.8 s opening 4 projects, 0.3 s collect, rest npm+tsx). Deviations: planDelete also takes the report (transitional); 'plan' kind deferred to Task 6; one-entry parse memo; class extends = 'value'.
- Ruling: accept 2.1 s for refs (budget said 1.5 s) — the floor is the native process opening 4 projects — if wrong: lazy per-project opening later.
- D3: Tasks 6–8, sonnet — dispatched
- Controller inline: lazy fold + resync in the driver (57b956a81); rename --dry 5.4 s → 3.2 s.
- Review (top tier): 12 findings, 10 confirmed bugs/slop. Worst: shorthand destructure renamed into broken code; file outside all projects treated as 0 refs; inline's re-export shapes refused by locateExport.
- Fix round: all 12 sent to D3's implementer — dispatched
- Fix round done (sonnet, same implementer): d881da9f5, ffda8953f, 567c8ee49, 7e6cf691a, 7fbd3521e. All 12 addressed; residuals: item 9 branch untested (needs an 8 s ts-morph batch), item 11 alias-spelled-like-symbol uses still renamed (documented as a blind spot). Parity 10/10 same. Wall on EngineState: refs 2.9 s, rename --dry 3.0 s, delete 2.8 s.
- Controller checks: npm run typecheck 0 errors; vitest tests/tools tests/conventions packages/move-files 578 files pass; typescript-native imported only under tools/utils/refactor/engine/.
- Turn counts: D1 42 tool uses, D2 91, D3 109 + 58 (fix round), review 46.
