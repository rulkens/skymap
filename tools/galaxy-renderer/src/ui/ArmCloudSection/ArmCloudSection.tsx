/**
 * ArmCloudSection — the arm ridge's stochastic sprite twin
 * (`src/data/galaxy/armParticleCloud.ts`): thousands of small Gaussian
 * sprites scattered along the same log-spiral ridge `ArmFieldSection`'s
 * deterministic blobs sit on. Its own section, own header pill
 * (`fieldTuning.armCloudEnabled`), same idiom as `DustCloudSection` — the
 * cloud is a sub-tier of the arm excess, not a settings drawer folded into
 * the ridge's own section.
 */
import type { ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './ArmCloudSection.module.css';

function ArmCloudSection(): ReactNode {
  const dispatch = useAppDispatch();
  const fieldTuning = useAppSelector((state) => state.fieldTuning);
  const open = useAppSelector((state) => state.ui.openSections.armCloud);

  return (
    <CollapsibleSection
      title="ARM CLOUD"
      open={open}
      onToggle={() => dispatch(sectionToggled('armCloud'))}
      headerToggle={fieldTuning.armCloudEnabled}
      onHeaderToggleChange={(value) => dispatch(fieldTuningPatched({ armCloudEnabled: value }))}
    >
      <div className={styles.root}>
        <ParamSlider
          label="Cloud share"
          value={fieldTuning.armCloudShare}
          min={0}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ armCloudShare: v }))}
          info="Fraction of the arm excess carried by stochastic sprites instead of the deterministic ridge chain. The two totals always sum to the same excess."
        />
        <ParamSlider
          label="Coverage"
          value={fieldTuning.armCloudCoverage}
          min={0.2}
          max={12}
          step={0.1}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ armCloudCoverage: v }))}
          info="Sprite count is DERIVED from arm length, width and pitch, not a fixed budget — this scales that derived count. 1 is one sprite-footprint per unit arm area if the sprites were scattered independently; clumpiness piles them into complexes instead, so the setting that actually FILLS an arm is several times higher."
        />
        <ParamSlider
          label="Radial bias"
          value={fieldTuning.armCloudRadialBias}
          min={0}
          max={3}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => dispatch(fieldTuningPatched({ armCloudRadialBias: v }))}
          info="Pushes sprites outward along the arm — 0 spends them by coverage demand, which crowds the inner arm where they are small and lost under the bulge. Brightness-neutral: the tier's radial light profile does not move, so the extra outer sprites split the same light and stay dim."
        />
        <ParamSlider
          label="Clumpiness"
          value={fieldTuning.armCloudClumpiness}
          min={0}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ armCloudClumpiness: v }))}
          info="Hierarchical clustering amplitude — 0 = Poisson-scattered along the ridge, 1 = strongly hierarchical complexes."
        />
        <ParamSlider
          label="Size scale"
          value={fieldTuning.armCloudSizeScale}
          min={0.2}
          max={4}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ armCloudSizeScale: v }))}
          info="Multiplier on each sprite's size draw, itself a fraction of the LOCAL arm width — so this scales with the arm's own flare rather than an absolute parsec span."
        />
        <ParamSlider
          label="Elongation"
          value={fieldTuning.armCloudElongation}
          min={1}
          max={8}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => dispatch(fieldTuningPatched({ armCloudElongation: v }))}
          info="sigma_along / sigma_across — how stretched each sprite is along the arm's own flow."
        />
      </div>
    </CollapsibleSection>
  );
}

export default ArmCloudSection;
