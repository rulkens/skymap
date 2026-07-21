# Refactor CLI — ts-morph refactoring toolkit

## Goal

Make mechanical, AST-safe refactoring in skymap a single command instead of a
grep-and-hand-edit slog. Build a multi-command ts-morph CLI at `tools/refactor/`
(`npm run refactor -- <subcommand>`) whose subcommands map one-to-one onto the
house conventions (one symbol per file, filename = export name, deep relative
imports, no barrels): `rename`, `extract`, `inline`, `delete`, `refs`, `move`.
The existing `npm run move-files` folds in as the `move` subcommand and stays a
thin alias.

## Design record

Every decision below (addressing, per-subcommand semantics, guardrails,
packaging) is settled in the grill transcript —
[`docs/grill-sessions/refactor-cli-2026-07-21.md`](../../grill-sessions/refactor-cli-2026-07-21.md)
(Q1–Q9). This plan implements those decisions; it does not re-litigate them.
Read the transcript for the *why*; this plan carries only the contracts and the
task order.

## Execution

Subagent-driven-development (`superpowers:subagent-driven-development`) in a
fresh worktree; open a **draft PR when the first task lands**. Each task is TDD
(failing test first, then implementation) and ends with a scoped commit. Tasks
are ordered **prep-first**: the shared-bootstrap extraction (Task 1) and the
move fold-in (Task 10) are the ground-preparation commits and ride the same PR
as the feature (ONE PR, prep-first — confirmed with the user 2026-07-21).

## Architecture

The CLI entry `tools/refactor/refactor.ts` stays **thin** — argv dispatch,
manifest loading, one `project.save()` at the tail — exactly the shape
`tools/dev/moveFiles.ts` has today. All the behaviour lives in one-function
files under `tools/utils/refactor/`, each TDD-tested against an **in-memory
`Project`** (the pattern already used by `tests/tools/utils/refactor/applyMoves.test.ts`
and `expandTestMirrors.test.ts` — `new Project({ useInMemoryFileSystem: true })`,
seed a tiny module graph, assert on rewritten import text).

Every mutating subcommand is a **planner** `plan<Op>(project, args): void` that
resolves + validates + mutates the shared in-memory `Project` and **throws on
any validation failure without saving**. The CLI runs each requested op (single
or `--manifest` batch) against the ONE project, then saves once. All-or-nothing
falls out structurally: a throw mid-batch aborts before `project.save()`, so
disk is never partially written (same shape as `applyMoves` + `moveFiles.main`
today). `--dry` skips the save and prints the structured report; `--json` emits
the machine-readable form.

### House conventions every task must follow (HARD)

- **One exported function per file** under `tools/utils/refactor/`; filename =
  function name. A small type owned by exactly one function may be co-located in
  that function's file (the `applyMoves.ts` → `MovePair` precedent — this is
  `tools/`, not `src/@types/`), not spun into a separate file.
- **`type` aliases, never `interface`.**
- **Deep relative imports, no barrels.**
- **Didactic module-header comment** on every new file — explain *why* and *what
  the alternative was* (match the multi-paragraph headers on `applyMoves.ts` /
  `expandTestMirrors.ts` / `moveFiles.ts`).
- Flag parsing reuses `parseFlags` (`tools/utils/cli/args.ts`) for the bool
  flags (`--dry`, `--json`, `--no-file-rename`). The one value flag
  `--manifest <path>` is read by a tiny shared
  `tools/utils/refactor/readManifest.ts` helper used by both `refactor.ts`
  (Task 3) and the rewired `moveFiles.ts` (Task 10) — a second copy of the
  `indexOf('--manifest')` idiom is exactly the consolidate trigger. No change to
  `parseFlags` (it is bool-only by deliberate scope).
- User-facing error/report copy: no em dashes, no "isn't just X" / capstone
  patterns (house prose rule).

## CLI grammar (contract)

