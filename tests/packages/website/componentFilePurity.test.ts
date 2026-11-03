/**
 * The website's component and hook files declare only their component or hook (and its own `Props`): a
 * module-level constant goes to `<Name>.constants.ts` beside it, a helper function to `utils/<fn>.ts` (in the
 * dev overlay, `dev/<area>/<fn>.ts`) or, when it renders, to a component file of its own. Owner rule of
 * 2026-11-02; the app's `src/` gets it later. Types are noInlineTypes.test.ts's to police.
 */
import { basename } from 'node:path';
import { Node, type Statement } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { parseOnlyProject } from '../../helpers/conventions/parseOnlyProject';
import { walkFiles } from '../../helpers/conventions/walkFiles';

const SITE = 'packages/website/src';

const isHook = (name: string) => /^use[A-Z]/.test(name) && !name.includes('.constants.');
const files = walkFiles(SITE, ['.ts', '.tsx']).filter((file) => {
  const name = basename(file);
  return !name.endsWith('.d.ts') && (name.endsWith('.tsx') || isHook(name));
});

/** What a statement other than the file's own symbol is, and where it belongs. */
function misplaced(stmt: Statement, own: string): string[] {
  if (
    Node.isImportDeclaration(stmt) ||
    Node.isExportAssignment(stmt) ||
    Node.isTypeAliasDeclaration(stmt) ||
    Node.isInterfaceDeclaration(stmt)
  )
    return [];
  if (Node.isFunctionDeclaration(stmt)) {
    const name = stmt.getName() ?? 'default';
    return name === own
      ? []
      : [`helper ${name}: move it to utils/${name}.ts, or its own component file`];
  }
  if (Node.isVariableStatement(stmt)) {
    return stmt
      .getDeclarations()
      .filter((decl) => decl.getName() !== own)
      .map((decl) => {
        const init = decl.getInitializer();
        const name = decl.getName();
        return init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))
          ? `helper ${name}: move it to utils/${name}.ts, or its own component file`
          : `constant ${name}: move it to ${own}.constants.ts`;
      });
  }
  return [
    `${stmt.getKindName()} at line ${stmt.getStartLineNumber()}: move it to ${own}.constants.ts`,
  ];
}

describe('website component and hook files declare only their own symbol', () => {
  expect(files.length).toBeGreaterThan(0);

  it.each(files)('%s', (file) => {
    const own = basename(file).replace(/\.tsx?$/, '');
    const statements = parseOnlyProject.addSourceFileAtPath(file).getStatements();
    expect(statements.flatMap((stmt) => misplaced(stmt, own))).toEqual([]);
  });
});
