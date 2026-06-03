/**
 * AppState — the cosmic-flow tool's single root state object.
 *
 * Composed of independent slices (view toggles, camera pose, flow params,
 * volume params, labels) so reducers touch one sub-object at a time and a
 * shallow-equal selector over any slice stays cheap. The store holds exactly
 * one of these; everything the UI and engine read derives from it.
 */
import type { ViewSlice } from './slices/ViewSlice';
import type { CameraSlice } from './slices/CameraSlice';
import type { FlowSlice } from './slices/FlowSlice';
import type { VolumeSlice } from './slices/VolumeSlice';
import type { LabelsSlice } from './slices/LabelsSlice';

export type AppState = {
  readonly view: ViewSlice;
  readonly camera: CameraSlice;
  readonly flow: FlowSlice;
  readonly volume: VolumeSlice;
  readonly labels: LabelsSlice;
};
