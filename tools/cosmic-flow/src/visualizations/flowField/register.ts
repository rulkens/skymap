/**
 * register — side-effect module that adds the flow-field layer to the registry.
 *
 * Importing this module (for its side effect) is the open end of the Strategy
 * pattern: it calls `register('flowField', ...)` at import time so the engine's
 * `listFactories()` enumerates it without naming the concrete class. Import it
 * once at app bootstrap (see main.tsx) before `createEngine`.
 */
import { register } from '../registry';
import { FlowFieldVisualization } from './FlowFieldVisualization';

register('flowField', () => new FlowFieldVisualization());
