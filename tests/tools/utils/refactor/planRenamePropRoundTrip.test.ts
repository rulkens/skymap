import { afterAll, describe, expect, it } from 'vitest';
import { collectPropRefs } from '../../../../tools/utils/refactor/collectPropRefs';
import { syncOverlay } from '../../../../tools/utils/refactor/engine/syncOverlay';
import { foldPlan } from '../../../../tools/utils/refactor/foldPlan';
import { planRenameProp } from '../../../../tools/utils/refactor/planRenameProp';
import type { DiskView } from '../../../../tools/@types/refactor/DiskView';
import { engineFixture } from '../../../helpers/refactor/engineFixture';

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

const fixture = engineFixture(FILES);
afterAll(fixture.dispose);
const { engine, root } = fixture;
const disk: DiskView = {
  read: (file) => FILES[file.slice(root.length + 1)] ?? '',
  snapshot: () => ({ texts: new Map(), fileExists: () => true }),
};
const read = (file: string) => engine.overlay.get(file) ?? disk.read(file);

function rename(prop: string, newName: string): void {
  const address = { file: 'src/shape.ts', typeName: 'Shape', prop };
  const found = collectPropRefs({ address, engine, read, texts: () => new Map() });
  if (!found.ok) throw new Error(found.refusal);
  const result = planRenameProp({ address, found: found.found, newName, read });
  if (!result.ok) throw new Error(result.refusals.join('; '));
  const overlay = { texts: engine.overlay, moves: [], deletes: engine.removed };
  syncOverlay(engine, foldPlan(result.plan, overlay, disk));
}

describe('planRenameProp round trip', () => {
  it('a rename there and back is byte-identical', () => {
    rename('radius', 'size');
    expect(read(`${root}/src/use.ts`)).toContain('{ size: radius }');
    rename('size', 'radius');
    for (const [name, text] of Object.entries(FILES)) expect(read(`${root}/${name}`)).toBe(text);
  });
});
