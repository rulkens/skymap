#!/usr/bin/env node
/**
 * Prints `matrix=<json>` for `>> $GITHUB_OUTPUT`: one matrix entry per registered live dataset.
 * Cache paths are joined here with real newlines (actions/cache's `path` form) because GitHub
 * expressions have no escape sequences: `join(x, '\n')` would join with a literal backslash-n.
 * Every cache field is present, empty when unused, so the workflow's `!= ''` gates see a string.
 */
import { LIVE_DATASETS } from '../../src/data/live/liveDatasets';

const CACHE_SLOTS = 2;

const matrix = LIVE_DATASETS.map(({ id, build, timeoutMin, caches = [], setupRust = false }) => {
  if (caches.length > CACHE_SLOTS)
    throw new Error(
      `printLiveMatrix: ${id} has ${caches.length} caches; the workflow has ${CACHE_SLOTS}`,
    );
  return {
    id,
    build,
    timeoutMin,
    setupRust,
    cache1Paths: caches[0]?.paths.join('\n') ?? '',
    cache1Key: caches[0]?.key ?? '',
    cache2Paths: caches[1]?.paths.join('\n') ?? '',
    cache2Key: caches[1]?.key ?? '',
  };
});
console.log(`matrix=${JSON.stringify(matrix)}`);
