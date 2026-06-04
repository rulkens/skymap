/**
 * VisualizationFactory — a zero-arg constructor for a fresh `Visualization`.
 *
 * The registry stores factories, not instances, so each call yields an
 * independent layer with its own GPU resources. That keeps construction lazy
 * (nothing is built until the engine decides to instantiate a layer) and lets a
 * layer be re-created cleanly after a teardown without sharing mutable state
 * with a previous instance.
 */
import type { Visualization } from './Visualization';

export type VisualizationFactory = () => Visualization;
