/**
 * Every visibility address a show, hide or fade can name, in the app's composition order. With
 * `items`, a per-item entry's items follow it one level in (`survey:milliquas`); a fade has no
 * scoped form, so it gets the bare addresses only.
 */
import { APP_VISIBILITY_REGISTRY } from '../../../../../src/compositions/appVisibility';
import { visibilityAddressOf } from '../../../../../src/utils/visibility/visibilityAddressOf';
import { formatAddress } from '../../kinds/utils/formatAddress';
import type { LayerOption } from '../../@types/kinds/LayerOption';

export function layerOptions(items: boolean): LayerOption[] {
  return APP_VISIBILITY_REGISTRY.flatMap((entry): LayerOption[] => {
    const address = visibilityAddressOf(entry);
    const own: LayerOption = { address, text: formatAddress(address), depth: 0 };
    if (!items || !('items' in entry)) return [own];
    return [
      own,
      ...entry.items.map(
        (item): LayerOption => ({ address: `${address}:${item}`, text: item, depth: 1 }),
      ),
    ];
  });
}
