# Refactor CLI on TypeScript 7, PR A: engine, `refs`, `rename`, `delete`

> **Spec.** [`2026-11-23-refactor-cli-native-engine-design.md`](../specs/2026-11-23-refactor-cli-native-engine-design.md).
> This plan covers PR A (§2). PR B (the four new subcommands) gets its own plan once A's contracts
> are in the tree.
> **Execution.** Subagent-driven, lean protocol ([`sdd-execution.md`](../conventions/sdd-execution.md)).
> One PR at a time; no perf gate (no renderer code).

## Strategy

The CLI keeps working after every task. Tasks 1 and 2 are prep and change no behaviour. Task 3
adds the plan types, Task 4 the engine adapter. Tasks 5 to 7 move one subcommand each onto the
engine. Task 8 deletes what nothing uses any more and updates the docs.

Two rules hold throughout:

- **Every file under an `@types/` folder is a `.d.ts`** (`typeFilesAreDeclarations` test), so read each `@types/…/X.ts` below as `X.d.ts`.
- **Only `tools/utils/refactor/engine/` imports `typescript-native`.** Import it as
  `typescript-native/unstable/sync`. Nothing outside the folder sees one of its types.
- **Single-file syntax is read with the TypeScript 6 parser** (`import ts from 'typescript'`,
  `ts.createSourceFile`), the way `packages/move-files/src/findTsReferences.ts` does. The engine
  answers only "where is this referenced". Offsets from both are UTF-16 units and index a
  JavaScript string.

Facts about the TS 7 API, probed on 7.0.2:

- `new API({ cwd, fs? })`; `api.updateSnapshot({ openProjects: [abs tsconfig paths] })` returns a
  snapshot; `api.updateSnapshot({ fileChanges: { changed: [abs paths] } })` resyncs after the
  `fs.readFile` overlay changed; `api.close()`.
- `snapshot.getProjects()`; `project.program.getSourceFile(abs)`; `project.program.getSourceFileNames()`.
- `project.checker.getReferencedSymbolsForNode(node, pos)` returns entries with
  `references: NodeHandle[]`; `handle.resolve()` gives a node with `pos`, `end`, `kind`, `parent`,
  `getSourceFile().fileName`.
- A handle's own `path` is lowercased on a case-insensitive disk: take the path from
  `resolve().getSourceFile().fileName`.
- A node's `pos` includes leading whitespace and comments; `end` is exact.
- A file that sits in two projects is reported once per project.
- The four projects: `tsconfig.json`, `tsconfig.tools.json`, `packages/desktop/tsconfig.json`,
  `packages/website/tsconfig.json`.

---

### Task 1 (prep): the driver dispatches from a subcommand table

**Files:** `tools/refactor/refactor.ts` (modify), `tools/refactor/@types/Subcommand.ts` (create),
`tools/refactor/@types/LegacyInput.ts` (create)

```ts
export type LegacyInput = {
  readonly project: Project; // ts-morph
  readonly positionals: readonly string[];
  readonly flags: Flags;
};

export type Subcommand = {
  readonly name: string;
  readonly usage: string; // one line of the usage text
} & { readonly kind: 'legacy'; readonly run: (input: LegacyInput) => void };
```

- [x] Replace the `if (sub === …)` chain (`refactor.ts:89-150`) with five rows in
      `SUBCOMMANDS: readonly Subcommand[]`. The driver finds the row by name.
- [x] Hoist the preview (`collectRefs` + `renderRefReport`, copied into four arms) into the driver:
      it prints once for every subcommand, before the row runs. `refs` is a row whose `run` does
      nothing more.
- [x] Build `USAGE` from the rows' `usage` lines.
- [x] No behaviour change and no new test: `npm run refactor -- refs tools/utils/refactor/planRename.ts#planRename`
      and `rename … --dry` print what they printed before.
- [x] Commit.

### Task 2 (prep): shared types move to `tools/@types/refactor/`

**Files:** `tools/@types/refactor/{RefKind,RefEntry,RefReport,SymbolAddress,ResolvedSymbol}.ts`
(create), `tools/utils/refactor/{collectRefs,parseSymbolAddress,resolveSymbol}.ts` (modify),
their importers, `tests/helpers/conventions/inlineTypeFiles.ts` (modify)

- [x] Move each type to its own file. Try `npm run refactor -- extract tools/utils/refactor/collectRefs.ts#RefKind tools/@types/refactor/RefKind.ts --dry`
      first; `extract` has a known bug with type-only imports, so if the result does not compile,
      move that type by hand and fix its importers.
