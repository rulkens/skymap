# Refactor CLI on TypeScript 7, PR B: property and parameter subcommands

> **Spec.** [`2026-11-23-refactor-cli-native-engine-design.md`](../../specs/completed/2026-11-23-refactor-cli-native-engine-design.md),
> §4.5 and §5.2 to §5.5. PR A (#1154) is the base; this branch is stacked on it.
> **Execution.** Subagent-driven, lean protocol ([`sdd-execution.md`](../../conventions/sdd-execution.md)).
> One PR; no perf gate.

## Strategy

Four subcommands, each a row in `SUBCOMMANDS` (`tools/refactor/refactor.ts`):

| Row                | Address               | Kind     |
| ------------------ | --------------------- | -------- |
| `prop-refs`        | `<file>#<Type>.<prop>` | `report` |
| `rename-prop`      | `<file>#<Type>.<prop>` | `plan`   |
| `remove-prop`      | `<file>#<Type>.<prop>` | `plan`   |
| `params-to-object` | `<file>#<function>`    | `plan`   |

Rules that hold throughout (they already hold on the base):

- Every file under an `@types/` folder is a `.d.ts`; one type per file, filename = type.
- Only `tools/utils/refactor/engine/` imports `typescript-native`. This PR adds no engine call:
  `findReferences` already returns property references when asked at a property's name token
  (declaration, `a.radius`, object-literal keys also through `Pick`/`Partial`, shorthand,
  destructures, `a['radius']`, `Shape['radius']`, JSX attributes).
- Single-file syntax is read with the TypeScript 6 parser through `parseTs`
  (`tools/utils/refactor/parseTs.ts`).
- A planner never throws to refuse and never touches disk: it returns a `PlanResult`
  (`tools/@types/refactor/PlanResult.d.ts`). The driver folds and writes.
- Tests use `engineFixture` (`tests/helpers/refactor/engineFixture.ts`), one engine per test file.
- New `utils/` files hold one function, with a header of at most 10 lines; comments say why.

`params-to-object` does not use the engine's signature-usage call. It classifies the references
the driver already found: a `'call'` is rewritten, anything else that is not an import or
re-export refuses. One less unstable API call.

---

### Task 1: addresses carry a kind, rows say which they accept

**Files:** `tools/@types/refactor/{PropAddress,Target}.d.ts` (create),
`tools/utils/refactor/parseSymbolAddress.ts` → `parseTarget.ts` (rename + modify),
`tools/refactor/@types/{Subcommand,RunInput}.d.ts` (modify), `tools/refactor/refactor.ts` (modify),
`tests/tools/utils/refactor/parseTarget.test.ts` (renamed + modify)

```ts
export type PropAddress = {
  readonly file: string;
  readonly typeName: string;
  readonly prop: string;
};

export type Target =
  | ({ readonly kind: 'symbol' } & SymbolAddress)
  | ({ readonly kind: 'prop' } & PropAddress);

export function parseTarget(address: string): Target;

export type RunInput<Address, Found> = {
  readonly engine: Engine;
  readonly read: (file: string) => string;
  readonly exists: (file: string) => boolean;
  readonly positionals: readonly string[];
  readonly flags: Flags;
  readonly address: Address; // file in the disk's real case, root-relative
  readonly found: Found; // the one engine query of this op
};

type Common = { readonly name: string; readonly usage: string; readonly arity: number };

export type Subcommand = Common &
  (
    | ({ readonly accepts: 'symbol' } & (
        | { readonly kind: 'legacy'; readonly run: (input: LegacyInput) => Promise<void> }
        | { readonly kind: 'report'; readonly report: (run: SymbolRun) => string }
        | { readonly kind: 'plan'; readonly plan: (run: SymbolRun) => PlanResult }
      ))
    | ({ readonly accepts: 'prop' } & (
        | { readonly kind: 'report'; readonly report: (run: PropRun) => string }
        | { readonly kind: 'plan'; readonly plan: (run: PropRun) => PlanResult }
      ))
  );
```

`SymbolRun = RunInput<SymbolAddress, FoundRefs>` and `PropRun = RunInput<PropAddress, FoundPropRefs>`
each get their own `.d.ts` in `tools/refactor/@types/`. `FoundPropRefs` arrives in Task 2; in this
task no row accepts `'prop'` yet, so declare `PropRun` in Task 2.

- [x] Rename with the tool itself: `npm run refactor -- rename tools/utils/refactor/parseSymbolAddress.ts#parseSymbolAddress parseTarget`
      (it renames the file and its test). Trim the file's header to budget while there.
- [x] `parseTarget`: the part after `#` with exactly one `.` is a prop address
      (`Shape.radius`); with none, a symbol address. More than one `.`, or an empty half, throws
      with the offending input, like today's messages (`parseSymbolAddress.ts:42-60`).
- [x] The five existing rows gain `accepts: 'symbol'`. A row given the other kind fails before any
      engine query: `refactor rename: 'Shape.radius' is a property address; use rename-prop.`
      (and the mirror message naming the symbol subcommands).
- [x] Tests: `parseTarget reads file#Type.prop as a prop address`;
      `parseTarget reads file#symbol as a symbol address`; `parseTarget rejects two dots`;
      in `tests/tools/refactor/cliArguments.test.ts`, `a symbol row refuses a property address and names rename-prop`.
- [x] Commit.

### Task 2: `prop-refs`

**Files:** `tools/@types/refactor/{PropUseKind,FoundPropRefs}.d.ts` (create),
`tools/refactor/@types/PropRun.d.ts` (create),
`tools/utils/refactor/{locateProp,classifyPropUse,collectPropRefs,findQuotedMentions}.ts` (create),
`tools/utils/refactor/renderRefReport.ts` (modify), `tools/refactor/refactor.ts` (modify),
a test file per new util

```ts
export type PropUseKind =
  | 'read'
  | 'write'
  | 'shorthand-write'
  | 'destructure'
  | 'shorthand-destructure'
  | 'string-key';

export type FoundPropRefs = {
  readonly report: RefReport<PropUseKind>;
  readonly at: NodeLocation; // the property's name token in the type
  readonly refs: readonly { readonly at: NodeLocation; readonly kind: PropUseKind }[];
  readonly unreported: readonly Finding[]; // quoted mentions the engine does not report
};

/** The property's name token inside the exported type, or a refusal message. */
export function locateProp(
  text: string,
  address: PropAddress,
): { ok: true; at: NodeLocation } | { ok: false; refusal: string };

export function classifyPropUse(text: string, at: NodeLocation): PropUseKind;

export function collectPropRefs(input: {
  address: PropAddress;
  engine: Engine;
  read: (file: string) => string;
  texts: () => ReadonlyMap<string, string>; // every project file, for the quoted-mention search
}): { ok: true; found: FoundPropRefs } | { ok: false; refusal: string };

/** Quoted occurrences of `prop` in files that mention `typeName`, minus known references. */
export function findQuotedMentions(input: {
  typeName: string;
  prop: string;
  texts: ReadonlyMap<string, string>;
  known: readonly NodeLocation[];
}): readonly Finding[];
```

`locateProp` rules:

- The type is an exported `type X = { … }` alias or an exported `interface`; the property is a
  direct member of that literal. A member written as a string key (`'radius': number`) counts.
- Refuses, each with its own message: the type is not exported from the file; the type is not an
  object type literal (a union, an intersection, a mapped type); the property is not a direct
  member (name the members that exist).

`classifyPropUse` rules, on the node at the reference:

| Form                                                       | Kind                    |
| ---------------------------------------------------------- | ----------------------- |
| `a.radius` read anywhere                                   | `read`                  |
| `a.radius = x`, `a.radius += x`, `a.radius++`, `delete a.radius` | `write`           |
| `{ radius: 1 }` in an object literal                       | `write`                 |
| `<Circle radius={1} />`                                    | `write`                 |
| `{ radius }` in an object literal                          | `shorthand-write`       |
| `const { radius: r } = a`, parameter destructures included | `destructure`           |
| `const { radius } = a`, also with a default `{ radius = 1 }` | `shorthand-destructure` |
| `a['radius']`, `Shape['radius']`                           | `string-key`            |

`collectPropRefs` refuses when `findReferences` does not return the declaration itself (the file
is in none of the engine's projects), the same rule and wording `collectRefs.ts` uses. The
declaration is not a reference.

`findQuotedMentions`: every `'prop'`, `"prop"` or `` `prop` `` whose span is not a known reference,
in a file whose text contains `typeName` as a whole word. The message is
`'radius' as a string: not a tracked reference, check by hand`.

Driver: for an `accepts: 'prop'` row the one engine query is `collectPropRefs`; `texts` is the
existing `disk.snapshot().texts` overlaid with `engine.overlay`. `renderRefReport` already takes
`RefReport<Kind>`; `prop-refs` appends one footer line when `unreported` is not empty:
`N quoted mention(s) of 'radius' are not tracked: <file:line>, …` (all of them in `--json`, under
`unreported`).

- [x] `locateProp` — finds a member of a type alias; finds a string-keyed member; refuses a
      union type; refuses a missing member and lists the members.
- [x] `classifyPropUse` — one test per table row (8), plus `a.radius` on the right of an
      assignment is `read`.
- [x] `collectPropRefs` — `finds a write through Pick<Shape, 'radius'> typed literal`;
      `a use inside tests/ keeps its kind with inTest true`; `the declaration is not counted`;
      `refuses a file in none of the projects`.
- [x] `findQuotedMentions` — `reports the string in Pick<Shape, 'radius'>`;
      `skips a string-key reference the engine already reported`;
      `skips a file that never mentions the type`.
- [x] Smoke: `npm run refactor -- prop-refs <a real src type>#<Type>.<prop>` on a type with at
      least 20 uses; put the counts and wall time in your reply.
- [x] Commit.

### Task 3: `rename-prop`

**Files:** `tools/utils/refactor/{propRenameEdit,planRenameProp}.ts` (create),
`tools/refactor/refactor.ts` (modify), a test file per new util

```ts
export function propRenameEdit(
  text: string,
  ref: { at: NodeLocation; kind: PropUseKind },
  newName: string,
): TextEdit;

export function planRenameProp(input: {
  address: PropAddress;
  found: FoundPropRefs;
  newName: string;
  read: (file: string) => string;
}): PlanResult;
```

`propRenameEdit` rules:

- `read`, `write`, `destructure`: the name token is replaced. A JSX attribute is a `write`.
- `shorthand-write` `{ radius }` becomes `{ newName: radius }`.
- `shorthand-destructure` `{ radius }` becomes `{ newName: radius }`; with a default,
  `{ radius = 1 }` becomes `{ newName: radius = 1 }`.
- `string-key`: the text inside the quotes is replaced; the quote characters stay.
- The declaration is renamed by `planRenameProp` itself, as a plain token (inside quotes when it
  is a string-keyed member).

`planRenameProp` rules:

- Refuses when `newName` is not a valid identifier, equals the old name, or is already a member
  of the type.
- `findings` are `found.unreported`, unchanged: the run writes and exits 1 when there are any.
- No moves, no deletes.

- [x] `propRenameEdit` — one test per rule (6: read, JSX attribute, shorthand-write,
      shorthand-destructure, shorthand-destructure with default, string-key).
- [x] `planRenameProp` — `renames the declaration and uses in two files`;
      `refuses a name the type already has`; `carries the quoted mention in Pick<> as a finding`;
      `the folded result typechecks`: fold the plan into the fixture's overlay, `syncOverlay`, and
      assert `collectPropRefs` on the new name finds the same number of uses.
- [x] Smoke on a real `src` type with shorthand uses: `rename-prop … --dry`, then for real, then
      `npm run typecheck:fast`, then rename back; `git status` clean. Report the wall time.
- [x] Commit.

### Task 4: `remove-prop`

**Files:** `tools/utils/refactor/{memberSpan,planRemoveProp}.ts` (create),
`tools/refactor/refactor.ts` (modify), a test file per new util

```ts
/** The span to cut so one member disappears cleanly from its list. */
export function memberSpan(text: string, at: NodeLocation): { start: number; end: number };

export function planRemoveProp(input: {
  address: PropAddress;
  found: FoundPropRefs;
  read: (file: string) => string;
}): PlanResult;
```

`memberSpan` covers the member, its own leading comment, and one separator, for: a type-literal
member (`;`, `,` or a line break), an object-literal property and a shorthand property (the
trailing comma, or the preceding comma when it is last), a JSX attribute (one adjacent space), and
an expression statement (`a.radius = 3;` with its line). A sole property leaves `{}`.

`planRemoveProp` rules:

- Refuses, listing every blocking use as `file:line:col  kind`, when any use is `read`,
  `destructure`, `shorthand-destructure` or `string-key`.
- A `write` in an object literal or JSX attribute is cut, unless its value contains a call, `new`,
  `await` or a tagged template: that write is a refusal (`removing it would drop a side effect`).
- A `shorthand-write` is cut (it reads a local, which has no side effect).
- A `write` by assignment is cut when the assignment is a whole expression statement and its right
  side passes the same side-effect rule; anywhere else, and for `++`, `+=` and `delete`, it is a
  refusal.
- All refusals are collected and returned together, not just the first.
- The declaration is cut with `memberSpan`. `findings` are `found.unreported`.

- [x] `memberSpan` — `cuts a middle property with its comma`; `cuts the last property and the
      comma before it`; `cuts a sole property to {}`; `takes the member's own JSDoc`;
      `cuts a JSX attribute with one space`; `cuts an assignment statement with its line`.
- [x] `planRemoveProp` — `removes the declaration and two literal writes`;
      `refuses while a read exists and lists it`; `refuses a write whose value is a call`;
      `removes a shorthand write`; `refuses a compound assignment`;
      `returns every refusal, not only the first`;
      `the folded result has no reference left` (fold, sync, `locateProp` refuses the member).
- [x] Commit.

### Task 5: `params-to-object`

**Files:** `tools/utils/refactor/{planParamsToObject,objectParamText,callArgumentsEdit}.ts`
(create), `tools/refactor/refactor.ts` (modify), a test file per new util

```ts
export function planParamsToObject(input: {
  address: SymbolAddress;
  found: FoundRefs;
  read: (file: string) => string;
}): PlanResult;

/** `(width: number, height = 2, label?: string)` → `({ width, height = 2, label }: { width: number; height?: number; label?: string })`. */
export function objectParamText(
  text: string,
  params: { start: number; end: number },
): { ok: true; text: string; names: readonly string[] } | { ok: false; refusal: string };

/** Rewrites one call's argument list into an object literal in parameter order. */
export function callArgumentsEdit(
  text: string,
  call: NodeLocation, // the callee name token
  names: readonly string[],
): { ok: true; edit: TextEdit } | { ok: false; refusal: string };
```

Rules:

- Works on an exported `function` declaration and an exported `const f = (…) => …` or
  `const f = function (…) {…}`.
- `objectParamText`: one destructured parameter with an inline object type. A default moves into
  the destructure and makes the key optional; `?` makes the key optional. A parameter with a
  default and no annotation refuses (`its type would have to be inferred`). A parameter that is
  already a destructure, a rest parameter, or a `this` parameter refuses. Fewer than two
  parameters refuses (`nothing to gain`).
- `callArgumentsEdit`: `area(a, b)` becomes `area({ width: a, height: b })`; an argument that is
  an identifier equal to its parameter name is shorthand (`area({ width, height: b })`); omitted
  trailing arguments are omitted keys; a call with no arguments becomes `area({})`. Comments and
  line breaks inside an argument's own text are kept verbatim. A spread argument refuses; more
  arguments than parameters refuses.
- `planParamsToObject` refuses, listing each site as `file:line:col`, when:
  - any reference is not a `'call'`, an `'import'` or a `'re-export'` (an alias, `.bind`, the
    function passed as a callback, `typeof f`);
  - the function has overload signatures;
  - the `const` has a type annotation (its shape is another type's contract);
  - any call refuses in `callArgumentsEdit`.
- A `new` on the symbol classifies as `'call'` but is not a function call: refuse it.
- A call through an import alias (`import { area as a }`; `a(1, 2)`) is a `'call'` and is
  rewritten.
- The function's own body is not touched: the destructured names equal the old parameter names.

- [x] `objectParamText` — `two annotated parameters`; `a default becomes an optional key`;
      `an optional parameter stays optional`; `refuses a rest parameter`;
      `refuses a default without an annotation`; `refuses a single parameter`.
- [x] `callArgumentsEdit` — `positional arguments become keys`; `a matching identifier is
      shorthand`; `omitted trailing arguments are omitted keys`; `refuses a spread`;
      `keeps a multi-line argument verbatim`.
- [x] `planParamsToObject` — `rewrites the signature and calls in two files`;
      `rewrites a const arrow function`; `rewrites a call through an import alias`;
      `refuses when the function is passed as a callback and lists the site`;
      `refuses overloads`; `refuses an annotated const`;
      `the folded result still resolves every call` (fold, sync, `collectRefs` finds the same
      number of `'call'` references).
- [x] Smoke on a real two-or-three-parameter util in `src/utils/` with callers in at least three
      files: for real, `npm run typecheck:fast` and that util's tests pass, then
      `git restore`/`git checkout --` the touched paths so the tree is clean. Report the util and
      the wall time.
- [x] Commit.

### Task 6: docs

**Files:** `.claude/skills/refactor/SKILL.md`, `CLAUDE.md`,
`docs/superpowers/specs/2026-11-23-refactor-cli-native-engine-design.md` (modify)

- [x] `SKILL.md`: the four subcommands in the command list, with one line each on what refuses;
      the `Type.prop` address; the `PropUseKind` values; that exit 1 after `rename-prop` or
      `remove-prop` means quoted mentions to check by hand. In "Blind spots", replace the
      "Type properties and loose fixtures" bullet: properties are now handled, and what remains is
      the three untracked forms (`Pick<T, 'key'>` strings, `keyof` comparisons, literals forced
      through `as unknown as`). Update the skill's `description` front matter with triggers such
      as "rename this property everywhere", "remove this field from the type", "turn these
      arguments into an object".
- [x] `CLAUDE.md` commands block: the `npm run refactor` line names the new subcommands briefly.
- [x] Spec §4.3 and §5.5: `findSignatureUsage` was not needed; say that `params-to-object`
      classifies the references the driver already has.
- [x] Commit.

### Task 7: the type check after a contract change

Owner ruling, 2026-11-24: a rename of `CameraPose.yaw` left 38 type errors because `OrbitCamera`
declares its own `yaw` and the two are used interchangeably. The tool reports such sites itself.
This reverses spec D7 for the three contract-changing rows.

**Files:** `tools/@types/refactor/TypeErrorSite.d.ts` (create),
`tools/utils/refactor/engine/findTypeErrors.ts` (create),
`tools/utils/refactor/renderTypeErrors.ts` (create), `tools/refactor/@types/{Subcommand,Flags}.d.ts`
(modify), `tools/refactor/refactor.ts` (modify), a test file per new util,
`tests/tools/utils/refactor/engine/engineContract.test.ts` (modify),
`.claude/skills/refactor/SKILL.md`, the spec (modify)

```ts
export type TypeErrorSite = {
  readonly file: string; // absolute, real case
  readonly line: number; // 1-based
  readonly column: number;
  readonly message: string; // first line of the diagnostic, with its TS code
};

/** The syntax and semantic errors of `files` as the overlay stands; each file is asked of its owning project. */
export function findTypeErrors(engine: Engine, files: readonly string[]): readonly TypeErrorSite[];

/** The files worth checking: those the run changed plus every TypeScript file naming one of its names. */
export function checkCandidates(input: { texts; changed; names }): readonly string[];

/** Sync the last fold, pick the candidates, check them; undefined when `enabled` is false. */
export function checkRun(input: { enabled; engine; unsynced; texts; names }): { files; errors } | undefined;

/** `N type error(s) after this change:` then one `file:line:col  message` row each, root-relative. */
export function renderTypeErrors(errors: readonly TypeErrorSite[], root: string): string;

// Subcommand's Common grows:
readonly checks: boolean; // run the type check on the folded result
```

`findTypeErrors` asks `getSyntacticDiagnostics(file)` and `getSemanticDiagnostics(file)` of the first
project that owns each candidate file (a whole-program check costs 11 to 14 s through the API; the
candidates are a fraction), keeps category Error and drops files under `node_modules`. It lives in the
engine folder and exposes no `typescript-native` type. See `node_modules/typescript-native/dist/api/sync/api.d.ts`
for the `Diagnostic` shape.

Driver rules:

- `checks` is `true` for `rename-prop`, `remove-prop` and `params-to-object`, `false` for the rest.
- New flag `--no-check`.
- When the row checks and `--no-check` is absent: after the LAST entry's plan is folded (under
  `--dry` too, so the last entry is folded and synced in that case as well), sync the overlay,
  call `findTypeErrors` once. A batch is checked as a whole, never per entry: a manifest that
  renames both twins must pass.
- Errors: print `renderTypeErrors` to stderr, then one line
  `Nothing written. Fix the sites above, add the twin to a --manifest, or pass --no-check.`;
  exit code 1; no write.
- No errors: continue as today (write, or stop under `--dry`). Findings keep their own exit 1.
- The check reports every error in the projects, so an error that was there before the run shows
  too. Say so in the skill text; do not compute a baseline.

Tests:

- [x] Contract test `findTypeErrors is empty on a clean fixture and reports an error introduced through the overlay`,
      asserting file, line and that the message carries a `TS` code.
- [x] Contract test `findTypeErrors reports a syntax error the semantic check does not`.
- [x] `renderTypeErrors` — `prints the count and root-relative file:line:col rows`.
- [x] The twin case, at the fold level (`tests/tools/utils/refactor/typeCheckAfterRename.test.ts`):
      a fixture with `type A = { yaw: number }`, `type B = { yaw: number }` and
      `const b: B = a` for an `a: A`. `renaming A.yaw alone leaves a type error at the assignment`;
      `renaming A.yaw and B.yaw in one batch leaves none`.
- [x] Smoke: `npm run refactor -- rename-prop src/@types/camera/pose/CameraPose.d.ts#CameraPose.yaw heading --dry`
      lists type errors, exits 1, tree untouched; report the count and wall time. Then the same
      for a property that renames cleanly (`CameraTweenDescriptor.frame` → `framing`, `--dry`):
      no type errors; report the wall time. Time `rename` (unchecked) on any symbol to confirm it
      did not get slower.
- [x] Skill: document the check, `--no-check`, and replace the twin-property blind-spot bullet
      with what the check now does (it names the twin's sites; the fix is still yours).
      Spec: rewrite D7 to the ruling above and drop "A built-in typecheck" from §11.
- [x] Commit.

## Definition of Done

**Deliverables**

- Rows `prop-refs`, `rename-prop`, `remove-prop`, `params-to-object` in `SUBCOMMANDS`; the driver
  has no branch on a subcommand's name.
- `tools/@types/refactor/` gains `PropAddress`, `Target`, `PropUseKind`, `FoundPropRefs`.
- No new import of `typescript-native`.

**Smoke pass**

- `prop-refs` on a real type: counts by kind, plus the untracked-mention footer when there is one.
- `rename-prop` there and back on a real type with shorthand uses: typecheck passes, tree clean.
- `remove-prop` on a property that is read: refusal with the list, exit 1, tree untouched.
- `params-to-object` on a real util: typecheck and its tests pass.
- `rename Shape.radius` is refused with a message naming `rename-prop`.
- `rename-prop CameraPose.yaw heading --dry` lists the twin's type errors and writes nothing.

**Deferred**

- Adding a property; splitting or reorganising a type in one command.
- Class methods and interface members in `params-to-object`.
- `extract` and `inline` on TS 7.
