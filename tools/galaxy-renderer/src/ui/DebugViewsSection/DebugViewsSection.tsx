/**
 * DebugViewsSection — the four debug-view crossfade sliders, each interleaved
 * with the knobs that only matter while it is up (the ISM map's three channel
 * isolations, the orientation chain's two sigmas). Each view slider is a
 * weight in [0,1]: 0 is pure galaxy, 1 the debug layer alone, and the four
 * blend independently — `RenderSettings` carries the crossfade contract.
 *
 * Written out rather than mapped over `DEBUG_VIEWS` precisely because of that
 * interleaving: a map would gather the four views together and reorder the
 * panel. Only their names come off the registry.
 */
import type { ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { renderPatched } from '../../state/slices/renderSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import { DEBUG_VIEWS } from '../../data/debugViews';
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
          label={DEBUG_VIEWS.dust.label}
          value={render.dustViewIntensity}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(renderPatched({ dustViewIntensity: v }))}
          path="render.dustViewIntensity"
          info={DEBUG_VIEWS.dust.info}
        />
        <ParamSlider
          label={DEBUG_VIEWS.ismMap.label}
          value={render.ismMapViewIntensity}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(renderPatched({ ismMapViewIntensity: v }))}
          path="render.ismMapViewIntensity"
          info={DEBUG_VIEWS.ismMap.info}
        />
        <ParamSlider
          label="ISM map · gas"
          value={render.ismMapGasWeight}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(renderPatched({ ismMapGasWeight: v }))}
          path="render.ismMapGasWeight"
          info="Isolates the gas channel: unspent ISM fuel, driven to 0 by an ignition and refilled over 1/gasRegen steps. The palette's dimmest colour by a wide margin — zero the other three to see it at all."
        />
        <ParamSlider
          label="ISM map · recent SF"
          value={render.ismMapRecentWeight}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(renderPatched({ ismMapRecentWeight: v }))}
          path="render.ismMapRecentWeight"
          info="Isolates the recentSf channel: exp(-age/12), a cell that fired within roughly the last dozen steps. Warm near-white and usually what washes out the gas channel in the combined view."
        />
        <ParamSlider
          label="ISM map · activity"
          value={render.ismMapActivityWeight}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(renderPatched({ ismMapActivityWeight: v }))}
          path="render.ismMapActivityWeight"
          info="Isolates the activity channel: the accumulated trace of every front that passed, decayed per step by activityDecay. This is the channel dust placement actually reads. Bright magenta-violet, the single brightest channel in the combined view — zero the other three to isolate it, though it rarely needs isolating."
        />
        <ParamSlider
          label="ISM map · dust"
          value={render.ismMapDustWeight}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(renderPatched({ ismMapDustWeight: v }))}
          path="render.ismMapDustWeight"
          info="Isolates the conserved dust channel (the packed texel's own .w lane, since 9aa9fe5d): swept dust, unclamped past ambient — rims legitimately overshoot to the 8.0 ceiling. Teal-green. Lower the weight to bring rim overshoot back into a readable range."
        />
        <ParamSlider
          label="ISM map · seeding"
          value={render.ismMapSeedingViewWeight}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(renderPatched({ ismMapSeedingViewWeight: v }))}
          path="render.ismMapSeedingViewWeight"
          info="NOT a channel isolation like the four above — this is the exact composite density dust placement consumes: overshoot/meanOvershoot, the swept-dust channel's excess above the automaton's ambient pedestal. Shows what the raw channels can't: an ambient pedestal glows teal in the dust channel above without contributing any placement mass. Warm-white. Shows the density BEFORE texel-area weighting — the CDF multiplies by area, so outer texels weigh more in placement than they glow here."
        />
        <ParamSlider
          label={DEBUG_VIEWS.orientation.label}
          value={render.orientationViewIntensity}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(renderPatched({ orientationViewIntensity: v }))}
          path="render.orientationViewIntensity"
          info={DEBUG_VIEWS.orientation.info}
        />
        <ParamSlider
          label="Orientation sigma (deriv)"
          value={render.orientationSigmaDerivTexels}
          min={0.5}
          max={6}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => dispatch(renderPatched({ orientationSigmaDerivTexels: v }))}
          path="render.orientationSigmaDerivTexels"
          info="Gaussian sigma (ismMap grid texels) for the pass chain's field-smoothing stage, before the central-difference gradient. Moving it re-runs the pass chain — and the dust rebuild, if seeding is on."
        />
        <ParamSlider
          label="Orientation sigma (integ)"
          value={render.orientationSigmaIntegTexels}
          min={0.5}
          max={12}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => dispatch(renderPatched({ orientationSigmaIntegTexels: v }))}
          path="render.orientationSigmaIntegTexels"
          info="Gaussian sigma (ismMap grid texels) for the tensor-smoothing stage, after Jxx/Jxy/Jyy are built. Conventionally 2-3x the derivative sigma. Moving it re-runs the pass chain — and the dust rebuild, if seeding is on."
        />
        <ParamSlider
          label={DEBUG_VIEWS.bubble.label}
          value={render.bubbleViewIntensity}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(renderPatched({ bubbleViewIntensity: v }))}
          path="render.bubbleViewIntensity"
          info={DEBUG_VIEWS.bubble.info}
        />
      </div>
    </CollapsibleSection>
  );
}

export default DebugViewsSection;
