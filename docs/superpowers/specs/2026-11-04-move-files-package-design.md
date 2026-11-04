# move-files as a generic package

Move files in any git-hosted JS/TS project and fix every reference, in seconds. Skymap is the first user;
nothing in the package may know about skymap.

## Why

`npm run move-files` wraps ts-morph's `SourceFile.move()`. Each move invalidates the TS Program, and the next one
rebuilds it and re-resolves imports across all 7,164 files. A CPU profile of a 6-move run put 78% of its time in
`createProgram`. A 232-move Layer M1 task spent about 72 of its 86 minutes waiting on these runs.

ts-morph also leaves references stale: `?worker` imports, which break silently in production, `vi.mock` paths, CSS
imports in moved files, and everything inside CSS.

## Measured evidence

From a prototype on 2026-11-04, on this repo. Neither engine wrote files during the timed runs.

| Workload | ts-morph | Prototype |
| --- | --- | --- |
| 1 file, 36 imports rewritten | 28.9s | 1.5–1.8s |
| 47 requested, 54 with mirrors | 483s, 3.16GB | 3.6s, 0.38GB |
| 196 moves (`src/utils/math`) | not run; ~29 min at 8.9s per move | 1.7s |
| 648 moves | not run; ~96 min at 8.9s per move | 2.7s |

On the 54 moves, 185 of the 191 files both engines touched are byte-identical. The other 6 lines: 4 where ts-morph
appended `/index` to a directory import, and 2 CSS imports it left stale. The prototype also rewrote 2 `?worker`
imports that ts-morph left stale.

## Success criteria

- At least 10x faster than ts-morph on a single move and 100x on a 50-move batch, measured on this repo.
- A single pure engine: `move-files` and `refactor rename`'s file move both use it, and `SourceFile.move()` has no
  remaining caller.
- Rewrites: import and export specifiers, dynamic `import()`, import types, `require()`, mock calls, `?query`
  specifiers, and in CSS `composes … from`, `@import` and `url()`.
- CSS files move, and a sibling `.module.css` travels with its `.tsx`.
- References the rewrite can't fix are reported as `file:line`, with a non-zero exit.
- The package has no import from skymap, and project rules live only in `move-files.config.json`.

## Design

### Pure core, thin edges

The core takes a snapshot of file text and returns a plan. It touches no disk and no git, so tests use plain
objects and preview means never applying the plan.

```
cli -> loadMoveContext + readSnapshot -> planMoves (pure) -> renderMoveReport + applyPlan
                                            |- expandCompanions, findUnplaceableCompanions, validation
                                            |- rewriteReferences -> findTsReferences, findCssReferences,
                                            |                       resolveReference, spellReference
                                            |- findBrokenReferences
```

Refs resolve against the old layout and are spelled for the new one, never against a half-moved state, so chains
and swaps need no ordering.

### Finding files

`git ls-files -z --cached --others --exclude-standard`, because it works in any repo and respects `.gitignore`.
Tracked files missing from disk are skipped. Outside a git repo the tool refuses with a clear message. Assets are
checked with a cached `existsSync` rather than listed, because listing ignored files would walk `node_modules`.

### Parsing only what can match

A file is parsed only if its text contains a moved file's stem, or its folder name or a dot-specifier when that
file is an `index`, or a star-less alias. Moved files are always parsed. This took rewrite time on the 54-move set from 2.9s to 0.9s with identical output.
The guard uses a text scan and parses only files with a hit, to rule out comments.

### Keeping the author's spelling

The extension or its absence, `.js` standing for `.ts`, directory imports, `?query` suffixes, quote style and
aliases all survive. Each new spelling must resolve back to the same target in the new layout. If it doesn't, the
order of fallback is the author's form, then the explicit path (`./foo/index`), then relative. An alias survives
only while the target stays inside it.

### Companions

One rule type covers tests in a parallel tree and siblings beside a file:

```json
{
  "companions": [
    { "from": "src/", "to": "tests/", "sources": [".ts", ".tsx"], "suffixes": [".test.ts", ".test.tsx"] },
    { "from": "", "to": "", "sources": [".tsx"], "suffixes": [".module.css"] }
  ]
}
```

Companions follow their primary only, so a test can move alone. An explicit pair overrides a derived one. If a
companion exists but no rule fits the primary's destination, the batch refuses, because the alternative is a
silently orphaned test. Adding an explicit pair resolves it.

### The guard

It reports only what this batch newly broke, because 123 path-shaped strings in this repo already don't resolve,
mostly test fixtures. It compares resolved targets, not existence, so a string pointing at a reoccupied path counts.

| Reason | Meaning |
| --- | --- |
| `no-longer-resolves` | A `./` or `../` string, or an alias in a file nothing rewrites, resolved before the move and doesn't now |
| `now-resolves-elsewhere` | It still resolves, but to a different file than the moved target |
| `mentions-old-path` | A string in code still holds a moved file's old repo-relative path |

It scans TS, CSS, Sass, `.astro` and `.mdx`. The moves are written first, because fixing a finding needs the new layout
on disk. On the 54-move set it reported 13 old-path strings, in website facts and test allow-lists, which is the
hand-grep the refactor skill asks for today.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Clean |
| 1 | Written, with guard findings. `--dry` returns 1 for the same findings, with nothing written |
| 2 | Refused, nothing written |
| 3 | Writing failed partway; the report says what completed |

### Not configurable

There are no plugins, custom resolvers, per-run companion switches or guard ignore lists. Project config holds
only `companions` and `extraMockCallees`. Aliases come from every `tsconfig*.json` and `jsconfig*.json`, following
`extends`: the nearest folder holding one governs an importer.

## Ground preparation

Sketch: a new package of pure functions; two prep commits make the existing code ready for it. Greenfield
cross-check run with a fresh agent, approved by the owner on 2026-11-04.

| Touchpoint | Verdict | Joint |
| --- | --- | --- |
| Engine, guard, CLI, config | Growth | New package |
| Test mirrors | Bolt-on today | `src/` and `tools/` hard-coded in `expandTestMirrors.ts:43` and `anchorToMirroredRoot.ts:29`. Prep 1: one rule table |
| `refactor move` | Bolt-on today | `refactor.ts:225` loads the Project before dispatch. Prep 2: delete the subcommand |
| `planRename` file move | Growth | `applyMoves` keeps its signature and becomes an adapter |

Taken from the cross-check: one rule type, the resolve-back check, target-identity guard, nearest-tsconfig scoping,
refusing unplaceable companions and the exit codes. Rejected: parsing every file, for speed; listing ignored files,
for speed; branded path types and three reference stages, as more types than the bugs justify; `guardIgnore` and
`followCompanions`, as knobs with no user.

Packaging, owner ruling on 2026-11-04: everything on one PR, spec and plan included, prep as separate commits.

## Out of scope

- Publishing to npm, a build step and `bin` use outside this repo. The package stays `private` until a second
  project needs it.
- Rewriting `.astro`, `.mdx`, Sass and Less. The guard reports relative strings and aliases that break.
- Rewriting non-import path strings. The guard reports relative ones.
- `.wesl` `package::` imports. `.wesl` files are not read.
- Text that isn't valid UTF-8: it moves as an asset, so its bytes survive and its references stay stale.
- Windows paths: the core assumes POSIX paths, and nothing here has run on Windows.
- Moving a sibling CSS file during `refactor rename`.
