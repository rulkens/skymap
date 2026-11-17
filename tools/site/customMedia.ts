/**
 * The website's `@media (--narrow)`: each custom-media name becomes the query MEDIA gives it
 * (packages/website/src/data/media.ts). Custom media is the standard's syntax, but no browser reads it yet;
 * Vite already runs PostCSS on every stylesheet, so this is a step there rather than a dependency.
 * An unknown name fails the compile: the browser would otherwise drop the whole block without a word.
 */
import type { Plugin } from 'postcss';

import { MEDIA } from '../../packages/website/src/data/media.ts';

const NAMES: Record<string, string> = MEDIA;

export function customMedia(): Plugin {
  return {
    postcssPlugin: 'site-custom-media',
    // At the exit, not per rule: Vite's CSS-modules step pastes a `composes` source in raw at its own exit.
    OnceExit(root) {
      root.walkAtRules('media', (rule) => {
        rule.params = rule.params.replace(/\(--([a-z-]+)\)/g, (_, name: string) => {
          const query = NAMES[name];
          if (!query)
            throw rule.error(
              `No media query is named --${name} (packages/website/src/data/media.ts)`,
            );
          return query;
        });
      });
    },
  };
}