```
npm run refactor -- <subcommand> <args…> [--dry] [--json]

  refactor rename  <file>#<symbol> <newName>   [--no-file-rename]
  refactor extract <file>#<symbol> <dest.ts>
  refactor inline  <file>#<symbol>
  refactor delete  <file>#<symbol>
  refactor refs    <file>#<symbol>
  refactor move    <from> <to>

Batch form (any subcommand):
  refactor <subcommand> --manifest <ops.json>
```

- `<file>#<symbol>` is the universal address (e.g. `src/utils/math/clamp.ts#clamp`).
  Ambiguous or unresolvable addresses fail loudly **before any mutation** with a
  candidate list.
- `--dry` and `--json` are accepted by every subcommand. `--dry` prints the
  blast-radius report and saves nothing.
- Batch manifests are **per-subcommand** (a JSON array of that subcommand's
  arg-tuples). `move` keeps the existing `[{ "from", "to" }]` shape so the
  current `moves.json` files still work. Validate-all-then-apply: the CLI runs
  every entry's planner against the one in-memory project; a throw on any entry
  aborts the whole batch before the single `project.save()`.

## Shared contracts (contract code — signatures only)

Symbol addressing + resolution:

```ts
// tools/utils/refactor/parseSymbolAddress.ts
export type SymbolAddress = {
  readonly file: string;   // path as given (relative or absolute)
  readonly symbol: string; // exported identifier
};
export function parseSymbolAddress(address: string): SymbolAddress;
// throws on missing '#', empty file, or empty symbol
```

```ts
// tools/utils/refactor/resolveSymbol.ts  (SourceFile / ExportedDeclarations from ts-morph)
export type ResolvedSymbol = {
  readonly sourceFile: SourceFile;
  readonly declaration: ExportedDeclarations;
  readonly name: string;
};
export function resolveSymbol(project: Project, address: SymbolAddress): ResolvedSymbol;
// throws with a clear message when: the file is not in the Project;
// the symbol is not an exported declaration of that file; the name is
// ambiguous within the file (message LISTS the candidate declarations).
```

Structured reference report (the `refs` output AND every mutating subcommand's
`--dry` blast radius):

```ts
// tools/utils/refactor/collectRefs.ts
export type RefKind = 'import' | 'call' | 'type-position' | 're-export' | 'test';
export type RefEntry = {
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
  readonly kind: RefKind;
  readonly enclosing: string; // e.g. 'function frameTick' or '<module>'
};
export type RefReport = {
  readonly target: string;            // the '<file>#<symbol>' address
  readonly refs: readonly RefEntry[]; // every reference except the declaration itself
  readonly fileCount: number;         // distinct files in refs
  readonly testCount: number;         // refs whose filePath is under tests/
};
export function collectRefs(project: Project, resolved: ResolvedSymbol): RefReport;
```

```ts
// tools/utils/refactor/renderRefReport.ts
export function renderRefReport(report: RefReport, json: boolean): string;
```

`--json` output shape (what `renderRefReport(report, true)` emits — a straight
serialization of `RefReport`, so agents can parse it):

```json
{
  "target": "src/data/superGalacticTransform.ts#SG_TO_EQ_MATRIX",
  "summary": { "refs": 12, "files": 5, "tests": 3 },
  "refs": [
    { "filePath": "src/services/.../foo.ts", "line": 88, "column": 10,
      "kind": "import", "enclosing": "<module>" },
    { "filePath": "src/services/.../foo.ts", "line": 141, "column": 4,
      "kind": "call", "enclosing": "function frameTick" }
  ]
}
```

Extract dependency classification:

```ts
// tools/utils/refactor/classifyLocalDeps.ts
export type LocalDepClass = {
  readonly exclusive: readonly string[]; // unexported locals used ONLY by the target (transitively)
  readonly shared: readonly string[];    // unexported locals also referenced by code that stays
};
export function classifyLocalDeps(resolved: ResolvedSymbol): LocalDepClass;
```

Inline passthrough detection:

```ts
// tools/utils/refactor/detectPassthrough.ts
export type PassthroughTarget = {
  readonly kind: 'alias' | 'wrapper' | 're-export';
  readonly underlying: string; // identifier the wrapper forwards to
};
export function detectPassthrough(resolved: ResolvedSymbol): PassthroughTarget | null;
// null for anything richer than: `export const foo = bar` (alias),
// `export function foo(x) { return bar(x) }` (same params, same order, no extra
// logic — wrapper), or an `export { bar as foo }` / re-export.
```

