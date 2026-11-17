/**
 * Node loader hook: a Vite `?raw` import (`CITATION.cff?raw`) resolves to the file's text. The press kit reads
 * the site's fact registry, which imports the citation file that way; Vite does this for the site and its tests.
 * Loaded with `tsx --import`; the same file is the registration and the hook.
 */
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';

register(import.meta.url);

export async function load(url, context, nextLoad) {
  if (url.endsWith('?raw')) {
    const text = readFileSync(fileURLToPath(url.slice(0, -'?raw'.length)), 'utf8');
    return {
      format: 'module',
      source: `export default ${JSON.stringify(text)};`,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
