/**
 * serializeShaderLoads — run a plugin's `load` hook one shader at a time.
 *
 * wesl-plugin (0.6.x) re-reads every file its wesl.toml includes on each
 * `.wesl` load, and its registry cache fills only after the first load ends.
 * Vite loads ~100 shader entry points concurrently, so a cold build opens
 * ~100 × ~200 files at once — past a 20k open-file cap (cloud containers),
 * which surfaces as EMFILE in dev and "os error 24" in `vite build`.
 * Queueing shader ids keeps one scan in flight; other ids pass straight through.
 */
import type { Plugin } from 'vite';

export function serializeShaderLoads(plugins: Plugin | Plugin[]): Plugin {
  const [plugin, ...rest] = [plugins].flat();
  const load = plugin?.load;
  if (!plugin || rest.length > 0 || typeof load !== 'function') {
    throw new Error('serializeShaderLoads: expected one plugin with a function load hook');
  }
  let tail: Promise<unknown> = Promise.resolve();
  return {
    ...plugin,
    load(id, options) {
      if (!/\.(wesl|wgsl)(\?|$)/.test(id)) return load.call(this, id, options);
      const run = tail.then(() => load.call(this, id, options));
      tail = run.catch(() => undefined);
      return run;
    },
  };
}
