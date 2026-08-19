/**
 * Four things this subsystem owns that a stand-in device is enough to see: the
 * manifest validation in `derivePlannerParams`, the base level it derives from
 * the tier the whole-globe texture is bound at, the terminal frame of a tile's
 * load fade, and the stand-down that happens when the engage rule goes false.
 *
 * The base level is the one of the three that is invisible when it is wrong. The
 * three tiers bind three different whole-globe images — z2, z3 and z4 on the
 * ladder — so a base level that describes only the finest of them makes a
 * default `medium` session stand down a level early (soft pixels where the
 * screen wanted more) and hand a z3 base straight to a z5 tile, a 4x linear step
 * where one level of softening was the entire budget. No error, no 404, nothing
 * to see but slightly worse ground.
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
import type { Tier } from '../../../../src/@types/data/Tier';
import { createEarthTileSubsystem } from '../../../../src/services/engine/subsystems/earthTileSubsystem';
import { fetchEarthTileManifest } from '../../../../src/utils/scene/fetchEarthTileManifest';
import { fetchEarthTileBitmap } from '../../../../src/utils/network/fetchEarthTileBitmap';
import { earthBaseLevelForTier } from '../../../../src/utils/scene/earthBaseLevelForTier';
import { EARTH_TILE_FADE_MS, EARTH_TILE_PX } from '../../../../src/data/bodies/earthTileParams';

/** The shipped pyramid's reference tier: `large`, whose z4 whole-globe base the
 *  bake sits one level above. */
const BASE_LEVEL = earthBaseLevelForTier('large');
const MIN_TILE_LEVEL = BASE_LEVEL + 1;

/** A manifest describing a usable surface pyramid, with `tilePx` left to the
 *  caller — `undefined` standing in for a bake that omitted the field. */
const WORLD_BOUNDS = { west: -180, south: -90, east: 180, north: 90 };

function surfaceManifest(tilePx: number | undefined): EarthTileManifest {
  return {
    prefix: 'earth-tiles/v1',
    tilePx,
    levels: {
      surface: [
        {
          bounds: WORLD_BOUNDS,
          min: MIN_TILE_LEVEL,
          max: MIN_TILE_LEVEL + 1,
          builtFrom: { sourceId: 'test', attribution: 'test', vintage: 'test' },
        },
      ],
    },
  } as unknown as EarthTileManifest;
}

/** A subsystem with the manifest landed, on a device that answers nothing —
 *  enough for every question about params, since construction and a disengaged
 *  frame allocate nothing. */
async function subsystemWithManifest(manifest: EarthTileManifest) {
  vi.mocked(fetchEarthTileManifest).mockResolvedValue(manifest);
  const subsystem = createEarthTileSubsystem({
    device: {} as unknown as GPUDevice,
    requestRender: () => {},
  });
  // The first call is what starts the fetch, and it necessarily answers null.
  subsystem.plannerParams('large');
  await new Promise((resolve) => setTimeout(resolve, 0));
  return subsystem;
}

async function plannerParamsFor(manifest: EarthTileManifest, tier: Tier = 'large') {
  return (await subsystemWithManifest(manifest)).plannerParams(tier);
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

  it('skips a structurally-malformed band entry and derives params from the good ones', async () => {
    // A manifest a broken bake or a hand-edit could produce: one entry
    // missing `bounds` entirely alongside one well-formed entry. Skipping
    // the bad one — never throwing out of `refreshParams` — is the module's
    // stated stance for any manifest shape this build can't address.
    const manifest = surfaceManifest(EARTH_TILE_PX);
    const goodLevel = manifest.levels.surface![0]!;
    manifest.levels.surface = [{ ...goodLevel, bounds: undefined as never }, goodLevel];

    const params = await plannerParamsFor(manifest);

    expect(params).not.toBeNull();
    expect(params!.bands).toHaveLength(1);
    expect(params!.bands[0]!.max).toBe(goodLevel.max);
  });
});

