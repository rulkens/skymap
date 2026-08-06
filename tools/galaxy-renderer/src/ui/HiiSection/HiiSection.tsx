/**
 * HiiSection — the analytic field's HII-region tier (`src/services/engine/galaxyGenerator/v2/hiiRegions.ts`):
 * discrete emission sprites with a limb-brightened shell, an embedded OB
 * cluster core, and a dust cavity they carve into the analytic dust lane.
 * Own section, own header pill (`fieldTuning.hii.enabled`), same idiom as
 * `ArmCloudSection`/`DustCloudSection` — a sub-tier with its own knobs, not
 * a settings drawer folded into FLUX FIELD.
 *
 * SHELLS, DIG and ASSOCIATIONS nest inside it (`CollapsibleSection`'s
 * `nested` prop) rather than living as top-level siblings the way
 * `armField`/`armCloud` do — the panel was long enough that flattening every
 * shell/DIG/assoc slider alongside the tier-shared ones read as one endless
 * list. Texture scale/contrast stay in the outer body: their info text says
 * they're shared by all three nested groups, so they read as tier-global
 * rather than owned by any one of them.
 */
import type { ReactNode } from 'react';
import type { GalaxyHiiAssociationsTuning } from '../../../../../src/@types/galaxy/GalaxyHiiAssociationsTuning';
import type { GalaxyHiiDigTuning } from '../../../../../src/@types/galaxy/GalaxyHiiDigTuning';
import type { GalaxyHiiTuning } from '../../../../../src/@types/galaxy/GalaxyHiiTuning';
import type { GalaxyStarFormationParams } from '../../../../../src/@types/galaxy/GalaxyStarFormationParams';
import { DEFAULT_GALAXY_STAR_FORMATION_PARAMS } from '../../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyStarFormationParams';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { paramsPatched } from '../../state/slices/galaxySlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './HiiSection.module.css';

