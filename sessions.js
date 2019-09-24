const { parseOneLine, isMethod, isResult, isInput, isBreakpointCapture, isQueryCapture, isMessagesFocus, data } = require('./messages.js');
const { now, later, value, continuation, floatOn, commit, forget, IO } = require('streamer');
const { emptyList, cons, atom, compose, show, column, row, indent, vindent, sizeHeight, sizeWidth, inline } = require('terminal');

function debugSession(send, render) {
  return async (stream) => {
    return loop(await IO(show, render)
	         (compose(developerSession,
			  scriptSource,
			  runLocation,
			  scriptSourceWindowTopAnchor,
			  breakpoints,
			  environment,
			  messages,
			  messagesWindowTopAnchor,
			  commandLine))
	           (await IO(step, send)
	             (await IO(queryInspector, send)
		       (await IO(addBreakpoint, send)
		         (await IO(pullEnvironment, send)
		           (await IO(pullScriptSource, send)
		  	     (await changeMode(stream))))))));
    };
}

function DEBUG(f, g, h, i, j, k, l) {
  return `${scriptSourceWithLocationAndBreakpoints(f, g, h, i)}\n${j}\n${k}\n${l}`;
}

async function changeMode(stream) {
  const modalCapture = (category, continuation) => {
    const modeSetter = async (stream) => {
      if (isInput(data(value(now(stream))))) {
        if (data(value(now(stream))).input === "\r") {
          return floatOn(commit(stream, continuation), JSON.stringify(
	    Object.fromEntries([[category, data(value(now(stream))).input], ["ended", true]])
	  ));
        }
        else {
          return floatOn(commit(stream, modeSetter), JSON.stringify(
	    Object.fromEntries([[category, data(value(now(stream))).input], ["ended", false]])
	  ));
        }
      }
      else {
        return commit(stream, modeSetter);
      }
    };

    return modeSetter;
  };

  if (isInput(data(value(now(stream))))) {
    if (data(value(now(stream))).input === "q") {
      return floatOn(commit(stream, modalCapture("query", changeMode)), JSON.stringify({query: "", ended: false}));
    }
    else if (data(value(now(stream))).input === "b") {
      return floatOn(commit(stream, modalCapture("breakpoint", changeMode)), JSON.stringify({breakpoint: "", ended: false}));
    }
    else if (data(value(now(stream))).input === "m") {
      return floatOn(commit(stream, modalCapture("focusMessages", changeMode)), JSON.stringify({focusMessages: "", ended: false}));
    }
    else {
      return commit(stream, changeMode);
    }
  }
  else {
    return commit(stream, changeMode);
  }
}

function pullScriptSource(send) {
  const scriptChecker = scriptId => async (stream) => {
    if (isMethod(data(value(now(stream))), "Debugger.paused")) {
      const currentScriptId = data(value(now(stream))).params.callFrames[0].location.scriptId;

      if (scriptId !== currentScriptId) {
        send("Debugger.getScriptSource", {scriptId: currentScriptId});
      }

      return commit(stream, scriptChecker(currentScriptId));
    }
    else {
      return commit(stream, scriptChecker(scriptId));
    }
  }

  return scriptChecker(undefined);
}

function pullEnvironment(send) {
  const environmentChecker = async (stream) => {
    if (isMethod(data(value(now(stream))), "Debugger.paused")) {
      const environmentRemoteObject = data(value(now(stream))).params.callFrames[0].scopeChain[0].object.objectId;

      send("Runtime.getProperties", {objectId: environmentRemoteObject});

      return commit(stream, environmentChecker);
    }
    else {
      return commit(stream, environmentChecker);
    }
  };

  return environmentChecker;
}

function queryInspector(send) {
  const requester = query => async (stream) => {
    if (isQueryCapture(data(value(now(stream))) && !data(value(now(stream))).ended)) {
      return commit(stream, requester(parseUserInput(query, data(value(now(stream))).query)));
    }
    else if (isQueryCapture(data(value(now(stream)))) && data(value(now(stream))).ended) {
      send(...parseOneLine(query));

      return commit(stream, requester(""));
    }
    else {
      return commit(stream, requester(query));
    }
  };

  return requester("");
}

