/**
 * Build-only Vite plugin: whitespace/comment-minifies the WGSL that `weslStaticPlugin`
 * inlines for each `?static` import (~618 kB → ~232 kB raw across the bundle). Identifier
 * renaming and tree-shaking stay OFF: renaming gains nothing after gzip and garbles
 * production shader errors, and tree-shaking could drop an `override` a pipeline
 * still sets by name. Runs after `weslStaticPlugin`, whose emitted module is matched below.
 * wgslender 1.4.1 squeezes `a - -b` into `a--b`, a decrement token WGSL then rejects;
 * `--` is only legal before `;` or `)`, so anything else fails the build.
 */
import type { Plugin } from 'vite';
import { initialize, minify } from 'wgslender';

const STATIC_WGSL_MODULE = /^export const wgsl = (".*");$/m;
const FUSED_MINUS = /--(?![;)])/;

export function minifyStaticWgslPlugin(): Plugin {
  return {
    name: 'skymap:minify-static-wgsl',
    apply: 'build',
    enforce: 'post',
    async buildStart() {
      await initialize();
    },
    transform(code, id) {
      if (!id.endsWith('?static')) return null;
      const literal = STATIC_WGSL_MODULE.exec(code)?.[1];
      if (literal === undefined)
        this.error(`${id}: weslStaticPlugin's ?static output changed shape`);
      const wgsl = JSON.parse(literal) as string;
      const result = minify(wgsl, {
        minifyWhitespace: true,
        minifyIdentifiers: false,
        minifySyntax: false,
        treeShaking: false,
      });
      const error = result.errors[0]?.message;
      if (error !== undefined) this.error(`${id}: ${error}`);
      if (FUSED_MINUS.test(result.code)) this.error(`${id}: write \`a - -b\` as \`a - (-b)\``);
      return `export const wgsl = ${JSON.stringify(result.code)};\nexport default wgsl;\n`;
    },
  };
}
