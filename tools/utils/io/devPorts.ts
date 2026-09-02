/**
 * DEV_PORTS — the dev-server port assigned to each Vite config (root app +
 * sibling tools). One table so a collision is visible in one place; before
 * this each config restated the full list as a comment and they drifted.
 */
export const DEV_PORTS = {
  main: 5173,
  famousCurator: 5200,
  flowWorkbench: 5300,
  galaxyRenderer: 5400,
  mcpmWorkbench: 5500,
  sceneWorkbench: 5600, // reserved: docs/superpowers/specs/2026-09-02-scene-workbench-design.md
} as const;
