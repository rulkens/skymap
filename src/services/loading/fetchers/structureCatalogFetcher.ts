/**
 * structureCatalogFetcher — fetches the cluster/supercluster coverage layer and
 * returns a `{ catalog, meta }` payload.
 *
 * The layer ships as two index-parallel artefacts:
 *   - `structures.ccat`       — the numeric `StructureCatalog` binary (positions,
 *                             radii, significance, category).
 *   - `structures_meta.json`  — the string sidecar (id, names, abell, description)
 *                             keyed by the same localIdx.
 *
 * This fetcher pulls BOTH and pairs them so the later merge has names +
 * descriptions to hang off each record. The two are built in lock-step by
 * `tools/structures/buildStructures.ts`, so a `count !== meta.length` mismatch
 * means a stale artefact slipped through — we fail loud rather than silently
 * decode a half-mismatched layer.
 *
 * ### Why throw on 404
 *
 * Same policy as `famousGalaxiesMetaFetcher`: the fetcher stays honest about HTTP
 * status so the slot's retry policy can distinguish "really gone" (404, give
 * up — feature off) from "transient flake" (5xx, retry). The decision to
 * degrade gracefully to an empty layer belongs to the slot subscriber, not
 * here.
 *
 * ### Why a plain `fetch().arrayBuffer()` rather than `fetchWithProgress`
 *
 * The `.ccat` is small (~28 bytes/record, a few hundred records) and there is
 * no progress bar wired to this asset, so byte-progress would be noise. A
 * plain `fetch` keeps the two requests symmetric (binary + JSON) and still
 * honors the abort signal.
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { StructureCatalogReq } from '../../../@types/loading/StructureCatalogReq';
import type {
  StructureCatalogPayload,
  StructureMetaEntry,
} from '../../../@types/loading/StructureCatalogPayload';
import {
  decodeStructureCatalog,
  STRUCTURE_CATALOG_DATA_PREFIX,
} from '../../../data/structure/structureCatalogFormat';
import { HttpError, dataUrl } from '../fetchWithProgress';

/**
 * Parse `structures_meta.json` content. Throws on a non-array root. Public so it
 * can be unit-tested without hitting the network.
 */
export function parseStructureMeta(rawJson: string): StructureMetaEntry[] {
  const parsed = JSON.parse(rawJson);
  if (!Array.isArray(parsed)) {
    throw new Error('structures_meta.json: root must be an array');
  }
  return parsed as StructureMetaEntry[];
}

const CCAT_FILE = `${STRUCTURE_CATALOG_DATA_PREFIX}/structures.ccat`;
const META_FILE = `${STRUCTURE_CATALOG_DATA_PREFIX}/structures_meta.json`;

export const structureCatalogFetcher: Fetcher<
  StructureCatalogPayload,
  StructureCatalogReq
> = async (_req, signal) => {
  const ccatUrl = dataUrl(CCAT_FILE);
  const metaUrl = dataUrl(META_FILE);

  // Fire both in parallel — they're independent assets and the abort signal
  // tears both down together if the slot supersedes the fetch.
  const [ccatRes, metaRes] = await Promise.all([
    fetch(ccatUrl, { signal }),
    fetch(metaUrl, { signal }),
  ]);

  if (!ccatRes.ok) throw new HttpError(ccatRes.status, ccatUrl);
  if (!metaRes.ok) throw new HttpError(metaRes.status, metaUrl);

  const catalog = decodeStructureCatalog(await ccatRes.arrayBuffer());
  const meta = parseStructureMeta(await metaRes.text());

  // The two artefacts are emitted index-parallel by buildStructures. A length
  // mismatch can only mean one of them is stale — fail loud so the operator
  // re-runs `npm run build-structures` rather than shipping a layer where
  // localIdx lookups silently point at the wrong (or no) metadata.
  if (catalog.count !== meta.length) {
    throw new Error(
      `cluster catalog/meta length mismatch: .ccat has ${catalog.count} records but ` +
        `structures_meta.json has ${meta.length} entries — regenerate via "npm run build-structures"`,
    );
  }

  return { catalog, meta };
};
