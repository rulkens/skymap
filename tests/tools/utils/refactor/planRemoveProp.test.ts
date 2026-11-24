import { afterAll, describe, expect, it } from 'vitest';
import { collectPropRefs } from '../../../../tools/utils/refactor/collectPropRefs';
import { locateProp } from '../../../../tools/utils/refactor/locateProp';
import { planRemoveProp } from '../../../../tools/utils/refactor/planRemoveProp';
import type { PlanResult } from '../../../../tools/@types/refactor/PlanResult';
import { planFixture } from '../../../helpers/refactor/planFixture';

const FILES: Record<string, string> = {
  'src/shape.ts': `export type Shape = {
  radius: number;
  sides: number;
  color: string;
  note: string;
  tag: string;
  mixed: number;
};
export type Link = { next?: Link; v: number };
`,
  'src/make.ts': `import type { Link, Shape } from './shape';
export const chain: Link = { v: 1, next: { v: 2, next: { v: 3 } } };
declare const tag: string;
declare function paint(): string;
export const a: Shape = { radius: 2, sides: 3, color: 'r', note: 'n', tag, mixed: 1 };
export const b: Shape = { radius: 4, sides: 3, color: paint(), note: 'n', tag, mixed: Number(1) };
`,
  'src/use.ts': `import type { Shape } from './shape';
export function f(s: Shape) {
  s.radius = 5;
  s.note += 'x';
  return s.sides + s.mixed;
}
`,
};

const fixture = planFixture(FILES);
afterAll(fixture.dispose);

const { engine, abs, read, texts, applied } = fixture;
const address = (prop: string, typeName = 'Shape') => ({ file: 'src/shape.ts', typeName, prop });

function remove(prop: string, typeName = 'Shape'): PlanResult {
  const found = collectPropRefs({ address: address(prop, typeName), engine, read, texts });
  if (!found.ok) throw new Error(found.refusal);
  return planRemoveProp({ address: address(prop, typeName), found: found.found, read });
}

describe('planRemoveProp', () => {
  it('removes the declaration and two literal writes', () => {
    const out = applied(remove('radius'));
    expect(out['src/shape.ts']).not.toContain('radius');
    expect(out['src/make.ts']).toContain("{ sides: 3, color: 'r'");
    expect(out['src/make.ts']).toContain('{ sides: 3, color: paint()');
    expect(out['src/make.ts']).not.toContain('radius');
    expect(out['src/use.ts']).not.toContain('s.radius');
    expect(out['src/use.ts']).toContain("s.note += 'x';");
  });

  it('refuses while a read exists and lists it', () => {
    expect(remove('sides')).toEqual({
      ok: false,
      refusals: [
        "Cannot remove 'Shape.sides': 1 use(s) block it.",
        'src/use.ts:5:12  read: still used',
      ],
    });
  });

  it('refuses a write whose value is a call', () => {
    const result = remove('color');
    expect(result).toEqual({
      ok: false,
      refusals: [
        "Cannot remove 'Shape.color': 1 use(s) block it.",
        'src/make.ts:6:48  write: removing it would drop a side effect in its value',
      ],
    });
  });

  it('removes a shorthand write', () => {
    const out = applied(remove('tag'));
    expect(out['src/make.ts']).toContain("note: 'n', mixed: 1 };");
    expect(out['src/make.ts']).not.toContain("{ radius: 2, sides: 3, color: 'r', note: 'n', tag");
  });

  it('refuses a compound assignment', () => {
    const result = remove('note');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusals.join('\n')).toContain(
      'src/use.ts:4:5  write: only a plain `a.prop = value;` statement can be cut',
    );
  });

  it('returns every refusal, not only the first', () => {
    const result = remove('mixed');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusals).toHaveLength(3);
    expect(result.refusals[0]).toContain('2 use(s)');
    expect(result.refusals.join('\n')).toContain('src/make.ts:6:');
    expect(result.refusals.join('\n')).toContain('src/use.ts:5:');
  });

  it('cuts a write nested in another cut write once', () => {
    const out = applied(remove('next', 'Link'));
    expect(out['src/make.ts']).toContain('export const chain: Link = { v: 1 };');
  });

  it('the folded result has no reference left', () => {
    const result = remove('radius');
    if (!result.ok) throw new Error(result.refusals.join('; '));
    fixture.fold(result.plan);
    const located = locateProp(read(abs('src/shape.ts')), address('radius'));
    expect(located.ok).toBe(false);
    for (const name of ['src/make.ts', 'src/use.ts']) {
      expect(read(abs(name))).not.toContain('radius');
    }
  });
});

describe('planRemoveProp: the forms that review found', () => {
  const FILES2: Record<string, string> = {
    'src/shape.ts': `export type Shape = { a: number; radius?: number; sw?: number; tag?: number; doc?: number };
export type Fn = { a: number; radius?(): number };
`,
    'src/use.ts': `import type { Fn, Shape } from './shape';
declare const s: Shape;
declare function get(): Shape;
declare const list: Shape[];
let i = 0;
get().radius = 3;
list[i++].radius = 4;
switch (s.a) {
  case 1:
    s.sw = 9;
    break;
  default:
    s.sw = 8;
}
export const n = i;
export const f: Fn = { a: 1 };
`,
    'src/clean.ts': `import type { Shape } from './shape';
/** See {@link Shape.doc}. */
export function mk(a: number) {
  const tag = a * 2;
  const s: Shape = { a, tag, doc: 1 };
  return s;
}
`,
  };
  const fx = planFixture(FILES2);
  afterAll(fx.dispose);
  const run = (typeName: string, prop: string) => {
    const addr = { file: 'src/shape.ts', typeName, prop };
    const found = collectPropRefs({
      address: addr,
      engine: fx.engine,
      read: fx.read,
      texts: fx.texts,
    });
    if (!found.ok) throw new Error(found.refusal);
    return planRemoveProp({ address: addr, found: found.found, read: fx.read });
  };

  it('refuses a write whose target does work', () => {
    const result = run('Shape', 'radius');
    const lines = !result.ok ? result.refusals.join('\n') : '';
    expect(lines).toContain('src/use.ts:6:');
    expect(lines).toContain('src/use.ts:7:');
    expect(lines).toContain('side effect');
  });

  it('removes a method-style member', () => {
    expect(fx.applied(run('Fn', 'radius'))['src/shape.ts']).toContain(
      'export type Fn = { a: number; };',
    );
  });

  it('cuts a write that sits directly in a case or default clause', () => {
    const out = fx.applied(run('Shape', 'sw'));
    expect(out['src/use.ts']).not.toContain('s.sw');
  });

  it('a shorthand cut leaves its local, so it says so', () => {
    const result = run('Shape', 'tag');
    expect(result.ok && result.plan.findings).toEqual([
      { file: 'src/clean.ts', line: 5, message: "local 'tag' may now be unused" },
    ]);
  });

  it('a doc link does not block, and is reported', () => {
    const result = run('Shape', 'doc');
    expect(result.ok && result.plan.findings).toEqual([
      { file: 'src/clean.ts', line: 2, message: 'still mentioned in a doc comment' },
    ]);
  });
});
