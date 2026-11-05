/**
 * Node loader hook: a `.css` import resolves to an empty module. The link checker reads the
 * exhibit rows, whose section kinds carry React components that import CSS modules; Node
 * cannot load CSS, and the checker never renders, so the styles are never read.
 * Loaded with `tsx --import`; the same file is the registration and the hook.
 */
import { register } from 'node:module';

register(import.meta.url);

export async function load(url, context, nextLoad) {
  if (url.endsWith('.css'))
    return { format: 'module', source: 'export default {};', shortCircuit: true };
  return nextLoad(url, context);
}
