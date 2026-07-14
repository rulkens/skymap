import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { applyMoves } from '../../../../tools/utils/refactor/applyMoves';

// An in-memory Project lets us assert on ts-morph's import rewriting without
// touching disk. Each test seeds a tiny module graph, moves file(s), and reads
// back the resulting import specifiers.
function projectWith(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe('applyMoves', () => {
  it("rewrites an importer's relative path to a moved file", () => {
    const project = projectWith({
      '/src/utils/foo.ts': 'export const foo = 1;',
      '/src/app.ts': "import { foo } from './utils/foo';\nexport const x = foo;",
    });

    applyMoves(project, [{ from: '/src/utils/foo.ts', to: '/src/helpers/foo.ts' }]);

    const importer = project.getSourceFileOrThrow('/src/app.ts');
    expect(importer.getText()).toContain("from './helpers/foo'");
  });

  it("rewrites a moved file's own imports of files that stayed put", () => {
    const project = projectWith({
      '/src/utils/bar.ts': 'export const bar = 2;',
      '/src/utils/foo.ts': "import { bar } from './bar';\nexport const foo = bar;",
    });

    applyMoves(project, [{ from: '/src/utils/foo.ts', to: '/src/deep/nest/foo.ts' }]);

    const moved = project.getSourceFileOrThrow('/src/deep/nest/foo.ts');
    expect(moved.getText()).toContain("from '../../utils/bar'");
  });

  it('resolves a batch where two moved files import each other', () => {
    const project = projectWith({
      '/src/a.ts': "import { b } from './b';\nexport const a = b;",
      '/src/b.ts': "import { a } from './a';\nexport const b = 1;\nexport const useA = () => a;",
    });

    applyMoves(project, [
      { from: '/src/a.ts', to: '/src/pkg/a.ts' },
      { from: '/src/b.ts', to: '/src/pkg/b.ts' },
    ]);

    const a = project.getSourceFileOrThrow('/src/pkg/a.ts');
    const b = project.getSourceFileOrThrow('/src/pkg/b.ts');
    expect(a.getText()).toContain("from './b'");
    expect(b.getText()).toContain("from './a'");
  });
});
