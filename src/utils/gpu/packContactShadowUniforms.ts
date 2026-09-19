/**
 * packContactShadowUniforms — pure packer for the 128-byte
 * `ContactShadowUniforms` struct (`shaders/bodies/contactShadow/io.wesl`).
 * Takes both matrices already narrowed: the f64 compose and its inverse happen
 * in `composeContactDecalMatrices`, never here.
 */

import {
  CONTACT_SHADOW_BOX_TO_CLIP_FLOAT,
  CONTACT_SHADOW_CLIP_TO_BOX_FLOAT,
  CONTACT_SHADOW_UNIFORM_FLOATS,
} from '../../data/mesh/contactShadowUniformLayout';

export function packContactShadowUniforms(
  boxToClip: Float32Array,
  clipToBox: Float32Array,
): Float32Array {
  const out = new Float32Array(CONTACT_SHADOW_UNIFORM_FLOATS);
  out.set(boxToClip, CONTACT_SHADOW_BOX_TO_CLIP_FLOAT);
  out.set(clipToBox, CONTACT_SHADOW_CLIP_TO_BOX_FLOAT);
  return out;
}
