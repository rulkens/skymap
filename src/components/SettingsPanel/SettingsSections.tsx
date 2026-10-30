/**
 * SettingsSections — the Layers' own `ui` sections (composition order, D13),
 * then the core containers. Shared by the desktop Panel and the phone sheet;
 * store reach lives in the containers it renders.
 */

import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import { APP_COMPOSITION } from '../../compositions/app';
import { APP_LABELS_AND_GUIDES_REGISTRY } from '../../compositions/appLabelsAndGuidesRows';
import { layerUiContents } from '../../utils/layer/layerUiContents';
import LabelsAndGuidesSectionContainer from '../containers/LabelsAndGuidesSectionContainer';
import DisplaySectionContainer from '../containers/DisplaySectionContainer';
import CameraControlsSectionContainer from '../containers/CameraControlsSectionContainer';

export const SettingsSections = memo(function SettingsSections(): ReactNode {
  const mainSections = useMemo(() => layerUiContents(APP_COMPOSITION.layers, 'main'), []);
  return (
    <>
      {mainSections.map((Section, index) => (
        <Section key={index} />
      ))}
      <LabelsAndGuidesSectionContainer layerRows={APP_LABELS_AND_GUIDES_REGISTRY} />
      <DisplaySectionContainer />
      <CameraControlsSectionContainer />
    </>
  );
});
