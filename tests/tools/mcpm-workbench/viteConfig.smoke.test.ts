/**
 * Smoke test: the MCPM Workbench Vite config loads without throwing and
 * exposes the expected port + plugin list. Mirrors
 * tests/tools/flow-workbench/viteConfig.smoke.test.ts — it guards against a
 * typo in the config that would make `npm run mcpm-workbench` fail at import
 * time. The wesl plugin assertion is load-bearing: `?static` shader imports
 * do not resolve without it.
 */
import { describe, expect, it } from 'vitest';

describe('tools/mcpm-workbench/vite.config.ts', () => {
  it('exports a config with port 5500 and react + wesl plugins', async () => {
    const mod = await import('../../../tools/mcpm-workbench/vite.config');
    const config = mod.default;
    // Vite's `defineConfig` return is a wide union (config object, sync
    // function, async function); narrowing via `typeof === 'function'`
    // collapses to `never` under TS 5's strict union analysis, so cast
    // explicitly through `unknown` first. We then re-cast to the shape we
    // actually assert on (just the two fields the smoke test reads).
    type ResolvedShape = { server?: { port?: number }; plugins?: unknown[] };
    const resolved = (
      typeof config === 'function'
        ? await (config as (env: { command: 'serve'; mode: string }) => unknown)({
            command: 'serve',
            mode: 'development',
          })
        : config
    ) as ResolvedShape;
    expect(resolved.server?.port).toBe(5500);
    expect(Array.isArray(resolved.plugins)).toBe(true);
    // `@vitejs/plugin-react()` returns an *array* of sub-plugins, so the
    // resolved `plugins` list is nested. Flatten before sniffing names.
    const names = (resolved.plugins ?? [])
      .flat(Infinity)
      .map((p) => (p as { name?: string } | null)?.name);
    expect(names.some((n) => typeof n === 'string' && n.includes('react'))).toBe(true);
    expect(names.some((n) => typeof n === 'string' && n.includes('wesl'))).toBe(true);
  });
});
