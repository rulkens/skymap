// src/components/containers/CommandPaletteContainer.tsx
/**
 * CommandPaletteContainer — store boundary for the command palette: the
 * famous/alias/structure index reads (all published Layer facts or store
 * selectors, no engine-handle poll), the `paletteOpen` slice, and the two
 * selection commands a pick fires — `requestSelect` pins the InfoCard,
 * `requestFocus` flies the camera, so a pick looks like a click plus a fly.
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
      onSelect={(focusId) => {
        dispatch(requestSelect(focusId));
        dispatch(requestFocus(focusId));
      }}
    />
  );
}

export default memo(CommandPaletteContainer);
