/**
 * The remote page loads over plain http on a LAN address, where a phone has no WebGPU: nothing
 * it imports, however indirectly, may reach the renderer or the engine. A cross-file contract
 * with no behavioural test, so it is an import-graph assertion.
 */
import { describe, expect, it } from 'vitest';
import { dirname, resolve, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { parseOnlyProject } from '../helpers/conventions/parseOnlyProject';

const ROOT = resolve('.');
const FORBIDDEN = ['src/services/gpu/', 'src/services/engine/'];

function resolveImport(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const c of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base]) {
    if (existsSync(c) && /\.tsx?$/.test(c)) return c;
  }
  return null; // .d.ts types, css, assets
}

describe('remote entry import graph', () => {
  it('the remote entry reaches nothing under src/services/gpu or src/services/engine', () => {
    const seen = new Set<string>();
    const offenders: string[] = [];
    const visit = (file: string, via: string[]): void => {
      if (seen.has(file)) return;
      seen.add(file);
      const rel = relative(ROOT, file);
      if (FORBIDDEN.some((f) => rel.startsWith(f))) offenders.push([...via, rel].join(' -> '));
      const source = parseOnlyProject.addSourceFileAtPath(file);
      for (const decl of [...source.getImportDeclarations(), ...source.getExportDeclarations()]) {
        const spec = decl.getModuleSpecifierValue();
        if (!spec?.startsWith('.')) continue;
        const next = resolveImport(file, spec);
        if (next) visit(next, [...via, rel]);
      }
    };
    visit(resolve('src/remoteMain.tsx'), []);
    expect(seen.size).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });
});
