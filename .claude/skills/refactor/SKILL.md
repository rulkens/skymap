---
name: refactor
description: Use when performing a mechanical code refactor in skymap. Rename a symbol repo-wide, extract a symbol into its own file, inline or delete a passthrough wrapper, find who uses a symbol, or move/reorganize files of any kind (TS, CSS, assets). Triggers like "/refactor", "rename this function everywhere", "extract X into its own file", "inline this wrapper", "delete this unused helper", "who uses this symbol", "move X to Y", "rename this file", "update all the imports", "reorganize the utils folder", "shift these renderers into a subfolder", "folder reorg", "rename this property everywhere", "remove this field from the type", "turn these arguments into an object".
---

# `/refactor`: mechanical refactors, one command each

Every import in skymap is deep and relative with no barrels, so a rename or a move touches every
importer. Never hand-edit those: pick the command from the table.

## Pick the command

| I want to…                                        | Run                                                              | Time   |
| ------------------------------------------------- | ---------------------------------------------------------------- | ------ |
| see who uses a symbol                             | `npm run refactor -- refs <file>#<symbol>`                       | ~3 s   |
| rename a function, type or const (and its file)   | `npm run refactor -- rename <file>#<symbol> <newName>`           | ~3 s   |
| delete an unused symbol (and its file)            | `npm run refactor -- delete <file>#<symbol>`                     | ~3 s   |
| see who reads and writes a property               | `npm run refactor -- prop-refs <file>#<Type>.<prop>`             | ~4 s   |
| rename a property of a type                       | `npm run refactor -- rename-prop <file>#<Type>.<prop> <newName>` | ~6 s   |
| remove a property of a type                       | `npm run refactor -- remove-prop <file>#<Type>.<prop>`           | ~6 s   |
| turn positional arguments into one object         | `npm run refactor -- params-to-object <file>#<function>`         | ~5 s   |
| move a symbol into its own file                   | `npm run refactor -- extract <file>#<symbol> <dest.ts>`          | ~8 s   |
| remove a wrapper that only forwards               | `npm run refactor -- inline <file>#<symbol>`                     | ~8 s   |
| move or rename files and folders                  | `npm run move-files -- <from> <to>`                              | ~1.5 s |

The first seven run on the TypeScript 7 engine; `extract` and `inline` still run on ts-morph.

Not covered: adding a property (the compiler lists every literal that lacks it), and splitting a
type (do it as `rename-prop`, `extract` and `move-files` steps).

## Flags and exit codes

| Flag                    | Effect                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `--dry`                 | Print the references, findings and type errors; write nothing. Run this first, every time.   |
| `--manifest <ops.json>` | Batch of one subcommand. All entries are written together at the end, or none.               |
| `--json`                | The reference report as JSON on stdout.                                                      |
| `--no-file-rename`      | `rename` only: keep the file name.                                                           |
| `--no-check`            | Skip the type check and write anyway.                                                        |

| Exit | Meaning                                                                                              |
| ---- | ---------------------------------------------------------------------------------------------------- |
| 0    | Done, nothing left to do by hand.                                                                    |
| 1    | Read the output. A **refusal** or **type errors**: nothing was written. **Findings** (`file:line  message`): the change was written (unless `--dry`), and these places need a look by hand. |

A manifest is a JSON array; each entry is the arguments of one run:

```json
[
  ["src/@types/camera/pose/CameraPose.d.ts#CameraPose.yaw", "heading"],
  ["src/@types/camera/orbitCamera/OrbitCameraInit.d.ts#OrbitCameraInit.yaw", "heading"]
]
```

```bash
npm run refactor -- rename-prop --manifest renames.json --dry
```

Each entry sees the edits of the entries before it, moved files included.

## Symbols: `refs`, `rename`, `delete`

```bash
npm run refactor -- refs   src/utils/math/addVec3.ts#addVec3
npm run refactor -- rename src/utils/math/addVec3.ts#addVec3 sumVec3 --dry
npm run refactor -- delete src/utils/math/addVec3.ts#addVec3
```

- **`refs`** lists every reference with its kind: `import`, `call`, `type-position`, `re-export`,
  or `value` (any other use: an alias, an argument, a shorthand property). A reference under
  `tests/` keeps its kind and has `inTest: true`. `--json` gives
  `{ target, summary: { refs, files, tests }, refs: [{ filePath, line, column, kind, inTest, enclosing }] }`.