- [x] Remove `collectRefs.ts`, `parseSymbolAddress.ts` and `resolveSymbol.ts` from the allow-list
      (`inlineTypeFiles.ts:307-311`).
- [x] Move-only: no type changes shape. No new test; `npm test -- conventions tools/utils/refactor` passes.
- [x] Commit.

### Task 3: plan types and `foldEdits`

**Files:** `tools/@types/refactor/{TextEdit,Plan,Finding,PlanResult}.ts` (create),
`tools/utils/refactor/foldEdits.ts` (create), `tests/tools/utils/refactor/foldEdits.test.ts` (create)

```ts
export type TextEdit = {
  readonly file: string; // absolute path, real case
  readonly start: number; // UTF-16 offset
  readonly end: number;
  readonly text: string;
};

export type Finding = { readonly file: string; readonly line: number; readonly message: string };

export type Plan = {
  readonly edits: readonly TextEdit[];
  readonly moves: readonly MovePair[]; // packages/move-files/src/@types/MovePair, absolute paths
  readonly deletes: readonly string[]; // absolute paths
  readonly findings: readonly Finding[];
};

export type PlanResult =
  | { readonly ok: true; readonly plan: Plan }
  | { readonly ok: false; readonly refusals: readonly string[] };

/** New text per edited file. `read` returns a file's current text. */
export function foldEdits(
  edits: readonly TextEdit[],
  read: (file: string) => string,
): ReadonlyMap<string, string>;
```

- [x] Test `foldEdits applies several edits to one file without shifting later offsets`.
- [x] Test `foldEdits drops an exact duplicate edit` (the same reference reported twice).
- [x] Test `foldEdits throws when two different edits overlap`, naming the file.
- [x] Implement, commit.

### Task 4: the engine adapter

**Files:** `tools/@types/refactor/{Engine,NodeLocation}.ts` (create),
`tools/utils/refactor/engine/{openEngine,findReferences,syncOverlay,closeEngine}.ts` (create),
`tools/utils/refactor/engine/ENGINE_PROJECTS.ts` (create, the four tsconfig paths),
`tests/helpers/refactor/engineFixture.ts` (create),
`tests/tools/utils/refactor/engine/{engineContract,engineCoverage}.test.ts` (create)

```ts
/** The span of one name token: an identifier or the inside of a string-literal key. */
export type NodeLocation = { readonly file: string; readonly start: number; readonly end: number };

/** Opaque outside the engine folder. */
export type Engine = { readonly root: string; readonly overlay: Map<string, string> /* + private */ };

export function openEngine(input: { root: string; projects: readonly string[] }): Engine;
/** Every reference to the symbol named at `at`, the declaration included, each file once. */
export function findReferences(engine: Engine, at: NodeLocation): readonly NodeLocation[];
/** Tell the engine these files' overlay text changed. */
export function syncOverlay(engine: Engine, changed: readonly string[]): void;
export function closeEngine(engine: Engine): void;

/** Test helper: an engine over a small project given as path → text. */
export function engineFixture(files: Record<string, string>): { engine: Engine; root: string; dispose: () => void };
```

`Engine` must not name a `typescript-native` type in its exported shape; keep the API handle
behind a field typed `unknown` or in a module-private `WeakMap`.

`findReferences` returns exact token spans (no leading trivia), real-case paths, sorted by file
then start, with duplicates across projects removed.

`engineFixture` writes the files in memory through the API's `fs` option if the engine accepts a
tsconfig that exists only there; otherwise it writes them to a `mkdtemp` directory and `dispose`
removes it. Try in-memory first and say in your reply which one it is.

- [x] Contract test `findReferences returns the declaration and every use, as exact token spans`:
      a two-file fixture, assert `text.slice(start, end)` is the name for every result.
- [x] Contract test `findReferences reports a file in two projects once`.
- [x] Contract test `spans index a JavaScript string after a non-ASCII character` (an emoji in a
      comment before the reference).
- [x] Contract test `syncOverlay makes the engine see changed text`: add a reference through
      `engine.overlay`, sync, the count rises by one.
- [x] Coverage test `every refactor-glob file sits in one of the engine's projects`: glob
      `src/**`, `tests/**`, `tools/**`, `packages/*/{src,tests,scripts}/**` (`.ts`, `.tsx`, and
      `.cts` under `packages/*/src`) and compare, lowercased, against `getSourceFileNames()` of
      the four projects. This test opens the real repo; give it a 30 s timeout.
- [x] `package.json` keeps `typescript-native` pinned to exactly `npm:typescript@7.0.2`; add the
      test `typescript-native is pinned to an exact version` beside the contract tests.
- [x] Commit.

### Task 5: `refs` on the engine