Mutating planners (each mutates the in-memory project, throws on validation
failure, does NOT save):

```ts
// tools/utils/refactor/planRename.ts
export function planRename(
  project: Project, resolved: ResolvedSymbol, newName: string, renameFile: boolean,
): void;

// tools/utils/refactor/planExtract.ts
export function planExtract(project: Project, resolved: ResolvedSymbol, dest: string): void;

// tools/utils/refactor/planInline.ts
export function planInline(project: Project, resolved: ResolvedSymbol): void;

// tools/utils/refactor/planDelete.ts
export function planDelete(project: Project, resolved: ResolvedSymbol): void;
```

## Ground preparation

Two prep-refactor commits, both behaviour-preserving, landing **before** the new
subcommands in the same PR (packaging confirmed with the user at execution
start):

1. **Extract the three-tree `Project` bootstrap** (`moveFiles.ts:88-92`) into
   `tools/utils/refactor/loadRefactorProject.ts` (Task 1). `moveFiles.ts` keeps
   working, now calling the shared helper. This is the shared seam every
   subcommand needs.
2. **Fold `move` into the CLI** (Task 10). The move orchestration
   (`parseMoves` + `expandTestMirrors` + `applyMoves`) moves into a shared
   `planMove.ts`; `refactor move` and the existing `moveFiles.ts` both call it,
   so `npm run move-files` stays a thin alias with no behaviour change.

No other existing structure must grow or move: the new work is all additive
one-function files under the established `tools/utils/refactor/` home, plus the
thin `tools/refactor/` entry.

---

### Task 1: extract shared `Project` bootstrap (prep, behaviour-preserving)

**Files:** `tools/utils/refactor/loadRefactorProject.ts` (new),
`tools/dev/moveFiles.ts` (modify — call the helper),
`tests/tools/utils/refactor/loadRefactorProject.test.ts` (new)

**Signature:** `loadRefactorProject(): Project`
**Behaviour:** builds ONE ts-morph `Project` over `src/ + tests/ + tools/` with
`tsConfigFilePath: 'tsconfig.json'` + `skipAddingFilesFromTsConfig: true`, then
`addSourceFilesAtPaths(['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', 'tools/**/*.ts'])`
— lifted verbatim from `moveFiles.ts:88-92`. Didactic header: carry the "why one
Project spanning three trees / neither tsconfig covers all three" reasoning from
the `moveFiles.ts` header.

- [ ] Test `loads all three source trees` — construct via `loadRefactorProject()`,
      assert the returned `Project` contains at least one known file from each of
      `src/`, `tests/`, and `tools/` (real repo files, e.g. an existing util +
      its test). This catches the "silently missed a whole tree" regression the
      header warns about.
- [ ] Rewire `moveFiles.ts` to import and call `loadRefactorProject()` instead of
      constructing the `Project` inline; delete the inline construction.
- [ ] `npm test -- loadRefactorProject` → green; sanity-run
      `npm run move-files -- <a> <b> --dry` still previews correctly.
- [ ] Commit: the three files above.

### Task 2: symbol addressing + resolution

**Files:** `tools/utils/refactor/parseSymbolAddress.ts` (new),
`tools/utils/refactor/resolveSymbol.ts` (new),
`tests/tools/utils/refactor/parseSymbolAddress.test.ts` (new),
`tests/tools/utils/refactor/resolveSymbol.test.ts` (new)

Signatures per the **Shared contracts** section above. The load-bearing
behaviours are the error paths (fail loudly before any mutation, per Q7).

- [ ] `parseSymbolAddress` test `parses file#symbol into its parts` — one happy
      case asserting `{ file, symbol }`.
- [ ] `parseSymbolAddress` test `throws when the '#' delimiter is missing` and
      `throws on an empty file or empty symbol` — assert it throws (error-path
      behaviour, not the message text).