describe('earthTileSubsystem base level', () => {
  it('reports a base one level coarser per tier step down, off the same manifest', async () => {
    // The tier has to reach `derivePlannerParams` for this to hold: a base level
    // computed from the `large` ceiling alone answers z4 for all three, which is
    // a promise of detail two of them never bound.
    const manifest = surfaceManifest(EARTH_TILE_PX);
    const large = await plannerParamsFor(manifest, 'large');
    const medium = await plannerParamsFor(manifest, 'medium');
    const small = await plannerParamsFor(manifest, 'small');
    expect(medium!.baseLevel).toBe(large!.baseLevel - 1);
    expect(small!.baseLevel).toBe(large!.baseLevel - 2);
  });

  it('re-derives the base level when the tier changes under one subsystem', async () => {
    // The params are memoised — one small object per session, not per frame — so
    // the memo has to be keyed on the tier. Cached without it, a tier swap would
    // keep planning against the previous session's base for the rest of the
    // session, with the manifest already in hand and nothing to re-fetch.
    const subsystem = await subsystemWithManifest(surfaceManifest(EARTH_TILE_PX));
    const before = subsystem.plannerParams('large')!.baseLevel;
    expect(subsystem.plannerParams('medium')!.baseLevel).toBe(before - 1);
    expect(subsystem.plannerParams('large')!.baseLevel).toBe(before);
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

const TILE = { kind: 'surface', z: MIN_TILE_LEVEL, x: 0, y: 0 } as const;
const ENGAGED: EarthTilePlan = {
  zWin: MIN_TILE_LEVEL,
  winX0: 0,
  winY0: 0,
  requests: [{ tile: TILE, screenPx: EARTH_TILE_PX }],
};
/** At the `large` tier's base level exactly: the density that whole-globe
 *  texture already carries, so there is nothing a tile could add — and one level
 *  MORE than a `medium` session's base carries, which is what the engage-gate
 *  test below turns on. */
const DISENGAGED: EarthTilePlan = {
  zWin: BASE_LEVEL,
  winX0: 0,
  winY0: 0,
  requests: [],
};

/** A device that records its page-table uploads and hands back the least it can
 *  for the atlas allocation. */
function recordingDevice(writes: Uint8Array[]): GPUDevice {
  return {
    createTexture: () => ({ createView: () => ({}), destroy: () => {} }),
    queue: {
      // Copied, because the subsystem rebuilds the table into a fresh array each
      // time but the atlas upload path hands us someone else's buffer.
      writeTexture: (_target: unknown, data: Uint8Array) => writes.push(new Uint8Array(data)),
      copyExternalImageToTexture: () => {},
    },
  } as unknown as GPUDevice;
}

/**
 * A subsystem with the manifest landed, one tile resident in the atlas, and its
 * load fade run all the way out — i.e. a page table that is genuinely painting
 * ground, so "the stand-down blanked it" is distinguishable from "it was blank
 * anyway". Returns the recorded `writeTexture` payloads alongside it.
 *
 * The frame in the MIDDLE of the fade is what makes the last frame a genuine
 * terminal one: it flushes the arrival's residency change, so by the frame the
 * ramp lands on, the fade's own record of what it uploaded is the only thing left
 * that can ask for the full-weight table.
 */
async function engagedSubsystem() {
  vi.mocked(fetchEarthTileManifest).mockResolvedValue(surfaceManifest(EARTH_TILE_PX));
  vi.mocked(fetchEarthTileBitmap).mockResolvedValue({
    close: () => {},
  } as unknown as ImageBitmap);

  const writes: Uint8Array[] = [];
  const subsystem = createEarthTileSubsystem({
    device: recordingDevice(writes),
    requestRender: () => {},
  });
  subsystem.plannerParams('large');
  await new Promise((resolve) => setTimeout(resolve, 0));

  // First engaged frame: allocates, enqueues the tile's fetch, uploads a table
  // that is still empty. The tile then lands, stamped with that frame's clock.
  subsystem.update({ plan: ENGAGED, nowMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  // Mid-fade, then the frame the fade lands on.
  subsystem.update({ plan: ENGAGED, nowMs: EARTH_TILE_FADE_MS / 2 });
  subsystem.update({ plan: ENGAGED, nowMs: EARTH_TILE_FADE_MS });

  return { subsystem, writes };
}

/**
 * Whether one frame of `plan` engages the virtual texture on a session bound at
 * `tier`. The atlas and the page table are allocated by the first ENGAGED frame
 * and by nothing else, so `getTileResources()` going non-null IS the gate's
 * answer.
 */
async function engagesAt(plan: EarthTilePlan, tier: Tier): Promise<boolean> {
  vi.mocked(fetchEarthTileManifest).mockResolvedValue(surfaceManifest(EARTH_TILE_PX));
  const subsystem = createEarthTileSubsystem({
    device: recordingDevice([]),
    requestRender: () => {},
  });
  subsystem.plannerParams(tier);
  await new Promise((resolve) => setTimeout(resolve, 0));
  subsystem.update({ plan, nowMs: 0 });
  return subsystem.getTileResources() !== null;
}

describe('earthTileSubsystem engage gate', () => {
  it('engages on the very plan a finer-tiered session stands down on', async () => {
    // One plan, settled exactly at the `large` tier's base level. That density is
    // already on screen for a session holding the 8192 base — nothing to add, so
    // stand down — and one level MORE than the 4096 base a default `medium`
    // session holds, so for that session the screen is asking for detail the base
    // does not carry and the tiles are the only thing that can supply it.
    //
    // This is the whole bug in one assertion: with the base level fixed at the
    // largest tier's, the second expectation held for both and the default
    // session showed z3 ground while the screen wanted z5.
    expect(await engagesAt(DISENGAGED, 'medium'), 'medium').toBe(true);
    expect(await engagesAt(DISENGAGED, 'large'), 'large').toBe(false);
  });
});

/**
 * The last frame of a load fade, which is the one frame the fade can skip.
 *
 * A rebuild condition asking the CLOCK whether a fade is in progress goes false on
 * the very frame the weights would have reached full: `loadFadeAlpha` saturates
 * when the elapsed time reaches the duration, "still fading" needs it to be less.
 * So the terminal table was never uploaded and the settled globe kept blending its
 * tiles at ~97% against the base — indefinitely, and nearly invisibly, which is
 * the part that matters: it makes every visual judgement of tile sharpness a
 * judgement of something slightly other than the shipped picture.
 */
describe('earthTileSubsystem load fade', () => {
  it('uploads the settled, full-weight table on the frame the fade lands', async () => {
    const { writes } = await engagedSubsystem();

    // A is the blend weight against the whole-globe base, so every fourth byte is
    // one cell's, and the resident tile's is the only non-zero one. Read out of the
    // uploaded bytes rather than off an internal flag: what the fragment will
    // actually blend with is the whole question.
    const weights = writes.at(-1)!.filter((_, at) => at % 4 === 3);
    expect(
      Math.max(...weights),
      'the last page table uploaded carries a weight short of 255, so a parked camera blends its tiles at less than full strength against the base forever',
    ).toBe(255);
  });
});

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
    subsystem.plannerParams('large');
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

  it('allocates nothing when the manifest 404s, even though the plan is engaged', async () => {
    // The day-one production case: R2 has no manifest yet, so the fetch
    // resolves null and `params` must stay null regardless of what the
    // camera is doing. Cleared first: neither mock resets its call history
    // between tests in this file, and both were driven by earlier cases above.
    vi.mocked(fetchEarthTileManifest).mockClear();
    vi.mocked(fetchEarthTileBitmap).mockClear();
    vi.mocked(fetchEarthTileManifest).mockResolvedValue(null);
    let touched = false;
    const device = new Proxy({} as GPUDevice, {
      get: () => {
        touched = true;
        return () => {};
      },
    });

    const subsystem = createEarthTileSubsystem({ device, requestRender: () => {} });
    expect(subsystem.plannerParams('large')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // A caller that ignored runFrame's `params !== null` gate has to be safe
    // anyway: engaged frames against a null-manifest session must still be inert.
    expect(subsystem.plannerParams('large')).toBeNull();
    for (let frame = 0; frame < 3; frame++) {
      subsystem.update({ plan: ENGAGED, nowMs: frame * 16 });
    }

    expect(touched).toBe(false);
    expect(subsystem.getTileResources()).toBeNull();
    expect(subsystem.getUploadedWindow()).toBeNull();
    expect(fetchEarthTileBitmap).not.toHaveBeenCalled();
    // The one property that actually regresses if this path breaks: a 404
    // must not re-arm and re-fetch on every subsequent frame.
    expect(fetchEarthTileManifest).toHaveBeenCalledTimes(1);
  });
});
