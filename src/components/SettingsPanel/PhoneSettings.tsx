/**
 * PhoneSettings — the Layers sheet's content: the Tier chip over the sections.
 * MobileSheet owns the surface and title, so no Panel chrome here.
 */

import type { ReactNode } from 'react';
import TierChipContainer from '../containers/TierChipContainer';
import { SettingsSections } from './SettingsSections';

function PhoneSettings(): ReactNode {
  return (
    <>
      <TierChipContainer />
      <SettingsSections />
    </>
  );
}

export default PhoneSettings;
