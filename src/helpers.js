const { deferredEntryLeafName, registerPendingEntry, selectNextEntry, selectPreviousEntry, visitChildEntry, visitChildEntrySilently, visitParentEntry } = require('./environmenttree.js');
const { entryName, isDirectoryEntry, isFileSelected, makeSelectionInFileTree, makeFileTree, refreshSelectedFileTree, selectedBranch, selectedEntry, selectedEntryBranchName, selectedEntryHandle, selectedEntryLeafName, selectNext, selectPrevious, visitChildBranch, visitParentBranch } = require('filetree');
const { columnNumber, entryValue, environmentTreeFocusInput, hasEnded, interactionKeys, isDebuggerPaused, isEnvironmentTreeFocus, isSourceTree, isSourceTreeFocus, lineNumber, message, name, pauseLocation, readSourceTree, scriptHandle, sourceTreeFocusInput, type } = require('./protocol.js');

// # Focusable Behaviour
function focusable(isFocus, alwaysHighlightedCharacter) {
  return focusableImpl(message => isFocus(message) && !hasEnded(message),
	               message => isFocus(message) && hasEnded(message),
	               alwaysHighlightedCharacter);
}

function focusableByDefault(isNotFocus, alwaysHighlightedCharacter) {
  return focusableImpl(message => isNotFocus(message) && hasEnded(message),
	               message => isNotFocus(message) && !hasEnded(message),
	               alwaysHighlightedCharacter);
}

function focusableImpl(onFocus, onLoseFocus, alwaysHighlightedCharacter) {
  return (text, stream) => {
    const clearText = text => text.replace("\u001b[1m", "").replace("\u001b[0m", "");

    if (onFocus(message(stream))) {
      return styleText(clearText(text), "bold");
    }
    else if (onLoseFocus(message(stream))) {
      return highlightOneCharacter(clearText(text), alwaysHighlightedCharacter ? alwaysHighlightedCharacter : "");
    }
    else {
      return text;
    }
  };
}

function highlightOneCharacter(text, character) {
  const highlightCharacter = (processedText, originalText) => {
    if (originalText.length === 0) {
      return processedText;
    }
    else if (originalText[0] === character) {
      return `${processedText}${styleText(originalText[0], "bold")}${originalText.slice(1)}`;
    }
    else {
      return highlightCharacter(`${processedText}${originalText[0]}`, originalText.slice(1));
    }
  };

  if (character === "") {
    return text;
  }
  else {
    return highlightCharacter("", text);
  }
}

function tabs(number, ...packagedContents) {
  return packagedContents.map((packagedContent, index) => {
    return (index === number ? label => `>${label}<` : label => label)(tag(packagedContent));
  })
	                 .join("-");
}

// ## Packaged Content
// A packaged content associates a label with the content.
function makePackagedContent(tag, content) {
  return [tag, content];
}

function tag(packagedContent) {
  return packagedContent[0];
}

function unpackedContent(packagedContent) {
  return packagedContent[1];
}

// # Scrollable Behaviour
function scrollable(isInput, input) {
  return (displayedContent, stream) => {
    if (isInput(message(stream)) && input(message(stream)) === interactionKeys("scrollDown")) {
      return makeDisplayedContent(content(displayedContent),
                                  Math.min(content(displayedContent).split("\n").length - 1,
					   topLine(displayedContent) + 1));
    }
    else if (isInput(message(stream)) && input(message(stream)) === interactionKeys("scrollUp")) {
      return makeDisplayedContent(content(displayedContent), Math.max(0, topLine(displayedContent) - 1));
    }
    else {
      return displayedContent;
    }
  };
}

function scrollableContent(displayedContent) {
  return content(displayedContent).split("\n").slice(topLine(displayedContent)).reduce((visibleContent, line) => {
    return `${visibleContent === "" ? visibleContent : visibleContent + "\n"}${line}`;
  }, "");
}

// ## Displayed Content
// A displayed content is a view over some long content defined by the starting line of the viewable part.
function makeDisplayedContent(content, topLine) {
  return [content, topLine ? topLine : 0];
}

function content(displayedContent) {
  return displayedContent[0];
}

function topLine(displayedContent) {
  return displayedContent[1];
}

// # Text Formatter
function styleText(text, style) {
  switch (style) {
    case 'black': return `\u001b[30m${text}\u001b[0m`;
    case 'red': return `\u001b[31m${text}\u001b[0m`;
    case 'green': return `\u001b[32m${text}\u001b[0m`;
    case 'yellow': return `\u001b[33m${text}\u001b[0m`;
    case 'blue': return `\u001b[34m${text}\u001b[0m`;
    case 'magenta': return `\u001b[35m${text}\u001b[0m`;
    case 'cyan': return `\u001b[36m${text}\u001b[0m`;
    case 'white': return `\u001b[37m${text}\u001b[0m`;
    case 'bold': return `\u001b[1m${text}\u001b[0m`;
    case 'reversed': return `\u001b[7m${text}\u001b[0m`;
    case 'underline': return `\u001b[4m${text}\u001b[0m`;
  }
}