**Files:** `tools/@types/refactor/{SymbolRefKind,RefEntry,RefReport}.ts` (create/modify),
`tools/@types/refactor/RefKind.ts` (delete), `tools/utils/refactor/locateExport.ts` (create),
`tools/utils/refactor/classifySymbolRef.ts` (create), `tools/utils/refactor/collectRefs.ts`
(rewrite), `tools/utils/refactor/renderRefReport.ts` (modify),
`tools/utils/refactor/planInline.ts` (modify), `tools/refactor/refactor.ts` and
`tools/refactor/@types/{Subcommand,RunInput}.ts` (modify/create), tests for each new file,
`tests/tools/utils/refactor/{collectRefs,planInline}.test.ts` (modify)

```ts
export type SymbolRefKind = 'import' | 'call' | 'type-position' | 're-export' | 'value';

export type RefEntry<Kind> = {
  readonly filePath: string; // root-relative, as today
  readonly line: number;
  readonly column: number;
  readonly kind: Kind;
  readonly inTest: boolean;
  readonly enclosing: string;
};

export type RefReport<Kind> = {
  readonly target: string;
  readonly refs: readonly RefEntry<Kind>[];
  readonly fileCount: number;
  readonly testCount: number;
};

/** The name token of the exported declaration, or a refusal message (not exported / ambiguous). */
export function locateExport(
  text: string,
  address: SymbolAddress,
): { ok: true; at: NodeLocation } | { ok: false; refusal: string };

/** `text` is the file's text; `at` a reference inside it. Parsed with the TypeScript 6 parser. */
export function classifySymbolRef(text: string, at: NodeLocation): SymbolRefKind;

export function collectRefs(input: {
  address: SymbolAddress;
  engine: Engine;
  read: (file: string) => string;
}): { ok: true; report: RefReport<SymbolRefKind>; at: NodeLocation; refs: readonly NodeLocation[] }
  | { ok: false; refusal: string };

export type RunInput = {
  readonly engine: Engine;
  readonly read: (file: string) => string; // overlay first, then disk
  readonly positionals: readonly string[];
  readonly flags: Flags;
};

// Subcommand grows two kinds:
| { readonly kind: 'report'; readonly report: (run: RunInput) => string }
| { readonly kind: 'plan'; readonly plan: (run: RunInput) => PlanResult }
```

Rules, carried from today's `collectRefs.ts:90-140` except where marked:

- The declaration itself is not a reference.
- `'import'`: inside an import declaration. `'re-export'`: inside an export declaration with a
  module specifier, or `export { x }`. `'type-position'`: in a type node, `implements`/`extends`
  of a type, or a type-only position. `'call'`: the callee of a call or `new`.
- **New:** `'value'` is every other use (`const alias = area`, an argument, a shorthand property).
  Today these fall into `'call'`.
- **New:** a path under `tests/` (or `packages/*/tests/`) sets `inTest: true` and keeps the real
  kind. Today it replaces the kind with `'test'` (`collectRefs.ts:106`).
- `locateExport` matches what `resolveSymbol.ts:41-67` accepts and refuses with the same two
  messages (not an exported declaration; ambiguous).

Driver:

- The driver opens the engine for every run (`ENGINE_PROJECTS`), and loads ts-morph only when the
  row is `legacy`. It closes the engine on every exit path.
- The preview for `legacy` rows now comes from this `collectRefs`.
- `refs` becomes `kind: 'report'`.
- `planInline` no longer calls `collectRefs`; it takes the report as an argument
  (`planInline.ts:64`).
- `renderRefReport` prints `inTest` in `--json`; the text row appends ` (test)` after the kind.

Tests:

- [x] `classifySymbolRef` — one test per kind, one fixture line each: `import`, `call`, `new`
      as call, `type-position`, `re-export`, `value` for an alias, `value` for a shorthand property.
- [x] `locateExport` — finds a function, a const, a type alias; refuses a non-exported name;
      refuses an ambiguous name (function overloads count as one).
- [x] `collectRefs` — `a call inside tests/ is kind 'call' with inTest true`;
      `the declaration is not counted`; `fileCount and testCount match the entries`.
- [x] Delete the ts-morph `collectRefs` tests these replace.
- [x] `npm run refactor -- refs src/@types/engine/EngineState.ts#EngineState` reports 573
      references in 203 files and finishes in under 1.5 s wall time. Put the real numbers in
      your reply (the counts may have moved since 2026-11-22; a different count is fine if the
      old CLI on `main` agrees).
- [x] Commit.

### Task 6: `rename` on the engine, and the write path

