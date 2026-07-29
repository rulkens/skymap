/**
 * Fetch a galaxy thumbnail for the given RA/Dec, returning a
 * GALAXY_ATLAS_SLOT_SIDE-square ImageBitmap suitable for atlas upload, or
 * null if both SDSS and DSS fail.
 *
 * Strategy:
 *   1. Request SDSS DR18 cutout.  About a third of the sky is in the SDSS
 *      footprint (mostly northern); galaxies there get a sharp colour
 *      JPEG with stars + galaxy structure visible.
 *   2. On 404 / non-2xx / non-image response, fall back to DSS POSS-II
 *      red plate (full-sky, lower quality, monochrome).
 *   3. Decode whichever we got into an ImageBitmap, resizing to
 *      GALAXY_ATLAS_SLOT_SIDE × GALAXY_ATLAS_SLOT_SIDE in one step.
 *
 * Why resize at decode time?  `createImageBitmap` accepts `resizeWidth` /
 * `resizeHeight` options — the browser resizes during decode, saving us a
 * canvas allocation per fetch and the extra blit it would need.
 *
 * SDSS uses pixel-size requests (the slot side, 128 px); DSS uses
 * arcminute field-of-view requests.  2 arcmin is roughly what SDSS gives
 * at its native 0.396 arcsec/pixel scale for a 128-pixel cutout, so the
 * two endpoints produce visually-similar fields without us needing to
 * compensate per galaxy.
 */

import { sdssThumbnailUrl, dssThumbnailUrl } from '../math';
import { GALAXY_ATLAS_SLOT_SIDE } from '../../services/engine/subsystems/galaxyAtlasSubsystem';
import { dataUrl } from '../../services/loading/fetchWithProgress';
import type { FetchGalaxyBitmapInput } from '../../@types/loading/FetchGalaxyBitmapInput';

// A `fetch()` promise that never settles leaks more than a browser socket:
// the thumbnail PriorityQueue (utils/concurrency/priorityQueue.ts) marks the
// key "in flight" until its fetcher promise resolves or rejects, and the
// engine's render-on-demand loop treats `inFlightCount() > 0` as "keep
// ticking, more work is coming." A cutout endpoint that stalls (SDSS
// ImgCutout or CDS hips2fits under load) therefore never settles, the
// in-flight entry never clears, and the RAF loop spins forever even though
// nothing is visibly happening. The queue itself can't fix this: it's generic over any
// fetcher and has no opinion on what "too long" means for a given task.
// Settlement is the fetcher's contract, so the deadline lives here. 30 s is
// generous — hips2fits legitimately takes 5-15 s under load — the goal is
// "eventually settles", not "fast".
const FETCH_DEADLINE_MS = 30_000;

export async function fetchGalaxyBitmap(
  input: FetchGalaxyBitmapInput,
): Promise<ImageBitmap | null> {
  const { ra, dec, famousId, fetchHiRes, hiResTargetDim } = input;

  // One deadline signal covers the whole call, composed with the caller's
  // optional cancellation signal when given. AbortSignal.timeout and
  // AbortSignal.any are both baseline-available in every WebGPU-capable
  // browser, so no fallback polyfill is needed.
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(FETCH_DEADLINE_MS)])
    : AbortSignal.timeout(FETCH_DEADLINE_MS);

  // ── Hi-res famous branch ────────────────────────────────────────────────
  //
  // The high-resolution famous-galaxy LOD ships large WebPs to R2 (not the
  // committed repo) so we route them through dataUrl(), which prepends the
  // VITE_DATA_BASE_URL + '/data/' the R2 sync uploads under. A missing
  // file here is EXPECTED — many famous galaxies have no `full.webp`
  // upstream — so we return null instead of falling through to SDSS/DSS;
  // the caller drops back to the curated 128 px atlas tile in that case.
  // Falling through would pollute the hi-res texture array with a DSS plate
  // at the wrong angular scale.
  if (fetchHiRes && famousId) {
    const url = dataUrl(`images/famous-hires/${famousId}.webp`);
    const blob = await tryFetch(url, signal);
    if (!blob) return null;
    const dim = hiResTargetDim ?? GALAXY_ATLAS_SLOT_SIDE;
    try {
      return await createImageBitmap(blob, {
        resizeWidth: dim,
        resizeHeight: dim,
      });
    } catch {
      return null;
    }
  }

  // ── Famous shortcut ──────────────────────────────────────────────────────
  //
  // Curated famous-galaxy WebPs live at /images/famous/<id>.webp and are
  // committed to the repo alongside the other static assets.  When a famousId
  // is supplied we skip the SDSS → DSS chain entirely: the curated image is
  // higher quality and guaranteed present (a missing file is a build error
  // caught before deploy, not a silent runtime 404 we should fall back from).
  if (famousId) {
    const url = `/images/famous/${famousId}.webp`;
    const blob = await tryFetch(url, signal);
    if (!blob) return null;
    try {
      return await createImageBitmap(blob, {
        resizeWidth: GALAXY_ATLAS_SLOT_SIDE,
        resizeHeight: GALAXY_ATLAS_SLOT_SIDE,
      });
    } catch {
      return null;
    }
  }

  // Try SDSS first.  ~70% of galaxies in the visible cloud will be in the
  // SDSS footprint when SDSS is the loaded source; for non-SDSS galaxy catalogs
  // (2MRS, GLADE) the SDSS attempt will fail more often, but it's cheap
  // and worth trying because SDSS images are sharper than DSS.
  const sdssBlob = await tryFetch(sdssThumbnailUrl(ra, dec, GALAXY_ATLAS_SLOT_SIDE), signal);
  if (sdssBlob) {
    try {
      return await createImageBitmap(sdssBlob, {
        resizeWidth: GALAXY_ATLAS_SLOT_SIDE,
        resizeHeight: GALAXY_ATLAS_SLOT_SIDE,
      });
    } catch {
      // fallthrough to DSS
    }
  }

  // DSS fallback (full-sky coverage).  2 arcmin ≈ matches the field SDSS
  // gives at scale=0.396 arcsec/pixel for a 128-pixel cutout.
  const dssBlob = await tryFetch(dssThumbnailUrl(ra, dec, 2), signal);
  if (dssBlob) {
    try {
      return await createImageBitmap(dssBlob, {
        resizeWidth: GALAXY_ATLAS_SLOT_SIDE,
        resizeHeight: GALAXY_ATLAS_SLOT_SIDE,
      });
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Returns a Blob on 2xx + image content-type, otherwise undefined.
 * Network errors and aborts collapse to undefined too — the caller
 * just falls through to the next source or returns null.
 */
async function tryFetch(url: string, signal?: AbortSignal): Promise<Blob | undefined> {
  try {
    const res = await fetch(url, { signal, mode: 'cors' });
    if (!res.ok) return undefined;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return undefined;
    return await res.blob();
  } catch {
    return undefined;
  }
}
