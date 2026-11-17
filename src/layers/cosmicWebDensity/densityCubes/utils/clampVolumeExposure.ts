/**
 * clampVolumeExposure — clamps a volume overlay's pre-tonemap exposure
 * multiplier to [0, 32] and maps non-finite inputs to the neutral default.
 *
 * ### Why [0, 32]
 *
 * 0 extinguishes the overlay cleanly (no light contribution).  32× is already
 * deep into the tonemap's saturation region — the downstream ACESFilm (or
 * simple `x / (x + 1)`) roll-off means the user sees diminishing returns well
 * before 32, so the ceiling is effectively never reached in normal use.  It
 * exists to prevent a run-away GPU uniform rather than to restrict artistic
 * range.
 *
 * ### Why 1.0 for NaN / ±Inf
 *
 * Non-finite values must never reach the GPU uniform (`GPUDevice.queue.writeBuffer`
 * interprets them as 0 on some drivers and as garbage on others).  Falling
 * back to 1.0 keeps the overlay visible and un-scaled — a neutral default that
 * at least shows the data rather than hiding it.
 */
export function clampVolumeExposure(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(32, value)) : 1.0;
}
