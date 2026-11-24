import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectPropRefs } from '../../../../tools/utils/refactor/collectPropRefs';
import { findTypeErrors } from '../../../../tools/utils/refactor/engine/findTypeErrors';
import { syncOverlay } from '../../../../tools/utils/refactor/engine/syncOverlay';
import { foldPlan } from '../../../../tools/utils/refactor/foldPlan';
import { planRenameProp } from '../../../../tools/utils/refactor/planRenameProp';
import type { DiskView } from '../../../../tools/@types/refactor/DiskView';
import { engineFixture } from '../../../helpers/refactor/engineFixture';

const FILES: Record<string, string> = {
  'src/types.ts': 'export type A = { yaw: number };\nexport type B = { yaw: number };\n',
  'src/use.ts': `import type { A, B } from './types';
declare const a: A;
export const b: B = a;
`,
};

let fixture: ReturnType<typeof engineFixture>;
beforeEach(() => {
  fixture = engineFixture(FILES);
});
afterEach(() => fixture.dispose());

// Renames each `Type.yaw` in turn into the fixture's overlay, as a batch does, then type checks.
function checkAfterRenaming(typeNames: string[]) {
  const { engine, root } = fixture;
  const disk: DiskView = {
    read: (file) => FILES[file.slice(root.length + 1)] ?? '',
    snapshot: () => ({ texts: new Map(), fileExists: () => true }),
  };
  const read = (file: string) => engine.overlay.get(file) ?? disk.read(file);
  const overlay = { texts: engine.overlay, moves: [], deletes: engine.removed };
  for (const typeName of typeNames) {
    const address = { file: 'src/types.ts', typeName, prop: 'yaw' };
    const found = collectPropRefs({ address, engine, read, texts: () => new Map() });
    if (!found.ok) throw new Error(found.refusal);
    const plan = planRenameProp({ address, found: found.found, newName: 'heading', read });
    if (!plan.ok) throw new Error(plan.refusals.join('; '));
    syncOverlay(engine, foldPlan(plan.plan, overlay, disk));
  }
  return findTypeErrors(engine);
}

describe('type check after a property rename', () => {
  it('renaming A.yaw alone leaves a type error at the assignment', () => {
    const errors = checkAfterRenaming(['A']);
    expect(errors.map((e) => `${e.file.slice(fixture.root.length + 1)}:${e.line}`)).toEqual([
      'src/use.ts:3',
    ]);
  });

  it('renaming A.yaw and B.yaw in one batch leaves none', () => {
    expect(checkAfterRenaming(['A', 'B'])).toEqual([]);
  });
});
