# Contributing to Skymap

Thanks for your interest in Skymap! This is a small project, so the
process is correspondingly informal — but a few notes will save us both
some time.

## Development setup

See the [Quickstart](README.md#quickstart-synthetic-data) in the README
for installing dependencies and running the dev server. The renderer
falls back to 100,000 synthetic galaxies if no `.bin` files are present,
which is enough for most contributions. If you need real catalog data,
follow the [Loading real data](README.md#loading-real-data) section.

## Running tests

```bash
npm test            # vitest single pass
npm run test:watch  # vitest watch mode
npm run typecheck   # tsc --noEmit on src + tools
```

Please keep the suite green before opening a pull request. New features
should ship with tests where the code is testable in isolation
(parsers, math helpers, the camera, the binary format). The WebGPU
renderer and React UI are verified visually rather than unit-tested.

## Code style

- **Prettier** is the canonical formatter — run `npm run format` before
  committing.
- **TypeScript strict mode** — both `src` and `tools` typecheck under
  `--strict`. No `any` unless you genuinely can't avoid it.
- **`type` aliases, not `interface`** for all TypeScript shapes
  (`export type X = { ... }`).
- **Arrow functions** for module-level helpers and React components.
- **Didactic comments** — this project intentionally over-comments,
  explaining the _why_ and what alternatives were considered, not just
  the _what_. Match the surrounding style of the file you're editing.

## How to propose changes

For typo fixes, doc tweaks, or small bug fixes: feel free to open a PR
directly.

For anything non-trivial — new features, refactors, dependency
additions, behaviour changes — please **open an issue first** so we
can discuss the approach before code is written. Substantial features
typically also get a TDD plan in `docs/superpowers/plans/` before
implementation.
