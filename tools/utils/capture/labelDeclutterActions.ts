/**
 * Every label off, plus the selection chrome. Applies to EVERY shot: no card's
 * thumbnail wants text burned into it. Read off the visibility registry, so a
 * Layer's new captions are covered by existing (a hand list missed the Galactic
 * Centre and Voyager 2). Its sibling `sceneDeclutterActions` hides scene content,
 * which only a focus shot wants.
 */

import type { UnknownAction } from '@reduxjs/toolkit';
import type { VisibilityEntry } from '../../../src/@types/engine/layer/VisibilityEntry';
import { APP_VISIBILITY_REGISTRY } from '../../../src/compositions/appVisibility';
import { setVisibility } from '../../../src/state/settings/setVisibilityAction';
import { setPassDisabled } from '../../../src/state/settings/core/debugSlice';
import { CAPTURE_HIDDEN_PASSES } from './hiddenPasses';

export function labelDeclutterActions(): UnknownAction[] {
  const entries: readonly VisibilityEntry[] = APP_VISIBILITY_REGISTRY;
  const labelsOff = entries.flatMap((entry) => {
    if ('key' in entry) return [];
    const items: readonly (string | undefined)[] = entry.items ?? [undefined];
    return items.map((item) =>
      setVisibility({ cluster: entry.cluster, field: 'labelEnabled', on: false, item }),
    );
  });
  return [
    ...labelsOff,
    ...CAPTURE_HIDDEN_PASSES.map((pass) => setPassDisabled({ pass, disabled: true })),
  ];
}
