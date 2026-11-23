import type { Engine } from '../../../@types/refactor/Engine';
import { engineHandle } from './engineHandle';

/** Tell the engine these files' overlay text changed. */
export function syncOverlay(engine: Engine, changed: readonly string[]): void {
  const handle = engineHandle(engine);
  handle.snapshot = handle.api.updateSnapshot({ fileChanges: { changed: [...changed] } });
}
