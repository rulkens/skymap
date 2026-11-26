/**
 * The studio package is a lazy chunk: the app reaches it only through dynamic `import()`s of its
 * entry in two files, so Vite emits it apart and the main chunk never depends on it. The package
 * deep-imports the app freely, but reads the store through `src/store/hooks.ts`, never
 * `react-redux`, and never the throwaway mocks under `src/dev/`. Those two import the entry and
 * nothing else from the package. Empty allowlist; the rules are the
 * plan's A2 (docs/superpowers/plans/2026-11-10-clip-studio-package.md) and the package README.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { Node, SyntaxKind, type SourceFile, type StringLiteral } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { parseOnlyProject } from '../helpers/conventions/parseOnlyProject';
import { walkFiles } from '../helpers/conventions/walkFiles';

const PACKAGE = 'packages/studio/';
const ENTRY = `${PACKAGE}src/studioEntry`;
const DYNAMIC_IMPORTERS = new Set([
  'src/state/studio/studioBodySaga.ts',
  'src/components/StudioHost/StudioHost.tsx',
]);

const repoPath = (file: string, spec: string): string =>
  relative(process.cwd(), resolve(join(dirname(file), spec))).replace(/\\/g, '/');

/** Static import and re-export specifiers, type-only included: the boundary is about knowledge. */
const staticSpecifiers = (sourceFile: SourceFile): string[] =>
  [...sourceFile.getImportDeclarations(), ...sourceFile.getExportDeclarations()]
    .map((decl) => decl.getModuleSpecifierValue())
    .filter((spec): spec is string => spec !== undefined);

const dynamicSpecifiers = (sourceFile: SourceFile): string[] =>
  sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => call.getExpression().getKind() === SyntaxKind.ImportKeyword)
    .map((call) => call.getArguments()[0])
    .filter((arg): arg is StringLiteral => arg !== undefined && Node.isStringLiteral(arg))
    .map((arg) => arg.getLiteralValue());

// Only files that spell the package path can reach it; parsing the rest of src/ would be waste.
const appFiles = walkFiles('src', ['.ts', '.tsx']).filter((file) =>
  readFileSync(file, 'utf8').includes(PACKAGE),
);
const packageFiles = walkFiles(`${PACKAGE}src`, ['.ts', '.tsx']);

describe('studio import boundary (lazy chunk)', () => {
  it('src/ never imports the package statically', () => {
    const offenders = appFiles.flatMap((file) =>
      staticSpecifiers(parseOnlyProject.addSourceFileAtPath(file))
        .filter((spec) => spec.startsWith('.') && repoPath(file, spec).startsWith(PACKAGE))
        .map((spec) => `${file} imports '${spec}'`),
    );
    expect(offenders, 'Reach the package through a dynamic import() of studioEntry.').toEqual([]);
  });

  it('only the takeover body saga and the React host import the package dynamically', () => {
    const offenders = appFiles
      .filter((file) => !DYNAMIC_IMPORTERS.has(file))
      .flatMap((file) =>
        dynamicSpecifiers(parseOnlyProject.addSourceFileAtPath(file))
          .filter((spec) => spec.startsWith('.') && repoPath(file, spec).startsWith(PACKAGE))
          .map((spec) => `${file} imports '${spec}'`),
      );
    expect(offenders, `Only ${[...DYNAMIC_IMPORTERS].join(' and ')} load the chunk.`).toEqual([]);
  });

  it('those two load only the entry, so the chunk keeps one door', () => {
    const loaded = [...DYNAMIC_IMPORTERS].flatMap((file) =>
      dynamicSpecifiers(parseOnlyProject.addSourceFileAtPath(file))
        .filter((spec) => spec.startsWith('.') && repoPath(file, spec).startsWith(PACKAGE))
        .map((spec) => repoPath(file, spec)),
    );
    expect(loaded, `Import ${ENTRY}, not a module behind it.`).toEqual([ENTRY, ENTRY]);
  });

  it('the package never imports react-redux or src/dev/', () => {
    const offenders = packageFiles.flatMap((file) => {
      const sourceFile = parseOnlyProject.addSourceFileAtPath(file);
      return [...staticSpecifiers(sourceFile), ...dynamicSpecifiers(sourceFile)]
        .filter(
          (spec) =>
            spec === 'react-redux' ||
            (spec.startsWith('.') && repoPath(file, spec).startsWith('src/dev/')),
        )
        .map((spec) => `${file} imports '${spec}'`);
    });
    expect(offenders, 'Read the store through src/store/hooks.ts; the mocks stay apart.').toEqual(
      [],
    );
  });
});
