import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { planMove } from '../../../../tools/utils/refactor/planMove';

// An in-memory Project + a Set-backed fileExists stub let us pin the one thing
// planMove owns — that it chains expand→apply — without touching disk. The
// import-rewriting itself is already covered by applyMoves' tests.
function projectWith(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe('planMove', () => {
  it('expands a source move to drag its test mirror then applies both', () => {
    const project = projectWith({
      'src/utils/math/foo.ts': 'export const foo = 1;',
      'tests/utils/math/foo.test.ts':
        "import { foo } from '../../../src/utils/math/foo';\nexport const seen = foo;",
    });
    // Only the mirror test is "present" on this stubbed filesystem.
    const fileExists = (p: string) => p === 'tests/utils/math/foo.test.ts';

    const expanded = planMove(
      project,
      [{ from: 'src/utils/math/foo.ts', to: 'src/helpers/foo.ts' }],
      fileExists,
    );

    // The source and its mirror both moved to the new location.
    expect(project.getSourceFile('src/utils/math/foo.ts')).toBeUndefined();
    expect(project.getSourceFile('src/helpers/foo.ts')).toBeDefined();
    expect(project.getSourceFile('tests/utils/math/foo.test.ts')).toBeUndefined();
    expect(project.getSourceFile('tests/helpers/foo.test.ts')).toBeDefined();

    // The returned plan lists both the requested move and the appended mirror.
    expect(expanded).toEqual([
      { from: 'src/utils/math/foo.ts', to: 'src/helpers/foo.ts' },
      { from: 'tests/utils/math/foo.test.ts', to: 'tests/helpers/foo.test.ts' },
    ]);
  });
});
