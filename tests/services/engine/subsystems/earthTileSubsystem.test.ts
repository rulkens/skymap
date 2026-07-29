/**
 * Two things this subsystem owns that a stand-in device is enough to see: the
 * manifest validation in `derivePlannerParams`, and the stand-down that happens
 * when the engage rule goes false.
 *
 * The manifest validation is the one part of this subsystem that is neither GPU,
 * network nor clock, and the one that has to be a refusal rather than an
 * adaptation.
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
vi.mock('../../../../src/utils/network/fetchEarthTileBitmap', () => ({
  fetchEarthTileBitmap: vi.fn(),
}));

import type { EarthTileManifest } from '../../../../src/@types/scene/EarthTileManifest';
import type { EarthTilePlan } from '../../../../src/@types/scene/EarthTilePlan';
import { createEarthTileSubsystem } from '../../../../src/services/engine/subsystems/earthTileSubsystem';
import { fetchEarthTileManifest } from '../../../../src/utils/scene/fetchEarthTileManifest';
import { fetchEarthTileBitmap } from '../../../../src/utils/network/fetchEarthTileBitmap';
import {
  EARTH_TILE_BASE_LEVEL,
  EARTH_TILE_FADE_MS,
  EARTH_TILE_MIN_LEVEL,
  EARTH_TILE_PX,
} from '../../../../src/data/bodies/earthTileParams';

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

/**
 * Standing down when the camera pulls back out past the engage altitude.
 *
 * This is the half that a drive-site `if (plan.zWin > baseLevel)` cannot have:
 * engaging is something the caller does and disengaging is something that merely
 * stops happening, so the page table simply kept its last contents and the globe
 * stayed painted with ground from wherever the camera used to be, at full weight,
 * forever. The bug is invisible to every pure test in the feature — the planner
 * was right all along — so it has to be observed at the seam where the plan meets
 * the texture.
 *
 * A page-table upload is a `queue.writeTexture` and nothing else, which is why a
 * stand-in device recording its writes is enough: the plans go in as literals,
 * the two questions the fragment would ask (which window? what weight in each
 * cell?) come straight back out.
 */

const TILE = { kind: 'surface', z: EARTH_TILE_MIN_LEVEL, x: 0, y: 0 } as const;
const ENGAGED: EarthTilePlan = {
  zWin: EARTH_TILE_MIN_LEVEL,
  winX0: 0,
  winY0: 0,
  requests: [{ tile: TILE, screenPx: EARTH_TILE_PX }],
};
/** At the base level exactly: the density the whole-globe texture already
 *  carries, so there is nothing a tile could add. */
const DISENGAGED: EarthTilePlan = {
  zWin: EARTH_TILE_BASE_LEVEL,
  winX0: 0,
  winY0: 0,
  requests: [],
};

/**
 * A subsystem with the manifest landed, one tile resident in the atlas, and its
 * fade fully ramped — i.e. a page table that is genuinely painting ground, so
 * "the stand-down blanked it" is distinguishable from "it was blank anyway".
 * Returns the recorded `writeTexture` payloads alongside it.
 */
async function engagedSubsystem() {
  vi.mocked(fetchEarthTileManifest).mockResolvedValue(surfaceManifest(EARTH_TILE_PX));
  vi.mocked(fetchEarthTileBitmap).mockResolvedValue({
    close: () => {},
  } as unknown as ImageBitmap);

  const writes: Uint8Array[] = [];
  const device = {
    createTexture: () => ({ createView: () => ({}), destroy: () => {} }),
    queue: {
      // Copied, because the subsystem rebuilds the table into a fresh array each
      // time but the atlas upload path hands us someone else's buffer.
      writeTexture: (_target: unknown, data: Uint8Array) => writes.push(new Uint8Array(data)),
      copyExternalImageToTexture: () => {},
    },
  } as unknown as GPUDevice;

  const subsystem = createEarthTileSubsystem({ device, requestRender: () => {} });
  subsystem.plannerParams();
  await new Promise((resolve) => setTimeout(resolve, 0));

  // First engaged frame: allocates, enqueues the tile's fetch, uploads a table
  // that is still empty. Second, a full fade later: the tile has landed, so the
  // table it uploads has weight in it.
  subsystem.update({ plan: ENGAGED, nowMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  subsystem.update({ plan: ENGAGED, nowMs: EARTH_TILE_FADE_MS });

  return { subsystem, writes };
}

describe('earthTileSubsystem stand-down', () => {
  it('blanks the page table once when the camera pulls back out, and re-engages', async () => {
    const { subsystem, writes } = await engagedSubsystem();

    // The premise: something is actually being drawn through the page table.
    expect(subsystem.getUploadedWindow()).toEqual({
      zWin: ENGAGED.zWin,
      winX0: 0,
      winY0: 0,
    });
    expect(writes.at(-1)!.some((byte) => byte !== 0)).toBe(true);

    subsystem.update({ plan: DISENGAGED, nowMs: EARTH_TILE_FADE_MS + 16 });

    // The reported symptom, and the assertion that catches it on its own: no
    // window means the draw site packs the all-zero identity.
    expect(subsystem.getUploadedWindow()).toBeNull();
    expect(writes.at(-1)!.every((byte) => byte === 0)).toBe(true);

    // A transition, not a per-frame state — a camera parked just outside the
    // engage bracket must not re-upload 64 KB of zeroes every frame.
    const afterStandDown = writes.length;
    subsystem.update({ plan: DISENGAGED, nowMs: EARTH_TILE_FADE_MS + 32 });
    subsystem.update({ plan: DISENGAGED, nowMs: EARTH_TILE_FADE_MS + 48 });
    expect(writes.length).toBe(afterStandDown);

    // And coming back finds the atlas still there: one upload re-arms the
    // window, with no second allocation and no re-fetch.
    subsystem.update({ plan: ENGAGED, nowMs: EARTH_TILE_FADE_MS + 64 });
    expect(subsystem.getUploadedWindow()).toEqual({
      zWin: ENGAGED.zWin,
      winX0: 0,
      winY0: 0,
    });
    expect(writes.length).toBe(afterStandDown + 1);
    expect(writes.at(-1)!.some((byte) => byte !== 0)).toBe(true);
  });

  it('allocates nothing when a session never engages', async () => {
    vi.mocked(fetchEarthTileManifest).mockResolvedValue(surfaceManifest(EARTH_TILE_PX));
    let touched = false;
    const device = new Proxy({} as GPUDevice, {
      get: () => {
        touched = true;
        return () => {};
      },
    });

    const subsystem = createEarthTileSubsystem({ device, requestRender: () => {} });
    subsystem.plannerParams();
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let frame = 0; frame < 3; frame++) {
      subsystem.update({ plan: DISENGAGED, nowMs: frame * 16 });
    }

    // Not one property of the device read: no atlas, no page table, no upload.
    // 67 MB rides on this for every session that stays outside Earth's orbit.
    expect(touched).toBe(false);
    expect(subsystem.getTileResources()).toBeNull();
    expect(subsystem.getUploadedWindow()).toBeNull();
  });
});
