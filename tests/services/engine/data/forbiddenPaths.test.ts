/**
 * forbiddenPaths — migration-safety sweep.
 *
 * Spec 2 moved every per-type data location off its pre-store home onto
 * `state.data.{ galaxies, structures, filaments }`. Volume per-field settings
 * are the exception: ADR 0006 placed them in `state.settings.volumes.fields`,
 * not a data-layer store. This sweep is the structural guard that no consumer
 * still reads the OLD locations: a stray `state.sources.catalogs` left behind
 * would compile (the field is gone, but a string-literal access in a comment
 * or a `(state as any)` cast would slip past the type checker) yet silently
 * read undefined. Greppable, dumb, and final.
 *
 * `.d.ts` files are excluded: type homes legitimately keep historical doc
 * references to the locations they replaced (e.g. GalaxyStore's docblock notes
 * it "absorbs `state.sources.catalogs`"). Only runtime `.ts`/`.tsx` is swept.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Volume per-field settings live in state.settings.volumes.fields (ADR 0006) — not swept.
const FORBIDDEN = [
  'sources.catalogs',
  'sources.famousMeta',
  'sources.clusterBulk',
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : [];
  });
}

describe('no consumer reads the pre-store data locations', () => {
  it.each(FORBIDDEN)('"%s" appears nowhere under src/', (needle) => {
    const offenders = walk('src')
      .filter((f) => !f.endsWith('.d.ts')) // type homes may keep historical doc refs
      .filter((f) => readFileSync(f, 'utf8').includes(needle));
    expect(offenders).toEqual([]);
  });
});
