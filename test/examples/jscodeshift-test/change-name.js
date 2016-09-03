export default function transformer(file, api) {
  const j = api.jscodeshift;
  return j(file.source)
    .find(j.Identifier)
    .replaceWith(
      p => {
        if (p.node.name === 'nameBefore') {
          return j.identifier('nameAfter');
        } else {
          return p.node;
        }
      }
    )
    .toSource();
}
