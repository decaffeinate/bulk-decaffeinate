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
      let body;
      if (j.BlockStatement.check(declaration.init.body)) {
        body = declaration.init.body;
      } else {
        const comments = declaration.init.body.comments;
        body = j.blockStatement([
          j.returnStatement(declaration.init.body),
        ]);
        // Work around a bug in jscodeshift/recast where the comment, including
        // its newline, can be placed between the return and the expression,
        // causing ASI to treat it as an empty return followed by an expression
        // statement.
        declaration.init.body.comments = [];
        body.body[0].comments = comments;
      }
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
