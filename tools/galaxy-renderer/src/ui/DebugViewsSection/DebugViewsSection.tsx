/**
 * DebugViewsSection — the three debug-view crossfade sliders (JWST dust
 * view, SF map, orientation overlay) plus the two orientation-only sigma
 * knobs, moved here from ControlsPanel's own body. Each slider is a weight
 * in [0,1]: 0 is pure galaxy, 1 is the debug layer alone, and the three
 * blend independently — see `RenderSettings`'s own docblocks for the exact
 * crossfade contract.
 */
import type { ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { renderPatched } from '../../state/slices/renderSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './DebugViewsSection.module.css';

function DebugViewsSection(): ReactNode {
  const dispatch = useAppDispatch();
  const render = useAppSelector((state) => state.render);
  const open = useAppSelector((state) => state.ui.openSections.debugViews);

  return (
    <CollapsibleSection
      title="DEBUG VIEWS"
      open={open}
      onToggle={() => dispatch(sectionToggled('debugViews'))}
    >
      <div className={styles.root}>
        <ParamSlider
          label="Dust view"
          value={render.dustViewIntensity}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(renderPatched({ dustViewIntensity: v }))}
          info="Crossfades in the primary galaxy's dust-column map (a hot JWST/MIRI-ish palette) over the normal view. 0 is pure galaxy, 1 the map alone. Only has an effect while the analytic model pill is on."
        />
        <ParamSlider
          label="SF map view"
          value={render.sfMapViewIntensity}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(renderPatched({ sfMapViewIntensity: v }))}
          info="Crossfades in the SSPSF automaton's log-polar output, same seam as the dust view. Step 1's only way to see the automaton — it feeds nothing else yet."
        />
        <ParamSlider
          label="SF map · gas"
          value={render.sfMapGasWeight}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(renderPatched({ sfMapGasWeight: v }))}
          info="Isolates the gas channel: unspent ISM fuel, driven to 0 by an ignition and refilled over 1/gasRegen steps. The palette's dimmest colour by a wide margin — zero the other two to see it at all."
        />
        <ParamSlider
          label="SF map · recent SF"
          value={render.sfMapRecentWeight}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(renderPatched({ sfMapRecentWeight: v }))}
          info="Isolates the recentSf channel: exp(-age/12), a cell that fired within roughly the last dozen steps. The hottest, brightest channel — usually what washes out the other two in the combined view."
        />
        <ParamSlider
          label="SF map · activity"
          value={render.sfMapActivityWeight}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(renderPatched({ sfMapActivityWeight: v }))}
          info="Isolates the oldActivity channel: the accumulated trace of every front that passed, decayed per step by activityDecay. This is the channel dust placement actually reads."
        />
        <ParamSlider
          label="Orientation view"
          value={render.orientationViewIntensity}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(renderPatched({ orientationViewIntensity: v }))}
          info="Crossfades in the GPU structure-tensor pass chain's crest orientation (hue) and coherence (brightness), same seam again. Also gates the pass chain itself — it only (re-)dispatches while this is above 0."
        />
        <ParamSlider
          label="Orientation sigma (deriv)"
          value={render.orientationSigmaDerivTexels}
          min={0.5}
          max={6}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => dispatch(renderPatched({ orientationSigmaDerivTexels: v }))}
          info="Gaussian sigma (sfMap grid texels) for the pass chain's field-smoothing stage, before the central-difference gradient. Only reachable while the orientation view is above 0."
        />
        <ParamSlider
          label="Orientation sigma (integ)"
          value={render.orientationSigmaIntegTexels}
          min={0.5}
          max={12}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => dispatch(renderPatched({ orientationSigmaIntegTexels: v }))}
          info="Gaussian sigma (sfMap grid texels) for the tensor-smoothing stage, after Jxx/Jxy/Jyy are built. Conventionally 2-3x the derivative sigma. Only reachable while the orientation view is above 0."
        />
        <ParamSlider
          label="Bubble view"
          value={render.bubbleViewIntensity}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(renderPatched({ bubbleViewIntensity: v }))}
          info="Crossfades in the SF-event catalog's own bubble/cavity placements — a second, independent star-formation model nobody has ever seen, resolved from the same events the SSPSF automaton never reads. Amber shells are old relic bubbles, cyan shells are actively-swept HII cavities. The only way to compare this model against the SF map view above."
        />
      </div>
    </CollapsibleSection>
  );
}

export default DebugViewsSection;
