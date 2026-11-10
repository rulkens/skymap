/**
 * GalaxyFieldHost — the app's whole contract with the v2 field. Per frame,
 * in order: `setTuning`, `ensureFresh`, `plan`, then `encode` with that plan
 * in each view. What only the tool needs comes back beside it as
 * `GalaxyFieldHostDebug`.
 */
import type { FieldFramePlan } from '../../@types/FieldFramePlan';
import type { FieldHostTuning } from './FieldHostTuning';
import type { FieldTargetId } from '../../@types/FieldTargetId';
import type { FieldView } from '../../@types/FieldView';
import type { GalaxyFieldRenderTargets } from '../../@types/GalaxyFieldRenderTargets';

export type GalaxyFieldHost = {
  /** Step the ISM chain; a rebuild requests the readback that sets invMeanNorm. Once per frame, never per view. */
  ensureFresh(): void;
  /** planFieldFrame over the renderer's packed segments. Called once per frame, by the planner. */
  plan(): FieldFramePlan;
  /** Throws before the first `setTuning`: the headers have no render lanes to pack. */
  encode(
    encoder: GPUCommandEncoder,
    plan: FieldFramePlan,
    camera: FieldView,
    exposure: number,
    targets: GalaxyFieldRenderTargets,
    timestampWrites?: (id: FieldTargetId) => GPURenderPassTimestampWrites | undefined,
  ): void;
  setTuning(tuning: FieldHostTuning): void;
  destroy(): void;
};
