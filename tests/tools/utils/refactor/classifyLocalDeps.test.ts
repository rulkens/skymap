import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { classifyLocalDeps } from '../../../../tools/utils/refactor/classifyLocalDeps';
import { resolveSymbol } from '../../../../tools/utils/refactor/resolveSymbol';

// Classification is pure — it reads the target's reference graph and never
// mutates, so each case is a single in-memory file, resolved the way the CLI
// does, then classified. The correctness axis is the exclusive/shared split:
// a helper reachable ONLY through the target moves out with it; one also used by
// staying code must be reported as `shared` so `extract` blocks instead of
// silently orphaning the remaining references.
function classifiedFor(source: string, symbol = 'A') {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/mod.ts', source);
  return classifyLocalDeps(resolveSymbol(project, { file: '/src/mod.ts', symbol }));
}

describe('classifyLocalDeps', () => {
  it('classifies a local helper used only by the target as exclusive', () => {
    const result = classifiedFor('function h() { return 1; }\nexport function A() { return h(); }');
    expect(result).toEqual({ exclusive: ['h'], shared: [] });
  });

  it('classifies a local helper shared with remaining code as shared', () => {
    const result = classifiedFor(
      'function h() { return 1; }\n' +
        'export function A() { return h(); }\n' +
        'export function B() { return h(); }',
    );
    expect(result).toEqual({ exclusive: [], shared: ['h'] });
  });

  it('follows the transitive chain', () => {
    // A -> h -> g, neither used elsewhere. Both move with the target. Output is in
    // declaration order (g precedes h in the file), so the report is stable.
    const result = classifiedFor(
      'function g() { return 2; }\n' +
        'function h() { return g(); }\n' +
        'export function A() { return h(); }',
    );
    expect(result).toEqual({ exclusive: ['g', 'h'], shared: [] });
  });

  it('a mid-chain symbol shared by remaining code lands in shared', () => {
    // A -> h -> g, but g is ALSO used by staying code (exported B). g is shared;
    // h — reached only through the target — stays exclusive. Both facts are pinned:
    // the mid-chain symbol going shared must not drag its exclusive parent with it.
    const result = classifiedFor(
      'function g() { return 2; }\n' +
        'function h() { return g(); }\n' +
        'export function A() { return h(); }\n' +
        'export function B() { return g(); }',
    );
    expect(result).toEqual({ exclusive: ['h'], shared: ['g'] });
  });
});
