import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkRun } from '../../../../tools/utils/refactor/checkRun';
import { engineFixture } from '../../../helpers/refactor/engineFixture';

const FILES = {
  'src/a.ts': 'export const a = 1;\n',
  'src/b.ts': "import { a } from './a';\nexport const b: number = a;\n",
};

let fx: ReturnType<typeof engineFixture>;
beforeEach(() => {
  fx = engineFixture(FILES);
});
afterEach(() => fx.dispose());

const textsWith =
  (overrides: Record<string, string> = {}) =>
  () =>
    new Map(
      Object.entries({ ...FILES, ...overrides }).map(([name, text]) => [
        `${fx.root}/${name}`,
        text,
      ]),
    );

// The overlay holds a folded edit the engine has not been told about yet.
function foldBreakage() {
  const file = `${fx.root}/src/a.ts`;
  const text = "export const a = 'text';\n";
  fx.engine.overlay.set(file, text);
  return {
    unsynced: { changed: [file], created: [], deleted: [] },
    texts: textsWith({ 'src/a.ts': text }),
  };
}

describe('checkRun', () => {
  it('syncs the last fold, then reports the errors it caused in the files that name it', () => {
    const { unsynced, texts } = foldBreakage();
    const result = checkRun({ enabled: true, engine: fx.engine, unsynced, texts, names: ['a'] });
    expect(result?.errors.map((e) => e.file.slice(fx.root.length + 1))).toEqual(['src/b.ts']);
    expect(result?.files).toContain(`${fx.root}/src/b.ts`);
  });

  it('is clean when nothing broke', () => {
    const result = checkRun({
      enabled: true,
      engine: fx.engine,
      unsynced: undefined,
      texts: textsWith(),
      names: ['a'],
    });
    expect(result?.errors).toEqual([]);
  });

  it('does nothing when disabled, not even the sync', () => {
    const { unsynced, texts } = foldBreakage();
    const off = checkRun({ enabled: false, engine: fx.engine, unsynced, texts, names: ['a'] });
    expect(off).toBeUndefined();
    const stale = checkRun({
      enabled: true,
      engine: fx.engine,
      unsynced: undefined,
      texts,
      names: ['a'],
    });
    expect(stale?.errors).toEqual([]);
  });
});
