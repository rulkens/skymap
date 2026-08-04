/**
 * DustCloudSection — the volumetric particle cloud (`GalaxyParams.dust.cloud`,
 * thousands of small GMC-scale Gaussians giving the dust clumpy, parallaxing
 * depth) — the galaxy's ONLY dust tier. Same nested-patch idiom as
 * `DustSection`: `params.dust.cloud` needs
 * its own spreading handler rather than the generic single-value slider
 * path. The header pill is `render.dustCloudEnabled` (`ControlsPanel` owns
 * the dispatch, `DustSection`'s `render.legacyDustEnabled` pattern) rather
 * than `fieldTuning.dust.enabled` — the cloud is an A/B lever against the
 * legacy sprite dust, not a sub-toggle of the master dust pill.
 */
import type { ReactNode } from 'react';
import type { GalaxyDustCloudParams } from '../../../../../src/@types/galaxy/GalaxyDustCloudParams';
import { DEFAULT_GALAXY_DUST_PARAMS } from '../../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyDustParams';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { paramsPatched } from '../../state/slices/galaxySlice';
import { renderPatched } from '../../state/slices/renderSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './DustCloudSection.module.css';

function DustCloudSection(): ReactNode {
  const dispatch = useAppDispatch();
  const galaxy = useAppSelector((state) => state.galaxy);
  const render = useAppSelector((state) => state.render);
  const open = useAppSelector((state) => state.ui.openSections.dustCloud);
  const dust = galaxy.dust ?? DEFAULT_GALAXY_DUST_PARAMS;
  const cloud = dust.cloud;

  const patchCloud = (patch: Partial<GalaxyDustCloudParams>): void => {
    dispatch(paramsPatched({ dust: { ...dust, cloud: { ...cloud, ...patch } } }));
  };

  return (
    <CollapsibleSection
      title="DUST CLOUD"
      open={open}
      onToggle={() => dispatch(sectionToggled('dustCloud'))}
      headerToggle={render.dustCloudEnabled}
      onHeaderToggleChange={(value) => dispatch(renderPatched({ dustCloudEnabled: value }))}
      copyPayload={{
        galaxy: { dust: { cloud } },
        render: { dustCloudEnabled: render.dustCloudEnabled },
      }}
    >
      <div className={styles.root}>
        <ParamSlider
          label="Particle count"
          value={cloud.count}
          min={0}
          max={40000}
          step={500}
          format={(v) => String(Math.round(v))}
          onChange={(v) => patchCloud({ count: Math.round(v) })}
          path="galaxy.dust.cloud.count"
          info="Particle budget for the volumetric dust cloud. 0 disables it."
        />
        <ParamSlider
          label="Clumpiness"
          value={cloud.clumpiness}
          min={0}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ clumpiness: v })}
          path="galaxy.dust.cloud.clumpiness"
          info="Hierarchical clustering amplitude — 0 = Poisson-scattered, 1 = strongly hierarchical."
        />
        <ParamSlider
          label="Size floor (pc)"
          value={cloud.sizeFloorPc}
          min={15}
          max={120}
          step={5}
          format={(v) => v.toFixed(0)}
          onChange={(v) => patchCloud({ sizeFloorPc: v })}
          path="galaxy.dust.cloud.sizeFloorPc"
          info="Low end of the GMC size sampler. Measured clouds start at 15 pc; raising it trades per-cloud darkness for coverage, since the total column is renormalised."
        />
        <ParamSlider
          label="Size scale"
          value={cloud.sizeScale}
          min={0.2}
          max={4}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ sizeScale: v })}
          path="galaxy.dust.cloud.sizeScale"
          info="Multiplier on the GMC size range each particle is drawn from."
        />
        <ParamSlider
          label="Elongation"
          value={cloud.elongation}
          min={1}
          max={8}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patchCloud({ elongation: v })}
          path="galaxy.dust.cloud.elongation"
          info="sigma_along / sigma_across — how stretched each cloud is along its lane."
        />
        <ParamSlider
          label="Height ratio"
          value={cloud.heightRatio}
          min={0.1}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ heightRatio: v })}
          path="galaxy.dust.cloud.heightRatio"
          info="Cloud layer sigma_z as a ratio of the flat dust layer's own sigma_z."
        />
        <ParamSlider
          label="Texture erosion"
          value={cloud.texture}
          min={0}
          max={1.5}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ texture: v })}
          path="galaxy.dust.cloud.texture"
          info="0 = smooth analytic ellipsoids, higher = clouds eroded into wispy filaments by the baked noise volume."
        />
        <ParamSlider
          label="Texture scale"
          value={cloud.textureScale}
          min={0.25}
          max={4}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ textureScale: v })}
          path="galaxy.dust.cloud.textureScale"
          info="Multiplier on the noise volume's world-space tile size."
        />
        <ParamSlider
          label="Texture contrast"
          value={cloud.textureContrast}
          min={0.25}
          max={4}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ textureContrast: v })}
          path="galaxy.dust.cloud.textureContrast"
          info="Shapes the noise about its midpoint, so higher values harden filament edges while leaving the mean — and the tier's share of the optical depth — unchanged."
        />
      </div>
    </CollapsibleSection>
  );
}

export default DustCloudSection;
