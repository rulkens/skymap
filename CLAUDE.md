# Skymap — Claude onboarding

Quick orientation for an AI agent picking up work here; it points at the deeper docs.

## What this is

A WebGPU 3D galaxy renderer: three real catalogs (SDSS, 2MRS, GLADE) parsed at build time into a custom binary format, loaded in the browser, drawn as instanced point billboards with per-galaxy thumbnail quads on close approach. TS + Vite + React UI shell; raw WebGPU + WGSL renderer.

## Where to look

```
src/
  @types/  one type per file; deep relative imports, no barrels
  components/  React UI shell (InfoCard, SettingsPanel, ScaleBar, StatusBar)
  data/  static data: sources enum, colourIndex spec, binary format
  hooks/  React hooks (useEngine, useSplash, alias/structure indexes, …)
  services/
    camera/  OrbitCamera, OrbitControls, tweens
    engine/  engine orchestrator, autoLod, cloud loader
      galaxyGenerator/  galaxy generation: v1/ sprite stars (to be deleted),
                        v2/ analytic field, shared/ — READMEs in each
    gpu/  renderers, texture atlas, image queue/fetcher, WGSL shaders
    input/  raw pointer/wheel input → camera deltas (SpaceMouse removed 2026-06-16)
  state/  RTK slices/selectors/sagas per domain; forbids react-redux (see store/)
  store/  RTK store wiring: createAppStore, root reducer/saga, effects
  styles/  global.css — design tokens + body/html reset only
  utils/  pure helpers (math, format, random) — heavily tested
tools/
  animation/  tourLength — beat-sheet / clip-length reporting
  catalog/  buildAllBins (pipeline entry), crossMatch dedup, subsampleByAbsMag
  curation/  shared curation helpers (dedupeByProximity, writeMetaSidecar)
  dev/  tmux + worktree helpers — see "Tmux workflow helpers" below
  famous/  famous-galaxy seed expansion + image fetchers
  famous-curator/  hand-curate Famous thumbnails (npm run curate-famous)
  filaments/  buildFilaments — DisPerSE wrapper
  flow/  CF4++ peculiar-velocity flow-field builder + verifier
  flow-workbench/  WebGPU dev tool visualising the flow field
  galaxy-renderer/  dev tool: procedural Hubble-sequence galaxy + HDR bloom
  volumes/  scalar-field volume builders (CF-4, MCPM) + diagnostics
  fonts/  buildFontAtlas — MSDF multi-font atlas generator
  perf/  GPU-timing harness (npm run perf) → tools/perf/README.md
  record/  offline tour recorder → mp4 (npm run record-tour)
  site/  makeFavicon, makeOgImage
  structures/  buildStructures — cluster/supercluster catalog builder
  deploy/  syncR2 + r2Cors.json + r2-static/ static assets
  fetch/  external-catalog fetchers with on-disk resume caches
  parsers/  SDSS CSV, 2MRS fixed-width, GLADE fixed-width, NPY, ND-skeleton
  utils/  tools-only helpers — one file per function, deep imports
  vendor-types/  ambient .d.ts shims for msdf-bmfont-xml and pngjs
data/
  raw/  catalog sources, one subdir per source (2mrs/, glade/, hyperleda/, sdss/,
        cf4/, mcpm/, milliquas/, filaments/, famous/, fonts/, mcxc/, mscc/).
        VizieR ReadMes live beside their files (byte layouts!). Paths go
        through tools/utils/io/rawDataRegistry.ts.
docs/BACKLOG.md  ground-truth list of what's next
docs/superpowers/plans/  active implementation plans; shipped → plans/completed/
docs/superpowers/specs/  design specs; shipped → specs/completed/
tests/  Vitest suite — mirrors src/ tree
```

## Project conventions (these override defaults)

