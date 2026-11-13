/** NavigationPanelContainer — store boundary for the cheatsheet: standing (the sky view, D9) picks the sky rows. */

import { memo, type ReactNode } from 'react';
import NavigationPanel from '../NavigationPanel/NavigationPanel';
import { useAppSelector } from '../../store/hooks';
import { selectSkyView } from '../../state/sky/selectSkyView';

function NavigationPanelContainer(): ReactNode {
  const standing = useAppSelector(selectSkyView) !== null;
  return <NavigationPanel mode={standing ? 'sky' : 'space'} />;
}

export default memo(NavigationPanelContainer);
