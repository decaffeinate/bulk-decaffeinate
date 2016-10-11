/**
 * jscodeshift script that converts functions to use function declaration style
 * in common cases. For example, this code:
 *
 * let f = function() {
 *   return 3;
 * }
 *
 * becomes this code:
 *
 * function f() {
 *   return 3;
 * }
 *
 * Note that this happens whether the declaration is "var", "let", or "const".
 */
export default function transformer(file, api) {
  let j = api.jscodeshift;

  return j(file.source)
    .find(j.VariableDeclaration)
    .filter(path => {
      if (path.node.declarations.length !== 1) {
        return false;
      }
      let [declaration] = path.node.declarations;
      return declaration.init &&
        declaration.init.type === 'FunctionExpression' &&
        declaration.init.id === null;
    })
    .replaceWith(path => {
      let [declaration] = path.node.declarations;
      return j.functionDeclaration(
        declaration.id,
        declaration.init.params,
        declaration.init.body,
        declaration.init.generator,
        declaration.init.expression);
    })
    .toSource();
}
