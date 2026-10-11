/**
 * structureLayer — the composed rows over a stub runtime (no factory touches
 * the GPU at construction): each label producer sits on the slab its own
 * categories draw on, and each pass name is the Layer's alone and drawn by a
 * `FRAME_ORDER` line.
 */

import { describe, it, expect } from 'vitest';

import { structureLayer } from '../../../src/layers/structure/layer';
import { createStructureStore } from '../../../src/layers/structure/load/createStructureStore';
import { CONTENT_PASSES } from '../../../src/services/engine/frame/passes';
import { FRAME_ORDER_PASS_NAMES } from '../../../src/services/engine/frame/frameOrderPassNames';
import { COSMO, NEAR0 } from '../../../src/services/engine/frame/slabs';
import { ZERO_FOCUS } from '../../../src/services/engine/subsystems/structureFocusSubsystem';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';
import type { StructureRuntime } from '../../../src/layers/structure/@types/StructureRuntime';

function stubRuntime(): StructureRuntime {
  return {
    store: createStructureStore(),
    cosmoRenderer: {},
    nearRenderer: {},
    slot: {},
  } as unknown as StructureRuntime;
}

/** Every category on, nothing focused, every fade at full opacity. */
const STATE = {
  settings: {
    structures: {
      enabled: true,
      items: Object.fromEntries(
        STRUCTURE_IDS.map((c) => [c, { enabled: true, labelEnabled: true }]),
      ),
    },
    labels: { focusedOnly: false },
  },
  selection: { focus: null, select: null, hover: null },
  subsystems: {
    fades: { opacityOf: () => 1 },
    clipPlayer: { clipOpacityOf: () => 1 },
  },
} as unknown as EngineState;

// 5 Mpc out: inside the cosmic categories' visibility bands, far past the Milky
// Way ones.
const CTX = {
  snapshot: { focusBlend: 0, nowMs: 0, focus: ZERO_FOCUS },
  drawCamPos: [0, 0, 5],
  drawPxPerRad: 1080 / (2 * Math.tan(Math.PI / 6)),
} as unknown as FrameView;

describe('structureLayer', () => {
  it('each label row registers on the slab its categories draw on', () => {
    const runtime = stubRuntime();
    runtime.store.setGroup('anchors', [
      {
        id: 'galaxy-cluster-virgo',
        name: 'Virgo',
        category: 'galaxy-cluster',
        worldPos: [10, 0, 5],
        physicalRadiusMpc: 5,
        featured: true,
      } as StructureInfo,
    ]);
    const rows = structureLayer.guides!(runtime).screenLabels!;
    const idsOn = (slab: number) =>
      rows
        .filter((row) => row.slab === slab)
        .flatMap((row) => row.produceLabels(STATE, CTX).labels.map((label) => label.id));

    // A cluster is cosmic: its label comes from the COSMO row, never NEAR0's.
    expect(idsOn(COSMO)).toEqual(['galaxy-cluster-virgo']);
    expect(idsOn(NEAR0)).toEqual([]);
  });

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
