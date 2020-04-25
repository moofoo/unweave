const { environmentTree } = require('../src/components.js');
const { tag, unpackedContent, writeEnvironmentTree } = require('../src/helpers.js');
const { init } = require('../src/init.js');
const { changeMode, loop, parseEnvironmentTree, step } = require('../src/processes.js');
const { atom, compose, label, show, TerminalTest } = require('terminal');
const { skipToDebuggerPausedAfterStepping, userInput } = require('../src/testutils.js');

function test_environment(send, render, terminate) {
  const userInteraction = async (stream) => {
    userInput("n", 1000);
    userInput("e", 2000);
    userInput("l", 2500);
    userInput("j", 3000);
    userInput("k", 3500);
    userInput("h", 4000);
    userInput("\r", 4500);
    userInput("\x03", 5000);

    return stream;
  };

  const environmentDisplay = environment => label(atom(writeEnvironmentTree(unpackedContent(environment))), tag(environment));

  return async (stream) => {
    return loop(terminate)
	     (await userInteraction
	       (await show(render)(compose(environmentDisplay, environmentTree()))
		 (await step(send)
	           (await parseEnvironmentTree(send)
		     (await changeMode
	               (await skipToDebuggerPausedAfterStepping(send, 0)(stream)))))));
  };
}

TerminalTest.reviewDisplays([
  TerminalTest.makeTestableReactiveDisplay(test_environment, "Environment With Object", (displayTarget, test, finish) => {
    return init(["node", "app.js", "test_target.js"], test, finish, displayTarget);
  }),
  TerminalTest.makeTestableReactiveDisplay(test_environment, "Environment With Array", (displayTarget, test, finish) => {
    return init(["node", "app.js", "test_target_array.js"], test, finish, displayTarget);
  })
]);
