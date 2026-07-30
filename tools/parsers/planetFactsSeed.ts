/**
 * planetFactsSeed — parse + validate the hand-authored `planet_facts.seed.json`.
 *
 * The seed is the single source of truth for every Solar-System body's fact
 * sheet.  One build tool reads it (`buildPlanetFacts.ts`) to emit the committed
 * generated `BODY_FACTS` table the InfoCard renders.  Centralising parsing +
 * validation here means a single typo in the JSON surfaces as one clear error.
 *
 * The schema is small and all-string, so we hand-roll fail-loud validation
 * rather than pull in zod/ajv — a throw naming the offending index/id reads
 * clearer than nested validator output.  Duplicate ids are a HARD error: the id
 * keys the generated `BODY_FACTS` record, so a duplicate would silently
 * overwrite an entry's row.
 */

import type { BodyFacts } from '../../src/@types/scene/BodyFacts';

/**
 * One authored entry — the body's `BodyFacts` plus the `id` that becomes its
 * key in the generated record.  Co-located here as the tool-local authoring
 * contract; the runtime table (`Record<string, BodyFacts>`) is emitted by the
 * build tool with `id` stripped back into the key.
 */
export type PlanetFactsEntry = { readonly id: string } & BodyFacts;

/**
 * Validate a single raw entry at position `index`.  Throws on any malformed
 * field with a message naming the offending index/id.  Every optional
 * `BodyFacts` field, when present, must be a string; `id` and `wikiTitle` are
 * required non-empty strings.  Returns the value typed as `PlanetFactsEntry`.
 */
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
  // Every other field is an OPTIONAL display string.  Present ⇒ must be a
  // string; absent ⇒ the card drops that row.  `id`/`wikiTitle` are already
  // checked above; validate any remaining property is string-typed.
  for (const [key, value] of Object.entries(e)) {
    if (key === 'id' || key === 'wikiTitle') continue;
    if (typeof value !== 'string') {
      throw new Error(`planet facts seed: ${e.id} field ${key} must be a string`);
    }
  }
  return e as PlanetFactsEntry;
}

/**
 * Parse and validate the entire seed.  Throws if the root is not an array, on
 * any per-entry problem, and on a duplicate `id` (naming the duplicate).
 */
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
