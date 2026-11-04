/**
 * loadRefactorProject: the one ts-morph `Project` every refactor command shares,
 * spanning all of the repo's TypeScript. No single tsconfig covers it, so `tsconfig.json`
 * lends only its `compilerOptions` and every file is added here. Paths resolve against
 * `process.cwd()`, which the commands require to be the repo root.
 */

import { Project } from 'ts-morph';

export function loadRefactorProject(): Project {
  const project = new Project({
    tsConfigFilePath: 'tsconfig.json',
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFilesAtPaths([
    'src/**/*.{ts,tsx}',
    'tests/**/*.{ts,tsx}',
    'tools/**/*.{ts,tsx}',
    'packages/*/src/**/*.{ts,tsx}',
    'packages/*/tests/**/*.{ts,tsx}',
  ]);
  return project;
}
