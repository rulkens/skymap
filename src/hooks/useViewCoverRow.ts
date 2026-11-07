/** useViewCoverRow — `useViewCover` for a container that owns both the panel and its `viewCover` row. */

import { useCallback, type RefObject } from 'react';

import { useAppDispatch } from '../store/hooks';
import { viewCoverSet } from '../state/viewCover/viewCoverSlice';
import { useViewCover } from './useViewCover';
import type { CoverEdge } from '../@types/layout/CoverEdge';
import type { CoverId } from '../@types/layout/CoverId';
import type { ViewCover } from '../@types/layout/ViewCover';

export function useViewCoverRow(
  ref: RefObject<HTMLElement | null>,
  id: CoverId,
  edge: CoverEdge,
  active: boolean,
): void {
  const dispatch = useAppDispatch();
  const onCover = useCallback(
    (cover: ViewCover | null) => dispatch(viewCoverSet({ id, cover })),
    [dispatch, id],
  );
  useViewCover(ref, edge, active, onCover);
}
