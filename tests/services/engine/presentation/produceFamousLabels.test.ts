import { describe, expect, it } from 'vitest';
import { produceFamousLabels } from '../../../../src/services/engine/presentation/produceFamousLabels';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import { Source } from '../../../../src/data/sources';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';
import type { FamousMetaEntry } from '../../../../src/@types/loading/FamousMetaEntry';

// produceFamousLabels reads only state.data.galaxies; a bare engineData stub
// suffices (no selection, no projection — declutter moved to the director).
function makeState(): EngineState {
  return { data: createEngineData() } as unknown as EngineState;
}

function makeCtx(): ReadyFrameContext {
  return {
    drawCamPos: [0, 0, 0],
    canvasSize: { width: 1920, height: 1080 },
    drawPxPerRad: 1080 / (2 * Math.tan((60 * Math.PI) / 180 / 2)),
  } as unknown as ReadyFrameContext;
}

// pxPerRad the producer derives from the ctx above (= drawPxPerRad).
const PX_PER_RAD = 1080 / (2 * Math.tan((30 * Math.PI) / 180));
const sizePxAt = (diameterKpc: number, distanceMpc: number) =>
  (diameterKpc / (distanceMpc * 1000)) * PX_PER_RAD;

const meta = (...entries: Partial<FamousMetaEntry>[]): FamousMetaEntry[] =>
  entries.map((e) => ({ id: 'x', names: [], description: '', type: '', ...e }) as FamousMetaEntry);

const famousCatalog = (positions: number[], diameters: number[]): GalaxyCatalog =>
  ({
    count: diameters.length,
    positions: new Float32Array(positions),
    diameterKpc: new Float32Array(diameters),
  }) as unknown as GalaxyCatalog;

function seed(
  state: EngineState,
  entries: Partial<FamousMetaEntry>[],
  positions: number[],
  diameters: number[],
): void {
  state.data.galaxies.setFamousMeta(meta(...entries));
  state.data.galaxies.setCatalog(Source.Famous, famousCatalog(positions, diameters));
}

describe('produceFamousLabels', () => {
  it('emits a lifted label + anchor line for a galaxy above the size gate', () => {
    const state = makeState();
    // 120 kpc galaxy at 10 Mpc → ~11.2 px (above the 6 px gate, full alpha).
    seed(state, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const out = produceFamousLabels(state, makeCtx());

    expect(out.labels.map((l) => l.id)).toEqual(['famous-m31']);
    const label = out.labels[0]!;
    expect(label.text).toBe('M31');
    expect(label.alignX).toBe('center');
    expect(label.alignY).toBe('baseline');
    // offset = max(0.05, 1.5 × 0.12 Mpc) = 0.18; label lifts in +Y.
    expect(label.worldPos[1]).toBeCloseTo(0.18, 6);
    expect(label.fadeAlpha).toBe(1);
    expect(label.prominencePx).toBeCloseTo(sizePxAt(120, 10), 3);

    expect(out.lines.map((m) => m.id)).toEqual(['famous-m31-anchor']);
    // line runs from the dot to 75 % of the lift.
    expect(out.lines[0]!.toWorld[1]).toBeCloseTo(0.18 * 0.75, 6);
  });

  it('skips a galaxy whose apparent size is below the threshold', () => {
    const state = makeState();
    seed(state, [{ id: 'far', names: ['Far'] }], [100000, 0, 0], [40]);
    const out = produceFamousLabels(state, makeCtx());
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
  });

  it('emits nothing when famous labels are hidden', () => {
    const state = makeState();
    seed(state, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    state.data.galaxies.setFamousLabelsVisible(false);
    expect(produceFamousLabels(state, makeCtx()).labels).toEqual([]);
  });

  it('emits nothing when the famous catalog is absent or meta is empty', () => {
    const noCatalog = makeState();
    noCatalog.data.galaxies.setFamousMeta(meta({ id: 'm31', names: ['M31'] }));
    expect(produceFamousLabels(noCatalog, makeCtx()).labels).toEqual([]);

    const noMeta = makeState();
    noMeta.data.galaxies.setCatalog(Source.Famous, famousCatalog([10, 0, 0], [120]));
    expect(produceFamousLabels(noMeta, makeCtx()).labels).toEqual([]);
  });

  it('skips pseudo meta entries and keeps the catalog index aligned', () => {
    const state = makeState();
    // Pseudo Milky Way first (no .bin row), then M31 → maps to catalog[0].
    seed(
      state,
      [
        { id: 'mw', pseudo: true },
        { id: 'm31', names: ['M31'] },
      ],
      [10, 0, 0],
      [120],
    );
    const out = produceFamousLabels(state, makeCtx());
    expect(out.labels.map((l) => l.id)).toEqual(['famous-m31']);
  });

  it('scales worldEmMpc with diameter (40 kpc anchors the category default)', () => {
    const state = makeState();
    // 40 kpc galaxy at 3 Mpc → ~12.5 px (full alpha); worldEm == reference.
    seed(state, [{ id: 'ref', names: ['Ref'] }], [3, 0, 0], [40]);
    const out = produceFamousLabels(state, makeCtx());
    expect(out.labels[0]!.worldEmMpc).toBeCloseTo(0.0125, 6);
  });
});
