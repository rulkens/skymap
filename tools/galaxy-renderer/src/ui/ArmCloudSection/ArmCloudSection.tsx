/**
 * ArmCloudSection — the arm ridge's stochastic sprite twin
 * (`src/services/engine/galaxyGenerator/v2/armParticleCloud.ts`): thousands of small Gaussian
 * sprites scattered along the same log-spiral ridge `ArmFieldSection`'s
 * deterministic blobs sit on. Its own section, own header pill
 * (`fieldTuning.arms.cloud.enabled`), same idiom as `DustCloudSection` — the
 * cloud is a sub-tier of the arm excess, not a settings drawer folded into
 * the ridge's own section.
 */
import type { ReactNode } from 'react';
import type { GalaxyArmCloudTuning } from '../../../../../src/@types/galaxy/GalaxyArmCloudTuning';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './ArmCloudSection.module.css';

function ArmCloudSection(): ReactNode {
  const dispatch = useAppDispatch();
  const arms = useAppSelector((state) => state.fieldTuning.arms);
  const open = useAppSelector((state) => state.ui.openSections.armCloud);
  const cloud = arms.cloud;

  const patchCloud = (patch: Partial<GalaxyArmCloudTuning>): void => {
    dispatch(fieldTuningPatched({ arms: { ...arms, cloud: { ...cloud, ...patch } } }));
  };

  return (
    <CollapsibleSection
      title="ARM CLOUD"
      open={open}
      onToggle={() => dispatch(sectionToggled('armCloud'))}
      headerToggle={cloud.enabled}
      onHeaderToggleChange={(value) => patchCloud({ enabled: value })}
      copyPayload={{ fieldTuning: { arms: { cloud } } }}
    >
      <div className={styles.root}>
        <ParamSlider
          label="Cloud share"
          value={cloud.share}
          min={0}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ share: v })}
          path="fieldTuning.arms.cloud.share"
          info="Fraction of the arm excess carried by stochastic sprites instead of the deterministic ridge chain. The two totals always sum to the same excess."
        />
        <ParamSlider
          label="Coverage"
          value={cloud.coverage}
          min={0.2}
          max={12}
          step={0.1}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ coverage: v })}
          path="fieldTuning.arms.cloud.coverage"
          info="Sprite count is DERIVED from arm length, width and pitch, not a fixed budget — this scales that derived count. 1 is one sprite-footprint per unit arm area. Clumpiness piles the sprites into complexes, so with it above 0 the setting that actually FILLS an arm is several times higher."
        />
        <ParamSlider
          label="Radial bias"
          value={cloud.radialBias}
          min={0}
          max={3}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patchCloud({ radialBias: v })}
          path="fieldTuning.arms.cloud.radialBias"
          info="Pushes sprites outward along the arm — 0 spends them by coverage demand, which crowds the inner arm where they are small and lost under the bulge. Brightness-neutral: the extra outer sprites split the same light and stay dim. At the top of the slider that neutrality frays and the tier's light creeps back inward."
        />
        <ParamSlider
          label="Clumpiness"
          value={cloud.clumpiness}
          min={0}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ clumpiness: v })}
          path="fieldTuning.arms.cloud.clumpiness"
          info="Hierarchical clustering amplitude — 0 = Poisson-scattered along the ridge, 1 = strongly hierarchical complexes."
        />
        <ParamSlider
          label="Size scale"
          value={cloud.sizeScale}
          min={0.2}
          max={4}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ sizeScale: v })}
          path="fieldTuning.arms.cloud.sizeScale"
          info="Multiplier on each sprite's size draw, itself a fraction of the LOCAL arm width — so this scales with the arm's own flare rather than an absolute parsec span."
        />
        <ParamSlider
          label="Elongation"
          value={cloud.elongation}
          min={1}
          max={8}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patchCloud({ elongation: v })}
          path="fieldTuning.arms.cloud.elongation"
          info="sigma_along / sigma_across — how stretched each sprite is along the arm's own flow."
        />
      </div>
    </CollapsibleSection>
  );
}

export default ArmCloudSection;
