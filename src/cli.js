import 'babel-polyfill';
import { exists, readdir, stat } from 'mz/fs';
import { exec } from 'mz/child_process';
import { join } from 'path';

const NUM_CONCURRENT_PROCESSES = 4;

export default function run() {
  let startTime = new Date();
  testFiles()
    .then(() => {console.log(`Time taken: ${(new Date() - startTime) / 1000} seconds`);})
    .catch((error) => console.error(error));
}

async function testFiles() {
  console.log('Discovering .coffee files in the current directory...');
  let coffeeFiles = await getCoffeeFilesUnderPath('.');
  let decaffeinateResults = await tryDecaffeinateFiles(coffeeFiles);
  printResults(decaffeinateResults);
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

  let numProcessed = 0;
  let numFailures = 0;
  let numTotal = coffeeFiles.length;
  console.log(`Trying decaffeinate on ${numTotal} files...`);

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
  process.stdout.write('\n');
  return results;
}

async function tryDecaffeinate(decaffeinateCommand, path) {
  try {
    await exec(`${decaffeinateCommand} < '${path}'`);
    return {path, error: null};
  } catch (e) {
    return {path, error: e}
  }
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
      throw new Error(
        'decaffeinate binary not found. Make sure it is on your PATH or in node_modules.');
    }
  }
}

function printResults(results) {
  for (let {path, error} of results) {
    if (error) {
      console.log(`\n***** ${path} failed:`);
      console.log(getStdout(error));
    }
  }
}

function getStdout({message}) {
  let matchString = '\nstdin: ';
  if (message.indexOf(matchString) !== -1) {
    return message.substring(message.indexOf(matchString) + matchString.length)
  } else {
    return message.substring(message.indexOf('\n') + 1);
  }
}
