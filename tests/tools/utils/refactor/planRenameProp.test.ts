import { afterAll, describe, expect, it } from 'vitest';
import { collectPropRefs } from '../../../../tools/utils/refactor/collectPropRefs';
import { planRenameProp } from '../../../../tools/utils/refactor/planRenameProp';
import type { PlanResult } from '../../../../tools/@types/refactor/PlanResult';
import { planFixture } from '../../../helpers/refactor/planFixture';

const FILES: Record<string, string> = {
  'src/shape.ts': "export type Shape = { radius: number; 'sides': number };",
  'src/make.ts': `import type { Shape } from './shape';
declare const radius: number;
export const tight: Shape = { radius, sides: 1 };
export const lit: Shape = { radius: 2, sides: 3 };
export const picked: Pick<Shape, 'radius'> = { radius: 4 };
`,
  'src/read.ts': `import type { Shape } from './shape';
export function area({ radius }: Shape, other: Shape) {
  return radius * other.radius + other['radius'];
}
`,
  'tests/read.test.ts': `import type { Shape } from '../src/shape';
declare const a: Shape;
export const t = a.radius;
`,
};

const fixture = planFixture(FILES);
afterAll(fixture.dispose);

const { abs, read, texts } = fixture;
const address = { file: 'src/shape.ts', typeName: 'Shape', prop: 'radius' };

function found(prop = 'radius') {
  const result = collectPropRefs({
    address: { ...address, prop },
    engine: fixture.engine,
    read,
    texts,
  });
  if (!result.ok) throw new Error(result.refusal);
  return result.found;
}

function rename(newName: string): PlanResult {
  return planRenameProp({ address, found: found(), newName, read });
}

function planOf(result: PlanResult) {
  if (!result.ok) throw new Error(result.refusals.join('; '));
  return result.plan;
}

describe('planRenameProp', () => {
  it('renames the declaration and uses in two files', () => {
    const { edits } = planOf(rename('size'));
    const files = new Set(edits.map((e) => e.file.slice(fixture.root.length + 1)));
    expect([...files].sort()).toEqual([
      'src/make.ts',
      'src/read.ts',
      'src/shape.ts',
      'tests/read.test.ts',
    ]);
    // The shorthand keeps its local, in the literal and in the parameter destructure.
    expect(edits.filter((e) => e.text === 'size: radius')).toHaveLength(2);
  });

  it('refuses a name the type already has', () => {
    expect(rename('sides')).toEqual({
      ok: false,
      refusals: [expect.stringContaining('already has that member')],
    });
  });

  it('refuses an invalid identifier and an unchanged name', () => {
    expect(rename('not valid').ok).toBe(false);
    expect(rename('radius').ok).toBe(false);
  });

  it('carries the quoted mention in Pick<> as a finding', () => {
    const { findings } = planOf(rename('size'));
    expect(findings.map((f) => `${f.file}:${f.line}`)).toEqual(['src/make.ts:5']);
  });

  it('the folded result typechecks: the same uses answer to the new name', () => {
    // The literal typed through Pick<Shape, 'radius'> stops resolving: its string is the finding.
    const before = found().report.refs.filter(
      (r) => !(r.filePath === 'src/make.ts' && r.line === 5),
    );
    fixture.fold(planOf(rename('size')));
    const after = found('size');
    expect(after.report.refs.map((r) => [r.filePath, r.line])).toEqual(
      before.map((r) => [r.filePath, r.line]),
    );
    expect(read(abs('src/make.ts'))).toContain('{ size: radius, sides: 1 }');
    expect(read(abs('src/shape.ts'))).toBe(
      "export type Shape = { size: number; 'sides': number };",
    );
  });
});
