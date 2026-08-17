# move-files: rewrite the references ts-morph can't see, and fail loudly on the rest

`npm run move-files` (`tools/dev/moveFiles.ts`, #440) moves TypeScript files and
lets ts-morph rewrite every import that resolves to them. It does that part
perfectly. But `SourceFile.move()` only rewrites specifiers it can **resolve to a
source file in the Project**, and skymap has two whole classes of file reference
that fall outside that — both discovered the hard way during the GPU-renderers
folder reorg (PR #436), where the manual grep after each move was the only thing
standing between a stale path and a silent production break.

## The two blind spots

**Class 1 — Vite query-suffixed specifiers.** `import w from './x.worker?worker'`
_is_ a real import declaration in the AST, but `./x.worker?worker` doesn't resolve
to a TS module, so ts-morph leaves it untouched. The family: `?static` (WESL
shaders), `?worker`, `?url`, `?raw`, `?inline`.

**Class 2 — path-shaped string literals.** `vi.mock('../../src/services/gpu/
renderers/galaxyPointRenderer')` isn't a specifier at all — it's a string argument.
Nothing type-checks it. There are 20 such `vi.mock` literals in the renderer
tests alone.

## Why this is worth tooling rather than discipline

The classes differ in how loudly they fail, and the worst one is silent on both
gates:

| Reference         | `tsc` catches | `vite build` catches | Failure mode                      |
| ----------------- | ------------- | -------------------- | --------------------------------- |
| `?static` shader  | no            | **yes**              | loud build failure                |
| `vi.mock` literal | no            | no                   | test silently stops mocking       |
| **`?worker`**     | **no**        | **no**               | **silent runtime break, in prod** |

`?worker` is the dangerous one precisely because the module is _ambiently
declared_: the type system is satisfied by a broken path and so is the bundler.
During the reorg, a stale `?worker` specifier in `catalogStore.ts` would have
quietly killed the off-thread catalog bake with every gate green.

Evidence from the reorg's move tasks: A1 missed 1 `vi.mock` literal, A2 missed 4
plus the `?worker`. Every one was caught by a hand grep, not by a machine.

## Approach

The two rewrites are the same underlying operation — _"here is a `(file, string,
resolved-target)` triple; if either end moved, re-derive the relative path"_ — so
un-braid **where paths hide** from **how they get fixed**:

```ts
// tools/utils/refactor/rewritePathLiterals.ts
// Extractors say WHERE a path hides. The re-derivation is shared.
type PathLiteral = { file: SourceFile; node: StringLiteral; resolved: string };
type Extractor = (sf: SourceFile) => PathLiteral[];

const queryImportSpecifiers: Extractor = …; // specifiers matching /^\.\.?\/.*\?\w+$/
const viMockArguments: Extractor = …; // 1st arg of vi.mock/doMock/unmock/importActual/importMock

export function rewritePathLiterals(
  project: Project,
  moves: ReadonlyArray<MovePair>,
  extractors: ReadonlyArray<Extractor>,
): void;
```

Resolve each triple to an **absolute target before** the move; apply the moves;
then re-derive any literal whose importer _or_ target relocated. This covers both
directions — including a `.worker.ts` that itself moves, whose importers reference
it via `?worker`.

## The part that actually matters: the guard

Rewriters only cover the idioms we enumerate today. Someone adds a new Vite query
or a new string-path convention tomorrow and we are back to silent breakage. So
the **last step of every move** should be a dangling-reference check:

- scan every path-shaped string literal (starts `./` or `../`) across `src/`,
  `tests/`, `tools/`
- strip any `?query`, resolve against the containing file's directory, probe the
  real extensions (`.ts`, `.tsx`, `.wesl`, exact)
- anything unresolvable → **fail the command**, printing `file:line` and the
  offending string, exit non-zero

This converts the whole class from _"discovered in production"_ to _"the move
command refuses to finish."_ It is also worth running independently of moves — a
cheap referential-integrity check for CI.

Watch for false positives: require the `./` or `../` prefix (URLs and
`rawDataPath()` keys are dotted or absolute, so they filter out naturally). A
small allowlist may be needed; if it grows past a couple of entries, that is a
signal the heuristic is wrong, not that the list needs extending.

## Scope

- `tools/utils/refactor/rewritePathLiterals.ts` + the two extractors (+ tests —
  `tests/tools/utils/refactor/` already mirrors this dir).
- `tools/utils/refactor/findDanglingPaths.ts` + test.
- Wire both into `tools/dev/moveFiles.ts`; the guard runs last and gates the exit
  code. `--dry` should report what it _would_ rewrite and what dangles.
- Update the tool's docblock: its "What this does NOT rewrite" section is
  currently accurate and would become the changelog of what it now does.
