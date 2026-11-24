# The refactor CLI on TypeScript 7: design spec

> **Status.** Draft, 2026-11-23. Owner: Alexander Rulkens. The ground check was signed off the same
> day (dash ask gTA7): the four contract shapes stand, a test reference keeps its real kind plus an
> `inTest` flag, the prep commits ride the first feature PR, and the feature ships as two PRs.
> **Written against** main at 7a2cd51fb (#1150: `typescript-native` = `typescript@7.0.2` installed
> beside TypeScript 6).
> **Inputs.** Spike timings and API probes from 2026-11-22 (numbers in §2 and §8), the refactor CLI
> survey, and [`docs/backlog/2026-07-21-refactor-cli-followups.md`](../../backlog/2026-07-21-refactor-cli-followups.md).

## 1. Why

`move-files` made file moves cheap: one command, about 1.5 s, every importer rewritten. The other
common refactor is a contract change: a property is renamed or removed, a positional argument list
becomes an object. Those are still done by hand or by search-and-replace, because the tool that
could do them is slow and does not know about properties.

`npm run refactor` pays about 7 s before it does anything: ts-morph loads 8,780 files (2.3 s),
builds the program (3.0 s) and warms the first find-references call (1.7 s). The operation itself
takes 0.1 to 0.2 s. An agent that runs `refs` five times in a task waits most of a minute.

TypeScript 7 answers the same question in 0.5 to 0.75 s through its API, and its answer for a
rename of `EngineState` matches ts-morph's exactly: the same 203 referring files, 573 references
plus the declaration.

## 2. What ships

Two PRs.

**PR A: the engine, and the three subcommands that move onto it.**

| Subcommand | Today  | After   | Change in behaviour                                   |
| ---------- | ------ | ------- | ----------------------------------------------------- |
| `refs`     | 9.7 s  | ~0.7 s  | report shape (§4.2)                                   |
| `rename`   | ~8 s   | ~0.8 s  | none                                                  |
| `delete`   | ~8 s   | ~0.8 s  | refusal printed once, not twice                       |
| `extract`  | ~8 s   | ~8.6 s  | preview comes from the TS 7 report                    |
| `inline`   | ~8 s   | ~8.6 s  | preview comes from the TS 7 report                    |

`refs` and dry `rename` are measured; `delete` is inferred from the same two calls; `extract` and
`inline` are today's time plus one 0.6 s report.

**PR B: four new subcommands**, all addressed as `<file>#<Type>.<prop>` or `<file>#<function>`.

| Subcommand         | What it does                                                                |
| ------------------ | --------------------------------------------------------------------------- |
| `prop-refs`        | every use of one property, classified as read, write, destructure, key      |
| `rename-prop`      | renames a property at its declaration and every use                         |
| `remove-prop`      | removes a property and the places that set it; refuses while anything reads |
| `params-to-object` | turns positional parameters into one object parameter, call sites included  |

`extract` and `inline` stay on ts-morph. They move statements between files and repair imports,
which needs an editing layer TypeScript 7 does not have.

## 3. Decisions

- **D1. TypeScript 7 finds, the planner writes text edits.** TS 7 has no editing API, so a planner
  returns edits as data: a span and its replacement. Rejected: TS 7 to find and ts-morph to edit,
  which keeps the 7 s start.
- **D2. One adapter folder is the only importer of `typescript-native`.** The API lives under
  `unstable/`, and the package is pinned to exactly 7.0.2. Everything the tool needs from it goes
  through `tools/utils/refactor/engine/`, so a breaking release is one folder's problem. A contract
  test (§7) fails on the first call whose shape moved.
- **D3. A planner returns a value and never throws to refuse.** `PlanResult` is a plan or a list
  of refusals, the same union `move-files` uses. The driver prints refusals once.
- **D4. One write path.** The driver folds the edits into whole-file texts and hands them to
  `move-files`' `applyPlan`, which already stages writes and moves. Files a plan deletes are
  removed by the driver afterwards; `MovePlan` does not grow a `deletes` field.
- **D5. A test reference keeps its kind.** `inTest: boolean` sits on every entry. Today a call in
  a test is reported as `'test'` and loses that it is a call; `remove-prop` needs to tell a test
  write from a test read.
