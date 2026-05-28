/**
 * hiResFamousSubsystem — LOD-3 per-frame planner for Famous-source galaxies.
 *
 * One rung above the textured-disk planner.  When a famous galaxy grows
 * past ~200 px of apparent diameter the curated 128 px atlas tile starts
 * to look soft, so we cut over to a 512²/1024² hi-res WebP held in a
 * small fixed-capacity `texture_2d_array` (see `hiResFamousTexture.ts`).
 * The crossfade is smooth across the 200 → 260 px band so the user
 * doesn't perceive the seam — the fragment shader does the blend; this
 * subsystem only owns the planner state.
 *
 * ### Why famous-only + no decimation
 *
 * The famous catalog is ~75 rows.  Decimation (the trick the LOD-1 and
 * LOD-2 planners use to amortise the catalog walk across frames) buys
 * nothing here — the full walk is 75 squared-distance compares.  Sticky
 * maps are also unnecessary because every row is visited every frame.
 *
 * ### Key choice: `String(idx)` rather than ra/dec
 *
 * The atlas planner keys on `galaxyCacheKey(ra, dec)` because its atlas
 * is shared across all sources.  The hi-res texture is famous-only and
 * the catalog row index is stable + unique within the array, so we
 * encode the local index as the key (`String(i)`).  Same identity, half
 * the string churn, no `cartesianToRaDec` per frame.
 *
 * ### Output contract
 *
 * Every gated galaxy gets a `byFamousIdx` entry.  Layers that are
 * allocated but whose bitmap hasn't landed yet emit
 * `hiResLayerIdx: -1, hiResCrossfadeAlpha: 0` — the consumer treats
 * that as "atlas tile only" until the upload completes, so there's no
 * pop at fetch-ready (the alpha ramp picks up where the atlas tile's
 * fade-in left off).
 */

import { Source } from '../../../data/sources';
import { cartesianToRaDec } from '../../../utils/math';
import { fetchGalaxyBitmap } from '../../../utils/network/galaxyImageFetcher';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { FetchGalaxyBitmapInput } from '../../../@types/loading/FetchGalaxyBitmapInput';
import type { HiResFamousTexture } from '../../../@types/rendering/HiResFamousTexture';
import type {
  HiResFamousFrameInput,
  HiResFamousFrameOutput,
  HiResFamousPerGalaxyState,
  HiResFamousSubsystem,
} from '../../../@types/engine/subsystems/HiResFamousSubsystem';

/**
 * Gate: a galaxy must be at least this big on screen before the planner
 * touches the hi-res array.  Re-exported so the texturedDiskSubsystem
 * fragment shader's atlas-tile fade-OUT band can stay in lockstep.
 */
export const HI_RES_TRIGGER_PX = 200;
/**
 * Crossfade band: above the gate, the alpha ramps from 0 → 1 across
 * `[HI_RES_TRIGGER_PX, HI_RES_TRIGGER_PX + HI_RES_FADE_BAND_PX]`.  60 px
 * gives the eye time to register the handoff at typical fly-in speeds
 * — narrower bands flash; wider bands let the soft 128 px atlas tile
 * dominate too long after it's started to pixel-double.
 */
export const HI_RES_FADE_BAND_PX = 60;

/**
 * Upper-bound clamp for the squared-distance early-out, same shape as
 * `texturedDiskSubsystem.ts:67` but tuned higher for famous galaxies.
 * Famous-catalog rows include several genuinely huge subjects (e.g.
 * NGC 6872 at ~250 kpc, Malin 1 at ~200 kpc disc) so the 200 kpc
 * default the other planners use would prematurely cull them at the
 * camera distances where the hi-res LOD actually fires.  500 kpc is
 * still well below the absurd-data regime while admitting every real
 * famous-galaxy diameter we ship.
 */
const MAX_PLAUSIBLE_DIAMETER_KPC = 500;

export type HiResFamousDeps = {
  readonly texture: HiResFamousTexture;
  readonly requestRender: () => void;
  /** For tests — defaults to fetchGalaxyBitmap. */
  readonly fetcher?: (args: FetchGalaxyBitmapInput) => Promise<ImageBitmap | null>;
  /** For tests — defaults to performance.now.  Unused by the planner
   *  today (no time-based fades live here) but kept on the deps so a
   *  future timing tweak doesn't require widening the contract. */
  readonly now?: () => number;
};

