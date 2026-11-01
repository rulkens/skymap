export const MEASURED = [
  { term: 'Directions', id: 'sci-directions' },
  { term: 'Redshifts', id: 'sci-redshifts' },
  { term: 'Stars', id: 'sci-star-observables' },
  { term: 'Galaxy brightness', id: 'sci-magnitudes' },
  { term: 'Surfaces', id: 'sci-surfaces' },
];
export const DERIVED = [
  { term: 'Galaxy distances', id: 'sci-galaxy-distance' },
  { term: 'The Hubble constant', id: 'sci-h0-range' },
  { term: 'Nearby galaxies', id: 'sci-local-volume' },
  { term: 'Two kinds of redshift', id: 'sci-two-redshifts' },
  { term: 'Star distances', id: 'sci-star-distance' },
  { term: 'Planets and moons', id: 'sci-ephemeris' },
  { term: 'Density field', id: 'sci-density-field' },
  { term: 'Filaments', id: 'sci-filaments' },
  { term: 'Flows', id: 'sci-flows' },
  { term: 'Galaxy colour', id: 'sci-colour' },
  { term: 'Clusters', id: 'sci-structures' },
];
export const DRAWN = [
  { term: 'The Milky Way', id: 'sci-milky-way' },
  { term: 'Its stars', id: 'sci-milky-way-points' },
  { term: 'The edge sphere', id: 'sci-horizon-shell' },
  { term: 'How far the data go', id: 'sci-deepest' },
  { term: 'Planet maps', id: 'sci-planet-maps' },
  { term: 'Atmospheres', id: 'sci-atmospheres' },
  { term: 'Earth’s clouds', id: 'sci-earth-clouds' },
  { term: 'Galaxy discs', id: 'sci-galaxy-discs' },
  { term: 'Galaxy tilt', id: 'sci-galaxy-tilt' },
  { term: 'DESI brightness', id: 'sci-desi-brightness' },
  { term: 'The black hole', id: 'sci-black-hole' },
  { term: 'Zone of Avoidance band', id: 'sci-zoa-band' },
  { term: 'Structure markers', id: 'sci-markers' },
  { term: 'Glow and tone', id: 'sci-tone' },
];
export const SIMPLIFIED = [
  {
    title: 'Distance',
    items: [
      { term: 'Redshift space', id: 'sim-redshift-space' },
      { term: 'Reference frame', id: 'sim-frames' },
      { term: 'Two expansion rates', id: 'sim-horizon-h0' },
      { term: 'A step at 30 megaparsecs', id: 'sim-scale-step' },
      { term: 'Estimated redshifts', id: 'sci-photometric-share' },
    ],
  },
  {
    title: 'Coverage',
    items: [
      { term: 'SDSS footprint', id: 'survey-gaps' },
      { term: '2MRS footprint', id: '2mrs-coverage' },
      { term: 'Zone of Avoidance', id: 'sim-zone' },
      { term: 'DESI', id: 'sim-desi-patches' },
      { term: 'Flux limits', id: 'sim-flux-limits' },
      { term: 'Our own dimming', id: 'sim-reweight' },
      { term: 'Data sizes', id: 'sim-data-sizes' },
      { term: 'Duplicates', id: 'sim-duplicates' },
    ],
  },
  {
    title: 'Stars, planets and time',
    items: [
      { term: 'Stars stand still', id: 'sim-star-epoch' },
      { term: 'Which stars', id: 'sim-star-coverage' },
      { term: 'Outside 1900 to 2100', id: 'sim-ephemeris-span' },
    ],
  },
  {
    title: 'Size and brightness',
    items: [
      { term: 'Exposure', id: 'sim-exposure' },
      { term: 'Quasars', id: 'sim-quasar-boost' },
      { term: 'Galaxy points', id: 'sim-point-floor' },
      { term: 'Planets and stars', id: 'sim-true-size' },
    ],
  },
];
// Every fact row the page prints is in factIds, so the Sources list cannot drift from the copy.
export const factIds = [
  ...[...MEASURED, ...DERIVED, ...DRAWN, ...SIMPLIFIED.flatMap((group) => group.items)].map(
    (item) => item.id,
  ),
  'sci-built-counts',
  'sci-cite-skymap',
  'astronomical-unit',
  'megaparsec-length',
];
export const count = SIMPLIFIED.reduce((n, group) => n + group.items.length, 0);
