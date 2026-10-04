/** CameraControlsSectionContainer — store boundary for the Camera controls settings section. */

import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import CameraControlsSection from '../SettingsPanel/CameraControlsSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectCameraControls } from '../../state/settings/selectors';
import {
  setControlScheme,
  setFrictionOn,
  setNavFriction,
} from '../../state/settings/core/cameraControlsSlice';
import type { ControlSchemeId } from '../../@types/engine/camera/ControlSchemeId';
import type { FrictionGroup } from '../../@types/camera/FrictionGroup';

function CameraControlsSectionContainer(): ReactNode {
  const dispatch = useAppDispatch();
  const controls = useAppSelector(selectCameraControls);

  const onSchemeChange = useCallback(
    (scheme: ControlSchemeId) => dispatch(setControlScheme(scheme)),
    [dispatch],
  );
  const onFrictionChange = useCallback(
    (friction: number) => dispatch(setNavFriction(friction)),
    [dispatch],
  );
  const onFrictionOnChange = useCallback(
    (group: FrictionGroup, on: boolean) => dispatch(setFrictionOn({ group, on })),
    [dispatch],
  );

  return (
    <CameraControlsSection
      controls={controls}
      onSchemeChange={onSchemeChange}
      onFrictionChange={onFrictionChange}
      onFrictionOnChange={onFrictionOnChange}
    />
  );
}

export default memo(CameraControlsSectionContainer);
