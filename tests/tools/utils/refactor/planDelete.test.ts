import { afterAll, describe, expect, it } from 'vitest';
import { planDelete } from '../../../../tools/utils/refactor/planDelete';
import type { PlanResult } from '../../../../tools/@types/refactor/PlanResult';
import { engineFixture } from '../../../helpers/refactor/engineFixture';

const FILES: Record<string, string> = {
  'src/used/foo.ts': 'export const foo = 1;',
  'src/app.ts': "import { foo } from './used/foo';\nexport const u = foo + 1;",
  'src/tested/bar.ts': 'export const bar = 1;',
  'tests/uses/bar.test.ts': "import { bar } from '../../src/tested/bar';\nexport const b = bar;",
  'src/pair.ts': 'export const one = 1;\nexport const two = 2;\n',
  'src/sole/lone.ts': 'export const lone = 1;',
  'tests/sole/lone.test.ts': 'export const placeholder = 1;',
  'src/effect.ts': "export const eff = 1;\nconsole.log('loaded');\n",
};

const fixture = engineFixture(FILES);
afterAll(fixture.dispose);

function remove(file: string, symbol: string): PlanResult {
  const absolute = (f: string) => f.slice(fixture.root.length + 1);
  return planDelete({
    address: { file, symbol },
    engine: fixture.engine,
    read: (f) => FILES[absolute(f)] ?? '',
    exists: (f) => absolute(f) in FILES,
  });
}

describe('planDelete', () => {
  it('refuses a symbol with a reference in src and lists it', () => {
    const result = remove('src/used/foo.ts', 'foo');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]).toMatch(/^Cannot delete 'src\/used\/foo\.ts#foo': 2 reference\(s\)/);
    expect(result.refusals[0]).toContain('src/app.ts');
  });

  it('refuses a symbol referenced only from a test', () => {
    const result = remove('src/tested/bar.ts', 'bar');
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? '' : result.refusals[0]).toContain('tests/uses/bar.test.ts');
  });

  it('removes one export of two and keeps the file', () => {
    const result = remove('src/pair.ts', 'one');
    if (!result.ok) throw new Error(result.refusals.join('; '));
    const { edits, deletes } = result.plan;
    expect(deletes).toEqual([]);
    const text = FILES['src/pair.ts']!;
    expect(text.slice(0, edits[0]!.start) + text.slice(edits[0]!.end)).toBe(
      'export const two = 2;\n',
    );
  });

  it('deletes the file and its test mirror for a sole export', () => {
    const result = remove('src/sole/lone.ts', 'lone');
    if (!result.ok) throw new Error(result.refusals.join('; '));
    expect(result.plan.edits).toEqual([]);
    expect(result.plan.deletes).toEqual([
      '/fixture/src/sole/lone.ts',
      '/fixture/tests/sole/lone.test.ts',
    ]);
  });

  it('keeps a file that still has a side-effect statement', () => {
    const result = remove('src/effect.ts', 'eff');
    if (!result.ok) throw new Error(result.refusals.join('; '));
    expect(result.plan.deletes).toEqual([]);
    expect(result.plan.edits).toHaveLength(1);
  });
});
