/**
 * structureLayer — the composed rows over a stub runtime (no factory touches
 * the GPU at construction): each pass name is the Layer's alone and drawn by a
 * `FRAME_ORDER` line.
 */

import { describe, it, expect } from 'vitest';

import { structureLayer } from '../../../src/layers/structure/layer';
import { createStructureStore } from '../../../src/layers/structure/catalog/load/createStructureStore';
import { CONTENT_PASSES } from '../../../src/services/engine/frame/passes';
import { FRAME_ORDER_PASS_NAMES } from '../../../src/services/engine/frame/frameOrderPassNames';
import { structurePickCodes } from '../../support/layerPickCodes';
import type { StructureRuntime } from '../../../src/layers/structure/@types/StructureRuntime';

function stubRuntime(): StructureRuntime {
  return {
    store: createStructureStore(),
    pickCodes: structurePickCodes(),
    cosmoRenderer: {},
    nearRenderer: {},
    slot: {},
  } as unknown as StructureRuntime;
}

describe('structureLayer', () => {
  it("the Layer's pass names are not core's, and each sits on a FRAME_ORDER line", () => {
    const names = structureLayer.passes(stubRuntime()).map((pass) => pass.name);
    const coreNames = CONTENT_PASSES.map((pass) => pass.name);

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(coreNames, name).not.toContain(name);
      expect(FRAME_ORDER_PASS_NAMES, name).toContain(name);
    }
  });
});
