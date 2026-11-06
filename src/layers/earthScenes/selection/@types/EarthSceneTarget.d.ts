import type { EarthSceneInfo } from '../../../../@types/engine/EarthSceneInfo';
import type { EarthSceneRef } from './EarthSceneRef';

export type EarthSceneTarget = EarthSceneInfo & { readonly ref: EarthSceneRef };