- [ ] `resolveSymbol` test `resolves an exported declaration` — in-memory Project
      with one exported `const`; assert `resolved.name` and that `sourceFile` is
      the right file.
- [ ] `resolveSymbol` test `throws when the file is not in the project`.
- [ ] `resolveSymbol` test `throws when the symbol is not exported from the file`.
- [ ] `resolveSymbol` test `throws and lists candidates on an ambiguous name` —
      seed a file with two declarations colliding on the name; assert the throw
      and that the message contains both candidates (the candidate-list contract).
- [ ] `npm test -- parseSymbolAddress resolveSymbol` → green.
- [ ] Commit: the four files above.

### Task 3: CLI skeleton + subcommand dispatch + batch driver

**Files:** `tools/refactor/refactor.ts` (new — thin entry),
`tools/utils/refactor/readManifest.ts` (new — shared `--manifest <path>` value
flag + JSON-array read; Task 10 rewires `moveFiles.ts` onto it),
`package.json` (add `"refactor": "tsx tools/refactor/refactor.ts"`)

Thin entry modelled on `moveFiles.ts`: parse the leading subcommand, resolve
`--dry`/`--json` via `parseFlags`, load the project via `loadRefactorProject()`,
dispatch to the subcommand handler (single or `--manifest` batch), print the
report, and `project.save()` once at the tail unless `--dry`. The
validate-all-then-apply guarantee is structural — the driver runs each entry's
planner against the ONE project inside a try, and a throw aborts before the
single save (mirrors `moveFiles.main`). Unknown subcommands and malformed
addresses fail loudly with a usage line.

No unit tests here — this is argv plumbing (testing.md: don't test flag
plumbing). The all-or-nothing behaviour is pinned at the planner level in later
tasks; a single end-to-end smoke lives in the DoD. Stub each subcommand handler
to throw `not yet implemented` so the skeleton typechecks and later tasks fill
them in.

- [ ] Add the npm script and the entry file with the dispatch skeleton + usage
      text; `refs`/`rename`/`extract`/`inline`/`delete`/`move` handlers stubbed.
- [ ] `npm run typecheck` clean; `npm run refactor -- refs <a real symbol>`
      reaches the stub (dispatch works) — will be wired in Task 4.
- [ ] Commit: `tools/refactor/refactor.ts`, `package.json`.

### Task 4: `refs` — structured reference reporter (reused by every mutating command)

**Files:** `tools/utils/refactor/collectRefs.ts` (new),
`tools/utils/refactor/renderRefReport.ts` (new),
`tools/refactor/refactor.ts` (wire the `refs` handler),
`tests/tools/utils/refactor/collectRefs.test.ts` (new),
`tests/tools/utils/refactor/renderRefReport.test.ts` (new)

Signatures + JSON shape per **Shared contracts**. `collectRefs` walks the
resolved symbol's references and classifies each by `RefKind`, records the
enclosing declaration, and counts distinct files + tests. Build fixtures as
in-memory Projects seeding an importer, a call site, a type-position use, a
re-export, and a file under `tests/`.

- [ ] `collectRefs` test `classifies an import-only reference as import`.
- [ ] `collectRefs` test `classifies a call site as call` (with the correct
      `enclosing` declaration name).
- [ ] `collectRefs` test `classifies a type-position use as type-position`.
- [ ] `collectRefs` test `classifies a re-export as re-export`.
- [ ] `collectRefs` test `counts references under tests/ as tests` — assert
      `testCount` and `fileCount` for a graph mixing a `src/` and a `tests/`
      referrer.
- [ ] `renderRefReport` test `--json output parses to the documented shape` —
      `JSON.parse(renderRefReport(report, true))` has `target`, `summary.refs/
      files/tests`, and `refs.length === report.refs.length` (structural, not a
      golden-text snapshot — text formatting is not pinned).
- [ ] Wire the `refs` handler: resolve, `collectRefs`, print `renderRefReport`.
- [ ] `npm test -- collectRefs renderRefReport` → green; `npm run refactor -- refs
      <real symbol> --json` prints valid JSON.
- [ ] Commit: the five files above.

