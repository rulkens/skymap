import type { Fact } from '../@types/Fact';
import { CITATION } from './citation';
import { REPO_BLOB } from './siteIdentity';
import { formatDate } from '../utils/formatDate';

const CHECKED = '2026-10-06';
const IN_REPO = 'in the skymap repository';

/**
 * The Science page's claims, spread into FACTS. A claim about what skymap does
 * cites the file that does it; a claim about the sky cites the paper or the
 * catalogue's own page. Numbers worked out from two inputs (the horizon for a
 * given Hubble constant, a velocity as megaparsecs) are redone in
 * tests/packages/website/scienceFacts.test.ts.
 */
export const SCIENCE_FACTS: readonly Fact[] = [
  // Measured
  {
    id: 'sci-directions',
    text: 'The direction to every star, galaxy and quasar is its catalogued right ascension and declination, the sky’s longitude and latitude, used as published in the ICRS reference frame.',
    source: `${REPO_BLOB}/src/utils/math/raDecZToCartesian.ts`,
    sourceLabel: `the coordinate conversion, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-redshifts',
    text: 'Redshift, the stretching of light as space expands, is measured from a spectrum for the SDSS, 2MRS and DESI galaxies. Our SDSS query keeps spectra classed as galaxies with no warning flag, at redshifts from 0.001 to 0.3.',
    source: `${REPO_BLOB}/docs/DATA.md`,
    sourceLabel: `the data pipeline notes, with the SDSS query, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-star-observables',
    text: 'For stars we take three Gaia measurements: position, brightness in Gaia’s G band and the colour BP minus RP. We read them for the 16,844,156 Gaia stars brighter than magnitude 14. The app loads the brightest of them: 12,853,984 stars in all at its largest data size.',
    source: `${REPO_BLOB}/data/raw/gaia/README.md`,
    sourceLabel: `the Gaia download record, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-magnitudes',
    text: 'Galaxy brightness comes from each catalogue’s own magnitudes: u, g, r, i and z for SDSS, the infrared J, H and K for 2MRS, and B, J, H and K for GLADE.',
    source: `${REPO_BLOB}/src/layers/galaxyCatalog/sources`,
    sourceLabel: `the catalogue definitions, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-surfaces',
    text: 'The surfaces of Earth, Pluto, Charon and the larger moons of the giant planets are photographs and mosaics from spacecraft, satellites and aircraft, each credited in the attributions file.',
    source: `${REPO_BLOB}/ATTRIBUTIONS.md`,
    sourceLabel: `the attributions file, ${IN_REPO}`,
    checked: CHECKED,
  },

  // Derived
  {
    id: 'sci-galaxy-distance',
    text: 'Beyond 30 megaparsecs (98 million light-years) a galaxy’s distance is computed from its redshift. It is a comoving distance, the distance today, in a flat Lambda-CDM model, the standard model of cosmology, with a Hubble constant of 70 km/s per megaparsec and a matter density of 0.315.',
    source: `${REPO_BLOB}/src/utils/math/redshiftToDistanceMpc.ts`,
    sourceLabel: `the redshift-to-distance function, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-h0-range',
    text: 'The Hubble constant is the rate at which space expands. Measurements run from about 67 to about 73 km/s per megaparsec, and every redshift distance scales inversely with it. A galaxy we place at 100 megaparsecs would sit at about 96 with a constant of 73, or 104 with 67.4.',
    source: `${REPO_BLOB}/src/utils/math/constants.ts`,
    sourceLabel: `the constants file, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-local-volume',
    text: 'Inside 30 megaparsecs a galaxy’s own motion is a large part of its redshift: 300 km/s is 14 per cent of the expansion at 30 megaparsecs and all of it at about 4. Redshift is a poor guide there, so we use distances measured without it: a short hand-checked list first, then Cosmicflows-4, then HyperLEDA.',
    source: `${REPO_BLOB}/tools/catalog/catalogDistanceFor.ts`,
    sourceLabel: `the nearby-distance lookup, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-photometric-share',
    text: 'GLADE mixes two kinds of redshift. By our parser’s rule about 935,000 of its 2.1 million usable rows, roughly 45 per cent, carry a photometric redshift: an estimate from a galaxy’s colours, not from a spectrum, with an error near 0.015. At a redshift of 0.1 that error is about 60 megaparsecs along the line of sight. We keep those rows.',
    source: `${REPO_BLOB}/tools/parsers/glade.ts`,
    sourceLabel: `the GLADE parser, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-two-redshifts',
    text: 'GLADE mixes two kinds of redshift: spectroscopic ones, and photometric ones estimated from a galaxy’s colours. “Estimated redshifts”, under Known simplifications, says how many and how far off.',
    source: `${REPO_BLOB}/tools/parsers/glade.ts`,
    sourceLabel: `the GLADE parser, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-star-distance',
    text: 'Star distances are the Bailer-Jones estimates, statistical distances built on Gaia parallax (the yearly shift of a star against the background as Earth orbits the Sun). We take the estimate that also uses colour and brightness first, the parallax-only one second, and the Gaia Catalogue of Nearby Stars last. We never use one divided by parallax.',
    source: `${REPO_BLOB}/tools/stars/resolveStarDistancePc.ts`,
    sourceLabel: `the star-distance rule, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-ephemeris',
    text: 'Planet positions are Kepler orbits from JPL’s published elements plus a fitted correction that matches JPL Horizons to within 1,000 km from 1900 to 2100. What is fitted is Mercury, Venus, the Earth-Moon barycentre and, from Mars to Neptune, the centre of mass of each planet with its moons. Of the moons, 18 that belong to Jupiter, Saturn, Uranus and Neptune are fitted to the same bound against their planet. Earth’s Moon is not: it follows mean orbital elements.',
    source: `${REPO_BLOB}/docs/DATA.md`,
    sourceLabel: `the data pipeline notes, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-density-field',
    text: 'The cosmic web glow is a density field from the SDSS DR17 Cosmic Slime catalogue. It was made by the Monte Carlo Physarum Machine, an algorithm modelled on a slime mould: simulated agents move towards galaxies and the trails they leave are added up. It covers SDSS galaxies between 44 and 476 megaparsecs on a grid of 712 by 1,200 by 728 cells, which we reduce to three sizes.',
    source: `${REPO_BLOB}/ATTRIBUTIONS.md`,
    sourceLabel: `the attributions file, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-filaments',
    text: 'Filaments are traced by DisPerSE. It joins neighbouring galaxies into tetrahedra (a Delaunay tessellation) to estimate density, then keeps the ridges that stand out from the noise by 5 standard deviations. We run it on 2MRS and GLADE together and leave SDSS out, because the edges of its footprint would be traced as if they were structure.',
    source: `${REPO_BLOB}/tools/filaments/buildFilaments.ts`,
    sourceLabel: `the filament build, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-flows',
    text: 'The Cosmic Flows exhibit draws the CF4++ reconstruction: the motion of galaxies apart from the expansion, and the density behind it, on a grid 128 cells a side that spans 1,000 megaparsecs.',
    source: `${REPO_BLOB}/tools/utils/io/rawDataRegistry.ts`,
    sourceLabel: `the raw data registry, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-colour',
    text: 'A galaxy’s colour on screen is the difference of two magnitudes (u minus g for SDSS, B minus J for GLADE, J minus K for 2MRS) placed on a scale from blue through white to red. It is a colour index, not the colour an eye would see.',
    source: `${REPO_BLOB}/src/layers/galaxyCatalog/sources`,
    sourceLabel: `the catalogue definitions, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-structures',
    text: 'Cluster and supercluster markers come from two catalogues, MCXC and MSCC, filtered to the largest entries, plus 42 structures placed by hand.',
    source: `${REPO_BLOB}/tools/structures/buildStructures.ts`,
    sourceLabel: `the structure build, ${IN_REPO}`,
    checked: CHECKED,
  },

  // Drawn
  {
    id: 'sci-milky-way',
    text: 'The Milky Way seen from outside is a generated model. A few of its numbers come from the literature: the disc’s scale length of 2.6 kiloparsecs and its thickness from Freudenreich 1998, and the bar’s angle of 27 degrees from Wegg and Gerhard. The four spiral arms are shaped by hand; no arm is placed from a measurement.',
    source: `${REPO_BLOB}/src/data/milkyWay/milkyWayGalaxyParams.ts`,
    sourceLabel: `the Milky Way parameters, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-milky-way-points',
    text: 'At the largest of the app’s three data sizes the model is drawn as about 150,000 points of light, each standing in for roughly 700,000 stars.',
    source: `${REPO_BLOB}/src/data/milkyWay/milkyWayGalaxyParams.ts`,
    sourceLabel: `the Milky Way parameters, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-horizon-shell',
    text: 'The sphere at the edge of the observable universe is drawn at 14.3 gigaparsecs (46.6 thousand million light-years). It marks the particle horizon of a cosmological model: how far away, today, the most distant matter is from which any signal could have reached us. The matter whose glow we see as the microwave background is a little nearer. Nothing is observed at that distance.',
    source: `${REPO_BLOB}/src/data/rendering/horizonRadiusGpc.ts`,
    sourceLabel: `the horizon radius, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-deepest',
    text: 'The most distant objects we draw are Milliquas quasars, out to a redshift near 7. Our model places that about 8.5 gigaparsecs away, 59 per cent of the way to the sphere. The SDSS galaxies stop at a redshift of 0.3, about 1.2 gigaparsecs.',
    source: `${REPO_BLOB}/src/layers/galaxyCatalog/sources/milliquas.ts`,
    sourceLabel: `the Milliquas definition, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-atmospheres',
    text: 'The atmospheres of 9 bodies are computed from a light-scattering model after Bruneton and Neyret and Hillaire, with a table of gases and hazes for each body. They are not photographs.',
    source: `${REPO_BLOB}/src/data/bodies/atmosphereParams.ts`,
    sourceLabel: `the atmosphere tables, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-earth-clouds',
    text: 'Earth’s clouds are one fixed NASA composite, not the weather on the date shown. The surface under them is the Blue Marble mosaic of August 2004, with newer satellite and aerial imagery set into some regions.',
    source: `${REPO_BLOB}/ATTRIBUTIONS.md`,
    sourceLabel: `the attributions file, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-planet-maps',
    text: 'The maps of seven planets and the Moon, and Saturn’s rings, are Solar System Scope’s. Its own page says they are based on NASA elevation and imagery data, that gaps are filled with fictional terrain, and that the colours are slightly more saturated.',
    source: 'https://www.solarsystemscope.com/textures/',
    sourceLabel: 'Solar System Scope, textures',
    checked: CHECKED,
  },
  {
    id: 'sci-galaxy-discs',
    text: 'A galaxy smaller than about 8 pixels on screen is a point. Larger than that, it is drawn as a generated disc, which is not its real shape. From about 24 pixels it carries a picture: a photograph of our choosing for 81 named galaxies, and for the others a survey image the app fetches from the Sloan Digital Sky Survey or, failing that, from the Digitized Sky Survey through the CDS in Strasbourg.',
    source: `${REPO_BLOB}/src/data/galaxyLodBands.ts`,
    sourceLabel: `the galaxy level-of-detail bands, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-galaxy-tilt',
    text: 'Where a catalogue gives no measured tilt for a galaxy, we give it one computed from its identifier and position. It is the same on every visit, and it is not real.',
    source: `${REPO_BLOB}/tools/catalog/buildAllBins.ts`,
    sourceLabel: `the catalogue build, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-black-hole',
    text: 'Sagittarius A* is drawn as a non-rotating black hole bending the light behind it, with a glowing disc that we invented. It is not the Event Horizon Telescope image.',
    source: `${REPO_BLOB}/ATTRIBUTIONS.md`,
    sourceLabel: `the attributions file, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-zoa-band',
    text: 'The blue Zone of Avoidance band is a guide we draw along the plane of the Milky Way, set to 10 degrees towards the galactic centre and 3 degrees away from it. The shortage of galaxies behind it is in the catalogues.',
    source: `${REPO_BLOB}/src/data/zoneOfAvoidance/zoneOfAvoidanceShell.ts`,
    sourceLabel: `the band’s shape, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-markers',
    text: 'Structure markers are discs and rings sized by a catalogued or hand-set radius. A void gets a ring only, since a glow would suggest matter where the structure is defined by its absence.',
    source: `${REPO_BLOB}/docs/science.md`,
    sourceLabel: `the science notes, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-desi-brightness',
    text: 'For three DESI target classes (luminous red galaxies, emission-line galaxies and quasars) the files we read give position and redshift only, so every object in a class is drawn with one assumed luminosity.',
    source: `${REPO_BLOB}/data/raw/desi/README.md`,
    sourceLabel: `the DESI download record, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sci-tone',
    text: 'Glow around bright objects (bloom) and the curve that maps light to screen brightness are image processing applied to the whole frame.',
    source: `${REPO_BLOB}/src/data/toneMapCurve.ts`,
    sourceLabel: `the tone curves, ${IN_REPO}`,
    checked: CHECKED,
  },

  // Known simplifications
  {
    id: 'sim-redshift-space',
    text: 'Beyond 30 megaparsecs we treat the whole redshift as expansion. A galaxy’s own velocity, its peculiar velocity, therefore moves it along the line of sight: 300 km/s shifts it by about 4 megaparsecs. In a rich cluster this stretches the cluster into a streak pointing at us, known as a finger of god. We do not correct for it.',
    source: `${REPO_BLOB}/docs/science.md`,
    sourceLabel: `the science notes, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sim-frames',
    text: 'Redshifts are used in the frame they were published in. 2MRS velocities are heliocentric, measured relative to the Sun, and we do not convert any catalogue to the rest frame of the cosmic microwave background.',
    source: `${REPO_BLOB}/tools/parsers/twoMrs.ts`,
    sourceLabel: `the 2MRS parser, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sim-horizon-h0',
    text: 'The sphere at 14.3 gigaparsecs fits a Hubble constant near 67. With the 70 we use for galaxies and the same matter density, the same model gives about 13.6 gigaparsecs. The sphere is drawn about 5 per cent too far out for the galaxies inside it.',
    source: `${REPO_BLOB}/src/data/rendering/horizonRadiusGpc.ts`,
    sourceLabel: `the horizon radius, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sim-scale-step',
    text: 'Cosmicflows-4 distances, which we use inside 30 megaparsecs, correspond to a Hubble constant of 74.6 km/s per megaparsec. Outside we use 70. We rescale neither, so the distance scale steps by about 7 per cent at that boundary.',
    source: 'https://arxiv.org/abs/2209.11238',
    sourceLabel: 'Tully et al. 2023, Cosmicflows-4',
    checked: CHECKED,
  },
  {
    id: 'sim-zone',
    text: 'Dust and stars in the plane of the Milky Way hide the galaxies behind them. A review puts this Zone of Avoidance at about 25 per cent of the distribution of optically visible galaxies.',
    source: 'https://arxiv.org/abs/astro-ph/0005501',
    sourceLabel: 'Kraan-Korteweg and Lahav 2000, the Universe behind the Milky Way',
    checked: CHECKED,
  },
  {
    id: 'sim-desi-patches',
    text: 'DESI appears as three regions cut from its first data release, not as a survey of the sky: a cone 2.5 degrees in radius towards Corona Borealis, a band of declination and the Sloan Great Wall.',
    source: `${REPO_BLOB}/tools/catalog/desiPatches.ts`,
    sourceLabel: `the DESI sample shapes, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sim-flux-limits',
    text: 'Each survey records only what is brighter than a limit: magnitude 17.77 in the r band for SDSS’s main galaxy sample and 11.75 in the K band for 2MRS. Far away only the most luminous galaxies pass, so the map thins with distance in every direction. Thinner is not emptier.',
    source: `${REPO_BLOB}/src/layers/galaxyCatalog/sources`,
    sourceLabel: `the catalogue definitions, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sim-reweight',
    text: 'Unless you change the setting, we also dim galaxies in directions a catalogue sampled more densely than its median, and brighten a little those it sampled more thinly, so that uneven coverage does not read as structure. This changes brightness, never position.',
    source: `${REPO_BLOB}/src/layers/galaxyCatalog/state/bias/initialState.ts`,
    sourceLabel: `the default bias setting, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sim-data-sizes',
    text: 'The app loads one of three data sizes, and every size cuts SDSS to its most luminous galaxies: the 500,000 most luminous of 970,067 at the largest and the 156,000 most luminous at the middle. Galaxies that appear brighter than magnitude 15 are kept as well, so that the nearby ones are not lost, which makes 502,114 and 159,899 loaded. The smallest size has none.',
    source: `${REPO_BLOB}/src/layers/galaxyCatalog/sources/sdss.ts`,
    sourceLabel: `the SDSS definition, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sim-duplicates',
    text: 'The catalogues overlap. Two rows within 5 arcseconds on the sky whose redshifts differ by less than about 0.01 are treated as one galaxy, kept from SDSS first, then 2MRS, then GLADE, then DESI. Milliquas quasars skip this step.',
    source: `${REPO_BLOB}/tools/catalog/crossMatch.ts`,
    sourceLabel: `the cross-match, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sim-star-epoch',
    text: 'Gaia DR3 gives star positions for the epoch 2016.0. We do not apply proper motion, the slow drift of each star across the sky, so the stars stand still whatever date the clock shows.',
    source: 'https://www.cosmos.esa.int/web/gaia/dr3',
    sourceLabel: 'ESA, Gaia Data Release 3',
    checked: CHECKED,
  },
  {
    id: 'sim-star-coverage',
    text: 'The star catalogue holds Gaia stars brighter than magnitude 14, the 331,312 stars of the Gaia Catalogue of Nearby Stars within 100 parsecs, and Hipparcos for the stars too bright for Gaia. Of the magnitude-14 set, 99.24 per cent has a distance estimate; the rest are left out. Each data size then keeps the stars near the Sun and, of the others, the brightest that fit its download: 1,697,603 stars at the smallest size, 5,117,467 at the middle and 12,853,984 at the largest. About four million of the faintest are in no size.',
    source: `${REPO_BLOB}/data/raw/gaia/README.md`,
    sourceLabel: `the Gaia download record, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sim-ephemeris-span',
    text: 'The clock runs outside 1900 to 2100, but there the planets keep the correction from the nearest end of that span and the 18 fitted moons fall back to mean orbits. The Moon, Pluto and the smaller moons use mean orbital elements at every date.',
    source: `${REPO_BLOB}/src/data/bodies/ephemerisCorrections.generated.ts`,
    sourceLabel: `the fitted corrections, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sim-exposure',
    text: 'Brightness is adjusted for a screen. The exposure applied to stars rises nearly fivefold as the camera pulls back from 1 parsec to 10 kiloparsecs, because a monitor cannot adapt to the dark as an eye does.',
    source: `${REPO_BLOB}/src/utils/star/starExposureRamp.ts`,
    sourceLabel: `the star exposure ramp, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sim-quasar-boost',
    text: 'Quasars are drawn three times brighter than our brightness model gives a galaxy.',
    source: `${REPO_BLOB}/src/layers/galaxyCatalog/sources/milliquas.ts`,
    sourceLabel: `the Milliquas definition, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sim-point-floor',
    text: 'A galaxy is never drawn smaller than a fixed dot, so from far away each one looks larger than it is.',
    source: `${REPO_BLOB}/src/services/gpu/shaders/galaxyCatalog/points/vertex.wesl`,
    sourceLabel: `the galaxy point shader, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'sim-true-size',
    text: 'Planets, moons and stars are spheres at their true size. One too small to fill a pixel is drawn as a point of light, which is larger than the body would appear.',
    source: `${REPO_BLOB}/docs/science.md`,
    sourceLabel: `the science notes, ${IN_REPO}`,
    checked: CHECKED,
  },

  // Counts and citation
  {
    id: 'sci-built-counts',
    about: 'app',
    text: 'The counts in the “we draw” column are for the largest data size as published on 6 October 2026. Each galaxy file is a 16-byte header and 64 bytes per object, so a count is the size of the file once decompressed, minus 16, divided by 64.',
    source: 'https://skymap-data.rulkens.com/data/manifest.json',
    sourceLabel: 'the published data manifest',
    checked: CHECKED,
  },
  {
    id: 'sci-cite-skymap',
    about: 'app',
    text: `skymap is archived on Zenodo. The DOI ${CITATION.conceptDoi} always points to the newest version; version ${CITATION.version}, released on ${formatDate(CITATION.released)}, ${CITATION.versionDoi ? `has its own DOI, ${CITATION.versionDoi}` : 'gets a DOI of its own from Zenodo, which we print here once it is in the citation file'}.`,
    source: `https://doi.org/${CITATION.conceptDoi}`,
    sourceLabel: 'skymap on Zenodo',
    checked: CHECKED,
  },
  {
    id: 'sci-cite-file',
    about: 'app',
    text: 'The repository carries a CITATION.cff file with the author, the title, the version and both DOIs, which GitHub and reference managers read.',
    source: `${REPO_BLOB}/CITATION.cff`,
    sourceLabel: `the citation file, ${IN_REPO}`,
    checked: CHECKED,
  },
];
