import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { exportedNames } from './exportedNames';
import type { ConventionAudit } from './@types/ConventionAudit';

/** The CLAUDE.md file-shape rules, measured: no `interface`, no barrels, one symbol per utils/@types file, no inline types. */
export function auditConventions(srcDir: string, files: readonly string[]): ConventionAudit {
  const interfaces: { f: string; line: number; text: string }[] = [];
  const barrels: { f: string; exports: number }[] = [];
  const multiExport: { f: string; names: string[] }[] = [];
  const inlineTypes: { f: string; names: string[] }[] = [];
  for (const f of files) {
    const source = readFileSync(join(srcDir, f), 'utf8');
    source.split('\n').forEach((l, i) => {
      if (/^(export )?interface \w/.test(l))
        interfaces.push({ f, line: i + 1, text: l.trim().slice(0, 80) });
    });
    if (/^index\.tsx?$/.test(basename(f)))
      barrels.push({ f, exports: source.match(/^export /gm)?.length ?? 0 });
    if (/^(utils|@types)\//.test(f)) {
      const names = exportedNames(source).filter((n) => n !== 'default');
      if (names.length > 1) multiExport.push({ f, names });
    }
    const typesHome = f.startsWith('@types/') || f.includes('/types/');
    if (!typesHome) {
      const isComponent = f.endsWith('.tsx');
      const names = [...source.matchAll(/^export type (\w+)/gm)]
        .map((m) => m[1] ?? '')
        .filter((n) => !(isComponent && n.endsWith('Props')));
      if (names.length) inlineTypes.push({ f, names });
    }
  }
  return { interfaces, barrels, multiExport, inlineTypes };
}
