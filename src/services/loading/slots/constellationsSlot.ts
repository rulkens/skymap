/**
 * constellationsSlot — factory for the true-3D constellation stick-figure layer.
 *
 * Carries the decoded `ConstellationsArtifact` (the asterism line segments +
 * label anchors, positions in parsecs) through the standard asset-slot
 * machinery. A singleton overlay, demand-loaded on the layer's master gate
 * (`settings.constellations.enabled`), mirroring `flow` / `filaments`.
 *
 * ### The commit uploads AND kicks the demand-loaded fade
 *
 * The `constellations` fade row seeds at 0 (a demand-loaded layer, like
 * `filaments` / `flow`) and is GUARDED on `constellationRenderer.hasData()` —
 * so its fade stays suppressed until the renderer holds drawable segments.
 * The guard flips true the moment `renderer.upload(artifact)` runs, so THIS
 * commit is the readiness edge that must re-evaluate the fade: it uploads,
 * then drives the intent → fade bridge scoped to the `constellations` row.
 * Without that kick the layer would sit at opacity 0 after load (the default
 * gate is ON, but nothing ramps the seeded-0 fade up) and only appear once the
 * user cycled the toggle — the exact same first-load fade-in `filamentSlot`
 * routes through the bridge. The label producer rides the same fade, so a
 * missing kick would ALSO leave every constellation name invisible.
 *
 * A load that completes while the user has the layer off snaps to opacity 0
 * through the bridge's intent read and never draws until they toggle it on.
 *
 * **Graceful degradation on error.** A failed fetch (404 / network) maps to
 * "feature off": the subscriber warns and the overlay stays empty, while the
 * rest of the app keeps working unchanged. The render wake is
 * `installSlotReadyWake`'s job, not the factory's; this subscriber only warns.
 */

import { createAssetSlot } from '../AssetSlot';
import { constellationsFetcher } from '../fetchers/constellationsFetcher';
import { syncVisibilityFades } from '../../engine/wiring/syncVisibilityFades';
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
      // `hasData()` true.
      renderer.upload(artifact);
      // Kick the demand-loaded fade now that the guard is satisfied: the row
      // seeds at 0, so this is what ramps it to the master toggle's intent.
      syncVisibilityFades(state, { animate: true, only: ['constellations'] });
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'error') {
      console.warn('[engine] constellations failed to load:', s.error);
    }
  });
  return slot;
};