### Task 5: `rename`

**Files:** `tools/utils/refactor/planRename.ts` (new),
`tools/refactor/refactor.ts` (wire the `rename` handler),
`tests/tools/utils/refactor/planRename.test.ts` (new)

**Signature:** `planRename(project, resolved, newName, renameFile)`.
**Behaviour (Q3):** repo-wide identifier rename via ts-morph. When `renameFile`
and the source filename equals the old symbol name, also rename the file and
drag its test mirror (reuse `expandTestMirrors` + `applyMoves` for the file
move); `--no-file-rename` sets `renameFile: false`. Fail loudly (via
`resolveSymbol`) before mutating on an unresolvable address.

- [ ] Test `renames the identifier across importers` — in-memory graph with an
      importer + a call site; assert both reference the new name after
      `planRename`.
- [ ] Test `renames the file and its test mirror when filename tracks the symbol`
      — seed `src/utils/x/foo.ts#foo` + `tests/utils/x/foo.test.ts`; rename to
      `bar` with `renameFile: true`; assert the source file is now `bar.ts` and
      the mirror is `bar.test.ts`.
- [ ] Test `leaves the file name when renameFile is false` — same seed; assert
      the identifier changes but `foo.ts` stays `foo.ts`.
- [ ] Wire the handler (`--no-file-rename` → `renameFile: false`).
- [ ] `npm test -- planRename` → green.
- [ ] Commit: the three files above.

### Task 6: `delete`

**Files:** `tools/utils/refactor/planDelete.ts` (new),
`tools/refactor/refactor.ts` (wire the `delete` handler),
`tests/tools/utils/refactor/planDelete.test.ts` (new)

**Signature:** `planDelete(project, resolved)`.
**Behaviour (Q5 option C + post-plan addendum):** refuses (throws, listing the
references via the `refs` reporter) when ANY reference exists — re-exports and
side-effect imports count as references like any other. There is no repair
branch: in a no-barrel repo re-exports are near-nonexistent, so the agent
hand-removes the rare one and re-runs. Otherwise removes the declaration and
removes the file + test mirror if it was a one-symbol file.

- [ ] Test `refuses to delete a referenced symbol and lists the references` —
      seed a referrer; assert `planDelete` throws and the message names the
      referring file.
- [ ] Test `refuses when the only reference is a re-export` — a file that
      `export { foo } from './foo'` and nothing else; assert the throw (pins
      that re-exports are not treated as ignorable plumbing).
- [ ] Test `deletes an unreferenced one-symbol file` — no referrers; assert the
      declaration is gone and the source file is removed from the project.
- [ ] Wire the handler.
- [ ] `npm test -- planDelete` → green.
- [ ] Commit: the three files above.

### Task 7: `inline` (passthrough-only)

**Files:** `tools/utils/refactor/detectPassthrough.ts` (new),
`tools/utils/refactor/planInline.ts` (new),
`tools/refactor/refactor.ts` (wire the `inline` handler),
`tests/tools/utils/refactor/detectPassthrough.test.ts` (new),
`tests/tools/utils/refactor/planInline.test.ts` (new)

**Behaviour (Q5):** `detectPassthrough` recognizes exactly the three proxy
shapes (alias `export const foo = bar`; same-signature single-call wrapper
`export function foo(x) { return bar(x) }`; `export { bar as foo }` re-export)
and returns `null` for anything richer (extra params, reordered args, added
logic, multiple statements). `planInline` errors (throws, listing references)
when `detectPassthrough` returns `null`; otherwise repoints importers/call sites
at `underlying` and deletes the wrapper (+ file + test mirror if one-symbol).

- [ ] `detectPassthrough` test `detects a const alias` → `{ kind: 'alias' }`.
- [ ] `detectPassthrough` test `detects a same-signature single-call wrapper` →
      `{ kind: 'wrapper' }`.
- [ ] `detectPassthrough` test `detects an aliased re-export` → `{ kind: 're-export' }`.
- [ ] `detectPassthrough` test `returns null for a wrapper that reorders args`
      and `returns null for a wrapper with extra logic` — the correctness guard
      that keeps `inline` from mangling a non-passthrough (Q5 hazard).
