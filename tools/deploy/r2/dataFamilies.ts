/**
 * Every tracked `public/data/` artefact, one row per family — an allow-list,
 * since `public/data/` also holds pre-tier DisPerSE inputs (`glade.bin`,
 * `sdss.bin`, `filaments-sdss.bin`) and whatever Vite drops there in dev.
 *
 * `gzipOnWire` was measured with `gzip -6` on the real artefacts: catalogs and
 * JSON sidecars shrink 11-84% (glade-large 102→55 MB, sdss-medium 9.8→8.3 MB,
 * pgc_aliases.json 1.7→0.4 MB), raw-float32 `.mesh` bodies 45-68% (all eight
 * 29.6→16.8 MB). A `false` row is already packed, or small and unmeasured.
 */
import type { DataFamily } from '../@types/DataFamily';

export const DATA_FAMILIES: readonly DataFamily[] = [
  {
    label: 'galaxy-catalog',
    dir: null,
    // The three DESI DR1 patches are fixed regions, not tiered downsamples,
    // so they carry no tier suffix — see DESI_PATCHES in tools/catalog/.
    fileName:
      /^(?:(sdss|glade|milliquas)-(small|medium|large)\.bin|2mrs\.bin|famous\.bin|desi-(deep|wedge|sgw)\.bin)$/,
    transport: 'wrangler',
    gzipOnWire: true,
  },
  {
    label: 'star-catalog-v1',
    dir: null,
    fileName: /^stars-(small|medium|large)\.bin$/,
    transport: 'wrangler',
    // Already gzip-packed: measured ~99% of raw.
    gzipOnWire: false,
  },
  {
    label: 'star-catalog-v2-index',
    dir: 'star-catalog/v2',
    fileName: /^stars\.bin$/,
    transport: 'wrangler',
    gzipOnWire: true,
  },
  // Chunk names carry the bake's own content hash, so the manifest never hashes or names
  // them; the index lists every chunk, and `collectStarChunks` uploads them from it.
  {
    label: 'star-catalog-v2-chunks',
    dir: 'star-catalog/v2/stars',
    fileName: /^\d+-\d+\.bin$/,
    transport: 'bulk',
    gzipOnWire: true,
  },
  {
    label: 'scalar-field',
    dir: null,
    fileName:
      /^(?:(mcpm|polyphorm-2mrs|edenhofer-dust)-(small|medium|large)\.scfd|mcpm-workbench\.scfd)$/,
    transport: 'wrangler',
    gzipOnWire: true,
  },
  {
    label: 'flowfield',
    dir: null,
    fileName: /^flowfield\.scfd$/,
    transport: 'wrangler',
    // Dense packed floats: measured ~90% of raw.
    gzipOnWire: false,
  },
  {
    label: 'filament',
    dir: null,
    // `-small` is a higher DisPerSE persistence cut, ~half the size; the mobile default.
    fileName: /^(?:filaments\.bin|filaments-small\.bin)$/,
    transport: 'wrangler',
    gzipOnWire: true,
  },
  {
    label: 'structure-catalog',
    dir: null,
    fileName: /^(?:structures\.ccat|structures_meta\.json)$/,
    transport: 'wrangler',
    gzipOnWire: true,
  },
  {
    label: 'local-bubble',
    dir: null,
    fileName: /^local-bubble\.shell$/,
    transport: 'wrangler',
    // Unmeasured; a few KB, not worth a measurement.
    gzipOnWire: false,
  },
  {
    // Voyager 1/2 Horizons tracks (tools/bodies/buildSpacecraftTracks.ts).
    label: 'spacecraft-tracks',
    dir: null,
    fileName: /^spacecraftTracks\.bin$/,
    transport: 'wrangler',
    // Unmeasured.
    gzipOnWire: false,
  },
  {
    label: 'sidecar-json',
    dir: null,
    fileName:
      /^(?:famous_galaxies_meta\.json|famous_stars_meta\.json|constellations\.json|pgc_aliases\.json)$/,
    transport: 'wrangler',
    gzipOnWire: true,
  },
  // Mesh bake outputs (tools/meshes/buildMeshes.ts) sit flat under meshes/,
  // one .mesh plus fixed-role WebPs per key (`contact` only for seated keys);
  // the dir keeps a same-named stray webp elsewhere from matching.
  {
    label: 'mesh-body',
    dir: 'meshes',
    fileName: /^[a-z0-9-]+\.mesh$/,
    transport: 'wrangler',
    gzipOnWire: true,
  },
  {
    label: 'mesh-texture',
    dir: 'meshes',
    fileName: /^[a-z0-9-]+_(?:albedo|mr|normal|contact)\.webp$/,
    transport: 'wrangler',
    gzipOnWire: false,
  },
];
