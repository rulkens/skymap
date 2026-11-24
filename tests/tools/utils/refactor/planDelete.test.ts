import { afterAll, describe, expect, it } from 'vitest';
import { collectRefs } from '../../../../tools/utils/refactor/collectRefs';
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
  'src/over.ts':
    'export function over(a: string): string;\nexport function over(a: number): number;\nexport function over(a: unknown) {\n  return a;\n}\nexport const keepOver = 1;\n',
  'src/rec.ts':
    'export function rec(n: number): number {\n  return n <= 0 ? 0 : rec(n - 1);\n}\nexport const keepRec = 1;\n',
  'src/listed.ts': 'const listed = 1;\nexport { listed };\nexport const keepListed = 2;\n',
  'src/effect.ts': "export const eff = 1;\nconsole.log('loaded');\n",
};

const fixture = engineFixture(FILES);
afterAll(fixture.dispose);

function remove(file: string, symbol: string): PlanResult {
  const absolute = (f: string) => f.slice(fixture.root.length + 1);
  const address = { file, symbol };
  const read = (f: string) => FILES[absolute(f)] ?? '';
  const found = collectRefs({ address, engine: fixture.engine, read });
  if (!found.ok) return { ok: false, refusals: [found.refusal] };
  return planDelete({
    found,
    root: fixture.root,
    read,
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

  const cutOf = (file: string, symbol: string): string => {
    const result = remove(file, symbol);
    if (!result.ok) throw new Error(result.refusals.join('; '));
    let text = FILES[file]!;
    for (const e of [...result.plan.edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, e.start) + text.slice(e.end);
    }
    return text;
  };

  it("does not count an overloaded function's own signatures", () => {
    expect(cutOf('src/over.ts', 'over')).toBe('export const keepOver = 1;\n');
  });

  it("does not count a recursive function's own call", () => {
    expect(cutOf('src/rec.ts', 'rec')).toBe('export const keepRec = 1;\n');
  });

  it("cuts a symbol's own `export { x }` with its declaration", () => {
    expect(cutOf('src/listed.ts', 'listed')).toBe('export const keepListed = 2;\n');
  });
});
