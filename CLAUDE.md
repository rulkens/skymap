# Skymap — Claude onboarding

Quick orientation for an AI agent picking up work here; it points at the deeper docs.

## What this is

A WebGPU 3D galaxy renderer: three real catalogs (SDSS, 2MRS, GLADE) parsed at build time into a custom binary format, loaded in the browser, drawn as instanced point billboards with per-galaxy thumbnail quads on close approach. TS + Vite + React UI shell; raw WebGPU + WGSL renderer.

## Where to look

`src/` and `tools/` are mostly self-describing; the non-obvious pointers:

```
src/@types/  one type per file; deep relative imports, no barrels
src/compositions/  build-time engine compositions (app; reference engines later)
src/layers/  self-contained Layers, colocated (galaxyCatalog shipped in (d)/(e);
             sources/, settings/, load/, render/, passes/, present/, sagas/, ui/, @types/)
src/services/engine/galaxyGenerator/  v1/ sprite stars (to be deleted),
                                      v2/ analytic field, shared/ — READMEs in each
src/state/  RTK slices/selectors/sagas per domain; forbids react-redux (see store/)
tools/utils/io/rawDataRegistry.ts  every path into data/raw/ goes through here;
                                   VizieR ReadMes sit beside their files (byte layouts!)
docs/BACKLOG.md  ground-truth list of what's next
docs/superpowers/plans/ + specs/  active plans and specs; shipped → */completed/
tests/  Vitest suite — mirrors src/ tree
```

## Project conventions (these override defaults)

- **Didactic but budgeted comments**: explain _why_ (landmines, units, derivations, cross-file contracts), never _what_, within **module header ≤ 5 lines, comment lines ≤ half the code lines** — overrides the default no-comments rule, see [`comments.md`](docs/superpowers/conventions/comments.md).
- **`type` aliases, never `interface`**: `export type X = { ... }` for all TS shapes.
- **No barrel exports for components**: import React components directly from their `.tsx`; no `index.ts` re-export files.
- **One symbol per file** in `utils/` and `@types/` (`src/` and `tools/` alike): one function per `utils/` file, one type per `@types/` file, filename = the symbol's name; a generic helper growing inside another file gets extracted to `utils/<area>/<fn>.ts` with a focused test. Deep relative imports, no barrels. Types never live inline in implementation files (a React component's own `Props` is the one exception); inside a Layer, its own `@types/` folder is this convention's home for the Layer's own contract types (e.g. `src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime.ts`), while types shared with core or with a sibling subsystem still live under `src/@types/`. Under `tools/`, a tool app owns its types in `tools/<tool>/@types/` (the same pattern) and shared-helper types live in `tools/@types/<area>/` (the `src/@types/` analogue) — never loose beside the implementation.
- **Frame files declare only their own symbol**: files in `src/services/engine/frame/` (incl. `timing/`, `passes/`) export the one symbol they are named for and nothing else — helpers to `src/utils/` or `frame/`, constants to `src/data/`; ratchet test `tests/services/engine/frame/frameFilePurity.test.ts` allow-lists today's offenders and only ever shrinks.
- **Dev server stays running**: `npm run dev` is left running in the background for HMR visual checks. Don't kill it. To verify a UI change, ask the user to look.
- **Plans coexist**: multiple in-flight plans is normal — check `docs/BACKLOG.md` and the plans file list before starting work, to reuse what exists and avoid stomping on it.
- **TDD via plans**: substantial features get a bite-sized-task plan in `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`, executed via the `subagent-driven-development` workflow under the lean protocol in [`sdd-execution.md`](docs/superpowers/conventions/sdd-execution.md) (grouped dispatches, one whole-branch review at the end, CI as the gate) and written per [`plan-style.md`](docs/superpowers/conventions/plan-style.md) — contract code yes, implementation code no, overriding the `writing-plans` skill; `/feature-done` gates the DoD and files plan + spec under `*/completed/`.
- **Add a feature** → check `docs/BACKLOG.md` and `docs/superpowers/plans/` first; if substantial, write a plan via the `writing-plans` skill rather than coding inline, and remove the matching backlog item in the same change.
- **Refactor the ground before building**: spec/plan-sized features run the `refactor-ground` skill after brainstorming converges and **before the spec is written**, so the spec carries a "Ground preparation" section (filled, or "none needed — because X") and targets the post-refactor architecture; prep refactors are their own commits, sequenced first, and separate-PR vs riding the feature PR is an explicit ask at the checkpoint, every time.
- **Backlog hygiene**: [`docs/BACKLOG.md`](docs/BACKLOG.md) lists only _unstarted_ work as very short index lines (title + readiness tag + one clause + `→ [details]` to `docs/backlog/YYYY-MM-DD-<slug>.md` for design-bearing items; anything longer goes in that detail file, never inline); picking an item up deletes index line **and** detail file in the same change, and done items are deleted, never struck through.
- **Test what can break**: judge every test by "will it ever fail on a real bug no other test or compiler check catches?" — see [`testing.md`](docs/superpowers/conventions/testing.md). The 600+-file suite must stay green.
- **Simplicity over ease**: judge a design by the artifact, not the keystrokes, and un-braid concerns that could vary independently ([`simplicity.md`](docs/superpowers/conventions/simplicity.md)); run `entanglement-radar` over a diff/module **and at design time over a spec/plan**, where a section teaching handling of an "asymmetry"/"subtlety"/"special-case" is a STOP-and-un-braid signal.
- **Code is liability**: the scarce resource is the user's maintenance attention — smallest diff wins, deletion beats addition, speculative generality and extra knobs are review findings, and neutral-or-negative evidence **halts** a landing pipeline (land/park is the user's ruling, never process momentum); `deletion-audit` is the standing counter-bias after fix waves and at `/feature-done`, per [`leanness.md`](docs/superpowers/conventions/leanness.md).
- **Fix a bug** → reproduce it as a failing test first, then fix.
- **Why is this slow?** → measure first with `npm run perf`, then [docs/RENDERER.md](docs/RENDERER.md) for the CPU mental model (per-frame work scales with ~2.5M on-screen galaxies: hoist constants, gate with squared distances, no per-galaxy `Math.tan`).
- **Move/rename/relocate a file** (incl. folder reorgs) → `npm run move-files -- <from> <to>` (or `-- --manifest <moves.json>`; `--dry` first), never `git mv` + hand-edited imports; it rewrites relative imports project-wide and drags the `tests/` mirror along, but misses `.wesl` `package::` imports and string-literal paths — grep for the old path afterwards. See `.claude/skills/refactor/SKILL.md`.
- **Refactors keep the services/ layout**: cross-cutting helpers in `utils/`, rendering subsystems in `services/gpu/`, tests mirroring src.

