/**
 * A file that exports one SCREAMING_SNAKE `const` and nothing else is named for it in camelCase with
 * a `.constant.ts` suffix (`MAX_CATALOG_FILE_BYTES` → `maxCatalogFileBytes.constant.ts`), and a
 * `*.constant.ts` file exports exactly that. The match ignores case, so a name the constant writes as
 * one word (`PATHTRACER_…`) may be split in the file name (`pathTracer…`). Owner rule of 2026-11-26.
 * An interim rule for the workbench only: the repo-wide goal is `<thing>.constants.ts` (BACKLOG,
 * "Constants files"), so do not add the app as a scope. One SCOPES row per tree; `allowed` is
 * today's debt and only shrinks: a listed file must still fail.
 */
import { basename } from 'node:path';
import { Node, VariableDeclarationKind } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { exportedDeclarations } from '../helpers/conventions/exportedDeclarations';
import { walkFiles } from '../helpers/conventions/walkFiles';

type Scope = {
  readonly name: string;
  readonly roots: readonly string[];
  readonly allowed: readonly string[];
};

const SCOPES: readonly Scope[] = [
  {
    name: 'mcpm-workbench',
    roots: ['tools/mcpm-workbench/src'],
    allowed: [],
  },
];

const SCREAMING_SNAKE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;
const CONSTANT_SUFFIX = '.constant.ts';

const camelCaseOf = (screaming: string): string =>
  screaming.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** The file's one export when it is a SCREAMING_SNAKE `const`; otherwise null. */
function loneConstant(file: string): string | null {
  const exports = [...exportedDeclarations(file).entries()];
  const [only] = exports;
  if (exports.length !== 1 || only === undefined) return null;
  const [name, nodes] = only;
  const node = nodes.length === 1 ? nodes[0] : undefined;
  const isConst =
    node !== undefined &&
    Node.isVariableDeclaration(node) &&
    node.getVariableStatement()?.getDeclarationKind() === VariableDeclarationKind.Const;
  return isConst && SCREAMING_SNAKE.test(name) ? name : null;
}

function constantNameProblems(file: string): string[] {
  const fileName = basename(file);
  const isConstantFile = fileName.endsWith(CONSTANT_SUFFIX);
  const constant = loneConstant(file);
  if (constant === null)
    return isConstantFile ? ['a .constant.ts file exports exactly one SCREAMING_SNAKE const'] : [];
  const stem = fileName.slice(0, -(isConstantFile ? CONSTANT_SUFFIX : '.ts').length);
  const named =
    isConstantFile &&
    /^[a-z][A-Za-z0-9]*$/.test(stem) &&
    stem.toLowerCase() === camelCaseOf(constant).toLowerCase();
  return named ? [] : [`name it ${camelCaseOf(constant)}${CONSTANT_SUFFIX}`];
}

describe.each(SCOPES)('$name: a constant file is <camelCase>.constant.ts', ({ roots, allowed }) => {
  const files = roots
    .flatMap((root) => walkFiles(root, ['.ts']))
    .filter((file) => !/\.(test|d)\.ts$/.test(file));
  expect(files.length).toBeGreaterThan(0);
  const listed = new Set(allowed);

  it.each(files.filter((f) => !listed.has(f)))('%s', (file) => {
    expect(
      constantNameProblems(file),
      'A file holding one SCREAMING_SNAKE const is named <camelCase of it>.constant.ts ' +
        '(rename it with npm run move-files); a .constant.ts file holds that const alone.',
    ).toEqual([]);
  });

  it.each(allowed)('%s still breaks the rule (fixed? drop its allowed row)', (file) => {
    expect(files).toContain(file);
    expect(constantNameProblems(file)).not.toEqual([]);
  });
});
