/**
 * famousMetaSlot — factory for the famous-galaxy sidecar pair.
 *
 * The two famous-galaxy JSON sidecars (`famous_meta.json` +
 * `famous_xrefs.json`) flow through one combined slot — the fetcher
 * pulls them in parallel and returns a `{ meta, xrefs }` payload.
 *
 * No `commit` step: there's nothing GPU-side to upload — the payload is
 * pure metadata consumed by the InfoCard via `state.sources.famousMeta`
 * / `state.sources.famousXrefs`.  The subscriber writes both fields and
 * wakes one frame so the famous-galaxy thumbnails referenced by the
 * cross-match xrefs become enqueueable from the per-frame loop without
 * the user having to nudge the camera.
 *
 * **Graceful degradation on error.**  The old `loadFamousSidecars`
 * returned empty values when either file 404'd; the new fetcher throws
 * on HTTP failure (so the retry policy distinguishes "really gone" from
 * "transient flake"), and the slot subscriber maps `kind: 'error'` →
 * "feature off" by writing empty `meta`/`xrefs`.  Net effect for the
 * user is identical to the pre-slot behaviour: famous galaxies render
 * without enriched InfoCard text, but the engine keeps running.
 *
 * Pre-H4 the mint block lived inline in `wireSlots.ts`; extracted here
 * as part of the slot-factory split (2026-05-11 audit).
 */

import { createAssetSlot } from '../AssetSlot';
import { famousMetaFetcher } from '../fetchers/famousMetaFetcher';
import type { FamousPayload } from '../fetchers/famousMetaFetcher';
import type { SlotFactory } from './types';

export const createFamousMetaSlot: SlotFactory<FamousPayload, void> = (state, _cb) => {
  const slot = createAssetSlot({
    name: 'famous-meta',
    fetch: famousMetaFetcher,
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      state.sources.famousMeta = s.value.meta;
      // GLADE local indices in the sidecar JSON now match the on-disk
      // binary directly — the cloudLoader no longer post-decodes
      // GLADE through a far-distance decimator (the data-tier system
      // owns point-count budgeting via its absolute-magnitude cut at
      // build time, which is a more principled rule and operates
      // BEFORE the binary is written, so xref indices stay valid).
      state.sources.famousXrefs = s.value.xrefs;
      state.subsystems.scheduler.requestRender();
    }
    if (s.kind === 'error') {
      // Match the old "absent file = feature off" behaviour exactly:
      // empty meta/xrefs disable the enriched InfoCard text but keep
      // the engine functional.  Defensive — these fields default to
      // `[]` / `{}` already, but writing them again here is explicit
      // about the contract.
      state.sources.famousMeta = [];
      state.sources.famousXrefs = {};
      console.warn('[engine] famous sidecars failed to load:', s.error);
    }
  });
  state.assetSlots.famousMeta = slot;
  return slot;
};
