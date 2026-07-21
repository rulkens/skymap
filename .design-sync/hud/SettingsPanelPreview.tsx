/**
 * SettingsPanelPreview — the store-free composite of skymap's real SettingsPanel,
 * for the design-sync bundle.
 *
 * This is scratch tooling, NOT repo src: the one-component-per-file /
 * create-component conventions do not apply here. It imports the REAL
 * presentational section components (the ones that take plain props and reach
 * into no store) and wires every value with local `useState`, replacing the
 * `*Container` store boundary. The result renders the exact section order and
 * Panel chrome of `SettingsPanel.tsx`, and every toggle/slider/dropdown actually
 * moves because each is backed by a `useState` cell here.
 */

import { useState } from 'react';

import { Panel } from '../../src/components/common/Panel/Panel';
import Button from '../../src/components/common/Button/Button';
import { TierChip } from '../../src/components/SettingsPanel/TierChip';
import GalaxiesSection from '../../src/components/SettingsPanel/GalaxiesSection';
import StarsSection from '../../src/components/SettingsPanel/StarsSection';
import CosmicWebSection from '../../src/components/SettingsPanel/CosmicWebSection';
import FlowSection from '../../src/components/SettingsPanel/FlowSection';
import StructuresSection from '../../src/components/SettingsPanel/StructuresSection';
import LabelsSection from '../../src/components/SettingsPanel/LabelsSection';
import DisplaySection from '../../src/components/SettingsPanel/DisplaySection';
import EarthSection from '../../src/components/SettingsPanel/EarthSection';

import { Source } from '../../src/data/source';
import { BiasMode } from '../../src/data/galaxyCatalog/biasMode';
import { ToneMapCurve } from '../../src/data/toneMapCurve';
import { STAR_CATALOG_IDS } from '../../src/data/starCatalog/starCatalogIds';
import { STRUCTURE_IDS } from '../../src/data/structure/structureIds';
import { LABEL_CATEGORIES } from '../../src/data/structure/labelCategories';

import type { Tier } from '../../src/@types/data/Tier';
import type { SourceType } from '../../src/@types/data/SourceType';
import type { BiasMode as BiasModeT } from '../../src/@types/data/galaxyCatalog/BiasMode';
import type { ToneMapCurve as ToneMapCurveT } from '../../src/@types/data/ToneMapCurve';
import type { StarCatalogId } from '../../src/@types/data/starCatalog/StarCatalogId';
import type { StarCatalogItemSettings } from '../../src/@types/settings/StarCatalogItemSettings';
import type { StructureId } from '../../src/@types/data/structure/StructureId';
import type { LabelCategory } from '../../src/@types/engine/data/LabelCategory';
import type { FlowSettings } from '../../src/@types/settings/FlowSettings';

// ── Seed helpers ─────────────────────────────────────────────────────────────

/** The galaxy catalog sources GalaxiesSection iterates as its per-catalog rows. */
const TOGGLEABLE_SOURCES: readonly SourceType[] = [
  Source.FamousGalaxy,
  Source.TwoMRS,
  Source.SDSS,
  Source.Glade,
  Source.Milliquas,
  Source.DesiDeep,
  Source.DesiWedge,
  Source.DesiSgw,
];

/** Seed the visibility bitmask so every toggleable source starts on. maskHas
 *  reads `mask & (1 << code)`, so all-on is the bit-OR of `(1 << code)`. */
const ALL_SOURCES_ON = TOGGLEABLE_SOURCES.reduce((mask, code) => mask | (1 << code), 0);

/** Every star catalog id → {enabled, labelEnabled}, both on. Must cover every id
 *  in STAR_CATALOG_IDS or StarsSection throws on `items[id].enabled`. */
const STAR_ITEMS_SEED = Object.fromEntries(
  STAR_CATALOG_IDS.map((id) => [id, { enabled: true, labelEnabled: true }]),
) as Record<StarCatalogId, StarCatalogItemSettings>;

