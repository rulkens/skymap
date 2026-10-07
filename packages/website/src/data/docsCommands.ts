import type { DocsCommandGroup } from '../@types/DocsCommandGroup';

const DATA = 'docs/DATA.md';
const DEPLOY = 'docs/DEPLOY.md';
const SITE_TOOLS = 'tools/site/README.md';
const SCENE = 'tools/scene-workbench/README.md';
const RECORD = 'tools/record/README.md';
const CONTRIBUTING = 'CONTRIBUTING.md';

/**
 * The tables of the Command-line tools page (content/docs/developers/cli.mdx):
 * every `npm run` script a developer types, by task. A row with several
 * scripts is a family that does one thing to different inputs.
 * tests/packages/website/docsProject.test.ts holds this list and
 * DOCS_COMMANDS_UNLISTED to the scripts of the root package.json: a script
 * added there fails the test until it has a row or a reason to have none.
 */
export const DOCS_COMMANDS: readonly DocsCommandGroup[] = [
  {
    id: 'run-and-build',
    title: 'Run and build',
    rows: [
      {
        scripts: ['fetch-data'],
        does: 'Downloads the published app’s built data files into public/data/, so that a fresh copy of the repository has something to draw.',
        manual: DATA,
      },
      {
        scripts: ['dev'],
        does: 'Serves the app from the source, on port 5173, and reloads it as files change.',
        manual: 'README.md',
      },
      {
        scripts: ['build'],
        does: 'Checks the types, then builds the app, the three public workbenches and this site into dist/.',
        manual: DEPLOY,
      },
      {
        scripts: ['preview'],
        does: 'Serves what the build wrote.',
        manual: DEPLOY,
      },
    ],
  },
  {
    id: 'data',
    title: 'Data',
    rows: [
      {
        scripts: [
          'fetch-2mass-xsc',
          'fetch-cf4',
          'fetch-desi',
          'fetch-dhm',
          'fetch-eox',
          'fetch-gaia',
          'fetch-height',
          'fetch-horizons',
          'fetch-hyperleda',
          'fetch-local-bubble',
          'fetch-milliquas',
          'fetch-skraafoto',
          'fetch-structures',
          'fetch-textures',
        ],
        family: 'fetch-<source>',
        does: 'One for each source, downloading its raw files into data/raw/: <sources>. The one for structures fetches both cluster catalogues; those for dhm and skraafoto need an API key.',
        manual: DATA,
      },
      {
        scripts: ['build-all', 'build-tiers'],
        does: 'Cross-matches the galaxy catalogues and writes one file for each catalogue at each data size. The two names run the same tool.',
        manual: DATA,
      },
      {
        scripts: ['build-stars-rs', 'build-stars'],
        does: 'Write the star files at each data size: the first in Rust, which the published files come from, the second the reference build in TypeScript.',
        manual: 'tools/stars-rs/README.md',
      },
      {
        scripts: ['build-famous', 'build-famous-stars', 'build-structures'],
        does: 'Write the named galaxies, the named stars and the markers of clusters, superclusters and the other structures, from two cluster catalogues and the lists kept in data/seeds/.',
        manual: DATA,
      },
      {
        scripts: ['build-filaments', 'build-filaments-sdss', 'build-filaments-small'],
        does: 'Trace the filament skeleton of the cosmic web with DisPerSE from the built galaxy files: 2MRS and GLADE together (SDSS is left out on purpose), SDSS alone as a test, or a sparser skeleton at a higher threshold.',
        manual: DATA,
      },
      {
        scripts: ['build-mcpm', 'build-dust', 'build-flow-field', 'build-local-bubble'],
        does: 'Write the density field of the cosmic web, the dust near the Sun, the CF4++ velocity field and the shell of the Local Bubble.',
        manual: DATA,
      },
      {
        scripts: ['build-ephemeris-corrections', 'build-planet-facts'],
        does: 'Fit the corrections to the planets’ and moons’ orbits against JPL Horizons, and compile the facts an info card shows. Both write source files that are committed.',
        manual: 'data/raw/horizons/README.md',
      },
      {
        scripts: ['build-textures', 'build-surface-tiles', 'build-site-ground-heights'],
        does: 'Resize the maps of planets and moons to the three data sizes, cut Earth and Mars into tiles, and read the height of the ground under each rover and under Søndermarken.',
        manual: DATA,
      },
      {
        scripts: ['import-mesh', 'prebake-mesh', 'build-meshes'],
        does: 'Take a 3D model from its download to the mesh and textures the app loads. The first two run Blender.',
        manual: DATA,
      },
      {
        scripts: ['bake-lidar', 'bake-splats', 'bake-mesh', 'crop-mesh', 'repack-atlas'],
        does: 'Reconstruct a place from a laser scan and aerial photographs: a point cloud, Gaussian splats, a textured mesh, the mesh cut to an outline, and its texture packed again at a set size.',
        manual: SCENE,
      },
      {
        scripts: ['build-fonts', 'build-env-brdf-lut', 'build-pgc-aliases'],
        does: 'Write three small files that are committed: the label font as a distance-field atlas, a lookup table for lighting the 3D models, and the catalogue names the search knows a galaxy by.',
        manual: DATA,
      },
      {
        scripts: [
          'expand-famous',
          'famous-seed-from-leda',
          'fetch-famous-images',
          'build-famous-thumbs',
          'build-famous-hires',
        ],
        does: 'Maintain the list of named galaxies and their pictures: add entries from the Messier and Caldwell lists or from HyperLEDA, fetch a picture of each into public/images/famous/, and prepare the pictures for the cards and for upload.',
        manual: 'tools/famous-curator/README.md',
      },
      {
        scripts: ['promote-mcpm-workbench'],
        does: 'Turns a density cube exported from the MCPM workbench into a field the app can show.',
        manual: 'tools/mcpm-workbench/README.md',
      },
      {
        scripts: ['build-data-manifest'],
        does: 'Puts a hash of each built file’s contents into its name and writes the list the app finds the files by. The commands that write catalogue, star, named-object, structure, filament, field and mesh files run it themselves.',
        manual: DATA,
      },
    ],
  },
  {
    id: 'pictures-and-films',
    title: 'Pictures and films',
    rows: [
      {
        scripts: ['shot'],
        does: 'Takes a picture of any link into the app, in a browser without a window, and prints the file’s path.',
        manual: 'tools/shot/README.md',
      },
      {
        scripts: ['capture-featured'],
        does: 'Takes the small pictures on the cards of the search, one for each card that has none.',
        manual: 'tools/capture/README.md',
      },
      {
        scripts: ['record-tour', 'record-clip'],
        does: 'Record a tour, or one clip, frame by frame into an MP4 film. A slow frame costs time and never smoothness.',
        manual: RECORD,
      },
      {
        scripts: ['tour-length'],
        does: 'Prints the steps of a tour with the time each takes, and the total.',
        manual: 'tools/animation/tourLength.ts',
      },
      {
        scripts: ['site:shots', 'site:loops', 'site:media'],
        does: 'Take this site’s pictures and its short films from a running app, and cut the flight on the home page from a recording.',
        manual: SITE_TOOLS,
      },
    ],
  },
  {
    id: 'measuring',
    title: 'Measuring',
    rows: [
      {
        scripts: ['perf'],
        does: 'Flies the camera to fixed views in a browser without a window and reports how long the graphics processor takes over each part of a frame.',
        manual: 'tools/perf/README.md',
      },
      {
        scripts: ['structure-audit'],
        does: 'Writes one page of tables on the app’s source: which folder imports which, import cycles, unused exports and repeated code.',
        manual: 'tools/structure-audit/README.md',
      },
      {
        scripts: ['mcpm-workbench:compare'],
        does: 'Compares two density cubes, one from the MCPM workbench and one from the program it was ported from, and prints how far apart they are.',
        manual: 'tools/mcpm-workbench/README.md',
      },
    ],
  },
  {
    id: 'code',
    title: 'Code',
    rows: [
      {
        scripts: ['typecheck', 'typecheck:fast'],
        does: 'Check the types of the app, the tools and this site. The second uses the preview of the TypeScript 7 compiler and is faster; a pull request has to pass the first.',
        manual: CONTRIBUTING,
      },
      {
        scripts: ['test', 'test:watch'],
        does: 'Run the tests once, or again each time a file changes.',
        manual: CONTRIBUTING,
      },
      {
        scripts: ['lint', 'lint:fix'],
        does: 'Run ESLint over the repository; the second also applies the fixes it can make.',
        manual: 'eslint.config.js',
      },
      {
        scripts: ['format', 'format:all', 'format:check'],
        does: 'Run Prettier: over the files the current branch has touched, over every file, or without writing anything.',
        manual: 'tools/dev/format-changed.sh',
      },
      {
        scripts: ['move-files', 'refactor'],
        does: 'Move or rename files and rewrite every import that names them; the second also renames, extracts, inlines and deletes a symbol across the repository.',
        manual: '.claude/skills/refactor/SKILL.md',
      },
    ],
  },
  {
    id: 'workbenches',
    title: 'Workbenches',
    rows: [
      {
        scripts: [
          'galaxy-renderer',
          'mcpm-workbench',
          'flow-workbench',
          'scene-workbench',
          'curate-famous',
        ],
        does: 'Each serves one workbench from the source, on a port of its own.',
        manual: 'tools/utils/io/devPorts.ts',
      },
    ],
  },
  {
    id: 'this-site',
    title: 'This site',
    rows: [
      {
        scripts: ['site'],
        does: 'Serves this site from the source, on port 5800.',
        manual: SITE_TOOLS,
      },
      {
        scripts: ['site:build', 'site:check'],
        does: 'Build the site into dist/home/, and check its types.',
        manual: SITE_TOOLS,
      },
      {
        scripts: ['site:links'],
        does: 'Follows every link, picture and anchor of the built site and fails on one that leads nowhere.',
        manual: SITE_TOOLS,
      },
      {
        scripts: ['site:fold'],
        does: 'Opens every page of a running site in several window sizes and fails where a page’s title and lead do not fit the first screen.',
        manual: SITE_TOOLS,
      },
    ],
  },
];

/**
 * Scripts of the root package.json that the page leaves out, by the reason:
 * the page says the kinds in one sentence and names none of them.
 */
export const DOCS_COMMANDS_UNLISTED: readonly { why: string; scripts: readonly string[] }[] = [
  {
    why: 'npm runs it by itself, before dev',
    scripts: ['predev'],
  },
  {
    why: 'build runs them',
    scripts: ['galaxy-renderer:build', 'mcpm-workbench:build', 'flow-workbench:build'],
  },
  {
    why: 'they publish, and need the owner’s keys',
    scripts: ['deploy', 'sync-r2', 'sync-r2-secure', 'r2-cors'],
  },
  {
    why: 'they are probes and surveys written for one question',
    scripts: [
      'galaxy-renderer:probe',
      'mcpm-workbench:probe',
      'scene-workbench:probe',
      'spike-virtual-time',
      'desi-cone-census',
      'report-site-terrain',
      'verify-flow-field',
      'fit-pluto-chroma',
    ],
  },
];
