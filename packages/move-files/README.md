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
`.gitignore` is respected). Paths are relative to the root. Commit the pure move on its own
so git's rename detection keeps history.

A moved `.tsx` takes its companions along (see config); a companion already named in the
batch keeps its explicit destination. Chains and swaps (`a -> b`, `b -> a`) work because
every reference is resolved against the old layout and spelled for the new one. The author's
spelling survives: extension or none, `.js` for `.ts`, `?worker` suffixes, quotes, aliases.

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
test-mock functions, beyond `vi.mock`, whose first argument is a path. Aliases come from the
nearest `tsconfig.json`, following `extends`.

## Exit codes

| Code | Meaning                                                                      |
| ---- | ---------------------------------------------------------------------------- |
| 0    | Clean                                                                        |
| 1    | Written, with findings listed as `file:line`. `--dry` returns 1 the same way |
| 2    | Refused or bad arguments, nothing written (each problem on stderr)           |
| 3    | A write failed partway; the sources are still on disk                        |

Findings are only what this batch newly broke: a `./` string that resolved before and does
not now (or resolves elsewhere), and an old repo-relative path still in code.

## What it does not rewrite

`.astro` and `.mdx` files are scanned by the guard but not rewritten, and `.wesl` is not read at all; non-import
path strings (asset URLs, `rawDataPath` keys) are only reported when they hold an old path.
Directories cannot be moved, only files. Windows paths are not supported.
