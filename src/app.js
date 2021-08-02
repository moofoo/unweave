
const { debugSession } = require('./debugsession.js');
const { init, connectToInspector, enableDebugger, makeInspectorUri, startDebugSession, startInspectedProcess } = require('./init.js');

module.exports = {
  debugSession,
  init, connectToInspector, enableDebugger, makeInspectorUri, startDebugSession, startInspectedProcess
}

// init(process.argv, debugSession, () => {});
