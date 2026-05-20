/**
 * milliquasNamesFetcher — Fetcher<MilliquasNamesPayload, CompanionAssetReq>.
 *
 * Tier-aware filename: `milliquas-{medium,large}_names.json`.  The small
 * tier has no Milliquas bin (`TIER_TARGETS.small[Milliquas] === 0` —
 * mobile-budget exclusion), so the fetcher short-circuits with an empty
 * payload instead of issuing a request that would 404 anyway.
 *
 * ### Why short-circuit small rather than letting it 404
 *
 * The bin loader skips small-tier Milliquas entirely (the source's slot
 * isn't `load()`-ed when its tier target is 0), so even if this fetcher
 * hit the network we'd be fetching names for rows the renderer doesn't
 * have.  Returning empty `{ names, classes }` keeps the slot in a
 * deterministic 'ready' state and avoids polluting the loading-bar
 * aggregator with a synthetic error.  Mirrors the bin's "skip when
 * target=0" behaviour symmetrically across the two assets.
 *
 * ### Why throw on schema mismatch
 *
 * Same rationale as `famousMetaFetcher.parseFamousMeta`: a corrupted or
 * out-of-sync sidecar fails loudly during InfoCard lookup ("undefined is
 * not an object") if we silently accept malformed JSON.  Throwing at
 * parse time pushes the error into the slot's retry/error pipeline where
 * the user sees a clear "load failed" rather than a cascade of mystery
 * undefineds at the consumer.
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { MilliquasNamesPayload } from '../../../@types/loading/MilliquasNamesPayload';
import type { CompanionAssetReq } from '../../../@types/loading/CompanionAssetReq';
import type { Tier } from '../../../@types/data/Tier';
import { HttpError, dataUrl } from '../fetchWithProgress';

const FILENAME: Record<Tier, string> = {
  // Small tier has no bin; fetcher never reaches the network for it.
  // Keeping the entry as an empty string is a defence-in-depth — if a
  // caller bypassed the early short-circuit below the resulting empty
  // URL would 404 loudly rather than randomly resolving against the
  // page root.
  small: '',
  medium: 'milliquas-medium_names.json',
  large: 'milliquas-large_names.json',
};

/**
 * Parse a `milliquas-<tier>_names.json` body.  Throws on schema
 * mismatch.  Public so unit tests can exercise the parser branches
 * without standing up the fetch mock.
 */
export function parseMilliquasNames(rawJson: string): MilliquasNamesPayload {
  const parsed = JSON.parse(rawJson);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('milliquas names sidecar: root must be an object');
  }
  const obj = parsed as { names?: unknown; classes?: unknown };
  if (!Array.isArray(obj.names)) {
    throw new Error('milliquas names sidecar: `names` must be an array');
  }
  if (!Array.isArray(obj.classes)) {
    throw new Error('milliquas names sidecar: `classes` must be an array');
  }
  if (obj.names.length !== obj.classes.length) {
    throw new Error(
      `milliquas names sidecar: `
        + `names (${obj.names.length}) / classes (${obj.classes.length}) length mismatch`,
    );
  }
  // The fetched-from-disk payload is intentionally `readonly` at the
  // type level.  Cast through `as` rather than copying — copying a
  // ~200k entry array adds visible cost on slower machines and the
  // JSON.parse result is already a fresh object we own.
  return {
    names: obj.names as readonly string[],
    classes: obj.classes as readonly string[],
  };
}

export const milliquasNamesFetcher: Fetcher<MilliquasNamesPayload, CompanionAssetReq> = async (
  req,
  signal,
) => {
  // Small-tier short-circuit — no bin, so no names.  Returning empty
  // here keeps the slot state machine deterministic (ready with empty
  // payload) and matches what the bin loader does on `target === 0`.
  if (req.tier === 'small') {
    return { names: [], classes: [] };
  }
  const url = dataUrl(FILENAME[req.tier]);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new HttpError(res.status, url);
  const text = await res.text();
  return parseMilliquasNames(text);
};
