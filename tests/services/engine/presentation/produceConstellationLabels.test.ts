import { describe, expect, it } from 'vitest';
import { produceConstellationLabels } from '../../../../src/services/engine/presentation/produceConstellationLabels';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ConstellationsArtifact } from '../../../../src/@types/loading/ConstellationsArtifact';

// A two-figure fixture: Latin names + parsec-scale anchors. Segments are
// irrelevant to the label producer (the renderer consumes them), so each figure
// carries a single throwaway segment to keep the artifact shape honest.
const ARTIFACT: ConstellationsArtifact = {
  version: 1,
  constellations: [
    {
      name: 'Orion',
      labelAnchorPc: [200, -50, 100],
      segments: [{ aPc: [1, 2, 3], aAppMag: 0.5, bPc: [4, 5, 6], bAppMag: 1.2 }],
    },
    {
      name: 'Ursa Major',
      labelAnchorPc: [-30, 80, 12],
      segments: [{ aPc: [7, 8, 9], aAppMag: 2.0, bPc: [10, 11, 12], bAppMag: 2.4 }],
    },
  ],
};

// Minimal state: the producer reads the constellations slot's ready value and
// the fade registry (opacityOf only — a pure reader).
function makeState(layerOpacity: number, ready = true): EngineState {
  return {
    assetSlots: {
      constellations: {
        state: () => (ready ? { kind: 'ready', value: ARTIFACT } : { kind: 'idle' }),
      },
    },
    subsystems: {
      fades: { opacityOf: () => layerOpacity },
    },
  } as unknown as EngineState;
}

// camDistMpc is derived from drawCamPos; nowMs feeds the fade read (unused by
// the stub). Camera on the +X axis at the given heliocentric-origin distance.
function makeCtx(camDistMpc: number): ReadyFrameContext {
  return {
    drawCamPos: [camDistMpc, 0, 0],
    nowMs: 0,
  } as unknown as ReadyFrameContext;
}

const PC = SCALE_UNITS.PC_TO_MPC;

describe('produceConstellationLabels', () => {
  it('produces one label per constellation at its anchor with the Latin name', () => {
    // camDist 0.0005 Mpc sits below the constellations band's full edge (0.001),
    // so the distance fade is 1; layer opacity 1 → full alpha.
    const out = produceConstellationLabels(makeState(1), makeCtx(0.0005));
    expect(out.labels).toHaveLength(2);

    expect(out.labels[0]!.text).toBe('Orion');
    expect(out.labels[0]!.worldPos).toEqual([200 * PC, -50 * PC, 100 * PC]);

    expect(out.labels[1]!.text).toBe('Ursa Major');
    expect(out.labels[1]!.worldPos).toEqual([-30 * PC, 80 * PC, 12 * PC]);

    expect(out.lines).toEqual([]);
  });

  it('multiplies the layer fade opacity into every label alpha', () => {
    // At camDist 0.0005 the distance factor is 1 (below the band's 0.001 full
    // edge — hand-computed, not read back from the producer): so fadeAlpha
    // reduces to the stubbed layer opacity of 0.5.
    const out = produceConstellationLabels(makeState(0.5), makeCtx(0.0005));
    expect(out.labels).toHaveLength(2);
    for (const label of out.labels) expect(label.fadeAlpha).toBeCloseTo(0.5);
  });

  it('emits nothing while the layer is fully faded out (opacity 0)', () => {
    const out = produceConstellationLabels(makeState(0), makeCtx(0.0005));
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
  });

  it('emits nothing before the artifact is ready', () => {
    const out = produceConstellationLabels(makeState(1, false), makeCtx(0.0005));
    expect(out.labels).toEqual([]);
  });
});