/** Every structure id → true. Must cover every id in STRUCTURE_IDS. */
const MARKER_VIS_SEED = Object.fromEntries(
  STRUCTURE_IDS.map((id) => [id, true]),
) as Record<StructureId, boolean>;

/** Every label category → true. Must cover every id in LABEL_CATEGORIES. */
const LABEL_VIS_SEED = Object.fromEntries(
  LABEL_CATEGORIES.map((cat) => [cat, true]),
) as Record<LabelCategory, boolean>;

const FLOW_SEED: FlowSettings = {
  enabled: false,
  mode: 'advect',
  intensity: 0.7,
  count: 20000,
  trail: 0.005,
  flowSpeed: 0.05,
  densityBias: 0.5,
  wander: 0.05,
  boundaryFadeWidth: 0.1,
};

// ── SettingsPanelPreview ─────────────────────────────────────────────────────

function SettingsPanelPreview({ defaultOpen = true }: { defaultOpen?: boolean }) {
  // Tier chip
  const [tier, setTier] = useState<Tier>('medium');

  // Galaxies
  const [visibleSourceMask, setVisibleSourceMask] = useState<number>(ALL_SOURCES_ON);
  const [pointSize, setPointSize] = useState<number>(2.5);
  const [depthFadeEnabled, setDepthFadeEnabled] = useState<boolean>(true);
  const [biasMode, setBiasMode] = useState<BiasModeT>(BiasMode.AngularReweight);
  const [absMagLimit, setAbsMagLimit] = useState<number>(-19);

  // Stars
  const [starsEnabled, setStarsEnabled] = useState<boolean>(true);
  const [starItems, setStarItems] =
    useState<Record<StarCatalogId, StarCatalogItemSettings>>(STAR_ITEMS_SEED);
  const [starSizePx, setStarSizePx] = useState<number>(2.5);
  const [starBrightness, setStarBrightness] = useState<number>(1.0);
  const [refineThreshold, setRefineThreshold] = useState<number>(0.05);
  const [glowOverlap, setGlowOverlap] = useState<number>(4.7);
  const [exposureNearX, setExposureNearX] = useState<number>(15);
  const [exposureMidX, setExposureMidX] = useState<number>(57);
  const [exposureFarX, setExposureFarX] = useState<number>(70);
  const [aggregateIntensityCap, setAggregateIntensityCap] = useState<number>(0.06);
  const [famousStarsEnabled, setFamousStarsEnabled] = useState<boolean>(true);

  // Cosmic web
  const [volumesEnabled, setVolumesEnabled] = useState<boolean>(true);
  const [filamentsEnabled, setFilamentsEnabled] = useState<boolean>(true);
  const [filamentIntensity, setFilamentIntensity] = useState<number>(0.5);

  // Flow
  const [flow, setFlow] = useState<FlowSettings>(FLOW_SEED);

  // Structures
  const [markerCategoryVisibility, setMarkerCategoryVisibility] =
    useState<Record<StructureId, boolean>>(MARKER_VIS_SEED);

  // Labels
  const [labelCategoryVisibility, setLabelCategoryVisibility] =
    useState<Record<LabelCategory, boolean>>(LABEL_VIS_SEED);
  const [starLabelsEnabled, setStarLabelsEnabled] = useState<boolean>(true);
  const [planetLabelsEnabled, setPlanetLabelsEnabled] = useState<boolean>(true);

  // Display
  const [toneMapCurve, setToneMapCurve] = useState<ToneMapCurveT>(ToneMapCurve.Reinhard);

  // Earth
  const [atmosphereExposure, setAtmosphereExposure] = useState<number>(1.0);
  const [ambientLight, setAmbientLight] = useState<number>(0.02);
  const [oceanRoughness, setOceanRoughness] = useState<number>(0.2);

  return (
    <Panel
      title="Settings"
      ariaLabel="Renderer settings"
      defaultOpen={defaultOpen}
      headerExtra={<TierChip tier={tier} onTierChange={setTier} />}
    >
      <GalaxiesSection
        visibleSourceMask={visibleSourceMask}
        onToggleSource={(source, visible) =>
          setVisibleSourceMask((mask) =>
            visible ? mask | (1 << source) : mask & ~(1 << source),
          )
        }
        pointSize={pointSize}
        onPointSizeChange={setPointSize}
        depthFadeEnabled={depthFadeEnabled}
        onDepthFadeEnabledChange={setDepthFadeEnabled}
        biasMode={biasMode}
        onBiasModeChange={setBiasMode}
        absMagLimit={absMagLimit}
        onAbsMagLimitChange={setAbsMagLimit}
      />

      <StarsSection
        enabled={starsEnabled}
        items={starItems}
        sizePx={starSizePx}
        brightness={starBrightness}
        refineThreshold={refineThreshold}
        glowOverlap={glowOverlap}
        exposureNearX={exposureNearX}
        exposureMidX={exposureMidX}
        exposureFarX={exposureFarX}
        aggregateIntensityCap={aggregateIntensityCap}
        famousStarsEnabled={famousStarsEnabled}
        onToggleMaster={setStarsEnabled}
        onToggleCatalog={(id, enabled) =>
          setStarItems((items) => ({ ...items, [id]: { ...items[id], enabled } }))
        }
        onSizeChange={setStarSizePx}
        onBrightnessChange={setStarBrightness}
        onRefineThresholdChange={setRefineThreshold}
        onGlowOverlapChange={setGlowOverlap}
        onExposureNearXChange={setExposureNearX}
        onExposureMidXChange={setExposureMidX}
        onExposureFarXChange={setExposureFarX}
        onAggregateIntensityCapChange={setAggregateIntensityCap}
        onToggleFamousStars={setFamousStarsEnabled}
      />

      <CosmicWebSection
        volumesEnabled={volumesEnabled}
        onVolumesEnabledChange={setVolumesEnabled}
        filamentsEnabled={filamentsEnabled}
        onFilamentsChange={setFilamentsEnabled}
        filamentIntensity={filamentIntensity}
        onFilamentIntensityChange={setFilamentIntensity}
        volumeFields={[]}
        onVolumeFieldEnabledChange={() => {}}
        onVolumeFieldIntensityChange={() => {}}
        onVolumeFieldContrastChange={() => {}}
        onVolumeFieldDensityScaleChange={() => {}}
        onVolumeFieldTrimChange={() => {}}
        onVolumeFieldExposureChange={() => {}}
        onVolumeFieldPaletteChange={() => {}}
      />

      <FlowSection
        flow={flow}
        onEnabledChange={(enabled) => setFlow((f) => ({ ...f, enabled }))}
        onFlowChange={(patch) => setFlow((f) => ({ ...f, ...patch }))}
      />

      <StructuresSection
        markerCategoryVisibility={markerCategoryVisibility}
        onSetMarkerCategoryVisibility={(category, visible) =>
          setMarkerCategoryVisibility((v) => ({ ...v, [category]: visible }))
        }
      />

      <LabelsSection
        labelCategoryVisibility={labelCategoryVisibility}
        onSetLabelCategoryVisibility={(category, visible) =>
          setLabelCategoryVisibility((v) => ({ ...v, [category]: visible }))
        }
        starLabelsEnabled={starLabelsEnabled}
        onSetStarLabelsEnabled={setStarLabelsEnabled}
        planetLabelsEnabled={planetLabelsEnabled}
        onSetPlanetLabelsEnabled={setPlanetLabelsEnabled}
      />

      <DisplaySection toneMapCurve={toneMapCurve} onToneMapCurveChange={setToneMapCurve}>
        <EarthSection
          atmosphereExposure={atmosphereExposure}
          onAtmosphereExposureChange={setAtmosphereExposure}
          ambientLight={ambientLight}
          onAmbientLightChange={setAmbientLight}
          oceanRoughness={oceanRoughness}
          onOceanRoughnessChange={setOceanRoughness}
        />
      </DisplaySection>

      <div role="separator" />
      <Button onClick={() => {}}>Reset camera</Button>
    </Panel>
  );
}

export default SettingsPanelPreview;
