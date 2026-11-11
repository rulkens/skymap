/**
 * The dock's key handler, for its root's `onKeyDown`. Every keydown stops here, so the app's
 * document-level shortcuts (hotkeys-js, bubble phase) never act while the studio has focus; Tab
 * keeps its default, so focus still moves. A key the focused control owns is left to it. It reads
 * the store when the key lands, so it has no stale closure to refresh.
 */
import { useCallback, type KeyboardEvent } from 'react';

import { STUDIO_KEYS } from '../data/studioKeys';
import { controlOwnsKey } from '../utils/controlOwnsKey';
import { runStudioKey } from '../utils/runStudioKey';
import { useAppStore } from '../../../../../src/store/hooks';

export function useStudioKeys(onToggleKeys: () => void) {
  const store = useAppStore();
  return useCallback(
    (event: KeyboardEvent) => {
      event.stopPropagation();
      if (controlOwnsKey(event)) return;
      const key = STUDIO_KEYS.find((candidate) => candidate.matches(event));
      if (key === undefined) return;
      if (key.id === 'help') onToggleKeys();
      else {
        const actions = runStudioKey(key.id, store.getState());
        if (actions === null) return;
        actions.forEach((action) => store.dispatch(action));
      }
      event.preventDefault();
    },
    [store, onToggleKeys],
  );
}
