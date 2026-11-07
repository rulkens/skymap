import type { AntiqueReliefBody } from '../../@types/rendering/AntiqueReliefBody';

/** The antique look's terrain relief (`antiqueLook/relief.wesl`): which bodies' ground is
 * engraved as shadow hachures, the plate light, and the record's size. */

/** Bodies whose ground the relief pass engraves, and how; any other keeps its plain print.
 * Mars: HiRISE's metre, Imhof's exaggeration (a 3° slope read from 50 km up prints as a
 * 9° one), every landform stroked, inked by the plain render's shade. Earth: ETOPO's z7
 * posts ~2.4 km apart outside the skadi boxes, so the exaggeration lifts the coarse mesh's ranges off the flats; only the
 * shade side inked, as a 1690 engraver drew a mountain (hachures by slope are Lehmann's,
 * 1799); handed over from the map's molehills (ANTIQUE_MAP_DETAIL levels 7..8). */
export const ANTIQUE_RELIEF_BODIES: Readonly<Record<string, AntiqueReliefBody>> = {
  mars: { cellM: 1, exaggeration: [2, 3], slopeInk: 1, wideNormal: false, revealDetail: null },
  earth: { cellM: 1500, exaggeration: [2, 2.5], slopeInk: 0, wideNormal: true, revealDetail: [7, 8] },
};

/** Above this altitude over the datum the ground is too small to engrave: no pass. */
export const ANTIQUE_RELIEF_MAX_ALT_M = 400_000;

/** From orbit the plate is lit as Hevelius lit his Moon: the real Sun's azimuth,
 * lowered to this elevation over each point's horizon. The ground keeps the real Sun. */
export const ANTIQUE_PLATE_LIGHT_ELEVATION_DEG = 18;

/** Eye altitude over the datum (m) across which ground gives way to orbit: plate light
 * and the orbit exaggeration fade in over it. */
export const ANTIQUE_RELIEF_ORBIT_ALT_M = [8_000, 25_000] as const;

/** The noise is anchored to the body on a grid of this many metres (2^12): the shader
 * hashes lattice indices offset by whole cells, so f32 never carries the body radius. */
export const ANTIQUE_RELIEF_ANCHOR_LOG2 = 12;

/** `ReliefUniforms` in `relief.wesl`; that file's table is the byte map. */
export const ANTIQUE_RELIEF_UNIFORM_BYTES = 224;

/** rg the screen fall line, b body-anchored noise, a the stroke (`relief.wesl`). */
export const ANTIQUE_RELIEF_FORMAT: GPUTextureFormat = 'rgba16float';
