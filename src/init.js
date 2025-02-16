// Copyright (c) Adrien Cransac
// License: MIT

const { fork } = require('child_process');
const { isDebuggerEnabled, isExecutionContextCreated, makeInput, makeInspectorQuery, message, sendEnableDebugger, sendEnableRuntime, sendStartRun } = require('./protocol.js');
const Readline = require('readline');
const { makeEmitter, mergeEvents, later, Source } = require('@acransac/streamer');
const { renderer } = require('@acransac/terminal');
const WebSocket = require('ws');
const { debugSession2 } = require('./debugsession.js');

// # Debug Session Initializer

/*
 * Initialize a debug session communicating with Inspector
 * @param {string[]} cliArguments - The process' command line arguments to forward
 * @param {function} session - A function receiving the callback to send requests to Inspector, the render and terminate functions provided by Terminal and generating a Streamer process that organizes the debug session interactivity and display
 * @param {function} onTerminate - A callback called after the session is finished
 * @param {function} [displayTarget: process.stdout] - The writable Node.js stream to write the display to
 
 
 * @return {}
 */
async function init(options, session = debugSession2, onTerminate, inputStream = process.stdin, output, cb)  {
  onTerminate = onTerminate || function() {process.exit(0);};
  let uri;
 output = output || function(){return (whatever) => {console.log(JSON.stringify(whatever));}};
 
 if(typeof options === 'string'){
  uri = options;
 }else {  
  const {address, port, sessionHash, cb:callback} = options;  
  if(callback){
   cb = callback;
  }
  uri = makeInspectorUri(address, port, sessionHash);
 }

  connectToInspector(uri, session, onTerminate, inputStream, output, cb);
}

function connectToInspector(inspectorUri, session, onTerminate, inputStream, output, cb) {
 cb = cb || function(){};
  const webSocket = new WebSocket(`ws://${address(inspectorUri)}:${port(inspectorUri)}/${sessionHash(inspectorUri)}`);

  webSocket.onopen = () => {
    console.log("Connection opened");

    const send = startDebugSession2(webSocket, session, inputStream, output);
   
   (async () => {
    await cb(send, webSocket)
   })()  
    
  };

  webSocket.onerror = error => console.log(error);

  webSocket.onclose = () => {
    console.log("Connection closed");

    onTerminate();
  };
}

function enableDebugger(send) {
  return stream => {
    sendEnableDebugger(send);

    const debuggerEnabled = async (stream) => {
      if (isDebuggerEnabled(message(stream))) {
        return stream;
      }
      else {
        return debuggerEnabled(await later(stream));
      }
    };

    return debuggerEnabled(stream);
  };
}

  const parseUriOptions = (inspectorUri, uriOptions) => {
    if (uriOptions.length === 0) {
      return inspectorUri;
    }
    else {
      switch (uriOptions[0]) {
        case "--address":
        case "-a":
          return parseUriOptions(makeInspectorUri(uriOptions[1], port(inspectorUri), sessionHash(inspectorUri)),
                                 uriOptions.slice(2));
          break;
        case "--port":
        case "-p":
          return parseUriOptions(makeInspectorUri(address(inspectorUri), uriOptions[1], sessionHash(inspectorUri)),
                                 uriOptions.slice(2));
          break;
        case "--session":
        case "-s":
          return parseUriOptions(makeInspectorUri(address(inspectorUri), port(inspectorUri), uriOptions[1]),
                                 uriOptions.slice(2));
          break;
        default:
          throw "Uri option not valid";
      }
    }
  };

async function parseCliArguments(cliArguments) {
  // Command line is [node binary] ["app.js"] [script | uri options]
  if (cliArguments.length === 2) {
    throw "Specify either a script to debug or an Inspector session uri";
  }
  else if (cliArguments.length === 3) {
    return await startInspectedProcess(cliArguments[2]);
  }
  else if (cliArguments.length % 2 > 0) {
    throw "Specify one value for each uri option provided";
  }
  else {
    return parseUriOptions(makeInspectorUri(), cliArguments.slice(2));
  }
}

