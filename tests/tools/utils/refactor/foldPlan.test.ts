import { afterAll, describe, expect, it } from 'vitest';
import { syncOverlay } from '../../../../tools/utils/refactor/engine/syncOverlay';
import { foldPlan } from '../../../../tools/utils/refactor/foldPlan';
import { planRename } from '../../../../tools/utils/refactor/planRename';
import type { DiskView } from '../../../../tools/@types/refactor/DiskView';
import type { Overlay } from '../../../../tools/@types/refactor/Overlay';
import type { Plan } from '../../../../tools/@types/refactor/Plan';
import { engineFixture } from '../../../helpers/refactor/engineFixture';

const ROOT = '/fixture';
const FILES: Record<string, string> = {
  'src/utils/x/foo.ts': 'export const foo = 1;',
  'src/utils/x/other.ts': 'export const other = 2;',
  'src/app.ts': "import { foo } from './utils/x/foo';\nexport const o = { foo };",
};
const abs = (name: string) => `${ROOT}/${name}`;

function disk(): DiskView {
  const texts = new Map(Object.entries(FILES).map(([name, text]) => [abs(name), text]));
  return {
    read: (file) => texts.get(file) ?? '',
    snapshot: () => ({ texts, fileExists: (file) => texts.has(file) }),
  };
}

function emptyOverlay(): Overlay {
  return { texts: new Map(), moves: [], deletes: new Set() };
}

const NO_PLAN: Plan = { edits: [], moves: [], deletes: [], findings: [] };

describe('foldPlan', () => {
  it("rewrites an importer's specifier when a file moves", () => {
    const overlay = emptyOverlay();
    const move = { from: abs('src/utils/x/foo.ts'), to: abs('src/utils/x/bar.ts') };
    foldPlan({ ...NO_PLAN, moves: [move] }, overlay, disk());
    expect(overlay.texts.get(abs('src/app.ts'))).toContain("from './utils/x/bar'");
    expect(overlay.texts.get(move.to)).toBe(FILES['src/utils/x/foo.ts']);
    expect(overlay.texts.has(move.from)).toBe(false);
    expect(overlay.deletes.has(move.from)).toBe(true);
  });

  it('throws when a destination exists', () => {
    const move = { from: abs('src/utils/x/foo.ts'), to: abs('src/utils/x/other.ts') };
    expect(() => foldPlan({ ...NO_PLAN, moves: [move] }, emptyOverlay(), disk())).toThrow(
      /already exists/,
    );
  });

  it("a second plan sees the first plan's text", () => {
    const overlay = emptyOverlay();
    const file = abs('src/utils/x/other.ts');
    const edit = (start: number, end: number, text: string) => ({ file, start, end, text });
    foldPlan({ ...NO_PLAN, edits: [edit(13, 18, 'longer')] }, overlay, disk());
    foldPlan({ ...NO_PLAN, edits: [edit(0, 6, 'declare')] }, overlay, disk());
    expect(overlay.texts.get(file)).toBe('declare const longer = 2;');
  });

  it('composes a move of a file that an earlier plan already moved', () => {
    const overlay = emptyOverlay();
    const [a, b, c] = ['foo', 'bar', 'baz'].map((n) => abs(`src/utils/x/${n}.ts`)) as [
      string,
      string,
      string,
    ];
    foldPlan({ ...NO_PLAN, moves: [{ from: a, to: b }] }, overlay, disk());
    foldPlan({ ...NO_PLAN, moves: [{ from: b, to: c }] }, overlay, disk());
    expect(overlay.moves).toEqual([{ from: a, to: c }]);
    expect(overlay.texts.has(c)).toBe(true);
  });
});

describe('a batch over a moved file', () => {
  const fixture = engineFixture(FILES);
  afterAll(fixture.dispose);

  it('addresses the symbol at its new path and sees every earlier text change', () => {
    const { engine } = fixture;
    const view = disk();
    const overlay = { texts: engine.overlay, moves: [], deletes: engine.removed };
    const read = (file: string) => engine.overlay.get(file) ?? view.read(file);
    const exists = (file: string) =>
      !engine.removed.has(file) && (engine.overlay.has(file) || view.snapshot().fileExists(file));
    const run = (file: string, symbol: string, newName: string) => {
      const result = planRename({
        address: { file, symbol },
        newName,
        renameFile: true,
        engine,
        read,
        exists,
      });
      if (!result.ok) throw new Error(result.refusals.join('; '));
      syncOverlay(engine, foldPlan(result.plan, overlay, view));
    };

    run('src/utils/x/foo.ts', 'foo', 'bar');
    run('src/utils/x/bar.ts', 'bar', 'baz');

    expect(engine.overlay.get(abs('src/utils/x/baz.ts'))).toBe('export const baz = 1;');
    expect(engine.overlay.get(abs('src/app.ts'))).toBe(
      "import { baz } from './utils/x/baz';\nexport const o = { foo: baz };",
    );
    expect(overlay.moves).toEqual([
      { from: abs('src/utils/x/foo.ts'), to: abs('src/utils/x/baz.ts') },
    ]);
  });
});
