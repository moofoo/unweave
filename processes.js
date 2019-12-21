const { displayedScriptSource, parseUserInput } = require('./helpers.js');
const { breakpointCapture, breakpointLine, endCapture, hasEnded, input, isBreakpointCapture, isDebuggerPaused, isInput, isQueryCapture, isScriptParsed, isUserScriptParsed, makeBreakpointCapture, makeMessagesFocus, makeQueryCapture, makeSourceTreeFocus, makeSourceTreeMessage, message, parsedScriptHandle, parsedScriptUrl, parsedUserScriptPath, parseInspectorQuery, query, sendRequestForEnvironmentDescription, sendRequestForScriptSource } = require('./protocol.js');
const { branches, insertInSourceTree, makeFileEntry, makeSourceTree, parseFilePath } = require('./sourcetree.js');
const { commit, floatOn } = require('streamer');

async function changeMode(stream) {
  const modalCapture = (makeCapture, continuation) => {
    const modeSetter = async (stream) => {
      if (isInput(message(stream))) {
        if (input(message(stream)) === "\r") {
          return floatOn(commit(stream, continuation), endCapture(makeCapture(input(message(stream)))));
        }
        else {
          return floatOn(commit(stream, modeSetter), makeCapture(input(message(stream))));
        }
      }
      else {
        return commit(stream, modeSetter);
      }
    };

    return modeSetter;
  };

  if (isInput(message(stream))) {
    if (input(message(stream)) === "q") {
      return floatOn(commit(stream, modalCapture(makeQueryCapture, changeMode)), makeQueryCapture());
    }
    else if (input(message(stream)) === "b") {
      return floatOn(commit(stream, modalCapture(makeBreakpointCapture, changeMode)), makeBreakpointCapture());
    }
    else if (input(message(stream)) === "m") {
      return floatOn(commit(stream, modalCapture(makeMessagesFocus, changeMode)), makeMessagesFocus());
    }
    else if (input(message(stream)) === "w") {
      return floatOn(commit(stream, modalCapture(makeSourceTreeFocus, changeMode)), makeSourceTreeFocus());
    }
    else {
      return commit(stream, changeMode);
    }
  }
  else {
    return commit(stream, changeMode);
  }
}

function parseCaptures() {
  const parser = capture => async (stream) => {
    const parse = (makeCapture, readCapture) => {
      if (hasEnded(message(stream))) {
        return floatOn(commit(stream, parser("")), endCapture(makeCapture(capture)));
      }
      else {
	const newCapture = parseUserInput(capture, readCapture(message(stream)));

        return floatOn(commit(stream, parser(newCapture)), makeCapture(newCapture));
      }
    };
   
    if (isBreakpointCapture(message(stream))) {
      return parse(makeBreakpointCapture, breakpointCapture);
    }
    else if (isQueryCapture(message(stream))) {
      return parse(makeQueryCapture, query);
    }
    else {
      return commit(stream, parser(capture));
    }
  };

  return parser("");
}

function parseSourceTree() {
  const builder = sourceTree => async (stream) => {
    if (isUserScriptParsed(message(stream))) {
      const [path, fileName] = parseFilePath(parsedUserScriptPath(message(stream)));

      const newSourceTree = insertInSourceTree(sourceTree,
	                                       path,
	                                       makeFileEntry(fileName, parsedScriptHandle(message(stream))));

      return floatOn(commit(stream, builder(newSourceTree)), makeSourceTreeMessage(newSourceTree));
    }
    else {
      return commit(stream, builder(sourceTree));
    }
  };

  return builder(makeSourceTree());
}

function pullScriptSource(send) {
  const scriptChecker = displayChange => async (stream) => {
    const onDisplayChange = (displayChange, newDisplayScriptId) => {
      sendRequestForScriptSource(send, newDisplayScriptId);

      return commit(stream, scriptChecker(displayChange));
    };

    const onSelectionChange = (displayChange, scriptId) => {
      return commit(stream, scriptChecker(displayChange));
    };
	  
    return displayChange(onSelectionChange, onDisplayChange)(stream);
  };

  return scriptChecker(displayedScriptSource());
}

function pullEnvironment(send) {
  const environmentChecker = async (stream) => {
    if (isDebuggerPaused(message(stream))) {
      sendRequestForEnvironmentDescription(send, message(stream));

      return commit(stream, environmentChecker);
    }
    else {
      return commit(stream, environmentChecker);
    }
  };

  return environmentChecker;
}

function queryInspector(send) {
  const requester = async (stream) => {
    if (isQueryCapture(message(stream)) && hasEnded(message(stream))) {
      send(...parseInspectorQuery(query(message(stream))));

      return commit(stream, requester);
    }
    else {
      return commit(stream, requester);
    }
  };

  return requester;
}

function step(send) {
  const stepper = async (stream) => {
    if (isInput(message(stream)) && input(message(stream)) === "n") {
      send("Debugger.stepOver", {});
    }
    else if (isInput(message(stream)) && input(message(stream)) === "s") {
      send("Debugger.stepInto", {});
    }
    else if (isInput(message(stream)) && input(message(stream)) === "c") {
      send("Debugger.resume", {});
    }
    else if (isInput(message(stream)) && input(message(stream)) === "f") {
      send("Debugger.stepOut", {});
    }

    return commit(stream, stepper);
  };

  return stepper;
}

function addBreakpoint(send) {
  const breakpointSetter = scriptId => breakpointLine => {
    send("Debugger.setBreakpoint", {location: {scriptId: scriptId, lineNumber: breakpointLine}});
  };

  const breakpointAdder = (setBreakpoint, displayChange) => async (stream) => {
    const updateBreakpointSetter = (displayChange, scriptId) => {
      return commit(stream, breakpointAdder(breakpointSetter(scriptId), displayChange));
    };

    if (isBreakpointCapture(message(stream)) && hasEnded(message(stream))) {
      setBreakpoint(breakpointLine(message(stream)));

      return commit(stream, breakpointAdder(setBreakpoint, displayChange));
    }
    else {
      return displayChange(updateBreakpointSetter, updateBreakpointSetter)(stream);
    }
  };

  return breakpointAdder(breakpointSetter(undefined), displayedScriptSource());
}

module.exports = { addBreakpoint, changeMode, parseCaptures, parseSourceTree, pullEnvironment, pullScriptSource, queryInspector, step };
