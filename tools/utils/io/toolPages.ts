/**
 * toolPages — the pages (dev tools, the website preview) shipped as subpaths of the main shell
 * (docs/DEPLOY.md): one entry per page, value = its dist/ subfolder and URL
 * prefix (skymap.rulkens.com/<value>/). Consumed by each page's vite/astro config
 * for both `base` and `outDir`, so page and folder can never drift apart.
 */
export const toolPages = {
  galaxyRenderer: 'galaxy',
  mcpmWorkbench: 'mcpm',
  flowWorkbench: 'flow',
  website: 'home',
} as const;
