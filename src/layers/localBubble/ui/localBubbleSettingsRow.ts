import type { LayerSettingsRow } from '../../../@types/engine/layer/LayerSettingsRow';
import { selectLocalBubble } from '../state/localBubble/selectors';
import { setLocalBubbleEnabled } from '../state/localBubble/slice';

/** The Local Bubble's on/off row in the shared "Labels & guides" section. */
export const localBubbleSettingsRow: LayerSettingsRow = {
  id: 'toggle-local-bubble',
  label: 'Local Bubble',
  select: (state) => selectLocalBubble(state).enabled,
  set: setLocalBubbleEnabled,
};
