import { afterAll, describe, expect, it } from 'vitest';
import { collectRefs } from '../../../../tools/utils/refactor/collectRefs';
import { planParamsToObject } from '../../../../tools/utils/refactor/planParamsToObject';
import type { PlanResult } from '../../../../tools/@types/refactor/PlanResult';
import { planFixture } from '../../../helpers/refactor/planFixture';

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

const fixture = planFixture(FILES);
afterAll(fixture.dispose);

const { engine, abs, read, applied } = fixture;

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
    const result = convert('area');
    if (!result.ok) throw new Error(result.refusals.join('; '));
    fixture.fold(result.plan);
    expect(found('area').report.refs.filter((r) => r.kind === 'call')).toHaveLength(before);
    expect(read(abs('src/a.ts'))).toContain('area({ width: 1, height: 2 })');
  });
});

describe('planParamsToObject: what review found', () => {
  const FILES2: Record<string, string> = {
    'src/f.ts': `export function withComments(
  /** the width */
  width: number,
  // the height
  height: number,
): number {
  return width * height;
}
export function trailing(a: number, b: number, // last
): number {
  return a + b;
}
export function usesArgs(a: number, b: number): number {
  return arguments.length + a + b;
}
export function nestedArgs(a: number, b: number): number {
  const g = function () { return arguments.length; };
  const h = () => a + b;
  return g() + h();
}
export function arrowArgs(a: number, b: number): number {
  const h = () => arguments.length;
  return h() + a + b;
}
/**
 * Area.
 * @param width the width
 * @param height the height
 */
export function documented(width: number, height: number): number {
  return width * height;
}
`,
    'src/use.ts': `import * as ns from './f';
import { documented, nestedArgs } from './f';
export const a = ns.documented(1, 2) + documented(3, 4) + nestedArgs(1, 2);
export const b = documented<never>(1, 2);
`,
  };
  const fx = planFixture(FILES2);
  afterAll(fx.dispose);
  const convertIn = (symbol: string): PlanResult => {
    const result = collectRefs({
      address: { file: 'src/f.ts', symbol },
      engine: fx.engine,
      read: fx.read,
    });
    if (!result.ok) throw new Error(result.refusal);
    return planParamsToObject({
      address: { file: 'src/f.ts', symbol },
      found: result,
      read: fx.read,
    });
  };

  it('refuses comments before, between or after the parameters', () => {
    expect(refusalsOf(convertIn('withComments'))).toContain(
      'a comment between parameters would be lost',
    );
    expect(refusalsOf(convertIn('trailing'))).toContain(
      'a comment between parameters would be lost',
    );
  });

  it('refuses a body that reads arguments, also through an arrow, not through another function', () => {
    expect(refusalsOf(convertIn('usesArgs'))).toContain('uses `arguments`');
    expect(refusalsOf(convertIn('arrowArgs'))).toContain('uses `arguments`');
    expect(convertIn('nestedArgs').ok).toBe(true);
  });

  it('rewrites a namespace call and one with type arguments, and flags stale @param tags', () => {
    const result = convertIn('documented');
    const out = fx.applied(result);
    expect(out['src/use.ts']).toContain('ns.documented({ width: 1, height: 2 })');
    expect(out['src/use.ts']).toContain('documented<never>({ width: 1, height: 2 })');
    expect(result.ok && result.plan.findings).toEqual([
      { file: 'src/f.ts', line: 30, message: '@param tags describe the old parameters' },
    ]);
  });
});
