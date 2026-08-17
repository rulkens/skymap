# Grill Session: Setting up a linter for skymap — 2026-07-28

Source: conversation, prompted by PR #503 — a `useCallback` crash caused by a
React hook short-circuited behind `||` (`useAppSelector(a) || useAppSelector(b)`)
in `TopBarContainer.tsx`. The project had never run a linter; this class of bug
had been invisible.

Goal: install linting that catches bugs `tsc` structurally cannot see (chiefly
Rules of Hooks and floating promises) and enforces skymap's house conventions,
as a hard CI gate that agents and contributors cannot silently drift past.

All measurements below were taken empirically in a throwaway worktree by
installing both Biome and ESLint (`--no-save`) and running them against the real
tree, not from vendor documentation.

---

## Q1: What job is the linter hired for?

**The question:** What is the linter's scope of responsibility? This is the root
of the tree — it decides tool choice, rule count, and whether the thing can ever
be a hard CI gate.

**Considerations:**
- **Option A (narrow correctness net):** Only rules that catch real bugs `tsc`
  can't see — `rules-of-hooks`, `exhaustive-deps`, `no-floating-promises`,
  `no-misused-promises`. ~5–15 rules; every violation is a latent bug, so it can
  gate on day one. TS is already `strict` + `noUncheckedIndexedAccess`, so this
  is the only band with genuine marginal value.
- **Option B (broad code quality):** `eslint:recommended` +
  `typescript-eslint/recommended` + React presets. Hundreds of rules. Most
  findings are style noise `strict`/Prettier already handle, and it would light
  up thousands of pre-existing violations — forcing the same "can't gate in CI"
  compromise already made with Prettier.
- **Option C (house-convention enforcement):** Encode CLAUDE.md's rules —
  no `interface`, one symbol per file in `utils/`/`@types/`, no barrel exports,
  no `react-redux` in `state/`. Currently doc-only, enforced by review, so
  agents break them silently. Genuinely valuable here given the large
  agent-written surface, but needs custom rules for the file-level ones.

