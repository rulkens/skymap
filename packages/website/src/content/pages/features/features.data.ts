import type { FeatureSlide } from '../../../@types/FeatureSlide';

// The large visual takes seven of the page grid's twelve columns.
export const big = '(max-width: 900px) 100vw, min(calc(58vw - 4rem), 41rem)';

// Each gallery's slides. An accent is sampled from its picture: tests/packages/website/featureSlides.test.ts
// recomputes every one and prints the value to paste here when a picture is shot again.
export const earth: readonly FeatureSlide[] = [
  { view: 'features-earth', piece: 'ui-card-earth', fact: 'earth-rotation', accent: '#8ba7ee' },
  { view: 'features-earth-glint', piece: 'ui-clock-glint', bar: true, accent: '#8daced' },
  { view: 'features-everest', piece: 'ui-search-everest', bar: true, fact: 'everest-height', accent: '#95b5e5' },
  { view: 'features-grand-canyon', piece: 'ui-search-canyon', bar: true, fact: 'grand-canyon-depth', accent: '#d7a7a3' },
  { view: 'lead-park', piece: 'ui-card-soendermarken', bar: true, fact: 'geodanmark-orthophoto', accent: '#c9d3a7' },
];

export const solarSystem: readonly FeatureSlide[] = [
  { view: 'cut-saturn', piece: 'ui-card-saturn', fact: 'saturn-distance', accent: '#dbc29e' },
  { view: 'cut-jupiter', piece: 'ui-card-jupiter', fact: 'jupiter-distance', accent: '#d4bca5' },
  { view: 'cut-mars', piece: 'ui-card-mars', fact: 'mars-distance', accent: '#eeb18b' },
  { view: 'cut-moon', piece: 'ui-card-moon', fact: 'moon-distance', accent: '#c5b5b7' },
  { view: 'cut-io', piece: 'ui-card-io', fact: 'io-lap', accent: '#e7ca92' },
  { view: 'cut-pluto', piece: 'ui-card-pluto', fact: 'pluto-distance', accent: '#cabfb0' },
];

export const missions: readonly FeatureSlide[] = [
  {
    view: 'orbits-voyager',
    cutout: 'cut-voyager1',
    piece: 'ui-card-voyager',
    fact: 'voyager1-light-day',
    accent: '#8bee97',
  },
  { view: 'hubble', piece: 'ui-card-hubble', fact: 'hubble-mirror', accent: '#a1afd9' },
  { view: 'features-perseverance', piece: 'ui-card-perseverance', fact: 'jezero-width', accent: '#dbb79f' },
  { view: 'features-spirit', piece: 'ui-card-spirit', fact: 'spirit-drive', accent: '#eeb38b' },
];

export const milkyWay: readonly FeatureSlide[] = [
  { view: 'render-milky-way', piece: 'ui-card-milky-way', fact: 'sgr-a-distance', accent: '#eec18b' },
  { view: 'render-stars', fact: 'proxima-distance', accent: '#ccc0ae' },
  { view: 'features-s-stars', piece: 'ui-card-s2', accent: '#aaafcf' },
  { view: 'render-black-hole', piece: 'ui-card-sgr-a', fact: 'sgr-a-mass', accent: '#e6bc93' },
  { view: 'features-pleiades', piece: 'ui-card-pleiades', fact: 'pleiades-distance', accent: '#c1c5b5' },
  { view: 'features-constellations', fact: 'gloss-constellation', accent: '#cabeaf' },
];

export const cosmicWeb: readonly FeatureSlide[] = [
  { view: 'features-flow', piece: 'ui-settings-flow', fact: 'laniakea-size', accent: '#e6b894' },
  { view: 'features-web-density', piece: 'ui-settings-density', fact: 'survey-gaps', accent: '#ee8be7' },
  { view: 'features-filaments', piece: 'ui-settings-filaments', fact: 'sci-filaments', accent: '#bca3d6' },
  { view: 'features-galaxies', piece: 'ui-settings-galaxies', fact: 'observable-edge', accent: '#d3baa6' },
  { view: 'features-desi', piece: 'ui-settings-desi', fact: 'desi-dr1-count', accent: '#9fb6da' },
];

export const time: readonly FeatureSlide[] = [
  { view: 'features-time-jupiter', accent: '#cfc2aa' },
  { view: 'features-time-earth', accent: '#8ba6ee' },
  { view: 'features-time-seasons', accent: '#9dabdc' },
  { view: 'features-time-moon', accent: '#c5b5b8' },
  { view: 'features-time-voyager', accent: '#c9c4b0' },
  { view: 'features-time-planets', accent: '#cabfaf' },
];
