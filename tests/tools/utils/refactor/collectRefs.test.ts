import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { collectRefs } from '../../../../tools/utils/refactor/collectRefs';
import type { RefEntry } from '../../../../tools/utils/refactor/collectRefs';
import { resolveSymbol } from '../../../../tools/utils/refactor/resolveSymbol';

// In-memory Projects seed a tiny module graph and let us assert on how each
// reference is classified without touching disk (the applyMoves.test.ts pattern).
function projectWith(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

function refFor(
  project: Project,
  file: string,
  symbol: string,
): {
  find: (predicate: (entry: RefEntry) => boolean) => RefEntry | undefined;
  entries: readonly RefEntry[];
  report: ReturnType<typeof collectRefs>;
} {
  const report = collectRefs(project, resolveSymbol(project, { file, symbol }));
  return {
    report,
    entries: report.refs,
    find: (predicate) => report.refs.find(predicate),
  };
}

describe('collectRefs', () => {
  it('classifies an import-only reference as import', () => {
    const project = projectWith({
      '/src/target.ts': 'export function target() { return 1; }',
      '/src/importer.ts':
        "import { target } from './target';\nexport function useTarget() { return target(); }",
    });

    const { find } = refFor(project, '/src/target.ts', 'target');
    const importRef = find((entry) => entry.kind === 'import');

    expect(importRef).toBeDefined();
    expect(importRef?.enclosing).toBe('<module>');
  });

  it('classifies a call site as call with the enclosing declaration name', () => {
    const project = projectWith({
      '/src/target.ts': 'export function target() { return 1; }',
      '/src/importer.ts':
        "import { target } from './target';\nexport function useTarget() { return target(); }",
    });

    const { find } = refFor(project, '/src/target.ts', 'target');
    const callRef = find((entry) => entry.kind === 'call');

    expect(callRef).toBeDefined();
    expect(callRef?.enclosing).toBe('function useTarget');
  });

  it('classifies a type-position use as type-position', () => {
    const project = projectWith({
      '/src/types.ts': 'export type Vec3 = { x: number };',
      '/src/consumer.ts':
        "import type { Vec3 } from './types';\nexport function consume(a: Vec3) { return a.x; }",
    });

    const { find } = refFor(project, '/src/types.ts', 'Vec3');
    const typeRef = find((entry) => entry.kind === 'type-position');

    expect(typeRef).toBeDefined();
    expect(typeRef?.enclosing).toBe('function consume');
  });

  it('classifies a re-export as re-export', () => {
    const project = projectWith({
      '/src/target.ts': 'export function target() { return 1; }',
      '/src/reexport.ts': "export { target } from './target';",
    });

    const { find } = refFor(project, '/src/target.ts', 'target');
    const reExportRef = find((entry) => entry.kind === 're-export');

    expect(reExportRef).toBeDefined();
  });

  it('counts references under tests/ as tests', () => {
    const project = projectWith({
      '/src/target.ts': 'export function target() { return 1; }',
      '/src/importer.ts':
        "import { target } from './target';\nexport function useTarget() { return target(); }",
      '/tests/target.test.ts':
        "import { target } from '../src/target';\nexport const r = target();",
    });

    const { report } = refFor(project, '/src/target.ts', 'target');

    // The tests/ file contributes an import specifier AND a call — both classify
    // as 'test' (tests/ wins over the finer kinds), which is exactly what makes
    // testCount a one-line count.
    expect(report.refs.filter((entry) => entry.kind === 'test')).toHaveLength(2);
    expect(report.testCount).toBe(2);
    // Distinct referrer files: importer.ts + target.test.ts. The declaration file
    // itself contributes no reference (its only mention is the excluded decl).
    expect(report.fileCount).toBe(2);
  });

  it('excludes the declaration site itself from the refs', () => {
    const project = projectWith({
      '/src/lonely.ts': 'export const lonely = 1;',
    });

    const { report } = refFor(project, '/src/lonely.ts', 'lonely');

    expect(report.refs).toHaveLength(0);
  });
});
