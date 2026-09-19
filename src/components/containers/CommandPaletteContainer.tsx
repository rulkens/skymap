// src/components/containers/CommandPaletteContainer.tsx
/**
 * CommandPaletteContainer — store boundary for the command palette: the
 * famous/alias/structure index reads (all published Layer facts or store
 * selectors, no engine-handle poll), the `paletteOpen` slice, and the
 * per-kind dispatch table a pick runs through (PR3 adds rows, not branches).
 * `focus` fires the two selection commands a pick fires — `requestSelect`
 * pins the InfoCard, `requestFocus` flies the camera — so a pick looks like
 * a click plus a fly.
 */
import { memo } from 'react';
import CommandPalette from '../CommandPalette/CommandPalette';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectFamousGalaxiesMeta,
  selectAliasIndex,
  selectStructureSearchList,
} from '../../state/engine/selectors';
import { selectPaletteOpen } from '../../state/ui/selectors';
import { setPaletteOpen } from '../../state/ui/uiSlice';
import { requestFocus } from '../../state/selection/requestFocus';
import { requestSelect } from '../../state/selection/requestSelect';
import type { PaletteAction } from '../../@types/palette/PaletteAction';
import type { AppDispatch } from '../../store/types';

const RUN_ACTION: Record<
  PaletteAction['kind'],
  (dispatch: AppDispatch, action: PaletteAction) => void
> = {
  focus: (dispatch, action) => {
    if (action.kind !== 'focus') return;
    dispatch(requestSelect(action.focusId));
    dispatch(requestFocus(action.focusId));
  },
};

function CommandPaletteContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const paletteOpen = useAppSelector(selectPaletteOpen);
  const famousGalaxiesMeta = useAppSelector(selectFamousGalaxiesMeta);
  const aliasIndex = useAppSelector(selectAliasIndex);
  const structures = useAppSelector(selectStructureSearchList);
  return (
    <CommandPalette
      entries={famousGalaxiesMeta}
      aliasIndex={aliasIndex}
      structures={structures}
      open={paletteOpen}
      onClose={() => dispatch(setPaletteOpen(false))}
      onSelect={(action) => RUN_ACTION[action.kind](dispatch, action)}
    />
  );
}

export default memo(CommandPaletteContainer);
