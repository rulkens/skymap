/**
 * galaxyLodBands — the apparent-size (px) thresholds at which a galaxy hands off
 * between rendering LOD tiers. One source of truth for the whole ladder, which
 * was previously split across three subsystem files (and cross-imported between
 * two of them).
 *
 * The ladder, by ascending on-screen size:
 *
 *   < 4 px         point sprite only — no disk          (DISK_THRESHOLD_PX)
 *   8  → 14 px     point sprite → procedural disk       (PROCEDURAL_DISK_FADE_START/END_PX)
 *   24 → 40 px     procedural → textured disk           (APPARENT_SIZE_THRESHOLD_PX + FADE_BAND_PX)
 *   120 → 160 px   textured → hi-res                    (HI_RES_TRIGGER_PX + HI_RES_FADE_BAND_PX)
 *
 * Each crossfade is a smoothstep across [start, start+band] (or [start, end]),
 * so the planner that owns each tier reads the same edges and the passes stay
 * in lockstep.
 */

/** Disks render above this apparent size; below it the point sprite carries. */
export const DISK_THRESHOLD_PX = 4;

/**
 * Point-sprite → procedural-disk crossfade band (px). Below the start the
 * sprite carries fully and the disk is skipped; the disk smoothsteps in across
 * the band.
 */
export const PROCEDURAL_DISK_FADE_START_PX = 8;
export const PROCEDURAL_DISK_FADE_END_PX = 14;

/**
 * Procedural → textured-disk crossfade start. The textured disk fades IN from
 * this apparent size; the procedural disk fades OUT across the same band so the
 * two passes hand off in lockstep (the famous-WebP crossfade).
 */
export const APPARENT_SIZE_THRESHOLD_PX = 24;
/**
 * Width of the procedural → textured crossfade band (px). 16 px lets the eye
 * register the handoff at typical fly-in speeds; narrower bands flash by.
 */
export const FADE_BAND_PX = 16;

/**
 * Textured → hi-res gate: a famous galaxy must reach this apparent size before
 * the hi-res LOD-3 array is touched. The textured atlas-tile fade-OUT stays in
 * lockstep with it.
 */
export const HI_RES_TRIGGER_PX = 120;
/**
 * Hi-res crossfade band: the alpha ramps 0 → 1 across
 * [HI_RES_TRIGGER_PX, HI_RES_TRIGGER_PX + HI_RES_FADE_BAND_PX]. 40 px gives the
 * eye time to register the handoff — narrower flashes; wider lets the soft
 * 128 px atlas tile dominate too long after it starts to pixel-double.
 */
export const HI_RES_FADE_BAND_PX = 40;
