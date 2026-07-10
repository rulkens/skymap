# Earth surface texture — Blue Marble

`blue-marble-4k.jpg` clothes the true-scale Earth sphere the zoom-to-Earth
descent lands on (`src/services/gpu/renderers/earthRenderer.ts`, fetched by
`src/services/engine/phases/initGpu.ts` from `SCENE_EARTH.textureUrl`).

## Provenance

- **Dataset:** Blue Marble: Next Generation — NASA Earth Observatory / NASA
  Visible Earth. Monthly global true-colour composite (topography + bathymetry).
- **Specific image:** `world.topo.bathy.200412.3x5400x2700.jpg` (December 2004,
  5400×2700 equirectangular).
- **Upstream URL:**
  `https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg`
- **Fetched:** 2026-07-10.
- **Licence:** NASA imagery — public domain (no restrictions on use;
  attribution to "NASA Earth Observatory" appreciated). See
  <https://visibleearth.nasa.gov/image-use-policy>.

## Processing

The upstream 5400×2700 JPEG (~2.5 MB) was downscaled to 4096×2048 (a 2:1
equirectangular ratio, ~1.7 MB) so the committed shell asset stays small while
remaining sharp at close approach:

```
sips -z 2048 4096 world.topo.bathy.200412.3x5400x2700.jpg --out blue-marble-4k.jpg
```

## Orientation

Equirectangular: u wraps west→east (0°→360° longitude), the north pole is the
image's TOP row. `earthRenderer` uploads with `flipY: true` so texture v=0 maps
to the image's bottom (south) row, matching `uvSphereMesh`'s south-first v — the
fragment shader samples the raw mesh uv with no remapping.
