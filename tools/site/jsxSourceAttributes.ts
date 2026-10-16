/**
 * jsxSourceAttributes — gives React elements the source pointer Astro gives
 * `.astro` ones. Astro's dev server stamps `data-astro-source-file/-loc` on
 * its own templates only, and the feedback tool (src/dev/feedback) reads them
 * into each note for the note worker. A `serve`-only Vite plugin, since
 * @astrojs/react 7 dropped its Babel hook; `pre` so it reads the JSX before
 * the React transform lowers it. Nothing of it exists in `astro build`.
 */
import type { Plugin } from 'vite';

import { stampJsxSource } from './utils/stampJsxSource';

/** `root` is the directory whose `.tsx` files are the site's own. */
export function jsxSourceAttributes(root: string): Plugin {
  return {
    name: 'jsx-source-attributes',
    apply: 'serve',
    enforce: 'pre',
    transform(code, id) {
      const [file = id] = id.split('?');
      if (!file.endsWith('.tsx') || !file.startsWith(root)) return null;
      return { code: stampJsxSource(code, file), map: null };
    },
  };
}
