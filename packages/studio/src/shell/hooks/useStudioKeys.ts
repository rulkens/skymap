/**
 * The dock's key handler, for its root's `onKeyDown`. It stops propagation only for keys it acted
 * on, so the app's document-level shortcuts (hotkeys-js binds in the bubble phase) never see them,
 * while an unhandled Escape, with nothing selected, bubbles on and ends the takeover. Ignored while
 * typing in a field. It reads the store when the key lands, so it has no stale closure to refresh.
 */
import { useCallback, type KeyboardEvent } from 'react';

import { STUDIO_KEYS } from '../data/studioKeys';
import { isTypingTarget } from '../utils/isTypingTarget';
import { runStudioKey } from '../utils/runStudioKey';
import { useAppStore } from '../../../../../src/store/hooks';

export function useStudioKeys(onToggleKeys: () => void) {
  const store = useAppStore();
  return useCallback(
    (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = STUDIO_KEYS.find((candidate) => candidate.matches(event));
      if (key === undefined) return;
      if (key.id === 'help') onToggleKeys();
      else {
        const actions = runStudioKey(key.id, store.getState());
        if (actions === null) return;
        actions.forEach((action) => store.dispatch(action));
      }
      event.preventDefault();
      event.stopPropagation();
    },
    [store, onToggleKeys],
  );
}
