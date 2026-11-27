// scalarVolume/transfer.wesl — the transfer function from a gained sample to colour: where it lands
// on the palette, how visible a step is, and how far exposure lifts it. Both measure a value's
// deviation from `center` as a fraction of the palette on center's wider side (halfRange), so a
// knob means the same share of the palette whatever the centre.

// Returns (LUT coordinate, per-step visibility). A deadband of width 1 − 1/contrast, widened by
// trim, is suppressed around `center` and the rest stretched across the palette on its own side.
fn applyContrastWindow(sampleValue: f32, contrast: f32, center: f32, trim: f32) -> vec2<f32> {
  let halfRange = max(center, 1.0 - center);
  let dev = abs(sampleValue - center) / max(halfRange, 1e-3);
  let contrastDeadband = clamp(1.0 - 1.0 / max(contrast, 1e-3), 0.0, 0.9);
  let trimDeadband = clamp(trim, 0.0, 0.95);
  let deadband = contrastDeadband + trimDeadband * (1.0 - contrastDeadband);
  let stretched = clamp(
    (dev - deadband) / max(1.0 - deadband, 1e-3),
    0.0,
    1.0,
  );
  let signedT = center + sign(sampleValue - center) * stretched * halfRange;
  let visibility = smoothstep(deadband - 0.05, deadband + 0.05, dev);
  return vec2<f32>(signedT, visibility);
}

// Exposure only past dev 0.5 from the centre: a uniform boost reads as a brightness slider, this
// lets just the peaks blow past the LUT into the tonemapped white.
fn highlightGain(signedT: f32, center: f32, exposure: f32) -> f32 {
  let halfRange = max(center, 1.0 - center);
  let dev = abs(signedT - center) / max(halfRange, 1e-3);
  let blowout = smoothstep(0.5, 1.0, dev);
  return 1.0 + blowout * max(exposure - 1.0, 0.0);
}
