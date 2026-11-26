import { useEffect, useRef } from 'react';
import type { FrameRateZone } from '../../../../@types/sim/FrameRateZone';
import { selectSimRunning } from '../../../state/sim/selectSimRunning';
import { useAppSelector } from '../../../store/hooks';
import { frameRateZone } from './utils/frameRateZone';

/**
 * useFrameRateZone — the frame-rate zone to show, selected as the zone rather than
 * the rate, so a caller re-renders only when the zone changes. Each caller keeps
 * its own last zone for the hysteresis; fed the same store updates, they agree.
 */
export function useFrameRateZone(): FrameRateZone {
  const shown = useRef<FrameRateZone>('normal');
  const zone = useAppSelector((s) => frameRateZone(shown.current, s.view.fps, selectSimRunning(s)));
  useEffect(() => {
    shown.current = zone;
  }, [zone]);
  return zone;
}
