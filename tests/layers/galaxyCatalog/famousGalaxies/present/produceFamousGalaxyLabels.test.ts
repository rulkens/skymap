import { ZERO_FOCUS } from '../../../../../src/services/engine/subsystems/recedingFocusSubsystem';
import { describe, expect, it, vi } from 'vitest';
import type { FocusUniformsValue } from '../../../../../src/@types/rendering/FocusUniformsValue';
import { produceFamousGalaxyLabels } from '../../../../../src/layers/galaxyCatalog/famousGalaxies/present/produceFamousGalaxyLabels';
import { FAMOUS_LABEL_STYLE } from '../../../../../src/services/engine/presentation/famousLabelStyle';
import {
  packSelection,
  PICK_SENTINEL_OFFSET,
  unpackPick,
} from '../../../../../src/data/selectionEncoding';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { GalaxyCatalogRuntime } from '../../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import { catalogPickCodes } from '../../../../../src/utils/picking/catalogPickCodes';
import { GALAXY_CATALOG_SOURCE_ROWS } from '../../../../../src/layers/galaxyCatalog/sources/galaxyCatalogSourceRows';
import { testPickCode } from '../../../../support/testPickCode';
import type { GalaxyCatalog } from '../../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { FamousGalaxyName } from '../../../../../src/layers/galaxyCatalog/famousGalaxies/@types/FamousGalaxyName';
import type { Label2D } from '../../../../../src/@types/rendering/Label2D';

// Each case seeds its own famous rows; the table is mutated in place under the producer.
const famousNames = vi.hoisted((): FamousGalaxyName[] => []);
vi.mock(
  '../../../../../src/layers/galaxyCatalog/famousGalaxies/data/famousGalaxyNames.generated',
  () => ({ FAMOUS_GALAXY_NAMES: famousNames }),
);

const handed = (famousGalaxy: number) => ({ famousGalaxy });
const ONE = handed(1);

function makeState(
  opts: {
    focusedOnly?: boolean;
    focus?: object | null;
  } = {},
): EngineState {
  return {
    gpu: { fontAtlases: { metricsByFont: {} } },
    selection: { focus: opts.focus ?? null, select: null, hover: null },
    settings: { labels: { focusedOnly: opts.focusedOnly ?? false } },
  } as unknown as EngineState;
}

function makeCtx(over: { focusBlend?: number } = {}): FrameView {
  return {
    snapshot: { focusBlend: over.focusBlend ?? 0, nowMs: 0, focus: ZERO_FOCUS },
    drawCamPos: [0, 0, 0],
    canvasSize: { width: 1920, height: 1080 },
    drawPxPerRad: 1080 / (2 * Math.tan((60 * Math.PI) / 180 / 2)),
  } as unknown as FrameView;
}

const PX_PER_RAD = 1080 / (2 * Math.tan((30 * Math.PI) / 180));
const sizePxAt = (diameterKpc: number, distanceMpc: number) =>
  (diameterKpc / (distanceMpc * 1000)) * PX_PER_RAD;

/** Replaces the mocked names table with these rows. */
const seedNames = (...entries: Partial<FamousGalaxyName>[]): void => {
  famousNames.splice(0, famousNames.length, ...entries.map((e) => ({ id: 'x', names: [], ...e })));
};

const famousCatalog = (positions: number[], diameters: number[]): GalaxyCatalog =>
  ({
    count: diameters.length,
    positions: new Float32Array(positions),
    diameterKpc: new Float32Array(diameters),
  }) as unknown as GalaxyCatalog;

type FamousRuntime = Pick<GalaxyCatalogRuntime, 'catalogs' | 'pickCodes'>;

const PICK_CODES = catalogPickCodes(GALAXY_CATALOG_SOURCE_ROWS, testPickCode('galaxyCatalog'));

function seed(
  entries: Partial<FamousGalaxyName>[],
  positions: number[],
  diameters: number[],
): FamousRuntime {
  seedNames(...entries);
  return {
    catalogs: new Map([['famousGalaxy', famousCatalog(positions, diameters)]]),
    pickCodes: PICK_CODES,
  };
}