- **D6. A batch plans against memory.** Each manifest entry is planned against the current texts,
  its edits are folded in, and the changed files are handed to the engine as an overlay (3 ms to
  resync in the probe). Disk is written once, at the end, or not at all on a refusal.
- **D7. The tool does not typecheck its own output.** `npm run typecheck:fast` after a run is the
  check, as it is after `move-files`. A built-in check would double every run's time.

## 4. Contracts

Types live one per file under `tools/@types/refactor/`.

### 4.1 Plans

```ts
export type TextEdit = {
  readonly file: string; // absolute path, real case
  readonly start: number; // UTF-16 offset
  readonly end: number;
  readonly text: string;
};

export type Plan = {
  readonly edits: readonly TextEdit[];
  readonly moves: readonly MovePair[]; // move-files' type
  readonly deletes: readonly string[];
  readonly findings: readonly Finding[];
};

export type Finding = { readonly file: string; readonly line: number; readonly message: string };

export type PlanResult =
  | { readonly ok: true; readonly plan: Plan }
  | { readonly ok: false; readonly refusals: readonly string[] };
```

A finding is a place the tool could not rewrite and the operator must check by hand. A run with
findings writes its plan and exits 1, the same meaning exit 1 has in `move-files`.

```ts
export function planRename(input: {
  address: SymbolAddress;
  newName: string;
  renameFile: boolean;
  engine: Engine;
  snapshot: Snapshot;
}): PlanResult;

export function planDelete(input: {
  address: SymbolAddress;
  engine: Engine;
  snapshot: Snapshot;
}): PlanResult;
```

`Snapshot` is the current text of every file the run has touched, over the disk. `Engine` is the
adapter's handle.

### 4.2 References

```ts
export type SymbolRefKind = 'import' | 'call' | 'type-position' | 're-export' | 'value';

export type PropUseKind =
  | 'read'
  | 'write'
  | 'shorthand-write'
  | 'destructure'
  | 'shorthand-destructure'
  | 'string-key';

export type RefEntry<Kind> = {
  readonly filePath: string;
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
```

`'value'` is a symbol used as a value without being called (`const alias = area`), which today
falls into `'call'`. `--json` output changes with these types. No script in the repo reads it;
the refactor skill's text is updated in the same PR.

### 4.3 The engine adapter

```ts
export function openEngine(input: { root: string; fs?: EngineFs }): Engine;
export function findReferences(engine: Engine, at: NodeLocation): readonly RawReference[];
export function findSignatureUsage(engine: Engine, at: NodeLocation): readonly SignatureUsage[];
export function syncOverlay(engine: Engine, changed: readonly string[]): void;
export function closeEngine(engine: Engine): void;
```

`NodeLocation` and `RawReference` are a file and the span of one name token. The engine answers
only the cross-file question. Everything syntactic (where an export is declared, what kind of use
a reference is, the span of a statement to remove) is read by parsing the one file with the
TypeScript 6 parser, the stable API `move-files` already uses, so no engine node leaves the
adapter. `findSignatureUsage` lands with PR B. The adapter owns three facts the probes found:

- The engine opens four projects (`tsconfig.json`, `tsconfig.tools.json`,
  `packages/desktop/tsconfig.json`, `packages/website/tsconfig.json`). A file in two projects is
  reported once per project, so the adapter removes duplicates.
- A reference handle's path is lowercased on a case-insensitive disk. The real path comes from the
  resolved node's source file.
- Offsets are UTF-16 units, also after an emoji, so they index a JavaScript string directly.

### 4.4 Dispatch

```ts
export type Subcommand = {
  readonly name: string;
  readonly usage: string;
} & (
  | { readonly kind: 'report'; readonly report: (run: RunInput) => string }
  | { readonly kind: 'plan'; readonly plan: (run: RunInput) => PlanResult }
  | { readonly kind: 'legacy'; readonly run: (run: LegacyInput) => void }
);
```

`SUBCOMMANDS` is a list of rows, and the usage text is built from it. The driver branches on the
three kinds. Only a `legacy` row loads ts-morph; a batch is one subcommand, so a run starts one
editing engine. Every kind gets the TS 7 engine, since `legacy` rows read their preview from it.

