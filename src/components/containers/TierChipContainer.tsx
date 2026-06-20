// src/components/containers/TierChipContainer.tsx
/**
 * TierChipContainer — store boundary for the tier selector chip.
 *
 * Owns the `selectTier` read and the `requestTier` dispatch so the
 * presentational `TierChip` imports nothing from `store/` or `state/`.
 *
 * Why `requestTier` and not `setTier`: `requestTier` is a command action —
 * dispatching it fires the tier saga, which drives the engine's data load and
 * writes `setTier` once the new bins are ready. The slice value `selectTier`
 * reads only commits AFTER the saga completes, so the chip tracks the
 * committed (loaded) truth rather than optimistically jumping ahead of the
 * in-flight fetch.
 *
 * No props: tier is entirely owned by the store slice, so this container
 * has no parent-supplied inputs. `memo` on a zero-prop container is the
 * primary lever that stops an App re-render (e.g. on `paletteOpen`) from
 * cascading into this subtree — it gates the parent-cascade direction while
 * the `useAppSelector` subscription still fires on its own slice change.
 */

import { memo, useCallback } from 'react';
import { TierChip } from '../SettingsPanel/TierChip';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectTier } from '../../state/tier/selectors';
import { requestTier } from '../../state/tier/requestTier';
import type { Tier } from '../../@types/data/Tier';

function TierChipContainer(): React.ReactElement {
  const tier = useAppSelector(selectTier);
  const dispatch = useAppDispatch();
  const onTierChange = useCallback((next: Tier) => dispatch(requestTier(next)), [dispatch]);
  return <TierChip tier={tier} onTierChange={onTierChange} />;
}

export default memo(TierChipContainer);