- **`rename`** rewrites every reference. It also renames the file and its companions (the
  `tests/` mirror, a `.tsx`'s `.module.css`) when the file is named after the symbol. Pass
  `--no-file-rename` for a file with several exports.
  - `{ foo }` becomes `{ foo: newName }`, so the key survives.
  - `import { foo as bar }` becomes `import { newName as bar }`.
- **`delete`** removes the symbol, and its file and test when it was the only export. It refuses
  while any reference exists, tests included, and lists them.

## Properties: `prop-refs`, `rename-prop`, `remove-prop`

The address is `<file>#<Type>.<prop>`. The type must be an exported object `type` or `interface`
with the property as a direct member.

```bash
npm run refactor -- prop-refs   src/@types/camera/pose/CameraPose.d.ts#CameraPose.yaw
npm run refactor -- rename-prop src/@types/camera/pose/CameraPose.d.ts#CameraPose.yaw heading --dry
npm run refactor -- remove-prop src/@types/camera/pose/CameraPose.d.ts#CameraPose.yaw --dry
```

`prop-refs` gives each use one kind:

| Kind                    | Example                                              |
| ----------------------- | ---------------------------------------------------- |
| `read`                  | `pose.yaw`                                           |
| `write`                 | `{ yaw: 1 }`, `pose.yaw = 1`, `<Dial yaw={1} />`     |
| `shorthand-write`       | `{ yaw }`                                            |
| `destructure`           | `const { yaw: angle } = pose`                        |
| `shorthand-destructure` | `const { yaw } = pose`                               |
| `string-key`            | `pose['yaw']`, `CameraPose['yaw']`                   |
| `doc-link`              | `{@link CameraPose.yaw}` in a comment                |

**`rename-prop`** rewrites the declaration and every use, doc links included. A shorthand keeps its
local: `{ yaw }` becomes `{ heading: yaw }`.

**`remove-prop`** removes the declaration and the places that only set it: a literal's property, a
JSX attribute, a shorthand, a whole `pose.yaw = 1;` statement.

| Command       | Refuses when                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `rename-prop` | the new name is invalid, unchanged, or already a member of the type                              |
|               | afterwards the new name would also catch another property (a wider `Shape & { size }`)           |
|               | the member is linked to a base or library member (`Sub.radius` and `Base.radius`, `Array.length`) |
| `remove-prop` | anything still reads it: a read, a destructure, a string key                                     |
|               | a removed write does work: a call, `new`, `await`, `++`, an assignment, in its value or target   |
|               | the write is `+=`, `++` or `delete`, or an assignment inside a larger expression                 |

| Command       | Findings (written, exit 1)                                                             |
| ------------- | -------------------------------------------------------------------------------------- |
| both          | a quoted mention the engine cannot follow: `Pick<T, 'yaw'>`, or a string in a file using `keyof T` |
| `remove-prop` | a local that a removed shorthand leaves unused; a doc-comment mention that remains      |

### When the type check lists errors

The tool follows one declared property. TypeScript compares shapes, so the same property name
often lives in other places that the rename does not reach. The error message tells you which:

| The error names…                                                        | What it is                                  | Fix                                             |
| ----------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| another type: `…missing in type 'OrbitCamera'`                          | a twin: a second type declaring the property | add its declaring type to the manifest           |
| an inline shape: `…missing in type '{ target: Vec3; yaw: number; … }'`  | a literal built without a type annotation    | by hand at that site                             |
| a key union: `'"distance" \| "yaw"' can't be used to index…`            | property names as strings                    | by hand at that site                             |

Address a twin by the type that **declares** the member: `OrbitCamera` is
`OrbitCameraInit & { position }`, so the entry is `OrbitCameraInit.yaw`.

1. Run with `--dry` and sort the errors by the table.
2. Put every twin in one manifest (the example above) and `--dry` again.
3. Errors left are the by-hand kinds. Run the manifest for real with `--no-check`, then fix the
   sites `npm run typecheck:fast` lists until it is clean.

Expect this on a shape that is passed around a lot. `CameraPose.yaw` has 497 uses; with its twin in
the manifest, 32 sites still need a hand edit, most of them untyped literals in tests. A property
of a type that is always used by name (`CameraTweenDescriptor.frame`) renames in one clean run.

## Parameters: `params-to-object`

```bash
npm run refactor -- params-to-object src/utils/camera/arms/focusInSubtree.ts#focusInSubtree --dry
```

```ts
// before
export function area(width: number, height: number = 2): number
area(w, 3);

// after
export function area({ width, height = 2 }: { width: number; height?: number }): number
area({ width: w, height: 3 });
```

A call argument that is already named like its parameter becomes shorthand. Works on an exported
`function` and an exported `const` arrow or function expression. `ns.area(1, 2)` and
`area<T>(a, b)` are rewritten too.

| Refuses when                                                                                     |
| ------------------------------------------------------------------------------------------------ |
| any use is not a direct call: a callback, an alias, `.bind`, `typeof`, `new`, an optional call `?.()` |
| the function has overloads, or the `const` has a type annotation                                 |
| a parameter is a rest, `this` or destructured parameter, or has no type annotation               |
| there are fewer than two parameters                                                              |
| the body reads `arguments`                                                                       |
| a call spreads its arguments, or contains another call of the same function                      |
| a comment sits between parameters or between arguments (it would be lost)                        |

Finding (written, exit 1): the JSDoc has `@param` tags, which now describe the old parameters.

## The type check

`rename-prop`, `remove-prop` and `params-to-object` type check the result in memory before
writing, also under `--dry`. A batch is checked as a whole.

- **Errors**: printed as `file:line:col  TSxxxx: message`; nothing is written; exit 1.
- **Clean**: `Type check: 0 errors in N files that were changed or mention <names>.`
- **It is not the full check.** It covers the files the run changed plus every TypeScript file
  that spells the old or new name. A file that gets the property through an inferred type
  (`...orbitAnglesLookingAlong(…)` spread into a pose) never spells it and is missed. On
  `CameraPose.yaw` it finds 36 of 38 errors. A whole-program check through the API costs 11 to
  14 s (measured 2026-11-24), so it is not done.
- It reports every error in the files it checks, so an error from before the run shows too.
- `--no-check` skips it.

Always run `npm run typecheck:fast` after a real run.

## `extract` and `inline`

- **`extract`** moves a symbol and the file-local helpers only it uses into `dest.ts`, and
  repoints every importer.
  - Refuses when a helper is also used by code that stays: `extract` that helper first.
  - Refuses an existing destination.
  - A `//` line comment directly above a dragged helper is dropped; JSDoc survives.
  - It can write `../../node_modules/<pkg>/index` specifiers (make them the bare package name)
    and re-quotes to double quotes: run `npx prettier --write` on the touched files.
  - It has two open bugs with type-only imports (`docs/BACKLOG.md`); check that the result compiles.
- **`inline`** repoints every call of a passthrough (an alias, a same-signature single-call
  wrapper, an aliased re-export) at the real symbol and removes the wrapper. It refuses anything
  with real logic and prints the references, so you edit those sites by hand.

## What no subcommand sees

Grep for the old name after every run.

- **`.wesl` shader imports** (`import package::…`): a separate module graph.
- **Paths and names as strings**: `rawDataPath()` keys, asset URLs, `vi.mock()` literals.
- **`?worker` / `?url` / `?raw` specifiers**: ambient-typed, so a stale one passes `tsc` and
  `vite build` and breaks at runtime.
- **Literals forced through `as unknown as`**: they accept a stale property silently.
- **Ratchet allow-lists** (e.g. `tests/helpers/conventions/inlineTypeFiles.ts`): paths as strings.
- **A file in none of the four tsconfig projects** (`tsconfig.json`, `tsconfig.tools.json`,
  `packages/desktop`, `packages/website`): refused, never treated as unused.
- **An import alias spelled like the renamed symbol** (`import { bar as foo }` through a barrel):
  its later uses are renamed while the alias stays. Rare here; `typecheck:fast` catches it.

Never repoint importers with a one-off ts-morph script. In any ts-morph code,
`ImportDeclaration.remove()` on a file's first import drops the module header comment; use
`removeImportKeepingTrivia` (`tools/utils/refactor/`).

## `move-files`

Run it from the repo root. It rewrites JS, TS and CSS references project-wide: imports,
`import()`, `require()`, `vi.mock()`/`jest.mock()` paths, `?worker` suffixes, aliases,
`composes … from`, `@import` and `url()`. It drags the `tests/` mirror and a `.tsx`'s
`.module.css`. A batch is `--manifest <moves.json>` with `[{ "from": …, "to": … }, …]`.
Full reference: `packages/move-files/README.md`.

| Exit | What it means                                                                                   | What to do                                                                           |
| ---- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 0    | Clean                                                                                           | Commit the move                                                                      |
| 1    | **The moves are written** (unless `--dry`), and `file:line` findings list what they newly broke | Fix each finding by hand. Don't re-run: the sources are gone, so it would be refused |
| 2    | Refused, nothing written, every reason listed                                                   | Fix the batch and re-run                                                             |
| 3    | A write failed partway; stderr names the path and every file finished                           | Finish by hand. A moved file not yet home sits beside its destination as `<name>.move-files-tmp` |

Reported as findings when they break, not rewritten: `.astro`, `.mdx`, `.vue` and `.svelte`
imports, Sass and Less, and non-import path strings.

Not seen at all, so grep for these by hand: `.wesl` (`package::` imports),
`/// <reference path>`, JSDoc `import()` and `import.meta.glob`.

It doesn't mirror faceted tests (`foo.facet.test.ts`; add manifest entries), and it leaves
the emptied source directory behind.

## Always

- **`--dry` first.** Read the references, findings and type errors before the real run.
- **`npm run typecheck:fast` after.** Then `npm run build` after a move or an `extract`: the
  string blind spots above surface only at build or runtime.
- **One mechanical change per commit, no content edits mixed in.** Git's rename detection and
  `git blame` survive, and the diff stays reviewable.

## For orchestrators

Subagents do NOT see project skills. Any plan task or dispatch that renames, extracts, inlines,
deletes, moves, or changes a property or a parameter list MUST name the exact command in the
prompt, so the implementer uses it instead of hand-editing.
