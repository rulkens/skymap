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
- **Workbenches** — `tools/galaxy-renderer`, `tools/mcpm-workbench`,
  `tools/flow-workbench` (subpath builds via `tools/utils/io/toolPages.ts`),
  plus the dev-only `scene-workbench` and `famous-curator` → one package each.

## The hard part

The workbenches and much of `tools/` import straight from `src/` (renderer,
formats, `@types/`). Splitting them needs a shared-code package (or `src/`
exported as a library package) first; without it the packages are folders
with deep `../../` imports and nothing gained.

## Blast radius to plan for

- `npm run move-files` rewrites TS imports but misses `.wesl` `package::`
  imports and string-literal paths (CLAUDE.md).
- The `tests/` mirror convention, the ratchet tests keyed on paths
  (`frameFilePurity.test.ts` and siblings), `.github/workflows/ci.yml`, the
  Cloudflare Workers Assets build (`npm run build` at the root), skills and
  docs citing `src/…` paths.
- Every open worktree conflicts with a tree-wide move — land it at a quiet
  moment, as its own PR, after a `refactor-ground` pass.
