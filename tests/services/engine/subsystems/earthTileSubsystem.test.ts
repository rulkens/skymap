/**
 * The manifest validation in `derivePlannerParams` — the one part of this
 * subsystem that is neither GPU, network nor clock, and the one that has to be a
 * refusal rather than an adaptation.
 *
 * 512 is a property of the tile FORMAT: the fragment derives the page table's
 * column count from `zWin` alone (`cols = 1u << zWin`), which is the ladder's
 * `(512 << z) / tilePx` with the two cancelled, and nothing on the GPU side
 * reads `tilePx` at all. A bake at another edge is therefore unaddressable, not
 * merely unusual — silently adapting to it would resolve the same uv to a
 * different cell and put every cell in the window on the wrong ground, with no
 * error anywhere and a picture that still looks like Earth. Rejecting degrades
 * to base-only, which is the identity case.
 *
 * Two cases, because a `null` that is right for the wrong reason is worth
 * nothing: the accepted default has to still be accepted.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/utils/scene/fetchEarthTileManifest', () => ({
  fetchEarthTileManifest: vi.fn(),
}));

import type { EarthTileManifest } from '../../../../src/@types/scene/EarthTileManifest';
import { createEarthTileSubsystem } from '../../../../src/services/engine/subsystems/earthTileSubsystem';
import { fetchEarthTileManifest } from '../../../../src/utils/scene/fetchEarthTileManifest';
import { EARTH_TILE_MIN_LEVEL, EARTH_TILE_PX } from '../../../../src/data/bodies/earthTileParams';

/** A manifest describing a usable surface pyramid, with `tilePx` left to the
 *  caller — `undefined` standing in for a bake that omitted the field. */
function surfaceManifest(tilePx: number | undefined): EarthTileManifest {
  return {
    tilePx,
    levels: { surface: { min: EARTH_TILE_MIN_LEVEL, max: EARTH_TILE_MIN_LEVEL + 1 } },
    builtFrom: { surface: 'test-fixture' },
  } as unknown as EarthTileManifest;
}

/** Drive the subsystem to the point where the manifest has landed. Construction
 *  allocates nothing, so a stand-in device never gets touched. */
async function plannerParamsFor(manifest: EarthTileManifest) {
  vi.mocked(fetchEarthTileManifest).mockResolvedValue(manifest);
  const subsystem = createEarthTileSubsystem({
    device: {} as unknown as GPUDevice,
    requestRender: () => {},
  });
  // The first call is what starts the fetch, and it necessarily answers null.
  subsystem.plannerParams();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return subsystem.plannerParams();
}

describe('earthTileSubsystem manifest validation', () => {
  it('accepts a bake at the format tile edge, and one that omits the field', async () => {
    expect(await plannerParamsFor(surfaceManifest(EARTH_TILE_PX))).not.toBeNull();
    expect(await plannerParamsFor(surfaceManifest(undefined))).not.toBeNull();
  });

  it('refuses a bake cut at a different tile edge rather than adapting to it', async () => {
    expect(await plannerParamsFor(surfaceManifest(EARTH_TILE_PX / 2))).toBeNull();
    expect(await plannerParamsFor(surfaceManifest(EARTH_TILE_PX * 2))).toBeNull();
  });
});
