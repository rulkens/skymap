import type { ScopedVisibilityAddress } from '../../@types/animation/ScopedVisibilityAddress';
import type { VisibilityAddress } from '../../@types/animation/VisibilityAddress';
import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import type { LayerSwitch } from '../../@types/url/LayerSwitch';
import type { LayerSwitchParse } from '../../@types/url/LayerSwitchParse';
import { APP_VISIBILITY_REGISTRY } from '../../compositions/appVisibility';
import { splitVisibilityAddress } from '../visibility/splitVisibilityAddress';
import { visibilityAddressOf } from '../visibility/visibilityAddressOf';

const ENTRIES: readonly VisibilityEntry[] = APP_VISIBILITY_REGISTRY;

/** A `layers=` value, token by token in order: `name` on, `-name` off. The hash is external
 * input, so a token is admitted only when it names a composed entry (and a listed item), and
 * only in its exact form: `survey:desiWedge:x` would otherwise write `desiWedge`. */
export function parseLayerSwitches(value: string): LayerSwitchParse {
  const switches: LayerSwitch[] = [];
  const unknown: string[] = [];
  for (const token of value.split(',')) {
    if (token === '') continue;
    const on = !token.startsWith('-');
    const name = on ? token : token.slice(1);
    const { bare, item } = splitVisibilityAddress(name);
    const entry = ENTRIES.find((e) => visibilityAddressOf(e) === bare);
    const known = entry !== undefined && (item === undefined || entry.items?.includes(item));
    if (!known || name !== (item === undefined ? bare : `${bare}:${item}`)) {
      unknown.push(token);
      continue;
    }
    switches.push({ address: name as VisibilityAddress | ScopedVisibilityAddress, on });
  }
  return { switches, unknown };
}