// # Tree Explorers
// ## Environment Tree Explorers
function exploreEnvironmentTree(selectionInEnvironmentTree, pendingEntriesRegister, stream, continuation) {
  return (newSelection => continuation(newSelection, registerPendingEntry(pendingEntriesRegister, newSelection)))
	   (exploreEnvironmentTreeImpl(visitChildEntry)(selectionInEnvironmentTree, stream));
}

function exploreEnvironmentTreeImpl(visitChildEntry) {
  return (selectionInEnvironmentTree, stream) => {
    if (isEnvironmentTreeFocus(message(stream))
	  && environmentTreeFocusInput(message(stream)) === interactionKeys("selectNext")) {
      return selectNextEntry(selectionInEnvironmentTree);
    }
    else if (isEnvironmentTreeFocus(message(stream))
	       && environmentTreeFocusInput(message(stream)) === interactionKeys("selectPrevious")) {
      return selectPreviousEntry(selectionInEnvironmentTree);
    }
    else if (isEnvironmentTreeFocus(message(stream))
	       && environmentTreeFocusInput(message(stream)) === interactionKeys("selectChild")) {
      return visitChildEntry(selectionInEnvironmentTree);
    }
    else if (isEnvironmentTreeFocus(message(stream))
	       && environmentTreeFocusInput(message(stream)) === interactionKeys("selectParent")) {
      return visitParentEntry(selectionInEnvironmentTree);
    }
    else {
      return selectionInEnvironmentTree;
    }
  };
}

function exploreEnvironmentTreeSilently(selectionInEnvironmentTree, stream, continuation) {
  return continuation(exploreEnvironmentTreeImpl(visitChildEntrySilently)(selectionInEnvironmentTree, stream));
}

// ## Source Tree Explorers
function displayedScriptSource() {
  const displayUpdater = (selectionInSourceTree, scriptId) => (continuation, onDisplayChange) => stream => {
    if (isDebuggerPaused(message(stream))) {
      const currentScriptId = scriptHandle(pauseLocation(message(stream)));

      if (scriptId !== currentScriptId) {
        return onDisplayChange(displayUpdater(selectionInSourceTree, currentScriptId), currentScriptId);
      }
      else {
        return continuation(displayUpdater(selectionInSourceTree, currentScriptId), currentScriptId);
      }
    }
    else {
      const selectionChange = selectionInSourceTree => {
        return continuation(displayUpdater(selectionInSourceTree, scriptId), scriptId);
      };

      const displayChange = selectionInSourceTree => {
	const scriptId = selectedEntryHandle(selectedEntry(selectionInSourceTree));

        return onDisplayChange(displayUpdater(selectionInSourceTree, scriptId), scriptId);
      };
      
      return exploreSourceTree(selectionInSourceTree, stream, selectionChange, displayChange);
    }
  };

  return displayUpdater(makeSelectionInFileTree(makeFileTree()), undefined);
}

function exploreSourceTree(selectionInSourceTree, stream, continuation, onFilePicked) {
  if (isSourceTree(message(stream))) {
    return continuation(refreshSelectedFileTree(selectionInSourceTree, readSourceTree(message(stream))));
  }
  else if (isSourceTreeFocus(message(stream)) && sourceTreeFocusInput(message(stream)) === interactionKeys("selectNext")) {
    return continuation(selectNext(selectionInSourceTree));
  }
  else if (isSourceTreeFocus(message(stream)) && sourceTreeFocusInput(message(stream)) === interactionKeys("selectPrevious")) {
    return continuation(selectPrevious(selectionInSourceTree));
  }
  else if (isSourceTreeFocus(message(stream)) && sourceTreeFocusInput(message(stream)) === interactionKeys("selectChild")) {
    return continuation(visitChildBranch(selectionInSourceTree));
  }
  else if (isSourceTreeFocus(message(stream)) && sourceTreeFocusInput(message(stream)) === interactionKeys("selectParent")) {
    return continuation(visitParentBranch(selectionInSourceTree));
  }
  else if (isSourceTreeFocus(message(stream))
	     && sourceTreeFocusInput(message(stream)) === enterInput()
	     && isFileSelected(selectedEntry(selectionInSourceTree))) {
    return onFilePicked(selectionInSourceTree);
  }
  else {
    return continuation(selectionInSourceTree);
  }
}

// # User Input
function backspaceInput() {
  return "\x7f";
}

function ctrlCInput() {
  return "\x03";
}

function enterInput() {
  return "\r";
}

function parseUserInput(parsed, currentInput) {
  if (currentInput === backspaceInput()) {
    return parsed.slice(0, -1);
  }
  else if (currentInput === enterInput()) {
    return parsed;
  }
  else {
    return `${parsed}${currentInput}`;
  }
}

