//testSourceTreeParser();

function testSourceTreeParser() {
  const [pathA, fileNameA] = parseFilePath("file:///A/B/a.js".slice("file://".length));
  const [pathB, fileNameB] = parseFilePath("file:///A/B/b.js".slice("file://".length));
  const [pathC, fileNameC] = parseFilePath("file:///A/B/C/c.js".slice("file://".length));
  const [pathD, fileNameD] = parseFilePath("file:///A/d.js".slice("file://".length));
  const [pathE, fileNameE] = parseFilePath("file:///A/B/D/e.js".slice("file://".length));

  const sourceTreeA = insertInSourceTree({root: "/A", branches: []}, pathA, {name: fileNameA, id: 0});
  const sourceTreeB = insertInSourceTree(sourceTreeA, pathB, {name: fileNameB, id: 1});
  const sourceTreeC = insertInSourceTree(sourceTreeB, pathC, {name: fileNameC, id: 2});
  const sourceTreeD = insertInSourceTree(sourceTreeC, pathD, {name: fileNameD, id: 3});
  const sourceTreeE = insertInSourceTree(sourceTreeD, pathE, {name: fileNameE, id: 4});

  console.log(JSON.stringify(sourceTreeA));
  console.log(JSON.stringify(sourceTreeB));
  console.log(JSON.stringify(sourceTreeC));
  console.log(JSON.stringify(sourceTreeD));
  console.log(JSON.stringify(sourceTreeE));
}

function parseFilePath(url) {
  return (elements => [elements.slice(0, -1).join("/"), elements[elements.length - 1]])(url.split("/"));
}

function directoryName(directoryEntry) {
  return directoryEntry[0];
}

function directoryContent(directoryEntry) {
  return directoryEntry[1];
}

function makeDirectoryEntry(name, content) {
  return [name, content];
}

function isDirectoryEntry(entry) {
  return Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && Array.isArray(entry[1])
}

function fileName(fileEntry) {
  return fileEntry[0];
}

function fileId(fileEntry) {
  return fileEntry[1];
}

function makeFileEntry(name, id) {
  return [name, id];
}

function entryName(entry) {
  return isDirectoryEntry(entry) ? directoryName(entry) : fileName(entry);
}

function root(sourceTree) {
  return sourceTree[0];
}

function branches(sourceTree) {
  return sourceTree[1];
}

function makeSourceTree(root, branches) {
  return [root, branches ? branches : []];
}

function insertInSourceTree(sourceTree, path, file) {
  const insertInSourceTreeImpl = (branch, path, file) => {
    if (path.length === 0) {
      return [...branch, file];
    }
    else if (branch.length === 0) {
      return [makeDirectoryEntry(path[0], insertInSourceTreeImpl(branch, path.slice(1), file))];
    }
    else {
      if (!isDirectoryEntry(branch[0])) {
        return [].concat([branch[0]], insertInSourceTreeImpl(branch.slice(1), path, file));
      }
      else {
        if (directoryName(branch[0]) === path[0]) {
          return [makeDirectoryEntry(path[0], insertInSourceTreeImpl(directoryContent(branch[0]), path.slice(1), file)),
		  ...branch.slice(1)];
        }
	else {
	  return [].concat([branch[0]], insertInSourceTreeImpl(branch.slice(1), path, file));
        }
      }
    }
  };

  return makeSourceTree(root(sourceTree),
	                insertInSourceTreeImpl(branches(sourceTree), path.slice(root(sourceTree).length).split("/").slice(1),
				               file));
}

function lookupBranch(sourceTree, path) {
  const lookupBranchImpl = (branch, path) => {
    if (path.length === 0) {
      return branch;
    }
    else if (branch.length === 0) {
      return [];
    }
    else if (isDirectoryEntry(branch[0]) && directoryName(branch[0]) === path[0]) {
      return lookupBranchImpl(directoryContent(branch[0]), path.slice(1));
    }
    else {
      return lookupBranchImpl(branch.slice(1), path);
    }
  };

  return lookupBranchImpl(branches(sourceTree), path.split("/").slice(1));
}

function lookupNextInBranch(branch, namedEntry, errorFunction) {
  if (branch.length === 0) {
    return errorFunction(namedEntry);
  }
  else if (entryName(branch[0]) === namedEntry) {
    if (branch.length === 1) {
      return branch[0];
    }
    else {
      return branch[1];
    }
  }
  else {
    return lookupNextInBranch(branch.slice(1), namedEntry, errorFunction);
  }
}

function lookupPreviousInBranch(branch, namedEntry, errorFunction) {
  const lookupPreviousInBranchImpl = (previous, branch, namedEntry, errorFunction) => {
    if (branch.length === 0) {
      return errorFunction(namedEntry);
    }
    else if (entryName(branch[0]) === namedEntry) {
      return previous;
    }
    else {
      return lookupPreviousInBranchImpl(branch[0], branch.slice(1), namedEntry, errorFunction);
    }
  };

  return lookupPreviousInBranchImpl(branch[0], branch, namedEntry, errorFunction);
}

module.exports = { branches, directoryContent, directoryName, entryName, fileId, fileName, insertInSourceTree, isDirectoryEntry, lookupBranch, lookupNextInBranch, lookupPreviousInBranch, makeFileEntry, makeSourceTree, parseFilePath, root };
