import { OBJECT_ROWS } from '../../../packages/website/src/data/objectCatalogue';
import { clipFactories } from '../../../src/data/animation/clips/clipRegistry';
import { tourRegistry } from '../../../src/data/animation/tours/tourRegistry';
import { exhibitRegistry } from '../../../src/data/exhibits/exhibitRegistry';
import { HASH_PARAM_SOURCES } from '../../../src/state/url/hashParamSources';
import { linkIntentFrom } from '../../../src/utils/url/linkIntentFrom';
import { parseHashParams } from '../../../src/utils/url/parseHashParams';

const KEYS = new Set(HASH_PARAM_SOURCES.map((source) => source.key));
const NAMED = new Set(OBJECT_ROWS.map((row) => row.id));
// Ids the app resolves against its data files, which no table here lists: a catalogue galaxy, a sky position, a star by row, a catalogue's cluster.
const FROM_DATA = /^(?:pgc-\d+|sdss-\d+|pos@.+|star-\d+|[a-z]+-bulk-.+)$/;
const TAKEOVERS = {
  exhibit: exhibitRegistry,
  tour: tourRegistry,
  clip: clipFactories,
};

/**
 * What is wrong with a link into the app, given what follows its `#`; null
 * when the app's own parser reads every part and the object, exhibit, tour or
 * clip it names exists. The body or site named inside a `pose` is not looked up.
 */
export function appViewProblem(hash: string): string | null {
  const params = parseHashParams(hash);
  const unknown = [...params.keys()].find((key) => !KEYS.has(key));
  if (unknown !== undefined) return `the app reads no "${unknown}"`;
  const { view } = linkIntentFrom(hash);
  // Each of these keys alone yields its own kind of view, so a value the parser refused shows as a kind that is missing.
  const unread = ['focus', 'pose', 'exhibit', 'tour', 'clip'].find(
    (key) => params.has(key) && linkIntentFrom(`${key}=${params.get(key)!}`).view.kind !== key,
  );
  if (unread !== undefined) return `the app does not read ${unread}=${params.get(unread)!}`;
  if (view.kind === 'focus')
    return NAMED.has(view.id) || FROM_DATA.test(view.id) ? null : `no object "${view.id}"`;
  if (view.kind === 'exhibit' || view.kind === 'tour' || view.kind === 'clip')
    return view.id in TAKEOVERS[view.kind] ? null : `no ${view.kind} "${view.id}"`;
  return null;
}