- [ ] `planInline` test `repoints call sites at the underlying symbol and deletes
      the wrapper file` — assert callers now call `bar` and the wrapper file is
      removed.
- [ ] `planInline` test `throws with the reference list on a non-passthrough` —
      seed a richer body; assert throw.
- [ ] Wire the handler.
- [ ] `npm test -- detectPassthrough planInline` → green.
- [ ] Commit: the five files above.

### Task 8: `classifyLocalDeps` (extract's dependency analysis)

**Files:** `tools/utils/refactor/classifyLocalDeps.ts` (new),
`tests/tools/utils/refactor/classifyLocalDeps.test.ts` (new)

**Signature + type** per **Shared contracts**. Given a resolved symbol, walk its
references to file-local (unexported) declarations transitively and split them
into `exclusive` (reachable ONLY through the target) vs `shared` (also
referenced by code that stays in the file). This is the core of the Q4 decision
and the single hardest piece to get right.

- [ ] Test `classifies a local helper used only by the target as exclusive` —
      seed `export A` → local `h` (used by nothing else); assert `h ∈ exclusive`,
      `shared` empty.
- [ ] Test `classifies a local helper shared with remaining code as shared` —
      local `h` used by `A` AND by another exported `B`; assert `h ∈ shared`.
- [ ] Test `follows the transitive chain` — `A` → local `h` → local `g`, neither
      used elsewhere; assert both `h` and `g` are `exclusive`. (Model on the real
      `superGalacticTransform.ts` chain cited in Q4.)
- [ ] Test `a mid-chain symbol shared by remaining code lands in shared` —
      `A` → `h` → `g`, where `g` is also used by staying code; assert `g ∈ shared`
      (and the extract will therefore block on it).
- [ ] `npm test -- classifyLocalDeps` → green.
- [ ] Commit: the two files above.

### Task 9: `extract`

**Files:** `tools/utils/refactor/planExtract.ts` (new),
`tools/refactor/refactor.ts` (wire the `extract` handler),
`tests/tools/utils/refactor/planExtract.test.ts` (new)

**Signature:** `planExtract(project, resolved, dest)`.
**Behaviour (Q4 option B):** create `dest`, move the declaration there, repoint
external importers at `dest`, re-import the symbol back into the source file if
it is still used internally, and drag every `exclusive` local dep
(`classifyLocalDeps`) into `dest` with it. If `shared` is non-empty, **throw
before mutating** with a message naming each shared dep and suggesting extracting
it first (Q4: the shared-dep block is a design signal, not a failure to smooth
over). Refuse if `dest` already exists. A previously-unexported dragged symbol is
necessarily exported from `dest` (inherent, not warned).

- [ ] Test `moves the declaration to dest and repoints importers` — external
      importer now imports from `dest`; the symbol is gone from the source.
- [ ] Test `re-imports into the source when the source still uses the symbol` —
      source references the extracted symbol internally; assert an import of it
      from `dest` is added to the source.
- [ ] Test `drags an exclusive local dep into dest` — `A` + exclusive local `h`;
      after extract, `dest` contains both and the source no longer declares `h`.
- [ ] Test `throws and names the shared dep when a local dep is shared` — assert
      throw, message names the shared symbol, and (all-or-nothing) the source
      file is UNCHANGED — nothing was moved.
- [ ] Test `refuses when dest already exists`.
- [ ] Wire the handler.
- [ ] `npm test -- planExtract` → green.
- [ ] Commit: the three files above.

### Task 10: fold `move` into the CLI (prep — keep `move-files` working)

**Files:** `tools/utils/refactor/planMove.ts` (new — shared move orchestration),
`tools/refactor/refactor.ts` (wire the `move` handler),
`tools/dev/moveFiles.ts` (modify — delegate to `planMove`),
`tests/tools/utils/refactor/planMove.test.ts` (new)

