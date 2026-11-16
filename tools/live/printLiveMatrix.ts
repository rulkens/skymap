#!/usr/bin/env node
/**
 * Prints `matrix=<json>` for `>> $GITHUB_OUTPUT`: one matrix entry per registered live dataset.
 * Cache paths are joined here with real newlines (actions/cache's `path` form) because GitHub
 * expressions have no escape sequences: `join(x, '\n')` would join with a literal backslash-n.
 * The cache fields are present, empty when unused, so the workflow's `!= ''` gate sees a string.
 */
import { LIVE_DATASETS } from '../../src/data/live/liveDatasets';

const matrix = LIVE_DATASETS.map(({ id, build, timeoutMin, cache, setupRust = false }) => ({
  id,
  build,
  timeoutMin,
  setupRust,
  cachePaths: cache?.paths.join('\n') ?? '',
  cacheKey: cache?.key ?? '',
}));
console.log(`matrix=${JSON.stringify(matrix)}`);
