/**
 * HiiSection — the analytic field's HII-region tier (`src/services/engine/galaxyGenerator/v2/hiiRegions.ts`):
 * discrete emission sprites with a limb-brightened shell, an embedded OB
 * cluster core, and a dust cavity they carve into the analytic dust lane.
 * Own section, own header pill (`fieldTuning.hii.enabled`), same idiom as
 * `ArmCloudSection`/`DustCloudSection` — a sub-tier with its own knobs, not
 * a settings drawer folded into FLUX FIELD.
 */
import type { ReactNode } from 'react';
import type { GalaxyHiiAssociationsTuning } from '../../../../../src/@types/galaxy/GalaxyHiiAssociationsTuning';
import type { GalaxyHiiDigTuning } from '../../../../../src/@types/galaxy/GalaxyHiiDigTuning';
import type { GalaxyHiiTuning } from '../../../../../src/@types/galaxy/GalaxyHiiTuning';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './HiiSection.module.css';

function HiiSection(): ReactNode {
  const dispatch = useAppDispatch();
  const hii = useAppSelector((state) => state.fieldTuning.hii);
  const open = useAppSelector((state) => state.ui.openSections.hii);

  const patchHii = (patch: Partial<GalaxyHiiTuning>): void => {
    dispatch(fieldTuningPatched({ hii: { ...hii, ...patch } }));
  };

  const patchDig = (patch: Partial<GalaxyHiiDigTuning>): void => {
    patchHii({ dig: { ...hii.dig, ...patch } });
  };

  const patchAssociations = (patch: Partial<GalaxyHiiAssociationsTuning>): void => {
    patchHii({ associations: { ...hii.associations, ...patch } });
  };

  return (
    <CollapsibleSection
      title="HII REGIONS"
      open={open}
      onToggle={() => dispatch(sectionToggled('hii'))}
      headerToggle={hii.enabled}
      onHeaderToggleChange={(value) => patchHii({ enabled: value })}
      copyPayload={{ fieldTuning: { hii } }}
    >
      <div className={styles.root}>
        <ParamSlider
          label="Brightness"
          value={hii.brightness}
          min={0}
          max={4}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchHii({ brightness: v })}
          path="fieldTuning.hii.brightness"
          info="Whole-tier flux multiplier. Unlike the arm cloud's share knob this ADDS light on top of the disc mixture, which never contained HII emission to begin with. 1 is the calibrated default."
        />
        <ParamSlider
          label="Radius scale"
          value={hii.radiusScale}
          min={0.2}
          max={3}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchHii({ radiusScale: v })}
          path="fieldTuning.hii.radiusScale"
          info="Multiplies the Strömgren radius each region is drawn at: bigger, softer shells above 1, smaller and more concentrated below. 1 is the law exactly."
        />
        <ParamSlider
          label="Shell thickness"
          value={hii.shellThickness}
          min={0.02}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchHii({ shellThickness: v })}
          path="fieldTuning.hii.shellThickness"
          info="Radial scatter of a region's shell sprites, as a fraction of its radius. Small values give a thin, sharply limb-brightened front."
        />
        <ParamSlider
          label="Cluster strength"
          value={hii.clusterStrength}
          min={0}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchHii({ clusterStrength: v })}
          path="fieldTuning.hii.clusterStrength"
          info="Brightness of the embedded OB cluster at each region's centre; 0 leaves a hollow shell."
        />
        <ParamSlider
          label="Cavity scale"
          value={hii.cavityScale}
          min={0}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchHii({ cavityScale: v })}
          path="fieldTuning.hii.cavityScale"
          info="Radius of the dust cavity a young event carves, as a fraction of its own HII radius. 0 leaves the dust undisturbed."
        />
        <ParamSlider
          label="Map seeding"
          value={hii.sfMapSeeding}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchHii({ sfMapSeeding: v })}
          path="fieldTuning.hii.sfMapSeeding"
          info="Fraction of HII events placed from the SF-map automaton's recentSf channel instead of the arm-ridge catalog. Ignition zeroes gas and age together, so map-seeded knots sit in dust-free pockets (the observed decorrelation). 0 = catalog placement exactly."
        />
        <ParamSlider
          label="DIG · flux fraction"
          value={hii.dig.fraction}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchDig({ fraction: v })}
          path="fieldTuning.hii.dig.fraction"
          info="Diffuse ionized gas (DIG) veil's fraction of this tier's total Hα — observationally 30-50% of a galaxy's Hα sits outside HII regions entirely, a faint haze tracing the arms around the knots. Needs an SF map; 0 skips the veil."
        />
        <ParamSlider
          label="DIG · complexes"
          value={hii.dig.complexes}
          min={0}
          max={120}
          step={1}
          format={(v) => v.toFixed(0)}
          onChange={(v) => patchDig({ complexes: v })}
          path="fieldTuning.hii.dig.complexes"
          info="Number of DIG complex seeds. Total blob count is complexes x children."
        />
        <ParamSlider
          label="DIG · children"
          value={hii.dig.childrenPerComplex}
          min={1}
          max={12}
          step={1}
          format={(v) => v.toFixed(0)}
          onChange={(v) => patchDig({ childrenPerComplex: v })}
          path="fieldTuning.hii.dig.childrenPerComplex"
          info="Blobs scattered around each DIG complex seed."
        />
        <ParamSlider
          label="DIG · arm bias"
          value={hii.dig.armBias}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchDig({ armBias: v })}
          path="fieldTuning.hii.dig.armBias"
          info="Fraction of DIG complexes seeded on an arm's lane (following the arm's own flux) rather than CDF-sampled from the SF map's oldActivity channel."
        />
        <ParamSlider
          label="DIG · elongation"
          value={hii.dig.elongation}
          min={1}
          max={8}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patchDig({ elongation: v })}
          path="fieldTuning.hii.dig.elongation"
          info="Aspect ratio of a complex's child scatter along vs. across its local flow direction, area-preserving so the complex stretches without also inflating."
        />
        <ParamSlider
          label="DIG · coherence"
          value={hii.dig.coherence}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchDig({ coherence: v })}
          path="fieldTuning.hii.dig.coherence"
          info="How strictly a complex's scatter axis follows its local flow direction — 1 follows it exactly, 0 rotates it to a fresh random direction per complex."
        />
        <ParamSlider
          label="Assoc · brightness"
          value={hii.associations.brightness}
          min={0}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchAssociations({ brightness: v })}
          path="fieldTuning.hii.associations.brightness"
          info="Blue OB-association tier's flux multiplier, in the embedded cluster's own stellar-continuum currency — the exposed population left once a region's gas is expelled and its shell fades. 0 skips the tier."
        />
        <ParamSlider
          label="Assoc · complexes"
          value={hii.associations.complexes}
          min={0}
          max={180}
          step={1}
          format={(v) => v.toFixed(0)}
          onChange={(v) => patchAssociations({ complexes: v })}
          path="fieldTuning.hii.associations.complexes"
          info="Number of association complex seeds. Total blob count is complexes x children."
        />
        <ParamSlider
          label="Assoc · children"
          value={hii.associations.childrenPerComplex}
          min={1}
          max={10}
          step={1}
          format={(v) => v.toFixed(0)}
          onChange={(v) => patchAssociations({ childrenPerComplex: v })}
          path="fieldTuning.hii.associations.childrenPerComplex"
          info="Blobs scattered around each association complex seed."
        />
        <ParamSlider
          label="Assoc · arm bias"
          value={hii.associations.armBias}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchAssociations({ armBias: v })}
          path="fieldTuning.hii.associations.armBias"
          info="Fraction of complexes seeded on an arm's lane, offset downstream of the ridge, rather than CDF-sampled from the SF map's swept-past density."
        />
        <ParamSlider
          label="Assoc · elongation"
          value={hii.associations.elongation}
          min={1}
          max={8}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patchAssociations({ elongation: v })}
          path="fieldTuning.hii.associations.elongation"
          info="Aspect ratio of a complex's child scatter along vs. across its local flow direction, area-preserving so the complex stretches without also inflating."
        />
        <ParamSlider
          label="Assoc · coherence"
          value={hii.associations.coherence}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchAssociations({ coherence: v })}
          path="fieldTuning.hii.associations.coherence"
          info="How strictly a complex's scatter axis follows its local flow direction — 1 follows it exactly, 0 rotates it to a fresh random direction per complex."
        />
      </div>
    </CollapsibleSection>
  );
}

export default HiiSection;
