/**
 * SceneBodyId — the id of any body the scene positions and draws: Earth, a
 * planet or moon, a seeded star or S-star, a mission craft, an Earth scene.
 * Not `BodySourceId`, which names the two body SOURCE rows (`earth`, `planet`).
 * Stamped once where a row is made (`asSceneBodyId`) and checked where a raw
 * string enters (`isSceneBodyId`), so a typo'd id cannot reach a Map lookup.
 */

import type { Tagged } from '../utils/Tagged';

export type SceneBodyId = Tagged<string, 'sceneBodyId'>;
