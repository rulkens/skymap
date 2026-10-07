import type { Fact } from '../@types/Fact';
import { REPO_BLOB } from './siteIdentity';

const CHECKED = '2026-10-07';
const IN_REPO = 'in the skymap repository';

/**
 * What the two Science pages of the docs add to scienceFacts.ts, spread into
 * FACTS: `method-*` is a model with its rule and its numbers, `depart-*` a
 * place where the scene leaves the sky that no `sim-*` row holds. Every number
 * was read on the check date in the file its row cites. Figures worked out
 * from the app's own functions (a distance for a redshift, the light-travel
 * rule against the full integral) are redone in
 * tests/packages/website/docsScienceFacts.test.ts.
 */
export const DOCS_SCIENCE_FACTS: readonly Fact[] = [
  // Distance
  {
    id: 'method-comoving',
    text: 'The integral has no closed form, so we work it out by Simpson’s rule in 64 steps. The constant in front, c/H₀, is 4,283 megaparsecs. The straight-line rule, distance = cz/H₀, would put a redshift of 0.1 at 428 megaparsecs and a redshift of 1 at 4,283: 2.5 per cent and 31 per cent too far.',
    source: `${REPO_BLOB}/src/utils/math/redshiftToDistanceMpc.ts`,
    sourceLabel: `the redshift-to-distance function, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'method-cosmology-values',
    text: 'The matter density is Planck 2018’s, 0.315 ± 0.007. The Hubble constant is not Planck’s 67.4 ± 0.5: we use 70, a round figure between the measurements. The model is flat, so the dark-energy density is 1 − 0.315 = 0.685, and radiation is left out.',
    source: 'https://arxiv.org/abs/1807.06209',
    sourceLabel: 'Planck Collaboration 2018, cosmological parameters',
    checked: CHECKED,
  },
  {
    id: 'method-local-lookup',
    text: 'A distance from one of the three lists is used only when it is under 30 megaparsecs. Our own list has 14 galaxies, each with the method of its distance written beside it. Cosmicflows-4 and HyperLEDA are looked up by a galaxy’s PGC number, so a row without one keeps its redshift distance. HyperLEDA gives a distance modulus μ, which becomes megaparsecs by the rule below.',
    source: `${REPO_BLOB}/tools/catalog/catalogDistanceFor.ts`,
    sourceLabel: `the nearby-distance lookup, ${IN_REPO}`,
    checked: CHECKED,
  },

  // Galaxies: brightness, colour, size
  {
    id: 'method-galaxy-light',
    text: 'A galaxy’s light on screen starts from its absolute magnitude M, taken from one band of its catalogue: g for SDSS, J for 2MRS, B for GLADE. It is counted from the median of that galaxy’s own catalogue and divided by the square of its diameter D over 30 kiloparsecs, as below. A compact luminous galaxy is bright and a large faint one is dim.',
    source: `${REPO_BLOB}/src/utils/galaxy/galaxySbAmp.ts`,
    sourceLabel: `the galaxy brightness function, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'method-galaxy-colour',
    text: 'A galaxy’s colour on screen is the difference of two catalogued magnitudes, placed on a scale from blue through white to red. Each catalogue has its own pair and range: u − g from 0.5 to 2.0 for SDSS, B − J from 0.5 to 3.5 for GLADE, J − K from 0.7 to 1.1 for 2MRS, g − r from 0.35 to 1.05 for DESI and B − R from 0 to 2 for the quasars. For SDSS and GLADE the colour is first moved towards the blue in proportion to the redshift, a rough correction for the reddening that redshift itself causes. A galaxy without both magnitudes is drawn a pale neutral.',
    source: `${REPO_BLOB}/src/data/galaxyCatalog/colourIndex.ts`,
    sourceLabel: `the colour-index function, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'method-galaxy-size',
    text: 'A galaxy’s diameter comes from a different measurement in each catalogue. SDSS: six times the radius that holds half the light. 2MRS: the width at the contour where the infrared surface brightness falls to 20 magnitudes per square arcsecond. GLADE has no size at all, so we estimate one from the luminosity in blue light by a size-luminosity relation the code gives to Tully (1988), with the radius R in kiloparsecs, and never less than 1 kiloparsec across.',
    source: `${REPO_BLOB}/src/utils/math/galaxyDiameterKpc.ts`,
    sourceLabel: `the size estimate, ${IN_REPO}`,
    checked: CHECKED,
  },

  // Stars
  {
    id: 'method-star-magnitude',
    text: 'A star’s absolute magnitude M comes from its apparent magnitude m in Gaia’s G band and the distance d we adopted. For the stars taken from Hipparcos, m is the Hipparcos magnitude and the colour is its B − V turned into BP − RP. Nothing is corrected for the dust between the star and us.',
    source: `${REPO_BLOB}/tools/stars/buildStars.ts`,
    sourceLabel: `the star build, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'method-star-light',
    text: 'On screen a star gives the light it would send from 10 parsecs, divided by the square of the camera’s distance r counted in units of 10 parsecs. That is the inverse-square law in empty space. The result is then multiplied by an exposure we set by eye.',
    source: `${REPO_BLOB}/src/services/gpu/shaders/lib/starPhotometry.wesl`,
    sourceLabel: `the star brightness shader, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'method-star-tint',
    text: 'A star drawn as a point takes its colour from BP − RP on a scale with five anchors: blue-white at −0.30, white at 0.30, yellow-white at 0.85, orange at 1.25 and red at 2.20, with a straight mix between. They stand for the spectral classes O and B, A and F, G, K and M.',
    source: `${REPO_BLOB}/src/utils/color/starTintFromBpRp.ts`,
    sourceLabel: `the star colour scale, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'method-star-card',
    text: 'The temperature on a field star’s card comes from the colour C = BP − RP by the relation of Mucciarelli, Bellazzini and Massari (2021), taken at the Sun’s metal content; the paper gives its scatter as 60 to 80 kelvin. A star brighter than absolute magnitude 4.0 and redder than 0.9 is treated as a giant, any other as a dwarf. The luminosity adds the bolometric correction of Andrae and others (2018), which we use only between 4,000 and 8,000 kelvin, and takes the Sun’s bolometric magnitude as 4.74. The radius follows from the two, in solar units.',
    source: `${REPO_BLOB}/src/utils/astro/deriveStarProperties.ts`,
    sourceLabel: `the star estimates, ${IN_REPO}`,
    checked: CHECKED,
  },

  // Solar System
  {
    id: 'method-kepler-error',
    text: 'By themselves, for the years 1800 to 2050, JPL gives its elements an error of 10 to 600 arcseconds along the orbit, Saturn’s being the largest, and of up to 1.5 million kilometres in distance from the Sun. The fitted correction is what brings a planet to within 1,000 kilometres.',
    source: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
    sourceLabel: 'JPL Solar System Dynamics, approximate positions of the planets',
    checked: CHECKED,
  },
  {
    id: 'method-atmosphere-earth',
    text: 'Earth’s table holds three ingredients. Air molecules scatter 5.8, 13.6 and 33.1 millionths of the light per metre in red, green and blue, thinning by a factor e every 8 kilometres of height: this is why the sky is blue. Aerosols have a scale height of 1.2 kilometres, and ozone absorbs in a layer centred 25 kilometres up. The other eight tables mix published values, values worked out from them and values adjusted by eye; the file marks which is which.',
    source: `${REPO_BLOB}/src/data/bodies/atmosphereParams.ts`,
    sourceLabel: `the atmosphere tables, ${IN_REPO}`,
    checked: CHECKED,
  },

  // Milky Way and black hole
  {
    id: 'method-galactic-centre',
    text: 'The centre of the Milky Way is put at the radio position of Sagittarius A*, 8,178 parsecs from the Sun, the distance the GRAVITY Collaboration measured in 2019 with an error of 13 parsecs statistical and 22 systematic. The 40 orbits around it are published in arcseconds and become lengths through that one distance.',
    source: 'https://arxiv.org/abs/1904.05721',
    sourceLabel: 'GRAVITY Collaboration 2019, a geometric distance to the Galactic Centre black hole',
    checked: CHECKED,
  },
  {
    id: 'method-disc-radius',
    text: 'The disc of the model is 17.5 kiloparsecs in radius. That figure is ours, chosen so that the Sun, 8.2 kiloparsecs out, sits a little inside the halfway mark and among the arms.',
    source: `${REPO_BLOB}/src/data/milkyWay/galacticCenter.ts`,
    sourceLabel: `the Milky Way’s radius, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'method-black-hole',
    text: 'For a black hole that does not rotate, how far a ray of light is bent depends only on how close it passes. We compute that angle once for passes from 1 to 50 Schwarzschild radii and keep it as a table; a ray aimed closer than 3√3/2, about 2.6 radii, is captured and the pixel is black. The radius follows from the mass, r = 2GM/c²: with the 4.297 million solar masses in the code it is 12.7 million kilometres.',
    source: `${REPO_BLOB}/src/utils/lensing/buildSchwarzschildDeflectionLut.ts`,
    sourceLabel: `the light-bending table, ${IN_REPO}`,
    checked: CHECKED,
  },

  // Structures and density
  {
    id: 'method-structure-cuts',
    text: 'From MCXC we keep the clusters nearer than a redshift of 0.15 whose mass inside the radius R500 is at least 2 × 10¹⁴ solar masses, and draw each ring at 2.5 times R500, so that it encloses the galaxies and not just the hot gas the X-ray catalogue measured. From MSCC we keep the superclusters with six or more member clusters; the radius is half the largest distance between two members.',
    source: `${REPO_BLOB}/tools/structures/buildStructures.ts`,
    sourceLabel: `the structure build, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'method-reweight',
    text: 'The sky is cut into 12,288 cells of equal area, each about 1.8 degrees across, and a catalogue’s depth into 10 shells of distance. In each shell a galaxy’s brightness is multiplied by the median number of galaxies in a cell divided by the number in its own cell, and that factor is kept between 0.3 and 1.2.',
    source: `${REPO_BLOB}/src/services/engine/bake/computeAngularWeights.ts`,
    sourceLabel: `the density correction, ${IN_REPO}`,
    checked: CHECKED,
  },

  // Departures no sim-* row holds
  {
    id: 'depart-snapshot',
    text: 'The map is not a photograph of one moment. A galaxy stands at the distance it has today, yet its light, and so its redshift, left it long ago. Inside the Solar System the opposite holds: bodies are placed where they are at the clock’s instant, not where their light now reaching Earth shows them.',
    source: `${REPO_BLOB}/src/utils/math/redshiftToDistanceMpc.ts`,
    sourceLabel: `the redshift-to-distance function, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'depart-light-travel',
    text: 'The light-travel time on a galaxy’s card is a short rule, z / (1 + z) times 13.97 billion (thousand million) years, and not the model’s own integral. Against the integral it reads 2 per cent short at a redshift of 0.1, 5 per cent at 0.3 and 9 per cent at 1.',
    source: `${REPO_BLOB}/src/utils/math/lookbackTimeGyr.ts`,
    sourceLabel: `the light-travel rule, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'depart-luminosity-distance',
    text: 'A galaxy’s absolute magnitude is worked out with the comoving distance, where the luminosity distance, (1 + z) times larger, belongs, and with no correction for the part of the spectrum that redshift moves out of the band. Luminosities, as a card shows them, are therefore too low by (1 + z)². On screen the light is spread over a disc that is itself (1 + z) too wide where its size was measured, so the surface brightness is low by (1 + z)⁴.',
    source: `${REPO_BLOB}/src/utils/math/absoluteFromApparent.ts`,
    sourceLabel: `the absolute-magnitude function, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'depart-galaxy-fade',
    text: 'A galaxy too far away to be larger than its dot does not fade as distance squared. Its light is multiplied by the ratio of its true size on screen to the dot’s, raised to the power 0.7; the inverse-square law is the power 2.',
    source: `${REPO_BLOB}/src/layers/galaxyCatalog/state/galaxyCatalogs/initialState.ts`,
    sourceLabel: `the galaxies’ starting settings, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'depart-relative-brightness',
    text: 'A galaxy’s brightness on screen is counted from the median of its own catalogue, each in its own band, so it cannot be compared between two catalogues.',
    source: `${REPO_BLOB}/src/utils/galaxy/galaxyMedianAbsMag.ts`,
    sourceLabel: `the catalogue medians, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'depart-default-size',
    text: 'A galaxy with no measured size and no estimate is given a diameter of 30 kiloparsecs.',
    source: `${REPO_BLOB}/src/utils/math/defaultGalaxyDiameterKpc.ts`,
    sourceLabel: `the default galaxy size, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'depart-size-distance',
    text: 'A galaxy’s diameter in kiloparsecs is its measured angle times the comoving distance, where a distance smaller by (1 + z) belongs. An SDSS diameter is therefore too large by that factor. Seen from the Sun the galaxy still covers the angle that was measured.',
    source: `${REPO_BLOB}/tools/parsers/sdssCsv.ts`,
    sourceLabel: `the SDSS parser, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'method-local-bubble',
    text: 'The Local Bubble is one surface: the distance O’Neill and others (2024) publish for each direction from the Sun, which we smooth over 2.5 degrees and join into a mesh. Its colour and how far it lets light through are ours.',
    source: `${REPO_BLOB}/tools/localBubble/buildLocalBubbleShell.ts`,
    sourceLabel: `the Local Bubble build, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'depart-star-tint',
    text: 'The five colours of the star scale are ours, chosen to look right; they are not computed from a spectrum.',
    source: `${REPO_BLOB}/src/utils/color/starTintFromBpRp.ts`,
    sourceLabel: `the star colour scale, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'depart-other-corrections',
    text: 'The luminosity-function parameters behind the 1/V_max and Schechter choices are working values in the code, not published fits. For SDSS the code has M* = −21.18, α = −1.16 and a density of 0.0093 per cubic megaparsec; the paper it names gives, for the r band at our Hubble constant of 70, −21.21, −1.05 and 0.0051. GLADE’s values are not those of the fit its code names either, and the quasars and DESI borrow the SDSS values. Treat those two choices as a way of looking, not as a measured density.',
    source: 'https://arxiv.org/abs/astro-ph/0210215',
    sourceLabel: 'Blanton et al. 2003, the galaxy luminosity function at redshift 0.1',
    checked: CHECKED,
  },
  {
    id: 'depart-star-dust',
    text: 'No star is corrected for dust. A star behind dust is dimmer and redder in the catalogue than it is, and we draw it so; on its card it reads cooler than it is.',
    source: `${REPO_BLOB}/src/utils/astro/starLuminositySolar.ts`,
    sourceLabel: `the star luminosity estimate, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'depart-star-steps',
    text: 'A star’s absolute magnitude is stored in 128 steps of 0.19 magnitudes from −6.0 and its colour in 64 steps of 0.08 from −0.6. Anything outside those ranges is stored at the end of the range.',
    source: `${REPO_BLOB}/src/data/starCatalog/starCatalogFormat.ts`,
    sourceLabel: `the star file format, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'depart-earth-barycentre',
    text: 'Earth is drawn at the Earth-Moon barycentre, the point the pair turn about, since that is what JPL’s elements and our fit describe. The real Earth’s centre is off that point, always on the side away from the Moon.',
    source: `${REPO_BLOB}/src/data/bodies/orbitalElements.ts`,
    sourceLabel: `the orbital elements, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'depart-mean-moons',
    text: 'Seven bodies follow mean orbital elements at every date, with no fit to Horizons: the Moon, Phobos, Deimos, Puck, Nereid, Pluto and Charon. Do not use them to time an eclipse or an occultation.',
    source: `${REPO_BLOB}/tools/bodies/horizonsBodies.ts`,
    sourceLabel: `the list of fitted bodies, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'depart-planet-facts',
    text: 'The figures on a body’s card were typed by hand from rounded textbook values, with no source kept for each. For a number you mean to quote, use NASA’s Planetary Fact Sheet.',
    source: `${REPO_BLOB}/docs/DATA.md`,
    sourceLabel: `the data pipeline notes, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'depart-hand-structures',
    text: 'The 3 voids and 16 groups exist only as rows we placed by hand, as do the 15 clusters and 8 superclusters that replace a catalogue row, and none has a reference. A void or a group has no agreed edge: take every such ring as our choice of where to draw one.',
    source: `${REPO_BLOB}/docs/DATA.md`,
    sourceLabel: `the data pipeline notes, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'depart-black-hole-mass',
    text: 'The black hole’s mass and its distance come from two different fits. The distance is the 8,178 parsecs of 2019; the mass matches the GRAVITY Collaboration’s later fit, 4.30 million solar masses to a quarter of a per cent, which was made with its own distance, 8,277 parsecs.',
    source: 'https://arxiv.org/abs/2112.07478',
    sourceLabel: 'GRAVITY Collaboration 2022, the mass distribution in the Galactic Centre',
    checked: CHECKED,
  },
  {
    id: 'depart-frame-size',
    text: 'The cosmic microwave background is 3.372 millikelvin warmer in one direction than its mean of 2.728 kelvin, which puts the Sun’s speed against it at 370 km/s. A redshift measured from the Sun differs from one in that frame by up to that speed, which is 5 megaparsecs at our Hubble constant.',
    source: 'https://arxiv.org/abs/astro-ph/9605054',
    sourceLabel: 'Fixsen et al. 1996, the cosmic microwave background spectrum from the full COBE FIRAS data set',
    checked: CHECKED,
  },
  {
    id: 'depart-star-motion',
    text: 'Barnard’s Star crosses the sky at 10.4 arcseconds a year: 0.80 in right ascension and 10.36 in declination, in Gaia’s third data release.',
    source: 'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=Barnard%27s+star',
    sourceLabel: 'SIMBAD, Barnard’s Star',
    checked: CHECKED,
  },
  {
    id: 'depart-labels',
    about: 'app',
    text: 'Names are thinned. Where two would overlap on screen, the object that looks larger keeps its name and the other goes unnamed until you move. A missing name does not mean a missing object.',
    source: `${REPO_BLOB}/src/utils/labels/declutterByScreenSeparation.ts`,
    sourceLabel: `the label thinning, ${IN_REPO}`,
    checked: CHECKED,
  },
];
