import type { DataSourceNote } from '../@types/DataSourceNote';

/**
 * The hand-written part of the data pages, by entry id of `ATTRIBUTIONS.md`:
 * what a source becomes in the app, a paragraph on the major ones, and a
 * shorter title where the rule cuts a heading badly. No licence, credit line
 * or address is here; those are the record's. Each `about` and `shows` says
 * only what docs/DATA.md, the settings tables (data/docsSettings.ts) or the
 * named fact rows say; statements about the sky are left to the `facts` rows,
 * which carry their sources. tests/packages/website/dataPages.test.ts fails
 * on an id the record does not have and on an anchor or fact that is gone.
 */
export const DATA_SOURCE_NOTES: Readonly<Record<string, DataSourceNote>> = {
  // Stars
  gaia: {
    about:
      'Nearly every star in skymap is a row of Gaia’s third data release. We read the stars brighter than magnitude 14 in Gaia’s own G band, join a distance estimate to each, and add two smaller catalogues for the stars that this cut or Gaia’s detectors miss: the nearby faint ones and the very bright ones.',
    facts: ['sci-star-observables', 'sci-star-distance', 'sim-star-coverage', 'sim-star-epoch'],
    shows:
      'The star points, switched by “Gaia Stars” under Star catalogs in the Settings panel. The stars that have a name in the app come from a list of their own and are taken out of this one, so none is drawn twice.',
    scene: 'stars',
    setting: 'star-catalogs',
    view: { to: 'focus=star-sun', label: 'Open the Sun' },
  },
  'bailer-jones': {
    facts: ['sci-star-distance'],
    shows: 'Nothing you can switch: it is the distance of each Gaia star, so it decides where the star stands.',
    scene: 'stars',
  },
  gcns: {
    facts: ['sim-star-coverage'],
    shows: 'The faint stars within 100 parsecs of the Sun, part of “Gaia Stars”. No data size drops them for being faint.',
    scene: 'stars',
    setting: 'star-catalogs',
  },
  hipparcos: {
    facts: ['sim-star-coverage'],
    shows: 'The brightest stars in the sky, part of “Gaia Stars”, in place of the Gaia rows they match.',
    scene: 'stars',
    setting: 'star-catalogs',
  },
  'd3-celestial': {
    shows: 'The constellation lines, which are off when the app opens. Their switch is under Labels & Guides.',
    scene: 'stars',
    setting: 'labels--guides',
  },
  'seed-famous-stars': {
    shows: 'The named stars and the Sun: the stars the search finds by name and that have a card with a description.',
    scene: 'stars',
    setting: 'star-catalogs',
    view: { to: 'focus=star-betelgeuse', label: 'Open Betelgeuse' },
  },
  's-stars': {
    shows: 'The stars in orbit around the black hole at the centre of the Milky Way, switched by “S-Star” under Star catalogs.',
    scene: 'the-milky-way',
    setting: 'star-catalogs',
    view: { to: 'focus=blackhole-sgr-a-star', label: 'Open Sagittarius A*' },
  },
  s301: {
    shows: 'One more of the stars in orbit around the black hole at the centre of the Milky Way.',
    scene: 'the-milky-way',
    view: { to: 'focus=blackhole-sgr-a-star', label: 'Open Sagittarius A*' },
  },
  'gravity-r0': {
    shows: 'The mass given to the black hole at the centre of the Milky Way, and the scale of the star orbits around it.',
    scene: 'the-milky-way',
    view: { to: 'focus=blackhole-sgr-a-star', label: 'Open Sagittarius A*' },
  },

  // Galaxies
  sdss: {
    about:
      'SDSS gives a galaxy a spectrum, and with it a measured redshift. We run one query of our own against its seventeenth data release, which returns about 970,000 galaxies with their positions, redshifts, brightness in five bands and shapes. The query, and the trap in running it, are on the pipeline page.',
    facts: ['survey-gaps', 'sci-redshifts', 'sim-flux-limits', 'sim-data-sizes'],
    shows:
      'The galaxy points switched by “SDSS” under Galaxy catalogs. Far out they stand in two fans. The smallest data size loads none of them.',
    scene: 'the-galaxy-surveys',
    setting: 'galaxy-catalogs',
    figure: 'science-wedges',
  },
  '2mrs': {
    about:
      '2MRS is the redshift survey of the brightest galaxies of the 2MASS infrared sky survey. We read its table 3: one row a galaxy, with a position, a velocity and three infrared magnitudes. It is small enough that every data size loads all of it.',
    facts: ['2mrs-coverage', 'sim-frames', 'sim-flux-limits'],
    shows:
      'The galaxy points switched by “2MRS” under Galaxy catalogs: the nearby universe over nearly the whole sky. Together with GLADE it is also what the filaments are traced from.',
    scene: 'the-galaxy-surveys',
    setting: 'galaxy-catalogs',
  },
  '2mass-xsc': {
    facts: ['sci-galaxy-tilt'],
    shows: 'Nothing you can switch: where it has a measurement, it sets the tilt and flattening of a 2MRS galaxy’s disc.',
    scene: 'the-galaxy-surveys',
  },
  glade: {
    about:
      'GLADE is a list of galaxies over the whole sky, put together from several older catalogues. It fills the regions SDSS never observed, at the cost of mixing measured redshifts with estimated ones.',
    facts: ['sci-photometric-share', 'sim-duplicates'],
    shows:
      'The galaxy points switched by “GLADE” under Galaxy catalogs: the largest set of galaxy points in the scene. The search finds a GLADE galaxy by its designation.',
    scene: 'the-galaxy-surveys',
    setting: 'galaxy-catalogs',
  },
  hyperleda: {
    about:
      'HyperLEDA is a database that gathers published measurements of galaxies under one number each, the PGC number. We ask it for three things: the tilt and size of GLADE’s galaxies, a distance for nearby galaxies that Cosmicflows-4 does not cover, and the names a galaxy is known by. Our copy of the tilt table is partial, about 52,000 of GLADE’s galaxies.',
    facts: ['sci-local-volume', 'sci-galaxy-tilt'],
    shows:
      'Nothing you can switch. It is in the tilt of a GLADE galaxy’s disc, in where some nearby galaxies stand, and in the names and numbers the search accepts.',
    scene: 'nearby-galaxies',
  },
  milliquas: {
    about:
      'Milliquas is a compilation of published quasars and other active galactic nuclei. We keep the rows that have a usable redshift and place each by it. They skip the step that removes duplicates between catalogues: a quasar and the galaxy around it are two things at one position.',
    facts: ['sci-deepest', 'sim-quasar-boost'],
    shows: 'The points switched by “Milliquas” under Galaxy catalogs: the most distant objects in the scene.',
    scene: 'the-galaxy-surveys',
    setting: 'galaxy-catalogs',
  },
  desi: {
    about:
      'From DESI’s first data release we read the large-scale-structure catalogues of four classes of target and cut three regions out of them. They are samples that show how much deeper DESI reaches than the older surveys; they are not a map of the sky.',
    facts: ['sim-desi-patches', 'sci-desi-brightness'],
    shows:
      'Three switches under Galaxy catalogs, all off when the app opens: “DESI Deep Field”, “DESI Wedge” and “Sloan Great Wall”. The file of each is fetched the first time its switch goes on.',
    scene: 'the-galaxy-surveys',
    setting: 'galaxy-catalogs',
  },
  'cf4-distances': {
    about:
      'Cosmicflows-4 is a catalogue of galaxy distances measured by methods that do not use redshift. We take one number a galaxy from its table 2 and use it only inside 30 megaparsecs, where a redshift says more about a galaxy’s own motion than about its distance.',
    facts: ['sci-local-volume', 'sim-scale-step'],
    shows:
      'Nothing you can switch: it moves nearby galaxy points to their measured distance. The card of such a galaxy still gives the published redshift.',
    scene: 'nearby-galaxies',
  },
  'seed-famous-galaxies': {
    shows: 'The named galaxies: the ones the search finds by name, with a photograph and a description on the card. Their switch is “Famous” under Galaxy catalogs.',
    scene: 'nearby-galaxies',
    setting: 'galaxy-catalogs',
    view: { to: 'focus=m31', label: 'Open Andromeda' },
  },
  'seed-local-volume': {
    facts: ['sci-local-volume'],
    shows: 'Nothing you can switch: it places a handful of nearby galaxies that the two distance catalogues miss.',
    scene: 'nearby-galaxies',
  },

  // Structures and fields
  mcxc: {
    about:
      'MCXC is a catalogue of galaxy clusters detected in X-rays, compiled from earlier catalogues. We keep the most massive and draw a marker for each, unless a cluster we placed by hand stands at the same spot.',
    facts: ['sci-structures', 'sci-markers'],
    shows: 'Cluster markers and their names, switched by “Clusters” under Structures.',
    scene: 'clusters-superclusters-and-voids',
    setting: 'structures',
  },
  mscc: {
    about:
      'MSCC is a catalogue of superclusters, each a group of the clusters of the Abell catalogue. We keep the richest and draw a marker for each, unless a supercluster we placed by hand stands at the same spot.',
    facts: ['sci-structures', 'sci-markers'],
    shows: 'Supercluster markers and their names, switched by “Superclusters” under Structures.',
    scene: 'clusters-superclusters-and-voids',
    setting: 'structures',
  },
  'seed-structures': {
    title: 'Featured structures, placed by hand',
    facts: ['sci-structures', 'sci-markers'],
    shows: 'Every void and galaxy group in the scene, and the clusters and superclusters we placed by hand, each with a paragraph on its card.',
    scene: 'clusters-superclusters-and-voids',
    setting: 'structures',
    figure: 'void-bootes',
  },
  'mcpm-vac': {
    about:
      'The glow of the cosmic web is not an image. It is a density field that the catalogue’s authors computed from the positions of SDSS galaxies, which we reduce to three sizes and draw as light.',
    facts: ['sci-density-field'],
    shows: 'The purple and orange glow, switched by “MCPM Cosmic Web” under Cosmic web density.',
    scene: 'filaments-and-the-cosmic-web',
    setting: 'cosmic-web-density',
    figure: 'science-web-density',
  },
  polyphorm: {
    shows: 'A second density field, from our own run of the program on 2MRS: “Polyphorm (2MRS)” under Cosmic web density.',
    scene: 'filaments-and-the-cosmic-web',
    setting: 'cosmic-web-density',
  },
  cf4pp: {
    about:
      'CF4++ is a reconstruction built on the Cosmicflows-4 distances: where the matter around us is and how it moves apart from the expansion. We draw its mean velocity field.',
    facts: ['sci-flows'],
    shows: 'The flow lines switched by “Flow” in the Settings panel. The Cosmic Flows exhibit draws them.',
    setting: 'flow',
    view: { to: 'exhibit=cosmicFlows', label: 'Open the Cosmic Flows exhibit' },
  },

  // Solar System
  'jpl-elements': {
    about:
      'A planet’s place at a given moment starts from six numbers that describe its orbit. JPL publishes such elements for the planets and for the moons; we typed them into the app, and correct the result against JPL’s Horizons service.',
    facts: ['sci-ephemeris', 'sim-ephemeris-span'],
    shows: 'Where every planet and moon is at the date on the clock.',
    scene: 'planets-and-their-moons',
    figure: 'lesson-solar-system',
  },
  horizons: {
    about:
      'Horizons is JPL’s service for the positions of Solar System bodies. We asked it where the eight planets and 18 moons are at steps from 1900 to 2100, fitted a small correction to our own orbits from the answers, and ship the corrections only.',
    facts: ['sci-ephemeris', 'sim-ephemeris-span'],
    shows: 'Nothing you can switch: it is why a planet stands within 1,000 kilometres of where JPL puts it, between 1900 and 2100.',
    scene: 'planets-and-their-moons',
    view: { to: 'exhibit=solarSystem', label: 'Open the Solar System exhibit' },
  },
  'seed-planet-facts': {
    shows: 'The figures and the paragraph on the card of each planet, moon and spacecraft.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-saturn', label: 'Open Saturn and its card' },
  },

  // Imagery
  'famous-curated': {
    shows: 'The photograph on a named galaxy: in the scene when you are close, and on its card.',
    scene: 'nearby-galaxies',
    view: { to: 'focus=m31', label: 'Open Andromeda' },
  },
  wikipedia: {
    title: 'Wikipedia photographs and descriptions',
    shows: 'The photograph of three named galaxies, and text behind the descriptions of the named galaxies.',
    scene: 'nearby-galaxies',
  },
  'solar-system-scope': {
    about:
      'The maps of seven planets and the Moon, and of Saturn’s rings, are Solar System Scope’s. Its own page says where they depart from the spacecraft data.',
    facts: ['sci-planet-maps'],
    shows: 'The surface of Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune and the Moon, and Saturn’s rings.',
    scene: 'planets-and-their-moons',
    figure: 'saturn',
  },
  'usgs-galilean': {
    title: 'USGS mosaics of Io, Europa, Ganymede, Callisto',
    facts: ['sci-surfaces'],
    shows: 'The surfaces of Jupiter’s four large moons.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-io', label: 'Open Io' },
  },
  'usgs-enceladus': {
    facts: ['sci-surfaces'],
    shows: 'The surface of Enceladus.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-enceladus', label: 'Open Enceladus' },
  },
  'photojournal-saturn-moons': {
    title: 'NASA Photojournal: maps of five Saturn moons',
    facts: ['sci-surfaces'],
    shows: 'The surfaces of Mimas, Tethys, Dione, Rhea and Iapetus.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-iapetus', label: 'Open Iapetus' },
  },
  'schenk-uranian': {
    facts: ['sci-surfaces'],
    shows: 'The surfaces of Miranda, Ariel, Umbriel, Titania and Oberon, and the relief of Miranda and Ariel.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-miranda', label: 'Open Miranda' },
  },
  'usgs-pluto-charon': {
    facts: ['sci-surfaces'],
    shows: 'The surfaces of Pluto and Charon.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-pluto', label: 'Open Pluto' },
  },
  'nasa-pluto-colour': {
    title: 'NASA Pluto colour maps',
    shows: 'The colour of Pluto. Its detail is the USGS mosaic’s.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-pluto', label: 'Open Pluto' },
  },
  'usgs-triton': {
    facts: ['sci-surfaces'],
    shows: 'The surface of Triton.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-triton', label: 'Open Triton' },
  },
  'nasa-blue-marble': {
    about:
      'Earth seen whole is NASA’s Blue Marble: one month of satellite imagery, with separate maps for the night lights, the clouds and the water. The same month is also the coarse levels of the tiles the app fetches as you come down, so the two never show different seasons side by side.',
    facts: ['sci-earth-clouds', 'sci-surfaces'],
    shows: 'Earth’s surface from far away and down to tile level 7, its night side and its clouds.',
    scene: 'earth-and-its-surface',
    figure: 'earth-terminator',
  },
  eox: {
    title: 'EOxCloudless (Sentinel-2)',
    about:
      'Closer to the ground than Blue Marble reaches, in regions we chose, Earth is EOxCloudless: a cloud-free mosaic of Sentinel-2 satellite imagery. We re-tile it at levels 8 to 13 and match its colour to Blue Marble, separately for land and water, so the join between the two holds.',
    shows: 'Earth’s surface in the chosen regions as you come down. Outside them the surface stays Blue Marble.',
    scene: 'earth-and-its-surface',
  },
  geodanmark: {
    shows: 'The ground of Søndermarken, a park in Copenhagen, at tile levels 14 to 19: the sharpest imagery in the app.',
    scene: 'earth-and-its-surface',
    view: { to: 'focus=body-soendermarken', label: 'Open Søndermarken' },
  },
  viking: {
    shows: 'The colour of Mars as you come down to the ground, and the colour given to the grey close-ups at two rover sites.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-mars', label: 'Open Mars' },
  },

  // Terrain
  etopo: {
    shows: 'The height of Earth’s land everywhere: the relief you see when you come down to the ground.',
    scene: 'earth-and-its-surface',
  },
  skadi: {
    shows: 'The height of the ground under the regions that have sharper imagery.',
    scene: 'earth-and-its-surface',
  },
  dhm: {
    shows: 'The height of the ground under Søndermarken, and the laser scan the park’s model was built on.',
    scene: 'earth-and-its-surface',
    view: { to: 'focus=body-soendermarken', label: 'Open Søndermarken' },
  },
  mola: {
    shows: 'The height of the ground of Mars.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-mars', label: 'Open Mars' },
  },
  'hirise-gale': {
    shows: 'The ground at Curiosity’s site, in height and in colour.',
    scene: 'spacecraft',
    view: { to: 'focus=body-curiosity', label: 'Open Curiosity' },
  },
  'hirise-jezero': {
    shows: 'The ground at Perseverance’s site, in height and in colour.',
    scene: 'spacecraft',
    view: { to: 'focus=body-perseverance', label: 'Open Perseverance' },
  },
  'hirise-dtm': {
    shows: 'The ground at Spirit’s and Opportunity’s sites, in height and in a grey photograph coloured from the Viking mosaic.',
    scene: 'spacecraft',
    view: { to: 'focus=body-opportunity', label: 'Open Opportunity' },
  },
  gaskell: {
    title: 'Gaskell shape models of three Saturn moons',
    shows: 'The relief shading of Mimas, Tethys and Dione. No pixel of the models themselves is shipped.',
    scene: 'planets-and-their-moons',
  },
  'schenk-enceladus-dem': {
    shows: 'The relief shading of Enceladus.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-enceladus', label: 'Open Enceladus' },
  },
  'schenk-triton-dem': {
    shows: 'The relief shading of part of Triton.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-triton', label: 'Open Triton' },
  },
  'svs-moon-kit': {
    shows: 'The relief shading of the Moon.',
    scene: 'the-moon',
    view: { to: 'focus=body-moon', label: 'Open the Moon' },
  },

  // Models
  'mesh-whale': {
    shows: 'The whale in orbit around Earth.',
    view: { to: 'focus=body-whale', label: 'Open the whale' },
  },
  'mesh-petunias': {
    shows: 'The bowl of petunias in orbit around Earth, behind the whale.',
    view: { to: 'focus=body-petunias', label: 'Open the petunias' },
  },
  'mesh-voyager': {
    shows: 'Voyager 1 and Voyager 2.',
    scene: 'spacecraft',
    figure: 'place-voyager1',
  },
  'mesh-hubble': {
    shows: 'The Hubble Space Telescope in its orbit around Earth.',
    scene: 'spacecraft',
    figure: 'hubble',
  },
  'mesh-perseverance': {
    shows: 'The Perseverance rover on Mars.',
    scene: 'spacecraft',
    view: { to: 'focus=body-perseverance', label: 'Open Perseverance' },
  },
  'mesh-curiosity': {
    shows: 'The Curiosity rover on Mars.',
    scene: 'spacecraft',
    view: { to: 'focus=body-curiosity', label: 'Open Curiosity' },
  },
  'mesh-mer': {
    title: '"Mars Exploration Rover" (Spirit, Opportunity)',
    shows: 'The rovers Spirit and Opportunity on Mars.',
    scene: 'spacecraft',
    view: { to: 'focus=body-spirit', label: 'Open Spirit' },
  },
  skraafoto: {
    shows: 'The model of Søndermarken, a park in Copenhagen, standing on Earth.',
    scene: 'earth-and-its-surface',
    view: { to: 'focus=body-soendermarken', label: 'Open Søndermarken' },
  },
};
