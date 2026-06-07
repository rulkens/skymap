/**
 * `writeMetaSidecar` — write a per-localIdx id→strings sidecar JSON file.
 *
 * Why a shared helper instead of inline `writeFileSync`?  Two build scripts
 * (`buildFamous`, `buildStructures`) emit the same artefact shape: an ordered
 * JSON array where position == localIdx in the matching `.bin`.  Centralising
 * the write step means one place controls the formatting (2-space pretty-print)
 * and both callers stay in sync without each hard-coding the `JSON.stringify`
 * spacing argument.
 *
 * The helper is intentionally schema-agnostic: `MetaSidecarEntry` requires
 * only the three fields all consumers share (`id`, `names`, `description`);
 * domain-specific extras (`type`/`commonName` for famous galaxies, `blurb`
 * for clusters, …) pass through the index signature and survive the
 * JSON round-trip untouched.  Per-domain schemas stay in the caller.
 */
import { writeFileSync } from 'node:fs';

/**
 * Minimum shape every sidecar entry must carry.
 * Domain callers add extra fields via the index signature.
 */
export type MetaSidecarEntry = {
  id: string;
  names: string[];
  description: string;
  [key: string]: unknown; // domain-specific extras (famous type/commonName,
  // cluster blurb) pass through untouched
};

/**
 * Write `entries` as a 2-space pretty-printed JSON array to `path`.
 * The array position encodes the localIdx (position in the parallel .bin).
 */
export function writeMetaSidecar(entries: readonly MetaSidecarEntry[], path: string): void {
  writeFileSync(path, JSON.stringify(entries, null, 2));
}
