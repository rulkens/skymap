// occlusionMask/io.wesl — the mask: r coverage, g km to the nearest drawn
// surface along the pixel's ray, NO_SURFACE_KM where nothing drew. textureLoad
// only: a distance filtered across a silhouette invents a surface.

// Beyond any subject (the observable universe is ~4e23 km across).
const NO_SURFACE_KM: f32 = 1.0e30;
