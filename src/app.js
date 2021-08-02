
const { debugSession } = require('./debugsession.js');
const { init, connectToInspector, enableDebugger, makeInspectorUri, startDebugSession, startInspectedProcess } = require('./init.js');
const protocol = require('./protocol.js');

module.exports = {
  debugSession,
  init, connectToInspector, enableDebugger, makeInspectorUri, startDebugSession2, startInspectedProcess,
  protocol
}

// init(process.argv, debugSession, () => {});