### 4.5 Addresses (PR B)

```ts
export type PropAddress = {
  readonly file: string;
  readonly typeName: string;
  readonly prop: string;
};

export type Target =
  | ({ readonly kind: 'symbol' } & SymbolAddress)
  | ({ readonly kind: 'prop' } & PropAddress);
```

`parseSymbolAddress` becomes `parseTarget`, and each row gains `accepts: Target['kind']`, so
`rename Shape.radius` fails with a message that names `rename-prop`.

## 5. Behaviour of each subcommand

### 5.1 `rename` and `delete` (PR A)

Same rules as today, restated because the code is rewritten.

- **`rename`** rewrites the declaration and every reference. A shorthand use keeps its meaning:
  `{ foo }` becomes `{ foo: newFoo }` in a literal and `{ foo: newFoo }` in a destructure. An
  import or export alias renames only the imported side. The file is renamed when its basename is
  the symbol, and its test mirror follows through `expandCompanions`; `--no-file-rename` opts out.
- **`delete`** refuses while any reference of any kind exists, tests included, and lists them.
  When the symbol was the file's only export and no meaningful statement is left, the file and its
  test mirror are deleted.

### 5.2 `prop-refs` (PR B)

Prints every use of the property with its `PropUseKind`. The engine reports the declaration,
`a.radius`, object literals (also when typed through `Pick` or `Partial`), shorthand, destructures,
`a['radius']` and `Shape['radius']`. It does not report three forms, and the report says so in a
footer line with a count from a text search: the name as a string in `Pick<Shape, 'radius'>`, a
value compared against `keyof Shape`, and a literal forced through `as unknown as Shape`.

### 5.3 `rename-prop` (PR B)

Rewrites the declaration and every reported use. Shorthand expands as in `rename`. String keys are
rewritten inside their quotes. The unreported forms of §5.2 become findings: each quoted
occurrence of the old name in a file that mentions the type is listed as `file:line`, and the run
exits 1.

### 5.4 `remove-prop` (PR B)

- Refuses while any `read`, `destructure`, `shorthand-destructure` or `string-key` use exists, and
  lists them.
- Removes the declaration and every `write` and `shorthand-write` in an object literal.
- A write whose value contains a call, `new` or `await` is a refusal: removing it would drop a
  side effect.
- An assignment (`shape.radius = 3`) is removed when it is a statement of its own, and is a
  refusal anywhere else.

### 5.5 `params-to-object` (PR B)

`area(width, height)` becomes `area({ width, height })`.

- The signature becomes one destructured parameter with an inline object type. Defaults move into
  the destructure, and a parameter with a default or a `?` becomes an optional key.
- Each call site becomes an object literal in parameter order, shorthand where the argument is an
  identifier with the parameter's name. Omitted trailing arguments are omitted keys.
- Works on an exported function declaration and on an exported `const` arrow function.
- Refuses, with the list, when: any usage is not a direct call (an alias, `.bind`, the function
  passed as a callback); a call spreads its arguments; the function has a rest parameter or
  overloads; the `const` carries a type annotation, so its shape is another type's contract.

## 6. What gets deleted

| File                                              | Why it goes                                       |
| ------------------------------------------------- | ------------------------------------------------- |
| `tools/utils/refactor/applyMoves.ts` (+ 7 tests)  | `applyPlan` writes moves                          |
| `tools/utils/refactor/assertDestinationsFree.ts`  | `applyPlan`'s staging covers it                   |
| ts-morph body of `collectRefs.ts` (+ 6 tests)     | one classifier, on the engine's `RawReference`s   |
| the five `if (sub === …)` arms in `refactor.ts`   | the subcommand table                              |
| four copies of the preview block                  | hoisted into the driver                           |

`planInline` used to call `collectRefs` itself. It now receives the report as an argument.
`removeFileWithMirror` stays: `planInline` still uses it. `planRename` and `planDelete` are
rewritten, and their 12 tests are rewritten against the engine.

Backlog, in the same change: the dispatch-table and double-printed-refusal items leave
`docs/backlog/2026-07-21-refactor-cli-followups.md`, and the index line in `docs/BACKLOG.md` is
reworded to what remains. The header-trim item loses `collectRefs`, `planDelete` and `refactor.ts`
where those headers are rewritten anyway.

