/**
 * CommandPaletteContainer — store boundary for the command palette: the
 * famous/alias/structure index reads, the `paletteOpen`/`paletteTab` slice
 * reads, and the per-kind dispatch table a pick runs through. `focus` fires
 * `requestSelect` (pins the InfoCard) then `requestFocus` (flies the camera),
 * so a pick looks like a click plus a fly.
 */
import { memo } from 'react';
import CommandPalette from '../CommandPalette/CommandPalette';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectFamousGalaxiesMeta,
  selectAliasIndex,
  selectStructureSearchList,
} from '../../state/engine/selectors';
import { selectPaletteOpen, selectPaletteTab } from '../../state/ui/selectors';
import { setPaletteOpen, setPaletteTab } from '../../state/ui/uiSlice';
import { requestFocus } from '../../state/selection/requestFocus';
import { requestSelect } from '../../state/selection/requestSelect';
import { openExhibit } from '../../state/exhibits/exhibitActions';
import { startTour } from '../../state/tour/tourActions';
import { flyToLonLat } from '../../state/camera/flyToLonLatActions';
import { FEATURED_TABS } from '../../data/palette/featuredTabs';
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
  exhibit: (dispatch, action) => {
    if (action.kind !== 'exhibit') return;
    dispatch(openExhibit(action.exhibitId));
  },
  tour: (dispatch, action) => {
    if (action.kind !== 'tour') return;
    dispatch(startTour(action.tourId));
  },
  flyTo: (dispatch, action) => {
    if (action.kind !== 'flyTo') return;
    dispatch(
      flyToLonLat({
        lonDeg: action.lonDeg,
        latDeg: action.latDeg,
        body: 'earth',
        altKm: action.altKm,
      }),
    );
  },
};

function CommandPaletteContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const paletteOpen = useAppSelector(selectPaletteOpen);
  const paletteTab = useAppSelector(selectPaletteTab);
  const famousGalaxiesMeta = useAppSelector(selectFamousGalaxiesMeta);
  const aliasIndex = useAppSelector(selectAliasIndex);
  const structures = useAppSelector(selectStructureSearchList);
  return (
    <CommandPalette
      entries={famousGalaxiesMeta}
      aliasIndex={aliasIndex}
      structures={structures}
      tabs={FEATURED_TABS}
      tab={paletteTab}
      onTabChange={(id) => dispatch(setPaletteTab(id))}
      open={paletteOpen}
      onClose={() => dispatch(setPaletteOpen(false))}
      onSelect={(action) => RUN_ACTION[action.kind](dispatch, action)}
    />
  );
}

export default memo(CommandPaletteContainer);