function step(send) {
  const stepper = async (stream) => {
    if (isInput(data(value(now(stream)))) && data(value(now(stream))).input === "n") {
      send("Debugger.stepOver", {});
    }
    else if (isInput(data(value(now(stream)))) && data(value(now(stream))).input === "s") {
      send("Debugger.stepInto", {});
    }
    else if (isInput(data(value(now(stream)))) && data(value(now(stream))).input === "c") {
      send("Debugger.resume", {});
    }
    else if (isInput(data(value(now(stream)))) && data(value(now(stream))).input === "f") {
      send("Debugger.stepOut", {});
    }

    return commit(stream, stepper);
  };

  return stepper;
}

function addBreakpoint(send) {
  const breakpointSetter = scriptId => line => async (stream) => {
    console.log(line);

    if (isMethod(data(value(now(stream))), "Debugger.paused")) {
      return commit(stream, breakpointSetter(data(value(now(stream))).params.callFrames[0].location.scriptId)(line));
    }
    else if (isBreakpointCapture(data(value(now(stream)))) && !data(value(now(stream))).ended) {
      return commit(stream, breakpointSetter(scriptId)(parseUserInput(line, data(value(now(stream))).breakpoint)));
    }
    else if (isBreakpointCapture(data(value(now(stream)))) && data(value(now(stream))).ended) {
      send("Debugger.setBreakpoint", {location: {scriptId: scriptId, lineNumber: Number(line)}});

      return commit(stream, breakpointSetter(scriptId)(""));
    }
    else {
      return commit(stream, breakpointSetter(scriptId)(line));
    }
  };

  return breakpointSetter(undefined)("");
}

function scriptSource(predecessor) {
  return stream => {
    if (isResult(data(value(now(stream))), "scriptSource")) {
      return () => data(value(now(stream))).result.scriptSource;
    }
    else {
      return predecessor ? predecessor : () => "Loading script source";
    }
  }
}

function scriptSourceWindowTopAnchor(predecessor) {
  return stream => {
    if (isInput(data(value(now(stream)))) && data(value(now(stream))).input === "j") {
      return () => { return {scriptId: predecessor().scriptId, topLine: predecessor().topLine + 1}; };
    }
    else if (isInput(data(value(now(stream)))) && data(value(now(stream))).input === "k") {
      return () => { return {scriptId: predecessor().scriptId, topLine: predecessor().topLine - 1}; };
    }
    else if (isMethod(data(value(now(stream))), "Debugger.paused")) {
      const currentLocation = data(value(now(stream))).params.callFrames[0].location;

      if (!predecessor || currentLocation.scriptId !== predecessor().scriptId) {
        return () => { return {scriptId: currentLocation.scriptId, topLine: Math.max(currentLocation.lineNumber - 3, 0)}; }
      }
      else {
        return predecessor;
      }
    }
    else {
      return predecessor ? predecessor : () => { return {scriptId: undefined, topLine: 0}; };
    }
  };
}

function runLocation(predecessor) {
  return stream => {
    if (isMethod(data(value(now(stream))), "Debugger.paused")) {
      const executionLocation = data(value(now(stream))).params.callFrames[0].location;

      return () => { return {scriptId: executionLocation.scriptId, lineNumber: executionLocation.lineNumber}; };
    }
    else {
      return predecessor ? predecessor : () => { return {scriptId: undefined, lineNumber: undefined }; };
    }
  };
}

function breakpoints(predecessor) {
  return stream => {
    if (isBreakpointCapture(data(value(now(stream)))) && data(value(now(stream))).ended) {
      return () => {
        return {scriptId: predecessor().scriptId,
		breakpoints: [...predecessor().breakpoints, {scriptId: predecessor().scriptId,
			                                     lineNumber: Number(data(value(now(stream))).breakpoint)}]};
      };
    }
    else if (isMethod(data(value(now(stream))), "Debugger.paused")) {
      return () => {
        return {scriptId: data(value(now(stream))).params.callFrames[0].location.scriptId,
	        breakpoints: predecessor ? predecessor().breakpoints : []};
      };
    }
    else {
      return predecessor ? predecessor : () => { return {scriptId: undefined, breakpoints: []}; };
    }
  };
}

function environment(predecessor) {
  return stream => {
    if (isResult(data(value(now(stream))), "result")) {
      return () => describeEnvironment(data(value(now(stream))).result.result);
    }
    else {
      return predecessor ? predecessor : () => "Loading environment";
    }
  }
}

