import { afterAll, describe, it, expect } from 'vitest';
import { collectRefs } from '../../../../tools/utils/refactor/collectRefs';
import { engineFixture } from '../../../helpers/refactor/engineFixture';

const FILES = {
  'src/target.ts': 'export function target() { return 1; }',
  'src/lonely.ts': 'export const lonely = 1;',
  'src/importer.ts':
    "import { target } from './target';\nexport function useTarget() { return target(); }",
  'tests/target.test.ts': "import { target } from '../src/target';\nexport const r = target();",
};

const fixture = engineFixture(FILES);
afterAll(fixture.dispose);

function refsOf(symbolFile: string, symbol: string) {
  const found = collectRefs({
    address: { file: symbolFile, symbol },
    engine: fixture.engine,
    read: (file) => FILES[file.slice(fixture.root.length + 1) as keyof typeof FILES] ?? '',
  });
  if (!found.ok) throw new Error(found.refusal);
  return found.report;
}

describe('collectRefs', () => {
  it("a call inside tests/ is kind 'call' with inTest true", () => {
    const report = refsOf('src/target.ts', 'target');
    const inTests = report.refs.filter((r) => r.filePath === 'tests/target.test.ts');
    expect(inTests.map((r) => r.kind).sort()).toEqual(['call', 'import']);
    expect(inTests.every((r) => r.inTest)).toBe(true);
  });

  it('labels the enclosing declaration of a call', () => {
    const call = refsOf('src/target.ts', 'target').refs.find(
      (r) => r.filePath === 'src/importer.ts' && r.kind === 'call',
    );
    expect(call?.enclosing).toBe('function useTarget');
  });

  it('the declaration is not counted', () => {
    expect(refsOf('src/lonely.ts', 'lonely').refs).toHaveLength(0);
  });

  it('fileCount and testCount match the entries', () => {
    const report = refsOf('src/target.ts', 'target');
    expect(report.fileCount).toBe(2);
    expect(report.testCount).toBe(2);
    expect(report.refs).toHaveLength(4);
  });

  it('refuses a symbol the file does not export', () => {
    const found = collectRefs({
      address: { file: 'src/target.ts', symbol: 'nope' },
      engine: fixture.engine,
      read: () => FILES['src/target.ts'],
    });
    expect(found.ok).toBe(false);
  });
});
