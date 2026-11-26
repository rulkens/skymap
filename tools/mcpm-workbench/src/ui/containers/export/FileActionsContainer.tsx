/**
 * FileActionsContainer — store boundary for the right sidebar's footer. The exports
 * only request; the export saga's harness closure is the one place that can read the
 * trace back. The params preset is the same shape the trace sidecar's
 * provenance.params rides (exportParams), so it saves synchronously from the live store.
 */
import { memo, useCallback, type ReactNode } from 'react';
import { downloadStem } from '../../../export/downloadStem';
import { triggerDownload } from '../../../export/triggerDownload';
import { deriveGridBox } from '../../../grid/deriveGridBox';
import { exportParams } from '../../../params/exportParams';
import { importParams } from '../../../params/importParams';
import { setCatalogSources } from '../../../state/catalog/catalogSlice';
import { exportNpyRequested, exportScfdRequested } from '../../../state/commands';
import { installImportedBox } from '../../../state/grid/gridSlice';
import { setAgentCount, setInitMode, setSimParam } from '../../../state/sim/simSlice';
import { useAppDispatch, useAppStore } from '../../../store/hooks';
import FileActions, { type FileActionsProps } from '../../export/FileActions/FileActions';
import { PARAMS_FILE_EXTENSION } from './data/paramsFileExtension.constant';
import { MCPM_PARAM_KEYS } from '../../../params/mcpmParamKeys.constant';

export type FileActionsContainerProps = Pick<FileActionsProps, 'collapsed'>;

function FileActionsContainer({ collapsed }: FileActionsContainerProps): ReactNode {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const onExportTrace = useCallback(() => dispatch(exportNpyRequested()), [dispatch]);
  const onExportScfd = useCallback(() => dispatch(exportScfdRequested()), [dispatch]);

  const onSaveParams = useCallback((): void => {
    const s = store.getState();
    const json = exportParams({
      params: s.sim.params,
      agentCount: s.sim.agentCount,
      initMode: s.sim.initMode,
      gridBox: deriveGridBox(s.grid),
      sources: s.catalog.sources,
    });
    triggerDownload(
      `${downloadStem(new Date())}${PARAMS_FILE_EXTENSION}`,
      json,
      'application/json',
    );
  }, [store]);

  const onImportParams = useCallback(
    (text: string): void => {
      const imported = importParams(text);
      // Dispatch order is free: every structural trigger lands in one debounced
      // rebuild that reads a fresh state snapshot. setSimParam is live, no rebuild.
      for (const key of MCPM_PARAM_KEYS)
        dispatch(setSimParam({ key, value: imported.params[key] }));
      dispatch(setInitMode(imported.initMode));
      dispatch(setAgentCount(imported.agentCount));
      dispatch(installImportedBox(imported.gridBox));
      if (imported.sources !== undefined) dispatch(setCatalogSources(imported.sources));
    },
    [dispatch],
  );

  return (
    <FileActions
      collapsed={collapsed}
      onExportTrace={onExportTrace}
      onExportScfd={onExportScfd}
      onSaveParams={onSaveParams}
      onImportParams={onImportParams}
    />
  );
}

export default memo(FileActionsContainer);
