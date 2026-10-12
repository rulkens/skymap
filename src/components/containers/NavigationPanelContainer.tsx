/**
 * NavigationPanelContainer — App-boundary for `NavigationPanel`, which is static
 * and keeps its own expand/collapse state. Desktop only: the phone has no
 * cheatsheet.
 */

import { memo } from 'react';
import NavigationPanel from '../NavigationPanel/NavigationPanel';

function NavigationPanelContainer(): React.ReactElement {
  return <NavigationPanel />;
}

export default memo(NavigationPanelContainer);