## 7. Tests

Each test below fails on a bug nothing else catches.

- **Adapter contract test**, pinned to 7.0.2: on a small fixture, each adapter function returns
  the shape §4.3 names. This is the test that fails when `typescript-native` is bumped.
- **Coverage test**: every file under the ts-morph globs sits in one of the four tsconfigs (0
  missing today, of 8,780). A new package without a tsconfig entry would be invisible to `refs`.
- **Classifier tests**: one fixture line per `SymbolRefKind` and `PropUseKind`, including the
  shorthand and string-key forms, and one in a test path for `inTest`.
- **Planner tests**: `planRename` and `planDelete` keep today's cases (7 and 5). Each PR B planner
  gets its refusals and one happy path per rule in §5.
- **Batch test**: two renames in one manifest where the second touches a file the first changed.
- **No driver test.** The driver stays thin; its rows are tested through their planners.

Engine tests share one engine per test file, on an in-memory file system where the API allows it.

## 8. Ground preparation

Checked 2026-11-22 with the `refactor-ground` pass; signed off 2026-11-23. A greenfield
cross-check, given only the requirements, arrived at the same shapes with one divergence (the
`'test'` kind, ruled in D5).

Two prep commits, first on PR A's branch, each its own diff with no change in behaviour:

1. **The driver dispatches from a subcommand table.** The five-arm chain at
   `tools/refactor/refactor.ts:89` to `:141` becomes five rows, all `legacy` at this point, and
   the preview block copied into four arms is hoisted into the driver. Without it the feature
   would add the chain's sixth to ninth arm.
2. **Shared types move to `tools/@types/refactor/`.** `RefKind`, `RefEntry`, `RefReport`,
   `SymbolAddress` and `ResolvedSymbol` leave their implementation files, one type per file, and
   their rows leave the allow-list at `tests/helpers/conventions/inlineTypeFiles.ts:306`. Move-only.

Everything else lands as additions: the adapter folder, the plan types, two classifiers, and one
row per new subcommand.

## 9. Risks

- **The API is marked unstable.** A patch release may rename a call. The exact pin and the
  contract test turn that into one failing test in one folder on the bump PR, not a broken tool.
- **A fully in-memory fixture is unproven.** The probe overlaid edits on a fixture that was on
  disk. If the engine insists on a real tsconfig, tests use a temp directory per file; the
  planners do not change.
- **A file outside every tsconfig is invisible.** The coverage test guards the globs; `.astro`,
  `.mdx` and `.wesl` are outside both engines today and stay outside.
- **`rename` parity.** One real symbol was compared against ts-morph. PR A's verification runs a
  dry rename of ten symbols of different kinds (type, function, const, enum, class) on both
  engines before ts-morph's `planRename` is deleted, and compares the edit sets.
- **Two `tsc` binaries.** Already guarded by the CI step from #1150.

## 10. Smoke list (DoD)

PR A:

- `refs` on `EngineState` prints 573 references in 203 files in under 1 s.
- `rename --dry` on the same symbol reports the same set; a real rename of a small util renames
  the file and its test, and `npm run typecheck` passes.
- `delete` on a referenced symbol prints the refusal once and exits 1 with the tree untouched.
- `extract` and `inline` behave as before on one symbol each.
- A manifest of two renames writes once.

PR B:

- `prop-refs`, `rename-prop`, `remove-prop` and `params-to-object` each run on one real type or
  function in `src/`, and `npm run typecheck` passes afterwards.
- `remove-prop` on a property that is still read refuses with the list.

## 11. Out of scope

- **Adding a property.** The compiler already lists every literal that lacks it.
- **Splitting or reorganising a type in one command.** It composes from `rename-prop`, `extract`
  and `move-files`; a dedicated subcommand waits until that sequence has been done by hand a few
  times and its shape is known.
- **`extract` and `inline` on TS 7**, and their open bugs (the two `extract` backlog items).
- **Class methods and interface members** in `params-to-object`.
- **A built-in typecheck** after a run (D7).
- **`move-files` on TS 7.** It is already 1.5 s on the TypeScript 6 API.
