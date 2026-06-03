/**
 * createVelocityField — Factory that loads the CF4++ field asset onto the GPU.
 *
 * Fetches the `.json` metadata sidecar + the `.bin` blob, uploads the latter
 * as a 128³ `rgba16float` 3D texture (rgb = velocity km/s, a = overdensity δ),
 * builds a shared linear sampler, and returns the `VelocityField` handle the
 * engine shares with every layer. The shape is pinned in
 * `@types/field/VelocityField.d.ts`.
 *
 * NOTE: the body is implemented in Phase 5 (Task 17). It is a real (throwing)
 * function today — not `declare` — because `EngineContext` already references
 * the factory's product type and the module must compile + run.
 */
import type { VelocityField } from '../../@types/field/VelocityField';

// IMPLEMENTED IN PHASE 5 (Task 17): fetch meta + bin, create the 128³
// rgba16float 3D texture, writeTexture, build the linear sampler.
export function createVelocityField(
  _device: GPUDevice,
  _binUrl: string,
  _jsonUrl: string,
): Promise<VelocityField> {
  throw new Error('createVelocityField: IMPLEMENTED IN A LATER TASK (Phase 5)');
}
