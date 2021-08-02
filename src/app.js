
const { debugSession } = require('./debugsession.js');
const { init, connectToInspector, enableDebugger, makeInspectorUri, startDebugSession, startDebugSession2, startInspectedProcess } = require('./init.js');
const protocol = require('./protocol.js');
const components = require('./components.js');

module.exports = {
  debugSession,
  init, connectToInspector, enableDebugger, makeInspectorUri, startDebugSession2, startInspectedProcess,
  protocol,
  components
}

// init(process.argv, debugSession, () => {});
