# Split the repo into npm workspace packages

**Surfaced:** 2026-09-19, desktop-app brainstorm. **Readiness:** needs-design.

The desktop app (`packages/desktop/`) introduces `"workspaces": ["packages/*"]`
with the web app staying the root package; the companion website is slated for
`packages/website/`. This item finishes the move: the web app, `tools/`, and
each workbench become packages of their own, so the root holds only workspace
config.

## Candidates

- **Web app** — `src/`, `index.html`, `vite.config.ts`, `public/` → `packages/web/`.
- **Tools** — `tools/` (build pipeline, deploy, perf, record, refactor CLI) with
  its own `tsconfig.tools.json` → `packages/tools/`.
- **Workbenches** — `tools/galaxy-renderer`, `tools/flow-workbench` (subpath
  builds via `tools/utils/io/toolPages.ts`), plus the dev-only
  `scene-workbench` and `famous-curator` → one package each. The MCPM
  workbench is done: `packages/mcpm-workbench/`.

## The hard part

The workbenches and much of `tools/` import straight from `src/` (renderer,
formats, `@types/`). The shared-code package now exists: `packages/shared`, a
leaf holding what the app and the MCPM workbench both use (ADR 0017). The MCPM
workbench moved with its `src/` and `tools/` imports frozen as a shrink-only
list (`tests/conventions/mcpmWorkbenchBoundary.test.ts`): 12 MCPM shaders on
the single WESL root, 4 galaxy-catalog Layer and composition files, 19
workbench-only helpers that stayed in `src/`, and 12 `tools/` modules. The
other workbenches' closures reach into Layers and the engine and have not been
sorted; follow the same shape (package, root-suite tests, boundary list).

## Blast radius to plan for

- `npm run move-files` rewrites TS imports but misses `.wesl` `package::`
  imports and string-literal paths (CLAUDE.md).
- The `tests/` mirror convention, the ratchet tests keyed on paths
  (`serviceFilePurity.test.ts` and siblings), `.github/workflows/ci.yml`, the
  Cloudflare Workers Assets build (`npm run build` at the root), skills and
  docs citing `src/…` paths.
- Every open worktree conflicts with a tree-wide move — land it at a quiet
  moment, as its own PR, after a `refactor-ground` pass.
