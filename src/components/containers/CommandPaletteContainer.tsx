// src/components/containers/CommandPaletteContainer.tsx
/**
 * CommandPaletteContainer — store boundary for the command palette.
 *
 * Owns everything the presentational `CommandPalette` should not reach for
 * itself: the famous-galaxies-meta + alias-index + structure-index facts, the
 * `paletteOpen` slice read, the close dispatch, and the two selection commands.
 * Every pick (famous, alias, structure, Milky Way) is a durable focus id the
 * palette already built; the container fires both single-purpose commands —
 * `requestSelect` pins the InfoCard (the `select` slot) and `requestFocus` flies
 * the camera (the `focus` slot), so a palette pick looks the same as a scene
 * click plus a fly.  The palette stays a pure view that imports nothing from
 * `store/` or `state/`.
 *
 * The alias index is a published galaxyCatalog Layer fact
 * (`selectAliasIndex`), not an engine-handle poll: opening the palette sets
 * `ui.paletteOpen`, which is the pgcAlias asset row's own demand — no
 * container-side fetch trigger needed. The structure index is likewise a
 * store read (`selectStructureSearchList`), published by
 * `wireStructureProjection`.
 *
 * `memo` gates the App-cascade direction the same way TierChipContainer does:
 * an App re-render on an unrelated slice (e.g. selection) won't recurse into
 * this subtree, while the `useAppSelector(selectPaletteOpen)` subscription
 * still fires on its own slice change.
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
