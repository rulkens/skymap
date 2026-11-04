# move-files Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ts-morph move path with a generic, single-pass package at `packages/move-files`.

**Architecture:** Pure core: file text and moves in, edits and guard findings out. Disk and git stay in thin edges. `move-files` and `refactor rename`'s file move share the engine.

**Tech Stack:** TypeScript, the `typescript` parser only (no Program, no ts-morph in the package), Node `parseArgs`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-04-move-files-package-design.md`

## Global Constraints

- No import from outside `packages/move-files/` inside the package, and no skymap paths in its code.
- `typescript` is a peer dependency; the package does not depend on ts-morph.
- One symbol per file, filename = symbol; types in `packages/move-files/src/@types/`, one per file. No barrels.
- `tools/` imports the package by relative path, never by package name: a worktree without its own install resolves a package name to the main checkout's copy.
- Tests live in `tests/packages/move-files/`, mirroring `src/`. `tests/**` is what Vitest includes.
- All core paths are absolute and POSIX; edges convert.
- Comments per `docs/superpowers/conventions/comments.md`: module header ≤ 10 lines.

## Review Focus

1. A case-only rename (`Foo.ts` → `foo.ts`) on macOS's case-insensitive disk must not delete the file it just wrote. Pinned in Task 7.
2. A chain or swap in one batch (`a→b`, `b→a`) must resolve against the old layout and not report an occupied destination. Pinned in Task 4 and Task 6.
3. Keeping a spelling must not silently change meaning: `./foo` could start hitting a new `foo.ts` instead of `foo/index.ts`. Pinned in Task 3.
4. Offsets must survive a BOM and non-ASCII text. A wrong offset corrupts source. Pinned in Task 4.
5. The filter must never skip a real importer of an `index` file: `from '../math'` doesn't contain the word `index`. Pinned in Task 4.

---

### Task 1: Prep: package skeleton and one rule table

Behaviour unchanged; commit alone.

**Files:**
- Create: `packages/move-files/package.json`, `packages/move-files/src/@types/MovePair.ts`, `packages/move-files/src/@types/CompanionRule.ts`, `move-files.config.json`
- Move: `tools/utils/refactor/expandTestMirrors.ts` → `packages/move-files/src/expandCompanions.ts`; `tests/tools/utils/refactor/expandTestMirrors.test.ts` → `tests/packages/move-files/expandCompanions.test.ts`
- Modify: `tsconfig.tools.json` (add `packages/move-files/src` to `include`, because the CLI is only ever spawned and no test imports it), `tools/utils/refactor/{applyMoves,planMove,planRename,parseMovePairEntry,renderMoveReport,removeFileWithMirror,anchorToMirroredRoot}.ts`, `tools/dev/moveFiles.ts`, `tests/helpers/conventions/inlineTypeFiles.ts:333`; comments citing "the `MovePair` pattern" in `resolveSymbol.ts:27`, `classifyLocalDeps.ts:61`, `parseSymbolAddress.ts:25`, `detectPassthrough.ts:34`, `collectRefs.ts:48`

**Interfaces — produces:**

```ts
export type MovePair = { readonly from: string; readonly to: string };
export type CompanionRule = {
  readonly from: string; // root prefix; '' matches anywhere
  readonly to: string;
  readonly sources: readonly string[]; // extensions of the primary
  readonly suffixes: readonly string[]; // replace the primary's extension
};
export function expandCompanions(
  moves: ReadonlyArray<MovePair>,
  rules: ReadonlyArray<CompanionRule>,
  fileExists: (path: string) => boolean,
): MovePair[]; // originals first, then derived; a `from` already in `moves` is not derived again
```

`move-files.config.json`: rules `src/`→`tests/` and `tools/`→`tests/tools/` with sources `.ts`, `.tsx` and suffixes `.test.ts`, `.test.tsx`, plus `packages/move-files/src/`→`tests/packages/move-files/`. No sibling rule yet.

- [x] Run the move, with both pairs explicit because `packages/` has no mirror rule yet: write a manifest and `npm run move-files -- --manifest <file>`.
- [x] `npm run refactor -- rename 'packages/move-files/src/expandCompanions.ts#expandTestMirrors' expandCompanions --no-file-rename`
- [x] Create `package.json`: name `@skymap/move-files`, `private: true`, `type: module`, peer dependency `typescript`. Run `npm install` so the lockfile records the workspace.
- [x] `npm run refactor -- extract 'tools/utils/refactor/applyMoves.ts#MovePair' packages/move-files/src/@types/MovePair.ts`, then delete `tools/utils/refactor/applyMoves.ts` from the allow-list.
- [x] Add a `rules` argument to `expandCompanions`, replacing `mirrorBase` (`expandTestMirrors.ts:43-50`). `tools/` reads rules from `move-files.config.json` by JSON import.
- [x] `anchorToMirroredRoot.ts:29`: derive roots from the rules, longest first, so `packages/move-files/src/` isn't anchored at `/src/`.
- [x] `removeFileWithMirror.ts:34`: replace the `tests/` prefix check with skipping the first entry, since originals come first.
- [x] Extend `expandCompanions.test.ts`; existing assertions pass with the skymap rules passed in:
  - `a rule with an empty root derives a sibling` : `Foo.tsx` + `{from:'',to:'',sources:['.tsx'],suffixes:['.module.css']}` → adds `{from:'a/Foo.module.css',to:'b/Foo.module.css'}`
  - `an explicit pair overrides a derived one` : a moved source and an explicit pair for its test → the test appears once, with the explicit `to`
  - `a move across rules uses the destination's rule` : `tools/x.ts`→`src/x.ts` with test `tests/tools/x.test.ts` → `tests/x.test.ts`
  - `a stem rename carries to the companion` : `a/Foo.tsx`→`b/Bar.tsx` → `b/Bar.module.css`
- [x] `npm run typecheck:fast`; `npx vitest run tests/packages/move-files tests/tools/utils/refactor`. Commit.

### Task 2: Prep: delete `refactor move`

**Files:** `tools/refactor/refactor.ts`, `.claude/skills/refactor/SKILL.md`

No new test: this is a deletion and the compiler covers it.

- [x] Remove `'move'` from `SUBCOMMANDS` and the `else` branch at `refactor.ts:168-191`, plus the `move` case of `entryToPositionals`, usage lines and imports. `ADDRESS_SUBCOMMANDS` and `SUBCOMMANDS` then collapse into one list, and `isAddressSubcommand` goes.
- [x] `SKILL.md:19` and `:62-66`: remove `refactor move`; say `npm run move-files` is the only move command.
- [x] `npm run typecheck:fast`; `npx vitest run tests/tools/utils/refactor`. Commit.

### Task 3: Resolve and spell a reference

**Files:** create `packages/move-files/src/{resolveReference,spellReference}.ts`, `src/@types/{AliasRule,AliasScope,ReferenceShape,ResolvedReference}.ts`; tests beside them in `tests/packages/move-files/`.

**Interfaces — produces:**

```ts
export type ReferenceShape = 'exact' | 'bare' | 'js' | 'dir';
export type AliasRule = { readonly pattern: string; readonly targets: readonly string[] }; // tsconfig paths, targets absolute
export type AliasScope = { readonly dir: string; readonly rules: readonly AliasRule[] };
export type ResolvedReference = {
  readonly target: string;
  readonly shape: ReferenceShape;
  readonly query: string; // '?worker' or ''
  readonly alias: AliasRule | null;
};
export function resolveReference(
  specifier: string, importer: string, hasFile: (path: string) => boolean, scopes: readonly AliasScope[],
): ResolvedReference | null;
export function spellReference(
  reference: ResolvedReference, specifier: string, newImporter: string, newTarget: string,
  hasFile: (path: string) => boolean, scopes: readonly AliasScope[],
): string;
```

Resolution order follows TS bundler mode: exact, then `.ts`, `.tsx`, `.d.ts`, then `.js`/`.jsx` standing for TS, then `/index.{ts,tsx,d.ts}`. Non-relative specifiers resolve only through the nearest scope's aliases; a bare package name returns `null`.

- [x] Write the tests, watch them fail, implement, watch them pass:
  - `resolves in TS order` : `./x` with both `x.ts` and `x.tsx` → `x.ts`
  - `treats .js as standing for .ts` : `./x.js` + `x.ts` → shape `js`
  - `splits a query` : `./x.worker?worker` → target `x.worker.ts`, query `?worker`
  - `keeps the written shape` : a table of `./x`→`./sub/x`, `./x.ts`→`./sub/x.ts`, `./x.js`→`./sub/x.js`, `./dir`→`./sub/dir`, `?worker` kept
  - `keeps .tsx extension spelling` : `./Card.tsx` from a moved importer → `../Card/Card.tsx`
  - `falls back when the spelling would hit another file` : `./foo` was `foo/index.ts`, and the new layout has `foo.ts` beside it → `./foo/index`
  - `keeps an alias while the target stays inside it` : `@/a/b` to `src/c/b.ts` with `@/*`→`src/*` → `@/c/b`
  - `falls back to relative when the target leaves the alias` : to `lib/b.ts` → relative path
  - `uses the nearest tsconfig scope` : two scopes, the deeper one wins
  - `a bare package name resolves to nothing` : `react` → `null`
- [x] `npx vitest run tests/packages/move-files`. Commit.

### Task 4: Find references and rewrite a batch

**Files:** create `packages/move-files/src/{findTsReferences,findCssReferences,mentionsMovedFile,rewriteReferences}.ts`, `src/@types/{PathReference,ProjectSnapshot,MoveContext,MoveConfig,FileEdit}.ts`; tests beside them.

**Interfaces — produces:**

```ts
export type PathReference = { readonly start: number; readonly end: number; readonly value: string }; // span excludes quotes
export type ProjectSnapshot = {
  readonly texts: ReadonlyMap<string, string>; // absolute path → text; TS, CSS, .astro, .mdx
  readonly fileExists: (path: string) => boolean; // assets and ignored files
};
export type MoveConfig = { readonly companions: readonly CompanionRule[]; readonly extraMockCallees: readonly string[] };
export type MoveContext = { readonly root: string; readonly config: MoveConfig; readonly aliasScopes: readonly AliasScope[] };
export type FileEdit = { readonly from: string; readonly to: string; readonly text: string }; // from === to when only edited
export function findTsReferences(path: string, text: string, extraMockCallees: readonly string[]): PathReference[];
export function findCssReferences(text: string): PathReference[];
export function rewriteReferences(
  snapshot: ProjectSnapshot, moves: ReadonlyMap<string, string>, context: MoveContext,
): FileEdit[];
```

Built-in mock callees: `vi` and `jest` with `mock`, `doMock`, `unmock`, `doUnmock`, `importActual`, `importMock`, `requireActual`, `requireMock`. `.astro` and `.mdx` have no scanner here; they're in the snapshot for the guard only. A moved file's unresolved relative specifier stays correct by path math (`../old/x.png`), which is how assets survive.

- [x] Write the tests, watch them fail, implement, watch them pass:
  - `finds every TS reference form` : import, export-from, `import()`, `import('./x').T`, `import x = require()`, `require()`, `vi.mock()`, `jest.mock()`
  - `parses .tsx generics and JSX` : a `.tsx` with JSX text containing `import('./fake')` → not found
  - `ignores strings that are not references` : `const s = './x'` → not found
  - `reads an extra mock callee` : `td.mock('./x')` with `extraMockCallees: ['td.mock']`
  - `finds CSS references` : `composes: a b from './x.css'`, `@import './x.css'`, `@import url(./x.css)`, `url('./a.png')`, and unquoted `url(a.png)`
  - `leaves CSS external urls alone` : `url(https://…)`, `url(data:…)`, `url(#a)`
  - `rewrites importers and moved files together` : a mutual-import pair both moved → both specifiers correct, matching `tests/tools/utils/refactor/applyMoves.test.ts:62`
  - `a swap resolves against the old layout` : `a→b`, `b→a` → each importer ends up pointing at the file it meant
  - `keeps bytes with a BOM and non-ASCII text` : `﻿// é\nimport './x'` → exact expected string, BOM kept
  - `does not edit an importer with an unchanged spelling` : moving a sibling pair together → importer outside unaffected, no edit
  - `repoints a moved file's CSS import at a CSS file that stayed` : → `../old/X.module.css`
  - `moves CSS with its references` : a moved `.module.css` with `composes … from` updated in both directions
  - `the filter never skips an index importer` : `from '../math'` with `math/index.ts` moved → rewritten
  - `the filter matches a dot-specifier when an index moved` : `from '..'` → rewritten
- [x] Add `the filter changes no output` : the same fixture rewritten twice, the second time with a moved file's stem added in a comment to every file so all are parsed → identical edits, ignoring those comments.
- [x] `npx vitest run tests/packages/move-files`. Commit.

### Task 5: The guard

**Files:** create `packages/move-files/src/findBrokenReferences.ts`, `src/@types/GuardFinding.ts`; test beside it.

**Interfaces — produces:**

```ts
export type GuardFinding = {
  readonly file: string; readonly line: number; readonly text: string;
  readonly reason: 'no-longer-resolves' | 'now-resolves-elsewhere' | 'mentions-old-path';
};
export function findBrokenReferences(
  before: ProjectSnapshot, edits: readonly FileEdit[], moves: ReadonlyMap<string, string>, root: string,
): GuardFinding[];
```

- [x] Write the tests, watch them fail, implement, watch them pass:
  - `reports a path string that no longer resolves` : `new URL('./x.wesl', import.meta.url)` in a moved file, with `x.wesl` staying
  - `does not report a string that never resolved` : a fixture `'./y'` → nothing
  - `reports a string now pointing at a different file` : `'./a.ts'` with `a→b`, and `c→a`
  - `reports an old repo-relative path in a string` : `'src/a/b.ts'` after moving it → `mentions-old-path`, correct line
  - `matches old paths on a path boundary` : `'xsrc/a/b.tsx'` → nothing
  - `ignores an old path in a comment` : `// src/a/b.ts` → nothing
  - `scans .astro and .mdx` : `import x from './moved'` in `.astro` → reported
  - `checks a template's fixed prefix` : `` `${BLOB}/src/a/b.ts` `` → reported
- [x] `npx vitest run tests/packages/move-files`. Commit.

### Task 6: `planMoves`

**Files:** create `packages/move-files/src/{planMoves,findUnplaceableCompanions}.ts`, `src/@types/{Refusal,MovePlan,PlanResult}.ts`; tests beside them.

**Interfaces — consumes** Tasks 1, 4, 5. **Produces:**

```ts
export type Refusal = {
  readonly code: 'missing-source' | 'occupied-destination' | 'duplicate-source' | 'duplicate-destination'
    | 'outside-repo' | 'companion-unplaceable' | 'case-collision';
  readonly path: string; readonly detail: string;
};
export type MovePlan = { readonly moves: readonly MovePair[]; readonly edits: readonly FileEdit[]; readonly findings: readonly GuardFinding[] };
export type PlanResult = { readonly ok: true; readonly plan: MovePlan } | { readonly ok: false; readonly refusals: readonly Refusal[] };
export function planMoves(request: readonly MovePair[], snapshot: ProjectSnapshot, context: MoveContext): PlanResult;
```

`request` paths are relative to `context.root`; `plan.moves` keeps them relative, for the report. A pair with `from === to` is dropped. All refusals are collected, not just the first.

- [x] Write the tests, watch them fail, implement, watch them pass:
  - `refuses every invalid pair at once` : a missing source and an occupied destination → both listed
  - `refuses duplicates` : same `from` twice, same `to` twice
  - `refuses a path outside the repo` : `../x.ts`
  - `allows a destination this batch vacates` : `a→b`, `b→c`
  - `refuses a companion with nowhere to go` : a source with a test moved outside every rule → `companion-unplaceable`
  - `an explicit pair resolves an unplaceable companion` : same plus a pair for the test → ok
  - `refuses destinations differing only by case` : `x→foo.ts` with an existing `Foo.ts` → `case-collision`
  - `allows a case-only rename` : `Foo.ts→foo.ts`
  - `drags companions and reports findings` : one source + test + sibling + a stale string → all in the plan
- [x] `npx vitest run tests/packages/move-files`. Commit.

### Task 7: Edges, CLI and the switch-over

**Files:**
- Create: `packages/move-files/src/{cli,listProjectFiles,readSnapshot,loadMoveContext,applyPlan,readMoveManifest,parseMovePairEntry,renderMoveReport}.ts`, `packages/move-files/README.md`
- Modify: `package.json:121`, `move-files.config.json` (add the sibling rule), `tools/utils/refactor/applyMoves.ts`, `tests/tools/utils/refactor/applyMoves.test.ts` only if a case needs it
- Delete: `tools/dev/moveFiles.ts`, `tools/utils/refactor/{planMove,rememberSpecifierExtensions,parseMovePairEntry,renderMoveReport}.ts`, `tests/tools/utils/refactor/planMove.test.ts`

**Interfaces:**

```ts
export function listProjectFiles(root: string): string[]; // git ls-files -z; throws outside git
export function readSnapshot(paths: readonly string[]): ProjectSnapshot;
export function loadMoveContext(root: string, paths: readonly string[]): MoveContext; // config optional; tsconfig `extends` via ts.readConfigFile
export function applyPlan(plan: MovePlan, root: string): { readonly failed: string | null };
export function renderMoveReport(plan: MovePlan): string;
```

Script: `"move-files": "tsx packages/move-files/src/cli.ts"`. Arguments stay `<from> <to>`, `--manifest <path>`, `--dry`, parsed with `node:util` `parseArgs`. Exit codes: 0 clean, 1 findings, 2 refused or bad arguments, 3 write failure.

`applyMoves(project, moves)` keeps its signature: build a snapshot from `project.getSourceFiles()` and `project.getFileSystem().fileExistsSync`, call `rewriteReferences`, then `replaceWithText` for edits and `createSourceFile` + `delete()` for moves. It passes `aliasScopes: []`; say in a comment that skymap has no aliases to preserve here.

- [x] Tests in `tests/packages/move-files/`, using a temp git repo for edges, watched failing first:
  - `listProjectFiles lists tracked and untracked files, skips ignored ones` : a `.gitignore`d file isn't returned
  - `listProjectFiles handles spaces in paths` : `a b/c.ts` comes back whole
  - `listProjectFiles refuses outside a git repo` : clear message
  - `readSnapshot skips a tracked file missing from disk` : no throw, not in `texts`
  - `loadMoveContext reads paths through extends, scoped per tsconfig`
  - `loadMoveContext works with no config file` : no companions, no extra callees
  - `applyPlan writes before it deletes` : with a failing write, sources are still on disk and `failed` names the path
  - `applyPlan handles a swap` : contents end up exchanged
  - `applyPlan removes a case-only source before writing` : order asserted through an injected fs spy, since CI's Linux disk is case-sensitive
  - `cli exits 2 and writes nothing on a refusal`, `cli exits 1 with findings and writes`, `cli --dry writes nothing` : run in a temp repo
- [x] `tests/tools/utils/refactor/applyMoves.test.ts`: all four existing cases pass unchanged against the adapter. `planRename.test.ts` and the rest of the folder stay green.
- [x] `README.md`: what it does, usage, config with the two rule examples, exit codes, what it doesn't rewrite.
- [x] Update: `CLAUDE.md:63` and `:91` (CSS now handled; name the remaining `.astro`/`.mdx`/`.wesl` gaps; findings exit 1), `.claude/skills/refactor/SKILL.md:110`, `.claude/skills/wesl-shaders/SKILL.md:80`. `docsCommands.ts:257` keeps its script name; check `tests/packages/website` still passes.
- [x] Delete `docs/backlog/2026-07-14-move-files-untracked-references.md` and `docs/BACKLOG.md:254`.
- [x] `npm run typecheck:fast`; `npx vitest run tests/packages/move-files tests/tools/utils/refactor tests/packages/website`. Commit.

### Task 8: Controller check before the PR

Run inline by the controller, not delegated; results go in the PR body. No new code.

- [ ] In a throwaway worktree at this branch's merge base, run the new CLI on the 54-move corpus and diff against the ts-morph dump. Every difference must fall under the spec's listed classes; anything else stops the landing.
- [ ] In that tree, with the corpus and then the 196-move folder rename applied: `npm run typecheck:fast`, `npm test`, `npm run build`. Failures are compared with the same run on an unmodified tree.
- [ ] Time the 1-file and 54-move runs with the real CLI, writes included, and record them against the spec's table. A result under 10x or 100x stops the landing and goes to the owner.
- [ ] Self-move check: rename a helper inside `packages/move-files/src/` with the CLI; the tool still runs afterwards.
- [ ] Remove the throwaway worktree.

## Definition of Done

**Deliverables**
- [ ] `packages/move-files/` with `README.md`, and `move-files.config.json` at the repo root.
- [ ] `tools/dev/moveFiles.ts`, `planMove`, `rememberSpecifierExtensions` and `refactor move` deleted; no `SourceFile.move()` call left in `tools/`.
- [ ] Backlog line and detail file deleted.

**Observable behaviours**
- [ ] A single-file move takes under 2.9s (10x against 28.9s) and a 54-move batch under 4.8s (100x against 483s) on this repo.
- [ ] Moving a `.tsx` takes its `.module.css` and test along, and `composes … from` paths stay correct in both directions.
- [ ] Moving a `*.worker.ts` updates its `?worker` importers.
- [ ] A batch with a stale string writes the moves, prints `file:line` and exits 1; an invalid batch writes nothing and exits 2.
- [ ] `refactor rename` still renames a symbol and its file, with imports correct.

**Deferred (don't chase in review)**
- npm publishing, a build step, and a second-project trial.
- `.astro`, `.mdx` and `.wesl` rewriting, non-import path string rewriting, Windows paths, and CSS moves during `refactor rename`.
