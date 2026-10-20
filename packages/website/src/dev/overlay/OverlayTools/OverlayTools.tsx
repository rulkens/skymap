/*
 * OverlayTools — the overlay itself: feedback notes and the docs review, switched on and off together
 * with `f`. The two share the notes the server keeps for this page. DevOverlay loads it in dev only.
 */
import { useEffect } from 'react';

import Feedback from '../../feedback/Feedback/Feedback.tsx';
import Review from '../../review/Review/Review.tsx';
import { pageNotes } from '../pageNotes';
import { useDevOverlayKeys } from '../useDevOverlayKeys';

function OverlayTools() {
  useDevOverlayKeys();

  useEffect(() => {
    // A server that is restarting leaves the pins as they are; the next focus asks again.
    const refresh = () => void pageNotes.refresh().catch(() => {});
    refresh();
    addEventListener('focus', refresh);
    return () => removeEventListener('focus', refresh);
  }, []);

  return (
    <>
      <Feedback />
      <Review />
    </>
  );
}

export default OverlayTools;
