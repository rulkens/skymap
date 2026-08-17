/**
 * SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC — the camera-distance gate below which the
 * true-scale foreground captions (Sun/Earth/planets/local star map) turn on.
 *
 * ### Why DERIVED from the region extent, not a hand literal
 *
 * The gate is the `solar-neighbourhood` region's extent × 4 (≈ 9.2e-3 Mpc ≈ 9.2
 * kpc) — the captions this gates ARE that region's, so it reads the extent
 * directly rather than a global roster maximum that happened to equal it. It
 * used to be a hand-typed "closer than a kiloparsec" literal — exactly the "a
 * hand-typed Mpc literal silently strands a farther seed" trap the shared
 * foreground gate's docblock warns about. The roster's deep stars (Deneb at 800
 * pc, Eta Carinae at 2300 pc) walked straight into it: any caption beyond a
 * kiloparsec was gated off before it could ever draw.
 *
 * ### Why the ×4 margin exactly
 *
 * The margin is chosen so the star-caption fade band
 * (`SCALE_FADE_BANDS.starCaption`) reaches zero for EVERY star before this gate
 * cuts the layer — the pop-free inequality. Worst case: the camera sits `gate`
 * away from a target star that itself sits `EXTENT` from the anchor, with
 * another seed up to `2·EXTENT` from that target, so the farthest star-to-camera
 * distance at the gate crossing is `gate − 2·EXTENT`. With gate = 4·EXTENT
 * that lower bound equals the band's `goneAt` (`2·EXTENT`) exactly — so no
 * star caption can still be fading when the layer switches off, and the gate cut
 * is invisible. The band reads the SAME region extent, so the inequality holds
 * by construction rather than by two constants staying in step.
 *
 * It stays deliberately TIGHTER than the shared foreground gate
 * (`FOREGROUND_MAX_DISTANCE_MPC` = the widest region extent × 100, ~25× wider): on
 * descent the bodies and the star-point backdrop appear first, the captions
 * later. `foregroundLabelsLayer`'s `enabled` ANDs both — the shared gate is what
 * lets the executor skip the whole NEAR0 foreground group (that row included) in
 * one sweep at galaxy zoom, while this constant keeps the captions' own later
 * entrance.
 *
 * It is also the OUTER edge of the Sun caption's own fade-in band
 * (`SCALE_FADE_BANDS.sunCaption`, which imports this value): the Sun's caption is
 * exactly 0 at this distance, so the fade-in cannot pop the frame the layer
 * switches on. That band auto-follows this gate by import — no separate tuning.
 *
 * Intentionally independent of the body-texture demand gates (`loadRadiusMpc`,
 * now per-body): caption onset and texture-load onset are separate tuning knobs
 * — this caption gate is a single distance-to-focus, the texture gates are
 * per-body proximity radii, so the two may be tuned apart.
 */
import { regionById } from '../../../utils/scene/regionById';

export const SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC = regionById('solar-neighbourhood').extentMpc * 4;
