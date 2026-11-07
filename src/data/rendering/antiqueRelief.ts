/** The antique look's terrain relief (`antiqueLook/relief.wesl`): which bodies' ground is
 * engraved as shadow hachures, the plate light, and the record's size. */

/** Bodies whose ground the relief pass engraves; any other keeps its plain print. */
export const ANTIQUE_RELIEF_BODIES: readonly string[] = ['mars'];

/** Above this altitude over the datum the ground is too small to engrave: no pass. */
export const ANTIQUE_RELIEF_MAX_ALT_M = 400_000;

/** From orbit the plate is lit as Hevelius lit his Moon: the real Sun's azimuth,
 * lowered to this elevation over each point's horizon. The ground keeps the real Sun. */
export const ANTIQUE_PLATE_LIGHT_ELEVATION_DEG = 18;

/** Eye altitude over the datum (m) across which ground gives way to orbit: plate light
 * and the orbit exaggeration fade in over it. */
export const ANTIQUE_RELIEF_ORBIT_ALT_M = [8_000, 25_000] as const;

/** Vertical exaggeration of the shading normal, ground and orbit (Imhof): a 3° slope
 * read from 50 km up prints as a 9° one. */
export const ANTIQUE_RELIEF_EXAGGERATION = [2, 3] as const;

/** The noise is anchored to the body on a grid of this many metres (2^12): the shader
 * hashes lattice indices offset by whole cells, so f32 never carries the body radius. */
export const ANTIQUE_RELIEF_ANCHOR_LOG2 = 12;

/** `ReliefUniforms` in `relief.wesl`; that file's table is the byte map. */
export const ANTIQUE_RELIEF_UNIFORM_BYTES = 208;

/** rg the screen fall line, b body-anchored noise, a the stroke (`relief.wesl`). */
export const ANTIQUE_RELIEF_FORMAT: GPUTextureFormat = 'rgba16float';
