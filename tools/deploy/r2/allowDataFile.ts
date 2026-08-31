/**
 * Which `public/data/` files are tracked: hashed by `buildDataManifest`,
 * named in `manifest.json`, and uploaded to R2 — an allow-list, not a
 * deny-list, since `public/data/` also holds pre-tier DisPerSE inputs
 * (`glade.bin`, `sdss.bin`, `filaments-sdss.bin`) and whatever Vite drops
 * there during dev. `public/data/` is no longer flat — five binary families
 * each sit under their own `<family>/v<N>/` epoch folder — so this matches
 * by basename, normalized through `logicalDataName`, at any depth except
 * the path-stable `images/` subtree (collected separately).
 */
import { basename } from 'node:path';

import { logicalDataName } from '../../utils/data/logicalDataName';

export const allowDataFile = (path: string): boolean => {
  const posixPath = path.replace(/\\/g, '/');
  if (posixPath === 'images' || posixPath.startsWith('images/')) return false;

  const name = logicalDataName(basename(posixPath));
  return (
    /^(sdss|glade)-(small|medium|large)\.bin$/.test(name) ||
    /^milliquas-(small|medium|large)\.bin$/.test(name) ||
    /^stars-(small|medium|large)\.bin$/.test(name) ||
    /^mcpm-(small|medium|large)\.scfd$/.test(name) ||
    /^polyphorm-2mrs-(small|medium|large)\.scfd$/.test(name) ||
    /^edenhofer-dust-(small|medium|large)\.scfd$/.test(name) ||
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
    name === 'mcpm-workbench.scfd' ||
    name === 'structures.ccat' ||
    name === 'structures_meta.json' ||
    name === 'constellations.json' ||
    name === 'pgc_aliases.json'
  );
};
