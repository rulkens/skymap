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
import type { RecipeDisk } from '../plugin/recipe';

export type StarnetParams = { stride: number; upsample: boolean };
export type AlphaParams = { blackPoint: number; whitePoint: number; gamma: number };
export type MetadataParams = { sourceUrl: string; license: string; author: string };

export type DirtyFlags = {
  crop: boolean;
  starnet: boolean;
  alpha: boolean;
  // A disk change (notably toggling deproject) changes the exported webp, so it
  // gates re-Process exactly like crop does — otherwise a disk edit after a
  // Process would ship a stale, un-deprojected image on the next Export.
  disk: boolean;
};

export type State = {
  galaxies: GalaxyListEntry[];
  activeId: string | undefined;
  tmpId: string | undefined;
  source: { width: number; height: number; previewUrl: string } | undefined;
  crop: Crop | undefined;
  // The as-shot square crop, stashed when deproject is first turned on.  A
  // deprojected crop is a non-square rectangle derived from the disk
  // geometry; remembering the user's prior square lets toggling deproject
  // back off restore it rather than snapping to a fresh reset.  undefined
  // when no deproject crop is active.
  savedSquareCrop: Crop | undefined;
  // Source-px disk geometry annotation; undefined = not drawn for this galaxy.
  disk: RecipeDisk | undefined;
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
  savedSquareCrop: undefined,
  disk: undefined,
  starnet: { stride: 256, upsample: false },
  // Default alpha parameters tuned for typical astrophotography: a modest
  // black-point lift (8) to suppress sky background noise, full white
  // point (255) to preserve highlights, gentle gamma (0.7) to bring up
  // faint outer structure without blowing the core.
  alpha: { blackPoint: 8, whitePoint: 255, gamma: 0.7 },
  metadata: { sourceUrl: '', license: '', author: '' },
  previews: {},
  dirty: { crop: false, starnet: false, alpha: false, disk: false },
  processedOnce: false,
};

export type Action =
  | { type: 'setGalaxies'; galaxies: GalaxyListEntry[] }
  | { type: 'selectGalaxy'; id: string }
  | { type: 'setSource'; tmpId: string; width: number; height: number; previewUrl: string }
  | { type: 'setCrop'; crop: Crop }
  | { type: 'setDeprojectCrop'; crop: Crop }
  | { type: 'restoreSquareCrop' }
  | { type: 'setDisk'; disk: RecipeDisk }
  | { type: 'clearDisk' }
  | { type: 'setStarnet'; starnet: StarnetParams }
  | { type: 'setAlpha'; alpha: AlphaParams }
  | { type: 'setMetadata'; metadata: MetadataParams }
  | { type: 'setPreviews'; starless?: string; alpha?: string }
  | { type: 'markProcessed' }
  | { type: 'markCuratedById'; id: string; hasDisk: boolean; diskDeproject: boolean | undefined };

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'setGalaxies':
      return { ...s, galaxies: a.galaxies };

    case 'selectGalaxy':
      // Switching galaxies wipes the entire session — including sliders
      // and the attribution form — so a fresh click on an uncurated
      // galaxy presents an empty editor.  The resume flow (in App.tsx)
      // re-applies the recipe values for curated galaxies AFTER this
      // reset, so curated entries still hydrate correctly.
      return {
        ...s,
        activeId: a.id,
        tmpId: undefined,
        source: undefined,
        crop: undefined,
        savedSquareCrop: undefined,
        disk: undefined,
        previews: {},
        processedOnce: false,
        dirty: { crop: false, starnet: false, alpha: false, disk: false },
        starnet: initialState.starnet,
        alpha: initialState.alpha,
        metadata: initialState.metadata,
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
        dirty: { crop: true, starnet: false, alpha: false, disk: false },
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

    case 'setDeprojectCrop':
      // A deproject-derived rectangular crop replaces the active crop.  On the
      // first transition (no saved square yet) we stash the current crop so
      // toggling deproject off later restores the user's as-shot square rather
      // than a fresh reset.  Re-deriving while already deprojected (margin /
      // axisRatio / paDeg tweaks) keeps the original square untouched.
      // Deproject crop changes re-bake the webp, so mark crop dirty.
      return {
        ...s,
        crop: a.crop,
        savedSquareCrop: s.savedSquareCrop ?? s.crop,
        dirty: { ...s.dirty, crop: true },
      };

    case 'restoreSquareCrop':
      // Toggling deproject off: restore the stashed as-shot square (falling
      // back to the current crop if nothing was saved) and clear the slot.
      // Still a crop change, so re-Process is required.
      return {
        ...s,
        crop: s.savedSquareCrop ?? s.crop,
        savedSquareCrop: undefined,
        dirty: { ...s.dirty, crop: true },
      };

    case 'setDisk':
      // Disk geometry feeds the derived calibration and, when deproject is on,
      // the baked webp.  Mark disk dirty so a subsequent Commit re-Processes.
      return { ...s, disk: a.disk, dirty: { ...s.dirty, disk: true } };

    case 'clearDisk':
      // Removing the disk also changes the eventual output (no deproject, no
      // calibration), so it dirties just like setting one.
      return { ...s, disk: undefined, dirty: { ...s.dirty, disk: true } };

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
        dirty: { crop: false, starnet: false, alpha: s.dirty.alpha, disk: false },
      };

    case 'markCuratedById':
      // A commit also writes the disk into the galaxy's recipe, which is what
      // the server reads to derive the list's hasDisk/diskDeproject flags.  We
      // mirror that locally so the disk badge appears immediately instead of
      // only after a page refresh re-fetches /api/galaxies.
      return {
        ...s,
        galaxies: s.galaxies.map((g) =>
          g.id === a.id
            ? { ...g, curated: true, hasDisk: a.hasDisk, diskDeproject: a.diskDeproject }
            : g,
        ),
      };
  }
}

/**
 * Derived: can the user click Commit right now?  Requires:
 *  - a source image is loaded (tmpId present)
 *  - all three metadata fields are non-empty
 *
 * The Commit action runs process (if dirty) → export → rebuild famous.bin
 * in sequence, so "processedOnce" and "nothing dirty" aren't pre-conditions
 * — the commit handler re-processes when it needs to.
 *
 * Why a standalone function instead of inlining in the component?
 * Testability: the reducer test can call canCommit(state) without
 * mounting React.
 */
export function canCommit(s: State): boolean {
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
