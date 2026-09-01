/**
 * packAtmosphereUniforms — pure packer for the 176-byte `AtmosphereUniforms`
 * struct (`shaders/lib/sphere.wesl`).
 *
 * The atmosphere shell is a proxy sphere scaled by `composeBodySlabMvp` to the
 * ATMOSPHERE-TOP radius, drawn just outside Earth's cloud shell. Its per-draw
 * uniform buffer carries the lit-body prefix (MVP + body-local sun direction)
 * plus the params its in-scatter fragment needs: the ground/atmosphere-top
 * radius ratio, the camera position, an exposure scale, and the inverse MVP.
 * This is the single source of truth for that byte layout — the atmosphere
 * renderer packs through here so the CPU write can never drift from the WGSL
 * struct (a drift the GPU would not report; on iOS it would drop the frame
 * silently).
 *
 * ## Reused lit prefix, then a real field in the vec3 tail
 *
 * The first 80 bytes are exactly `LitBodyUniforms`, so this reuses
 * `packLitBodyUniforms` for [0..19] rather than re-deriving the layout — the
 * two can never drift. It then OVERWRITES float index 19 (byte 76): the lit
 * packer leaves that slot a zeroed `_pad` (the vec3's trailing 4 bytes), but
 * here it is the REAL field `bottomRadius`, the same trick `packRingUniforms`
 * uses to put `planetRadiusRatio` in that slot.
 *
 * ## The atmosphere-top-unit-sphere convention
 *
 * The proxy sphere is scaled to the atmosphere-top radius, so in the mesh's
 * local frame the atmosphere top is the UNIT sphere (`topRadius == 1`, implicit,
 * no field) and the ground sphere has radius `bottomRadius ∈ (0,1)`. The shell
 * fragment maps its local altitude to the LUT radial axis via `bottomRadius`
 * alone: normalized altitude `h = (r_local − bottomRadius) / (1 − bottomRadius)`.
 * `camPosLocal` is expressed in those same atmosphere-top-radius units with the
 * sphere centre at the origin — the view vector the in-scatter integral needs,
 * which the lit prefix does not carry.
 *
 * ## Byte layout (uniform address space) — 176 bytes / 44 f32
 *
 *   f32 0..15  (byte   0..63):  mvp (column-major mat4x4)
 *   f32 16..18 (byte  64..75):  sunDirLocal (vec3, 16-byte aligned)
 *   f32 19     (byte  76..79):  bottomRadius (fills sunDirLocal's vec3 tail)
 *   f32 20..22 (byte  80..91):  camPosLocal (vec3, 16-byte aligned)
 *   f32 23     (byte  92..95):  _pad1 (zeroed; fills camPosLocal's vec3 tail)
 *   f32 24     (byte  96..99):  exposure
 *   f32 25     (byte 100..103): ringInnerRatio (ring inner / atmosphere top; 0 = none)
 *   f32 26     (byte 104..107): ringOuterRatio (ring outer / atmosphere top; 0 = none)
 *   f32 27     (byte 108..111): _pad0 (zeroed; rounds the 112-byte prefix to 16-byte)
 *   f32 28..43 (byte 112..175): invMvp (column-major mat4x4, 16-byte aligned)
 *
 * The ring ratios express the host body's ring annulus in the proxy's LOCAL
 * units (atmosphere top = 1), so the shell fragment can test whether the ring
 * blocks a fragment's view of the atmosphere segment (a ring in FRONT of the
 * atmosphere must keep its own brightness — the shell scales its in-scatter +
 * opacity by the ring's blocking alpha). `ringOuterRatio == 0` is the no-ring
 * sentinel — the same data-gate `packTexturedBodyUniforms` uses.
 *
 * `invMvp` is the inverse of `mvp`, read only by the inside-shell fragment
 * entry points (unprojecting a screen position back into the shell's local
 * frame) but packed for every body regardless — one struct, one packer, no
 * inside-only second buffer.
 *
 * @param mvp            16-element column-major MVP (from `composeBodySlabMvp`, narrowed).
 * @param invMvp         16-element column-major inverse of `mvp` (narrowed).
 * @param sunDirLocal    Sun direction in the body's local frame.
 * @param camPosLocal    Camera position in atmosphere-top-radius units, centre at origin.
 * @param bottomRadius   Ground/atmosphere-top radius ratio (`planetRadiusKm / atmosphereTopKm`), ∈ (0,1).
 * @param exposure       In-scatter intensity scale.
 * @param ringInnerRatio Ring inner radius / atmosphere-top radius (0 when no ring).
 * @param ringOuterRatio Ring outer radius / atmosphere-top radius; 0 ⇒ no ring.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { packLitBodyUniforms } from './packLitBodyUniforms';

/** f32 count of `AtmosphereUniforms` — mvp 16 + invMvp 16 + sun/bottom 4 +
 *  cam/pad 4 + exposure/rings/pad 4 = 44. */
export const ATMOSPHERE_UNIFORM_FLOATS = 44;

export function packAtmosphereUniforms(
  mvp: Float32Array,
  invMvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  camPosLocal: Readonly<Vec3>,
  bottomRadius: number, // = planetRadiusKm / atmosphereTopKm
  exposure: number,
  ringInnerRatio: number,
  ringOuterRatio: number,
): Float32Array {
  const out = new Float32Array(ATMOSPHERE_UNIFORM_FLOATS);
  // Reuse the 80-byte lit prefix (mvp + sunDirLocal); no re-derivation.
  out.set(packLitBodyUniforms(mvp, sunDirLocal), 0); // f32 0..19
  out[19] = bottomRadius; // byte 76 — overwrite the lit pad with a real field
  out[20] = camPosLocal[0]; // byte 80 — vec3, 16-byte aligned
  out[21] = camPosLocal[1]; // byte 84
  out[22] = camPosLocal[2]; // byte 88
  // out[23] (byte 92) stays zero — camPosLocal's vec3 tail pad.
  out[24] = exposure; // byte 96
  out[25] = ringInnerRatio; // byte 100
  out[26] = ringOuterRatio; // byte 104
  // out[27] (bytes 108..111) stays zero — the tail pad rounding to 112.
  out.set(invMvp.subarray(0, 16), 28); // f32 28..43, byte 112..175
  return out;
}
