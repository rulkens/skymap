import { DATA_SOURCES } from '../../../../data/dataSources.ts';
import { countNoun } from '../../../../utils/countNoun.ts';
import { narrowSizes } from '../../../../utils/narrowSizes.ts';

// The title of each is a group of the table, which picks its sources.
// `accent` is taken from the picture: the survey's warm near end, starlight, the orbits' gold, Earth's blue.
// `counts` names what the large number counts where a source's own count does not (`countNoun`).
// `fact` stands a sourced figure there instead, for a kind whose sources give no count: orbits fitted, levels of detail.
export const KINDS = [
  {
    group: 'Galaxies and quasars',
    counts: 'galaxies and quasars',
    shot: 'features-desi',
    accent: 'var(--site-accent-survey)',
  },
  { group: 'Stars', counts: 'stars', shot: 'render-stars', accent: 'var(--site-accent-starlight)' },
  {
    group: 'Solar system',
    fact: 'sci-ephemeris',
    shot: 'lesson-solar-system',
    accent: 'var(--site-accent-orbits)',
  },
  {
    group: 'Imagery',
    fact: 'pipe-earth-tiles',
    shot: 'earth-terminator',
    accent: 'var(--site-accent-earth)',
  },
].map((kind) => ({
  ...kind,
  // The Science table's count: what the app draws, or what the source holds where the build does not count
  // (SourceTable). `short` is the table's name up to its gloss ("SDSS, the Sloan Digital Sky Survey").
  sources: DATA_SOURCES.filter((row) => row.group === kind.group).map((row) => ({
    ...row,
    count: row.drawn ?? row.rows,
    short: row.name.split(', ')[0]!,
    noun: kind.counts && countNoun(row.id, row.rows, kind.counts),
  })),
}));

// A square window cut from a wide picture shows its full height, so the file is chosen for 16/9 of the window.
export const WINDOW_SIZES = narrowSizes('29rem', '32rem');
// The Science table's heading of the count.
export const COUNT_LABEL = '# of objects';
