/**
 * calibratedDiskSizeWorld — pure placement-math for a famous-galaxy
 * thumbnail's world-space size.
 *
 * A famous-galaxy WebP is a hand-curated, possibly cropped/deprojected
 * image of one galaxy. The catalog gives us a size in world units that
 * the *disk of the galaxy* should span, but a shipped WebP frames its
 * disk arbitrarily — the disk may fill only part of the frame
 * (`diskRadiusFrac < 1`). This helper is deliberately pure (no GPU, no
 * state) so it can be unit-tested exactly and reused from the
 * textured-disk subsystem without dragging in renderer plumbing.
 */

/**
 * World-space size for the *disk* (not the framed image) so the disk
 * spans the catalog's intended `diameterKpc`.
 *
 * The WebP frame is the rendered quad; `diskRadiusFrac` says how much of
 * that frame the actual disk occupies.  If the disk fills the frame
 * (`frac == 1`) the quad size already equals the catalog size.  If the
 * disk only half-fills the frame (`frac == 0.5`) we must render the quad
 * twice as large so the disk inside it still spans the catalog size.
 * Hence `catalogSizeWorld / diskRadiusFrac`.
 *
 * Guard: `deriveFamousCalibration` never emits a non-positive frac, so a
 * zero or negative value is malformed input rather than a real case.  We
 * return `catalogSizeWorld` unchanged (the disk-fills-frame default)
 * rather than producing `Infinity`/`NaN` from a div-by-zero — that keeps
 * a bad record visible-but-sane instead of blowing up the whole frame.
 */
export function calibratedDiskSizeWorld(catalogSizeWorld: number, diskRadiusFrac: number): number {
  if (diskRadiusFrac <= 0) return catalogSizeWorld;
  return catalogSizeWorld / diskRadiusFrac;
}
