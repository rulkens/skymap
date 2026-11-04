/** One config, three builds picked by --mode: main, preload and control (the page). */
import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The control page loads from file://, where Chromium refuses module scripts, so the bundle is an
// IIFE and its tag must be a plain deferred script.
const plainScript: Plugin = {
  name: 'plain-script',
  transformIndexHtml: {
    order: 'post',
    handler: (html) => html.replace(/<script type="module" crossorigin/g, '<script defer'),
  },
};

const nodeExternal = ['electron', /^node:/, ...builtinModules];

export default defineConfig(({ mode }) => {
  const common = { emptyOutDir: false, minify: false } as const;
  if (mode === 'control') {
    return {
      root: resolve(import.meta.dirname, 'src/control'),
      base: './',
      plugins: [react(), plainScript],
      build: {
        ...common,
        minify: true,
        outDir: resolve(import.meta.dirname, 'build/control'),
        rollupOptions: {
          output: {
            format: 'iife',
            entryFileNames: 'control.js',
            assetFileNames: '[name][extname]',
          },
        },
      },
    };
  }
  if (mode === 'preload') {
    return {
      build: {
        ...common,
        outDir: resolve(import.meta.dirname, 'build/control'),
        lib: {
          entry: resolve(import.meta.dirname, 'src/control/preload.cts'),
          formats: ['cjs'],
          fileName: () => 'preload.cjs',
        },
        rollupOptions: { external: nodeExternal },
      },
    };
  }
  // main: everything but electron and Node's own modules (ws included) is bundled in.
  // The sync origin is the web app's own data host, read from .env.production like its build does.
  const dataOrigin = loadEnv(
    'production',
    resolve(import.meta.dirname, '../..'),
    'VITE_',
  ).VITE_DATA_BASE_URL;
  if (!dataOrigin) {
    throw new Error(
      'VITE_DATA_BASE_URL is missing from .env.production; the desktop app cannot sync.',
    );
  }
  return {
    define: { DESKTOP_DATA_ORIGIN: JSON.stringify(dataOrigin.replace(/\/$/, '')) },
    ssr: { noExternal: true },
    build: {
      ...common,
      ssr: resolve(import.meta.dirname, 'src/main/main.ts'),
      outDir: resolve(import.meta.dirname, 'build/main'),
      rollupOptions: {
        external: nodeExternal,
        output: { format: 'cjs', entryFileNames: 'main.cjs' },
      },
    },
  };
});
