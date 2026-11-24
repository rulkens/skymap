import { afterAll, describe, expect, it } from 'vitest';
import { collectRefs } from '../../../../tools/utils/refactor/collectRefs';
import { syncOverlay } from '../../../../tools/utils/refactor/engine/syncOverlay';
import { foldPlan } from '../../../../tools/utils/refactor/foldPlan';
import { planParamsToObject } from '../../../../tools/utils/refactor/planParamsToObject';
import type { DiskView } from '../../../../tools/@types/refactor/DiskView';
import type { PlanResult } from '../../../../tools/@types/refactor/PlanResult';
import { engineFixture } from '../../../helpers/refactor/engineFixture';

const FILES: Record<string, string> = {
  'src/geom.ts': `export function area(width: number, height: number = 2, label?: string): number {
  return width * height;
}
export const perimeter = (a: number, b: number): number => a + b;
export function over(a: number): number;
export function over(a: number, b: number): number;
export function over(a: number, b?: number): number {
  return a + (b ?? 0);
}
export const typed: (a: number, b: number) => number = (a, b) => a + b;
export function cb(a: number, b: number) {
  return a + b;
}
export function nest(a: number, b: number) {
  return a + b;
}
export function rec(a: number, b: number): number {
  return a > 0 ? rec(a - 1, b) : b;
}
`,
  'src/a.ts': `import { area, perimeter as p } from './geom';
export const x = area(1, 2) + p(3, 4);
`,
  'src/b.ts': `import { area } from './geom';
export const s = \`\${area(7, 8, 'l')}\`;
`,
  'src/c.ts': `import { cb, over, typed, nest, rec } from './geom';
export const m = [1].map(cb);
export const o = over(1, 2) + typed(1, 2);
export const n = nest(nest(1, 2), 3);
export const r = rec(1, 2);
`,
};

const fixture = engineFixture(FILES);
afterAll(fixture.dispose);

const { engine, root } = fixture;
const abs = (name: string) => `${root}/${name}`;
const disk: DiskView = {
  read: (file) => FILES[file.slice(root.length + 1)] ?? '',
  snapshot: () => ({ texts: new Map(), fileExists: () => true }),
};
const read = (file: string) => engine.overlay.get(file) ?? disk.read(file);

function found(symbol: string) {
  const result = collectRefs({ address: { file: 'src/geom.ts', symbol }, engine, read });
  if (!result.ok) throw new Error(result.refusal);
  return result;
}

function convert(symbol: string): PlanResult {
  return planParamsToObject({
    address: { file: 'src/geom.ts', symbol },
    found: found(symbol),
    read,
  });
}

function applied(result: PlanResult): Record<string, string> {
  if (!result.ok) throw new Error(result.refusals.join('; '));
  const out: Record<string, string> = {};
  for (const edit of [...result.plan.edits].sort((x, y) => y.start - x.start)) {
    const name = edit.file.slice(root.length + 1);
    const text = out[name] ?? FILES[name]!;
    out[name] = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }
  return out;
}

function refusalsOf(result: PlanResult): string {
  if (result.ok) throw new Error('expected a refusal');
  return result.refusals.join('\n');
}

describe('planParamsToObject', () => {
  it('rewrites the signature and calls in two files', () => {
    const out = applied(convert('area'));
    expect(out['src/geom.ts']).toContain(
      'area({ width, height = 2, label }: { width: number; height?: number; label?: string }): number',
    );
    expect(out['src/a.ts']).toContain('area({ width: 1, height: 2 })');
    expect(out['src/b.ts']).toContain("area({ width: 7, height: 8, label: 'l' })");
  });

  it('rewrites a const arrow function', () => {
    expect(applied(convert('perimeter'))['src/geom.ts']).toContain(
      'perimeter = ({ a, b }: { a: number; b: number }): number => a + b;',
    );
  });

  it('rewrites a call through an import alias', () => {
    expect(applied(convert('perimeter'))['src/a.ts']).toContain('p({ a: 3, b: 4 })');
  });

  it('rewrites a recursive call in the body', () => {
    expect(applied(convert('rec'))['src/geom.ts']).toContain('rec({ a: a - 1, b })');
  });

  it('refuses when the function is passed as a callback and lists the site', () => {
    expect(refusalsOf(convert('cb'))).toContain('src/c.ts:2:26  value: not a call.');
  });

  it('refuses overloads', () => {
    expect(refusalsOf(convert('over'))).toContain('overload signatures');
  });

  it('refuses an annotated const', () => {
    expect(refusalsOf(convert('typed'))).toContain('type annotation');
  });

  it('refuses a call nested in another call of the same function', () => {
    expect(refusalsOf(convert('nest'))).toContain('src/c.ts:4:');
  });

  it('the folded result still resolves every call', () => {
    const before = found('area').report.refs.filter((r) => r.kind === 'call').length;
    const overlay = { texts: engine.overlay, moves: [], deletes: engine.removed };
    const result = convert('area');
    if (!result.ok) throw new Error(result.refusals.join('; '));
    syncOverlay(engine, foldPlan(result.plan, overlay, disk));
    expect(found('area').report.refs.filter((r) => r.kind === 'call')).toHaveLength(before);
    expect(read(abs('src/a.ts'))).toContain('area({ width: 1, height: 2 })');
  });
});
