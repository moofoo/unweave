const { data, inputCapture, isMethod, isResult } = require('./messages.js');
const { debugSession } = require('./sessions.js');
const { makeEmitter, mergeEvents, now, later, Source, value } = require('streamer');
const { renderer } = require('terminal');
const WebSocket = require('ws');

connectToInspector(process.argv[2]);

function connectToInspector(sessionHash) {
  const webSocket = new WebSocket(`ws://localhost:9230/${sessionHash}`);

  webSocket.onopen = () => startDebugSession(webSocket);

  webSocket.onerror = error => console.log(error);
}

function startDebugSession(webSocket) {
  console.log("Connection opened");

  const send = (methodName, parameters) => webSocket.send(JSON.stringify({method: methodName, params: parameters, id: 0}));

  const [render, close] = renderer();

  Source.from(mergeEvents([makeEmitter(inputCapture(), "input"), makeEmitter(webSocket, "message")]), "onevent")
	.withDownstream(async (stream) => 
	  debugSession(send, render)(await runProgram(send)(await enableDebugger(send)(await runtimeEnabled(stream)))));

  send("Runtime.enable", {});
}

async function runtimeEnabled(stream) {
  if (isMethod(data(value(now(stream))), "Runtime.executionContextCreated")) {
    return stream;
  }
  else {
    return runtimeEnabled(await later(stream));
  }
}

function enableDebugger(send) {
  return stream => {
    send("Debugger.enable", {});

    const debuggerEnabled = async (stream) => {
      if (isResult(data(value(now(stream))), "debuggerId")) {
        return stream;
      }
      else {
        return debuggerEnabled(await later(stream));
      }
    };

    return debuggerEnabled(stream);
  };
}

function runProgram(send) {
  return async (stream) => {
    send("Runtime.runIfWaitingForDebugger", {});

    return stream;
  };
}