function HiiSection(): ReactNode {
  const dispatch = useAppDispatch();
  const hii = useAppSelector((state) => state.fieldTuning.hii);
  const starFormation = useAppSelector(
    (state) => state.galaxy.starFormation ?? DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
  );
  const open = useAppSelector((state) => state.ui.openSections.hii);
  const shellsOpen = useAppSelector((state) => state.ui.openSections.hiiShells);
  const digOpen = useAppSelector((state) => state.ui.openSections.hiiDig);
  const assocOpen = useAppSelector((state) => state.ui.openSections.hiiAssociations);

  const patchHii = (patch: Partial<GalaxyHiiTuning>): void => {
    dispatch(fieldTuningPatched({ hii: { ...hii, ...patch } }));
  };

  const patchDig = (patch: Partial<GalaxyHiiDigTuning>): void => {
    patchHii({ dig: { ...hii.dig, ...patch } });
  };

  const patchAssociations = (patch: Partial<GalaxyHiiAssociationsTuning>): void => {
    patchHii({ associations: { ...hii.associations, ...patch } });
  };

  const patchStarFormation = (patch: Partial<GalaxyStarFormationParams>): void => {
    dispatch(paramsPatched({ starFormation: { ...starFormation, ...patch } }));
  };

  // DIG and ASSOCIATIONS copy from their OWN nested sections below — this
  // one offers only the core knobs its own sliders drive, same split
  // `ArmFieldSection` uses to keep `cloud` out of its own payload.
  const { dig: _dig, associations: _associations, ...core } = hii;

  return (
    <CollapsibleSection
      title="HII REGIONS"
      open={open}
      onToggle={() => dispatch(sectionToggled('hii'))}
      headerToggle={hii.enabled}
      onHeaderToggleChange={(value) => patchHii({ enabled: value })}
      copyPayload={{ fieldTuning: { hii: core } }}
    >
      <div className={styles.root}>
        {/* Tier-global: shared by SHELLS, DIG and ASSOCIATIONS alike, so they
            stay in the outer body rather than owned by any one of the three
            nested groups below. */}
        <ParamSlider
          label="Texture scale"
          value={hii.textureScale}
          min={0.25}
          max={4}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchHii({ textureScale: v })}
          path="fieldTuning.hii.textureScale"
          info="Shared by every HII group (shells, DIG, associations). Multiplies the noise sample's frequency relative to the dust volume's own tile size — 1 samples at the SAME scale dust erosion does."
        />
        <ParamSlider
          label="Texture contrast"
          value={hii.textureContrast}
          min={0}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchHii({ textureContrast: v })}
          path="fieldTuning.hii.textureContrast"
          info="Shared by every HII group. Shapes the noise modulation about its own midpoint, mirroring the dust cloud's own contrast knob."
        />
      </div>
      <CollapsibleSection
        title="SHELLS"
        open={shellsOpen}
        onToggle={() => dispatch(sectionToggled('hiiShells'))}
        nested
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
            label="Texture"
            value={hii.texture}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchHii({ texture: v })}
            path="fieldTuning.hii.texture"
            info="Breaks up the shell + embedded-cluster sprites' circular Gaussian footprint with the same noise volume the dust cloud erodes with. 0 leaves them untouched."
          />
          <ParamSlider
            label="SF activity"
            value={starFormation.sfActivity}
            min={0}
            max={2.5}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchStarFormation({ sfActivity: v })}
            path="galaxy.starFormation.sfActivity"
            info="Fallback event-catalog rate — sizes the HII tier only when the ISM/SF-map generator is 'automaton' or 'none'. The fluid generator ignores it: its regions come from the sim's own events."
          />
        </div>
      </CollapsibleSection>
      <CollapsibleSection
        title="DIG"
        open={digOpen}
        onToggle={() => dispatch(sectionToggled('hiiDig'))}
        copyPayload={{ fieldTuning: { hii: { dig: hii.dig } } }}
        nested
      >
        <div className={styles.root}>
          <ParamSlider
            label="Flux fraction"
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
            label="Complexes"
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
            label="Children"
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
            label="Arm bias"
            value={hii.dig.armBias}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchDig({ armBias: v })}
            path="fieldTuning.hii.dig.armBias"
            info="Fraction of DIG complexes seeded on an arm's lane (following the arm's own flux) rather than CDF-sampled from the SF map's activity channel."
          />
          <ParamSlider
            label="Elongation"
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
            label="Coherence"
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
            label="Texture"
            value={hii.dig.texture}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchDig({ texture: v })}
            path="fieldTuning.hii.dig.texture"
            info="This veil's own share of the HII tier's shared texture breakup — independent of the shell tier's own Texture knob above."
          />
        </div>
      </CollapsibleSection>
      <CollapsibleSection
        title="ASSOCIATIONS"
        open={assocOpen}
        onToggle={() => dispatch(sectionToggled('hiiAssociations'))}
        copyPayload={{ fieldTuning: { hii: { associations: hii.associations } } }}
        nested
      >
        <div className={styles.root}>
          <ParamSlider
            label="Brightness"
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
            label="Complexes"
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
            label="Children"
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
            label="Arm bias"
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
            label="Elongation"
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
            label="Coherence"
            value={hii.associations.coherence}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchAssociations({ coherence: v })}
            path="fieldTuning.hii.associations.coherence"
            info="How strictly a complex's scatter axis follows its local flow direction — 1 follows it exactly, 0 rotates it to a fresh random direction per complex."
          />
          <ParamSlider
            label="Texture"
            value={hii.associations.texture}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchAssociations({ texture: v })}
            path="fieldTuning.hii.associations.texture"
            info="This tier's own share of the HII tier's shared texture breakup — independent of the shell tier's own Texture knob above."
          />
        </div>
      </CollapsibleSection>
    </CollapsibleSection>
  );
}

export default HiiSection;