## Commands

```bash
npm run dev         # vite dev server (leave running)
npm run build       # tsc --noEmit + vite build
npm run typecheck   # both src and tools tsconfigs
npm run typecheck:fast  # same two projects via tsgo (TS 7 preview) — ~7x faster
npm test            # vitest run (single pass)
npm run test:watch  # vitest watch mode
npm run build-all   # regenerate public/data/*.bin from raw catalogs
npm run build-tiers # alias for build-all — emits per-tier .bin variants
npm run format      # prettier, only files this branch touches (format:all = whole repo)
npm run move-files  # move/rename TS files, imports auto-rewritten (see .claude/skills/refactor)
npm run refactor    # ts-morph refactoring CLI (rename/extract/inline/delete/refs/move) → .claude/skills/refactor/SKILL.md
npm run record-tour # offline 4K tour recorder → tools/record/README.md
npm run perf        # headless GPU-timing harness → tools/perf/README.md
npm run capture-featured # palette-card thumbnails → tools/capture/README.md
```

`typecheck:fast` is the tsgo inner loop; `tsc` stays the gate for `npm run build` and CI — treat a `:fast`-only failure as a tsgo bug.

For `npm run perf`, read the `perf` skill first (measure before _and_ after any renderer/perf change); **in a worktree pass `--url http://localhost:<port>`** from _your_ server's `Local:` line or you silently measure another branch's server.

Tmux/worktree helpers live in `tools/dev/` (`skymap-tmux.sh`, `skymap-wt-clean.sh`); closing a tmux window does **not** remove its worktree. Use `EnterWorktree`/`ExitWorktree` only in single-window flows.

## Deep docs — read before touching these areas

These are **mandatory pre-reading** for the task areas below, not optional background. The always-resident context deliberately excludes them; open the file FIRST when your work lands in its area.

- Touching `tools/` parsers, catalog builders, fetchers, or anything under `data/` → read [docs/DATA.md](docs/DATA.md) FIRST (pipeline model, binary format, local-volume override, data-refresh orders, MCPM, catalog gotchas, new-source checklist).
- Any deploy, R2 sync, cache/CORS, or `.env` question → read [docs/DEPLOY.md](docs/DEPLOY.md) FIRST (Workers Assets vs R2, full deploy steps, cloudLoader/dataUrl).
- Touching `src/services/gpu/`, `engine`, shaders, or debugging rendering → read [docs/RENDERER.md](docs/RENDERER.md) FIRST (renderer map + hard-won WebGPU landmines). Attribute indices: `galaxyPointRenderer.ts` `SLOTS_PER_GALAXY_POINT` and the shader's attribute layout must agree byte-for-byte.

## Compact Instructions

When compacting, always preserve: current branch + HEAD + open PR; every in-flight background agent/task and its state; SDD workspace/ledger paths; open decisions and the immediate next actions. Where an SDD ledger exists (`.superpowers/sdd/<plan>/progress.md`), treat it as the authoritative resume map and keep only a pointer to it, not a re-summary of it.
