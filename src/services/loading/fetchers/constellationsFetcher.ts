/**
 * constellationsFetcher — fetches the true-3D constellation stick-figure
 * artifact (`constellations.json`) and decodes it into a `ConstellationsArtifact`.
 *
 * A single tier-agnostic sidecar, so it composes the shared `makeJsonFetcher`
 * (GET → check ok → parse) with a pure `parseConstellations` validator, exactly
 * the shape the JSON-sidecar factory exists for. The slot stays generic over the
 * payload; the wire format lives here.
 *
 * ### Why validate version + shape here
 *
 * The artifact is a BUILD OUTPUT of `npm run build-stars-rs`, pinned to a v1
 * contract. A stale artifact (an old schema left on disk / in the CDN) would
 * otherwise decode to a mismatched shape and surface as a silent empty or
 * garbled overlay downstream. `parseConstellations` fails loud instead — the
 * thrown message names the regenerate command so the operator re-bakes rather
 * than debugging the renderer. Modelled on `parseStructureMeta`: public + pure,
 * so it is unit-tested without the network.
 */

import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { ConstellationsArtifact } from '../../../@types/loading/ConstellationsArtifact';
import { makeJsonFetcher } from './jsonFetcher';
import { dataUrl } from '../fetchWithProgress';

const CONSTELLATIONS_FILE = 'constellations.json';

/**
 * Parse `constellations.json` content into a `ConstellationsArtifact`. Throws on
 * a version other than 1 or a non-array `constellations`, naming the regenerate
 * command in the message. Public so it can be unit-tested without the network.
 */
export function parseConstellations(rawJson: string): ConstellationsArtifact {
  const parsed = JSON.parse(rawJson);
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error(
      'constellations.json: root must be an object. Regenerate via "npm run build-stars-rs"',
    );
  }
  if (parsed.version !== 1) {
    throw new Error(
      `constellations.json: unsupported version ${String(parsed.version)} (expected 1). ` +
        'Regenerate via "npm run build-stars-rs"',
    );
  }
  if (!Array.isArray(parsed.constellations)) {
    throw new Error(
      'constellations.json: "constellations" must be an array. Regenerate via "npm run build-stars-rs"',
    );
  }
  return parsed as ConstellationsArtifact;
}

export const constellationsFetcher: Fetcher<ConstellationsArtifact, void> = makeJsonFetcher(
  () => dataUrl(CONSTELLATIONS_FILE),
  parseConstellations,
);
