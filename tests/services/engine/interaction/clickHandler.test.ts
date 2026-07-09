/**
 * clickHandler — unit tests for the click → SelectionRef resolver.
 *
 * The resolver is a small async wrapper around `pickProgram.pick` that
 * delegates decode + resolution to `resolvePick` (covered exhaustively in
 * `resolvePick.test.ts`). These tests verify the wrapper itself:
 *
 *   1. A picker miss (`null`) returns null.
 *   2. A galaxy catalog hit resolves to a `{ type:'galaxyCatalog', source, index }` ref.
 *   3. A structure hit resolves to a `{ type:'structure', id }` ref.
 *   4. The program is called with the exact `(pickXPx, pickYPx)` the engine
 *      supplied — the program owns every other pick input.
 */

import { describe, it, expect, vi } from 'vitest';

import { createClickResolver } from '../../../../src/services/engine/interaction/clickHandler';
import type { ClickResolveInput } from '../../../../src/@types/engine/ClickResolveInput';
import type { PickStructureStore } from '../../../../src/@types/engine/data/PickStructureStore';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import { Source } from '../../../../src/data/sources';
import type { PickProgram } from '../../../../src/@types/engine/frame/PickProgram';
import type { PickResult } from '../../../../src/@types/data/PickResult';

// `pickProgram.pick` returns the decoded `PickResult` (sourceCode + localIdx).
function makeProgram(pick: PickResult | null): PickProgram {
  return {
    label: 'pickProgram',
    pick: vi.fn(async () => pick),
    renderForDebug: vi.fn(() => null),
    destroy: vi.fn(),
  } as unknown as PickProgram;
}

const virgo: StructureInfo = {
  type: 'structure',
  id: 'virgo',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2,
};

const structures: PickStructureStore = {
  byCategory: (cat) => (cat === 'cluster' ? [virgo] : []),
};

// The only dep `resolvePick` needs — the galaxy arm is purely positional
// (no cloud read), so only the structure store is required.
const deps = {
  structures,
};

const dummyArgs: ClickResolveInput = {
  pickXPx: 10,
  pickYPx: 20,
};

describe('createClickResolver', () => {
  it('returns null when the picker reports background (null)', async () => {
    const r = createClickResolver({ pickProgram: makeProgram(null), ...deps });
    expect(await r.resolveClick(dummyArgs)).toBeNull();
  });

  it('resolves a galaxy catalog hit to a galaxy ref', async () => {
    const r = createClickResolver({
      pickProgram: makeProgram({ sourceCode: Source.SDSS, localIdx: 7 }),
      ...deps,
    });
    const target = await r.resolveClick(dummyArgs);
    expect(target).not.toBeNull();
    expect(target?.type).toBe('galaxyCatalog');
    if (target?.type === 'galaxyCatalog') {
      expect(target.source).toBe(Source.SDSS);
      expect(target.index).toBe(7);
    }
  });

  it('resolves a structure hit to its structure ref', async () => {
    // `resolvePick` converts the pick index to the durable record id via
    // `structures.byCategory`; the resolver returns the ref, not the full
    // StructureInfo object.
    const r = createClickResolver({
      pickProgram: makeProgram({ sourceCode: Source.Cluster, localIdx: 0 }),
      ...deps,
    });
    expect(await r.resolveClick(dummyArgs)).toEqual({ type: 'structure', id: 'virgo' });
  });

  it('forwards the click position to pickProgram.pick verbatim', async () => {
    const program = makeProgram({ sourceCode: Source.SDSS, localIdx: 0 });
    const r = createClickResolver({ pickProgram: program, ...deps });
    await r.resolveClick({ pickXPx: 11, pickYPx: 22 });
    expect(program.pick).toHaveBeenCalledTimes(1);
    // The program owns every other pick input — the resolver hands it only
    // the texture-space cursor coordinate.
    expect(program.pick).toHaveBeenCalledWith(11, 22);
  });
});
