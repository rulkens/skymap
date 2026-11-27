/**
 * meshShadowMap — the sun shadow array `meshBodyRenderer` keeps for mesh bodies: one
 * orthographic depth layer per slot, fitted to a body's bounding sphere, so a texel spans
 * `2 · boundingRadiusM / MESH_SHADOW_MAP_PX` metres. 1024² × 8 layers of depth16unorm is 16 MB.
 */

export const MESH_SHADOW_MAP_PX = 1024;

/** The light camera fits the bounding sphere grown by this factor (0.5%). */
export const MESH_SHADOW_SPHERE_PAD = 1.005;

/** Bodies shadowed at once, nearest the camera first; one beyond them reads unshadowed. */
export const MESH_SHADOW_SLOTS = 8;

/** Site bodies one host's surface tiles take a shadow from (`MeshShadowCasters`, lib/meshShadow.wesl). */
export const MESH_SHADOW_GROUND_CASTERS = 4;

/** A slot re-renders once the sun has moved more than 0.1° in its body's mesh frame. */
export const MESH_SHADOW_RERENDER_COS = Math.cos((0.1 * Math.PI) / 180);

/** The receiver steps off its surface by this many texels before the compare: the acne guard. */
export const MESH_SHADOW_NORMAL_OFFSET_TEXELS = 1.5;

/** In depth16unorm steps, and per unit of depth slope: the caster's half of the acne guard. */
export const MESH_SHADOW_DEPTH_BIAS = 2;
export const MESH_SHADOW_DEPTH_BIAS_SLOPE = 2;

/** Rover and ground read the array through this one descriptor, so their penumbrae agree. */
export const MESH_SHADOW_SAMPLER: GPUSamplerDescriptor = {
  label: 'mesh-shadow-sampler',
  compare: 'less-equal',
  magFilter: 'linear',
  minFilter: 'linear',
  addressModeU: 'clamp-to-edge',
  addressModeV: 'clamp-to-edge',
};
