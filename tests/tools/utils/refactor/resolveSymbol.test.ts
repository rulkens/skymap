import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { resolveSymbol } from '../../../../tools/utils/refactor/resolveSymbol';

// In-memory Projects let us seed a tiny module graph and assert on resolution
// without touching disk — the house pattern (see applyMoves.test.ts).
function projectWith(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe('resolveSymbol', () => {
  it('resolves an exported declaration', () => {
    const project = projectWith({
      '/src/utils/foo.ts': 'export const foo = 1;',
    });

    const resolved = resolveSymbol(project, { file: '/src/utils/foo.ts', symbol: 'foo' });

    expect(resolved.name).toBe('foo');
    expect(resolved.sourceFile.getFilePath()).toBe('/src/utils/foo.ts');
  });

  it('throws when the file is not in the project', () => {
    const project = projectWith({ '/src/utils/foo.ts': 'export const foo = 1;' });
    expect(() => resolveSymbol(project, { file: '/src/utils/nope.ts', symbol: 'foo' })).toThrow();
  });

  it('throws when the symbol is not exported from the file', () => {
    const project = projectWith({
      '/src/utils/foo.ts': 'const hidden = 1;\nexport const foo = hidden;',
    });
    expect(() => resolveSymbol(project, { file: '/src/utils/foo.ts', symbol: 'hidden' })).toThrow();
  });

  it('throws and lists candidates on an ambiguous name', () => {
    // A class + namespace sharing a name is declaration merging: ts-morph's
    // getExportedDeclarations() maps that name to TWO declarations.
    const project = projectWith({
      '/src/utils/dup.ts':
        'export class Widget {}\nexport namespace Widget { export const v = 1; }',
    });

    let thrown: unknown;
    try {
      resolveSymbol(project, { file: '/src/utils/dup.ts', symbol: 'Widget' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    // Both candidate declarations must be described in the message.
    expect(message).toContain('ClassDeclaration');
    expect(message).toContain('ModuleDeclaration');
  });
});
