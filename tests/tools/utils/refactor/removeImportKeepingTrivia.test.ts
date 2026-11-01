import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { removeImportKeepingTrivia } from '../../../../tools/utils/refactor/removeImportKeepingTrivia';

// getFullText, not getText: getText() omits a file's leading trivia, which is
// exactly the part under test.
function remove(source: string, index: number): string {
  const project = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true });
  const file = project.createSourceFile('/a.ts', source);
  removeImportKeepingTrivia(file.getImportDeclarations()[index]!);
  return file.getFullText();
}

describe('removeImportKeepingTrivia', () => {
  it('keeps the module header when the removed import is the first statement', () => {
    const out = remove(
      "/**\n * Header\n * more\n */\nimport { X } from './x';\n\nimport { Z } from './z';\nexport const u = Z;\n",
      0,
    );
    expect(out).toBe(
      "/**\n * Header\n * more\n */\n\nimport { Z } from './z';\nexport const u = Z;\n",
    );
  });

  it('keeps the blank lines around a removed import between two groups', () => {
    const out = remove(
      "import { A } from './a';\n\nimport { B } from './b';\n\nimport { C } from './c';\nexport const u = A + C;\n",
      1,
    );
    expect(out).toBe(
      "import { A } from './a';\n\nimport { C } from './c';\nexport const u = A + C;\n",
    );
  });

  it('removes a header-less first import', () => {
    expect(remove("import { A } from './a';\nexport const u = 1;\n", 0)).toBe(
      'export const u = 1;\n',
    );
  });
});