**Decision:** A + C together. B is explicitly rejected — it would bury the
signal (today's bug was category A and only A) under style noise and re-create
the Prettier gate problem. C earns its place specifically because skymap has a
heavy agent-authored surface and conventions that are otherwise unenforceable.

---

## Q2: Where does C live — lint rules or the test suite?

**The question:** Convention enforcement can be ESLint rules or vitest
structural tests. Which mechanism?

**Context found by exploring:** `tests/services/engine/data/forbiddenPaths.test.ts`
already walks `src/` from vitest and asserts a structural invariant, describing
itself as "greppable, dumb, and final." A blessed precedent for
convention-guard-as-test. Measured convention compliance is ~100%: `interface`
0 uses, component barrels 0, `react-redux` in `state/` 0, multi-export utils
effectively 0 (the 14 apparent cases export a function plus its own constants,
which is compliant).

**Considerations:**
- **Option A (all C as ESLint rules):** Two conventions are built-ins
  (`consistent-type-definitions`, `no-restricted-imports`); the other two
  (one-export-per-file, filename===export) need a custom ESLint plugin — its own
  package, tests, and maintained AST code.
- **Option B (all C as vitest tests):** One `tests/conventions/*.test.ts`
  extending `forbiddenPaths`. Filesystem walks are the natural shape for
  file-level facts. No new dependency, runs inside the gate already enforced.
- **Option C (split by shape):** Built-ins for the one-liners, vitest for the
  file-level two.

**Decision:** B at the time — a linter is the wrong shape for file-level
invariants, and choosing vitest decoupled C from the tool decision, keeping
Biome/oxlint viable for A. (Partially revisited at Q8 once ESLint was locked in.)

---

## Q3: Biome or ESLint?

**The question:** Which linter for the A rules? Decided empirically by installing
both and running them against the real tree and against a fixture reproducing
PR #503's exact bug.

**Measurements:**
- Both caught the hooks bug at the identical position (`10:39`).
- Syntax-only over 1,368 `src/` files: Biome 71 ms vs ESLint 2.88 s (~40×).
- **Type-aware** (the honest comparison, since A includes promise rules):
  Biome 3.7 s vs ESLint 9.3 s (~2.5×). The 40× advantage collapses once the
  rules that need type info are on.
- **Real floating promises found: ESLint 4, Biome 2.** The two Biome missed
  (`useAliasIndex.ts:75`, `wireInput.ts:364`) reach the promise through
  indirection — an optional method on a `handle`, a value returned from a
  closure — which is the dominant idiom in skymap's engine layer. Biome's
  reimplemented (non-`tsc`) inference lands at ~75–85% generally but measured
  **~50%** on this codebase.
- Biome ignores `eslint-disable` comments (uses `biome-ignore`), so it would
  *not* inherit the repo's 14 speculative `eslint-disable` directives — but
  those are a one-time cleanup, not a permanent tax, and ESLint's
  `reportUnusedDisableDirectives` surfaces the dead ones (6–7 already unused).

**Considerations:**
- **Biome:** Fastest, zero parser config, doesn't inherit stale disables.
  Formatter-first by origin (Rome successor); linter is real now (500+ ported
  rules in 2.5) but type-aware coverage is measurably weaker on this code.
- **ESLint + typescript-eslint:** Ecosystem default, better-tuned
  `exhaustive-deps`, and — decisively — caught 4/4 real floating promises.
  Needs explicit parser wiring; ~2.5× slower with type-aware rules, which is
  noise against a CI gate already spending ~33 s on tests + ~20 s on typecheck.

**Decision:** ESLint. The speed argument carried Biome and collapses once
type-aware rules (which A requires) are enabled; on the actual requirement —
finding real floating promises in an indirection-heavy engine — Biome misses
half. Running both is rejected: two toolchains/configs/ignore-syntaxes for one
job is exactly the complecting the simplicity convention exists to prevent.

---

## Q4: How do we clear the pre-existing baseline so the gate can be hard?

**The question:** A hard gate can't switch on until existing violations are
resolved. The Prettier gate is disabled in CI precisely because its baseline was
too big. Does that reasoning transfer?

**Measurement:** The entire A-rule baseline is tiny — 4 floating promises + 1
`exhaustive-deps` + 6 dead `eslint-disable` directives on `src`. A morning, not
a migration.

**Considerations:**
- **Option A (fix-all-first, then hard gate immediately):** Clear all findings
  in a prep commit, land ESLint as an error-level gate in the same PR. No warn
  phase, no debt.
- **Option B (warn-only, fix incrementally):** The exact Prettier compromise.
  Unjustifiable at this size — warnings nobody must action become permanent
  noise.

**Decision:** A, one PR (prep commits first). The 4 floating promises are judged
per-site, not blanket-`void`ed: `engine.ts:693` is an async IIFE with an internal
`try/catch`, so `void` is correct; `hoverPickDriver`, `wireInput`, `useAliasIndex`
dispatch off `.then()` with no rejection handler and may warrant a real `.catch`.
The 6 dead directives are deleted, not the rules loosened.

---

## Q5: What's in scope for the hard gate?

**The question:** Which trees does the gate cover — `src`, `tools`, `tests`?
Type-aware rules need a tsconfig per file, and there are two
(`tsconfig.json` for src, `tsconfig.tools.json` for tools).

**Measurements (after wiring both tsconfigs into the parser):**
- `src`: 4 floating + 1 deps + 6 dead directives = **11**, all genuine.
- `tools`: 6 misused-promises (5 in `famous-curator/ui/App.tsx`, 1 in
  `flow-workbench/Viewport.tsx`), plus the sub-apps are real React. The
  earlier "32 floating promises in tools" estimate was **wrong** — those files
  weren't linting at all because the parser couldn't find `tsconfig.tools.json`;
  with it wired, the true `src`+`tools` baseline is ~11 total, not ~50.
- `tests`: the 5 `rules-of-hooks` findings are **false positives** — `useX()`
  test helpers/mocks called outside components, which the rule can't distinguish
  from real hooks.

**Considerations:**
- **Option A (`src` only):** Baseline stays 11; zero false positives; one
  tsconfig. Cost: a hooks bug in a `tools/` sub-app ships unlinted.
- **Option B (`src` + `tools`):** Adds sub-app hooks coverage + tools promise
  bugs. Once tsconfig wiring was corrected, cost is ~same 11-fix baseline, not
  the ~50 first feared. Requires the second tsconfig in the parser config.
- **Option C (all three, per-tree tuning):** `tests` needs `rules-of-hooks`
  disabled to kill false positives; net-negative there.

**Decision:** B (`src` + `tools`), two tsconfig blocks in the flat config.
`tests` is excluded from the hooks rules permanently — the false-positive rate
makes them net-negative there. Verified: with `src`→`tsconfig.json` (via
`projectService`) and `tools`→explicit `project: './tsconfig.tools.json'`, zero
parser "file not found" errors remain.

---

## Q6: How is the gate wired into CI and the npm scripts?

**The question:** CI placement and script shape.

**Considerations / Decision:**
- **6a CI placement:** New `lint` step in the *existing* `ci` job (shares
  `npm ci`), placed before tests, hard-failing like typecheck. Not a separate
  parallel job — it's ~9 s and needs no separate checkout/install.
- **6b scripts:** `"lint": "eslint ."` (flat-config `files` globs scope it to
  `src`+`tools`) and `"lint:fix": "eslint . --fix"`. Whole-tree, not
  changed-files. Lint is kept *out* of the `format` script — the mutating fixer
  and the gate should run independently.

---

## Q7: Is `exhaustive-deps` an error or a warning?

**The question:** Unlike the other three (binary correctness), `exhaustive-deps`
ships as a warning by default in React's own ecosystem because it has real false
positives. The repo already has legitimate overrides (`useEngine.ts:93`,
`Viewport.tsx`).

**Considerations:**
- **Option A (error):** Consistency — every rule blocks. Intentional deviations
  need an inline `eslint-disable-next-line` with justification.
- **Option B (warn):** Matches React's default, acknowledges fallibility. But
  non-blocking findings rot (per Prettier history).

**Decision:** A (error), with a machine-checked escape hatch. This is an
agent-heavy codebase and the whole motivation was an agent shipping a hooks bug;
a warning is invisible to the next agent, an error stops them. Honest deviations
get `// eslint-disable-next-line react-hooks/exhaustive-deps — <reason>`, which
is better documentation than a silent warning. A disable comment *without* a
trailing reason is itself lint-rejected (see Q8 defaults) so the hatch can't
silently paper over real bugs.

---

## Q8: Does C split by shape now that ESLint is certain?

**The question:** Q2 put all of C in vitest, but that predated locking in
ESLint. Two of the four conventions are now trivial ESLint built-ins.

**Considerations:**
- **Option A (split):** `no interface` →
  `@typescript-eslint/consistent-type-definitions: ['error','type']`;
  `no react-redux in state/` → `no-restricted-imports` path-scoped override.
  The two file-level conventions (one-export-per-file, filename===export) stay
  vitest tests, extending `forbiddenPaths`. Free, with editor squiggles for the
  two built-ins.
- **Option B (keep all vitest):** One mechanism, but hand-writes two filesystem
  walks that duplicate stock ESLint rules and forgoes write-time feedback.

**Decision:** A (split), all shipping in this same PR. The Q2 reasoning ("linter
is the wrong shape for file-level invariants") was correct only for the
file-level two and was over-applied to the other two because ESLint wasn't yet
guaranteed. All four conventions have zero current violations, so C is pure
prevention — pick the cheapest correct mechanism per convention. Same PR: the
two convention rules are three config lines beside the four A rules, and the two
vitest tests are small and independent; splitting would fragment one coherent
initiative.

---

## Implementation defaults (chosen, not grilled)

- **Mandatory-reason-on-disable** enforced via
  `@eslint-community/eslint-plugin-eslint-comments` (`require-description`) — the
  only way to make Q7's escape-hatch discipline machine-checked.
- **`reportUnusedDisableDirectives: 'error'`** on — already caught 6 dead
  directives in probe runs; free.

---

## Resolved design (summary)

| # | Decision |
|---|----------|
| Job | A (correctness net) + C (house conventions) |
| Tool | ESLint + typescript-eslint (not Biome; not both) |
| A rules | `rules-of-hooks`, `exhaustive-deps`, `no-floating-promises`, `no-misused-promises` |
| C mechanism | split — 2 ESLint built-ins + 2 vitest structural tests |
| Scope | `src` + `tools` (two tsconfigs); `tests` excluded from hooks rules |
| Baseline | fix-all-first (~11 findings), one PR, prep commits first |
| Gate | hard-fail `lint` step in existing CI job; `lint` + `lint:fix` scripts |
| `exhaustive-deps` | error, with reason-required disables |
| Escape hatch | `require-description` + `reportUnusedDisableDirectives: error` |
