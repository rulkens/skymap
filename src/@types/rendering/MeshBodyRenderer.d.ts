/**
 * MeshBodyRenderer — handle for the shared lit triangle-mesh renderer: real
 * authored geometry in metres (the whale, the bowl of petunias), not a sphere
 * and not a proxy shell. Per-mesh GPU resources — including the body's own
 * reflection probe — are keyed by body id and make up bind group 0 (group 1
 * holds the renderer-wide samplers and LUT), so `draw` writes a body's uniforms
 * immediately before its own draw, with no shared buffer for a later
 * `writeBuffer` to race against the pending `submit`. No placeholder posture:
 * an id with no asset resident draws NOTHING, so a body in range but not yet
 * loaded is absent rather than a wrong shape. It also owns the sun shadow array:
 * `renderShadows` fills it, mesh draws and (via `groundCasters`) surface tiles read it.
 */

import type { Renderer } from './Renderer';
import type { MeshAsset } from '../data/mesh/MeshAsset';
import type { MeshProbe } from './MeshProbe';
import type { MeshShadowCaster } from './MeshShadowCaster';
import type { MeshShadowSlot } from './MeshShadowSlot';
import type { MeshGroundCaster } from './MeshGroundCaster';
import type { ClaimTimestampWrites } from '../gpu/timing/ClaimTimestampWrites';
import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';

export type MeshBodyRenderer = Renderer & {
  /** Albedo is sRGB; the metal-rough and normal maps are LINEAR `rgba8unorm`
   *  — an sRGB decode would corrupt slope and roughness data. */
  setMesh(id: string, asset: MeshAsset): void;
  clearMesh(id: string): void;
  hasMesh(id: string): boolean;
  /** The probe minted with `setMesh`; `null` while the id is not resident. */
  probeOf(id: string): MeshProbe | null;
  /** `horizonAtlas`: the host's horizon tile atlas the uniforms' rect addresses; null off the ground. */
  draw(
    pass: GPURenderPassEncoder,
    id: string,
    uniforms: Float32Array,
    horizonAtlas: GPUTextureView | null,
  ): void;
  /** Multiplies the body's contact mask onto the target where `depthView`'s
   *  scene falls inside its box; a no-op for a body without one. */
  drawContactShadow(
    pass: GPURenderPassEncoder,
    id: string,
    uniforms: Float32Array,
    depthView: GPUTextureView,
  ): void;
  /** Hands the nearest resident `casters` a layer each and redraws only the layers whose mesh
   *  or mesh-frame sun moved; encodes nothing when none did. A `mapPx` other than the array's
   *  re-makes it at that size and redraws every layer. */
  renderShadows(
    encoder: GPUCommandEncoder,
    casters: readonly MeshShadowCaster[],
    mapPx: number,
    claimTimestampWrites: ClaimTimestampWrites,
  ): void;
  /** The body's layer as of the last `renderShadows`; null without one (it reads lit). */
  shadowOf(id: string): MeshShadowSlot | null;
  /** Up to `MESH_SHADOW_GROUND_CASTERS` site bodies on `hostId` holding a layer, nearest first,
   *  each with its matrix from a point relative to the eye at `eyeRelBodyM` (host axes, metres). */
  groundCasters(hostId: string, eyeRelBodyM: Readonly<Vec3>): readonly MeshGroundCaster[];
  /** The whole shadow array, `texture_depth_2d_array`, for a pipeline that reads it. A new
   *  view after a resize: a bind group holding it is cached on its identity. */
  readonly shadowMapView: GPUTextureView;
};
