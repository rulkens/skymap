import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { planDelete } from '../../../../tools/utils/refactor/planDelete';
import { resolveSymbol } from '../../../../tools/utils/refactor/resolveSymbol';

// In-memory Projects mirror the applyMoves/collectRefs/planRename fixtures: seed
// a tiny module graph, resolve the target the way the CLI does, run the planner,
// then read back the resulting file set. planDelete validates before mutating and
// never saves, so every assertion reads from the live Project.
function projectWith(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe('planDelete', () => {
  it('refuses to delete a referenced symbol and lists the references', () => {
    const project = projectWith({
      '/src/utils/x/foo.ts': 'export const foo = 1;',
      '/src/app.ts': "import { foo } from './utils/x/foo';\nexport const usesFoo = foo + 1;",
    });
    const resolved = resolveSymbol(project, { file: '/src/utils/x/foo.ts', symbol: 'foo' });

    // The referrer survives the refused delete, and the message names its file so
    // the operator knows what to unpick before re-running.
    expect(() => planDelete(project, resolved)).toThrow(/\/src\/app\.ts/);
    expect(project.getSourceFile('/src/utils/x/foo.ts')).toBeDefined();
  });

  it('refuses when the only reference is a re-export', () => {
    const project = projectWith({
      '/src/utils/x/foo.ts': 'export const foo = 1;',
      '/src/barrel.ts': "export { foo } from './utils/x/foo';",
    });
    const resolved = resolveSymbol(project, { file: '/src/utils/x/foo.ts', symbol: 'foo' });

    // A re-export is a reference like any other — no repair branch quietly rewrites
    // it, so the delete refuses and the barrel is left intact for the operator.
    expect(() => planDelete(project, resolved)).toThrow(/\/src\/barrel\.ts/);
    expect(project.getSourceFile('/src/barrel.ts')).toBeDefined();
  });

  it('deletes an unreferenced one-symbol file', () => {
    const project = projectWith({
      '/src/utils/x/foo.ts': 'export const foo = 1;',
    });
    const resolved = resolveSymbol(project, { file: '/src/utils/x/foo.ts', symbol: 'foo' });

    planDelete(project, resolved);

    // The declaration was the file's only export, so the whole file is dropped
    // from the project, not left as an empty husk.
    expect(project.getSourceFile('/src/utils/x/foo.ts')).toBeUndefined();
  });

  it('drops the test mirror alongside a deleted one-symbol file', () => {
    const project = projectWith({
      '/src/utils/x/foo.ts': 'export const foo = 1;',
      // A mirror that does not import the symbol still tracks the source file: it
      // exists because foo.ts exists, so it dies with it.
      '/tests/utils/x/foo.test.ts': 'export const placeholder = 1;',
    });
    const resolved = resolveSymbol(project, { file: '/src/utils/x/foo.ts', symbol: 'foo' });

    planDelete(project, resolved);

    expect(project.getSourceFile('/src/utils/x/foo.ts')).toBeUndefined();
    expect(project.getSourceFile('/tests/utils/x/foo.test.ts')).toBeUndefined();
  });

  it('removes only the declaration from a multi-symbol file', () => {
    const project = projectWith({
      '/src/utils/x/pair.ts': 'export const foo = 1;\nexport const bar = 2;',
    });
    const resolved = resolveSymbol(project, { file: '/src/utils/x/pair.ts', symbol: 'foo' });

    planDelete(project, resolved);

    // The file has another export, so it stays; only foo is gone.
    const remaining = project.getSourceFileOrThrow('/src/utils/x/pair.ts').getText();
    expect(remaining).not.toContain('foo');
    expect(remaining).toContain('export const bar = 2;');
  });
});