describe('produceFamousGalaxyLabels', () => {
  it('emits a lifted label + anchor line for a galaxy above the size gate', () => {
    const state = makeState();
    // 120 kpc galaxy at 5 Mpc → ~22.4 px apparent size: above the 6 px gate.
    const runtime = seed([{ id: 'm31', names: ['M31'] }], [5, 0, 0], [120]);
    const out = produceFamousGalaxyLabels(runtime)(state, makeCtx(), ONE);

    expect(out.labels.map((l) => l.id)).toEqual(['famous-m31']);
    const label = out.labels[0]!;
    expect(label.text).toBe('M31');
    expect(label.alignX).toBe('center');
    expect(label.alignY).toBe('baseline');
    expect(label.fadeAlpha).toBe(1);
    expect(label.declutterPriority).toBeCloseTo(sizePxAt(120, 5), 3);

    // Anchored at the galaxy; the label shader lifts the text by the galaxy's
    // apparent size and draws the line up from its centre.
    expect(label.worldPos).toEqual([5, 0, 0]);
    expect(label.lift!.radiusMpc).toBeCloseTo(0.06, 9);
    expect(label.lift!.leader).toEqual({
      widthPx: FAMOUS_LABEL_STYLE.pixelWidth,
      color: [...FAMOUS_LABEL_STYLE.lineColor],
      base: 'centre',
      gapPx: 0,
    });
  });

  it('skips a galaxy whose apparent size is below the threshold', () => {
    const state = makeState();
    const runtime = seed([{ id: 'far', names: ['Far'] }], [100000, 0, 0], [40]);
    const out = produceFamousGalaxyLabels(runtime)(state, makeCtx(), ONE);
    expect(out.labels).toEqual([]);
  });

  it('emits at the handed value, so a falling value draws the fade-out tail', () => {
    const state = makeState();
    const runtime = seed([{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const out = produceFamousGalaxyLabels(runtime)(state, makeCtx(), handed(0.5));
    expect(out.labels.map((l) => l.id)).toEqual(['famous-m31']);
    // Full distance-fade alpha here is 1, times the handed 0.5.
    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(0.5, 6);
  });

  it('emits nothing when the famous catalog is absent', () => {
    seedNames({ id: 'm31', names: ['M31'] });
    const noCatalogRuntime: FamousRuntime = { catalogs: new Map(), pickCodes: PICK_CODES };
    expect(produceFamousGalaxyLabels(noCatalogRuntime)(makeState(), makeCtx(), ONE).labels).toEqual(
      [],
    );
  });

  it('scales worldEmMpc with diameter (40 kpc anchors the category default)', () => {
    const state = makeState();
    // 40 kpc galaxy at 3 Mpc → ~12.5 px (full alpha); worldEm == reference.
    const runtime = seed([{ id: 'ref', names: ['Ref'] }], [3, 0, 0], [40]);
    const out = produceFamousGalaxyLabels(runtime)(state, makeCtx(), ONE);
    expect(out.labels[0]!.worldEmMpc).toBeCloseTo(0.0125, 6);
  });

  it('scales by the handed value exactly once', () => {
    // At full blend: the director recedes labels, so a producer that receded on its
    // own would land below 0.25.
    const atRest = makeState();
    const atRestRuntime = seed([{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const atRestAlpha = produceFamousGalaxyLabels(atRestRuntime)(atRest, makeCtx(), ONE).labels[0]!
      .fadeAlpha!;

    const focused = makeState();
    const focusedRuntime = seed([{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const handedAlpha = produceFamousGalaxyLabels(focusedRuntime)(
      focused,
      makeCtx({ focusBlend: 1 }),
      handed(0.25),
    ).labels[0]!.fadeAlpha!;

    expect(handedAlpha).toBeCloseTo(atRestAlpha * 0.25, 6);
  });

  it('focusedOnly mode: emits only the focused famous galaxy', () => {
    const state = makeState({
      focusedOnly: true,
      focus: { type: 'galaxyCatalog', source: 'famousGalaxy', index: 1 },
    });
    const runtime = seed(
      [
        { id: 'm31', names: ['M31'] },
        { id: 'm87', names: ['M87'] },
      ],
      [10, 0, 0, 10, 1, 0],
      [120, 120],
    );
    const out = produceFamousGalaxyLabels(runtime)(state, makeCtx(), ONE);
    expect(out.labels.map((l) => l.id)).toEqual(['famous-m87']);
    expect(out.labels[0]!.lift?.leader).toBeDefined();
  });

  it('focusedOnly mode: emits nothing when the focus is not a famous galaxy', () => {
    const cases = [
      null,
      { type: 'structure', id: 'cluster-virgo' },
      { type: 'milkyWay' },
      { type: 'galaxyCatalog', source: 'sdss', index: 0 },
    ];
    for (const focus of cases) {
      const state = makeState({ focusedOnly: true, focus });
      const runtime = seed([{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
      expect(produceFamousGalaxyLabels(runtime)(state, makeCtx(), ONE).labels).toEqual([]);
    }
  });

  it('caps a very close companion (e.g. the LMC) to the near-distance pixel ceiling', () => {
    // Inside the near band (< 0.1 Mpc) the ramp bottoms out at the 60 px near cap, not the
    // category's 150 px `maxPixelSize`: a fixed ceiling let the LMC/SMC tower over the view
    // from inside the Milky Way.
    const state = makeState();
    const runtime = seed([{ id: 'lmc', names: ['LMC'] }], [0.05, 0, 0], [10]);
    const out = produceFamousGalaxyLabels(runtime)(state, makeCtx(), ONE);
    expect(out.labels[0]!.maxPixelSize).toBe(60);
  });

  it("stamps each label with its catalog row's pick id, size-gate skips included", () => {
    // The point pick stamps `instance_index` — the CATALOG row. A label set
    // that skipped a row below the size gate and then numbered its own output
    // would resolve every later label to the previous galaxy.
    const state = makeState();
    const runtime = seed(
      [{ id: 'a' }, { id: 'tiny' }, { id: 'c' }],
      [5, 0, 0, 5, 0, 0, 5, 0, 0],
      [120, 0.001, 120],
    );
    const labels = produceFamousGalaxyLabels(runtime)(state, makeCtx(), ONE).labels;
    expect(labels.map((l) => l.id)).toEqual(['famous-a', 'famous-c']);
    for (const label of labels) {
      const pick = unpackPick(label.pickId!)!;
      expect(pick.sourceCode).toBe(PICK_CODES.pickCodeOf('famousGalaxy'));
      expect(famousNames[pick.localIdx]!.id).toBe(label.id.replace('famous-', ''));
    }
  });

  it('outside the focused sphere a label draws but carries no pick; inside and at rest it keeps it', () => {
    const runtime = seed(
      [
        { id: 'in', names: ['In'] },
        { id: 'out', names: ['Out'] },
      ],
      [5, 0, 0, 5, 3, 0],
      [120, 120],
    );
    const state = makeState();
    const focus: FocusUniformsValue = {
      center: [5, 0, 0],
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0.5,
      blend: 1,
    };
    const ctx = makeCtx();
    const focused = { ...ctx, snapshot: { ...ctx.snapshot, focus } } as FrameView;
    const pickOf = (labels: readonly Label2D[], id: string) =>
      labels.find((l) => l.id === id)!.pickId;

    const rest = produceFamousGalaxyLabels(runtime)(state, ctx, ONE).labels;
    expect(pickOf(rest, 'famous-out')).toBeDefined();

    const under = produceFamousGalaxyLabels(runtime)(state, focused, ONE).labels;
    expect(pickOf(under, 'famous-in')).toBeDefined();
    expect(pickOf(under, 'famous-out')).toBeUndefined();
    const out = under.find((l) => l.id === 'famous-out')!;
    expect(out.fadeAlpha).toBeGreaterThan(0);
    expect(out.subjectId).toBe(
      packSelection(PICK_CODES.pickCodeOf('famousGalaxy'), 1 + PICK_SENTINEL_OFFSET),
    );
  });
});
