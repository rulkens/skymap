/**
 * constellationsSlot — factory for the true-3D constellation stick-figure layer.
 *
 * Carries the decoded `ConstellationsArtifact` (the asterism line segments +
 * label anchors, positions in parsecs) through the standard asset-slot
 * machinery. A singleton overlay, demand-loaded on the layer's master gate
 * (`settings.constellations.enabled`), mirroring `flow` / `filaments`.
 *
 * **Graceful degradation on error.** A failed fetch (404 / network) maps to
 * "feature off": the subscriber warns and the overlay stays empty, while the
 * rest of the app keeps working unchanged. The render wake is
 * `installSlotReadyWake`'s job, not the factory's; this subscriber only warns.
 */

import { createAssetSlot } from '../AssetSlot';
import { constellationsFetcher } from '../fetchers/constellationsFetcher';
import type { ConstellationsArtifact } from '../../../@types/loading/ConstellationsArtifact';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createConstellationsSlot: SlotFactory<ConstellationsArtifact, void> = (state, _cb) => {
  const slot = createAssetSlot({
    name: 'constellations',
    fetch: constellationsFetcher,
    commit: async (artifact) => {
      const renderer = state.gpu.constellationRenderer;
      if (!renderer) return;
      // Build the per-instance buffer on the GPU (once — the segment set is a
      // static, tier-agnostic artifact). This flips the fade guard's
      // `hasData()` true, which is the arrival edge core fades on.
      renderer.upload(artifact);
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'error') {
      console.warn('[engine] constellations failed to load:', s.error);
    }
  });
  return slot;
};
