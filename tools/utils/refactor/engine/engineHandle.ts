import type { API, Snapshot } from 'typescript-native/unstable/sync';
import type { Engine } from '../../../@types/refactor/Engine';

/** The one place `Engine.handle` is cast back; `snapshot` is replaced by each sync. */
export function engineHandle(engine: Engine): { api: API; snapshot: Snapshot } {
  return engine.handle as { api: API; snapshot: Snapshot };
}
