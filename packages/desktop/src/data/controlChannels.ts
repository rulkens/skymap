/** Every IPC channel between the control page and main: main sends `state` and `view`, the page invokes the rest. */
export const CONTROL_CHANNELS = {
  state: 'control:state',
  view: 'control:view',
  getState: 'control:getState',
  saveSetup: 'control:saveSetup',
  updateNow: 'control:updateNow',
  restartSky: 'control:restartSky',
  showTestGrid: 'control:showTestGrid',
  rotateCode: 'control:rotateCode',
  hide: 'control:hide',
  quit: 'control:quit',
} as const;
