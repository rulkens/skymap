/**
 * FieldHostTuning — everything the field host builds from, as one full value:
 * `setTuning` replaces it, and the renderer's identity keys make an unchanged
 * section free. The tool fills `render` from its own knobs over
 * `FIELD_CALIBRATION.render`; the app spreads that row as is.
 */
import type { DebugViewWeights } from '../../header/@types/DebugViewWeights';
import type { FieldHeaderRenderLanes } from '../../header/@types/FieldHeaderRenderLanes';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldExtra } from '../../mixture/@types/GalaxyFieldExtra';
import type { GalaxyFieldTuning } from '../../mixture/@types/GalaxyFieldTuning';
import type { IsmMapChannelWeights } from '../../header/@types/IsmMapChannelWeights';
import type { IsmMapSeedingLanes } from '../../header/@types/IsmMapSeedingLanes';

export type FieldHostTuning = {
  readonly geometry: GalaxyDescription;
  readonly seed: number;
  readonly extras: readonly GalaxyFieldExtra[];
  /** Dust off is already folded in by the caller (`withoutDustCloud`). */
  readonly field: GalaxyFieldTuning;
  readonly render: FieldHeaderRenderLanes & {
    readonly starGrainFeatureScaleNear: number;
    readonly starGrainFeatureScaleFar: number;
    readonly orientationSigmaDerivTexels: number;
    readonly orientationSigmaIntegTexels: number;
    readonly debugViews: DebugViewWeights;
    readonly galaxyWeight: number;
    readonly ismMapChannels: IsmMapChannelWeights;
    /** The tool's seeding view; the app spreads `FIELD_CALIBRATION.render`'s zeros. */
    readonly ismMapSeeding: IsmMapSeedingLanes;
  };
};