export function createHiResFamousSubsystem(deps: HiResFamousDeps): HiResFamousSubsystem {
  const { texture, requestRender } = deps;
  const fetcher = deps.fetcher ?? fetchGalaxyBitmap;

  // Track in-flight keys so `runFrame` doesn't re-enqueue a fetch every
  // frame for the same galaxy while the network call is still pending.
  // Atlas planner uses the queue's idempotency for this; we don't have a
  // shared queue (the hi-res image goes straight through `fetcher` and
  // `uploadBitmap`), so the bookkeeping lives here.
  const inFlight = new Set<string>();

  // Clear the planner's in-flight tracking when the texture evicts a
  // layer mid-flight.  Without this, a galaxy that re-enters the gate
  // after eviction would never re-enqueue because its key would still
  // sit in `inFlight` from the now-discarded fetch.
  texture.setEvictHandler((evictedKey) => {
    inFlight.delete(evictedKey);
  });

  // Per-frame output map.  Reused across frames to avoid allocating a
  // new Map (and its bucket array) on every runFrame — Map.clear() is
  // O(n) where n is the previous size; for the famous catalog n ≤ ~75
  // so this is negligible.  The wrapper object IS reallocated each
  // frame to keep the `lastOutput` reference identity sensible for
  // `===` comparisons in consumers.
  const byFamousIdx = new Map<number, HiResFamousPerGalaxyState>();

  let destroyed = false;
  let lastOutput: HiResFamousFrameOutput = { byFamousIdx };

  function runFrame(input: HiResFamousFrameInput): HiResFamousFrameOutput {
    if (destroyed) return lastOutput;

    const { cam, catalogs, visibleSourceMask, pxPerRad, famousMeta } = input;

    byFamousIdx.clear();

    // Visibility gate.  If the Famous source bit is clear, emit empty.
    if (((visibleSourceMask >> Source.Famous) & 1) === 0) {
      lastOutput = { byFamousIdx };
      return lastOutput;
    }

    const cloud = catalogs.get(Source.Famous);
    if (!cloud) {
      lastOutput = { byFamousIdx };
      return lastOutput;
    }

    // Squared-distance early-out bound, mirroring texturedDiskSubsystem.
    // Anything beyond this distance can't reach the trigger gate even at
    // the maximum plausible diameter — skip the trig.
    const dMpcMax = MAX_PLAUSIBLE_DIAMETER_KPC / 1000;
    const maxCamDistForVisibility = (dMpcMax * pxPerRad) / HI_RES_TRIGGER_PX;
    const maxCamDistSq = maxCamDistForVisibility * maxCamDistForVisibility;

    const cx = cam.position[0];
    const cy = cam.position[1];
    const cz = cam.position[2];

    const positions = cloud.positions;
    const count = cloud.count;
    const layerSide = texture.getLayerSide();

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const x = positions[i3 + 0]!;
      const y = positions[i3 + 1]!;
      const z = positions[i3 + 2]!;

      const dx = cx - x;
      const dy = cy - y;
      const dz = cz - z;
      const camDistSq = dx * dx + dy * dy + dz * dz;
      if (camDistSq <= 0 || camDistSq > maxCamDistSq) continue;

      const dKpcRow = cloud.diameterKpc[i]!;
      const dMpcRow = dKpcRow / 1000;
      const camDist = Math.sqrt(camDistSq);
      const px = (dMpcRow / camDist) * pxPerRad;

      if (px < HI_RES_TRIGGER_PX) continue;

      const key = String(i);

      // LRU bookkeeping: allocate on first sighting, touch on repeat.
      // `allocate` returns -1 if the array is full AND the caller is
      // less deserving than every resident; in that case we don't emit
      // either, since no layer is reserved for this galaxy.
      let layerIdx = texture.layerForKey(key);
      if (layerIdx === undefined) {
        layerIdx = texture.allocate(key, px);
        if (layerIdx < 0) continue;
      } else {
        texture.touch(key, px);
      }

      // Smoothstep crossfade across the [200, 260] band.  Clamp via
      // the algebra (the px < 200 case already `continue`d above; the
      // px > 260 case clamps t to 1 → smoothstep = 1).
      const t = Math.min(1, (px - HI_RES_TRIGGER_PX) / HI_RES_FADE_BAND_PX);
      const crossfadeAlpha = t * t * (3 - 2 * t);

      const loaded = texture.isLoaded(key);
      const failed = texture.isFailed(key);

      // Fetch dispatch.  Idempotent on in-flight keys (no double-fetch
      // if the planner sees the same galaxy on a subsequent frame
      // before the network call resolves).  Failed-flag-sticky so
      // permanent failures don't get retried every frame.
      if (!loaded && !failed && !inFlight.has(key)) {
        const ra_dec_for_fetch = cartesianToRaDec(x, y, z);
        const famousId = famousMeta[i]?.id;
        // Defensive: if the meta is missing or the entry has no id, we
        // can't construct a hi-res fetch URL.  Skip without marking
        // failed — the meta may simply not be loaded yet.
        if (!famousId) continue;
        inFlight.add(key);
        fetcher({
          ra: ra_dec_for_fetch[0],
          dec: ra_dec_for_fetch[1],
          famousId,
          fetchHiRes: true,
          hiResTargetDim: layerSide,
        }).then((bitmap) => {
          inFlight.delete(key);
          if (destroyed) {
            bitmap?.close?.();
            return;
          }
          // The layer might have been evicted while the fetch was in
          // flight.  `layerForKey` reflects the current bookkeeping.
          const currentLayer = texture.layerForKey(key);
          if (currentLayer === undefined) {
            bitmap?.close?.();
            return;
          }
          if (bitmap === null) {
            texture.markFailed(key);
            return;
          }
          // Upload into whatever layer the texture currently maps the
          // key to — `layerIdx` captured in the planner's closure could
          // be stale if eviction-and-reallocation churned it.
          texture.uploadBitmap(currentLayer, bitmap);
          bitmap.close?.();
          requestRender();
        }).catch(() => {
          inFlight.delete(key);
        });
        // First-frame-after-allocate: bitmap not yet loaded.  Emit the
        // sentinel so the consumer treats this as atlas-tile-only until
        // upload completes.
        byFamousIdx.set(i, { hiResLayerIdx: -1, hiResCrossfadeAlpha: 0 });
        continue;
      }

      if (!loaded) {
        // Either failed or still in-flight — atlas-tile-only.
        byFamousIdx.set(i, { hiResLayerIdx: -1, hiResCrossfadeAlpha: 0 });
        continue;
      }

      byFamousIdx.set(i, { hiResLayerIdx: layerIdx, hiResCrossfadeAlpha: crossfadeAlpha });
    }

    lastOutput = { byFamousIdx };
    return lastOutput;
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    // Drop the texture subscription so a dangling evict handler can't
    // mutate `inFlight` after we're gone.
    texture.setEvictHandler(undefined);
    inFlight.clear();
    byFamousIdx.clear();
    lastOutput = { byFamousIdx };
  }

  const subsystem: HiResFamousSubsystem = {
    runFrame,
    get lastOutput() {
      return lastOutput;
    },
    destroy,
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
