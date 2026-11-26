import { useCallback } from 'react';
import { useAppStore } from '../../../../../src/store/hooks';
import { runStudioKey } from '../../shell/utils/runStudioKey';
import type { StudioKeyId } from '../../shell/@types/StudioKeyId';

/**
 * A studio key's store side, for `useStudioKeys`: dispatches what the key does and says whether it
 * did anything. It reads the store when the key lands, so it has no stale closure to refresh.
 */
export function useRunStudioKey(): (id: StudioKeyId) => boolean {
  const store = useAppStore();
  return useCallback(
    (id: StudioKeyId) => {
      const actions = runStudioKey(id, store.getState());
      if (actions === null) return false;
      actions.forEach((action) => store.dispatch(action));
      return true;
    },
    [store],
  );
}
