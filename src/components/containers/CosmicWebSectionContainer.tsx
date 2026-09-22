/**
 * CosmicWebSectionContainer — store boundary for the Cosmic web settings section.
 *
 * Owns all Redux reach for the Cosmic web group: reads four settings selectors,
 * owns the volume-fields projection, and wraps each dispatch call in
 * `useCallback`. The presentational `CosmicWebSection` imports nothing from
 * `store/` or `state/`.
 *
 * ### Volume-fields projection
 *
 * `selectVolumeFieldItems` returns the raw `state.settings.volumes.items`
 * Record — a referentially stable Immer snapshot that only changes when a
 * field is actually added, removed, or modified. The `useMemo` projection
 * (shape only) is keyed on that stable `volumeFieldItems` reference: the
 * projected array is rebuilt only when the items Record changes, not on
 * every unrelated store write.
 *
 * ### Handler stability
 *
 * All handlers close over no store-read values — they only need `dispatch`,
 * which is the invariant `store.dispatch` across the component's lifetime.
 * `[dispatch]` is the sole dep for every `useCallback`, giving each handler
 * permanent stable identity and letting the presentational child's `memo`
 * bail correctly on parent re-renders.
 */

import { memo, useCallback, useMemo } from 'react';
import CosmicWebSection from '../SettingsPanel/CosmicWebSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectVolumesEnabled,
  selectVolumeFieldItems,
} from '../../layers/cosmicWebDensity/state/cosmicWebDensity/selectors';
import {
  selectFilamentsEnabled,
  selectFilamentIntensity,
} from '../../layers/cosmicWebFilaments/state/cosmicWebFilaments/selectors';
import { setVolumesEnabled, writeVolumeField } from '../../layers/cosmicWebDensity/state/cosmicWebDensity/slice';
import {
  setFilamentsEnabled,
  setFilamentIntensity,
} from '../../layers/cosmicWebFilaments/state/cosmicWebFilaments/slice';
import { projectVolumeFieldRows } from '../../state/settings/projectVolumeFieldRows';
import type { VolumeFieldId } from '../../@types/data/volume/VolumeFieldId';
import type { ScalarFieldPaletteId } from '../../@types/data/volume/ScalarFieldPaletteId';

function CosmicWebSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();

  const volumesEnabled = useAppSelector(selectVolumesEnabled);
  const volumeFieldItems = useAppSelector(selectVolumeFieldItems);
  const filamentsEnabled = useAppSelector(selectFilamentsEnabled);
  const filamentIntensity = useAppSelector(selectFilamentIntensity);

  // Project the raw items Record into the display shape the section renders.
  // Keyed on the stable volumeFieldItems reference — the array is rebuilt
  // only when the items Record actually changes.
  const volumeFields = useMemo(() => projectVolumeFieldRows(volumeFieldItems), [volumeFieldItems]);

  const onVolumesEnabledChange = useCallback(
    (enabled: boolean) => dispatch(setVolumesEnabled(enabled)),
    [dispatch],
  );

  const onFilamentsChange = useCallback(
    (enabled: boolean) => dispatch(setFilamentsEnabled(enabled)),
    [dispatch],
  );

  const onFilamentIntensityChange = useCallback(
    (value: number) => dispatch(setFilamentIntensity(value)),
    [dispatch],
  );

  const onVolumeFieldEnabledChange = useCallback(
    (id: VolumeFieldId, enabled: boolean) => dispatch(writeVolumeField({ id, patch: { enabled } })),
    [dispatch],
  );

  const onVolumeFieldIntensityChange = useCallback(
    (id: VolumeFieldId, intensity: number) =>
      dispatch(writeVolumeField({ id, patch: { intensity } })),
    [dispatch],
  );

  const onVolumeFieldContrastChange = useCallback(
    (id: VolumeFieldId, contrast: number) =>
      dispatch(writeVolumeField({ id, patch: { contrast } })),
    [dispatch],
  );

  const onVolumeFieldDensityScaleChange = useCallback(
    (id: VolumeFieldId, densityScale: number) =>
      dispatch(writeVolumeField({ id, patch: { densityScale } })),
    [dispatch],
  );

  const onVolumeFieldTrimChange = useCallback(
    (id: VolumeFieldId, trim: number) => dispatch(writeVolumeField({ id, patch: { trim } })),
    [dispatch],
  );

  const onVolumeFieldExposureChange = useCallback(
    (id: VolumeFieldId, exposure: number) =>
      dispatch(writeVolumeField({ id, patch: { exposure } })),
    [dispatch],
  );

  const onVolumeFieldPaletteChange = useCallback(
    (id: VolumeFieldId, paletteId: ScalarFieldPaletteId) =>
      dispatch(writeVolumeField({ id, patch: { paletteId } })),
    [dispatch],
  );

  return (
    <CosmicWebSection
      volumesEnabled={volumesEnabled}
      onVolumesEnabledChange={onVolumesEnabledChange}
      filamentsEnabled={filamentsEnabled}
      onFilamentsChange={onFilamentsChange}
      filamentIntensity={filamentIntensity}
      onFilamentIntensityChange={onFilamentIntensityChange}
      volumeFields={volumeFields}
      onVolumeFieldEnabledChange={onVolumeFieldEnabledChange}
      onVolumeFieldIntensityChange={onVolumeFieldIntensityChange}
      onVolumeFieldContrastChange={onVolumeFieldContrastChange}
      onVolumeFieldDensityScaleChange={onVolumeFieldDensityScaleChange}
      onVolumeFieldTrimChange={onVolumeFieldTrimChange}
      onVolumeFieldExposureChange={onVolumeFieldExposureChange}
      onVolumeFieldPaletteChange={onVolumeFieldPaletteChange}
    />
  );
}

export default memo(CosmicWebSectionContainer);
