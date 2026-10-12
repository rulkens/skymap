/**
 * SettingsSections — the Layers' own `ui` sections (composition order, D13),
 * then the core containers. Shared by the desktop Panel and the phone sheet;
 * store reach lives in the containers it renders.
 */

import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import { APP_COMPOSITION } from '../../compositions/app';
import { layerUiContents } from '../../utils/layer/layerUiContents';
import LabelsAndGuidesSectionContainer from '../containers/LabelsAndGuidesSectionContainer';
import DisplaySectionContainer from '../containers/DisplaySectionContainer';
import EarthSectionContainer from '../containers/EarthSectionContainer';
import CameraControlsSectionContainer from '../containers/CameraControlsSectionContainer';

export const SettingsSections = memo(function SettingsSections(): ReactNode {
  const mainSections = useMemo(() => layerUiContents(APP_COMPOSITION.layers, 'main'), []);
  const labelsAndGuidesRows = useMemo(
    () => layerUiContents(APP_COMPOSITION.layers, 'labelsAndGuides'),
    [],
  );
  return (
    <>
      {mainSections.map((Section, index) => (
        <Section key={index} />
      ))}
      <LabelsAndGuidesSectionContainer layerRows={labelsAndGuidesRows} />
      <DisplaySectionContainer>
        <EarthSectionContainer />
      </DisplaySectionContainer>
      <CameraControlsSectionContainer />
    </>
  );
});
