/**
 * isPre1690River — whether a Natural Earth river line belongs on a 1690 map.
 * Canals are dropped by class and by name (Suez 1869, Caledonian 1822,
 * Volga–Don 1952, Moscow 1937…), and so are intermittent rivers, which a
 * period engraver would not have known as rivers. Lake centrelines stay:
 * through a modern reservoir they trace the river that flowed there in 1690.
 */

const CANAL_NAME = /\b(canal|kanal|kanaal|channel)\b/i;
/** Shatt al-Gharraf: an ancient branch of the Tigris, not a modern cut. */
const NAMED_CANALS_KEPT = new Set(['Gharraf Canal']);

export function isPre1690River(properties: {
  readonly featurecla?: string | null;
  readonly name?: string | null;
}): boolean {
  const featurecla = properties.featurecla ?? '';
  const name = properties.name ?? '';
  if (featurecla === 'Canal' || featurecla.includes('Intermittent')) return false;
  return !CANAL_NAME.test(name) || NAMED_CANALS_KEPT.has(name);
}
