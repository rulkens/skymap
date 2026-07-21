# refactor CLI — deferred follow-ups

Surfaced during the final whole-branch review of the refactor CLI
(`tools/refactor/` + `tools/utils/refactor/`). None blocks the branch; each is
a scoped tidy or a gap in the extract closure worth capturing before it is lost.

## Dispatch shape

- **`runOp` dispatch table.** The subcommand handler is a 5-way `if`-chain over
  the subcommand name, each arm running the same resolve → report → plan body
  with a different planner. Fold to a table keyed by subcommand plus a hoisted
  preview step (`/simplify` candidate). `tools/refactor/refactor.ts`.

## extract closure gaps

- **Leading `//` line comments are dropped.** `getText(true)` keeps only JSDoc,
  so a `//` comment directly above a dragged declaration is lost in the move.
  Switch to a full-range move that includes leading trivia, with a test pinning
  a `//`-commented helper. `tools/utils/refactor/planExtract.ts`.
- **`export { target }` declaration form.** A separate `export { target }`
  statement moves the declaration without its `export` keyword and orphans the
  export statement. Add a refusal or handle the form, with a test.
- **default / namespace import carry.** The default-import and namespace-import
  carry, plus the re-import / prune combination, are untested. Add fixtures.

## Refusal / dry ergonomics

- **Blocked mutating ops print the ref list twice** — once in the stdout preview
  and again in the thrown refusal. Suppress one side, and let `--dry` preview a
  blocked op without throwing.

## Consolidation candidates

- **`removeDeclaration`** — `planDelete` and `planInline` carry a near-duplicate
  declaration-removal path; consolidate. The alias-follow idiom
  (`resolvesToSameFile` / `declaringFileOf`) repeats too. Separately,
  `retargetSpecifier`'s `bringsInOnlyThis` lacks dedupe against an existing
  underlying import.

## Error-context polish

- **Manifest entry errors** should name the offending row / index
  (`tools/refactor/refactor.ts` + `parseMovePairEntry.ts`).
- **`readManifest`** catch should preserve the original error.
- **`renderRefReport`** human summary `(N in tests/)` reads as a file count but
  actually counts refs.
