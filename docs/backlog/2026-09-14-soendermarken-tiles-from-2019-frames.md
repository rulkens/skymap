# Søndermarken z14–19 tiles from the 2019 skråfoto frames

**Status:** parked by the user 2026-09-14; not started.

**Problem.** The GeoDanmark forår-2025 orthophoto that feeds the z14–19 band
is bright and hazy next to the corrected EOX z13 band below it. Prototyping
the bake-time colour match (`colourMatchedImagerySource`) against it needs an
additive offset of about −70/−74/−105 sRGB, which clips 10–27% of channel
samples to black (roof shadows, north side of Pile Allé); the blue channel
nearly empties. Sigma does not change it; it is the mean term.

**Idea (user, 2026-09-14).** Source the band from the 2019-06-23 leaf-on
UltraCam Osprey frames already harvested for the scene-workbench 3D
reconstruction (`data/raw/skraafoto/skraafotos2019`, 0.10 m, 265 frames;
nadir frames are 4-band COG JPEGs that decode muddy through sharp, use the
gdal_translate recipe in the scene-workbench notes), either the nadir frames
orthorectified, or a top-down render of the baked `soendermarken-crop-2019`
OpenMVS mesh. Same vintage as the mesh the user intends to integrate into the
main app, so the ground and the 3D crop would agree.

**Options:**

- (a) Nadir frames + DHM orthorectification via gdal.
- (b) Ortho render of the textured mesh (needs a renderer path, gives exact
  agreement with the mesh).
- (c) Keep GeoDanmark and switch the colour match to a multiplicative gain in
  linear light (keeps black at black; unprototyped, and it amplifies
  near-black noise in EOX water for the other band).

**Touchpoints:** `tools/textures/geodanmarkTileSource.ts` (or a sibling
source), `buildEarthTiles.ts` band wiring, `data/raw/geodanmark/README.md`,
ATTRIBUTIONS.md (skråfoto licence), `colourMatchedImagerySource` wiring for
the GD band (note: its reference read must be at the reference's own
maxLevel and upsampled 2x before an EOX-grid reference can be used; today it
reads at canvasLevel boxes, which only an arbitrary-box source like BMNG
serves).

**Prototype panels and script:** scratchpad `land-compare/soendermarken/`
from this session (not in the repo).
