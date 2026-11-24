/**
 * planetFactsSeed — parse + validate the hand-authored `planet_facts.seed.json`,
 * the source `buildPlanetFacts.ts` turns into the generated `BODY_FACTS` table.
 *
 * Validation contract: `id` and `wikiTitle` are required non-empty strings,
 * `massKg` a positive finite number, every other field a string; each failure
 * throws naming the entry. A duplicate id is a hard error: the id keys the
 * generated record, so a duplicate would silently overwrite a row.
 */

import type { BodyFacts } from '../../src/@types/scene/BodyFacts';

/** One authored entry: `BodyFacts` plus the `id` that becomes its key in the generated record. */
export type PlanetFactsEntry = { readonly id: string } & BodyFacts;

export function validatePlanetFactsEntry(raw: unknown, index: number): PlanetFactsEntry {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`planet facts seed: entry ${index} is not an object`);
  }
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || e.id.length === 0) {
    throw new Error(`planet facts seed: entry ${index} has missing/empty id`);
  }
  if (typeof e.wikiTitle !== 'string' || e.wikiTitle.length === 0) {
    throw new Error(`planet facts seed: ${e.id} has missing/empty wikiTitle`);
  }
  // Every other field is optional: absent ⇒ the card drops that row.
  for (const [key, value] of Object.entries(e)) {
    if (key === 'id' || key === 'wikiTitle') continue;
    if (key === 'massKg') {
      if (typeof value !== 'number' || !(value > 0) || !Number.isFinite(value)) {
        throw new Error(`planet facts seed: ${e.id} massKg must be a positive number`);
      }
      continue;
    }
    if (typeof value !== 'string') {
      throw new Error(`planet facts seed: ${e.id} field ${key} must be a string`);
    }
  }
  return e as PlanetFactsEntry;
}

export function parsePlanetFactsSeed(raw: unknown): PlanetFactsEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error('planet facts seed: root must be an array');
  }
  const seen = new Set<string>();
  const out: PlanetFactsEntry[] = [];
  raw.forEach((rawEntry, index) => {
    const entry = validatePlanetFactsEntry(rawEntry, index);
    if (seen.has(entry.id)) {
      throw new Error(`planet facts seed: duplicate id "${entry.id}"`);
    }
    seen.add(entry.id);
    out.push(entry);
  });
  return out;
}
