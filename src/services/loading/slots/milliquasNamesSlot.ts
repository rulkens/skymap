/**
 * milliquasNamesSlot — factory for the Milliquas per-tier names sidecar.
 *
 * Tier-aware (mirrors `mcpmSlot` rather than the tier-agnostic
 * `famousMetaSlot`).  On commit, the subscriber writes the payload into
 * `state.sources.milliquasNames` / `.milliquasClasses` so `buildGalaxyInfo`
 * can look up the display name for a Milliquas pick by its `localIdx`.
 *
 * ### Why no `commit` step
 *
 * Same shape as `famousMetaSlot` — there's nothing GPU-side to upload;
 * the payload is pure metadata consumed by the InfoCard at hover/click
 * time.  We write the result via the subscriber rather than the `commit`
 * arm to keep the slot uniform with `famousMetaSlot` (sidecars all use
 * the subscriber path).
 *
 * ### Why graceful-degrade on error
 *
 * Same UX contract as the famous sidecar: a 404 / network error
 * disables the enriched headline (InfoCard falls back to the
 * auto-generated `MQ J<RA><Dec>` IAU name) but keeps the engine
 * running.  Mirrored from `famousMetaSlot.ts` for consistency.
 *
 * ### Tier change
 *
 * The slot itself doesn't subscribe to tier changes — `engine.setTier`
 * is the orchestration point (just like for the Milliquas catalog bin
 * and the MCPM cube).  `setTier` calls `slot.load({ tier })` with the
 * new tier; the AssetSlot machinery handles cancellation of any
 * in-flight previous-tier load and the subscriber overwrites
 * `state.sources.milliquasNames` once the new tier's payload arrives.
 */

import { createAssetSlot } from '../AssetSlot';
import { milliquasNamesFetcher } from '../fetchers/milliquasNamesFetcher';
import type { MilliquasNamesPayload } from '../../../@types/loading/MilliquasNamesPayload';
import type { MilliquasNamesReq } from '../../../@types/loading/MilliquasNamesReq';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createMilliquasNamesSlot: SlotFactory<MilliquasNamesPayload, MilliquasNamesReq> = (
  state,
  _cb,
) => {
  const slot = createAssetSlot({
    name: 'milliquas-names',
    fetch: milliquasNamesFetcher,
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      state.sources.milliquasNames = s.value.names;
      state.sources.milliquasClasses = s.value.classes;
      // No requestRender — the InfoCard re-renders off React state when
      // the next pick fires.  Names landing late just means the very
      // first hover may see the generic IAU fallback; the second hover
      // gets the enriched name.  Matches the famous sidecar contract.
    }
    if (s.kind === 'error') {
      state.sources.milliquasNames = [];
      state.sources.milliquasClasses = [];
      console.warn('[engine] milliquas names sidecar failed to load:', s.error);
    }
  });
  state.assetSlots.milliquasNames = slot;
  return slot;
};
