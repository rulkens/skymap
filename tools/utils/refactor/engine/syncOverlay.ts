import type { Engine } from '../../../@types/refactor/Engine';
import type { OverlayChanges } from '../../../@types/refactor/OverlayChanges';
import { engineHandle } from './engineHandle';

/** Tell the engine which files changed text, appeared or went away in the overlay. */
export function syncOverlay(engine: Engine, changes: OverlayChanges): void {
  const handle = engineHandle(engine);
  handle.snapshot = handle.api.updateSnapshot({
    fileChanges: {
      changed: [...changes.changed],
      created: [...changes.created],
      deleted: [...changes.deleted],
    },
  });
}
