/**
 * register — side-effect module that adds the density-volume layer to the
 * registry.
 *
 * Importing this module (for its side effect) is the open end of the Strategy
 * pattern: it calls `register('densityVolume', ...)` at import time so the
 * engine's `listFactories()` enumerates it without naming the concrete class.
 * Import it once at app bootstrap (see main.tsx) before `createEngine`. The
 * layer only DRAWS when enabled (default off); registering it is harmless.
 */
import { register } from '../registry';
import { DensityVolumeVisualization } from './DensityVolumeVisualization';

register('densityVolume', () => new DensityVolumeVisualization());
