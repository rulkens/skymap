import { useCallback } from 'react';
import { useAppStore } from '../../../../../src/store/hooks';
import { runStudioKey } from '../../shell/utils/runStudioKey';
import type { StudioKeyId } from '../../shell/@types/StudioKeyId';

/**
 * Runs a studio key's command, for its key and its button alike, so both dispatch the same actions;
 * false when it had nothing to do. It reads the store when it runs, so it has no stale closure.
 */
export function useStudioCommand(): (id: StudioKeyId) => boolean {
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
