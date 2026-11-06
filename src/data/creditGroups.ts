/**
 * The data sources, grouped: the public-facing summary of ATTRIBUTIONS.md (the full licence terms
 * live there). The Splash renders them as "<label> (<name>, <name>), <label> (…)", so order is the
 * sentence's; the desktop app's About lists them too.
 */
export const CREDIT_GROUPS = [
  {
    label: 'galaxy surveys',
    sources: [
      { name: 'SDSS', url: 'https://www.sdss.org/' },
      { name: 'GLADE', url: 'https://glade.elte.hu/' },
      { name: '2MRS', url: 'https://lambda.gsfc.nasa.gov/product/2mass/' },
      { name: 'Milliquas', url: 'https://heasarc.gsfc.nasa.gov/W3Browse/all/milliquas.html' },
      { name: 'DESI DR1', url: 'https://data.desi.lbl.gov/' },
    ],
  },
  {
    label: 'stars',
    sources: [
      { name: 'Gaia DR3', url: 'https://www.cosmos.esa.int/web/gaia/dr3' },
      { name: 'Hipparcos-2', url: 'https://cdsarc.cds.unistra.fr/viz-bin/cat/I/311' },
    ],
  },
  {
    label: 'Earth',
    sources: [
      { name: 'Blue Marble', url: 'https://visibleearth.nasa.gov/collection/1484/blue-marble' },
      { name: 'EOX Sentinel-2', url: 'https://cloudless.eox.at' },
    ],
  },
  {
    label: 'orbits',
    sources: [{ name: 'JPL', url: 'https://ssd.jpl.nasa.gov/' }],
  },
] as const;
