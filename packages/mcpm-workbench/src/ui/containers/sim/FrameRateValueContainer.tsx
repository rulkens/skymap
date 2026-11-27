/** FrameRateValueContainer — store boundary for the tip's frame-rate cell; re-renders per fps sample, alone. */
import { memo, type ReactNode } from 'react';
import { selectSimRunning } from '../../../state/sim/selectSimRunning';
import { useAppSelector } from '../../../store/hooks';
import { formatFps } from '../../../utils/format/formatFps';
import FrameRateValue from '../../sim/SimulationTip/FrameRateValue/FrameRateValue';
import { useFrameRateZone } from './useFrameRateZone';

function FrameRateValueContainer(): ReactNode {
  const zone = useFrameRateZone();
  const text = useAppSelector((s) =>
    !selectSimRunning(s) ? 'paused' : s.view.fps > 0 ? formatFps(s.view.fps) : '—',
  );
  return <FrameRateValue zone={zone} text={text} />;
}

export default memo(FrameRateValueContainer);
