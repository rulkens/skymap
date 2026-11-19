// occlusionMask/io.wesl — the mask's contract with whoever reads it: r is
// coverage, g is the distance to the nearest drawn surface along the pixel's
// ray in km, or NO_SURFACE_KM where nothing drew. Read with textureLoad only:
// a filtered distance across a silhouette invents a surface that is not there.

// Far beyond any subject (the observable universe is ~4e23 km across), and
// still exact in f32.
const NO_SURFACE_KM: f32 = 1.0e30;