function runProgram(send) {
  return async (stream) => {
    sendStartRun(send);

    return stream;
  };
}

async function runtimeEnabled(stream) {
  if (isExecutionContextCreated(message(stream))) {
    return stream;
  }
  else {
    return runtimeEnabled(await later(stream));
  }
}

function startDebugSession(webSocket, session, displayTarget) {
  const send = (methodName, parameters, requestId) => webSocket.send(makeInspectorQuery(methodName, parameters, requestId));

  const [render, closeDisplay] = renderer(displayTarget);

  const terminate = () => {
    endInputCapture();

    closeDisplay();

    setImmediate(() => webSocket.close());
  };

  Source.from(mergeEvents([makeEmitter(inputCapture(), "input"), makeEmitter(webSocket, "message")]), "onevent")
        .withDownstream(async (stream) =>
          session(send, render, terminate)(
            await runProgram(send)(
              await enableDebugger(send)(
                await runtimeEnabled(stream)))));

  sendEnableRuntime(send);
 
 return send;
}


function startDebugSession2(webSocket, session, inputStream = process.stdin, output) {
  const send = (methodName, parameters, requestId) => webSocket.send(makeInspectorQuery(methodName, parameters, requestId));

  // const [render, closeDisplay] = renderer(displayTarget);
//  const render = (content) => { console.log(JSON.stringify(content)); };

  const terminate = () => {
    // endInputCapture();

    // closeDisplay();

    setImmediate(() => webSocket.close());
  };

  Source.from(mergeEvents([makeEmitter(inputStream, "input"), makeEmitter(webSocket, "message")]), "onevent")
        .withDownstream(async (stream) =>
          session(send, output, terminate)(
            await runProgram(send)(
              await enableDebugger(send)(
                await runtimeEnabled(stream)))));

  sendEnableRuntime(send);
 
 return send;
}


function startInspectedProcess(scriptPath) {
  return new Promise(resolve => {
    const inspectedProcess = fork(scriptPath, options = {stdio: ["ignore", "ignore", "pipe", "ipc"],
                                                         execArgv: ["--inspect-brk"]});

    const stderrLines = Readline.createInterface({input: inspectedProcess.stderr});

    stderrLines.on('line', line => {
      const uriLinePrefix = "Debugger listening on ws://";

      if (line.startsWith(uriLinePrefix)) {
        resolve((uriString => makeInspectorUri(uriString.match(/^.+:/g)[0].slice(0, -1),
                                               uriString.match(/:.+\//g)[0].slice(1, -1),
                                               uriString.match(/\/.+/g)[0].slice(1)))
                  (line.slice(uriLinePrefix.length)));
      }
    });
  });
}

// # Input Capture
function inputCapture() {
  Readline.emitKeypressEvents(process.stdin);

  process.stdin.setRawMode(true);

  process.stdin.on('keypress', key => process.stdin.emit('input', makeInput(key)));

  return process.stdin;
}

function endInputCapture() {
  return process.stdin.pause();
}

// # Inspector URI
function makeInspectorUri(address, port, sessionHash) {
  return [address ? address : "127.0.0.1", port ? port : "9229", sessionHash];
}

function address(inspectorUri) {
  return inspectorUri[0];
}

function port(inspectorUri) {
  return inspectorUri[1];
}

function sessionHash(inspectorUri) {
  return inspectorUri[2];
}

module.exports = { init, connectToInspector, enableDebugger, makeInspectorUri, startDebugSession, startInspectedProcess, isDebuggerEnabled, isExecutionContextCreated, makeInput, makeInspectorQuery, message, sendEnableDebugger, sendEnableRuntime, sendStartRun,
makeEmitter, mergeEvents, later, Source ,
renderer, WebSocket };
