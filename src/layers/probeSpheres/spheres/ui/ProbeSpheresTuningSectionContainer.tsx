/**
 * ProbeSpheresTuningSectionContainer — the probe spheres' DebugPanel material and its store
 * boundary in one file, as `LocalBubbleTuningSectionContainer`. The colour is stored linear;
 * the native picker speaks sRGB.
 */

import { memo, useCallback } from 'react';
import DebugTuningSection from '../../../../components/DebugPanel/DebugTuningSection';
import sliderStyles from '../../../../components/DebugPanel/DebugSlider.module.css';
import sectionStyles from '../../../../components/DebugPanel/debugSection.module.css';
import { useAppDispatch, useAppSelector } from '../../../../store/hooks';
import { hexToLinearRgb } from '../../../../utils/color/hexToLinearRgb';
import { linearRgbToHex } from '../../../../utils/color/linearRgbToHex';
import { selectProbeSpheres } from '../../state/probeSpheres/selectors';
import { setProbeSpheresMaterial } from '../../state/probeSpheres/slice';
import { PROBE_SPHERE_SLIDER_FIELDS } from '../data/probeSphereSliderFields';
import { PROBE_SPHERE_GO_TO_BUTTONS } from '../data/probeSphereGoToButtons';
import { BODY_FOCUS_PREFIX } from '../../../../services/url/bodyFocusId';
import { requestSelect } from '../../../../state/selection/requestSelect';
import { requestFocus } from '../../../../state/selection/requestFocus';
import type { HexString } from '../../../../@types/math/HexString';

function ProbeSpheresTuningSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const probeSpheres = useAppSelector(selectProbeSpheres);
  const onSliderChange = useCallback(
    (key: 'metallic' | 'roughness', value: number) =>
      dispatch(
        setProbeSpheresMaterial(key === 'metallic' ? { metallic: value } : { roughness: value }),
      ),
    [dispatch],
  );
  const hex = linearRgbToHex(probeSpheres.color);

  return (
    <DebugTuningSection
      title="Probe spheres"
      fields={PROBE_SPHERE_SLIDER_FIELDS}
      values={probeSpheres}
      onSliderChange={onSliderChange}
    >
      <div className={sectionStyles.buttonRow}>
        {PROBE_SPHERE_GO_TO_BUTTONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={sectionStyles.button}
            onClick={() => {
              const focusId = `${BODY_FOCUS_PREFIX}${id}`;
              dispatch(requestSelect(focusId));
              dispatch(requestFocus({ id: focusId, transition: 'fly' }));
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <label className={sliderStyles.root}>
        <span className={sliderStyles.label}>Colour</span>
        <span className={sliderStyles.readout}>{hex}</span>
        <input
          type="color"
          value={hex}
          onChange={(e) =>
            dispatch(
              setProbeSpheresMaterial({ color: hexToLinearRgb(e.target.value as HexString) }),
            )
          }
        />
      </label>
    </DebugTuningSection>
  );
}

export default memo(ProbeSpheresTuningSectionContainer);
