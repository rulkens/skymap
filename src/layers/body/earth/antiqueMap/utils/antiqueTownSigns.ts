/**
 * antiqueTownSigns — the sign instances for the town table, in the map's sign
 * layout, built at runtime so a curated name or place needs no rebake. A plan or
 * fortress sign gets two instances: its small-scale profile sign until
 * ANTIQUE_TOWN_REVEAL.planLevel, then the plan.
 */

import type { AntiqueEarthTown } from '../../../../../@types/rendering/AntiqueEarthTown';
import { ANTIQUE_SIGN_BYTES } from '../data/antiqueEarthMapFormat';
import { ANTIQUE_TOWN_REVEAL, ANTIQUE_TOWN_SIGN_KIND } from '../data/antiqueTownReveal';
import { packAntiqueSignWord } from './packAntiqueSignWord';

const RAD = Math.PI / 180;

export function antiqueTownSigns(towns: readonly AntiqueEarthTown[]): Uint8Array {
  const reveal = ANTIQUE_TOWN_REVEAL;
  const signs: { town: AntiqueEarthTown; word: number }[] = [];
  for (const town of towns) {
    const level = reveal.tierLevel[town.tier];
    const see = town.see === undefined ? 0 : ANTIQUE_TOWN_SIGN_KIND[town.see];
    const kind = ANTIQUE_TOWN_SIGN_KIND[town.sign] | see;
    if (town.sign === 'cityPlan' || town.sign === 'fortress') {
      if (level < reveal.planLevel) {
        const profile =
          town.tier === 0 ? ANTIQUE_TOWN_SIGN_KIND.capital : ANTIQUE_TOWN_SIGN_KIND.town;
        const sizeUnits = reveal.profileUnits[town.tier];
        const word = packAntiqueSignWord({
          sizeUnits,
          kind: profile | see,
          level,
          untilLevel: reveal.planLevel,
        });
        signs.push({ town, word });
      }
      const sizeUnits =
        town.sign === 'fortress' ? reveal.fortressUnits : reveal.planUnits[town.tier];
      signs.push({
        town,
        word: packAntiqueSignWord({ sizeUnits, kind, level: Math.max(level, reveal.planLevel) }),
      });
      continue;
    }
    const sizeUnits =
      town.sign === 'village'
        ? reveal.villageUnits
        : town.sign === 'hamlet'
          ? reveal.hamletUnits
          : reveal.profileUnits[town.tier];
    signs.push({ town, word: packAntiqueSignWord({ sizeUnits, kind, level }) });
  }
  const bytes = new ArrayBuffer(signs.length * ANTIQUE_SIGN_BYTES);
  const floats = new Float32Array(bytes);
  const words = new Uint32Array(bytes);
  signs.forEach(({ town, word }, i) => {
    floats[i * 3] = town.lonDeg * RAD;
    floats[i * 3 + 1] = town.latDeg * RAD;
    words[i * 3 + 2] = word;
  });
  return new Uint8Array(bytes);
}
