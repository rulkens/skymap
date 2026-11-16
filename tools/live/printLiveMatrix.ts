#!/usr/bin/env node
/** Prints `matrix=<json>` for `>> $GITHUB_OUTPUT`: one matrix entry per registered live dataset. */
import { LIVE_DATASETS } from '../../src/data/live/liveDatasets';

const matrix = LIVE_DATASETS.map(({ id, build, timeoutMin }) => ({
  id,
  build,
  timeoutMin,
}));
console.log(`matrix=${JSON.stringify(matrix)}`);