// # Writers
// ## Script Source Writer
function writeScriptSource(scriptSource, runLocation, breakpoints, displayedScript) {
  const formatScriptSource = (formattedLines, breakpoints, originalLines, originalLineNumber) => {
    if (originalLines.length === 0) {
      return formattedLines;
    }
    else {
      const hasBreakpoint = !(breakpoints.length === 0) && lineNumber(breakpoints[0]) === originalLineNumber;

      const lineNumberPrefix = lineNumber => {
        if (lineNumber.toString().length < 4) {
	  return `${lineNumber.toString().padEnd(3, ' ')}|`;
	}
	else {
          return `${lineNumber.toString()}|`;
	}
      };

      const runLocationHighlights = line => {
	const highlightCurrentExpression = line => {
	  const highlightCurrentExpressionImpl = (beforeHighlight, line) => {
	    const isOneOf = (characterSelection, character) => {
	      if (characterSelection.length === 0) {
	        return false;
	      }
	      else if (characterSelection[0] === character) {
	        return true;
	      }
	      else {
	        return isOneOf(characterSelection.slice(1), character);
	      }
	    };

	    if (line.length === 0) {
	      return beforeHighlight;
	    }
	    else if (isOneOf("[({ })]=>\r\n;", line[0])) {
	      return highlightCurrentExpressionImpl(`${beforeHighlight}${line[0]}`, line.slice(1));
	    }
	    else {
	      return (expression => `${beforeHighlight}${styleText(expression, "bold")}${line.slice(expression.length)}`)
	               (line.match(/^[a-zA-Z0-9\"\']+/g)[0]);
	    }
	  };

	  return highlightCurrentExpressionImpl("", line);
	};

        if (scriptHandle(runLocation) === displayedScript && lineNumber(runLocation) === originalLineNumber) {
	  return `> ${line.slice(0, columnNumber(runLocation))}${highlightCurrentExpression(line.slice(columnNumber(runLocation)))}`;
        }
	else {
          return `  ${line}`;
        }
      };

      return formatScriptSource([...formattedLines,`${lineNumberPrefix(originalLineNumber)}${hasBreakpoint ? "*" : " "}${runLocationHighlights(originalLines[0])}`],
                                hasBreakpoint ? breakpoints.slice(1) : breakpoints,
                                originalLines.slice(1),
                                originalLineNumber + 1);
    }
  };

  return scrollableContent(makeDisplayedContent(formatScriptSource([],
	                                                           breakpoints.filter(breakpoint => {
								     return scriptHandle(breakpoint) === displayedScript;
	                                                           })
	                                                                      .sort((breakpointA, breakpointB) => {
								     return lineNumber(breakpointA) - lineNumber(breakpointB);
							           }),
	                                                           content(scriptSource).split("\n"),
	                                                           0).join("\n"),
	                                        topLine(scriptSource)));
}

// ## Tree Writers 
function writeTreeImpl(visitedTree, filterBranch) {
  const formatEntry = entry => {
    return (entryName(entry) === selectedEntryLeafName(selectedEntry(visitedTree))
      ? entryName => `\u001b[7m${entryName}\u001b[0m`
      : entryName => entryName)(
        (isDirectoryEntry(entry) ? entryName => styleText(entryName, "bold")
	                         : entryName => entryName)(
          entryName(entry)));
  };

  return (selectedEntryBranchName(selectedEntry(visitedTree)) === "" 
    ? `${styleText("root", "bold")}\n`
    : `${styleText(selectedEntryBranchName(selectedEntry(visitedTree)), "bold")}\n`) 
    + selectedBranch(visitedTree).filter(entry => filterBranch ? filterBranch(entry) : true)
		                 .map(entry => `  ${formatEntry(entry)}\n`).join("");
}

// ### Environment Tree Writer
function describeEnvironment(entries) {
  return entries.filter(entry => !(name(entry) === "exports" || name(entry) === "require" || name(entry) === "module"
			           || name(entry) === "__filename" || name(entry) === "__dirname"))
               .reduce((description, entry) => {
    return `${description}${type(entry)} ${name(entry)}${entryValue(entry) ? ": " + entryValue(entry) : ""}\n`;
  }, "");
}

function writeEnvironmentTree(visitedEnvironmentTree) {
  return writeTreeImpl(visitedEnvironmentTree, entry => entryName(entry) !== deferredEntryLeafName());
}

// ### Source Tree Writer
function writeSourceTree(visitedSourceTree) {
  return writeTreeImpl(visitedSourceTree);
}

module.exports = {
  backspaceInput,
  content,
  ctrlCInput,
  describeEnvironment,
  displayedScriptSource,
  enterInput,
  exploreEnvironmentTree,
  exploreEnvironmentTreeSilently,
  exploreSourceTree,
  focusable,
  focusableByDefault,
  highlightOneCharacter,
  makeDisplayedContent,
  makePackagedContent,
  parseUserInput,
  scrollable,
  scrollableContent,
  styleText,
  tabs,
  tag,
  topLine,
  unpackedContent,
  writeEnvironmentTree,
  writeScriptSource,
  writeSourceTree
};
