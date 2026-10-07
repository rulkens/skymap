import type { DataSourceNote } from '../@types/DataSourceNote';

/**
 * The hand-written part of the data pages, by entry id of `ATTRIBUTIONS.md`:
 * one sentence on what each source is, what it becomes in the app, a paragraph
 * on the major ones, and a title where the record's heading is a file's name.
 * No licence, credit line or address is here; those are the record's. Each `about` and `shows` says
 * only what docs/DATA.md, the settings tables (data/docsSettings.ts) or the
 * named fact rows say; statements about the sky are left to the `facts` rows,
 * which carry their sources. tests/packages/website/dataPages.test.ts fails
 * on an id the record does not have and on a fact or picture that is gone.
 * A `view` must open a frame in which the source is drawn; each was opened
 * in the app on 2026-10-07, and one that shows a surface carries the date and
 * time at which that surface was lit.
 */
export const DATA_SOURCE_NOTES: Readonly<Record<string, DataSourceNote>> = {
  // Stars
  gaia: {
    description:
      'The European Space Agency’s star catalogue: position, brightness and colour of the 16.8 million stars brighter than magnitude 14.',
    about:
      'Nearly every star in skymap is a row of Gaia’s third data release. We read the stars brighter than magnitude 14 in Gaia’s own G band, join a distance estimate to each, and add two smaller catalogues for the stars that this cut or Gaia’s detectors miss: the nearby faint ones and the very bright ones.',
    facts: ['sci-star-observables', 'sci-star-distance', 'sim-star-coverage', 'sim-star-epoch'],
    shows:
      'The star points, switched by “Gaia Stars” under Star catalogs in the Settings panel. The stars that have a name in the app come from a list of their own and are taken out of this one, so none is drawn twice.',
    scene: 'stars',
    setting: 'star-catalogs',
    view: { to: 'focus=star-sun', label: 'Open the Sun, with the Gaia stars behind it' },
  },
  'bailer-jones': {
    description:
      'A distance for each Gaia star, estimated from its parallax by Bailer-Jones and colleagues in 2021.',
    facts: ['sci-star-distance'],
    shows: 'No switch of its own: it is the distance of each Gaia star, so it decides where the star stands.',
    scene: 'stars',
  },
  gcns: {
    description:
      'The 331,312 stars within 100 parsecs of the Sun, from Gaia’s own list of nearby stars.',
    facts: ['sim-star-coverage'],
    shows: 'The faint stars within 100 parsecs of the Sun, part of “Gaia Stars”. Every data size keeps them, however faint; from 70 parsecs outwards they are thinned, so that they do not end at a visible shell.',
    scene: 'stars',
    setting: 'star-catalogs',
  },
  hipparcos: {
    description:
      'The brightest stars in the sky, which are too bright for Gaia’s detectors, from the 2007 re-reduction of Hipparcos.',
    facts: ['sim-star-coverage'],
    shows: 'The brightest stars in the sky, part of “Gaia Stars”, in place of the Gaia rows they match.',
    scene: 'stars',
    setting: 'star-catalogs',
  },
  'd3-celestial': {
    description:
      'The stick figures of the 88 constellations, from Olaf Frohn’s d3-celestial.',
    shows: 'The constellation lines, which are off at first. Their switch is under Labels & Guides.',
    scene: 'stars',
    setting: 'labels--guides',
  },
  'seed-famous-stars': {
    title: 'Named stars, typed by hand',
    description:
      'The stars skymap knows by name, with the figures and the paragraph on each one’s card, typed by hand.',
    shows: 'The named stars and the Sun: the stars the search finds by name and that have a card with a description.',
    scene: 'stars',
    setting: 'star-catalogs',
    view: { to: 'focus=star-betelgeuse', label: 'Open Betelgeuse' },
  },
  's-stars': {
    description:
      'The orbits of 39 stars around the black hole at the centre of the Milky Way, from Gillessen and colleagues, 2017.',
    shows: 'The stars in orbit around the black hole at the centre of the Milky Way, switched by “S-Star” under Star catalogs.',
    scene: 'the-milky-way',
    setting: 'star-catalogs',
    view: { to: 'focus=blackhole-sgr-a-star', label: 'Open the Galactic Centre' },
  },
  s301: {
    description:
      'One more star in orbit around the black hole at the centre of the Milky Way, published in 2026.',
    shows: 'One more of the stars in orbit around the black hole at the centre of the Milky Way.',
    scene: 'the-milky-way',
    view: { to: 'focus=blackhole-sgr-a-star', label: 'Open the Galactic Centre' },
  },
  'gravity-r0': {
    description:
      'Two numbers from one paper: how far the centre of the Milky Way is, and the mass of the black hole there.',
    shows: 'The mass and the distance given to the black hole at the centre of the Milky Way, and the scale of the star orbits around it.',
    scene: 'the-milky-way',
    view: { to: 'focus=blackhole-sgr-a-star', label: 'Open the Galactic Centre' },
  },

  // Galaxies
  sdss: {
    description:
      'The Sloan Digital Sky Survey: positions, measured redshifts, brightness and shapes of about 970,000 galaxies, by our own query.',
    about:
      'SDSS gives a galaxy a spectrum, and with it a measured redshift. We run one query of our own against its seventeenth data release, which returns about 970,000 galaxies with their positions, redshifts, brightness in five bands and shapes. Why we do not run it on SkyServer’s own search page is under Fetch on From catalogue to pixels; the query itself is in the repository’s data pipeline notes.',
    facts: ['survey-gaps', 'sci-redshifts', 'sim-flux-limits', 'sim-data-sizes'],
    shows:
      'The galaxy points switched by “SDSS” under Galaxy catalogs. Far out they stand in two fans. The smallest data size loads none of them.',
    scene: 'the-galaxy-surveys',
    setting: 'galaxy-catalogs',
    figure: 'science-wedges',
  },
  '2mrs': {
    description:
      'Positions, velocities and infrared brightness of 44,599 nearby galaxies over nearly the whole sky.',
    about:
      '2MRS is the redshift survey of the brightest galaxies of the 2MASS infrared sky survey. We read its table 3: one row per galaxy, with a position, a velocity and three infrared magnitudes. It is small enough that every data size loads the same set: 34,974 of its 44,599 rows.',
    facts: ['2mrs-coverage', 'sim-frames', 'sim-flux-limits'],
    shows:
      'The galaxy points switched by “2MRS” under Galaxy catalogs: the nearby universe over nearly the whole sky. Together with GLADE it is also what the filaments are traced from.',
    scene: 'the-galaxy-surveys',
    setting: 'galaxy-catalogs',
  },
  '2mass-xsc': {
    description:
      'The tilt and flattening of the 2MRS galaxies’ discs, from the 2MASS catalogue of extended sources.',
    facts: ['sci-galaxy-tilt'],
    shows: 'No switch of its own: where it has a measurement, it sets the tilt and flattening of a 2MRS galaxy’s disc.',
    scene: 'the-galaxy-surveys',
  },
  glade: {
    description:
      'A list of galaxies over the whole sky, compiled from older catalogues, with measured and estimated redshifts mixed.',
    about:
      'GLADE is a list of galaxies over the whole sky, put together from several older catalogues. It fills the regions SDSS never observed, at the cost of mixing measured redshifts with estimated ones.',
    facts: ['sci-photometric-share', 'sim-duplicates'],
    shows:
      'The galaxy points switched by “GLADE” under Galaxy catalogs: the largest set of galaxy points in the scene. The search finds a GLADE galaxy by a catalogue name it has, such as its NGC, IC or UGC number.',
    scene: 'the-galaxy-surveys',
    setting: 'galaxy-catalogs',
  },
  hyperleda: {
    description:
      'A database of published galaxy measurements: tilt and size for GLADE’s galaxies, some nearby distances, and names.',
    about:
      'HyperLEDA is a database that gathers published measurements of galaxies under one number each, the PGC number. We ask it for three things: the tilt and size of GLADE’s galaxies, a distance for nearby galaxies that Cosmicflows-4 does not cover, and the names a galaxy is known by. Our copy of the tilt table is partial, about 52,000 of GLADE’s galaxies.',
    facts: ['sci-local-volume', 'sci-galaxy-tilt'],
    shows:
      'No switch of its own. It is in the tilt of a GLADE galaxy’s disc, in where some nearby galaxies stand, and in the names and numbers the search accepts.',
    scene: 'nearby-galaxies',
  },
  milliquas: {
    description:
      'Positions and redshifts of about a million quasars and other active galactic nuclei: the most distant points in the scene.',
    about:
      'Milliquas is a compilation of published quasars and other active galactic nuclei. We keep the rows that have a usable redshift and place each by it. They skip the step that removes duplicates between catalogues: a quasar and the galaxy around it are two things at one position.',
    facts: ['sci-deepest', 'sim-quasar-boost'],
    shows: 'The points switched by “Milliquas” under Galaxy catalogs: the most distant objects in the scene.',
    scene: 'the-galaxy-surveys',
    setting: 'galaxy-catalogs',
  },
  desi: {
    description:
      'Three regions cut from the first data release of DESI, the Dark Energy Spectroscopic Instrument.',
    about:
      'From DESI’s first data release we read the large-scale-structure catalogues of four classes of target and cut three regions out of them. They are samples, one of them a deep cone that shows how much farther DESI reaches than the older surveys; they are not a map of the sky.',
    facts: ['sim-desi-patches', 'sci-desi-brightness'],
    shows:
      'Three switches under Galaxy catalogs, all off at first: “DESI Deep Field”, “DESI Wedge” and “Sloan Great Wall”. Each file is fetched the first time its switch goes on.',
    scene: 'the-galaxy-surveys',
    setting: 'galaxy-catalogs',
  },
  'cf4-distances': {
    description:
      'Distances to 55,877 galaxies measured without redshift, which we use inside 30 megaparsecs.',
    about:
      'Cosmicflows-4 is a catalogue of galaxy distances measured by methods that do not use redshift. We take one number per galaxy from its table 2 and use it only inside 30 megaparsecs, where a galaxy’s own motion is a large part of its redshift.',
    facts: ['sci-local-volume', 'sim-scale-step'],
    shows:
      'No switch of its own: it moves nearby galaxy points to their measured distance. The card of such a galaxy still gives the published redshift.',
    scene: 'nearby-galaxies',
  },
  'seed-famous-galaxies': {
    title: 'Named galaxies, typed by hand',
    description:
      'The 81 galaxies skymap knows by name, with the figures and the paragraph on each one’s card.',
    shows: 'The named galaxies: the ones the search finds by name, with a photograph and a description on the card. Their switch is “Famous” under Galaxy catalogs.',
    scene: 'nearby-galaxies',
    setting: 'galaxy-catalogs',
    view: { to: 'focus=m31', label: 'Open Andromeda' },
  },
  'seed-local-volume': {
    description:
      'Distances to a handful of nearby galaxies that the two distance catalogues miss, typed by hand.',
    facts: ['sci-local-volume'],
    shows: 'No switch of its own: it places a handful of nearby galaxies that the two distance catalogues miss.',
    scene: 'nearby-galaxies',
  },

  // Structures and fields
  mcxc: {
    description:
      '1,743 galaxy clusters found in X-rays, with position, redshift, mass and size: the cluster markers.',
    about:
      'MCXC is a catalogue of galaxy clusters detected in X-rays, compiled from earlier catalogues. We keep the most massive and draw a marker for each, unless a cluster we placed by hand stands at the same spot.',
    facts: ['sci-structures', 'sci-markers'],
    shows: 'Cluster markers, switched by “Clusters” under Structures. A cluster from this catalogue has a ring and no name; the named ones are placed by hand.',
    scene: 'clusters-superclusters-and-voids',
    setting: 'structures',
  },
  mscc: {
    description:
      '601 superclusters of Abell clusters: the supercluster markers.',
    about:
      'MSCC is a catalogue of superclusters, each a group of the clusters of the Abell catalogue. We keep the richest and draw a marker for each, unless a supercluster we placed by hand stands at the same spot.',
    facts: ['sci-structures', 'sci-markers'],
    shows: 'Supercluster markers, switched by “Superclusters” under Structures. A supercluster from this catalogue has a ring and no name; the named ones are placed by hand.',
    scene: 'clusters-superclusters-and-voids',
    setting: 'structures',
  },
  'seed-structures': {
    description:
      '42 clusters, groups, superclusters and voids placed by hand, each with a paragraph on its card.',
    title: 'Featured structures, placed by hand',
    facts: ['sci-structures', 'sci-markers'],
    shows: 'Every void and galaxy group in the scene, and the clusters and superclusters we placed by hand, each with a paragraph on its card.',
    scene: 'clusters-superclusters-and-voids',
    setting: 'structures',
    figure: 'void-bootes',
  },
  'mcpm-vac': {
    description:
      'A density field computed from the positions of SDSS galaxies: the glow of the cosmic web.',
    about:
      'The glow of the cosmic web is not an image. It is a density field that the catalogue’s authors computed from the positions of SDSS galaxies, which we reduce to three sizes and draw as light.',
    facts: ['sci-density-field'],
    shows: 'The purple and orange glow, switched by “MCPM Cosmic Web” under Cosmic web density.',
    scene: 'filaments-and-the-cosmic-web',
    setting: 'cosmic-web-density',
    figure: 'science-web-density',
  },
  polyphorm: {
    description:
      'The program and the method behind the two density fields of the cosmic web.',
    shows: 'A second density field, from our own run of the program on 2MRS: “Polyphorm (2MRS)” under Cosmic web density, which is off at first.',
    scene: 'filaments-and-the-cosmic-web',
    setting: 'cosmic-web-density',
  },
  cf4pp: {
    description:
      'How matter around us moves apart from the expansion, on a grid 1,000 megaparsecs across: the flow ribbons.',
    about:
      'CF4++ is a reconstruction built on the Cosmicflows-4 distances: where the matter around us is and how it moves apart from the expansion. We draw its mean velocity field.',
    facts: ['sci-flows'],
    shows: 'The flow ribbons switched by “Flow” in the Settings panel. The Cosmic Flows exhibit draws them.',
    setting: 'flow',
    view: { to: 'exhibit=cosmicFlows', label: 'Open the Cosmic Flows exhibit' },
  },

  // Solar System
  'jpl-elements': {
    description:
      'The numbers that describe each planet’s and moon’s orbit, from JPL’s Solar System Dynamics group.',
    about:
      'A planet’s place at a given moment starts from six numbers that describe its orbit. JPL publishes such elements for the planets and for the moons; we typed them into the app, and correct the eight planets and 18 of the moons against JPL’s Horizons service.',
    facts: ['sci-ephemeris', 'sim-ephemeris-span'],
    shows: 'Where every planet and moon is at the date on the clock.',
    scene: 'planets-and-their-moons',
    figure: 'lesson-solar-system',
    view: { to: 'exhibit=solarSystem', label: 'Open the Solar System exhibit' },
  },
  horizons: {
    description:
      'JPL’s positions for 8 planets and 18 moons from 1900 to 2100, which our orbits are corrected to.',
    about:
      'Horizons is JPL’s service for the positions of Solar System bodies. We asked it where the eight planets and 18 moons are at steps from 1900 to 2100, fitted a small correction to our own orbits from the answers, and ship the corrections, not the positions. The orbits of the Voyagers and of Hubble are also copied from it.',
    facts: ['sci-ephemeris', 'sim-ephemeris-span'],
    shows: 'No switch of its own: it is why a planet stands within 1,000 kilometres of where JPL puts it, and each of 18 moons that close to its place beside its planet, between 1900 and 2100.',
    scene: 'planets-and-their-moons',
  },
  'seed-planet-facts': {
    title: 'Fact sheets of the Solar System bodies',
    description:
      'Mass, gravity, day, year and the rest for 43 bodies of the Solar System, with a paragraph each.',
    shows: 'The figures and the paragraph on the card of each planet, moon and spacecraft.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-saturn&t=2026-10-07T12:00:00Z', label: 'Open Saturn and its card' },
  },

  // Imagery
  'famous-curated': {
    description:
      'One photograph for each of 78 named galaxies, from observatories, space agencies and amateur astronomers.',
    shows: 'The photograph on a named galaxy: in the scene when you are close, and on its card.',
    scene: 'nearby-galaxies',
    view: { to: 'focus=m31', label: 'Open Andromeda' },
  },
  wikipedia: {
    description:
      'Three galaxy photographs fetched from Wikipedia, and the articles behind the descriptions of about 50 named galaxies.',
    title: 'Wikipedia photographs and descriptions',
    shows: 'The photograph of three named galaxies, and text behind the descriptions of about 50 of the 81 named galaxies.',
    scene: 'nearby-galaxies',
  },
  'solar-system-scope': {
    description:
      'Surface maps of seven planets and the Moon, and Saturn’s rings, by Solar System Scope.',
    about:
      'The maps of seven planets and the Moon, and of Saturn’s rings, are Solar System Scope’s. Its own page says where they depart from the spacecraft data.',
    facts: ['sci-planet-maps'],
    shows: 'The maps of Mercury, Venus (its cloud tops), Mars, Jupiter, Saturn, Uranus, Neptune and the Moon, and Saturn’s rings.',
    scene: 'planets-and-their-moons',
    figure: 'saturn',
  },
  'usgs-galilean': {
    description:
      'Maps of Jupiter’s four large moons, assembled by the USGS from Voyager and Galileo images.',
    title: 'USGS mosaics of Io, Europa, Ganymede, Callisto',
    facts: ['sci-surfaces'],
    shows: 'The surfaces of Jupiter’s four large moons.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-io&t=2022-06-01T00:00:00Z', label: 'Open Io' },
  },
  'usgs-enceladus': {
    description:
      'A map of the whole of Enceladus from Cassini images, 110 metres per pixel.',
    facts: ['sci-surfaces'],
    shows: 'The surface of Enceladus.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-enceladus&t=2026-10-07T12:00:00Z', label: 'Open Enceladus' },
  },
  'photojournal-saturn-moons': {
    description:
      'Cassini’s colour maps of Mimas, Tethys, Dione, Rhea and Iapetus, from NASA’s Photojournal.',
    title: 'NASA Photojournal: maps of five Saturn moons',
    facts: ['sci-surfaces'],
    shows: 'The surfaces of Mimas, Tethys, Dione, Rhea and Iapetus.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-iapetus&t=2026-10-07T12:00:00Z', label: 'Open Iapetus' },
  },
  'schenk-uranian': {
    description:
      'Voyager 2 maps of the five large moons of Uranus, and height maps of Miranda and Ariel, by Paul Schenk.',
    facts: ['sci-surfaces'],
    shows: 'The surfaces of Miranda, Ariel, Umbriel, Titania and Oberon, and the relief of Miranda and Ariel.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-miranda&t=1986-01-24T14:00:00Z', label: 'Open Miranda on the day Voyager 2 passed' },
  },
  'usgs-pluto-charon': {
    description:
      'Maps of Pluto and Charon from New Horizons images, 300 metres per pixel.',
    facts: ['sci-surfaces'],
    shows: 'The surfaces of Pluto and Charon.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-pluto&t=2026-10-07T12:00:00Z', label: 'Open Pluto' },
  },
  'nasa-pluto-colour': {
    description:
      'Two NASA colour maps of Pluto, used only to give the USGS mosaic its colour.',
    title: 'NASA Pluto colour map',
    shows: 'The colour of Pluto. Its detail is the USGS mosaic’s.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-pluto&t=2026-10-07T12:00:00Z', label: 'Open Pluto' },
  },
  'usgs-triton': {
    description:
      'A colour map of Triton from Voyager 2 images, 600 metres per pixel.',
    facts: ['sci-surfaces'],
    shows: 'The surface of Triton.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-triton&t=2026-10-07T12:00:00Z', label: 'Open Triton' },
  },
  'nasa-blue-marble': {
    description:
      'Earth from far away: NASA’s Blue Marble for August 2004, with its night lights, clouds and water.',
    about:
      'Earth seen whole is NASA’s Blue Marble: one month of satellite imagery, August 2004. The night lights, the clouds and the water are separate NASA maps, not of that month. The same month is also the coarse levels of the tiles the app fetches as you come down, so the two never show different seasons side by side.',
    facts: ['sci-earth-clouds', 'sci-surfaces'],
    shows: 'Earth’s surface from far away and down to tile level 7, its night side and its clouds.',
    scene: 'earth-and-its-surface',
    figure: 'earth-terminator',
  },
  eox: {
    description:
      'Cloud-free Sentinel-2 imagery of Earth, in the regions where skymap goes closer than Blue Marble reaches.',
    title: 'EOxCloudless (Sentinel-2)',
    about:
      'Closer to the ground than Blue Marble reaches, in regions we chose, Earth is EOxCloudless: a cloud-free mosaic of Sentinel-2 satellite imagery. We re-tile it at levels 8 to 13 and match its colour to Blue Marble, separately for land and water, so the join between the two holds.',
    shows: 'Earth’s surface in the chosen regions as you come down. Outside them the surface stays Blue Marble.',
    scene: 'earth-and-its-surface',
  },
  geodanmark: {
    description:
      'Aerial photography of Søndermarken, a park in Frederiksberg, at 10 centimetres per pixel: the sharpest ground in skymap.',
    shows: 'The ground of Søndermarken, a park in Frederiksberg, Copenhagen, at tile levels 14 to 19: the sharpest imagery in the app.',
    scene: 'earth-and-its-surface',
    view: { to: 'focus=body-soendermarken&t=2026-06-21T11:00:00Z', label: 'Open Søndermarken' },
  },
  viking: {
    description:
      'The Viking orbiters’ colour mosaic of Mars, 232 metres per pixel.',
    shows: 'The colour of Mars as you come down to the ground, and the colour given to the close-ups at all four rover sites.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-spirit&t=2026-10-07T08:00:00Z', label: 'Open Mars at Spirit’s site' },
  },

  // Terrain
  etopo: {
    description:
      'The height of Earth’s land and sea floor everywhere, on a grid of 30 arc-seconds.',
    shows: 'The height of Earth’s land everywhere: the relief you see when you come down to the ground.',
    scene: 'earth-and-its-surface',
  },
  skadi: {
    description:
      'Heights at 1 arc-second under the regions where Earth has sharper imagery.',
    shows: 'The height of the ground under the regions that have sharper imagery.',
    scene: 'earth-and-its-surface',
  },
  dhm: {
    description:
      'Denmark’s height model: the ground under Søndermarken at 0.4 metres, and the laser scan of the park.',
    shows: 'The height of the ground under Søndermarken, and the laser scan the park’s model was built on.',
    scene: 'earth-and-its-surface',
    view: { to: 'focus=body-soendermarken&t=2026-06-21T11:00:00Z', label: 'Open Søndermarken' },
  },
  mola: {
    description:
      'The height of the ground of Mars, measured by the MOLA laser altimeter, 463 metres per pixel.',
    shows: 'The height of the ground of Mars.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-spirit&t=2026-10-07T08:00:00Z', label: 'Open Mars at Spirit’s site' },
  },
  'hirise-gale': {
    description:
      'Curiosity’s site: the ground of Gale crater at 1 metre, and a colour photograph of it at 25 centimetres.',
    shows: 'The ground at Curiosity’s site: its height, and a colour photograph with its hue matched to the Viking mosaic.',
    scene: 'spacecraft',
    view: { to: 'focus=body-curiosity&t=2026-10-07T16:00:00Z', label: 'Open Curiosity' },
  },
  'hirise-jezero': {
    description:
      'Perseverance’s site: the ground of Jezero crater at 1 metre, and a photograph of it at 25 centimetres.',
    shows: 'The ground at Perseverance’s site: its height, and a grey photograph coloured from the Viking mosaic.',
    scene: 'spacecraft',
    view: { to: 'focus=body-perseverance&t=2026-10-07T16:00:00Z', label: 'Open Perseverance' },
  },
  'hirise-dtm': {
    title: 'Columbia Hills and Endeavour crater (HiRISE)',
    description:
      'Spirit’s and Opportunity’s sites: the ground at 1 metre and a grey photograph at 25 centimetres, from HiRISE.',
    shows: 'The ground at Spirit’s and Opportunity’s sites, in height and in a grey photograph coloured from the Viking mosaic.',
    scene: 'spacecraft',
    view: { to: 'focus=body-opportunity&t=2026-10-07T00:00:00Z', label: 'Open Opportunity' },
  },
  gaskell: {
    description:
      'Shape models of Mimas, Tethys and Dione, used to shade their relief. Nothing of them is shipped.',
    title: 'Gaskell shape models of three Saturn moons',
    shows: 'The relief shading of Mimas, Tethys and Dione. No pixel of the models themselves is shipped.',
    scene: 'planets-and-their-moons',
  },
  'schenk-enceladus-dem': {
    description:
      'Heights of Enceladus, used to shade its relief.',
    shows: 'The relief shading of Enceladus.',
    scene: 'planets-and-their-moons',
    view: { to: 'focus=body-enceladus&t=2026-10-07T12:00:00Z', label: 'Open Enceladus' },
  },
  'schenk-triton-dem': {
    description:
      'Heights of part of Triton, used to shade its relief.',
    shows: 'The relief shading of part of Triton.',
    scene: 'planets-and-their-moons',
  },
  'svs-moon-kit': {
    description:
      'Heights of the Moon from the LOLA altimeter, used to shade its relief.',
    shows: 'The relief shading of the Moon.',
    scene: 'the-moon',
    view: { to: 'focus=body-moon&t=2026-10-07T12:00:00Z', label: 'Open the Moon' },
  },

  // Models
  'mesh-whale': {
    title: 'The whale: Livyatan melvillei, by Major',
    description:
      'The whale in orbit around Earth: a model of Livyatan melvillei by Major, from Sketchfab.',
    shows: 'The whale in orbit around Earth.',
    view: { to: 'focus=body-whale&t=2026-10-07T13:00:00Z', label: 'Open the whale' },
  },
  'mesh-petunias': {
    title: 'The bowl of petunias, by Marianne Goudriaan',
    description:
      'The bowl of petunias behind the whale: a model by Marianne Goudriaan, from Sketchfab.',
    shows: 'The bowl of petunias in orbit around Earth, behind the whale.',
    view: { to: 'focus=body-petunias&t=2026-10-07T13:00:00Z', label: 'Open the petunias' },
  },
  'mesh-voyager': {
    title: 'Voyager model (NASA)',
    description:
      'NASA’s model of the Voyager spacecraft, drawn for both Voyager 1 and Voyager 2.',
    shows: 'Voyager 1 and Voyager 2.',
    scene: 'spacecraft',
    figure: 'lesson-voyager',
  },
  'mesh-hubble': {
    title: 'Hubble Space Telescope model (NASA)',
    description:
      'NASA’s model of the Hubble Space Telescope.',
    shows: 'The Hubble Space Telescope in its orbit around Earth.',
    scene: 'spacecraft',
    figure: 'hubble',
  },
  'mesh-perseverance': {
    title: 'Perseverance rover model (NASA)',
    description:
      'NASA’s model of the Perseverance rover.',
    shows: 'The Perseverance rover on Mars.',
    scene: 'spacecraft',
    view: { to: 'focus=body-perseverance&t=2026-10-07T16:00:00Z', label: 'Open Perseverance' },
  },
  'mesh-curiosity': {
    title: 'Curiosity rover model (NASA)',
    description:
      'NASA’s model of the Curiosity rover.',
    shows: 'The Curiosity rover on Mars.',
    scene: 'spacecraft',
    view: { to: 'focus=body-curiosity&t=2026-10-07T16:00:00Z', label: 'Open Curiosity' },
  },
  'mesh-mer': {
    title: 'Spirit and Opportunity rover model (NASA)',
    description:
      'NASA’s model of a Mars Exploration Rover, drawn for both Spirit and Opportunity.',
    shows: 'The rovers Spirit and Opportunity on Mars.',
    scene: 'spacecraft',
    view: { to: 'focus=body-spirit&t=2026-10-07T08:00:00Z', label: 'Open Spirit' },
  },
  skraafoto: {
    description:
      'The aerial photographs and the laser scan from which we rebuilt Søndermarken as a 3D model.',
    shows: 'The model of Søndermarken, a park in Frederiksberg, Copenhagen, standing on Earth.',
    scene: 'earth-and-its-surface',
    view: { to: 'focus=body-soendermarken&t=2026-06-21T11:00:00Z', label: 'Open Søndermarken' },
  },

  // Sources with nothing in the scene to point at, and the small ones that share a page
  'pecaut-mamajek': {
    description:
      'The table of temperatures and radii of ordinary stars that we checked the Sagittarius A* stars against.',
  },
  edenhofer: {
    description:
      'A map of the dust within 1.25 kiloparsecs of the Sun, in three dimensions.',
  },
  'local-bubble': {
    description:
      'The shape of the Local Bubble, the cavity in the gas around the Sun, from O’Neill and colleagues, 2024.',
  },
  vizier: {
    description:
      'The catalogue service of CDS in Strasbourg, through which six of our tables were fetched.',
  },
  'legacy-surveys': {
    description:
      'Sky cutouts our image fetcher would fall back on. Every named galaxy has a photograph, so none is shipped.',
  },
  'sdss-images': {
    description:
      'A picture of a galaxy with no photograph of its own, asked from SDSS when the galaxy grows large on screen.',
  },
  dss: {
    description:
      'The picture the app asks for when SDSS has none: a cutout of the Digitized Sky Survey, served by CDS.',
  },
  ned: {
    description:
      'The NASA/IPAC Extragalactic Database, which a galaxy’s card links to. The app fetches nothing from it.',
  },
  counterscale: {
    description:
      'The script that counts visits, run on our own Cloudflare account.',
  },
  turnstile: {
    description:
      'The spam check of the website’s contact form, a Cloudflare service.',
  },
  'outbound-links': {
    description:
      'Plain links to papers, repositories and reference pages. Nothing is fetched from them.',
  },
  'font-cormorant': {
    description:
      'The display face: labels in the app, and the headings of its panels and of this website.',
  },
  'font-sora': {
    description:
      'Sora Thin, the face of the exhibit titles in the app.',
  },
  'font-jost': {
    description:
      'The text face of this website.',
  },
  mrange: {
    description:
      'Seven small shader functions that came with a ShaderToy we once used to draw the Milky Way.',
  },
  'hoskins-hash': {
    description:
      'A hash function for shaders, used for jitter.',
  },
  healpix: {
    description:
      'The function that turns a direction in the sky into a HEALPix pixel number, used to weigh survey coverage.',
  },
  helland: {
    description:
      'The fit that gives a star its colour from its temperature.',
  },
  mulberry32: {
    description:
      'A small random number generator, used wherever the app needs the same numbers on every load.',
  },
  'narkowicz-aces': {
    description:
      'One of the tone-mapping curves the app offers, a fit of five constants.',
  },
  pcg4d: {
    description:
      'An integer hash that seeds the stars and clouds of the drawn Milky Way.',
  },
  colormaps: {
    description:
      'Colour ramps for the density fields: matplotlib’s viridis, magma and inferno, and one named coolwarm.',
  },
  'shader-hashes': {
    description:
      'Two shader hash functions whose origin our code does not record.',
  },
  dialkit: {
    description:
      'The slider of the app’s panels, a reimplementation of DialKit’s design.',
  },
  'atmosphere-methods': {
    description:
      'The two papers our atmosphere shaders follow. No code of theirs is reused.',
  },
  'black-hole-method': {
    description:
      'The paper our black-hole lens is compared with. No code of it is reused.',
  },
  'npm-dependencies': {
    description:
      'The libraries the app and this website bundle, each with its licence in a file the build writes.',
  },
  starnet: {
    description:
      'The program that takes the foreground stars out of each galaxy photograph. We run it and do not ship it.',
  },
  disperse: {
    description:
      'The program that computes the filaments from the 2MRS and GLADE galaxies. We run it and do not ship it.',
  },
  pyslime: {
    description:
      'The reader that decodes the Cosmic Slime catalogue’s density file. We run it and do not ship it.',
  },
  'skymap-own': {
    description:
      'Checksum files, notes and folders of the data registry that belong to no single source, and the project’s own hosts.',
  },
  'skymap-pictures': {
    description:
      'Every published picture and film of the app, and the terms that follow each from the sources in its frame.',
  },
};
