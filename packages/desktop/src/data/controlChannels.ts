/** Every IPC channel between the control page and main: main sends `state` and `help`, the page invokes the rest. */
export const CONTROL_CHANNELS = {
  state: 'control:state',
  help: 'control:help',
  getState: 'control:getState',
  saveSetup: 'control:saveSetup',
  updateNow: 'control:updateNow',
  pauseSync: 'control:pauseSync',
  restartSky: 'control:restartSky',
  showTestGrid: 'control:showTestGrid',
  rotateCode: 'control:rotateCode',
  hide: 'control:hide',
  quit: 'control:quit',
} as const;
