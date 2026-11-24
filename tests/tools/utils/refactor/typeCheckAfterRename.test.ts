import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkRun } from '../../../../tools/utils/refactor/checkRun';
import { collectPropRefs } from '../../../../tools/utils/refactor/collectPropRefs';
import { overlaidTexts } from '../../../../tools/utils/refactor/overlaidTexts';
import { planRenameProp } from '../../../../tools/utils/refactor/planRenameProp';
import { planFixture } from '../../../helpers/refactor/planFixture';

const FILES: Record<string, string> = {
  'src/types.ts': 'export type A = { yaw: number };\nexport type B = { yaw: number };\n',
  'src/use.ts': `import type { A, B } from './types';
declare const a: A;
export const b: B = a;
export const y = b.yaw;
`,
};

let fx: ReturnType<typeof planFixture>;
beforeEach(() => {
  fx = planFixture(FILES);
});
afterEach(() => fx.dispose());

// Renames each `Type.yaw` in turn into the fixture's overlay, as a batch does, then type checks.
function checkAfterRenaming(typeNames: string[]) {
  for (const typeName of typeNames) {
    const address = { file: 'src/types.ts', typeName, prop: 'yaw' };
    const found = collectPropRefs({ address, engine: fx.engine, read: fx.read, texts: fx.texts });
    if (!found.ok) throw new Error(found.refusal);
    const plan = planRenameProp({ address, found: found.found, newName: 'heading', read: fx.read });
    if (!plan.ok) throw new Error(plan.refusals.join('; '));
    fx.fold(plan.plan);
  }
  const checked = checkRun({
    enabled: true,
    engine: fx.engine,
    unsynced: undefined,
    texts: () => overlaidTexts(fx.texts(), fx.engine),
    names: ['yaw', 'heading'],
  });
  return checked?.errors ?? [];
}

describe('type check after a property rename', () => {
  it('renaming A.yaw alone leaves a type error at the assignment', () => {
    const errors = checkAfterRenaming(['A']);
    expect(errors.map((e) => `${e.file.slice(fx.root.length + 1)}:${e.line}`)).toEqual([
      'src/use.ts:3',
    ]);
  });

  it('renaming A.yaw and B.yaw in one batch leaves none', () => {
    expect(checkAfterRenaming(['A', 'B'])).toEqual([]);
  });
});
