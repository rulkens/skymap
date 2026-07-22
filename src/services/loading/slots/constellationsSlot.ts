/**
 * constellationsSlot — factory for the true-3D constellation stick-figure layer.
 *
 * Carries the decoded `ConstellationsArtifact` (the asterism line segments +
 * label anchors, positions in parsecs) through the standard asset-slot
 * machinery. A singleton overlay, demand-loaded on the layer's master gate
 * (`settings.constellations.enabled`), mirroring `flow` / `filaments`.
 *
 * No `commit` step: the artifact is CPU-resident data the renderer (Task 10)
 * and the label producer (Task 12) read straight off the slot's ready value —
 * there is nothing to upload from inside the slot. Mirrors `structureCatalog`
 * in shape (a commit-less CPU sidecar).
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

export const createConstellationsSlot: SlotFactory<ConstellationsArtifact, void> = (
  _state,
  _cb,
) => {
  const slot = createAssetSlot({
    name: 'constellations',
    fetch: constellationsFetcher,
  });
  slot.subscribe((s) => {
    if (s.kind === 'error') {
      console.warn('[engine] constellations failed to load:', s.error);
    }
  });
  return slot;
};
