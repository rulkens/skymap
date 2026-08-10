/**
 * HiiSection — the analytic field's HII-region tier (`src/services/engine/galaxyGenerator/v2/hiiRegions.ts`):
 * discrete emission sprites with a limb-brightened shell, an embedded OB
 * cluster core, and a dust cavity they carve into the analytic dust lane.
 * Own section, own header pill (`fieldTuning.hii.enabled`), same idiom as
 * `ArmCloudSection`/`DustCloudSection` — a sub-tier with its own knobs, not
 * a settings drawer folded into FLUX FIELD.
 *
 * SHELLS, DIG and YOUNG STARS nest inside it (`CollapsibleSection`'s
 * `nested` prop) rather than living as top-level siblings the way
 * `armField`/`armCloud` do — the panel was long enough that flattening every
 * shell/DIG/young-stars slider alongside the tier-shared ones read as one
 * endless list. Texture scale/contrast stay in the outer body: their info
 * text says they're shared by all three nested groups, so they read as
 * tier-global rather than owned by any one of them.
 */
import type { ReactNode } from 'react';
import type { GalaxyHiiDigTuning } from '../../../../../src/@types/galaxy/GalaxyHiiDigTuning';
import type { GalaxyHiiShellsTuning } from '../../../../../src/@types/galaxy/GalaxyHiiShellsTuning';
import type { GalaxyHiiTuning } from '../../../../../src/@types/galaxy/GalaxyHiiTuning';
import type { GalaxyStarFormationParams } from '../../../../../src/@types/galaxy/GalaxyStarFormationParams';
import type { GalaxyYoungStarsTuning } from '../../../../../src/@types/galaxy/GalaxyYoungStarsTuning';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './HiiSection.module.css';

