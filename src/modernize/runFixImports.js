/**
 * Runs the fix-imports step on all specified JS files, and return an array of
 * the files that changed.
 */
import { readFile } from 'fs-promise';
import { basename, join, relative, resolve } from 'path';
import zlib from 'zlib';

import runWithProgressBar from '../runner/runWithProgressBar';
import execLive from '../util/execLive';
import getFilesUnderPath from '../util/getFilesUnderPath';

export default async function runFixImports(jsFiles, config) {
  let {searchPath, absoluteImportPaths} = config.fixImportsConfig;
  if (!absoluteImportPaths) {
    absoluteImportPaths = [];
  }
  let scriptPath = join(__dirname, '../jscodeshift-scripts-dist/fix-imports.js');

  let options = {
    convertedFiles: jsFiles.map(p => resolve(p)),
    absoluteImportPaths: absoluteImportPaths.map(p => resolve(p)),
  };
  let eligibleFixImportsFiles = await getEligibleFixImportsFiles(
    config, searchPath, jsFiles);
  console.log('Fixing any imports across the whole codebase...');
  if (eligibleFixImportsFiles.length > 0) {
    // Note that the args can get really long, so we take reasonable steps to
    // reduce the chance of hitting the system limit on arg length
    // (256K by default on Mac).
    let eligibleRelativePaths = eligibleFixImportsFiles.map(p => relative('', p));
    let encodedOptions = zlib.deflateSync(JSON.stringify(options)).toString('base64');
    await execLive(`\
      ${config.jscodeshiftPath} --parser flow -t ${scriptPath} \
        ${eligibleRelativePaths.join(' ')} --encoded-options=${encodedOptions}`);
  }
  return eligibleFixImportsFiles;
}

async function getEligibleFixImportsFiles(config, searchPath, jsFiles) {
  let jsBasenames = jsFiles.map(p => basename(p, '.js'));
  let resolvedPaths = jsFiles.map(p => resolve(p));
  let allJsFiles = await getFilesUnderPath(searchPath, p => p.endsWith('.js'));
  await runWithProgressBar(
    config,
    'Searching for files that may need to have updated imports...',
    allJsFiles,
    async function(p) {
      let resolvedPath = resolve(p);
      if (resolvedPaths.includes(resolvedPath)) {
        return {error: null};
      }
      let contents = (await readFile(resolvedPath)).toString();
      for (let jsBasename of jsBasenames) {
        if (contents.includes(jsBasename)) {
          resolvedPaths.push(resolvedPath);
          return {error: null};
        }
      }
      return {error: null};
    });
  return resolvedPaths;
}
