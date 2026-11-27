/**
 * packages/shared is a leaf (ADR 0017): the app and the tool apps import it, it imports only itself
 * and npm packages. A relative specifier that leaves `packages/shared/src/` would make every consumer
 * drag that file's tree along, so each TS import, re-export and `import()`, and each CSS `composes`
 * and `@import`, must resolve inside it. Empty allowlist.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { SyntaxKind } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { cssStatements } from '../helpers/conventions/cssStatements';
import { parseOnlyProject } from '../helpers/conventions/parseOnlyProject';
import { walkFiles } from '../helpers/conventions/walkFiles';

const SRC = 'packages/shared/src';
const CSS_REFERENCE = /^(?:composes\s*:.*\sfrom|@import)\s+(?:url\()?(['"])(.+?)\1/s;

function tsSpecifiers(file: string): string[] {
  const sourceFile = parseOnlyProject.addSourceFileAtPath(file);
  const dynamic = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => call.getExpression().getKind() === SyntaxKind.ImportKeyword)
    .map((call) => call.getArguments()[0])
    .filter((arg) => arg?.getKind() === SyntaxKind.StringLiteral)
    .map((arg) => arg!.getText().slice(1, -1));
  return [...sourceFile.getImportDeclarations(), ...sourceFile.getExportDeclarations()]
    .map((decl) => decl.getModuleSpecifierValue())
    .filter((spec): spec is string => spec !== undefined)
    .concat(dynamic);
}

function cssSpecifiers(file: string): string[] {
  return cssStatements(readFileSync(file, 'utf8'))
    .filter((statement) => statement.kind === 'declaration')
    .map((statement) => CSS_REFERENCE.exec(statement.text)?.[2])
    .filter((spec): spec is string => spec !== undefined);
}

const files = walkFiles(SRC, ['.ts', '.tsx', '.css']);
const ALLOWED: readonly string[] = [];

describe('packages/shared imports nothing outside itself', () => {
  expect(files.length).toBeGreaterThan(0);

  it.each(files.filter((file) => !ALLOWED.includes(file)))('%s', (file) => {
    const outside = (file.endsWith('.css') ? cssSpecifiers(file) : tsSpecifiers(file))
      .filter((spec) => spec.startsWith('.'))
      .filter((spec) => {
        const target = relative(process.cwd(), resolve(join(dirname(file), spec)));
        return !target.replace(/\\/g, '/').startsWith(`${SRC}/`);
      });
    expect(
      outside,
      'The shared package is a leaf: move the imported file into packages/shared/src (with its ' +
        'own imports), or keep this file in its consumer.',
    ).toEqual([]);
  });
});
