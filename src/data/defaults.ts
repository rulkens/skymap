/**
 * The defaults CORE owns — display and camera settings belonging to no Layer.
 * A Layer's own seeds live beside its slice, in
 * `src/layers/<name>/settings/defaults.ts`; only what core itself reads is here.
 */

import { ToneMapCurve, toneMapCurveSaturation } from './toneMapCurve';
import type { ToneMapCurve as ToneMapCurveT } from '../@types/data/ToneMapCurve';
import type { OrientationFrameId } from '../@types/camera/OrientationFrameId';

// ── Camera drift ────────────────────────────────────────────────────────────

/** Auto-rotate (yaw drift) defaults OFF — most users want a static frame to explore. */
export const DEFAULT_AUTO_ROTATE = false;

// ── HDR tone-mapping ────────────────────────────────────────────────────────

/**
 * Default state of the viewer's HDR display opt-in — seeds
 * `settings.hdr.enabled`. `false` even when `GpuContext.hdrCapable` is true:
 * extended-range output is a choice the viewer makes about how they want the
 * scene rendered, not a consequence of what their monitor happens to permit,
 * so boot never turns it on for them.
 */
export const DEFAULT_HDR_ENABLED = false;

/**
 * Default tone-map curve — Reinhard-extended.  Smooth highlight roll-off,
 * "natural" look.  Asinh is the filament-friendly alternative; user
 * picks via the dropdown.  See `data/toneMapCurve.ts` for the full set.
 */
export const DEFAULT_TONE_MAP_CURVE: ToneMapCurveT = ToneMapCurve.Reinhard;

/**
 * Default exposure multiplier applied before the tone-map curve.  3.0 is
 * a visual judgment: the depth fade dims overall brightness, and lower
 * values read flat at typical zoom levels with the fade on.  Stored as the
 * linear gain the shader applies, but presented as ±4 EV (0.0625×–16×) — a
 * range chosen to sit inside `clampExposure`'s GPU-safety window, so the UI
 * cannot reach a value the clamp would have to rescue.
 */
export const DEFAULT_EXPOSURE = 3.0;

/**
 * Default HDR headroom knee — the brightness above which a pixel's over-white
 * energy spills past paper-white into an extended-range swap chain. Seeds
 * `settings.hdr.knee`.
 *
 * Measured in the SAME post-exposure units the tone curve works in, and derived
 * from the default curve's saturation point, because the knee's job is to pick up
 * exactly where the curve runs out of range: a pixel at the knee is precisely one
 * the curve can no longer separate from a brighter one. Sharing the curve's units
 * keeps the two aligned as the exposure slider moves — raising exposure makes a
 * dimmer pixel saturate, and the knee follows without re-tuning. (Bloom's threshold
 * is pre-exposure instead, because bloom reads the raw buffer before the tone map;
 * the spill runs after it.)
 *
 * The five curves saturate anywhere from 1.0 to 7.24, so this default only holds
 * while the curve does — switching curve wants a nudge on the slider. Inert unless
 * the swap chain is the extended-range surface (`hdrActiveOf`).
 */
export const DEFAULT_HDR_KNEE = toneMapCurveSaturation(DEFAULT_TONE_MAP_CURVE);

/**
 * Default multiplier on the over-knee energy spilled into display headroom.
 * Seeds `settings.hdr.headroom`. 0 is exactly the SDR result — the tone
 * curve's compressed output, nothing added — so the knob spans "no headroom" to
 * "aggressive headroom" with no discontinuity at either end. 0.25 is deliberately
 * conservative: available headroom varies per display and with screen brightness,
 * so the honest default under-uses it rather than clipping on a modest panel.
 */
export const DEFAULT_HDR_HEADROOM = 0.25;

// ── Screen-space bloom ───────────────────────────────────────────────────────

/**
 * Screen-space bloom defaults ON — the mip-pyramid glow around near-saturated
 * highlights (the Sun's core, bright star bins) is part of the baseline HDR
 * look, so the effect is live from first paint. Off is a debug/perf escape
 * hatch. Seeds `settings.bloom.enabled`.
 */
export const DEFAULT_BLOOM_ENABLED = true;

/**
 * Default bloom strength — the scale on the blurred mip pyramid composited back
 * over the HDR frame. Seeds `settings.bloom.strength`. 0.8 is an eye-tuned
 * starting point: strong enough to read as a soft halo around saturated cores,
 * shy of a full 1.0 that would smear the whole highlight field. A post-build
 * tuning target (spec §4/§6).
 */
export const DEFAULT_BLOOM_STRENGTH = 0.8;

/**
 * Default bloom threshold — the HDR luminance above which a pixel contributes to
 * the bloom pyramid. Seeds `settings.bloom.threshold`. 2.0 sits well under
 * `STAR_KNEE`, holding the bloom-seeding ordering invariant
 * `DEFAULT_BLOOM_THRESHOLD < STAR_KNEE <= STAR_EMISSIVE` (see
 * `starRenderConstants.ts` for the single statement of it) with margin to spare:
 * a broad swath of the bright field, not only near-saturated cores, now seeds
 * the glow. A post-build tuning target (spec §4/§6).
 */
export const DEFAULT_BLOOM_THRESHOLD = 2.0;

// ── Scalar-volume overlay ────────────────────────────────────────────────────

/**
 * Default per-field intensity scale, in [0, 1].  0.5 is a practical
 * starting point: strong enough to see the overlay, dim enough that it
 * doesn't completely wash out the galaxy-point layer underneath.  The
 * SettingsPanel slider lets the user tune per field.
 */
export const DEFAULT_VOLUME_FIELD_INTENSITY = 0.5;

/**
 * Default renderer-wide palette LUT for the scalar-volume overlay.
 * 'viridis' is matplotlib's perceptually-uniform default — neutral
 * blue-green-yellow ramp that reads as "scientific" without leaning
 * warm or cool.  Mutated at runtime via `setVolumePalette`; persisted
 * to localStorage by the App shell so reloads keep the user's choice.
 */
export const DEFAULT_VOLUME_PALETTE_ID = 'viridis' as const;

// ── Camera lens ───────────────────────────────────────────────────────────────

/**
 * Default vertical field of view, in degrees — seeds `settings.camera.fovDeg`
 * and, via `cameraFraming.ts`'s `DEFAULT_FOV_Y_RAD`, the bootstrap lens.
 */
export const DEFAULT_FOV_DEG = 60;

// ── Camera orientation frame ─────────────────────────────────────────────────

/**
 * Default orientation frame — which astronomical pole the camera treats as "up".
 *
 * Ecliptic, not equatorial: the descent lands in the solar system, and the
 * ecliptic frame puts Earth's orbital plane flat so the planets read as a disk
 * and Earth's 23.44° obliquity is *desired* — the tilt between the equatorial
 * and ecliptic poles is exactly what makes the seasons legible in that view.
 * Booting equatorial would instead flatten Earth's equator and rake the orbital
 * plane at that same 23.44°, which is the wrong "up" for the arrival scene.
 */
export const DEFAULT_ORIENTATION: OrientationFrameId = 'ecliptic';
