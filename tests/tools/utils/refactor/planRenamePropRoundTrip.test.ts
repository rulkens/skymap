import { afterAll, describe, expect, it } from 'vitest';
import { collectPropRefs } from '../../../../tools/utils/refactor/collectPropRefs';
import { planRenameProp } from '../../../../tools/utils/refactor/planRenameProp';
import { planFixture } from '../../../helpers/refactor/planFixture';

const FILES: Record<string, string> = {
  'src/shape.ts': 'export type Shape = { radius: number };',
  'src/use.ts': `import type { Shape } from './shape';
declare const radius: number;
export const lit: Shape = { radius };
export function area({ radius }: Shape, { radius: r = 1 }: Shape) {
  return radius * r;
}
`,
};

const fixture = planFixture(FILES);
afterAll(fixture.dispose);
const { engine, root, read } = fixture;

function rename(prop: string, newName: string): void {
  const address = { file: 'src/shape.ts', typeName: 'Shape', prop };
  const found = collectPropRefs({ address, engine, read, texts: () => new Map() });
  if (!found.ok) throw new Error(found.refusal);
  const result = planRenameProp({ address, found: found.found, newName, read });
  if (!result.ok) throw new Error(result.refusals.join('; '));
  fixture.fold(result.plan);
}

describe('planRenameProp round trip', () => {
  it('a rename there and back is byte-identical', () => {
    rename('radius', 'size');
    expect(read(`${root}/src/use.ts`)).toContain('{ size: radius }');
    rename('size', 'radius');
    for (const [name, text] of Object.entries(FILES)) expect(read(`${root}/${name}`)).toBe(text);
  });
});
