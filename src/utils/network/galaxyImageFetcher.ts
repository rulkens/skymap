/**
 * Fetch a galaxy thumbnail for the given RA/Dec, returning an
 * SLOT_SIDE-square ImageBitmap suitable for atlas upload, or null if both
 * SDSS and DSS fail.
 *
 * Strategy:
 *   1. Request SDSS DR18 cutout.  About a third of the sky is in the SDSS
 *      footprint (mostly northern); galaxies there get a sharp colour
 *      JPEG with stars + galaxy structure visible.
 *   2. On 404 / non-2xx / non-image response, fall back to DSS POSS-II
 *      red plate (full-sky, lower quality, monochrome).
 *   3. Decode whichever we got into an ImageBitmap, resizing to
 *      SLOT_SIDE × SLOT_SIDE in one step.
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
import { SLOT_SIDE } from '../../services/gpu/resources/textureAtlas';
import type { FetchGalaxyBitmapInput } from '../../@types/loading/FetchGalaxyBitmapInput';

export async function fetchGalaxyBitmap(
  input: FetchGalaxyBitmapInput,
): Promise<ImageBitmap | null> {
  const { ra, dec, signal, famousId } = input;

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
        resizeWidth: SLOT_SIDE,
        resizeHeight: SLOT_SIDE,
      });
    } catch {
      return null;
    }
  }

  // Try SDSS first.  ~70% of galaxies in the visible cloud will be in the
  // SDSS footprint when SDSS is the loaded source; for non-SDSS surveys
  // (2MRS, GLADE) the SDSS attempt will fail more often, but it's cheap
  // and worth trying because SDSS images are sharper than DSS.
  const sdssBlob = await tryFetch(sdssThumbnailUrl(ra, dec, SLOT_SIDE), signal);
  if (sdssBlob) {
    try {
      return await createImageBitmap(sdssBlob, {
        resizeWidth: SLOT_SIDE,
        resizeHeight: SLOT_SIDE,
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
        resizeWidth: SLOT_SIDE,
        resizeHeight: SLOT_SIDE,
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