function commandLine(predecessor) {
  return stream => {
    const defaultMessage = "q: Query Inspector  b: Add breakpoint  n: Step over  s: Step into  f: Step out  c: Continue  j: Scroll down  k: Scroll up";

    if (isBreakpointCapture(data(value(now(stream))))) {
      return data(value(now(stream))).ended ? () => defaultMessage
	                                    : () => `Add breakpoint at line: ${parseUserInput(predecessor(), data(value(now(stream))).breakpoint)}`;
    }
    else if (isQueryCapture(data(value(now(stream))))) {
      return data(value(now(stream))).ended ? () => defaultMessage
	                                    : () => `Query Inspector: ${parseUserInput(predecessor(), data(value(now(stream))).query)}`;
    }
    else {
      return predecessor ? predecessor : () => defaultMessage;
    }
  };
}

function messages(predecessor) {
  return stream => {
    if (isMethod(data(value(now(stream))), "Debugger.paused")) {
      return () => `${predecessor === undefined ? "" : predecessor() + "\n"}${Object.entries(data(value(now(stream))).params.callFrames[0].location)}`;
    }
    else {
      return predecessor ? predecessor : () => "Waiting";
    }
  };
}

function messagesWindowTopAnchor(predecessor) {
  return stream => {
    if (isMessagesFocus(data(value(now(stream)))) && data(value(now(stream))).focusMessages === "j") {
      return () => predecessor() + 1;
    }
    else if (isMessagesFocus(data(value(now(stream)))) && data(value(now(stream))).focusMessages === "k") {
      return () => predecessor() - 1;
    }
    else {
      return predecessor ? predecessor : () => 0;
    }
  };
}

function parseUserInput(parsed, currentInput) {
  if (currentInput === "\x7f") { // If backspace is delete
    return parsed.slice(0, -1);
  }
  else if (currentInput === "\r") {
    return parsed;
  }
  else {
    return `${parsed}${currentInput}`;
  }
}

function describeEnvironment(values) {
  return values.filter(item => !(item.name === "exports" || item.name === "require" || item.name === "module"
			               || item.name === "__filename" || item.name === "__dirname"))
               .reduce((description, item) => {
    return `${description}${item.value.type} ${item.name}${item.value  === "undefined" ? "" : ": " + item.value.value}\n`;
  }, "");
}

function scriptSourceWithLocationAndBreakpoints(scriptSource, location, scriptSourceWindowTopAnchor, breakpointLocations) {
  const formatScriptSource = (formattedLines, breakpoints, originalLines, originalLineId) => {
    if (originalLines.length === 0) {
      return formattedLines;
    }
    else {
      const hasBreakpoint = !(breakpoints.length === 0) && breakpoints[0].lineNumber === originalLineId;

      const isCurrentExecutionLocation = location.lineNumber === originalLineId;

      return formatScriptSource(
        [...formattedLines, `${hasBreakpoint ? "*" : " "}${isCurrentExecutionLocation ? "> " : "  "}${originalLines[0]}`],
        hasBreakpoint ? breakpoints.slice(1) : breakpoints,
        originalLines.slice(1),
        originalLineId + 1);
    }
  };

  return formatScriptSource([],
	                    breakpointLocations.breakpoints.filter(({scriptId, lineNumber}) => scriptId === location.scriptId)
	                                                   .sort(({scriptIdA, lineNumberA}, {scriptIdB, lineNumberB}) =>
				                             lineNumberA - lineNumberB),
	                    scriptSource.split("\n"),
	                    0)
	   .slice(scriptSourceWindowTopAnchor.topLine)
	   .reduce((formattedVisibleSource, line) =>
             `${formattedVisibleSource === "" ? formattedVisibleSource : formattedVisibleSource + "\n"}${line}`,
	     "");
}

function scrollable(content, topLine) {
  return content.split("\n").slice(topLine).reduce((visibleContent, line) =>
           `${visibleContent === "" ? visibleContent : visibleContent + "\n"}${line}`, "");
}

function developerSession(source, location, sourceWindowTopAnchor, breakpoints, environment, messages, messagesWindowTopAnchor, command) {
  return cons
	   (cons
	     (sizeWidth(50, atom(scriptSourceWithLocationAndBreakpoints(source, location, sourceWindowTopAnchor, breakpoints))),
	      cons
	        (cons
	          (sizeHeight(50, atom(environment)),
	           cons
	             (vindent(50, sizeHeight(50, atom(scrollable(messages, messagesWindowTopAnchor)))),
		     indent(50, column(50)))),
		 row(90))),
	    cons
	      (cons
	        (atom(command),
 		 vindent(90, row(10))),
	       emptyList()));
}

async function loop(stream) {
  return loop(await continuation(now(stream))(forget(await later(stream))));
}

module.exports = { debugSession };
