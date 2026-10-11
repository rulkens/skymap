/**
 * FullscreenToggleContainer — browser boundary for the full-screen pill.
 *
 * Renders nothing where the Fullscreen API is unavailable, so the top-bar
 * cluster closes up instead of keeping a dead pill.
 */

import { memo } from 'react';
import FullscreenToggle from '../FullscreenToggle/FullscreenToggle';
import { useFullscreen } from '../../hooks/useFullscreen';

function FullscreenToggleContainer({ hidden }: { hidden: boolean }): React.ReactElement | null {
  const { supported, active, toggle } = useFullscreen();
  if (!supported) return null;
  return <FullscreenToggle active={active} onToggle={toggle} hidden={hidden} />;
}

export default memo(FullscreenToggleContainer);
