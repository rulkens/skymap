/**
 * `starCutInputs` — what the frame reduces to for the GPU cut: frustum planes
 * per view, and the angular cull margin sized for
 * the widest view.
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

const RUNTIME = {
  renderer: {
    loadedCatalogs: vi.fn(() =>
      [{ source: Source.GaiaStars, catalog: {} as StarCatalog }][Symbol.iterator](),
    ),
  },
} as unknown as StarCatalogRuntime;

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
});
