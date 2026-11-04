# move-files

Moves files and rewrites every reference to them in one pass, so a folder reorg is one
command. The core is pure (file text and moves in, edits and findings out); git and the
disk are thin edges. It parses with the `typescript` package only, no Program.

## Usage

```
npm run move-files -- <from> <to>
npm run move-files -- --manifest moves.json      # JSON array of { "from", "to" }
npm run move-files -- <from> <to> --dry          # report, write nothing
```

Run from the repo root, inside a git repository (files are listed with `git ls-files`, so
`.gitignore` is respected, and a run from a subfolder is refused). Paths are relative to the
root. Commit the pure move on its own so git's rename detection keeps history.

A moved `.tsx` takes its companions along (see config); a companion already named in the
batch keeps its explicit destination. Chains and swaps (`a -> b`, `b -> a`) work because
every reference is resolved against the old layout and spelled for the new one. The author's
spelling survives: extension or none, `.js` for `.ts`, `?worker` suffixes, quotes, aliases.
Specifiers resolve as TypeScript's bundler mode does, plus an asset as written and a bare
`./data` for `data.json`.

A batch is refused whole, with every reason listed, if a source is not a file git lists in
that exact case, or a destination is taken, differs only by case from another file, is a
folder, sits under a file, or holds a quote or backslash.

## Config

`move-files.config.json` at the repo root, optional:

```json
{
  "companions": [
    {
      "from": "src/",
      "to": "tests/",
      "sources": [".ts", ".tsx"],
      "suffixes": [".test.ts", ".test.tsx"]
    },
    { "from": "", "to": "", "sources": [".tsx"], "suffixes": [".module.css"] }
  ],
  "extraMockCallees": []
}
```

A rule maps a root to a mirror root (`src/Foo.ts` to `tests/Foo.test.ts`); an empty root
means a sibling beside the primary. If a companion exists but no rule fits the primary's
destination, the batch is refused until you add a pair for it. `extraMockCallees` names
test-mock functions, beyond `vi.mock`, whose first argument is a path.

Aliases come from every `tsconfig*.json` and `jsconfig*.json`, following `extends`: the
nearest folder holding one governs an importer, and configs sharing a folder pool their
targets. `baseUrl` and `${configDir}` are read. An `extends` that resolves through a
workspace's own `node_modules` is not; only the root `node_modules` is tried.

## Exit codes

| Code | Meaning                                                                      |
| ---- | ---------------------------------------------------------------------------- |
| 0    | Clean                                                                        |
| 1    | Written, with findings listed as `file:line`. `--dry` returns 1 the same way |
| 2    | Refused or bad arguments, nothing written (each problem on stderr)           |
| 3    | A write failed partway; stderr names the path and every file finished        |

On exit 3 nothing is lost: rewritten files are staged first, and a failure there leaves the
project as it was. Past that, a moved file not yet home sits beside its destination as
`<name>.move-files-tmp`.

Findings are only what this batch newly broke: a `./` string that resolved before and does
not now (or resolves elsewhere), an alias that broke in a file nothing rewrites, and an old
repo-relative path still in code.

## What it does not rewrite

Reported by the guard when they break, not rewritten:

- `.astro` and `.mdx` files.
- Sass and Less. `@use`, `@forward` and partials resolve their own way, so only a `./` string
  written with its extension is checked, in a moved file or pointing at one. Plain CSS is rewritten.
- `declare module './mod'` and other relative strings that aren't imports (asset URLs, say).

Not seen at all, so check these by hand after a move:

- `/// <reference path="./types.d.ts" />`, JSDoc `import('./x')` and `import.meta.glob('./data/*.json')`.
- Every other file type. Other languages' imports and config strings stay as they are.
- A text file that isn't valid UTF-8. It moves as an asset with its bytes intact and is never
  rewritten, so references inside it stay stale.
- A folder whose `package.json` `main` names its entry (`./dir` for `dir/lib.ts`).
- `./x` for `x.mjs` or `x.mts`, which Vite accepts and TypeScript does not.

Directories cannot be moved, only files. Windows paths are not supported. A moved symlink
stays a symlink with the same target text, so a relative one may need fixing.

## On a case-insensitive disk (macOS)

The disk says yes to any case, so references that only work there stay stale without a finding:
`'./foo'` for `Foo.ts`, a specifier in NFD against an NFC folder, and `./linkdir/a` through a
directory symlink. A case-only rename of a file works; a case-only rename of a folder does not
change the folder on disk, and a destination in a folder differing by case from an existing one
lands in the existing folder.
