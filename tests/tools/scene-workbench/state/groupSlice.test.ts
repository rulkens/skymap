import { describe, expect, it } from 'vitest';
import {
  defaultGroupSlice,
  groupSlice,
} from '../../../../tools/scene-workbench/src/state/group/groupSlice';
import { registrySlice } from '../../../../tools/scene-workbench/src/state/registry/registrySlice';

describe('groupSlice groupSelected', () => {
  it('clears the previous manifest and its asset statuses', () => {
    const loaded = groupSlice.reducer(
      defaultGroupSlice,
      groupSlice.actions.manifestLoaded({
        formatVersion: 1,
        groupId: 'sjaelland',
        groupName: 'Sjaelland',
        anchor: { kind: 'geodetic', latDeg: 0, lonDeg: 0, heightMDvr90: 0, headingDeg: 0 },
        assets: [],
      }),
    );
    const withStatus = groupSlice.reducer(
      loaded,
      groupSlice.actions.assetStatusChanged({ assetId: 'asset-1', status: 'ready' }),
    );
    expect(withStatus.manifest).not.toBeNull();
    expect(withStatus.assetStatus).toEqual({ 'asset-1': 'ready' });

    const afterSelect = groupSlice.reducer(
      withStatus,
      registrySlice.actions.groupSelected('other-group'),
    );
    expect(afterSelect.manifest).toBeNull();
    expect(afterSelect.assetStatus).toEqual({});
  });
});
