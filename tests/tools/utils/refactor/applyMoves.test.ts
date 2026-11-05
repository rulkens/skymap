import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Project } from 'ts-morph';
import { makeRepo } from '../../../../packages/move-files/tests/helpers/makeRepo';
import { applyMoves } from '../../../../tools/utils/refactor/applyMoves';

// An in-memory Project keeps these off the disk. Each test seeds a tiny module graph,
// moves file(s), and reads back the specifiers move-files wrote.
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

  it('refuses a destination already in the Project and changes nothing', () => {
    const project = projectWith({
      '/src/foo.ts': 'export const foo = 1;',
      '/src/bar.ts': 'export const bar = 2;',
      '/src/use.ts': "import { foo } from './foo';",
    });

    expect(() => applyMoves(project, [{ from: '/src/foo.ts', to: '/src/bar.ts' }])).toThrow(
      '/src/bar.ts',
    );

    expect(project.getSourceFileOrThrow('/src/bar.ts').getText()).toBe('export const bar = 2;');
    expect(project.getSourceFileOrThrow('/src/foo.ts').getText()).toBe('export const foo = 1;');
    expect(project.getSourceFileOrThrow('/src/use.ts').getText()).toContain("'./foo'");
  });

  it('refuses a case-only rename onto a real file of that exact name', () => {
    const project = projectWith({
      '/src/Foo.ts': 'export const Foo = 1;',
      '/src/foo.ts': 'export const foo = 2;',
    });

    expect(() => applyMoves(project, [{ from: '/src/Foo.ts', to: '/src/foo.ts' }])).toThrow(
      '/src/foo.ts',
    );
    expect(project.getSourceFileOrThrow('/src/foo.ts').getText()).toBe('export const foo = 2;');
  });

  it('refuses a destination that exists on disk but is not in the Project', () => {
    const project = projectWith({ '/src/foo.ts': 'export const foo = 1;' });
    project.getFileSystem().writeFileSync('/src/bar.ts', 'on disk');

    expect(() => applyMoves(project, [{ from: '/src/foo.ts', to: '/src/bar.ts' }])).toThrow(
      '/src/bar.ts',
    );
    expect(project.getSourceFile('/src/foo.ts')).toBeDefined();
  });
});

const probe = makeRepo({ 'Probe.txt': '' });
const diskFoldsCase = existsSync(join(probe, 'probe.txt'));

describe.runIf(diskFoldsCase)('applyMoves on a case-insensitive disk', () => {
  it('a case-only rename still goes through and saves', () => {
    const root = makeRepo({ 'Foo.ts': 'export const foo = 1;' });
    const project = new Project({ useInMemoryFileSystem: false });
    project.addSourceFileAtPath(join(root, 'Foo.ts'));

    applyMoves(project, [{ from: join(root, 'Foo.ts'), to: join(root, 'foo.ts') }]);
    project.saveSync();

    expect(readFileSync(join(root, 'foo.ts'), 'utf8')).toBe('export const foo = 1;');
  });
});
