/**
 * AsteroidsSectionContainer — store boundary for the asteroids section. The switches write through
 * the generic `setVisibility`, as the satellites section's do; brightness has its own reducer.
 */

import { memo, useCallback } from 'react';
import AsteroidsSection from './AsteroidsSection';
import { useAppDispatch, useAppSelector } from '../../../../store/hooks';
import { selectAsteroids } from '../../state/asteroids/selectors';
import { setAsteroidBrightness } from '../../state/asteroids/slice';
import { setVisibility } from '../../../../state/settings/setVisibilityAction';
import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { LayerMainSectionProps } from '../../../../@types/engine/layer/LayerMainSectionProps';

function AsteroidsSectionContainer({ title }: LayerMainSectionProps): React.ReactElement {
  const dispatch = useAppDispatch();
  const { enabled, items, brightness } = useAppSelector(selectAsteroids);
  const onToggleMaster = useCallback(
    (on: boolean) => dispatch(setVisibility({ cluster: 'asteroids', field: 'enabled', on })),
    [dispatch],
  );
  const onToggleClass = useCallback(
    (item: AsteroidClass, on: boolean) =>
      dispatch(setVisibility({ cluster: 'asteroids', item, field: 'enabled', on })),
    [dispatch],
  );
  const onBrightnessChange = useCallback(
    (next: number) => dispatch(setAsteroidBrightness(next)),
    [dispatch],
  );
  return (
    <AsteroidsSection
      title={title}
      enabled={enabled}
      items={items}
      brightness={brightness}
      onToggleMaster={onToggleMaster}
      onToggleClass={onToggleClass}
      onBrightnessChange={onBrightnessChange}
    />
  );
}

export default memo(AsteroidsSectionContainer);
