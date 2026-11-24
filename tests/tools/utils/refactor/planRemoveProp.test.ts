import { afterAll, describe, expect, it } from 'vitest';
import { collectPropRefs } from '../../../../tools/utils/refactor/collectPropRefs';
import { syncOverlay } from '../../../../tools/utils/refactor/engine/syncOverlay';
import { foldPlan } from '../../../../tools/utils/refactor/foldPlan';
import { locateProp } from '../../../../tools/utils/refactor/locateProp';
import { planRemoveProp } from '../../../../tools/utils/refactor/planRemoveProp';
import type { DiskView } from '../../../../tools/@types/refactor/DiskView';
import type { PlanResult } from '../../../../tools/@types/refactor/PlanResult';
import { engineFixture } from '../../../helpers/refactor/engineFixture';

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

const fixture = engineFixture(FILES);
afterAll(fixture.dispose);

const { engine, root } = fixture;
const abs = (name: string) => `${root}/${name}`;
const disk: DiskView = {
  read: (file) => FILES[file.slice(root.length + 1)] ?? '',
  snapshot: () => ({
    texts: new Map(Object.entries(FILES).map(([name, text]) => [abs(name), text])),
    fileExists: () => true,
  }),
};
const read = (file: string) => engine.overlay.get(file) ?? disk.read(file);
const address = (prop: string, typeName = 'Shape') => ({ file: 'src/shape.ts', typeName, prop });

function remove(prop: string, typeName = 'Shape'): PlanResult {
  const found = collectPropRefs({
    address: address(prop, typeName),
    engine,
    read,
    texts: () => disk.snapshot().texts,
  });
  if (!found.ok) throw new Error(found.refusal);
  return planRemoveProp({ address: address(prop, typeName), found: found.found, read });
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
    const overlay = { texts: engine.overlay, moves: [], deletes: engine.removed };
    const result = remove('radius');
    if (!result.ok) throw new Error(result.refusals.join('; '));
    syncOverlay(engine, foldPlan(result.plan, overlay, disk));
    const located = locateProp(read(abs('src/shape.ts')), address('radius'));
    expect(located.ok).toBe(false);
    for (const name of ['src/make.ts', 'src/use.ts']) {
      expect(read(abs(name))).not.toContain('radius');
    }
  });
});
