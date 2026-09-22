/**
 * FEATURED_TABS — the palette's curated browse tabs. Hand-edited: order on
 * screen is order in this file, and nothing generates or rewrites it. A
 * card's image is the atlas default (`cardImageSrc`, `<id>.webp` under `CARD_IMAGE_DIR`)
 * unless `image` overrides it, which only the Galaxies tab's cards do.
 */
import { MILKY_WAY_FOCUS_ID } from '../../services/url/milkyWayFocusId';
import { VOLUMES_OFF } from '../exhibits/utils/volumesOff';
import type { PaletteTab } from '../../@types/palette/PaletteTab';
import type { PaletteCardCapture } from '../../@types/palette/PaletteCardCapture';

// A tour card has no registry pose to inherit, so its whole framing lives here.
// Both mirror their tour's opening scene strip rather than the default sky, so
// the thumbnail is a frame the viewer will actually see.
const GRAND_TOUR_CAPTURE: PaletteCardCapture = {
  settings: { volumes: VOLUMES_OFF },
  pose: { target: [0, 0, 0], yaw: 0.9, pitch: 0.55, distance: 1500 },
};
// Volumes off is webShowcase's beat-1 `hide()` sweep in settings form: the tour
// reads the NAMED web — structure rings and their labels — not the density
// field the Cosmic Web card already shows.
const WEB_SHOWCASE_CAPTURE: PaletteCardCapture = {
  settings: { volumes: VOLUMES_OFF },
  pose: { target: [0, 0, 0], yaw: 2.1, pitch: 0.35, distance: 220 },
};

// `target` is ignored: the focus pins the pivot to the body. `keepFocus` is
// required because the pose is relative to a moving body.
const HUBBLE_CAPTURE: PaletteCardCapture = {
  t: '2026-09-18T13:00:12Z',
  keepFocus: true,
  pose: {
    target: [0, 0, 0],
    yaw: -1.938340168882169,
    pitch: 0.09915032713380474,
    distance: 6.55234811878065e-22,
  },
};
const VOYAGER1_CAPTURE: PaletteCardCapture = {
  t: '2026-09-18T12:56:32Z',
  keepFocus: true,
  pose: {
    target: [0, 0, 0],
    yaw: 3.8408163993487223,
    pitch: -0.6565563346622649,
    distance: 2.356833031514677e-22,
  },
};
// Same mesh as Voyager 1, so the same distance frames it the same; the angle is
// the body cards' 315° (waning gibbous), which is the one part worth computing.
const VOYAGER2_CAPTURE: PaletteCardCapture = {
  t: '2026-09-18T12:56:32Z',
  keepFocus: true,
  pose: {
    target: [0, 0, 0],
    yaw: -1.8732995647667687,
    pitch: 0.4557706224258967,
    distance: 2.356833031514677e-22,
  },
};
// Default site framing, lit at this instant. The user's own site pose needs
// the site-pose seam, which is deferred.
const PERSEVERANCE_CAPTURE: PaletteCardCapture = { t: '2026-09-18T06:00:00Z' };

// Both galaxies sit small in the fly-in's default frame (0.15 / 0.323 Mpc) on
// a busy point cloud: closer in, cloud off. Yaw/pitch are the fly-in's own.
const MILKY_WAY_CAPTURE: PaletteCardCapture = {
  keepFocus: true,
  hideGalaxyField: true,
  pose: {
    target: [0, 0, 0],
    yaw: -2.2209284168162022,
    pitch: 0.9180546247898071,
    distance: 0.06,
  },
};
// Unlike a body focus, a galaxy focus does NOT pin the pivot, so `target` is
// live here: the origin would frame the Milky Way instead of M31.
const M31_CAPTURE: PaletteCardCapture = {
  keepFocus: true,
  hideGalaxyField: true,
  pose: {
    target: [0.5765054821968079, 0.10877224802970886, 0.5148458480834961],
    yaw: -2.2209262353413513,
    pitch: 0.9180546455226823,
    distance: 0.24,
  },
};

