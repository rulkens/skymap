/**
 * ProbeSpheresTuningSectionContainer — the probe spheres' DebugPanel material and its store
 * boundary in one file, as `LocalBubbleTuningSectionContainer`.
 */

import { memo, useCallback } from 'react';
import DebugColorRow from '../../../../components/DebugPanel/DebugColorRow';
import DebugTuningSection from '../../../../components/DebugPanel/DebugTuningSection';
import sectionStyles from '../../../../components/DebugPanel/debugSection.module.css';
import { useAppDispatch, useAppSelector } from '../../../../store/hooks';
import { selectProbeSpheres } from '../../state/probeSpheres/selectors';
import { setProbeSpheresMaterial } from '../../state/probeSpheres/slice';
import { PROBE_SPHERE_SLIDER_FIELDS } from '../data/probeSphereSliderFields';
import { PROBE_SPHERE_GO_TO_BUTTONS } from '../data/probeSphereGoToButtons';
import { BODY_FOCUS_PREFIX } from '../../../../services/url/bodyFocusId';
import { requestSelect } from '../../../../state/selection/requestSelect';
import { requestFocus } from '../../../../state/selection/requestFocus';
import { setVisibility } from '../../../../state/settings/setVisibilityAction';
import DebugSlider from '../../../../components/DebugPanel/DebugSlider';
import { setMeshSelfBounce } from '../../../../state/settings/core/debugSlice';

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
  const selfBounce = useAppSelector((s) => s.settings.debug.meshSelfBounce);

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
              // Focus never reveals a Layer: an off section would fly to an undrawn sphere.
              dispatch(setVisibility({ cluster: 'probeSpheres', field: 'enabled', on: true }));
              dispatch(
                setVisibility({ cluster: 'probeSpheres', field: 'enabled', on: true, item: id }),
              );
              dispatch(requestSelect(focusId));
              dispatch(requestFocus({ id: focusId, transition: 'fly' }));
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <DebugSlider
        label="Self-bounce (all meshes)"
        value={selfBounce}
        min={0}
        max={0.2}
        step={0.005}
        readout={selfBounce.toFixed(3)}
        title="Fill light a sunlit mesh bounces onto itself, as a fraction of sunlight"
        onChange={(value) => dispatch(setMeshSelfBounce(value))}
      />
      <DebugColorRow
        label="Colour"
        value={probeSpheres.color}
        onChange={(color) => dispatch(setProbeSpheresMaterial({ color }))}
      />
    </DebugTuningSection>
  );
}

export default memo(ProbeSpheresTuningSectionContainer);
