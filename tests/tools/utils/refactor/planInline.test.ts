import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { planInline } from '../../../../tools/utils/refactor/planInline';
import { resolveSymbol } from '../../../../tools/utils/refactor/resolveSymbol';

// In-memory Projects mirror the planDelete/planRename fixtures: seed a tiny module
// graph, resolve the target the way the CLI does, run the planner, then read back
// the resulting files. planInline validates (via detectPassthrough) before
// mutating and never saves, so every assertion reads from the live Project.
function projectWith(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe('planInline', () => {
  it('repoints call sites at the underlying symbol and deletes the wrapper file', () => {
    const project = projectWith({
      '/src/bar.ts': 'export function bar(x: number) { return x; }',
      '/src/wrapper.ts':
        "import { bar } from './bar';\nexport function foo(x: number) { return bar(x); }",
      '/src/app.ts': "import { foo } from './wrapper';\nexport const y = foo(1);",
    });
    const resolved = resolveSymbol(project, { file: '/src/wrapper.ts', symbol: 'foo' });

    planInline(project, resolved);

    // The caller now calls `bar` directly, imported from bar's own file, and the
    // one-symbol wrapper file is gone.
    const app = project.getSourceFileOrThrow('/src/app.ts').getText();
    expect(app).toContain('bar(1)');
    expect(app).toMatch(/from '\.\/bar'/);
    expect(project.getSourceFile('/src/wrapper.ts')).toBeUndefined();
  });

  it('throws with the reference list on a non-passthrough', () => {
    const project = projectWith({
      '/src/wrapper.ts': 'export function foo(x: number) { return x * 2; }',
      '/src/app.ts': "import { foo } from './wrapper';\nexport const y = foo(2);",
    });
    const resolved = resolveSymbol(project, { file: '/src/wrapper.ts', symbol: 'foo' });

    // The body carries real logic, so inline refuses and names the referring file
    // for the operator to hand-edit.
    expect(() => planInline(project, resolved)).toThrow(/app\.ts/);
    expect(project.getSourceFile('/src/wrapper.ts')).toBeDefined();
  });
});
