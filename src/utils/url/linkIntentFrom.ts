import type { LinkIntent } from '../../@types/url/LinkIntent';
import { HASH_PARAM_SOURCES } from '../../state/url/hashParamSources';
import { parseHashParams } from './parseHashParams';
import { combineLinkViews } from './combineLinkViews';

/**
 * A hash body as one `LinkIntent`. An EMPTY value counts as absent (`#focus=`
 * is a truncated link, not a request for the id `''`), which is what keeps
 * `HashParamSource.read`'s never-empty contract true for every row at once.
 */
export function linkIntentFrom(body: string): LinkIntent {
  const params = parseHashParams(body);
  let intent: LinkIntent = { view: { kind: 'home' } };
  for (const source of HASH_PARAM_SOURCES) {
    const value = params.get(source.key);
    if (!value) continue;
    const { view, ...rest } = source.read(value);
    intent = { ...intent, ...rest, view: view ? combineLinkViews(intent.view, view) : intent.view };
  }
  return intent;
}
