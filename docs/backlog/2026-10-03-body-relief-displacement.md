# Real relief displacement for near-spherical bodies

`texturedBody` ray-traces an analytic sphere on a proxy shell, so there are no
surface vertices to displace; relief today is normal-map shading only (Moon,
Mimas), which cannot move the silhouette or the terminator's edge.

## Proposed shape

A sibling rasterised path, opted into by a `height` texture kind:

- the densest `uvSphereMesh` (~360x180, the 16-bit index cap; ~3.5 km/vertex on
  Mimas);
- a height map sampled in the vertex shader, 16-bit packed as radius minus a
  datum, so a triaxial figure rides along;
- fine detail stays in the normal map;
- `texturedBody` lighting reused, plus a matching pick variant.

## Candidates

Mimas, Tethys, Dione (Gaskell shape models on PDS SBN); Enceladus (Schenk 2024
DEM); Charon and Pluto (USGS New Horizons DEMs).

## Open questions

- `reliefM` for satellites: camera altitude and picking still assume a sphere.
- Pole pinching in a uv sphere.
- Whether highly irregular bodies (Phobos, Deimos, Hyperion) should go through
  the mesh-body pipeline instead.
