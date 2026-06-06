/**
 * AppState — the flow-workbench tool's single root state object.
 *
 * Three independent concerns, one per slice: the orbit camera pose, the flow
 * look/motion settings, and the label toggle. Reducers touch one sub-object at
 * a time so a shallow-equal selector over any slice stays cheap. The store
 * holds exactly one of these; everything the UI and the harness read derives
 * from it.
 *
 * The flow slice is the CANONICAL `FlowSettings` shape (the same flat type the
 * runtime renderer's `encodeCompute`/`draw` take), NOT a workbench-local
 * per-mode struct. The whole point of Phase E is that the workbench drives the
 * one real flow renderer, so it must speak the renderer's settings type
 * directly — no translation layer. The earlier `view` (layer toggles) and
 * `volume` (density-cube knobs) slices are gone: the harness renders only the
 * flow layer, so there are no layers to toggle and no density cube to tune.
 */
import type { CameraSlice } from './slices/CameraSlice';
import type { FlowSettings } from '../../../../src/@types/settings/FlowSettings';
import type { LabelsSlice } from './slices/LabelsSlice';

export type AppState = {
  readonly camera: CameraSlice;
  readonly flow: FlowSettings;
  readonly labels: LabelsSlice;
};
