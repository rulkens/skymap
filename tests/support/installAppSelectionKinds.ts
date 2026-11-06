import { APP_COMPOSITION } from '../../src/compositions/app';
import { installSelectionKinds } from '../../src/services/engine/selection/selectionKindOf';
import { layerSelectionKinds } from '../../src/utils/layer/layerSelectionKinds';

/** What `createLayers` installs when it boots the app composition, for tests that boot no engine. */
export function installAppSelectionKinds(): void {
  installSelectionKinds(layerSelectionKinds(APP_COMPOSITION.layers));
}
