/**
 * planSurfaceTiles — the tile planner reads the rig's views, not the canvas
 * alone, and votes awake on frames where nothing can engage yet.
 */

import { describe, expect, it, vi } from 'vitest';

import { planSurfaceTiles } from '../../../../../src/services/engine/frame/surfaceTilePlanner/planSurfaceTiles';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/data/rendering/foregroundMaxDistance';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';
import { frameViewsAt } from '../../../../helpers/frame/frameViewsAt';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { SurfaceTileSubsystem } from '../../../../../src/@types/engine/subsystems/SurfaceTileSubsystem';
import type { SurfaceCutTile } from '../../../../../src/@types/scene/SurfaceCutTile';

const CUT: readonly SurfaceCutTile[] = [{ marker: 'cut' } as unknown as SurfaceCutTile];

vi.mock('../../../../../src/utils/surfaceTiles/cutSurfaceTiles', () => ({
  cutSurfaceTiles: () => ({ cut: CUT, requests: [] }),
}));

const EARTH = deriveBodyStates(CONST_J2000).get(asSceneBodyId('earth'))!.positionMpc;
const COMMITTED_TIER = () => 'small' as const;

/** Three Earth radii out, looking at Earth (`seesEarth`) or straight away from it. */
function makeView(seesEarth: boolean, distanceMpc = FOREGROUND_MAX_DISTANCE_MPC / 2): FrameView {
  const d = 3 * 6.371e6 * SCALE_UNITS.M_TO_MPC;
  return frameViewsAt({
    eyeMpc: [EARTH[0] + d, EARTH[1], EARTH[2]],
    forward: seesEarth ? [-1, 0, 0] : [1, 0, 0],
    distanceMpc,
  })[0]!;
}

function makeTiles(animating: boolean) {
  const tiles = {
    plannerParams: vi.fn(() => ({})),
    update: vi.fn(),
    release: vi.fn(),
    residentSlot: vi.fn(),
    engagedBodyId: vi.fn(() => null),
    isAnimating: vi.fn(() => animating),
  };
  return { tiles, subsystem: tiles as unknown as SurfaceTileSubsystem };
}

describe('planSurfaceTiles', () => {
  it('engages a tiling body seen only by a later view', () => {
    const { tiles, subsystem } = makeTiles(false);
    const result = planSurfaceTiles(subsystem, [makeView(false), makeView(true)], COMMITTED_TIER);
    expect(result.value).toBe(CUT);
    expect(tiles.update).toHaveBeenCalledTimes(1);
    expect(tiles.update.mock.calls[0]![0].bodyId).toBe('earth');
  });

  it('votes awake while the manifest loads, even disengaged', () => {
    const { tiles, subsystem } = makeTiles(true);
    const result = planSurfaceTiles(subsystem, [makeView(false), makeView(false)], COMMITTED_TIER);
    expect(result.awake).toBe(true);
    expect(result.value).toEqual([]);
    expect(tiles.update).not.toHaveBeenCalled();
  });

  it('plans nothing beyond the foreground distance', () => {
    const { tiles, subsystem } = makeTiles(false);
    const far = makeView(true, FOREGROUND_MAX_DISTANCE_MPC);
    expect(planSurfaceTiles(subsystem, [far], COMMITTED_TIER).value).toEqual([]);
    expect(tiles.update).not.toHaveBeenCalled();
  });

  it('plans nothing while the engaged body has no pose', () => {
    const { tiles, subsystem } = makeTiles(false);
    const poseless = { ...makeView(true), bodyPose: () => null };
    expect(planSurfaceTiles(subsystem, [poseless], COMMITTED_TIER).value).toEqual([]);
    expect(tiles.update).not.toHaveBeenCalled();
  });
});
