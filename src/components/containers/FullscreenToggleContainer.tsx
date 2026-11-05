/**
 * FullscreenToggleContainer — browser boundary for the full-screen pill.
 *
 * A phone feature, but it stays while full screen is active at any width:
 * rotating past the phone breakpoint must not strand the viewer.
 */

import { memo } from 'react';
import FullscreenToggle from '../FullscreenToggle/FullscreenToggle';
import { useFullscreen } from '../../hooks/useFullscreen';
import { useIsMobile } from '../../hooks/useIsMobile';

function FullscreenToggleContainer({ hidden }: { hidden: boolean }): React.ReactElement | null {
  const { supported, active, toggle } = useFullscreen();
  const isMobile = useIsMobile();
  if (!supported || (!isMobile && !active)) return null;
  return <FullscreenToggle active={active} onToggle={toggle} hidden={hidden} />;
}

export default memo(FullscreenToggleContainer);
