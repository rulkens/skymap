/**
 * Transitional: every call site still imports its action creator (or the
 * combined reducer, by default import) from here. Task 4 re-points the 77
 * call sites at the module that owns each and deletes this file.
 */

export { default } from './settingsReducer';

export { setOrientation } from './core/orientationSlice';
export { setFovDeg } from './core/cameraSettingsSlice';
export { setExposure, setToneMapCurve } from './core/tonemapSlice';
export { setHdrEnabled, setHdrKnee, setHdrHeadroom } from './core/hdrSlice';
export { setBloomEnabled, setBloomStrength, setBloomThreshold } from './core/bloomSlice';
export { setLabelsFocusedOnly } from './core/labelsSlice';
export {
  setDebugOverlay,
  setPassDisabled,
  setRenderStrategy,
  inspectClipPath,
  recalcClipPath,
  clearClipPath,
  setClipPathScrub,
  setClipPathAlign,
  setClipPathRampSec,
  setClipPathLinger,
  setClipPathLingerSec,
  setClipPathSpline,
  setClipPathTurnDelay,
  setClipPathLookAhead,
  setClipPathPassByOffset,
  setClipPathPassByDir,
  setClipPathTuningActive,
} from './core/debugSlice';

export {
  setGalaxyCatalogSize,
  setBrightness,
  setDepthFade,
  setProvenanceHighlight,
  setProvenanceFilter,
  setGalaxySbScale,
  setGalaxySbMax,
  setGalaxyFalloffStrength,
  setGalaxyCatalogVisible,
  setGalaxyCatalogLabelEnabled,
} from '../../layers/galaxyCatalog/settings/galaxyCatalogsSlice';
export { setBiasMode, setAbsMagLimit } from '../../layers/galaxyCatalog/settings/biasSlice';
export { setThumbnailsEnabled } from '../../layers/galaxyCatalog/settings/thumbnailsSlice';
export {
  setStarCatalogEnabled,
  setStarCatalogSize,
  setStarCatalogBrightness,
  setStarCatalogRefineThreshold,
  setStarCatalogGlowOverlap,
  setStarCatalogExposureNearX,
  setStarCatalogExposureMidX,
  setStarCatalogExposureFarX,
  setStarCatalogAggregateIntensityCap,
  setStarCatalogVisible,
  setStarCatalogLabelEnabled,
} from '../../layers/starCatalog/settings/starCatalogsSlice';
export {
  setStructureItemEnabled,
  setStructureLabelEnabled,
} from '../../layers/structure/settings/structuresSlice';
export {
  setVolumesEnabled,
  addVolumeField,
  removeVolumeField,
  writeVolumeField,
} from '../../layers/volume/settings/volumesSlice';
export { setBodyLabelEnabled } from '../../layers/body/settings/bodiesSlice';
export {
  setAtmosphereExposure,
  setAmbientLight,
  setOceanRoughness,
} from '../../layers/body/settings/earthSlice';
export { setOrbitTrailsEnabled } from '../../layers/body/settings/orbitTrailsSlice';
export { setSgrAStarLensingTuning } from '../../layers/body/settings/sgrAStarLensingTuningSlice';
export {
  setMilkyWayEnabled,
  setMilkyWayLabelEnabled,
  setMilkyWayTuning,
} from '../../layers/milkyWay/settings/milkyWaySlice';
export {
  setZoneOfAvoidanceEnabled,
  setZoneOfAvoidanceTuning,
} from '../../layers/zoneOfAvoidance/settings/zoneOfAvoidanceSlice';
export {
  setFilamentsEnabled,
  setFilamentIntensity,
} from '../../layers/filaments/settings/filamentsSlice';
export {
  setConstellationsEnabled,
  setConstellationIntensity,
} from '../../layers/constellations/settings/constellationsSlice';
export { setFlowEnabled, setFlow } from '../../layers/flow/settings/flowSlice';

export { mergeSnapshot } from './mergeSnapshotAction';
