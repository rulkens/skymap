import { describe, expect, it } from 'vitest';
import { collectPropRefs } from '../../../../tools/utils/refactor/collectPropRefs';
import { planRenameProp } from '../../../../tools/utils/refactor/planRenameProp';
import { renameMergeRefusal } from '../../../../tools/utils/refactor/renameMergeRefusal';
import { planFixture } from '../../../helpers/refactor/planFixture';

const FILES: Record<string, string> = {
  'src/shape.ts': 'export type Shape = { radius: number; other: number };\n',
  'src/use.ts': `import type { Shape } from './shape';
type Big = Shape & { size: number };
declare const b: Big;
declare const s: Shape;
export const x = b.radius * 2 + b.size;
export function f({ radius, size }: Big) { return radius - size; }
export const y = s.radius;
`,
};
function refusalAfterRenaming(newName: string): readonly string[] {
  const fx = planFixture(FILES);
  try {
    return renaming(fx, newName);
  } finally {
    fx.dispose();
  }
}

function renaming(fx: ReturnType<typeof planFixture>, newName: string): readonly string[] {
  const address = { file: 'src/shape.ts', typeName: 'Shape', prop: 'radius' };
  const found = collectPropRefs({ address, engine: fx.engine, read: fx.read, texts: fx.texts });
  if (!found.ok) throw new Error(found.refusal);
  const planned = planRenameProp({ address, found: found.found, newName, read: fx.read });
  if (!planned.ok) throw new Error(planned.refusals.join('; '));
  fx.fold(planned.plan);
  return renameMergeRefusal({
    engine: fx.engine,
    read: fx.read,
    address,
    newName,
    before: found.found,
    plan: planned.plan,
  });
}

describe('renameMergeRefusal', () => {
  it('names the sites that would now refer to the wider type’s property', () => {
    const lines = refusalAfterRenaming('size');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^Cannot rename 'Shape\.radius' to 'size': afterwards \d+ site\(s\) would also refer to another property named 'size': .*src\/use\.ts:5/,
    );
  });

  it('is silent for a rename to a name nothing else has', () => {
    expect(refusalAfterRenaming('diameter')).toEqual([]);
  });
});
