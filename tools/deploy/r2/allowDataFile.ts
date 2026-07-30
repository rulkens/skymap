/**
 * Which flat `public/data/` files belong in R2.
 *
 * An allow-list, not a deny-list: `public/data/` also holds pre-tier build
 * artefacts (`glade.bin`, `sdss.bin`) and diagnostics (`filaments-sdss.bin`)
 * that only the offline DisPerSE pipeline reads, plus whatever Vite drops
 * there during dev. Naming the runtime fetch surface explicitly means a new
 * local file can never silently start costing bandwidth.
 */
export const allowDataFile = (name: string): boolean =>
  /^(sdss|glade)-(small|medium|large)\.bin$/.test(name) ||
  /^milliquas-(small|medium|large)\.bin$/.test(name) ||
  /^stars-(small|medium|large)\.bin$/.test(name) ||
  /^mcpm-(small|medium|large)\.scfd$/.test(name) ||
  name === '2mrs.bin' ||
  name === 'famous.bin' ||
  // The three DESI DR1 patches are fixed regions, not tiered downsamples,
  // so they carry no tier suffix — see DESI_PATCHES in tools/catalog/.
  name === 'desi-deep.bin' ||
  name === 'desi-wedge.bin' ||
  name === 'desi-sgw.bin' ||
  name === 'filaments.bin' ||
  // Higher DisPerSE persistence cut, ~half the size; the mobile default.
  name === 'filaments-small.bin' ||
  name === 'famous_galaxies_meta.json' ||
  name === 'famous_stars_meta.json' ||
  name === 'cf4_density.scfd' ||
  name === 'flowfield.scfd' ||
  name === 'structures.ccat' ||
  name === 'structures_meta.json' ||
  name === 'constellations.json';
