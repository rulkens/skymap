import { DATA_SOURCES } from '../../../../data/dataSources.ts';

// One count per source: what the app draws, or what the source holds where our build does not count.
const sources = DATA_SOURCES.map((row) => ({ ...row, count: row.drawn ?? row.rows }));
export const groups = [...new Set(sources.map((row) => row.group))].map((name) => ({
  name,
  rows: sources.filter((row) => row.group === name),
}));
export const COLUMNS = {
  release: 'Release / Paper',
  count: '# of objects',
  licence: 'Licence',
} as const;
