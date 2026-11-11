/** Runs a studio key's command from a button, so the button and its key dispatch the same actions. */
import { useCallback } from 'react';

import { runStudioKey } from '../utils/runStudioKey';
import { useAppStore } from '../../../../../src/store/hooks';
import type { StudioKeyId } from '../@types/StudioKeyId';

export function useStudioCommand(): (id: StudioKeyId) => void {
  const store = useAppStore();
  return useCallback(
    (id) => runStudioKey(id, store.getState())?.forEach((action) => store.dispatch(action)),
    [store],
  );
}
