/** PairingOverlayContainer — store boundary: the overlay shows only while a remote is awaited. */

import { memo } from 'react';
import type { ReactNode } from 'react';
import PairingOverlay from '../PairingOverlay/PairingOverlay';
import { useAppSelector } from '../../store/hooks';
import { selectRemote } from '../../state/remote/selectors';

function PairingOverlayContainer(): ReactNode {
  const { phase, code, pairingUrl } = useAppSelector(selectRemote);
  if (phase !== 'waiting' || code === null || pairingUrl === null) return null;
  return <PairingOverlay code={code} pairingUrl={pairingUrl} />;
}

export default memo(PairingOverlayContainer);
