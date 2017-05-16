import { exec } from 'mz/child_process';

import runWithProgressBar from '../runner/runWithProgressBar';
import CLIError from '../util/CLIError';
import prependToFile from '../util/prependToFile';

export default async function runEslintFix(jsFiles, config) {
  let eslintResults = await runWithProgressBar(
    'Running eslint --fix on all files...', jsFiles, makeEslintFixFn(config));
  for (let result of eslintResults) {
    for (let message of result.messages) {
      console.log(message);
    }
  }
}

export const HEADER_COMMENT_LINES = {
  todo: '// TODO: This file was created by bulk-decaffeinate.',
  fixIssues: '// Fix any style issues and re-enable lint.',
  sanityCheck: '// Sanity-check the conversion and remove this comment.',
};

function makeEslintFixFn(config) {
  return async function runEslint(path) {
    let messages = [];

    // Ignore the eslint exit code; it gives useful stdout in the same format
    // regardless of the exit code. Also keep a 10MB buffer since sometimes
    // there can be a LOT of lint failures.
    let eslintOutputStr = (await exec(
      `${config.eslintPath} --fix --format json ${path}; :`,
      {maxBuffer: 10000*1024}))[0];

    let ruleIds;
    if (eslintOutputStr.includes("ESLint couldn't find a configuration file")) {
      messages.push(`Skipping "eslint --fix" on ${path} because there was no eslint config file.`);
      ruleIds = [];
    } else {
      let eslintOutput;
      try {
        eslintOutput = JSON.parse(eslintOutputStr);
      } catch (e) {
        throw new CLIError(`Error while running eslint:\n${eslintOutputStr}`);
      }
      ruleIds = eslintOutput[0].messages
        .map(message => message.ruleId).filter(ruleId => ruleId);
      ruleIds = Array.from(new Set(ruleIds)).sort();
    }

    await prependToFile(`${path}`, `\
${HEADER_COMMENT_LINES.todo}
${ruleIds.length > 0 ? HEADER_COMMENT_LINES.fixIssues : HEADER_COMMENT_LINES.sanityCheck}
`);
    if (ruleIds.length > 0) {
      await prependToFile(`${path}`, `\
/* eslint-disable
${ruleIds.map(ruleId => `    ${ruleId},`).join('\n')}
*/
`);
    }
    return {error: null, messages};
  };
}
