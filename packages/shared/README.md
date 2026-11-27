# shared

Code the app and a tool app (a workbench, the website, the desktop app) both use: math helpers
and their types, form components and icons, the GPU device, the data manifest loader, the design
tokens. [ADR 0017](../../docs/adrs/0017-shared-leaf-package.md) records why it exists.

## What belongs here

A file both the app's `src/` and a tool app need, moved together with everything it imports. The
package is a leaf: it imports only its own files and npm packages (`react`, `classnames`).

Not here: anything that imports a Layer, a composition, the store or the engine, and code only one
consumer uses (it stays with that consumer). `tests/conventions/sharedPackageBoundary.test.ts`
fails on a relative import, `composes` or `@import` that leaves `packages/shared/src/`.

## Importing it

By relative path (`../../packages/shared/src/utils/math/cross3`), never as `@skymap/shared`: in a
worktree without its own install a package name resolves to the main checkout's copy, so a branch
would build against main's code. Files keep the sub-path they had under `src/`.

## Tests

`packages/shared/tests/` mirrors `src/` and runs in the root suite (`npm test`); the root
`tsconfig.json` type-checks both folders. Move files in or out with `npm run move-files`, which
takes the test mirror along.
