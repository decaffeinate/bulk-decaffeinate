/**
 * jscodeshift script that converts top-level `this` usages to explicitly be the
 * `exports` identifier, which is the meaning of top-level `this` for node.
 */
export default function transformer(file, api) {
  const j = api.jscodeshift;

  return j(file.source)
    .find(j.ThisExpression)
    .forEach(path => {
      console.log(j.types);
      if (isAtTopLevel(path)) {
        j(path).replaceWith(
          j.identifier('exports')
        );
      }
    })
    .toSource();
}

function isAtTopLevel(thisPath) {
  let path = thisPath;
  while (path) {
    let type = path.node.type;
    // Check the node name to see if this ancestor defines a meaning to `this`.
    // Doing string matching on the name is sort of hacky, but this check works
    // with all parsers that I'm aware of and makes it less likely that we
    // missed a case like async functions.
    if ((type.includes('Function') || type.includes('Method')) &&
        !type.includes('ArrowFunction')) {
      return false;
    }
    path = path.parentPath;
  }
  return true;
}