// Every Solar System body is shot at the same phase, so the tabs read as one
// set rather than a lighting accident of each body's date. 315 deg puts the
// terminator down the right of the disc — see `bodyPhasePose` for the turn.
const WANING_GIBBOUS: PaletteCardCapture = { phaseDeg: 315 };

export const FEATURED_TABS: readonly PaletteTab[] = [
  {
    id: 'highlights',
    label: 'Highlights',
    cards: [
      {
        id: 'body-perseverance',
        label: 'Perseverance',
        blurb:
          "NASA's rover in Jezero Crater on Mars, landed in 2021. It collects rock samples from an ancient river delta for a future return to Earth.",
        action: { kind: 'focus', focusId: 'body-perseverance' },
        capture: PERSEVERANCE_CAPTURE,
      },
      {
        id: 'body-hubble',
        label: 'Hubble',
        blurb:
          'A space telescope orbiting about 540 km above Earth since 1990. Its images of distant galaxies helped pin down the age of the universe.',
        action: { kind: 'focus', focusId: 'body-hubble' },
        capture: HUBBLE_CAPTURE,
      },
      {
        id: 'body-earth',
        label: 'Earth',
        blurb: 'Our home planet, and the only world known to carry life.',
        action: { kind: 'focus', focusId: 'body-earth' },
        capture: WANING_GIBBOUS,
      },
      {
        id: 'body-saturn',
        label: 'Saturn',
        blurb:
          'A gas giant circled by rings of ice and rock. The rings span hundreds of thousands of kilometres but are mostly only tens of metres thick.',
        action: { kind: 'focus', focusId: 'body-saturn' },
        capture: WANING_GIBBOUS,
      },
      {
        id: 'star-sun',
        label: 'Sun',
        blurb: "Our star, a middle-aged yellow dwarf that holds 99.8% of the Solar System's mass.",
        action: { kind: 'focus', focusId: 'star-sun' },
      },
      {
        id: 'solarSystem',
        label: 'Solar System',
        blurb:
          'Eight planets on their real orbits, seen from above the ecliptic. Mercury goes round in 88 days; Neptune takes 165 years.',
        action: { kind: 'exhibit', exhibitId: 'solarSystem' },
      },
      {
        id: 'body-voyager1',
        label: 'Voyager 1',
        blurb:
          'Launched in 1977, it is the most distant object people have built. It crossed into interstellar space in 2012 and still sends data home.',
        action: { kind: 'focus', focusId: 'body-voyager1' },
        capture: VOYAGER1_CAPTURE,
      },
      {
        id: 'body-sgr-a-star',
        label: 'Sgr A*',
        blurb:
          "The black hole at the centre of the Milky Way, about four million times the Sun's mass. Its mass is measured from the orbits of the stars around it.",
        action: { kind: 'focus', focusId: 'body-sgr-a-star' },
      },
      {
        id: MILKY_WAY_FOCUS_ID,
        label: 'Milky Way',
        blurb:
          'Our galaxy, a barred spiral about 100,000 light-years across. The Sun sits some 26,000 light-years from its centre.',
        action: { kind: 'focus', focusId: MILKY_WAY_FOCUS_ID },
        capture: MILKY_WAY_CAPTURE,
      },
      {
        id: 'm31',
        label: 'Andromeda Galaxy',
        blurb:
          'The nearest large spiral galaxy, 2.5 million light-years away and visible to the naked eye on a dark night. It is on course to merge with the Milky Way.',
        action: { kind: 'focus', focusId: 'm31' },
        capture: M31_CAPTURE,
      },
      {
        id: 'group-local-group',
        label: 'Local Group',
        blurb:
          "The Milky Way's neighbourhood: our galaxy, Andromeda, Triangulum and dozens of dwarf galaxies, within about 10 million light-years.",
        action: { kind: 'focus', focusId: 'group-local-group' },
        capture: { keepFocus: true },
      },
      {
        id: 'cluster-virgo-m87',
        label: 'Virgo Cluster',
        blurb:
          'The nearest large galaxy cluster, about 54 million light-years away, with more than a thousand member galaxies. The giant elliptical M87 sits near its centre.',
        action: { kind: 'focus', focusId: 'cluster-virgo-m87' },
        capture: { keepFocus: true },
      },
      {
        id: 'cosmicFlows',
        label: 'Cosmic Flows',
        blurb:
          'What galaxies do besides expand apart: fall towards the mass nearest them, at hundreds of kilometres a second.',
        action: { kind: 'exhibit', exhibitId: 'cosmicFlows' },
      },
      {
        id: 'cosmicWeb',
        label: 'Cosmic Web',
        blurb:
          'The largest structure there is: filaments and knots of galaxies around empty voids, hundreds of millions of light-years across.',
        action: { kind: 'exhibit', exhibitId: 'cosmicWeb' },
      },
      {
        id: 'observableUniverse',
        label: 'Observable Universe',
        blurb:
          'Everything whose light has had time to reach us: a sphere reaching some 46 billion light-years in every direction.',
        action: { kind: 'exhibit', exhibitId: 'observableUniverse' },
      },
    ],
  },
  {
    id: 'solarSystem',
    label: 'Solar System',
    cards: [
      {
        id: 'star-sun',
        label: 'Sun',
        blurb: "Our star, a middle-aged yellow dwarf that holds 99.8% of the Solar System's mass.",
        action: { kind: 'focus', focusId: 'star-sun' },
      },
      {
        id: 'body-mercury',
        label: 'Mercury',
        blurb: 'The smallest planet and the closest to the Sun. A year there lasts 88 Earth days.',
        action: { kind: 'focus', focusId: 'body-mercury' },
        capture: WANING_GIBBOUS,
      },
      {
        id: 'body-venus',
        label: 'Venus',
        blurb:
          "Almost Earth's size, under a thick carbon-dioxide atmosphere. Its surface is hot enough to melt lead.",
        action: { kind: 'focus', focusId: 'body-venus' },
        capture: WANING_GIBBOUS,
      },
      {
        id: 'body-earth',
        label: 'Earth',
        blurb: 'Our home planet, and the only world known to carry life.',
        action: { kind: 'focus', focusId: 'body-earth' },
        capture: WANING_GIBBOUS,
      },
      {
        id: 'body-mars',
        label: 'Mars',
        blurb:
          'A cold desert planet with the largest volcano in the Solar System, Olympus Mons. Water once flowed across its surface.',
        action: { kind: 'focus', focusId: 'body-mars' },
        capture: WANING_GIBBOUS,
      },
      {
        id: 'body-jupiter',
        label: 'Jupiter',
        blurb:
          'The largest planet, more massive than all the others combined. The Great Red Spot is a storm wider than Earth.',
        action: { kind: 'focus', focusId: 'body-jupiter' },
        capture: WANING_GIBBOUS,
      },
      {
        id: 'body-saturn',
        label: 'Saturn',
        blurb:
          'A gas giant circled by rings of ice and rock. The rings span hundreds of thousands of kilometres but are mostly only tens of metres thick.',
        action: { kind: 'focus', focusId: 'body-saturn' },
        capture: WANING_GIBBOUS,
      },
      {
        id: 'body-uranus',
        label: 'Uranus',
        blurb: 'An ice giant tipped on its side, so each pole faces the Sun for decades at a time.',
        action: { kind: 'focus', focusId: 'body-uranus' },
        capture: WANING_GIBBOUS,
      },
      {
        id: 'body-neptune',
        label: 'Neptune',
        blurb:
          'The outermost planet, an ice giant with the fastest winds measured in the Solar System. It was predicted by calculation before anyone saw it.',
        action: { kind: 'focus', focusId: 'body-neptune' },
        capture: WANING_GIBBOUS,
      },
      {
        id: 'body-pluto',
        label: 'Pluto',
        blurb:
          'A dwarf planet in the Kuiper Belt, reclassified in 2006. New Horizons flew past in 2015 and found a heart-shaped plain of nitrogen ice.',
        action: { kind: 'focus', focusId: 'body-pluto' },
        capture: WANING_GIBBOUS,
      },
      {
        id: 'body-moon',
        label: 'Moon',
        blurb:
          "Earth's only natural satellite, probably formed from debris after a Mars-sized body hit the young Earth. Twelve people have walked on it.",
        action: { kind: 'focus', focusId: 'body-moon' },
        capture: WANING_GIBBOUS,
      },
      {
        id: 'body-io',
        label: 'Io',
        blurb:
          "Jupiter's innermost large moon and the most volcanically active body in the Solar System, kept hot by Jupiter's tides.",
        action: { kind: 'focus', focusId: 'body-io' },
        capture: WANING_GIBBOUS,
      },
      {
        id: 'body-europa',
        label: 'Europa',
        blurb:
          'An icy moon of Jupiter with a salty ocean under its crust, one of the likeliest places to look for life beyond Earth.',
        action: { kind: 'focus', focusId: 'body-europa' },
        capture: WANING_GIBBOUS,
      },
      {
        id: 'body-titan',
        label: 'Titan',
        blurb:
          "Saturn's largest moon, with a thick nitrogen atmosphere and lakes of liquid methane and ethane.",
        action: { kind: 'focus', focusId: 'body-titan' },
        capture: WANING_GIBBOUS,
      },
      {
        id: 'body-enceladus',
        label: 'Enceladus',
        blurb:
          'A small icy moon of Saturn that sprays water into space from its south pole, fed by an ocean under the ice.',
        action: { kind: 'focus', focusId: 'body-enceladus' },
        capture: WANING_GIBBOUS,
      },
    ],
  },
  {
    id: 'missions',
    label: 'Missions',
    cards: [
      {
        id: 'body-hubble',
        label: 'Hubble',
        blurb:
          'A space telescope orbiting about 540 km above Earth since 1990. Its images of distant galaxies helped pin down the age of the universe.',
        action: { kind: 'focus', focusId: 'body-hubble' },
        capture: HUBBLE_CAPTURE,
      },
      {
        id: 'body-voyager1',
        label: 'Voyager 1',
        blurb:
          'Launched in 1977, it is the most distant object people have built. It crossed into interstellar space in 2012 and still sends data home.',
        action: { kind: 'focus', focusId: 'body-voyager1' },
        capture: VOYAGER1_CAPTURE,
      },
      {
        id: 'body-voyager2',
        label: 'Voyager 2',
        blurb:
          'Launched in 1977, the only spacecraft to have visited Uranus and Neptune. It reached interstellar space in 2018.',
        action: { kind: 'focus', focusId: 'body-voyager2' },
        capture: VOYAGER2_CAPTURE,
      },
      {
        id: 'body-curiosity',
        label: 'Curiosity',
        blurb:
          "NASA's car-sized rover in Gale Crater, on Mars since 2012. It showed that the crater once held a lake that could have supported microbes.",
        action: { kind: 'focus', focusId: 'body-curiosity' },
        // Gale Crater's local midday; the default instant is night there.
        capture: { t: '2026-09-18T02:00:00Z' },
      },
      {
        id: 'body-perseverance',
        label: 'Perseverance',
        blurb:
          "NASA's rover in Jezero Crater on Mars, landed in 2021. It collects rock samples from an ancient river delta for a future return to Earth.",
        action: { kind: 'focus', focusId: 'body-perseverance' },
        capture: PERSEVERANCE_CAPTURE,
      },
      {
        id: 'body-spirit',
        label: 'Spirit',
        blurb:
          "One of NASA's twin Mars Exploration Rovers, in Gusev Crater. Planned for 90 days, it worked for six years before it got stuck in soft sand.",
        action: { kind: 'focus', focusId: 'body-spirit' },
        // Gusev Crater's local midday; the default instant is night there.
        capture: { t: '2026-09-17T23:20:00Z' },
      },
      {
        id: 'body-opportunity',
        label: 'Opportunity',
        blurb:
          "Spirit's twin, on Meridiani Planum. Planned for 90 days, it kept driving for almost 15 years and more than 45 km.",
        action: { kind: 'focus', focusId: 'body-opportunity' },
      },
    ],
  },
  {
    id: 'milkyWay',
    label: 'Milky Way',
    cards: [
      {
        id: MILKY_WAY_FOCUS_ID,
        label: 'Milky Way',
        blurb:
          'Our galaxy, a barred spiral about 100,000 light-years across. The Sun sits some 26,000 light-years from its centre.',
        action: { kind: 'focus', focusId: MILKY_WAY_FOCUS_ID },
        capture: MILKY_WAY_CAPTURE,
      },
      {
        id: 'zoneOfAvoidance',
        label: 'Zone of Avoidance',
        blurb:
          'The strip of sky our own galaxy hides. Dust and stars in the Milky Way’s disc block about a fifth of the extragalactic sky, and the catalogues stop at its edge.',
        action: { kind: 'exhibit', exhibitId: 'zoneOfAvoidance' },
      },
      {
        id: 'body-sgr-a-star',
        label: 'Sgr A*',
        blurb:
          "The black hole at the centre of the Milky Way, about four million times the Sun's mass. Its mass is measured from the orbits of the stars around it.",
        action: { kind: 'focus', focusId: 'body-sgr-a-star' },
      },
      {
        id: 'star-s2',
        label: 'S2',
        blurb:
          'A star that orbits Sgr A* every 16 years, passing about 120 times the Earth–Sun distance from it. Its orbit is how the black hole was weighed.',
        action: { kind: 'focus', focusId: 'star-s2' },
      },
      {
        id: 'star-sirius',
        label: 'Sirius',
        blurb:
          'The brightest star in the night sky, 8.6 light-years away. It has a white dwarf companion, Sirius B.',
        action: { kind: 'focus', focusId: 'star-sirius' },
      },
      {
        id: 'star-betelgeuse',
        label: 'Betelgeuse',
        blurb:
          "A red supergiant in Orion, so large that in the Sun's place it would reach past the orbit of Mars. It will end as a supernova.",
        action: { kind: 'focus', focusId: 'star-betelgeuse' },
      },
      {
        id: 'star-vega',
        label: 'Vega',
        blurb:
          'A bright blue-white star in Lyra, 25 light-years away. It was the pole star around 12,000 BC and will be again.',
        action: { kind: 'focus', focusId: 'star-vega' },
      },
      {
        id: 'star-polaris',
        label: 'Polaris',
        blurb:
          "The North Star, almost exactly above Earth's north pole. It is a yellow supergiant about 430 light-years away.",
        action: { kind: 'focus', focusId: 'star-polaris' },
      },
      {
        id: 'star-alpha-centauri',
        label: 'Alpha Centauri',
        blurb:
          'The nearest star system to the Sun, 4.4 light-years away: two Sun-like stars in orbit around each other, with Proxima Centauri further out.',
        action: { kind: 'focus', focusId: 'star-alpha-centauri' },
      },
      {
        id: 'star-proxima-centauri',
        label: 'Proxima Centauri',
        blurb:
          'A small red dwarf 4.2 light-years away, the closest star to the Sun. At least one planet orbits it in the zone where water could be liquid.',
        action: { kind: 'focus', focusId: 'star-proxima-centauri' },
      },
      {
        id: 'star-rigel',
        label: 'Rigel',
        blurb: "A blue supergiant at Orion's foot, around 100,000 times as luminous as the Sun.",
        action: { kind: 'focus', focusId: 'star-rigel' },
      },
      {
        id: 'star-antares',
        label: 'Antares',
        blurb:
          "A red supergiant at the heart of Scorpius. Its name means 'rival of Mars', for its colour.",
        action: { kind: 'focus', focusId: 'star-antares' },
      },
    ],
  },
  {
    id: 'galaxies',
    label: 'Galaxies',
    cards: [
      {
        id: 'm31',
        label: 'Andromeda Galaxy',
        blurb:
          'The nearest large spiral galaxy, 2.5 million light-years away and visible to the naked eye on a dark night. It is on course to merge with the Milky Way.',
        image: '/images/famous/m31.webp',
        action: { kind: 'focus', focusId: 'm31' },
        capture: M31_CAPTURE,
      },
      {
        id: 'm51',
        label: 'Whirlpool Galaxy',
        blurb:
          'A face-on spiral about 30 million light-years away, pulling on the small companion galaxy at the end of one of its arms.',
        image: '/images/famous/m51.webp',
        action: { kind: 'focus', focusId: 'm51' },
      },
      {
        id: 'm104',
        label: 'Sombrero Galaxy',
        blurb:
          'A spiral seen almost edge-on, with a bright bulge and a dark dust lane that give it its name. About 30 million light-years away.',
        image: '/images/famous/m104.webp',
        action: { kind: 'focus', focusId: 'm104' },
      },
      {
        id: 'm87',
        label: 'Virgo A',
        blurb:
          'A giant elliptical galaxy at the centre of the Virgo Cluster. Its black hole was the first ever imaged, by the Event Horizon Telescope in 2019.',
        image: '/images/famous/m87.webp',
        action: { kind: 'focus', focusId: 'm87' },
      },
      {
        id: 'c77',
        label: 'Centaurus A',
        blurb:
          'The nearest radio galaxy, about 12 million light-years away: an elliptical crossed by a dark dust lane, left over from a merger.',
        image: '/images/famous/c77.webp',
        action: { kind: 'focus', focusId: 'c77' },
      },
      {
        id: 'm82',
        label: 'Cigar Galaxy',
        blurb:
          'A starburst galaxy forming stars about ten times faster than the Milky Way, stirred up by its neighbour M81.',
        image: '/images/famous/m82.webp',
        action: { kind: 'focus', focusId: 'm82' },
      },
      {
        id: 'm81',
        label: "Bode's Galaxy",
        blurb:
          'A large spiral about 12 million light-years away, the brightest galaxy of the M81 Group.',
        image: '/images/famous/m81.webp',
        action: { kind: 'focus', focusId: 'm81' },
      },
      {
        id: 'm101',
        label: 'Pinwheel Galaxy',
        blurb: 'A large face-on spiral in Ursa Major, about 21 million light-years away.',
        image: '/images/famous/m101.webp',
        action: { kind: 'focus', focusId: 'm101' },
      },
      {
        id: 'm33',
        label: 'Triangulum Galaxy',
        blurb:
          'The third-largest galaxy in the Local Group, a loose spiral about 2.7 million light-years away.',
        image: '/images/famous/m33.webp',
        action: { kind: 'focus', focusId: 'm33' },
      },
      {
        id: 'm64',
        label: 'Black Eye Galaxy',
        blurb:
          'A spiral with a dark band of dust in front of its bright core. Its outer gas rotates the opposite way to its inner disk.',
        image: '/images/famous/m64.webp',
        action: { kind: 'focus', focusId: 'm64' },
      },
      {
        id: 'm83',
        label: 'Southern Pinwheel',
        blurb:
          'A barred spiral about 15 million light-years away, one of the closest and brightest of its kind.',
        image: '/images/famous/m83.webp',
        action: { kind: 'focus', focusId: 'm83' },
      },
      {
        id: 'm74',
        label: 'Phantom Galaxy',
        blurb:
          'An almost perfectly face-on spiral about 32 million light-years away, imaged by the James Webb Space Telescope in 2022.',
        image: '/images/famous/m74.webp',
        action: { kind: 'focus', focusId: 'm74' },
      },
      {
        id: 'm77',
        label: 'Cetus A',
        blurb:
          'A barred spiral with a very bright, active core, one of the first Seyfert galaxies identified.',
        image: '/images/famous/m77.webp',
        action: { kind: 'focus', focusId: 'm77' },
      },
      {
        id: 'c30',
        label: 'NGC 7331',
        blurb:
          "An unbarred spiral in Pegasus, about 40 million light-years away, often called the Milky Way's twin for its size and shape.",
        image: '/images/famous/c30.webp',
        action: { kind: 'focus', focusId: 'c30' },
      },
      {
        id: 'c12',
        label: 'Fireworks Galaxy',
        blurb:
          'A spiral about 25 million light-years away that has hosted ten observed supernovae in a century.',
        image: '/images/famous/c12.webp',
        action: { kind: 'focus', focusId: 'c12' },
      },
    ],
  },
  {
    id: 'deepSpace',
    label: 'Deep Space',
    cards: [
      {
        id: 'group-local-group',
        label: 'Local Group',
        blurb:
          "The Milky Way's neighbourhood: our galaxy, Andromeda, Triangulum and dozens of dwarf galaxies, within about 10 million light-years.",
        action: { kind: 'focus', focusId: 'group-local-group' },
        capture: { keepFocus: true },
      },
      {
        id: 'group-m81-group',
        label: 'M81 Group',
        blurb:
          'A nearby group of about 30 galaxies around M81 and M82, some 12 million light-years away.',
        action: { kind: 'focus', focusId: 'group-m81-group' },
        capture: { keepFocus: true },
      },
      {
        id: 'cluster-virgo-m87',
        label: 'Virgo Cluster',
        blurb:
          'The nearest large galaxy cluster, about 54 million light-years away, with more than a thousand member galaxies. The giant elliptical M87 sits near its centre.',
        action: { kind: 'focus', focusId: 'cluster-virgo-m87' },
        capture: { keepFocus: true },
      },
      {
        id: 'supercluster-laniakea-sc',
        label: 'Laniakea',
        blurb:
          'The supercluster that contains the Milky Way, defined by the way its galaxies flow. It spans about 500 million light-years and holds some 100,000 galaxies.',
        action: { kind: 'focus', focusId: 'supercluster-laniakea-sc' },
        capture: { keepFocus: true },
      },
      {
        id: 'supercluster-coma-sc',
        label: 'Coma Supercluster',
        blurb:
          'A supercluster about 300 million light-years away, built around the Coma and Leo clusters.',
        action: { kind: 'focus', focusId: 'supercluster-coma-sc' },
        capture: { keepFocus: true },
      },
      {
        id: 'void-bootes-void',
        label: 'Boötes Void',
        blurb:
          'A nearly empty region about 330 million light-years across, holding only a few dozen known galaxies.',
        action: { kind: 'focus', focusId: 'void-bootes-void' },
        capture: { keepFocus: true },
      },
      {
        id: 'cosmicFlows',
        label: 'Cosmic Flows',
        blurb:
          'What galaxies do besides expand apart: fall towards the mass nearest them, at hundreds of kilometres a second.',
        action: { kind: 'exhibit', exhibitId: 'cosmicFlows' },
      },
      {
        id: 'cosmicWeb',
        label: 'Cosmic Web',
        blurb:
          'The largest structure there is: filaments and knots of galaxies around empty voids, hundreds of millions of light-years across.',
        action: { kind: 'exhibit', exhibitId: 'cosmicWeb' },
      },
      {
        id: 'observableUniverse',
        label: 'Observable Universe',
        blurb:
          'Everything whose light has had time to reach us: a sphere reaching some 46 billion light-years in every direction.',
        action: { kind: 'exhibit', exhibitId: 'observableUniverse' },
      },
    ],
  },
  {
    id: 'tours',
    label: 'Tours',
    cards: [
      {
        id: 'grandTour',
        label: 'The Long Way Out',
        blurb:
          'Fourteen stops from the Milky Way to the edge of the observable universe, and home again. Andromeda, Virgo, Laniakea, the cosmic web, the voids.',
        action: { kind: 'tour', tourId: 'grandTour' },
        capture: GRAND_TOUR_CAPTURE,
      },
      {
        id: 'webShowcase',
        label: 'Named Cosmic Web',
        blurb:
          'Clusters and superclusters with their names on, over the bare galaxy field. Three stops, ending on M87 at the heart of Virgo.',
        action: { kind: 'tour', tourId: 'webShowcase' },
        capture: WEB_SHOWCASE_CAPTURE,
      },
    ],
  },
];
