/**
 * SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC — the camera-distance gate below which the
 * true-scale foreground captions (Sun/Earth/planets/local star map) turn on.
 *
 * Show the captions only once the camera is closer than a kiloparsec — by then
 * the user has zoomed far past the galaxy and is clearly heading for the solar
 * system. Generous on purpose: it turns the captions on for the last several
 * decades of zoom, where the bodies are still sub-pixel and hardest to find.
 *
 * This is deliberately TIGHTER than the shared foreground gate
 * (`FOREGROUND_MAX_DISTANCE_MPC`, ~a decade wider): on descent the bodies and
 * the star-point backdrop appear first, the captions later. `foregroundLabelsLayer`'s
 * `enabled` ANDs both — the shared gate is what lets the executor skip the whole
 * NEAR0 foreground group (that row included) in one sweep at galaxy zoom, while
 * this constant keeps the captions' own later entrance.
 *
 * It is also the OUTER edge of the Sun caption's own fade-in band
 * (`SCALE_FADE_BANDS.sunCaption`, which imports this value): the Sun's caption is
 * exactly 0 at this distance, so the fade-in cannot pop the frame the layer
 * switches on.
 *
 * Intentionally independent of `EARTH_TEXTURE_MAX_DISTANCE_MPC` (the Blue
 * Marble demand gate): the two are separate tuning knobs that currently
 * coincide at 1e-3 — caption onset and texture-load onset may be tuned apart.
 */
export const SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC = 1e-3;
