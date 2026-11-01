/** CameraControlsSectionContainer — store boundary for the Camera controls settings section. */

import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import CameraControlsSection from '../SettingsPanel/CameraControlsSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectCameraControls, selectFocusMoveStyle } from '../../state/settings/selectors';
import {
  setControlScheme,
  setFrictionOn,
  setNavFriction,
} from '../../state/settings/core/cameraControlsSlice';
import { setFocusMoveStyle } from '../../state/settings/core/focusMovesSlice';
import type { FocusMoveStyle } from '../../@types/camera/FocusMoveStyle';
import type { ControlSchemeId } from '../../@types/engine/camera/ControlSchemeId';
import type { FrictionGroup } from '../../@types/camera/FrictionGroup';

function CameraControlsSectionContainer(): ReactNode {
  const dispatch = useAppDispatch();
  const controls = useAppSelector(selectCameraControls);
  const focusMoveStyle = useAppSelector(selectFocusMoveStyle);

  const onSchemeChange = useCallback(
    (scheme: ControlSchemeId) => dispatch(setControlScheme(scheme)),
    [dispatch],
  );
  const onFocusMoveStyleChange = useCallback(
    (style: FocusMoveStyle) => dispatch(setFocusMoveStyle(style)),
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
      focusMoveStyle={focusMoveStyle}
      onFocusMoveStyleChange={onFocusMoveStyleChange}
      onSchemeChange={onSchemeChange}
      onFrictionChange={onFrictionChange}
      onFrictionOnChange={onFrictionOnChange}
    />
  );
}

export default memo(CameraControlsSectionContainer);
