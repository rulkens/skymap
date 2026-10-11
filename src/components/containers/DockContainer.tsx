/**
 * DockContainer — store boundary for the phone dock's Time label. Open state
 * and taps belong to PhoneHudContainer; this only adds the clock reach, so the
 * 1 Hz clock tick re-renders the dock alone, not the sheet above it.
 */

import { memo } from 'react';
import Dock from '../Dock/Dock';
import type { DockProps } from '../Dock/Dock';
import { useAppSelector } from '../../store/hooks';
import { selectTimeState } from '../../state/time/selectors';
import { useSimInstant } from '../../hooks/useSimInstant';
import { dockTimeLabel } from '../../utils/time/dockTimeLabel';

export type DockContainerProps = Omit<DockProps, 'timeLabel'>;

function DockContainer(props: DockContainerProps): React.ReactElement {
  const time = useAppSelector(selectTimeState);
  const instant = useSimInstant(time);
  return <Dock {...props} timeLabel={dockTimeLabel(time, instant)} />;
}

export default memo(DockContainer);
