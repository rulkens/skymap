/**
 * Build-only Vite plugin: inlines index.html's stylesheet links as `<style>`.
 * A linked stylesheet blocks the first paint, and on a slow connection it
 * shares bandwidth with every preloaded script chunk — so the boot shell in
 * index.html, which needs none of it, waited on it. Inlined, the first paint
 * depends on the HTML alone. The CSS files stay in the bundle: a lazy chunk
 * may list one as a dependency and would fail to import if it were gone.
 */
import type { Plugin } from 'vite';

const STYLESHEET_LINK = /<link rel="stylesheet"[^>]*href="\/([^"]+\.css)"[^>]*>/g;

export function inlineEntryCssPlugin(): Plugin {
  return {
    name: 'skymap:inline-entry-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = bundle['index.html'];
      if (html?.type !== 'asset' || typeof html.source !== 'string') return;
      html.source = html.source.replace(STYLESHEET_LINK, (tag, file: string) => {
        const css = bundle[file];
        return css?.type === 'asset' ? `<style>${String(css.source)}</style>` : tag;
      });
    },
  };
}