- **Didactic but budgeted comments**: explain _why_, never _what_ the code does. A comment earns its place by recording something a reader would otherwise rediscover the hard way: a landmine (including a choice that looks wrong and would get "fixed" back), a unit, a derivation, a cross-file contract. Budget: **module header ≤ 10 lines, comment lines ≤ half the code lines in the file.** Past the budget the material is either not load-bearing, or it belongs in the spec/plan — link it rather than inlining it. Research surveys, option comparisons and "we tried X first" are plan content; history is the git log's job. (Overrides the default no-comments rule; detail in [`docs/superpowers/conventions/comments.md`](docs/superpowers/conventions/comments.md).)
- **`type` aliases, never `interface`**: `export type X = { ... }` for all TS shapes.
- **No barrel exports for components**: import React components directly from their `.tsx`. No `index.ts` re-export files in component folders.
- **One symbol per file in `utils/` and `@types/`**: every file in `src/utils/` (and `tools/utils/`) exports exactly **one function**; every file in `src/@types/` exports exactly **one type**. Filename = the exported symbol's name (kebab/camel as the symbol dictates). No multi-export helper grab-bags — if a "data" file grows a generic pure helper, extract it to its own `utils/<area>/<fn>.ts` (math/format/color/random/gpu/…) with a focused test. Deep relative imports, no barrels.
- **Dev server stays running**: `npm run dev` is left running in the background for HMR visual checks. Don't kill it. To verify a UI change, ask the user to look (or describe what they should see).
- **TDD via plans**: substantial features get a plan in `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` with bite-sized TDD tasks. Plans are executed via the `subagent-driven-development` workflow (fresh subagent per task + spec + quality reviews); execution itself follows [`docs/superpowers/conventions/sdd-execution.md`](docs/superpowers/conventions/sdd-execution.md) (task-list gate, pipelined reviews, ledger archiving). Plans follow [`docs/superpowers/conventions/plan-style.md`](docs/superpowers/conventions/plan-style.md) — **contract code yes, implementation code no** (overrides the upstream `writing-plans` skill's "complete code in every step" default). When a plan ships, run the `/feature-done` audit: it gates on the DoD then relocates the plan + its spec to `plans/completed/` + `specs/completed/`.
- **Refactor the ground before building**: any feature substantial enough for a spec/plan runs the `refactor-ground` skill **after brainstorming converges, before the spec is written**. It sketches the feature's ideal diff (data delta first), issues growth/bolt-on verdicts per touchpoint, and checkpoints the shape with the user; the spec then carries a "Ground preparation" section (filled, or "none needed — because X") and is written against the post-refactor architecture. Prep refactors are their own commits, sequenced before the feature commits; whether they land as separate PR(s) or ride one PR with the feature is an explicit ask at the checkpoint, every time — no default. `plan-style.md` gates plan authoring on that section existing.
- **Plans coexist**: multiple in-flight plans is normal. Check the file list before starting new work to avoid stomping on something else.
- **Backlog hygiene**: [`docs/BACKLOG.md`](docs/BACKLOG.md) lists only _unstarted_ work, grouped by subsystem area with a readiness tag; design-bearing items have a `docs/backlog/YYYY-MM-DD-<slug>.md` detail file linked from the index. **Keep the index line very short** — title + readiness tag + one terse clause + the `→ [details]` link. Anything longer (file lists, evidence, approach, options) goes in the detail md, NEVER inline in `BACKLOG.md`; the index is a scannable list, not a write-up. **Picking up an item removes it in the same change** — whether you implement it directly or write a spec/plan, delete its index line **and** its detail file in that commit/branch (the detail file seeds the spec; the spec/plan is then the source of truth). **Never strike through a done item** — delete it; the completion record is the git log + `*/completed/`. `/feature-done` sweeps the backlog when a plan ships; audit the whole file against the git log periodically to catch stragglers.
- **Test what can break**: judge every test by "will it ever fail on a real bug no other test or compiler check catches?" — no runtime type tests, constant/registry restatements, clamp-boundary or mirror tests. See [`docs/superpowers/conventions/testing.md`](docs/superpowers/conventions/testing.md).
- **Simplicity over ease**: judge a design by the artifact (what runs and gets changed), not the keystrokes; un-braid concerns that could vary independently. Principles + the known-entanglements backlog live in [`docs/superpowers/conventions/simplicity.md`](docs/superpowers/conventions/simplicity.md) (Rich Hickey's _Simple Made Easy_, applied to skymap). Run the `entanglement-radar` skill to review a diff/module — **and at design time over a spec/plan**: a section that exists to teach handling of an "asymmetry"/"subtlety"/"special-case" is a STOP-and-un-braid signal (classify essential vs accidental), not a note to write more carefully.
- **Code is liability**: the scarce resource is the user's maintenance attention, not agent keystrokes. Prefer the smallest diff that satisfies the requirement; deletion beats addition; speculative generality, extra knobs/constants, and parallel paths are review findings, not features. A neutral-or-negative measurement **halts** a landing pipeline — land/park is the user's ruling, never process momentum. See [`simplicity.md`](docs/superpowers/conventions/simplicity.md).

## Commands

```bash
npm run dev         # vite dev server (leave running)
npm run build       # tsc --noEmit + vite build
npm run typecheck   # both src and tools tsconfigs
npm test            # vitest run (single pass)
npm run test:watch  # vitest watch mode
npm run build-all   # regenerate public/data/*.bin from raw catalogs
npm run build-tiers # alias for build-all — emits per-tier .bin variants
npm run format      # prettier
npm run move-files  # move/rename TS files, imports auto-rewritten (see .claude/skills/refactor)
npm run refactor    # ts-morph refactoring CLI (rename/extract/inline/delete/refs/move) → .claude/skills/refactor/SKILL.md
npm run record-tour # offline 4K tour recorder → tools/record/README.md
npm run perf        # headless GPU-timing harness → tools/perf/README.md
```

For `npm run perf`, read the `perf` skill (`.claude/skills/perf/SKILL.md`) first: measure **before and after** any renderer/perf change, and **in a worktree pass `--url http://localhost:<port>`** from _your_ server's `Local:` line or you silently measure another branch's server. The skill carries the flags and interpretation traps (MERGED vs PER-LAYER vs FLOOR, Apple Silicon slot-sum inflation).

The suite is large (600+ test files) and must stay green. Tests follow [`docs/superpowers/conventions/testing.md`](docs/superpowers/conventions/testing.md) — what _not_ to test matters as much as what to test.

### Tmux workflow helpers

- **`tools/dev/skymap-tmux.sh`** — starts/reattaches a `skymap` session, one window per `.claude/worktrees/*` plus `main` and `shell`; does not auto-start `claude`.
- **`tools/dev/skymap-wt-clean.sh`** — interactive cleanup of merged worktrees; skips dirty ones. Closing a tmux window does **not** remove its worktree.

One tmux window per worktree, rooted at the worktree path, so shell and `claude` share CWD. Use `EnterWorktree`/`ExitWorktree` only in single-window flows.

## Deep docs — read before touching these areas

These are **mandatory pre-reading** for the task areas below, not optional background. The always-resident context deliberately excludes them; open the file FIRST when your work lands in its area.

- Touching `tools/` parsers, catalog builders, fetchers, or anything under `data/` → read [docs/DATA.md](docs/DATA.md) FIRST (pipeline model, binary format, local-volume override, data-refresh orders, MCPM, catalog gotchas, new-source checklist).
- Any deploy, R2 sync, cache/CORS, or `.env` question → read [docs/DEPLOY.md](docs/DEPLOY.md) FIRST (Workers Assets vs R2, full deploy steps, cloudLoader/dataUrl).
- Touching `src/services/gpu/`, `engine`, shaders, or debugging rendering → read [docs/RENDERER.md](docs/RENDERER.md) FIRST (renderer map + hard-won WebGPU landmines).

## When the user asks you to…

- **"add a feature"** → check `docs/BACKLOG.md` and `docs/superpowers/plans/` for an existing plan or captured issue. If it's substantial, run the `refactor-ground` skill once the shape of the ask is clear (before the spec is written — see the Refactor-the-ground convention), then write a new plan via the `writing-plans` skill rather than coding inline. If the work matches a backlog item, **remove that item (index line + `docs/backlog/` detail file) in the same change** that starts it — see the Backlog-hygiene convention.
- **"fix this bug"** → check tests first; the project favours reproducing bugs as failing tests, then fixing.
- **"why is this slow?"** → **measure first** with `npm run perf` (read the `perf` skill); then see [docs/RENDERER.md](docs/RENDERER.md) for the CPU-side mental model (per-frame work scales with ~2.5M on-screen galaxies; hoist constants, gate with squared distances, avoid per-galaxy `Math.tan`).
- **"refactor X"** → keep the services/ layout. Cross-cutting helpers go in `utils/`; rendering subsystems in `services/gpu/`. Tests mirror the src tree. Any file move/rename goes through `npm run move-files` (next entry), not `git mv` + hand-edited imports.
- **"move/rename/relocate a file"** (incl. folder reorgs) → `npm run move-files -- <from> <to>`, or `-- --manifest <moves.json>` for a batch. ts-morph rewrites every relative import project-wide and drags the `tests/` mirror along; run `--dry` first. Hand-editing import paths after a move is always the wrong plan. Not covered: `.wesl` `package::` imports + string-literal paths — grep for the old path afterwards. `npm run refactor -- move <from> <to>` is the canonical spelling. Details in `.claude/skills/refactor/SKILL.md`.
- **"why does the renderer use index Y?"** → check `galaxyPointRenderer.ts` SLOTS_PER_GALAXY_POINT and the matching attribute layout in the shader; they must agree byte-for-byte (see [docs/RENDERER.md](docs/RENDERER.md)).

## Memory

The agent's auto-memory at `~/.claude/projects/-Users-rulkens-Development-js-skymap/memory/` carries cross-session context. Read `MEMORY.md` for the index; update memories whenever project state shifts (plan task completed, convention adopted, catalog re-fetched).

## Compact Instructions

When compacting, always preserve: current branch + HEAD + open PR; every in-flight background agent/task and its state; SDD workspace/ledger paths; open decisions and the immediate next actions. Where an SDD ledger exists (`.superpowers/sdd/<plan>/progress.md`), treat it as the authoritative resume map and keep only a pointer to it, not a re-summary of it.
