/**
 * Curator UI state — useReducer pattern.
 *
 * Single connected state blob, action-typed reducer.  See state.test.ts
 * for the spec the reducer implements (especially the dirty-state
 * transitions, which mirror the spec's "Process flow + preview
 * behaviour" section).
 *
 * Why a single flat blob rather than separate useState calls?  The
 * dirty flags depend on action ordering across multiple slices (e.g.
 * markProcessed touches crop, starnet, AND alpha simultaneously), so
 * keeping everything in one reducer makes the transitions atomic and
 * testable without mounting a component.
 */
import { resetCrop, type Crop } from './cropMath';
import type { GalaxyListEntry } from './api';

export type StarnetParams = { stride: number; upsample: boolean };
export type AlphaParams = { blackPoint: number; whitePoint: number; gamma: number };
export type MetadataParams = { sourceUrl: string; license: string; author: string };

export type DirtyFlags = {
  crop: boolean;
  starnet: boolean;
  alpha: boolean;
};

export type State = {
  galaxies: GalaxyListEntry[];
  activeId: string | undefined;
  tmpId: string | undefined;
  source: { width: number; height: number; previewUrl: string } | undefined;
  crop: Crop | undefined;
  starnet: StarnetParams;
  alpha: AlphaParams;
  metadata: MetadataParams;
  previews: { starless?: string; alpha?: string };
  dirty: DirtyFlags;
  processedOnce: boolean;
};

export const initialState: State = {
  galaxies: [],
  activeId: undefined,
  tmpId: undefined,
  source: undefined,
  crop: undefined,
  starnet: { stride: 256, upsample: false },
  // Default alpha parameters tuned for typical astrophotography: a modest
  // black-point lift (8) to suppress sky background noise, full white
  // point (255) to preserve highlights, gentle gamma (0.7) to bring up
  // faint outer structure without blowing the core.
  alpha: { blackPoint: 8, whitePoint: 255, gamma: 0.7 },
  metadata: { sourceUrl: '', license: '', author: '' },
  previews: {},
  dirty: { crop: false, starnet: false, alpha: false },
  processedOnce: false,
};

export type Action =
  | { type: 'setGalaxies'; galaxies: GalaxyListEntry[] }
  | { type: 'selectGalaxy'; id: string }
  | { type: 'setSource'; tmpId: string; width: number; height: number; previewUrl: string }
  | { type: 'setCrop'; crop: Crop }
  | { type: 'setStarnet'; starnet: StarnetParams }
  | { type: 'setAlpha'; alpha: AlphaParams }
  | { type: 'setMetadata'; metadata: MetadataParams }
  | { type: 'setPreviews'; starless?: string; alpha?: string }
  | { type: 'markProcessed' }
  | { type: 'markCuratedById'; id: string };

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'setGalaxies':
      return { ...s, galaxies: a.galaxies };

    case 'selectGalaxy':
      // Switching galaxies wipes the entire session: no tmpId, no source
      // image, no crop, no previews, and processedOnce resets so the
      // Export button goes dark until the new galaxy is processed.
      return {
        ...s,
        activeId: a.id,
        tmpId: undefined,
        source: undefined,
        crop: undefined,
        previews: {},
        processedOnce: false,
        dirty: { crop: false, starnet: false, alpha: false },
      };

    case 'setSource': {
      // A new source image lands: compute the default crop from the image
      // dimensions (square, 80% of the shorter axis, centred), then mark
      // crop dirty so the first Process call is always triggered.  Starnet
      // and alpha dirty flags start clean — they haven't changed from their
      // stored values; only the crop is "new" relative to this image.
      const crop = resetCrop({ width: a.width, height: a.height });
      return {
        ...s,
        tmpId: a.tmpId,
        source: { width: a.width, height: a.height, previewUrl: a.previewUrl },
        crop,
        dirty: { crop: true, starnet: false, alpha: false },
        previews: {},
        processedOnce: false,
      };
    }

    case 'setCrop':
      // Changing the crop invalidates any processed starless preview — the
      // server will need to re-crop + re-starnet.  We do NOT reset
      // processedOnce here: the Export button stays enabled until the user
      // explicitly clicks Process, so they can see the old previews while
      // they refine the crop.
      return { ...s, crop: a.crop, dirty: { ...s.dirty, crop: true } };

    case 'setStarnet':
      // New stride or upsample flag → need full re-Process.
      return { ...s, starnet: a.starnet, dirty: { ...s.dirty, starnet: true } };

    case 'setAlpha':
      // Alpha slider changes only require the cheap /api/process/alpha-only
      // round-trip, not a full re-starnet.  Marking alpha dirty (but NOT
      // crop/starnet) lets the UI distinguish "needs re-Process" vs
      // "needs alpha-only re-render".
      return { ...s, alpha: a.alpha, dirty: { ...s.dirty, alpha: true } };

    case 'setMetadata':
      return { ...s, metadata: a.metadata };

    case 'setPreviews':
      // Merge incoming preview URLs: undefined means "unchanged".  This
      // lets /api/process set both starless+alpha at once, while
      // /api/process/alpha-only only updates alpha without blowing away
      // the cached starless URL.
      return {
        ...s,
        previews: {
          starless: a.starless ?? s.previews.starless,
          alpha: a.alpha ?? s.previews.alpha,
        },
      };

    case 'markProcessed':
      // A successful /api/process response clears crop AND starnet dirty
      // flags — those are now reflected in the server-side cached starless.
      // Alpha dirty is left alone because we haven't run alpha-only yet;
      // the caller dispatches setAlpha + markProcessed only after BOTH
      // server round-trips have completed.
      return {
        ...s,
        processedOnce: true,
        dirty: { crop: false, starnet: false, alpha: s.dirty.alpha },
      };

    case 'markCuratedById':
      return {
        ...s,
        galaxies: s.galaxies.map((g) => (g.id === a.id ? { ...g, curated: true } : g)),
      };
  }
}

/**
 * Derived: can the user click Export right now?  Requires all three
 * pre-conditions:
 *  - at least one Process has succeeded with the current crop+starnet
 *  - crop is not dirty (would require re-Process)
 *  - starnet is not dirty (would require re-Process)
 *  - all three metadata fields are non-empty
 *
 * Alpha being dirty is fine — the alpha-only path keeps the cached
 * starless valid; export re-runs alpha at full resolution.
 *
 * Why a standalone function instead of inlining in the component?
 * Testability: the reducer test can call canExport(state) without
 * mounting React, keeping the coverage of the gate logic purely in
 * the unit-test layer.
 */
export function canExport(s: State): boolean {
  if (!s.processedOnce) return false;
  if (s.dirty.crop || s.dirty.starnet) return false;
  if (s.metadata.sourceUrl.length === 0) return false;
  if (s.metadata.license.length === 0) return false;
  if (s.metadata.author.length === 0) return false;
  // tmpId is the server-side session key; its presence confirms that a
  // source image has been fetched and is still live.  activeId is NOT
  // checked here — the test scenario (and real usage) can have a tmpId
  // without an activeId when the user uploads a custom image rather than
  // selecting from the galaxy list.
  if (s.tmpId === undefined) return false;
  return true;
}
