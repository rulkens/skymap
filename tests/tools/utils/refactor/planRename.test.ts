import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { planRename } from '../../../../tools/utils/refactor/planRename';
import { resolveSymbol } from '../../../../tools/utils/refactor/resolveSymbol';

// In-memory Projects mirror the applyMoves/collectRefs fixtures: seed a tiny
// module graph, resolve the target the way the CLI does, run the planner, then
// read back the resulting text / file set. The planner mutates the project in
// place and never saves, so every assertion reads from the live Project.
function projectWith(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe('planRename', () => {
  it('renames the identifier across importers', () => {
    const project = projectWith({
      '/src/utils/x/foo.ts': 'export const foo = 1;',
      '/src/app.ts': "import { foo } from './utils/x/foo';\nexport const usesFoo = foo + 1;",
    });
    const resolved = resolveSymbol(project, { file: '/src/utils/x/foo.ts', symbol: 'foo' });

    planRename(project, resolved, 'bar', false);

    expect(project.getSourceFileOrThrow('/src/utils/x/foo.ts').getText()).toContain(
      'export const bar = 1;',
    );
    const importer = project.getSourceFileOrThrow('/src/app.ts').getText();
    expect(importer).toContain("import { bar } from './utils/x/foo'");
    expect(importer).toContain('bar + 1');
    // The imported binding is renamed; the module path keeps 'foo' because the
    // file was not renamed (renameFile: false).
    expect(importer).not.toContain('foo + 1');
  });

  it('renames the file and its test mirror when filename tracks the symbol', () => {
    const project = projectWith({
      '/src/utils/x/foo.ts': 'export const foo = 1;',
      '/tests/utils/x/foo.test.ts':
        "import { foo } from '../../../src/utils/x/foo';\nexport const t = foo;",
    });
    const resolved = resolveSymbol(project, { file: '/src/utils/x/foo.ts', symbol: 'foo' });

    planRename(project, resolved, 'bar', true);

    expect(project.getSourceFile('/src/utils/x/foo.ts')).toBeUndefined();
    expect(project.getSourceFile('/src/utils/x/bar.ts')).toBeDefined();
    expect(project.getSourceFile('/tests/utils/x/foo.test.ts')).toBeUndefined();
    expect(project.getSourceFile('/tests/utils/x/bar.test.ts')).toBeDefined();
    // The dragged mirror still imports the renamed symbol from the renamed file.
    expect(project.getSourceFileOrThrow('/tests/utils/x/bar.test.ts').getText()).toContain(
      "import { bar } from '../../../src/utils/x/bar'",
    );
  });

  it('renames a .d.ts declaration file, whose basename hides behind a two-part extension', () => {
    const project = projectWith({
      '/src/@types/rendering/Foo.d.ts': 'export type Foo = { a: number };',
      '/src/app.ts':
        "import type { Foo } from './@types/rendering/Foo';\nexport const f: Foo = { a: 1 };",
    });
    const resolved = resolveSymbol(project, {
      file: '/src/@types/rendering/Foo.d.ts',
      symbol: 'Foo',
    });

    planRename(project, resolved, 'Bar', true);

    expect(project.getSourceFile('/src/@types/rendering/Foo.d.ts')).toBeUndefined();
    expect(project.getSourceFile('/src/@types/rendering/Bar.d.ts')).toBeDefined();
    expect(project.getSourceFileOrThrow('/src/app.ts').getText()).toContain(
      "from './@types/rendering/Bar'",
    );
  });

  it('leaves the file name when renameFile is false', () => {
    const project = projectWith({
      '/src/utils/x/foo.ts': 'export const foo = 1;',
      '/tests/utils/x/foo.test.ts':
        "import { foo } from '../../../src/utils/x/foo';\nexport const t = foo;",
    });
    const resolved = resolveSymbol(project, { file: '/src/utils/x/foo.ts', symbol: 'foo' });

    planRename(project, resolved, 'bar', false);

    // Identifier renamed in place, but the file keeps its old path.
    expect(project.getSourceFile('/src/utils/x/foo.ts')).toBeDefined();
    expect(project.getSourceFile('/src/utils/x/bar.ts')).toBeUndefined();
    expect(project.getSourceFileOrThrow('/src/utils/x/foo.ts').getText()).toContain(
      'export const bar = 1;',
    );
  });
});
