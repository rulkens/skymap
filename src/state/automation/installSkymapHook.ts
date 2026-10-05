/**
 * installSkymapHook — publishes `window.__skymap`, the hook every Playwright
 * tool waits on. Always installed (no URL gate); `ready` is lazy so a normal
 * visit never subscribes to the store for it.
 */
import { whenStablyReady } from '../lifecycle/whenStablyReady';
import type { SkymapHook } from '../../@types/automation/SkymapHook';
import type { SkymapWindow } from '../../@types/automation/SkymapWindow';
import type { EngineHandle } from '../../@types/engine/EngineHandle';
import type { AppStore } from '../../store/types';

export function installSkymapHook(store: AppStore, engine: EngineHandle): void {
  let ready: Promise<void> | undefined;
  const hook: SkymapHook = {
    get ready() {
      return (ready ??= whenStablyReady(store));
    },
    dispatch: store.dispatch,
    getState: () => store.getState(),
    nextFrame: () => engine.nextFrame(),
    projectRoot: __SKYMAP_PROJECT_ROOT__,
  };
  (window as SkymapWindow).__skymap = hook;
}
