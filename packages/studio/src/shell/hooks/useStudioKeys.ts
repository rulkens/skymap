/**
 * The dock's key handler, for its root's `onKeyDown`. Every keydown stops here, so the app's
 * document-level shortcuts (hotkeys-js, bubble phase) never act while the studio has focus; Tab
 * keeps its default, so focus still moves. A key the focused control owns is left to it, and one
 * `runKey` has nothing to do for (it returns false) keeps its default too.
 */
import { useCallback, type KeyboardEvent } from 'react';

import { STUDIO_KEYS } from '../data/studioKeys';
import { controlOwnsKey } from '../utils/controlOwnsKey';
import type { StudioKeyId } from '../@types/StudioKeyId';

export function useStudioKeys(onToggleKeys: () => void, runKey: (id: StudioKeyId) => boolean) {
  return useCallback(
    (event: KeyboardEvent) => {
      event.stopPropagation();
      if (controlOwnsKey(event)) return;
      const key = STUDIO_KEYS.find((candidate) => candidate.matches(event));
      if (key === undefined) return;
      if (key.id === 'help') onToggleKeys();
      else if (!runKey(key.id)) return;
      event.preventDefault();
    },
    [onToggleKeys, runKey],
  );
}
