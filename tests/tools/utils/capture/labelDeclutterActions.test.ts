import { describe, expect, it } from 'vitest';
import { labelDeclutterActions } from '../../../../tools/utils/capture/labelDeclutterActions';
import type { VisibilityEntry } from '../../../../src/@types/engine/layer/VisibilityEntry';
import { APP_VISIBILITY_REGISTRY } from '../../../../src/compositions/appVisibility';
import settingsReducer from '../../../../src/state/settings/settingsReducer';
import { visibilitySwitchOf } from '../../../../src/utils/visibility/visibilitySwitchOf';

describe('labelDeclutterActions', () => {
  // A Layer whose captions the list missed still drew them into "label-free" shots
  // (the Galactic Centre, Voyager 2).
  it('turns off every label switch every Layer declares', () => {
    const settings = labelDeclutterActions().reduce(
      settingsReducer,
      settingsReducer(undefined, { type: '@@init' }),
    );
    const entries: readonly VisibilityEntry[] = APP_VISIBILITY_REGISTRY;
    for (const entry of entries) {
      if ('key' in entry) continue;
      const items: readonly (string | undefined)[] = entry.items ?? [undefined];
      for (const item of items) {
        expect(visibilitySwitchOf(settings, entry, item), `${entry.label} ${item ?? ''}`).toBe(
          false,
        );
      }
    }
  });
});