**Files:** `tools/utils/refactor/planRename.ts` (rewrite), `tools/utils/refactor/renameEdit.ts`
(create), `tools/utils/refactor/{foldPlan,writePlan}.ts` (create),
`tools/@types/refactor/Overlay.ts` (create), `tools/refactor/refactor.ts` (modify),
`tests/tools/utils/refactor/{planRename,renameEdit,foldPlan,writePlan}.test.ts` (rewrite/create)

```ts
export function planRename(input: {
  address: SymbolAddress;
  newName: string;
  renameFile: boolean;
  engine: Engine;
  read: (file: string) => string;
  exists: (file: string) => boolean;
}): PlanResult;

/** The edit that renames one reference, keeping the meaning of shorthand and aliases. */
export function renameEdit(text: string, at: NodeLocation, newName: string): TextEdit;

/** Fold a plan into `overlay` (texts, moves, deletes) without touching disk. */
export function foldPlan(plan: Plan, overlay: Overlay, root: string): void;
/** Write the overlay to disk through move-files' applyPlan, then remove deleted files. */
export function writePlan(overlay: Overlay, root: string): ApplyResult;
```

`Overlay` (`tools/@types/refactor/Overlay.ts`) is the run's pending state:
`{ texts: Map<string, string>; moves: MovePair[]; deletes: Set<string> }`. `foldPlan` gets its own
file and test file.

`renameEdit` rules:

- A plain identifier is replaced.
- Shorthand in an object literal, `{ foo }`, becomes `{ foo: newName }` when `foo` is a use of the
  renamed symbol.
- Shorthand in a destructure is not a use of an exported symbol and does not occur here.
- `import { foo }` becomes `import { newName }`; `import { foo as bar }` renames only `foo`.
- `export { foo }` and `export { foo as bar }` follow the same rule.

