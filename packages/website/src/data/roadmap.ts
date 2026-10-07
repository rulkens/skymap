import type { RoadmapGroup } from '../@types/RoadmapGroup';

const SPECS = 'docs/superpowers/specs';

/**
 * The Roadmap page (content/docs/roadmap.mdx), chosen by hand from the
 * repository's docs/BACKLOG.md and its written designs: what a visitor would
 * notice, in a visitor's words: what will be added or improved, never what is
 * wrong today. Refactors, fixes and tooling are left out. The page groups the
 * rows by state and prints a group's title as each row's theme.
 * A row's state follows the mark its backlog line carries (ready, needs-design
 * and needs-perf are planned; deferred, blocked, awaiting-decision and
 * needs-verification are an idea), unless a part of it is built already.
 * tests/packages/website/roadmap.test.ts holds every row to its line or its
 * design file, so the page cannot keep an item that has shipped or been dropped.
 */
export const ROADMAP: readonly RoadmapGroup[] = [
  {
    id: 'to-see',
    title: 'To see',
    items: [
      {
        id: 'dust',
        title: 'Dust round the Sun',
        text: 'A published three-dimensional map of the dust within 1,250 parsecs of the Sun, dimming and reddening the stars behind it. The tool that builds its data is written; the app does not draw it yet.',
        state: 'in progress',
        spec: `${SPECS}/2026-08-20-edenhofer-dust-volume.md`,
        built: 'tools/volumes/buildDustVolume.ts',
      },
      {
        id: 'milky-way-model',
        title: 'A Milky Way drawn from a model',
        text: 'A second way of drawing the Milky Way, from a model of its light and dust, beside the cloud of points the app draws today.',
        state: 'planned',
        backlog: 'Draw the v2 analytic Milky Way in the `milkyWay` Layer, beside v1',
      },
      {
        id: 'galactic-centre-places',
        title: 'Places at the centre of the Milky Way',
        text: 'Markers round Sagittarius A* for the central star cluster, the Arches and Quintuplet clusters and the Central Molecular Zone.',
        state: 'planned',
        backlog: 'Galactic Center place labels',
      },
      {
        id: 'galaxy-impostors',
        title: 'Galaxies with structure at middle distance',
        text: 'A galaxy at middle distance drawn from a picture of its generated model, where the app now shows a photograph from a sky survey.',
        state: 'planned',
        backlog: 'Galaxy impostor LOD',
      },
      {
        id: 'distant-fading',
        title: 'Faint galaxies that fade with distance',
        text: 'Galaxies shown or hidden by how bright they would look from where the camera is. A design is written and has to be revised.',
        state: 'planned',
        spec: `${SPECS}/2026-07-10-distant-galaxy-fading-design.md`,
      },
      {
        id: 'relief',
        title: 'Relief on moons',
        text: 'Craters and ridges that change the outline of a small moon as well as its shading.',
        state: 'planned',
        backlog: 'Real relief displacement for near-spherical bodies',
      },
      {
        id: 'mars-relief',
        title: 'Finer terrain over the whole of Mars',
        text: 'Two more levels of terrain everywhere on Mars, from the MOLA heights.',
        state: 'planned',
        backlog: 'Mars global height z8–z9 from MOLA (supports z9.7)',
      },
      {
        id: 'shadows',
        title: 'Shadows on spacecraft and rovers',
        text: 'A 3D model that shades itself from the Sun, so that a rover’s mast throws a shadow on its deck.',
        state: 'planned',
        backlog: 'Mesh bodies: sun shadows',
      },
      {
        id: 'pluto-pair',
        title: 'Pluto and Charon round their common centre',
        text: 'Pluto and Charon each circling the point between them, which Pluto’s four small moons wait for.',
        state: 'planned',
        backlog: 'Barycentric orbit pairs',
      },
      {
        id: 'sky-sphere',
        title: 'The sky as a sphere',
        text: 'A switch that moves the stars and the constellation lines between their true places in space and a sphere round the Earth.',
        state: 'planned',
        backlog: 'Celestial-sphere morph toggle',
      },
      {
        id: 'dust-lanes',
        title: 'The dark lanes of the Milky Way from Earth',
        text: 'The dust of the Milky Way as a sharp pattern over the whole sky when the camera is at a planet.',
        state: 'planned',
        backlog: 'Earth-sky extinction panorama',
      },
      {
        id: 'jwst',
        title: 'The James Webb Space Telescope',
        text: 'The telescope as a model to fly to, once a craft can be placed at the point beyond Earth where it is stationed.',
        state: 'idea',
        backlog: 'JWST mesh body',
      },
      {
        id: 'constellations',
        title: 'Constellations you can search for',
        text: 'A constellation found in the search, flown to, and its lines lit.',
        state: 'idea',
        backlog: 'Constellation interactivity',
      },
      {
        id: 'atlas-figures',
        title: 'Figures from old star atlases',
        text: 'The engraved figures of Flamsteed’s or Bode’s atlas laid on the sky behind the constellation lines.',
        state: 'idea',
        backlog: 'Antique-atlas constellation figures (Flamsteed / Bode)',
      },
      {
        id: 'desi-dr1',
        title: 'The whole first DESI data release',
        text: 'About 9.75 million galaxies and quasars, three times what the app draws at the large data size, so it waits for a way to draw more points.',
        state: 'idea',
        backlog: 'DESI DR1 as a data source',
      },
    ],
  },
  {
    id: 'teaching-and-domes',
    title: 'Tours and domes',
    items: [
      {
        id: 'tour-earth-start',
        title: 'A tour that starts at Earth',
        text: '“The Long Way Out” opening at Earth, with steps for the solar system and the nearby stars before the Milky Way.',
        state: 'planned',
        backlog: 'Grand tour: Earth start + scale rungs',
      },
      {
        id: 'kiosk',
        title: 'Kiosk mode',
        text: 'A tour that plays unattended and starts again, and perhaps a return to it when nobody has touched the screen for a while.',
        state: 'planned',
        backlog: 'Museum kiosk mode',
      },
      {
        id: 'dome-labels',
        title: 'Names in dome mode',
        text: 'Names drawn on the fisheye picture, which has none today, and stars sized in the dome’s own pixels.',
        state: 'planned',
        backlog: 'Dome output-space overlays: labels plus pixel floors in fisheye pixels',
      },
      {
        id: 'openspace-controls',
        title: 'Controls like OpenSpace',
        text: 'A second set of mouse controls that behaves as OpenSpace does, for people who run a planetarium with it. The groundwork is in the app.',
        state: 'in progress',
        spec: `${SPECS}/2026-09-29-openspace-camera-mode-design.md`,
        built: 'src/services/engine/camera/controlSchemes.ts',
      },
      {
        id: 'structure-shapes',
        title: 'Superclusters with their own shape',
        text: 'A supercluster or a wall picked out by its real extent.',
        state: 'planned',
        backlog: 'Supercluster/wall shape in focus',
      },
    ],
  },
  {
    id: 'accuracy',
    title: 'Accuracy',
    items: [
      {
        id: 'star-magnitudes',
        title: 'A night sky as bright as the real one',
        text: 'The brightness of stars seen from Earth set so that the sky matches what an eye sees.',
        state: 'planned',
        backlog: 'Real star apparent magnitudes from Earth',
      },
      {
        id: 'missing-stars',
        title: 'The last naked-eye stars of the constellation figures',
        text: 'About 24 stars of magnitude 3.9 to 5.1 on the constellation figures, added to the star data.',
        state: 'planned',
        backlog: '~24 naked-eye figure stars absent from star bins',
      },
      {
        id: 'mars-air',
        title: 'The right thickness of air at the Mars rover sites',
        text: 'The atmosphere measured from the planet’s reference surface.',
        state: 'planned',
        backlog: 'Atmosphere density altitude-zero is the relief floor',
      },
      {
        id: 'saturn-rings',
        title: 'Brighter rings for Saturn',
        text: 'The brightness of the rings set again beside the planet’s disc.',
        state: 'planned',
        backlog: 'Saturn ring brightness',
      },
      {
        id: 'eclipse',
        title: 'A solar eclipse with a sharp edge',
        text: 'The Sun’s glow kept from spreading over the edge of the Moon as it crosses.',
        state: 'planned',
        backlog: 'Sun bloom inflates the solar disc against a transiting Moon',
      },
      {
        id: 's-star-lensing',
        title: 'The stars round Sagittarius A* bent by it',
        text: 'The light of the stars in orbit round the black hole bent by it, as the light of the far sky already is.',
        state: 'planned',
        backlog: 'S-stars are not lensed by Sgr A\\*',
      },
      {
        id: 'quasar-colours',
        title: 'Quasars in colours of their own',
        text: 'A colour scale for quasars, which share the galaxies’ scale today.',
        state: 'planned',
        backlog: 'Milliquas AGN colormap',
      },
      {
        id: 'clouds',
        title: 'Clouds with thickness, and today’s weather',
        text: 'Earth’s clouds lit as a layer with depth, and perhaps the real cloud cover of the day in place of one fixed picture.',
        state: 'idea',
        backlog: 'Cloud deck PBR + live coverage',
      },
      {
        id: 'desi-shapes',
        title: 'Real shapes for DESI galaxies',
        text: 'Sizes and tilts for DESI galaxies, if another DESI table holds them; the tables the app reads do not.',
        state: 'idea',
        backlog: 'DESI BGS real galaxy shapes',
      },
    ],
  },
  {
    id: 'using',
    title: 'Using the app',
    items: [
      {
        id: 'card-phase',
        title: 'Phase and brightness on a planet’s card',
        text: 'The phase of the planet or moon in focus at the scene’s date, and its apparent brightness.',
        state: 'planned',
        backlog: 'InfoCard live phase + apparent-mag rows',
      },
      {
        id: 'earth-link',
        title: 'A link to a place on Earth',
        text: 'A longitude and a latitude in the address, which you could write by hand.',
        state: 'planned',
        backlog: 'Earth point in the URL hash',
      },
      {
        id: 'label-declutter',
        title: 'Names that hold still',
        text: 'A switch for thinning out overlapping names, and names that do not come and go while the camera moves.',
        state: 'planned',
        backlog: 'Label declutter toggle + hysteresis',
      },
      {
        id: 'greek-letters',
        title: 'Greek letters in star names',
        text: 'δ Velorum where the app now writes Delta Velorum.',
        state: 'planned',
        backlog: 'Greek letters in star labels',
      },
      {
        id: 'you-are-here',
        title: 'A “You are here” that follows you in',
        text: 'The label, which fades out within 2 kiloparsecs of the Sun, perhaps handed over to the Sun and then to Earth.',
        state: 'planned',
        backlog: '"You are here" label continuity',
      },
      {
        id: 'smooth-zoom',
        title: 'A smoother wheel and a coasting flick',
        text: 'Zoom that eases between steps of the wheel, and a view that goes on turning for a moment after a quick drag. The app was designed without it.',
        state: 'idea',
        backlog: 'Camera smooth wheel zoom + flick coast',
      },
    ],
  },
  {
    id: 'speed-and-devices',
    title: 'Devices',
    items: [
      {
        id: 'desktop-app',
        title: 'A desktop app that runs offline',
        text: 'skymap as a program for macOS and Windows that downloads its data once and then needs no network. A design is written.',
        state: 'planned',
        spec: `${SPECS}/2026-09-19-desktop-offline-app-design.md`,
      },
      {
        id: 'fetch-by-scale',
        title: 'A lighter start',
        text: 'A catalogue fetched only once the camera is far enough out to see it: about 68 MB of the 102 MB fetched at the start today, at the medium data size.',
        state: 'planned',
        backlog: 'Scale-gated asset demand',
      },
    ],
  },
];
