/**
 * Vite library build for the design-sync bundle.
 *
 * skymap uses CSS Modules (`import styles from './X.module.css'`). The
 * design-sync converter's esbuild step uses the default `css` loader, which
 * does NOT resolve CSS-module class maps — every `styles.root` would come back
 * undefined and the components would render unstyled. So we pre-build the design
 * entry with Vite (which resolves CSS Modules natively into hashed class strings
 * baked into the JS + one extracted stylesheet), and hand the converter the
 * already-resolved JS as its `--entry` and the extracted `style.css` as
 * `cfg.cssEntry`. React is external so the converter's esbuild provides it.
 *
 * A tiny resolver plugin swaps the real `useFamousStarsMeta` hook (which fetches
 * a runtime sidecar unavailable in claude.ai/design) for a synchronous mock, so
 * famous-star body cards render their rich physical rows.
 */

import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const here = __dirname;

// Redirect any import ending in `useFamousStarsMeta` to the mock, regardless of
// the relative specifier the importer used.
function mockFamousStarsMeta(): Plugin {
  const mock = resolve(here, 'mocks/useFamousStarsMeta.ts');
  return {
    name: 'skymap-mock-famous-stars-meta',
    enforce: 'pre',
    resolveId(source) {
      if (/(^|\/)useFamousStarsMeta(\.ts)?$/.test(source)) return mock;
      return null;
    },
  };
}

export default defineConfig({
  plugins: [mockFamousStarsMeta(), react()],
  build: {
    lib: {
      entry: resolve(here, 'entry/index.tsx'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    outDir: resolve(here, 'dist'),
    cssCodeSplit: false, // one extracted stylesheet → dist/style.css
    emptyOutDir: true,
    minify: false, // readable output; the converter re-bundles it anyway
    rollupOptions: {
      // The converter's esbuild provides React via its own shim.
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
    },
  },
  css: {
    modules: {
      generateScopedName: 'sky_[local]_[hash:base64:5]',
    },
  },
});
