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

// `clumpiness` has no UI surface — no slider below reaches it.
type CloudSliderKey = Exclude<keyof GalaxyDustCloudParams, 'clumpiness'>;

type CloudSliderSpec = {
  readonly key: CloudSliderKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly info: string;
  /** `count` is the only field an `<input type=range>` can drift fractional on; rounded defensively. */
  readonly round?: boolean;
};

const roundedCount = (v: number): string => String(Math.round(v));

const DUST_CLOUD_SLIDERS: readonly CloudSliderSpec[] = [
  {
    key: 'count',
    label: 'Particle count',
    min: 0,
    max: 40000,
    step: 500,
    format: roundedCount,
    round: true,
    info: 'Particle budget for the volumetric dust cloud. 0 disables it.',
  },
  {
    key: 'sizeFloorPc',
    label: 'Size floor (pc)',
    min: 15,
    max: 120,
    step: 5,
    format: (v) => v.toFixed(0),
    info: 'Low end of the GMC size sampler. Measured clouds start at 15 pc; raising it trades per-cloud darkness for coverage, since the total column is renormalised.',
  },
  {
    key: 'sizeScale',
    label: 'Size scale',
    min: 0.2,
    max: 4,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: 'Multiplier on the GMC size range each particle is drawn from.',
  },
  {
    key: 'elongation',
    label: 'Elongation',
    min: 1,
    max: 8,
    step: 0.1,
    format: (v) => v.toFixed(1),
    info: 'sigma_along / sigma_across at full filament coherence — map-seeded clouds run round (coherence 0) up to this aspect (coherence 1), area-preserving.',
  },
  {
    key: 'heightRatio',
    label: 'Height ratio',
    min: 0.1,
    max: 2,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Cloud layer sigma_z as a ratio of the flat dust layer's own sigma_z.",
  },
  {
    key: 'texture',
    label: 'Texture erosion',
    min: 0,
    max: 1.5,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: '0 = smooth analytic ellipsoids, higher = clouds eroded into wispy filaments by the baked noise volume.',
  },
  {
    key: 'textureScale',
    label: 'Texture scale',
    min: 0.25,
    max: 4,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Multiplier on the noise volume's world-space tile size.",
  },
  {
    key: 'textureContrast',
    label: 'Texture contrast',
    min: 0.25,
    max: 4,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Shapes the noise about its midpoint, so higher values harden filament edges while leaving the mean — and the tier's share of the optical depth — unchanged.",
  },
  {
    key: 'mapDetail',
    label: 'Map detail',
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "S4: modulates each cloud's column by the ISM map's detail ratio at accumulation, per splat (parallax-correct, column-preserving vertical noise breakup). 0 disables the path entirely; 1 = full ratio.",
  },
  {
    key: 'dustPlacementCap',
    label: 'Placement cap',
    min: 0,
    max: 20,
    step: 0.25,
    format: (v) => v.toFixed(2),
    info: "Caps how much more likely the densest texel in a ring is vs that ring's own mean; 0 = uncapped. Never touches the radial dust profile — only redistributes mass within a ring.",
  },
  {
    key: 'carve',
    label: 'Carve',
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Depth of the bite noise takes out of each cloud's silhouette, inward from an invisible outer boundary. 0 disables it; 1 lets full-noise bites reach the core. Removes mass as the bite deepens.",
  },
  {
    key: 'carveSharpness',
    label: 'Carve sharpness',
    min: 0,
    max: 1,
    step: 0.02,
    format: (v) => v.toFixed(2),
    info: 'Width of the carved edge: 0 is a soft ~0.9 sigma fade, 1 a crisp ~0.06 sigma cutoff.',
  },
  {
    key: 'carveStretch',
    label: 'Carve stretch',
    min: 1,
    max: 6,
    step: 0.1,
    format: (v) => v.toFixed(1),
    info: "Elongates the carved/eroded features along the disc's local rotation direction, for wispy rather than round wisps. 1 = isotropic.",
  },
];

function DustCloudSection(): ReactNode {
  const dispatch = useAppDispatch();
  const dust = useAppSelector((state) => state.fieldTuning.dust);
  const render = useAppSelector((state) => state.render);
  const open = useAppSelector((state) => state.ui.openSections.dustCloud);
  const cloud = dust.cloud;

  const patchCloud = (patch: Partial<GalaxyDustCloudParams>): void => {
    dispatch(fieldTuningPatched({ dust: { ...dust, cloud: { ...cloud, ...patch } } }));
  };

  const renderCloudSlider = (spec: CloudSliderSpec): ReactNode => (
    <ParamSlider
      key={spec.key}
      label={spec.label}
      value={cloud[spec.key]}
      min={spec.min}
      max={spec.max}
      step={spec.step}
      format={spec.format}
      onChange={(v) =>
        patchCloud({ [spec.key]: spec.round ? Math.round(v) : v } as Partial<GalaxyDustCloudParams>)
      }
      path={`fieldTuning.dust.cloud.${spec.key}`}
      info={spec.info}
    />
  );

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
      <div className={styles.root}>{DUST_CLOUD_SLIDERS.map(renderCloudSlider)}</div>
    </CollapsibleSection>
  );
}

export default DustCloudSection;
