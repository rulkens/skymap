/**
 * CommandPaletteContainer — store boundary for the command palette: the
 * famous/alias/structure index reads, the `paletteOpen`/`paletteTab` slice
 * reads, and dispatching the actions a pick resolves to
 * (`actionsForPaletteAction`), in order.
 */
import { memo, useMemo } from 'react';
import CommandPalette from '../CommandPalette/CommandPalette';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectFamousGalaxiesMeta,
  selectAliasIndex,
  selectStructureSearchList,
  selectLayerSearchRows,
} from '../../state/engine/selectors';
import { selectPaletteOpen, selectPaletteTab } from '../../state/ui/selectors';
import { setPaletteOpen, setPaletteTab } from '../../state/ui/uiSlice';
import { FEATURED_TABS } from '../../data/palette/featuredTabs';
import { actionsForPaletteAction } from '../../utils/palette/actionsForPaletteAction';
import { selectSkyEntry } from '../../state/sky/selectSkyEntry';
import { selectSkyHost } from '../../state/sky/selectSkyHost';

function CommandPaletteContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const paletteOpen = useAppSelector(selectPaletteOpen);
  const paletteTab = useAppSelector(selectPaletteTab);
  const famousGalaxiesMeta = useAppSelector(selectFamousGalaxiesMeta);
  const aliasIndex = useAppSelector(selectAliasIndex);
  const structures = useAppSelector(selectStructureSearchList);
  const layerRows = useAppSelector(selectLayerSearchRows);
  const hereOpen = useAppSelector((state) => selectSkyEntry(state) !== null);
  const host = useAppSelector(selectSkyHost);
  const sky = useMemo(() => ({ hereOpen, host }), [hereOpen, host]);
  return (
    <CommandPalette
      entries={famousGalaxiesMeta}
      aliasIndex={aliasIndex}
      structures={structures}
      layerRows={layerRows}
      sky={sky}
      tabs={FEATURED_TABS}
      tab={paletteTab}
      onTabChange={(id) => dispatch(setPaletteTab(id))}
      open={paletteOpen}
      onClose={() => dispatch(setPaletteOpen(false))}
      onSelect={(action) => {
        for (const a of actionsForPaletteAction(action)) dispatch(a);
      }}
    />
  );
}

export default memo(CommandPaletteContainer);
