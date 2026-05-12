/**
 * Barrel re-export of all public type aliases used across the renderer.
 *
 * Import sites should prefer `import type { Foo } from '../@types'`
 * over deep imports — the barrel keeps refactoring easier and the
 * import lines tidy.
 */

export type * from './PointInfo';
export type * from './ScaleInfo';
export type * from './EngineStatus';
export type * from './EngineCallbacks';
export type * from './EngineHandle';
export type * from './GpuContext';
export type * from './ThumbnailInstance';
export type * from './EngineSettingsState';
export type * from './EngineBiasState';
export type * from './EngineSourceState';
export type * from './EnginePickingState';
export type * from './EngineGpuHandles';
export type * from './EngineSubsystemHandles';
export type * from './EngineState';
export type * from './Renderer';
export type * from './Destroyable';
