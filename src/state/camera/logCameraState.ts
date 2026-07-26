/**
 * logCameraState — the reducer-less COMMAND that asks the engine to print the
 * current orbit-camera pose to the console (the `l` key's debug aid). Mirrors
 * goHome: dispatching it changes no state; `watchLogCameraStateSaga` invokes
 * the matching `reconcile.logCameraState` effect, which delegates to the
 * engine helper. Routing the one engine-imperative key through an action keeps
 * the shortcut map uniform — every entry only dispatches.
 */
import { createAction } from '@reduxjs/toolkit';

export const logCameraState = createAction('camera/logCameraState');
