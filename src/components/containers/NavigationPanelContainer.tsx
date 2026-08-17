// src/components/containers/NavigationPanelContainer.tsx
/**
 * NavigationPanelContainer — App-boundary for `NavigationPanel`'s mount-time
 * viewport read.
 *
 * This is not a store subscription: `NavigationPanel` owns its own
 * expand/collapse settings reach internally. The one thing App used to carry
 * on its behalf was the one-shot `useInitialMobile` viewport sample that seeds
 * `defaultOpen`/`isMobile`; hoisting it here keeps App purely structural.
 */

import { memo } from 'react';
import NavigationPanel from '../NavigationPanel/NavigationPanel';
import { useInitialMobile } from '../../hooks/useInitialMobile';

function NavigationPanelContainer(): React.ReactElement {
  const initialMobile = useInitialMobile();
  return <NavigationPanel defaultOpen={!initialMobile} isMobile={initialMobile} />;
}

export default memo(NavigationPanelContainer);
