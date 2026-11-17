import LookIcon from './LookIcon';
import ZoomIcon from './ZoomIcon';

/** Each gesture's icon and its wording for a mouse and for touch. */
export const GESTURE_HINTS = {
  look: { Icon: LookIcon, mouse: 'Drag to look around', touch: 'Swipe to look around' },
  zoom: { Icon: ZoomIcon, mouse: 'Scroll to zoom', touch: 'Pinch to zoom' },
} as const;
