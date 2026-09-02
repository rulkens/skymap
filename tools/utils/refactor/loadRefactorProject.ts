/**
 * loadRefactorProject — build the one ts-morph `Project` every refactor command
 * shares: a single in-memory module graph spanning all of skymap's TypeScript,
 * so an AST rewrite (a move, a rename, a codemod) sees every file that could
 * reference the thing it touches.
 *
 * ## Why one Project spanning three trees
 *
 * The repo has two tsconfigs and NEITHER covers everything: `tsconfig.json`
 * includes `["src", "tests"]` (excludes `tools`), `tsconfig.tools.json`
 * includes `["tools", "src"]` (no `tests`). A refactor can ripple across all
 * three — a `tools/` helper imported by a `src/` file with a `tests/` mirror —
 * so we build ONE `Project` over `src/ + tests/ + tools/`. We borrow
 * `tsconfig.json` only for its `compilerOptions` (`skipAddingFilesFromTsConfig`
 * stops it also pulling in that tsconfig's file set), then add every file
 * explicitly. Using either tsconfig's own include set would silently miss a
 * whole tree and leave dangling imports.
 *
 * ## Paths are relative to the process cwd
 *
 * `tsConfigFilePath` and the glob roots resolve against `process.cwd()`, which
 * for both the CLI and the test suite is the repo root. The commands run from
 * there; callers that need absolute move targets resolve them at the call site.
 */

import { Project } from 'ts-morph';

export function loadRefactorProject(): Project {
  const project = new Project({
    tsConfigFilePath: 'tsconfig.json',
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFilesAtPaths(['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', 'tools/**/*.{ts,tsx}']);
  return project;
}
