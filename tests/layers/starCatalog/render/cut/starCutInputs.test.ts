/**
 * `starCutInputs` — what the frame reduces to for the GPU cut: frustum planes
 * per view, the angular cull margin sized for the widest view, and each
 * source's budget at the tier its catalog was committed at.
 */
import { describe, it, expect, vi } from 'vitest';

import { starCutInputs } from '../../../../../src/layers/starCatalog/render/cut/starCutInputs';
import { FLOATS_PER_VIEW } from '../../../../../src/layers/starCatalog/render/starCutLayout';
import { STAR_PICK_MIN_RADIUS_PX } from '../../../../../src/data/starCullSlack';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { Source } from '../../../../../src/data/source';
import { makeSlab } from '../../../../fixtures/makeSlab';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { StarCatalogRuntime } from '../../../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { StarCatalogSettings } from '../../../../../src/@types/settings/StarCatalogSettings';
import type { StarCatalog } from '../../../../../src/@types/data/starCatalog/StarCatalog';
import type { Tier } from '../../../../../src/@types/data/Tier';

// Distinct per tier so a test can tell which tier's budget the cut read.
vi.mock('../../../../../src/layers/starCatalog/sources/gaia-stars', async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import('../../../../../src/layers/starCatalog/sources/gaia-stars')
    >();
  return {
    GAIA_STARS_ENTRY: {
      ...mod.GAIA_STARS_ENTRY,
      budgets: {
        small: { drawBudget: 100 },
        medium: { drawBudget: 200 },
        large: { drawBudget: 300 },
      },
    },
  };
});

function runtime(committedTier: Tier, requestedTier: Tier = committedTier): StarCatalogRuntime {
  const slot = {
    committed: () => ({ kind: 'ready', req: { source: Source.GaiaStars, tier: committedTier } }),
    lastRequest: () => ({ source: Source.GaiaStars, tier: requestedTier }),
  };
  return {
    renderer: {
      loadedCatalogs: vi.fn(() =>
        [{ source: Source.GaiaStars, catalog: {} as StarCatalog }][Symbol.iterator](),
      ),
    },
    catalogs: new Map([[Source.GaiaStars, slot]]),
  } as unknown as StarCatalogRuntime;
}

const RUNTIME = runtime('medium');

const SETTINGS = {
  enabled: true,
  sizePx: 2.5,
  brightness: 1,
  refineThreshold: 0.05,
  glowOverlap: 1,
  aggregateIntensityCap: 0.06,
  exposureNearX: 1,
  exposureMidX: 1,
  exposureFarX: 1,
  items: { gaiaStars: { enabled: true, labelEnabled: false } },
} as unknown as StarCatalogSettings;

// 1000 pc: inside Gaia's crossfade band.
const EYE = [1000 * SCALE_UNITS.PC_TO_MPC, 0, 0] as const;

function view(pxPerRad: number): FrameView {
  return {
    snapshot: { nowMs: 0 },
    drawCamPos: EYE,
    drawPxPerRad: pxPerRad,
    slabs: [makeSlab()],
  } as unknown as FrameView;
}

describe('starCutInputs', () => {
  it('writes six planes per view', () => {
    const inputs = starCutInputs(RUNTIME, SETTINGS, [view(600), view(600)]);
    expect(inputs!.cut.planes).toHaveLength(2 * FLOATS_PER_VIEW);
  });

  it('sizes the leaf margin for the widest view (fewest pixels per radian)', () => {
    const inputs = starCutInputs(RUNTIME, SETTINGS, [view(600), view(300)]);
    expect(inputs!.cut.leafMarginRad).toBeCloseTo(STAR_PICK_MIN_RADIUS_PX / 300, 12);
  });

  it('the cut reads the budget of the tier its catalog was committed at', () => {
    // Mid-reload: the slot still holds the small catalog while large is in flight.
    const inputs = starCutInputs(runtime('small', 'large'), SETTINGS, [view(600)]);
    expect(inputs!.cut.sources).toEqual([
      expect.objectContaining({ source: Source.GaiaStars, drawBudget: 100 }),
    ]);
  });
});
