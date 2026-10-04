/**
 * cameraControls — the control scheme and the navigator's friction dials.
 * Deliberately absent from `SettingsSnapshot`: a tour or takeover never
 * restores the user's scheme away (R12).
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_CAMERA_CONTROLS } from '../../../data/camera/openSpaceNavigation';
import type { CameraControlsSettings } from '../../../@types/settings/CameraControlsSettings';
import type { ControlSchemeId } from '../../../@types/engine/camera/ControlSchemeId';
import type { FrictionGroup } from '../../../@types/camera/FrictionGroup';

const initialState: CameraControlsSettings = DEFAULT_CAMERA_CONTROLS;

export const cameraControlsSlice = createSlice({
  name: 'settings/cameraControls',
  reducerPath: 'cameraControls',
  initialState,
  reducers: {
    setControlScheme: (controls, action: PayloadAction<ControlSchemeId>) => {
      controls.scheme = action.payload;
    },
    toggleControlScheme: (controls) => {
      controls.scheme = controls.scheme === 'skymap' ? 'openspace' : 'skymap';
    },
    setNavFriction: (controls, action: PayloadAction<number>) => {
      controls.friction = Math.min(Math.max(action.payload, 0), 1);
    },
    setFrictionOn: (controls, action: PayloadAction<{ group: FrictionGroup; on: boolean }>) => {
      controls.frictionOn[action.payload.group] = action.payload.on;
    },
  },
});

export const { setControlScheme, toggleControlScheme, setNavFriction, setFrictionOn } =
  cameraControlsSlice.actions;
