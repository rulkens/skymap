/**
 * DustCloudSection — the volumetric particle cloud
 * (`GalaxyFieldTuning.dust.cloud`, thousands of small GMC-scale Gaussians
 * giving the dust clumpy, parallaxing depth) — the galaxy's ONLY dust tier.
 * Same nested-patch idiom as `DustSection`: `fieldTuning.dust.cloud` needs
 * its own spreading handler rather than the generic single-value slider
 * path. The header pill is `render.dustCloudEnabled` (`ControlsPanel` owns
 * the dispatch, `DustSection`'s `render.legacyDustEnabled` pattern) rather
 * than `fieldTuning.dust.enabled` — the cloud is an A/B lever against the
 * legacy sprite dust, not a sub-toggle of the master dust pill.
 */
import type { ReactNode } from 'react';
import type { GalaxyDustCloudParams } from '../../../../../src/@types/galaxy/GalaxyDustCloudParams';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { renderPatched } from '../../state/slices/renderSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './DustCloudSection.module.css';

function DustCloudSection(): ReactNode {
  const dispatch = useAppDispatch();
  const dust = useAppSelector((state) => state.fieldTuning.dust);
  const render = useAppSelector((state) => state.render);
  const open = useAppSelector((state) => state.ui.openSections.dustCloud);
  const cloud = dust.cloud;

  const patchCloud = (patch: Partial<GalaxyDustCloudParams>): void => {
    dispatch(fieldTuningPatched({ dust: { ...dust, cloud: { ...cloud, ...patch } } }));
  };

  return (
    <CollapsibleSection
      title="DUST CLOUD"
      open={open}
      onToggle={() => dispatch(sectionToggled('dustCloud'))}
      headerToggle={render.dustCloudEnabled}
      onHeaderToggleChange={(value) => dispatch(renderPatched({ dustCloudEnabled: value }))}
      copyPayload={{
        fieldTuning: { dust: { cloud } },
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
          path="fieldTuning.dust.cloud.count"
          info="Particle budget for the volumetric dust cloud. 0 disables it."
        />
        <ParamSlider
          label="Size floor (pc)"
          value={cloud.sizeFloorPc}
          min={15}
          max={120}
          step={5}
          format={(v) => v.toFixed(0)}
          onChange={(v) => patchCloud({ sizeFloorPc: v })}
          path="fieldTuning.dust.cloud.sizeFloorPc"
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
          path="fieldTuning.dust.cloud.sizeScale"
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
          path="fieldTuning.dust.cloud.elongation"
          info="sigma_along / sigma_across at full filament coherence — map-seeded clouds run round (coherence 0) up to this aspect (coherence 1), area-preserving."
        />
        <ParamSlider
          label="Height ratio"
          value={cloud.heightRatio}
          min={0.1}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ heightRatio: v })}
          path="fieldTuning.dust.cloud.heightRatio"
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
          path="fieldTuning.dust.cloud.texture"
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
          path="fieldTuning.dust.cloud.textureScale"
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
          path="fieldTuning.dust.cloud.textureContrast"
          info="Shapes the noise about its midpoint, so higher values harden filament edges while leaving the mean — and the tier's share of the optical depth — unchanged."
        />
        <ParamSlider
          label="Map detail"
          value={cloud.mapDetail}
          min={0}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ mapDetail: v })}
          path="fieldTuning.dust.cloud.mapDetail"
          info="S4: modulates each cloud's column by the ISM map's detail ratio at accumulation, per splat (parallax-correct, column-preserving vertical noise breakup). 0 disables the path entirely; 1 = full ratio."
        />
        <ParamSlider
          label="Placement cap"
          value={cloud.dustPlacementCap}
          min={0}
          max={20}
          step={0.25}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ dustPlacementCap: v })}
          path="fieldTuning.dust.cloud.dustPlacementCap"
          info="Caps how much more likely the densest texel in a ring is vs that ring's own mean; 0 = uncapped. Never touches the radial dust profile — only redistributes mass within a ring."
        />
        <ParamSlider
          label="Carve"
          value={cloud.carve}
          min={0}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ carve: v })}
          path="fieldTuning.dust.cloud.carve"
          info="Carves a sharp, fractal edge into each cloud's silhouette instead of only eroding its interior. 0 disables it; higher removes mass as the cutoff bites deeper."
        />
        <ParamSlider
          label="Carve sharpness"
          value={cloud.carveSharpness}
          min={0}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchCloud({ carveSharpness: v })}
          path="fieldTuning.dust.cloud.carveSharpness"
          info="Shapes the carved edge's transition: 0 is a soft, gradual fade, 1 a crisp, hard cutoff."
        />
        <ParamSlider
          label="Carve stretch"
          value={cloud.carveStretch}
          min={1}
          max={6}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patchCloud({ carveStretch: v })}
          path="fieldTuning.dust.cloud.carveStretch"
          info="Elongates the carved/eroded features along the disc's local rotation direction, for wispy rather than round wisps. 1 = isotropic."
        />
      </div>
    </CollapsibleSection>
  );
}

export default DustCloudSection;
