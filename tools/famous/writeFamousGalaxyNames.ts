/**
 * writeFamousGalaxyNames — emit the compiled-in famous-galaxy identity table, one row per seed
 * entry in seed order, which is `famous.bin`'s record order: row `i` names record `i`. Written by
 * `build-famous` beside `famous.bin` and the meta sidecar, so the three never drift apart.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';

import { quote } from '../utils/codegen/quote';
import { RAW_DATA } from '../utils/io/rawDataRegistry';
import type { FamousEntry } from '../parsers/famousSeed';

const GENERATED_PATH =
  'src/layers/galaxyCatalog/famousGalaxies/data/famousGalaxyNames.generated.ts';

export async function writeFamousGalaxyNames(entries: readonly FamousEntry[]): Promise<void> {
  const rows = entries
    .map((e) => {
      const commonName = e.commonName === undefined ? '' : ` commonName: ${quote(e.commonName)},`;
      return `  { id: ${quote(e.id)},${commonName} names: [${e.names.map(quote).join(', ')}] },`;
    })
    .join('\n');
  const text =
    `// ${GENERATED_PATH}\n` +
    '// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!\n' +
    '// Regenerate with:  npm run build-famous\n' +
    `// Source of truth:  ${RAW_DATA['famous.seed'].path}\n` +
    "import type { FamousGalaxyName } from '../@types/FamousGalaxyName';\n\n" +
    `export const FAMOUS_GALAXY_NAMES: readonly FamousGalaxyName[] = [\n${rows}\n];\n`;
  const path = resolve(GENERATED_PATH);
  const formatted = await format(text, { ...(await resolveConfig(path)), parser: 'typescript' });
  writeFileSync(path, formatted);
}
