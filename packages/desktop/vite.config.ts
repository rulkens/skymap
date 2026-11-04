/** One config, three builds picked by --mode: main, preload and control (the page). */
import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

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
      plugins: [plainScript],
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
  return {
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
