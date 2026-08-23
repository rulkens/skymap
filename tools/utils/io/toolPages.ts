/**
 * toolPages — the dev-tool pages shipped as subpaths of the main shell
 * (docs/DEPLOY.md): one entry per tool, value = its dist/ subfolder and URL
 * prefix (skymap.rulkens.com/<value>/). Consumed by each tool's vite config
 * for both `base` and `outDir`, so page and folder can never drift apart.
 */
export const toolPages = {
  galaxyRenderer: 'galaxy',
  mcpmWorkbench: 'mcpm',
  flowWorkbench: 'flow',
} as const;
