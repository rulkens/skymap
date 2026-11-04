import type { SkyCapture } from './SkyCapture';
import type { APP_CUBEMAP_CAPTURE_REGISTRY } from '../../compositions/appCubemapCaptures';

type Registry = typeof APP_CUBEMAP_CAPTURE_REGISTRY;

/** SkyCaptureKey — names one `kind: 'sky'` row of `APP_CUBEMAP_CAPTURE_REGISTRY`. */
export type SkyCaptureKey = {
  [Key in keyof Registry]: Registry[Key] extends SkyCapture ? Key : never;
}[keyof Registry];
