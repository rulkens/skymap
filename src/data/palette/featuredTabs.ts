/**
 * FEATURED_TABS — the palette's curated browse tabs. Hand-edited: order on
 * screen is order in this file, and nothing generates or rewrites it. A
 * card's image is the atlas default (`cardImageSrc`, `/images/featured/<id>.webp`)
 * unless `image` overrides it, which only the Galaxies tab's cards do.
 */
import { MILKY_WAY_FOCUS_ID } from '../../services/url/milkyWayFocusId';
import type { PaletteTab } from '../../@types/palette/PaletteTab';

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
      },
      {
        id: 'body-hubble',
        label: 'Hubble',
        blurb:
          'A space telescope orbiting about 540 km above Earth since 1990. Its images of distant galaxies helped pin down the age of the universe.',
        action: { kind: 'focus', focusId: 'body-hubble' },
      },
      {
        id: 'body-earth',
        label: 'Earth',
        blurb: 'Our home planet, and the only world known to carry life.',
        action: { kind: 'focus', focusId: 'body-earth' },
      },
      {
        id: 'body-saturn',
        label: 'Saturn',
        blurb:
          'A gas giant circled by rings of ice and rock. The rings span hundreds of thousands of kilometres but are mostly only tens of metres thick.',
        action: { kind: 'focus', focusId: 'body-saturn' },
      },
      {
        id: 'body-sun',
        label: 'Sun',
        blurb: "Our star, a middle-aged yellow dwarf that holds 99.8% of the Solar System's mass.",
        action: { kind: 'focus', focusId: 'body-sun' },
      },
      {
        id: 'solarSystem',
        label: 'Solar System',
        blurb: 'Coming soon',
        action: { kind: 'view', viewId: 'solarSystem' },
      },
      {
        id: 'body-voyager1',
        label: 'Voyager 1',
        blurb:
          'Launched in 1977, it is the most distant object people have built. It crossed into interstellar space in 2012 and still sends data home.',
        action: { kind: 'focus', focusId: 'body-voyager1' },
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
      },
      {
        id: 'm31',
        label: 'Andromeda Galaxy',
        blurb:
          'The nearest large spiral galaxy, 2.5 million light-years away and visible to the naked eye on a dark night. It is on course to merge with the Milky Way.',
        action: { kind: 'focus', focusId: 'm31' },
      },
      {
        id: 'group-local-group',
        label: 'Local Group',
        blurb:
          "The Milky Way's neighbourhood: our galaxy, Andromeda, Triangulum and dozens of dwarf galaxies, within about 10 million light-years.",
        action: { kind: 'focus', focusId: 'group-local-group' },
      },
      {
        id: 'cluster-virgo-m87',
        label: 'Virgo Cluster',
        blurb:
          'The nearest large galaxy cluster, about 54 million light-years away, with more than a thousand member galaxies. The giant elliptical M87 sits near its centre.',
        action: { kind: 'focus', focusId: 'cluster-virgo-m87' },
      },
      {
        id: 'cosmicFlows',
        label: 'Cosmic Flows',
        blurb: 'Coming soon',
        action: { kind: 'view', viewId: 'cosmicFlows' },
      },
      {
        id: 'cosmicWeb',
        label: 'Cosmic Web',
        blurb: 'Coming soon',
        action: { kind: 'view', viewId: 'cosmicWeb' },
      },
      {
        id: 'observableUniverse',
        label: 'Observable Universe',
        blurb: 'Coming soon',
        action: { kind: 'view', viewId: 'observableUniverse' },
      },
    ],
  },
  {
    id: 'solarSystem',
    label: 'Solar System',
    cards: [
      {
        id: 'body-sun',
        label: 'Sun',
        blurb: "Our star, a middle-aged yellow dwarf that holds 99.8% of the Solar System's mass.",
        action: { kind: 'focus', focusId: 'body-sun' },
      },
      {
        id: 'body-mercury',
        label: 'Mercury',
        blurb: 'The smallest planet and the closest to the Sun. A year there lasts 88 Earth days.',
        action: { kind: 'focus', focusId: 'body-mercury' },
      },
      {
        id: 'body-venus',
        label: 'Venus',
        blurb:
          "Almost Earth's size, under a thick carbon-dioxide atmosphere. Its surface is hot enough to melt lead.",
        action: { kind: 'focus', focusId: 'body-venus' },
      },
      {
        id: 'body-earth',
        label: 'Earth',
        blurb: 'Our home planet, and the only world known to carry life.',
        action: { kind: 'focus', focusId: 'body-earth' },
      },
      {
        id: 'body-mars',
        label: 'Mars',
        blurb:
          'A cold desert planet with the largest volcano in the Solar System, Olympus Mons. Water once flowed across its surface.',
        action: { kind: 'focus', focusId: 'body-mars' },
      },
      {
        id: 'body-jupiter',
        label: 'Jupiter',
        blurb:
          'The largest planet, more massive than all the others combined. The Great Red Spot is a storm wider than Earth.',
        action: { kind: 'focus', focusId: 'body-jupiter' },
      },
      {
        id: 'body-saturn',
        label: 'Saturn',
        blurb:
          'A gas giant circled by rings of ice and rock. The rings span hundreds of thousands of kilometres but are mostly only tens of metres thick.',
        action: { kind: 'focus', focusId: 'body-saturn' },
      },
      {
        id: 'body-uranus',
        label: 'Uranus',
        blurb: 'An ice giant tipped on its side, so each pole faces the Sun for decades at a time.',
        action: { kind: 'focus', focusId: 'body-uranus' },
      },
      {
        id: 'body-neptune',
        label: 'Neptune',
        blurb:
          'The outermost planet, an ice giant with the fastest winds measured in the Solar System. It was predicted by calculation before anyone saw it.',
        action: { kind: 'focus', focusId: 'body-neptune' },
      },
      {
        id: 'body-pluto',
        label: 'Pluto',
        blurb:
          'A dwarf planet in the Kuiper Belt, reclassified in 2006. New Horizons flew past in 2015 and found a heart-shaped plain of nitrogen ice.',
        action: { kind: 'focus', focusId: 'body-pluto' },
      },
      {
        id: 'body-moon',
        label: 'Moon',
        blurb:
          "Earth's only natural satellite, probably formed from debris after a Mars-sized body hit the young Earth. Twelve people have walked on it.",
        action: { kind: 'focus', focusId: 'body-moon' },
      },
      {
        id: 'body-io',
        label: 'Io',
        blurb:
          "Jupiter's innermost large moon and the most volcanically active body in the Solar System, kept hot by Jupiter's tides.",
        action: { kind: 'focus', focusId: 'body-io' },
      },
      {
        id: 'body-europa',
        label: 'Europa',
        blurb:
          'An icy moon of Jupiter with a salty ocean under its crust, one of the likeliest places to look for life beyond Earth.',
        action: { kind: 'focus', focusId: 'body-europa' },
      },
      {
        id: 'body-titan',
        label: 'Titan',
        blurb:
          "Saturn's largest moon, with a thick nitrogen atmosphere and lakes of liquid methane and ethane.",
        action: { kind: 'focus', focusId: 'body-titan' },
      },
      {
        id: 'body-enceladus',
        label: 'Enceladus',
        blurb:
          'A small icy moon of Saturn that sprays water into space from its south pole, fed by an ocean under the ice.',
        action: { kind: 'focus', focusId: 'body-enceladus' },
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
      },
      {
        id: 'body-voyager1',
        label: 'Voyager 1',
        blurb:
          'Launched in 1977, it is the most distant object people have built. It crossed into interstellar space in 2012 and still sends data home.',
        action: { kind: 'focus', focusId: 'body-voyager1' },
      },
      {
        id: 'body-voyager2',
        label: 'Voyager 2',
        blurb:
          'Launched in 1977, the only spacecraft to have visited Uranus and Neptune. It reached interstellar space in 2018.',
        action: { kind: 'focus', focusId: 'body-voyager2' },
      },
      {
        id: 'body-curiosity',
        label: 'Curiosity',
        blurb:
          "NASA's car-sized rover in Gale Crater, on Mars since 2012. It showed that the crater once held a lake that could have supported microbes.",
        action: { kind: 'focus', focusId: 'body-curiosity' },
      },
      {
        id: 'body-perseverance',
        label: 'Perseverance',
        blurb:
          "NASA's rover in Jezero Crater on Mars, landed in 2021. It collects rock samples from an ancient river delta for a future return to Earth.",
        action: { kind: 'focus', focusId: 'body-perseverance' },
      },
      {
        id: 'body-spirit',
        label: 'Spirit',
        blurb:
          "One of NASA's twin Mars Exploration Rovers, in Gusev Crater. Planned for 90 days, it worked for six years before it got stuck in soft sand.",
        action: { kind: 'focus', focusId: 'body-spirit' },
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
      },
      {
        id: 'body-sgr-a-star',
        label: 'Sgr A*',
        blurb:
          "The black hole at the centre of the Milky Way, about four million times the Sun's mass. Its mass is measured from the orbits of the stars around it.",
        action: { kind: 'focus', focusId: 'body-sgr-a-star' },
      },
      {
        id: 'body-s2',
        label: 'S2',
        blurb:
          'A star that orbits Sgr A* every 16 years, passing about 120 times the Earth–Sun distance from it. Its orbit is how the black hole was weighed.',
        action: { kind: 'focus', focusId: 'body-s2' },
      },
      {
        id: 'body-sirius',
        label: 'Sirius',
        blurb:
          'The brightest star in the night sky, 8.6 light-years away. It has a white dwarf companion, Sirius B.',
        action: { kind: 'focus', focusId: 'body-sirius' },
      },
      {
        id: 'body-betelgeuse',
        label: 'Betelgeuse',
        blurb:
          "A red supergiant in Orion, so large that in the Sun's place it would reach past the orbit of Mars. It will end as a supernova.",
        action: { kind: 'focus', focusId: 'body-betelgeuse' },
      },
      {
        id: 'body-vega',
        label: 'Vega',
        blurb:
          'A bright blue-white star in Lyra, 25 light-years away. It was the pole star around 12,000 BC and will be again.',
        action: { kind: 'focus', focusId: 'body-vega' },
      },
      {
        id: 'body-polaris',
        label: 'Polaris',
        blurb:
          "The North Star, almost exactly above Earth's north pole. It is a yellow supergiant about 430 light-years away.",
        action: { kind: 'focus', focusId: 'body-polaris' },
      },
      {
        id: 'body-alpha-centauri',
        label: 'Alpha Centauri',
        blurb:
          'The nearest star system to the Sun, 4.4 light-years away: two Sun-like stars in orbit around each other, with Proxima Centauri further out.',
        action: { kind: 'focus', focusId: 'body-alpha-centauri' },
      },
      {
        id: 'body-proxima-centauri',
        label: 'Proxima Centauri',
        blurb:
          'A small red dwarf 4.2 light-years away, the closest star to the Sun. At least one planet orbits it in the zone where water could be liquid.',
        action: { kind: 'focus', focusId: 'body-proxima-centauri' },
      },
      {
        id: 'body-rigel',
        label: 'Rigel',
        blurb: "A blue supergiant at Orion's foot, around 100,000 times as luminous as the Sun.",
        action: { kind: 'focus', focusId: 'body-rigel' },
      },
      {
        id: 'body-antares',
        label: 'Antares',
        blurb:
          "A red supergiant at the heart of Scorpius. Its name means 'rival of Mars', for its colour.",
        action: { kind: 'focus', focusId: 'body-antares' },
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
      },
      {
        id: 'group-m81-group',
        label: 'M81 Group',
        blurb:
          'A nearby group of about 30 galaxies around M81 and M82, some 12 million light-years away.',
        action: { kind: 'focus', focusId: 'group-m81-group' },
      },
      {
        id: 'cluster-virgo-m87',
        label: 'Virgo Cluster',
        blurb:
          'The nearest large galaxy cluster, about 54 million light-years away, with more than a thousand member galaxies. The giant elliptical M87 sits near its centre.',
        action: { kind: 'focus', focusId: 'cluster-virgo-m87' },
      },
      {
        id: 'supercluster-laniakea-sc',
        label: 'Laniakea',
        blurb:
          'The supercluster that contains the Milky Way, defined by the way its galaxies flow. It spans about 500 million light-years and holds some 100,000 galaxies.',
        action: { kind: 'focus', focusId: 'supercluster-laniakea-sc' },
      },
      {
        id: 'supercluster-coma-sc',
        label: 'Coma Supercluster',
        blurb:
          'A supercluster about 300 million light-years away, built around the Coma and Leo clusters.',
        action: { kind: 'focus', focusId: 'supercluster-coma-sc' },
      },
      {
        id: 'void-bootes-void',
        label: 'Boötes Void',
        blurb:
          'A nearly empty region about 330 million light-years across, holding only a few dozen known galaxies.',
        action: { kind: 'focus', focusId: 'void-bootes-void' },
      },
    ],
  },
];
