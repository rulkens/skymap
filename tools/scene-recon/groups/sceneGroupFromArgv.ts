/**
 * The scene-group registry and the `--group <id>` lookup every fetch/bake CLI
 * shares — one place for the flag name, the default, and the known ids.
 */
import { SOENDERMARKEN } from './soendermarken';
import { SOENDERMARKEN_CROP } from './soendermarkenCrop';
import { SOENDERMARKEN_CROP_2019 } from './soendermarkenCrop2019';
import { argValue } from '../../utils/cli/argValue';
import type { SceneGroupDefinition } from '../@types/SceneGroupDefinition';

const GROUPS: readonly SceneGroupDefinition[] = [
  SOENDERMARKEN,
  SOENDERMARKEN_CROP,
  SOENDERMARKEN_CROP_2019,
];
const DEFAULT_GROUP_ID = SOENDERMARKEN.id;

export function sceneGroupFromArgv(argv: readonly string[]): SceneGroupDefinition {
  const id = argValue(argv, '--group') ?? DEFAULT_GROUP_ID;
  const group = GROUPS.find((candidate) => candidate.id === id);
  if (!group) {
    throw new Error(
      `--group ${id}: no such scene group — known ids: ${GROUPS.map((g) => g.id).join(', ')}`,
    );
  }
  return group;
}
