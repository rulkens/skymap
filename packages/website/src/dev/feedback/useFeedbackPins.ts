import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { remember } from '../overlay/remember';
import { usePageNotes } from '../overlay/usePageNotes';
import type { FeedbackPin } from './@types/FeedbackPin';
import { loadPins } from './loadPins';
import { pinsKey } from './pinsKey';

/**
 * The pins of the notes left on this page, kept for the tab so a reload does not lose them. A note
 * the agent has applied, or one deleted from a review panel, is gone from the server; its pin goes too.
 */
export function useFeedbackPins(): [FeedbackPin[], Dispatch<SetStateAction<FeedbackPin[]>>] {
  const [pins, setPins] = useState(loadPins);
  const { ids, loaded } = usePageNotes();
  useEffect(() => remember(pinsKey(), JSON.stringify(pins)), [pins]);
  useEffect(() => {
    if (loaded && pins.some((pin) => !ids.includes(pin.id)))
      setPins((all) => all.filter((pin) => ids.includes(pin.id)));
  }, [ids, loaded, pins]);
  return [pins, setPins];
}
