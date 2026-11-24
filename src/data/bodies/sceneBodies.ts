/**
 * SCENE_BODIES — the flat registry the `body-<id>` focus-id resolver and the selection-row
 * extractor look up: every composed Layer's body rows. Membership is what makes a body focusable
 * and selectable AT ALL: both consumers return null on a miss, so an omitted body fails silently.
 * Consumers touch only the fields the `SceneBody` union shares (`id`, `label`).
 */

import { APP_BODY_REGISTRY } from '../../compositions/appBodies';
import type { SceneBody } from '../../@types/scene/SceneBody';

export const SCENE_BODIES: readonly SceneBody[] = APP_BODY_REGISTRY.map((row) => row.body);
