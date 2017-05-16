import { join, relative } from 'path';

import execLive from '../util/execLive';

export default async function runJscodeshiftScripts(jsFiles, config) {
  for (let scriptPath of config.jscodeshiftScripts) {
    let resolvedPath = resolveJscodeshiftScriptPath(scriptPath);
    console.log(`Running jscodeshift script ${resolvedPath}...`);
    await execLive(`${config.jscodeshiftPath} --parser flow \
      -t ${resolvedPath} ${jsFiles.map(p => relative('', p)).join(' ')}`);
  }
}

function resolveJscodeshiftScriptPath(scriptPath) {
  if ([
      'prefer-function-declarations.js',
      'remove-coffee-from-imports.js',
      'top-level-this-to-exports.js',
    ].includes(scriptPath)) {
    return join(__dirname, `../jscodeshift-scripts-dist/${scriptPath}`);
  }
  return scriptPath;
}
