import { exists, readdir, stat, writeFile } from 'mz/fs';
import { exec } from 'mz/child_process';
import readline from 'mz/readline';
import { join } from 'path';

const NUM_CONCURRENT_PROCESSES = 4;

export default async function check() {
  console.log('Discovering .coffee files in the current directory...');
  let coffeeFiles = await getCoffeeFilesUnderPath('.');
  if (coffeeFiles.length === 0) {
    console.log('No CoffeeScript files were found in the current directory.');
    return;
  }
  let decaffeinateResults = await tryDecaffeinateFiles(coffeeFiles);
  if (decaffeinateResults === null) {
    return;
  }
  await printResults(decaffeinateResults);
}

async function getCoffeeFilesUnderPath(path) {
  let resultFiles = [];
  let children = await readdir(path);
  for (let child of children) {
    if (['node_modules', '.git'].includes(child)) {
      continue;
    }
    let childPath = join(path, child);
    if ((await stat(childPath)).isDirectory()) {
      let subdirCoffeeFiles = await getCoffeeFilesUnderPath(childPath);
      resultFiles.push(...subdirCoffeeFiles);
    } else if (child.endsWith('.coffee')) {
      resultFiles.push(childPath);
    }
  }
  return resultFiles;
}

async function tryDecaffeinateFiles(coffeeFiles) {
  let decaffeinateCommand = await getDecaffeinateCommand();
  if (decaffeinateCommand === null) {
    return null;
  }

  let numProcessed = 0;
  let numFailures = 0;
  let numTotal = coffeeFiles.length;
  console.log(
    `Trying decaffeinate on ${numTotal} files using ${NUM_CONCURRENT_PROCESSES} workers...`);

  let results = [];
  let activePromises = {};

  let handleResult = (result) => {
    results.push(result);
    if (result.error) {
      numFailures++;
    }
    numProcessed++;
    delete activePromises[result.path];
    process.stdout.write(`\r${numProcessed}/${numTotal} (${numFailures} failures so far)`);
  };

  for (let path of coffeeFiles) {
    activePromises[path] = tryDecaffeinate(decaffeinateCommand, path);
    if (Object.keys(activePromises).length >= NUM_CONCURRENT_PROCESSES) {
      handleResult(await Promise.race(Object.values(activePromises)));
    }
  }
  for (let promise of Object.values(activePromises)) {
    handleResult(await promise);
  }
  process.stdout.write('\nDone!\n\n');
  return results;
}

async function getDecaffeinateCommand() {
  let nodeModulesPath = './node_modules/.bin/decaffeinate';
  if (await exists(nodeModulesPath)) {
    return nodeModulesPath;
  } else {
    try {
      await exec('which decaffeinate');
      return 'decaffeinate';
    } catch (e) {
      console.log('decaffeinate binary not found on the PATH or in node_modules.');
      let rl = readline.createInterface(process.stdin, process.stdout);
      let answer = await rl.question('Run "npm install -g decaffeinate"? [Y/n] ');
      rl.close();
      if (answer.toLowerCase().startsWith('n')) {
        console.log('decaffeinate must be installed.');
        return null;
      }
      console.log('Installing decaffeinate globally...');
      console.log((await exec('npm install -g decaffeinate'))[0]);
      return 'decaffeinate';
    }
  }
}

async function tryDecaffeinate(decaffeinateCommand, path) {
  try {
    await exec(`${decaffeinateCommand} < '${path}'`);
    return {path, error: null};
  } catch (e) {
    return {path, error: getStdout(e)};
  }
}

function getStdout({message}) {
  let matchString = '\nstdin: ';
  if (message.indexOf(matchString) !== -1) {
    return message.substring(message.indexOf(matchString) + matchString.length);
  } else {
    return message.substring(message.indexOf('\n') + 1);
  }
}

async function printResults(results) {
  let errorResults = results.filter(r => r.error !== null);
  if (errorResults.length === 0) {
    console.log(`All checks succeeded! Decaffeinate can convert all ${results.length} files.`);
  } else {
    console.log(`${errorResults.length} files failed to convert:`);
    for (let result of errorResults) {
      console.log(result.path);
    }
    console.log();
    await writeFile('decaffeinate-errors.log', getVerboseErrors(results));
    await writeFile('decaffeinate-results.json', JSON.stringify(results, null, 2));
    console.log('Wrote decaffeinate-errors.log and decaffeinate-results.json with more detailed info.');
    console.log('To open failures in the online repl, run "bulk-decaffeinate view-errors"');
  }
}

function getVerboseErrors(results) {
  let errorMessages = [];
  for (let {path, error} of results) {
    if (error) {
      errorMessages.push(`***** ${path} failed:`);
      errorMessages.push(error);
    }
  }
  return errorMessages.join('\n');
}
