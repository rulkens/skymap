import type { Workbench } from '../@types/Workbench';

/** The widths a workbench picture is written at: the window as taken at 2x, a text column at 2x, and a phone. */
export const WORKBENCH_WIDTHS = [2400, 1440, 720] as const;
/** The window a workbench is photographed in, in CSS pixels. */
export const WORKBENCH_WINDOW = { width: 1440, height: 900 } as const;

/**
 * The browser tools of the Developer workbenches page
 * (content/docs/developers/workbenches.mdx).
 * tests/packages/website/docsProject.test.ts holds the public paths and the
 * ports to the repository's own two tables (tools/utils/io/toolPages.ts and
 * devPorts.ts), so a workbench added to either fails until it has a row.
 */
export const WORKBENCHES: readonly Workbench[] = [
  {
    id: 'galaxy',
    name: 'Galaxy renderer',
    publicPath: '/galaxy/',
    script: 'galaxy-renderer',
    port: 5400,
    manual: 'tools/galaxy-renderer/README.md',
    picture: {
      title: 'The galaxy renderer as it opens',
      caption: 'One generated spiral galaxy, with the panel of its parameters on the right.',
      alt: 'A face-on spiral galaxy with a bright core, blue-grey arms and pink knots, beside a tall panel of sliders headed Randomize.',
    },
  },
  {
    id: 'mcpm',
    name: 'MCPM workbench',
    publicPath: '/mcpm/',
    script: 'mcpm-workbench',
    port: 5500,
    manual: 'tools/mcpm-workbench/README.md',
    picture: {
      title: 'The MCPM workbench a few hundred steps into a run',
      caption: 'The grey points are the simulation’s agents; the pink web is the density they have traced so far.',
      alt: 'A cube of pink and white filaments inside a cloud of grey points, with a table of counts at the upper left, a histogram at the lower left and a panel of sliders on the right.',
    },
  },
  {
    id: 'flow',
    name: 'Flow workbench',
    publicPath: '/flow/',
    script: 'flow-workbench',
    port: 5300,
    manual: 'tools/flow-workbench/README.md',
    picture: {
      title: 'The flow workbench with a run under way',
      caption: 'Particles drifting along the CF4++ velocity field, with the panel of sliders at the upper right. The bright threads and knots are where the flow converges.',
      alt: 'A ball of fine blue and orange streaks on black, with bright blue threads winding through its middle and a panel of seven sliders at the upper right.',
    },
  },
  {
    id: 'scene',
    name: 'Scene workbench',
    script: 'scene-workbench',
    port: 5600,
    manual: 'tools/scene-workbench/README.md',
    picture: {
      title: 'The scene workbench with the Søndermarken group loaded',
      caption: 'A laser scan of 1.6 million points and 2.5 million Gaussian splats trained on aerial photographs, drawn together.',
      alt: 'A square of Copenhagen seen at a slant, with a wooded park in the middle among red roofs and streets, and a panel listing a point cloud, Gaussian splats and a mesh at the upper left.',
      credit: 'Klimadatastyrelsen (laser scan and aerial photographs), CC BY 4.0',
    },
  },
  {
    id: 'curator',
    name: 'Named-galaxy curator',
    script: 'curate-famous',
    port: 5200,
    manual: 'tools/famous-curator/README.md',
    picture: {
      title: 'The curator with a galaxy part-way through',
      caption: 'The source picture of one named galaxy, framed in the middle, with the sliders for star removal and for the fade to transparent on the right. In the list on the left a tick marks a galaxy whose picture is done.',
      alt: 'A list of Caldwell and NGC numbers on the left, most of them on green with a tick, a photograph of a spiral galaxy among many stars inside a square frame with handles in the middle, and on the right sliders above two small pictures of the same galaxy without its stars, the lower one on a chequered ground.',
      credit: 'Andreigusan (photograph of NGC 6946), CC0',
    },
  },
  {
    id: 'audit',
    name: 'Structure audit',
    script: 'structure-audit',
    manual: 'tools/structure-audit/README.md',
    picture: {
      title: 'The structure audit, on its Layering tab',
      caption: 'The shade of a cell is the number of imports from its row’s folder into its column’s. A red ring marks an import against the proposed order of the folders.',
      alt: 'A dark page with a grid of blue-shaded cells, folder names along its top and left side and many cells ringed in red, under a row of eleven tabs and six totals.',
    },
  },
];