Extract the `moveFiles.ts` orchestration (parse raw pairs → `expandTestMirrors`
→ `applyMoves`) into `planMove(project, moves)`; both `refactor move` and
`moveFiles.ts` call it, so `npm run move-files` becomes a thin alias with no
behaviour change (Q8 option B). Rewire `moveFiles.ts`'s manifest reading onto
the shared `readManifest.ts` from Task 3 (retiring its private `indexOf`
idiom). The `move` manifest keeps the existing `[{ from, to }]` shape. Use `npm run move-files` semantics verbatim — the
existing `applyMoves`/`expandTestMirrors` tests already cover the rewriting; add
only the thin-orchestration test.

- [ ] Test `expands a source move to drag its test mirror then applies both` —
      in-memory project + a `fileExists` stub; assert both the source and its
      mirror are moved (that `planMove` chains expand→apply, the one new
      behaviour this file owns).
- [ ] Wire `refactor move`; rewire `moveFiles.ts` to delegate to `planMove` +
      `loadRefactorProject`.
- [ ] `npm test -- planMove applyMoves expandTestMirrors` → green;
      `npm run move-files -- <a> <b> --dry` and `npm run refactor -- move <a> <b>
      --dry` both preview identically.
- [ ] Commit: the four files above.

### Task 11: skills + CLAUDE.md doc line

**Files:** `.claude/skills/refactor/SKILL.md` (new),
`.claude/skills/move-files/SKILL.md` (slim to point at the new skill),
`CLAUDE.md` (add the `npm run refactor` commands-table line)

Documentation only — no tests. The new skill covers all six subcommands (when to
reach for each), and the cross-cutting blind spots that apply to EVERY op (from
the `move-files` skill, generalized): `.wesl` `package::` imports and
string-literal paths are NOT rewritten — grep after; commit hygiene — a pure
mechanical op goes in its own commit so git rename detection survives; `--dry`
first. The `move-files` skill slims to a short "moving files is `refactor move`;
see the refactor skill" pointer while keeping its trigger phrases (many memories
and CLAUDE.md name `move-files`). Prose follows the no-LLM-tells rule.

- [ ] Write `.claude/skills/refactor/SKILL.md` (frontmatter `name` + `description`
      with trigger phrases; per-subcommand "when to reach for it"; shared blind
      spots; commit hygiene).
- [ ] Slim `.claude/skills/move-files/SKILL.md` to point at the refactor skill,
      preserving its trigger phrases.
- [ ] Add one line to the CLAUDE.md Commands table:
      `npm run refactor    # ts-morph refactoring CLI → .claude/skills/refactor/SKILL.md`.
- [ ] Commit: the three files above.

---

## Definition of Done

`npm run typecheck && npm test` green (both tsconfigs; the full suite stays
green). Plus:

- `npm run refactor -- refs <file>#<symbol>` on a real repo symbol prints a
  classified report; `--json` parses to the documented shape.
- Each mutating subcommand works end-to-end on a real symbol under `--dry`
  (blast-radius report) and for real (single `project.save()`), verified by
  `git diff` + a follow-up `npm run typecheck`.
- `extract` on a shared-local-dep target refuses with the naming message and
  leaves the tree untouched (all-or-nothing).
- `npm run move-files -- <a> <b>` still moves files + test mirrors identically
  (regression — the fold-in changed nothing observable).
- `.claude/skills/refactor/SKILL.md` exists, `move-files` skill points at it, and
  the CLAUDE.md commands table lists `npm run refactor`.

## Out of scope

- **Change-signature** (reorder/add/remove params across call sites) — Q1: the
  agent handles those call-site-by-call-site with `refs` as the worklist.
- **General (non-passthrough) inlining** — Q5: correctness hazard; `refs` +
  `delete` cover the manual path.
- **MCP daemon / long-lived warm Project** — Q2: batch/manifest mode captures
  most of the speed win; revisit only if one-shot latency bites in practice.
- **Transitive importer-closure in `refs`** — Q6: depth ≥ 2 in a no-barrel repo
  balloons to half the tree; chain `refs` calls for the rare genuine need.
- **Built-in typecheck / clean-git requirement** — Q7: git is the safety net;
  `--dry` + the structured report is the preview.
