// src/components/containers/CommandPaletteContainer.tsx
/**
 * CommandPaletteContainer — store boundary for the command palette.
 *
 * Owns everything the presentational `CommandPalette` should not reach for
 * itself: the famous-galaxies-meta + alias-index + structure-index data hooks, the
 * `paletteOpen` slice read, the close dispatch, and the two selection commands.
 * Every pick (famous, alias, structure, Milky Way) is a durable focus id the
 * palette already built; the container fires both single-purpose commands —
 * `requestSelect` pins the InfoCard (the `select` slot) and `requestFocus` flies
 * the camera (the `focus` slot), so a palette pick looks the same as a scene
 * click plus a fly.  The palette stays a pure view that imports nothing from
 * `store/` or `state/`.
 *
 * App passes down only what isn't a store concern: `engineHandleRef`, the ref
 * `useAliasIndex` walks to join GLADE/2MRS objIds against PGC aliases and
 * `useStructureIndex` reads to snapshot the loaded structures.  (The Milky-Way
 * pick no longer needs App's `focusMilkyWay` — it routes through the same
 * `requestFocus(MILKY_WAY_FOCUS_ID)` path as a deep-link.)
 *
 * `memo` gates the App-cascade direction the same way TierChipContainer does:
 * an App re-render on an unrelated slice (e.g. selection) won't recurse into
 * this subtree, while the `useAppSelector(selectPaletteOpen)` subscription
 * still fires on its own slice change.
 */
import { memo } from 'react';
import type { RefObject } from 'react';
import CommandPalette from '../CommandPalette/CommandPalette';
import { useAliasIndex } from '../../hooks/useAliasIndex';
import { useStructureIndex } from '../../hooks/useStructureIndex';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectFamousGalaxiesMeta } from '../../state/engine/selectors';
import { selectPaletteOpen } from '../../state/ui/selectors';
import { setPaletteOpen } from '../../state/ui/uiSlice';
import { requestFocus } from '../../state/selection/requestFocus';
import { requestSelect } from '../../state/selection/requestSelect';
import type { EngineHandle } from '../../@types/engine/EngineHandle';

export type CommandPaletteContainerProps = {
  engineHandleRef: RefObject<EngineHandle | null>;
};

function CommandPaletteContainer({
  engineHandleRef,
}: CommandPaletteContainerProps): React.ReactElement {
  const dispatch = useAppDispatch();
  const paletteOpen = useAppSelector(selectPaletteOpen);
  const famousGalaxiesMeta = useAppSelector(selectFamousGalaxiesMeta);
  const { aliasIndex } = useAliasIndex({ paletteOpen, engineHandleRef });
  const structures = useStructureIndex({ paletteOpen, engineHandleRef });
  return (
    <CommandPalette
      entries={famousGalaxiesMeta}
      aliasIndex={aliasIndex ?? undefined}
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
