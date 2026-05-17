import type { GalaxyInfo } from './GalaxyInfo';
import type { SelectionInput } from './subsystems/SelectionInput';

/**
 * Optional selection update bundled into a `commitFocus` call.
 *
 * `key` is the `(source, localIdx)` pair the selection subsystem
 * stores; `info` is an optional prebuilt GalaxyInfo that becomes the
 * `prebuiltInfo` argument to `setSelected` — see the module header for
 * why each caller does or doesn't supply it.
 */
export type CommitFocusSelection = {
  key: SelectionInput;
  /**
   * Optional prebuilt GalaxyInfo to hand into `setSelected`'s second
   * arg.  `selectByAlias` passes this so the InfoCard updates
   * immediately during the deep-link race window where the cloud
   * arrived but the renderer hasn't uploaded yet.  `selectFamous`
   * omits it so the selection subsystem reads the live sidecars at
   * fan-out time.
   */
  info?: GalaxyInfo;
};