`planRename` rules (today's, from `planRename.ts:21-60`):

- Refuses when `newName` is not a valid identifier or equals the old name, and when
  `locateExport` refuses.
- When `renameFile` is true and the file's basename (minus `.d.ts` or the extension) equals the
  old name, the plan carries the file move plus its companions from `expandCompanions` with
  `companionRules`, using `exists` as the oracle. Otherwise no move.

`foldPlan` rules:

- Text edits go through `foldEdits` into `overlay.texts`.
- For moves, import specifiers in every other file are rewritten with move-files'
  `rewriteReferences` over the overlay's texts, exactly as `applyMoves.ts:17-40` does over the
  ts-morph project today; the moved file's text is re-keyed to its new path.
- A destination that already exists and is not itself being moved is an error (what
  `assertDestinationsFree.ts` checks today).

Driver, for `kind: 'plan'` rows:

- Preview as before, then `plan(run)`. Refusals print once and set exit code 1; nothing is written.
- In a batch, each entry's plan is folded with `foldPlan`, then `syncOverlay` is called with the
  changed files so the next entry sees them. If the engine cannot be made to see a moved file
  through its `fs` option, stop and report it: do not write to disk between entries.
- `--dry` stops after the preview. Otherwise `writePlan` runs once, after the last entry.
- Findings print as `file:line  message` and set exit code 1 after the write.

Tests:

- [x] `renameEdit` — one test per rule above (5).
- [x] `planRename` — `renames the declaration and a use in another file`;
      `carries the file move and its test mirror when the basename is the symbol`;
      `carries no move when the basename differs`; `carries no move under renameFile false`;
      `refuses an invalid identifier`; `refuses a symbol that is not exported`.
- [x] `foldPlan` — `rewrites an importer's specifier when a file moves`;
      `throws when a destination exists`;
      `a second plan sees the first plan's text` (two folds, the second edit lands on the first's result).
- [x] `writePlan` — against a `mkdtemp` directory: `writes edited texts, moves files, removes deleted files`.
- [x] **Parity, before the old code goes:** with the old ts-morph `planRename` still reachable
      (keep it as `planRenameLegacy.ts` for this step), write a throwaway script outside the repo
      tree that renames ten exported symbols of different kinds (type, function, const, enum,
      class; at least two whose file is renamed) on both paths in memory and compares the
      resulting texts file by file. Report the result per symbol in your reply. Any difference is
      a stop: report it, do not paper over it.
- [x] Delete `planRenameLegacy.ts`; `rename` becomes `kind: 'plan'`.
- [x] Commit.

### Task 7: `delete` on the engine

**Files:** `tools/utils/refactor/planDelete.ts` (rewrite),
`tools/utils/refactor/declarationSpan.ts` (create), `tools/refactor/refactor.ts` (modify),
`tests/tools/utils/refactor/{planDelete,declarationSpan}.test.ts` (rewrite/create)

```ts
export function planDelete(input: {
  address: SymbolAddress;
  engine: Engine;
  read: (file: string) => string;
  exists: (file: string) => boolean;
}): PlanResult;

/** The span to cut for an exported declaration: its statement, leading comment and one line break. */
export function declarationSpan(text: string, at: NodeLocation): { start: number; end: number };
```

Rules (today's, from `planDelete.ts:58-100`):

- Any reference of any kind, tests included, refuses. The refusal is the header
  `Cannot delete '<target>': N reference(s) still point to it. Remove them first, then re-run:`
  followed by the text report.
- One declarator of a multi-declarator `export const a = 1, b = 2` is cut alone.
- When the symbol was the file's only export and no non-import statement is left after the cut,
  the plan deletes the file (no edit for it) and its companions from `expandCompanions`.
  `hasMeaningfulStatements.ts` is ts-morph-typed: write the check on the TS 6 parse inside
  `planDelete` or as its own util if it is more than a few lines.

Tests:

- [x] `planDelete` — keep today's five cases, rewritten on `engineFixture`: refuses with a
      reference in `src`; refuses with a reference only in a test; removes one export of two and
      keeps the file; deletes the file and its test mirror for a sole export; keeps a file that
      still has a side-effect statement.
- [x] `declarationSpan` — `takes the leading JSDoc with the statement`;
      `cuts one declarator of two`.
- [x] `delete` becomes `kind: 'plan'`. `npm run refactor -- delete src/@types/engine/EngineState.ts#EngineState`
      prints the refusal once and leaves `git status` clean.
- [x] Commit.

### Task 8: delete the leftovers, update the docs

**Files:** `tools/utils/refactor/{applyMoves,assertDestinationsFree}.ts` and
`tests/tools/utils/refactor/applyMoves.test.ts` (delete),
`.claude/skills/refactor/SKILL.md`, `CLAUDE.md`, `docs/BACKLOG.md`,
`docs/backlog/2026-07-21-refactor-cli-followups.md` (modify)

- [ ] Delete the two files and the test once nothing imports them. `resolveSymbol.ts`,
      `removeFileWithMirror.ts` and `hasMeaningfulStatements.ts` stay if `extract` or `inline`
      still import them; delete any that nothing imports.
- [ ] `SKILL.md`: the header and intro say which subcommands run on TypeScript 7 (about 1 s) and
      which on ts-morph (about 8 s); document `inTest` and the `'value'` kind in the `--json`
      shape; say that exit 1 after a write means findings.
- [ ] `CLAUDE.md` commands block: `npm run refactor    # refactoring CLI (rename/delete/refs on TS 7; extract/inline on ts-morph) → .claude/skills/refactor/SKILL.md`.
- [ ] Backlog: remove the dispatch-table and double-printed-refusal items from the follow-ups
      detail file and reword its index line in `docs/BACKLOG.md` to what remains; in the
      header-trim line drop `collectRefs`, `planDelete` and `refactor.ts` if their headers are now
      within budget (module header ≤ 10 lines).
- [ ] Every file this plan created or rewrote keeps the comment budget: header ≤ 10 lines,
      comment lines ≤ half the code lines.
- [ ] Commit.

## Definition of Done

**Deliverables**

- `tools/utils/refactor/engine/` is the only importer of `typescript-native` (grep proves it).
- `tools/@types/refactor/` holds `TextEdit`, `Plan`, `Finding`, `PlanResult`, `Overlay`, `Engine`,
  `NodeLocation`, `SymbolRefKind`, `RefEntry`, `RefReport`, `SymbolAddress`, `ResolvedSymbol`.
- `tools/refactor/refactor.ts` has no `if (sub ===` chain.
- `applyMoves.ts`, `assertDestinationsFree.ts` and the ts-morph `collectRefs` body are gone.

**Smoke pass**

- `refs` on `EngineState`: same counts as the old CLI, under 1.5 s.
- `rename --dry` on `EngineState`: same set.
- A real rename of a small util renames its file and its test; `npm run typecheck` passes; then
  revert it.
- `delete` on a referenced symbol: refusal printed once, exit 1, tree untouched.
- `extract --dry` and `inline --dry` on one symbol each: preview printed, no crash.
- A manifest of two renames, the second touching a file the first changed: one write, typecheck passes.

**Deferred**

- `prop-refs`, `rename-prop`, `remove-prop`, `params-to-object`, `PropAddress`, `Target`,
  `findSignatureUsage`: PR B.
- `extract` and `inline` on TS 7 and their open bugs.
- A built-in typecheck after a run.
