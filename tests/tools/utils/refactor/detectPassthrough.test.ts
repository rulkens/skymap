import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { detectPassthrough } from '../../../../tools/utils/refactor/detectPassthrough';
import { resolveSymbol } from '../../../../tools/utils/refactor/resolveSymbol';

// Detection is pure — it reads the resolved declaration's shape and never mutates,
// so each case is a single in-memory file, resolved the way the CLI does, then
// classified. The correctness guard is the pair of null cases: anything richer
// than a straight passthrough must NOT be reported, so `inline` refuses instead
// of mangling a call site with real logic in it.
function resolvedFoo(source: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/wrapper.ts', source);
  return resolveSymbol(project, { file: '/src/wrapper.ts', symbol: 'foo' });
}

describe('detectPassthrough', () => {
  it('detects a const alias', () => {
    const resolved = resolvedFoo(
      'export function bar(x: number) { return x; }\nexport const foo = bar;',
    );
    expect(detectPassthrough(resolved)).toEqual({ kind: 'alias', underlying: 'bar' });
  });

  it('detects a same-signature single-call wrapper', () => {
    const resolved = resolvedFoo(
      'export function bar(x: number) { return x; }\nexport function foo(x: number) { return bar(x); }',
    );
    expect(detectPassthrough(resolved)).toEqual({ kind: 'wrapper', underlying: 'bar' });
  });

  it('detects an aliased re-export', () => {
    const resolved = resolvedFoo(
      'export function bar(x: number) { return x; }\nexport { bar as foo };',
    );
    expect(detectPassthrough(resolved)).toEqual({ kind: 're-export', underlying: 'bar' });
  });

  it('returns null for a bare same-name export of a local declaration', () => {
    // `export { foo }` re-states a local declaration; underlying === exported name.
    // Treating it as a re-export would let inline delete the clause and orphan
    // importers of a symbol that is still declared right here.
    const resolved = resolvedFoo('function foo() {}\nexport { foo };');
    expect(detectPassthrough(resolved)).toBeNull();
  });

  it('returns null for a wrapper that reorders args and one with extra logic', () => {
    const reordered = resolvedFoo(
      'export function bar(a: number, b: number) { return a; }\n' +
        'export function foo(x: number, y: number) { return bar(y, x); }',
    );
    expect(detectPassthrough(reordered)).toBeNull();

    const extraLogic = resolvedFoo(
      'export function bar(x: number) { return x; }\nexport function foo(x: number) { return bar(x) + 1; }',
    );
    expect(detectPassthrough(extraLogic)).toBeNull();
  });
});
