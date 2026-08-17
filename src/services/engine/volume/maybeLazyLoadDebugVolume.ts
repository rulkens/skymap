import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';

/**
 * Lazy-load the DEV-only debug volume slot backing a field if it's `idle`.
 * The shippable volumes (CF-4, MCPM) load via `reevaluateDemand` instead
 * (their demand reads `items[id].enabled`); the debug fixtures are
 * excluded from the registry, so they keep a direct lazy-load.
 *
 * Idempotent (a non-idle slot no-ops, so off-then-on doesn't re-fetch),
 * and a no-op for cf4/mcpm ids — so the two load mechanisms partition.
 */
export function maybeLazyLoadDebugVolume(
  state: Pick<EngineState, 'assetSlots'>,
  fieldId: VolumeFieldId,
): void {
  switch (fieldId) {
    case 'debug-gaussian':
    case 'debug-cartesian':
    case 'debug-spherical': {
      const slot = state.assetSlots.syntheticVolumes?.[fieldId];
      if (!slot || slot.state().kind !== 'idle') return;
      // Same dims + box-size triple across all three fixtures so they
      // overlay coherently when more than one is enabled at once.
      const shape =
        fieldId === 'debug-gaussian'
          ? 'gaussian'
          : fieldId === 'debug-cartesian'
            ? 'cartesian'
            : 'spherical';
      void slot.load({ id: fieldId, shape, dims: 64, boxSizeMpc: 400 });
      return;
    }
  }
}
