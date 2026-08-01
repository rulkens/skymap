/**
 * DustCloudSection — the volumetric particle cloud layered on the flat dust
 * lane (`GalaxyParams.dust.cloud`, thousands of small GMC-scale Gaussians
 * replacing flat parametric detail with clumpy, parallaxing dust). Same
 * nested-patch idiom as `DustNetworkSection`: `params.dust.cloud` needs its
 * own spreading handler rather than the generic single-value slider path.
 * The header pill is `render.dustCloudEnabled` (`ControlsPanel` owns the
 * dispatch, `DustSection`'s `render.legacyDustEnabled` pattern) rather than
 * `fieldTuning.dustEnabled` — the cloud is an A/B lever against the older
 * dust tiers, not a sub-toggle of the master dust pill.
 */
import type { ReactNode } from 'react';
import type { GalaxyDustCloudParams } from '../../../../../src/@types/galaxy/GalaxyDustCloudParams';
import { DEFAULT_GALAXY_DUST_PARAMS } from '../../../../../src/data/galaxy/defaultGalaxyDustParams';
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
          info="Particle budget for the volumetric dust cloud. 0 disables it."
        />
        <ParamSlider
          label="Cloud share"
          value={cloud.share}
          min={0}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ share: v })}
          info="Fraction of the total optical depth carried by particles vs the flat lane."
        />
        <ParamSlider
          label="Arm bias"
          value={cloud.armBias}
          min={0}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ armBias: v })}
          info="0 = seeded uniformly over the smooth disc, 1 = seeded on the arm lanes."
        />
        <ParamSlider
          label="Clumpiness"
          value={cloud.clumpiness}
          min={0}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ clumpiness: v })}
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
          info="Cloud layer sigma_z as a ratio of the flat dust layer's own sigma_z."
        />
        <ParamSlider
          label="Bubble carve"
          value={cloud.bubbleCarve}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ bubbleCarve: v })}
          info="0 = clouds ignore star-forming bubbles, 1 = fully swept out of them."
        />
        <ParamSlider
          label="Texture erosion"
          value={cloud.texture}
          min={0}
          max={1.5}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ texture: v })}
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
          info="Multiplier on the noise volume's world-space tile size."
        />
      </div>
    </CollapsibleSection>
  );
}

export default DustCloudSection;