function HiiSection(): ReactNode {
  const dispatch = useAppDispatch();
  const hii = useAppSelector((state) => state.fieldTuning.hii);
  const starFormation = useAppSelector((state) => state.fieldTuning.starFormation);
  const open = useAppSelector((state) => state.ui.openSections.hii);
  const shellsOpen = useAppSelector((state) => state.ui.openSections.hiiShells);
  const digOpen = useAppSelector((state) => state.ui.openSections.hiiDig);
  const youngStarsOpen = useAppSelector((state) => state.ui.openSections.hiiYoungStars);

  const patchHii = (patch: Partial<GalaxyHiiTuning>): void => {
    dispatch(fieldTuningPatched({ hii: { ...hii, ...patch } }));
  };

  const patchShells = (patch: Partial<GalaxyHiiShellsTuning>): void => {
    patchHii({ shells: { ...hii.shells, ...patch } });
  };

  const patchDig = (patch: Partial<GalaxyHiiDigTuning>): void => {
    patchHii({ dig: { ...hii.dig, ...patch } });
  };

  const patchYoungStars = (patch: Partial<GalaxyYoungStarsTuning>): void => {
    patchHii({ youngStars: { ...hii.youngStars, ...patch } });
  };

  const patchStarFormation = (patch: Partial<GalaxyStarFormationParams>): void => {
    dispatch(fieldTuningPatched({ starFormation: { ...starFormation, ...patch } }));
  };

  // DIG and YOUNG STARS copy from their OWN nested sections below — this
  // one offers only the core knobs its own sliders drive, same split
  // `ArmFieldSection` uses to keep `cloud` out of its own payload.
  const { dig: _dig, youngStars: _youngStars, ...core } = hii;

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
        {/* Tier-global: shared by SHELLS, DIG and YOUNG STARS alike, so they
            stay in the outer body rather than owned by any one of the three
            nested groups below. */}
        <ParamSlider
          label="Master brightness"
          value={hii.brightness}
          min={0}
          max={4}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchHii({ brightness: v })}
          path="fieldTuning.hii.brightness"
          info="Whole-field flux multiplier — multiplies EVERY tier's own gain (the Brightness sliders inside SHELLS, DIG and YOUNG STARS below), rather than being any one tier's own knob. 1 is the calibrated default; each tier's own slider then scales its share up or down from there."
        />
        <ParamSlider
          label="Texture scale"
          value={hii.shells.textureScale}
          min={0.25}
          max={8}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchShells({ textureScale: v })}
          path="fieldTuning.hii.shells.textureScale"
          info="Shared by every HII group (shells, DIG, young stars). Multiplies the noise sample's frequency relative to the dust volume's own tile size — 1 samples at the SAME scale dust erosion does. Range extended past 4 for the young-stars tier's bigger splats, which need a higher frequency to still read as grainy unresolved stars rather than a soft blur."
        />
        <ParamSlider
          label="Texture contrast"
          value={hii.shells.textureContrast}
          min={0}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchShells({ textureContrast: v })}
          path="fieldTuning.hii.shells.textureContrast"
          info="Shared by every HII group. Shapes the noise modulation about its own midpoint, mirroring the dust cloud's own contrast knob."
        />
      </div>
      <CollapsibleSection
        title="SHELLS"
        open={shellsOpen}
        onToggle={() => dispatch(sectionToggled('hiiShells'))}
        headerToggle={hii.shells.enabled}
        onHeaderToggleChange={(value) => patchShells({ enabled: value })}
        nested
      >
        <div className={styles.root}>
          <ParamSlider
            label="Brightness"
            value={hii.shells.brightness}
            min={0}
            max={2}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchShells({ brightness: v })}
            path="fieldTuning.hii.shells.brightness"
            info="This tier's own gain, multiplied against the Master brightness above — 1 leaves it at whatever the master alone gives it."
          />
          <ParamSlider
            label="Radius scale"
            value={hii.shells.radiusScale}
            min={0.2}
            max={3}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchShells({ radiusScale: v })}
            path="fieldTuning.hii.shells.radiusScale"
            info="Multiplies the Strömgren radius each region is drawn at: bigger, softer shells above 1, smaller and more concentrated below. 1 is the law exactly."
          />
          <ParamSlider
            label="Shell thickness"
            value={hii.shells.shellThickness}
            min={0.02}
            max={1}
            step={0.02}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchShells({ shellThickness: v })}
            path="fieldTuning.hii.shells.shellThickness"
            info="Radial scatter of a region's shell sprites, as a fraction of its radius. Small values give a thin, sharply limb-brightened front."
          />
          <ParamSlider
            label="Cluster strength"
            value={hii.shells.clusterStrength}
            min={0}
            max={2}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchShells({ clusterStrength: v })}
            path="fieldTuning.hii.shells.clusterStrength"
            info="Brightness of the embedded OB cluster at each region's centre; 0 leaves a hollow shell."
          />
          <ParamSlider
            label="Cavity scale"
            value={hii.shells.cavityScale}
            min={0}
            max={2}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchShells({ cavityScale: v })}
            path="fieldTuning.hii.shells.cavityScale"
            info="Radius of the dust cavity a young event carves, as a fraction of its own HII radius. 0 leaves the dust undisturbed."
          />
          <ParamSlider
            label="Map seeding"
            value={hii.ismMapSeeding}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchHii({ ismMapSeeding: v })}
            path="fieldTuning.hii.ismMapSeeding"
            info="Fraction of HII events placed from the ISM map's activity channel instead of the arm-ridge catalog. Ignition zeroes gas and age together, so map-seeded knots sit in dust-free pockets (the observed decorrelation). 0 = catalog placement exactly."
          />
          <ParamSlider
            label="Texture"
            value={hii.shells.texture}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchShells({ texture: v })}
            path="fieldTuning.hii.shells.texture"
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
            path="fieldTuning.starFormation.sfActivity"
            info="Fallback event-catalog rate — sizes the HII tier only when the ISM generator is 'automaton' or 'none'. The fluid generator ignores it: its regions come from the sim's own events."
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
            label="Brightness"
            value={hii.dig.brightness}
            min={0}
            max={2}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchDig({ brightness: v })}
            path="fieldTuning.hii.dig.brightness"
            info="This tier's own gain, multiplied against the Master brightness above — distinct from Flux fraction below, which SPLITS flux out of the shell tier's own total rather than scaling DIG's resulting share."
          />
          <ParamSlider
            label="Flux fraction"
            value={hii.dig.fraction}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchDig({ fraction: v })}
            path="fieldTuning.hii.dig.fraction"
            info="Diffuse ionized gas (DIG) veil's fraction of this tier's total Hα — observationally 30-50% of a galaxy's Hα sits outside HII regions entirely, a faint haze tracing the arms around the knots. Needs an ISM map; 0 skips the veil."
          />
          <ParamSlider
            label="Population"
            value={hii.dig.complexes}
            min={0}
            max={3}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchDig({ complexes: v })}
            path="fieldTuning.hii.dig.complexes"
            info="Scaler on the run's own recent star-formation activity — the veil's complex count is now DERIVED from how much SF the current run produced, not a fixed number. 1 is the neutral default; total blob count is the derived complex count x children."
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
            info="Fraction of DIG complexes seeded on an arm's lane (following the arm's own flux) rather than CDF-sampled from the ISM map's activity channel."
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
        title="YOUNG STARS"
        open={youngStarsOpen}
        onToggle={() => dispatch(sectionToggled('hiiYoungStars'))}
        headerToggle={hii.youngStars.enabled}
        onHeaderToggleChange={(value) => patchYoungStars({ enabled: value })}
        copyPayload={{ fieldTuning: { hii: { youngStars: hii.youngStars } } }}
        nested
      >
        <div className={styles.root}>
          <ParamSlider
            label="Brightness"
            value={hii.youngStars.brightness}
            min={0}
            max={20}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchYoungStars({ brightness: v })}
            path="fieldTuning.hii.youngStars.brightness"
            info="This tier's total flux — the ONE flux knob for the arm-ridge chain. 0 skips the tier."
          />
          <ParamSlider
            label="Width"
            value={hii.youngStars.width}
            min={0.2}
            max={3}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchYoungStars({ width: v })}
            path="fieldTuning.hii.youngStars.width"
            info="Chain ribbon's across-arm sigma, as a fraction of the arm ridge's own measured width law. 1 is that law exactly."
          />
          <ParamSlider
            label="Edge bias"
            value={hii.youngStars.edgeBias}
            min={0}
            max={3}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchYoungStars({ edgeBias: v })}
            path="fieldTuning.hii.youngStars.edgeBias"
            info="Pushes the tier's fixed total flux outward along the arms. 0 = flat (surface brightness falls ~1/r outward), ~2 = outer arms dominate (the M74-reference look)."
          />
          <ParamSlider
            label="Clumping"
            value={hii.youngStars.mapDepth}
            min={0}
            max={1}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchYoungStars({ mapDepth: v })}
            path="fieldTuning.hii.youngStars.mapDepth"
            info="0 = a smooth ribbon along the ridge, 1 = fully modulated by the ISM map's stars tracer — the fluid-advected clumps the chain rides."
          />
          <ParamSlider
            label="Contrast"
            value={hii.youngStars.contrast}
            min={0.25}
            max={4}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchYoungStars({ contrast: v })}
            path="fieldTuning.hii.youngStars.contrast"
            info="Gamma shaping the stars-map read — flux-neutral, mean-normalized so it restructures the clump contrast without draining the tier's total brightness."
          />
          <ParamSlider
            label="Texture"
            value={hii.youngStars.texture}
            min={0}
            max={2}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchYoungStars({ texture: v })}
            path="fieldTuning.hii.youngStars.texture"
            info="This tier's own share of the HII tier's shared texture breakup — independent of the shell tier's own Texture knob above."
          />
        </div>
      </CollapsibleSection>
    </CollapsibleSection>
  );
}

export default HiiSection;
