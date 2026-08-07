/**
 * SpursSection — interarm spurs/feathers
 * (`src/services/engine/galaxyGenerator/v2/armSpurGeometry.ts` +
 * `armSpurParticleCloud.ts`): short sprite feathers rooted along each arm at
 * quasi-regular intervals, filling the interarm gap the ridge chain and the
 * arm cloud both leave empty at larger radii. Own section, own header pill
 * (`fieldTuning.arms.spurs.enabled`), the `ArmCloudSection` idiom — a sub-tier
 * of the arm excess, not a settings drawer folded into ARM CLOUD's own body.
 */
import type { ReactNode } from 'react';
import type { GalaxyArmSpurTuning } from '../../../../../src/@types/galaxy/GalaxyArmSpurTuning';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './SpursSection.module.css';

function SpursSection(): ReactNode {
  const dispatch = useAppDispatch();
  const arms = useAppSelector((state) => state.fieldTuning.arms);
  const open = useAppSelector((state) => state.ui.openSections.armSpurs);
  const spurs = arms.spurs;

  const patchSpurs = (patch: Partial<GalaxyArmSpurTuning>): void => {
    dispatch(fieldTuningPatched({ arms: { ...arms, spurs: { ...spurs, ...patch } } }));
  };

  return (
    <CollapsibleSection
      title="SPURS"
      open={open}
      onToggle={() => dispatch(sectionToggled('armSpurs'))}
      headerToggle={spurs.enabled}
      onHeaderToggleChange={(value) => patchSpurs({ enabled: value })}
      copyPayload={{ fieldTuning: { arms: { spurs } } }}
    >
      <div className={styles.root}>
        <ParamSlider
          label="Share"
          value={spurs.share}
          min={0}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchSpurs({ share: v })}
          path="fieldTuning.arms.spurs.share"
          info="Fraction of the arm excess carried by spur sprites instead of the ridge chain. Clamped jointly with Cloud share so the two tiers never draw more than the ridge's total excess between them."
        />
        <ParamSlider
          label="Spacing"
          value={spurs.spacing}
          min={0.2}
          max={3}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchSpurs({ spacing: v })}
          path="fieldTuning.arms.spurs.spacing"
          info="Multiplier on the root-to-root spacing law (La Vigne, Vogel & Ostriker 2006's 300-800 pc feather spacing, re-expressed in disc-scale-length units and growing with radius). 1 is that law exactly."
        />
        <ParamSlider
          label="Pitch ratio"
          value={spurs.pitchRatio}
          min={1}
          max={3}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchSpurs({ pitchRatio: v })}
          path="fieldTuning.arms.spurs.pitchRatio"
          info="A spur's pitch is the parent arm's own pitch times this — feathers wind tighter than the arm they branch from (Kim & Ostriker 2002/2006's spiral-shock instability). 1 would trace the parent arm itself."
        />
        <ParamSlider
          label="Length frac"
          value={spurs.lengthFrac}
          min={0.1}
          max={1.5}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchSpurs({ lengthFrac: v })}
          path="fieldTuning.arms.spurs.lengthFrac"
          info="A spur's own fade radius, as a fraction of the local root spacing beyond its root. Short is a stub feather; toward the top it approaches bridging the whole interarm gap."
        />
        <ParamSlider
          label="Jitter"
          value={spurs.jitter}
          min={0}
          max={0.6}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchSpurs({ jitter: v })}
          path="fieldTuning.arms.spurs.jitter"
          info="Fractional jitter on the root-to-root spacing draw — 0 is a perfectly regular comb, the default ~0.3 is a quasi-regular one."
        />
        <ParamSlider
          label="Size scale"
          value={spurs.sizeScale}
          min={0.2}
          max={4}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchSpurs({ sizeScale: v })}
          path="fieldTuning.arms.spurs.sizeScale"
          info="Multiplier on each sprite's size draw, itself a fraction of the LOCAL arm width — mirrors Arm cloud's own Size scale."
        />
        <ParamSlider
          label="Elongation"
          value={spurs.elongation}
          min={1}
          max={8}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patchSpurs({ elongation: v })}
          path="fieldTuning.arms.spurs.elongation"
          info="sigma_along / sigma_across — how stretched each sprite is along its own spur."
        />
        <ParamSlider
          label="Gas weight"
          value={spurs.gasWeight}
          min={0}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchSpurs({ gasWeight: v })}
          path="fieldTuning.arms.spurs.gasWeight"
          info="How strongly a spur forces the ISM map's gas, against its parent arm's own forcing (0 = spurs don't feed the map, 1 = as strongly as the arm they branch from). Feeds dust, star-formation events and HII placement along the spurs, not just their sprites."
        />
      </div>
    </CollapsibleSection>
  );
}

export default SpursSection;
