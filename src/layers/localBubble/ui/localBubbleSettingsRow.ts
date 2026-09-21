import type { LayerSettingsRow } from '../../../@types/engine/layer/LayerSettingsRow';
import { selectSettings } from '../../../state/settings/selectors';
import { setLocalBubbleEnabled } from '../state/localBubble/slice';

/** The Local Bubble's on/off row in the shared "Labels & guides" section. */
export const localBubbleSettingsRow: LayerSettingsRow = {
  id: 'toggle-local-bubble',
  label: 'Local Bubble',
  select: (state) => selectSettings(state).localBubble.enabled,
  set: setLocalBubbleEnabled,
};
