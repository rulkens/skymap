/**
 * FocusId — a durable focus identifier in tour clips and authoring surfaces.
 *
 * The tag earns its keep only at the authoring boundary, where raw strings from
 * UI inputs are validated and stamped before flowing into the tour/clip graph.
 * Because a FocusId is assignable to string, the resolver's `resolveFocusId`
 * stays plain: it works with ordinary strings. The tag is a compile-time guard,
 * not a runtime wrapper, so the resolver never needs to unwrap.
 */

import type { Tagged } from '../utils/Tagged';

export type FocusId = Tagged<string, 'focusId'>;
