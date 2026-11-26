/**
 * A component file `<Name>.tsx` names its props type `<Name>Props`, so a reader (or grep) finds a
 * component's contract by its name: a bare `Props`, another `*Props` name, or a props parameter typed
 * with an inline `{ … }` literal fails. Owner rule of 2026-11-26. noInlineTypes.test.ts exempts every
 * `*Props` in a `.tsx` and leaves that name to this test; every other inline type stays its job.
 * One SCOPES row per tree; `allowed` is today's debt and only shrinks: a listed file must still fail.
 * Adding a tree (another tool, the website) is one more row: its roots and the files failing today.
 */
import { basename } from 'node:path';
import { Node, type FunctionLikeDeclaration, type SourceFile, type TypeNode } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { parseOnlyProject } from '../helpers/conventions/parseOnlyProject';
import { walkFiles } from '../helpers/conventions/walkFiles';

type Scope = {
  readonly name: string;
  readonly roots: readonly string[];
  readonly allowed: readonly string[];
};

const SCOPES: readonly Scope[] = [
  { name: 'clip studio', roots: ['packages/studio/src'], allowed: [] },
  { name: 'mcpm-workbench', roots: ['tools/mcpm-workbench/src/ui'], allowed: [] },
  {
    name: 'app components and layers',
    roots: ['src/components', 'src/layers'],
    allowed: [
      'src/components/containers/AutoRotateToggleContainer.tsx',
      'src/components/containers/FullscreenToggleContainer.tsx',
      'src/components/containers/TourDebugPillContainer.tsx',
    ],
  },
];

// `{ … }`, also inside `A & { … }` or `Readonly<{ … }>`: the props' shape written where it is used.
function hasTypeLiteral(node: TypeNode): boolean {
  if (Node.isTypeLiteral(node)) return true;
  if (Node.isIntersectionTypeNode(node) || Node.isUnionTypeNode(node))
    return node.getTypeNodes().some(hasTypeLiteral);
  if (Node.isParenthesizedTypeNode(node)) return hasTypeLiteral(node.getTypeNode());
  if (Node.isTypeReference(node) && node.getTypeName().getText() === 'Readonly')
    return node.getTypeArguments().some(hasTypeLiteral);
  return false;
}

/** The props' type nodes: the component's first parameter, or `forwardRef<El, P>`'s type arguments. */
function propsTypeNodes(sourceFile: SourceFile, own: string): TypeNode[] {
  const fromFunction = (fn: FunctionLikeDeclaration) =>
    [fn.getParameters()[0]?.getTypeNode()].filter((t) => t !== undefined);
  const declared = sourceFile.getFunction(own);
  if (declared) return fromFunction(declared);
  const init = sourceFile.getVariableDeclaration(own)?.getInitializer();
  if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init)))
    return fromFunction(init);
  if (init && Node.isCallExpression(init)) {
    const [arg] = init.getArguments();
    const wrapped = arg && (Node.isArrowFunction(arg) || Node.isFunctionExpression(arg));
    return [...init.getTypeArguments(), ...(wrapped ? fromFunction(arg) : [])];
  }
  return [];
}

function propsNameProblems(file: string): string[] {
  const own = basename(file, '.tsx');
  const sourceFile = parseOnlyProject.addSourceFileAtPath(file);
  const misnamed = sourceFile
    .getStatements()
    .filter((s) => Node.isTypeAliasDeclaration(s) || Node.isInterfaceDeclaration(s))
    .map((s) => s.getName() ?? '')
    .filter((name) => name.endsWith('Props') && name !== `${own}Props`)
    .map((name) => (name === 'Props' ? 'bare Props' : `other name ${name}`));
  const literal = propsTypeNodes(sourceFile, own).some(hasTypeLiteral) ? ['inline literal'] : [];
  return [...misnamed, ...literal];
}

// A component file is a PascalCase `.tsx`; `main.tsx` and `rendererIcons.tsx`-style tables are not.
const componentFiles = (roots: readonly string[]) =>
  roots
    .flatMap((root) => walkFiles(root, ['.tsx']))
    .filter((file) => /^[A-Z]/.test(basename(file)) && !file.endsWith('.test.tsx'));

describe.each(SCOPES)('$name: a component names its props <Name>Props', ({ roots, allowed }) => {
  const files = componentFiles(roots);
  expect(files.length).toBeGreaterThan(0);
  const listed = new Set(allowed);

  it.each(files.filter((f) => !listed.has(f)))('%s', (file) => {
    expect(
      propsNameProblems(file),
      'Name the props type <FileName>Props and declare it as a type alias in the file, ' +
        'never an inline { … } on the parameter.',
    ).toEqual([]);
  });

  it.each(allowed)('%s still breaks the rule (fixed? drop its allowed row)', (file) => {
    expect(files).toContain(file);
    expect(propsNameProblems(file)).not.toEqual([]);
  });
});
