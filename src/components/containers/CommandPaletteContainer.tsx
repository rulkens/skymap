// src/components/containers/CommandPaletteContainer.tsx
/**
 * CommandPaletteContainer — store boundary for the command palette.
 *
 * Owns everything the presentational `CommandPalette` should not reach for
 * itself: the famous-meta + alias-index data hooks, the `paletteOpen` slice
 * read, the close dispatch, and the single selection command — every pick
 * (famous, alias, Milky Way) is a durable focus id the palette already built,
 * fired through `requestFocus`, the one command→ref bridge.  The palette stays
 * a pure view that imports nothing from `store/` or `state/`.
 *
 * App passes down only what isn't a store concern: `engineHandleRef`, the ref
 * `useAliasIndex` walks to join GLADE/2MRS objIds against PGC aliases.  (The
 * Milky-Way pick no longer needs App's `focusMilkyWay` — it routes through the
 * same `requestFocus(MILKY_WAY_FOCUS_ID)` path as a deep-link.)
 *
 * `memo` gates the App-cascade direction the same way TierChipContainer does:
 * an App re-render on an unrelated slice (e.g. selection) won't recurse into
 * this subtree, while the `useAppSelector(selectPaletteOpen)` subscription
 * still fires on its own slice change.
 */
import { memo } from 'react';
import type { RefObject } from 'react';
import CommandPalette from '../CommandPalette/CommandPalette';
import { useFamousMeta } from '../../hooks/useFamousMeta';
import { useAliasIndex } from '../../hooks/useAliasIndex';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectPaletteOpen } from '../../state/ui/selectors';
import { setPaletteOpen } from '../../state/ui/uiSlice';
import { requestFocus } from '../../state/selection/requestFocus';
import type { EngineHandle } from '../../@types/engine/EngineHandle';

export type CommandPaletteContainerProps = {
  engineHandleRef: RefObject<EngineHandle | null>;
};

function CommandPaletteContainer({
  engineHandleRef,
}: CommandPaletteContainerProps): React.ReactElement {
  const dispatch = useAppDispatch();
  const paletteOpen = useAppSelector(selectPaletteOpen);
  const { famousMeta } = useFamousMeta();
  const { aliasIndex } = useAliasIndex({ paletteOpen, engineHandleRef });
  return (
    <CommandPalette
      entries={famousMeta}
      aliasIndex={aliasIndex ?? undefined}
      open={paletteOpen}
      onClose={() => dispatch(setPaletteOpen(false))}
      onSelect={(focusId) => dispatch(requestFocus(focusId))}
    />
  );
}

export default memo(CommandPaletteContainer);
