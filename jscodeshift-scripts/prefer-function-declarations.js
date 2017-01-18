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

      if (j.FunctionExpression.check(declaration.init)) {
        return declaration.init.id === null;
      }

      if (j.ArrowFunctionExpression.check(declaration.init)) {
        return j.Program.check(path.parent.node);
      }

      return false;
    })
    .replaceWith(path => {
      let [declaration] = path.node.declarations;
      let body = j.BlockStatement.check(declaration.init.body) ?
        declaration.init.body :
        j.blockStatement([
          j.returnStatement(declaration.init.body),
        ]);
      let resultNode = j.functionDeclaration(
        declaration.id,
        declaration.init.params,
        body,
        declaration.init.generator,
        declaration.init.expression);
      resultNode.comments = [
        ...(path.node.comments || []),
        ...(declaration.comments || []),
        ...(declaration.init.comments || []),
      ];
      return resultNode;
    })
    .toSource();
}
