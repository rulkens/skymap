/**
 * clampVolumeFieldSettings — read-edge clamp for a scalar-volume field's
 * GPU-bound render knobs.
 *
 * The store holds raw Intent (set by UI dispatch or programmatic callers
 * without range enforcement).  Clamping at the READ EDGE — in the renderer's
 * `settingsOf` closure rather than at the write path — mirrors the pattern
 * `setFlow` / `clampFlowParams` established for the flow-field subsystem: raw
 * values are preserved in the store for lossless round-trips (snapshot,
 * restore, undo), while the GPU never sees an out-of-range uniform.
 *
 * Only the five number fields that feed GPU uniforms are clamped; `paletteId`
 * and `enabled` pass through untouched — the store dispatch for those fields
 * never applies range enforcement, so the read edge leaves them as-is.
 *
 * `bands` also gets a totality guard here rather than at each call site: a
 * settings row persisted before this field existed has `bands` absent at
 * runtime despite the type saying otherwise, and every reader (chiefly
 * `deriveVolumeLiveness`) goes through this clamp, so filling in the
 * `surveyDeepZoom` default once here keeps the read edge total.
 *
 * The return value is always a NEW object — the store's raw record is never
 * mutated.
 */

import type { VolumeFieldSettings } from '../@types/settings/VolumeFieldSettings';
import { clampVolumeContrast } from './clampVolumeContrast';
import { clampVolumeDensityScale } from './clampVolumeDensityScale';
import { clampVolumeExposure } from './clampVolumeExposure';
import { clampVolumeIntensity } from './clampVolumeIntensity';
import { clampVolumeTrim } from './clampVolumeTrim';
import { SCALE_FADE_BANDS } from '../services/engine/presentation/scaleFadeBands';

export function clampVolumeFieldSettings(raw: VolumeFieldSettings): VolumeFieldSettings {
  return {
    ...raw,
    intensity: clampVolumeIntensity(raw.intensity),
    contrast: clampVolumeContrast(raw.contrast),
    densityScale: clampVolumeDensityScale(raw.densityScale),
    trim: clampVolumeTrim(raw.trim),
    exposure: clampVolumeExposure(raw.exposure),
    bands: raw.bands ?? [SCALE_FADE_BANDS.surveyDeepZoom],
  };
}
