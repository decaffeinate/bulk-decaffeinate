# bulk-decaffeinate

[![Build Status](https://travis-ci.org/alangpierce/bulk-decaffeinate.svg?branch=master)](https://travis-ci.org/alangpierce/bulk-decaffeinate)
[![npm version](https://badge.fury.io/js/bulk-decaffeinate.svg)](https://www.npmjs.com/package/bulk-decaffeinate)
[![MIT License](https://img.shields.io/npm/l/express.svg?maxAge=2592000)](LICENSE)

A tool, backed by [decaffeinate](http://decaffeinate-project.org/), to help you
convert some or all of a CoffeeScript codebase to JavaScript.

The tool can check a codebase for decaffeinate-readiness, and once the code (or
a part of it) is ready, bulk-decaffeinate can actually run the conversion and
some follow-up cleanups. Here's an example of checking the Hubot repo:
```
> npm install -g bulk-decaffeinate decaffeinate eslint
...
> git clone git@github.com:github/hubot.git
...
> cd hubot
> bulk-decaffeinate check
Discovering .coffee files in the current directory...
Trying decaffeinate on 18 files using 4 workers...
18/18 (7 failures so far)
Done!

7 files failed to convert:
src/adapters/shell.coffee
src/adapters/campfire.coffee
src/brain.coffee
src/message.coffee
src/user.coffee
src/robot.coffee
test/brain_test.coffee

Wrote decaffeinate-errors.log and decaffeinate-results.json with more detailed info.
To open failures in the online repl, run "bulk-decaffeinate view-errors"
> bulk-decaffeinate view-errors
(7 browser tabs are opened, showing all failures.)
```

Once any failures are resolved (generally by tweaking the CoffeeScript to work
with decaffeinate), the command `bulk-decaffeinate convert` generates three git
commits to convert the files to JS.

## Assumptions

While the underlying [decaffeinate](https://github.com/decaffeinate/decaffeinate)
tool tries to be general-purpose, bulk-decaffeinate intentionally makes some
assumptions about your use case:

* Your build tooling can already handle JavaScript. Replacing a .coffee file
  with a .js file will "just work" as long as the files are equivalent.
* Adding some extra .original.coffee files as temporary backups won't cause
  trouble.
* You are using git for source control and all .coffee files being converted are
  already tracked in the git repo.
* You are using eslint for JS linting and you already have a .eslintrc file
  specifying your preferred styles.

Feel free to file an issue or submit a PR if these assumptions don't match your
current project. Most steps shouldn't be hard to disable using a config setting.

## What it does

bulk-decaffeinate supports a number of commands:
* `check` does a dry run of decaffeinate on the specified files and reports how
  decaffeinate-ready the set of files is.
* `view-errors` should be run after `check` reports failures. It opens the
  failed files in the [online decaffeinate repl](http://decaffeinate-project.org/repl/),
  with one browser tab per failed file. Each browser tab loads the online repl
  page with your source code encoded in the hash fragment of the URL. Because it
  is in the hash fragment and not a regular query param, your code is never sent
  to the server.
* `convert` actually converts the files from CofeeScript to JavaScript.
* `clean` deletes all .original.coffee files in the current directory or any of
  its subdirectories.
* `land` packages multiple commits into a merge commit based on an remote branch
  (`origin/master` by default). Splitting the decaffeinate work into separate
  commits allows git to properly track file history, but it can create added
  difficulty after code review is finished, and `land` helps with that. The
  `land` command does not actually push any commits; it just creates a merge
  commit that is ready to push after a sanity check.
  
  If the `phabricatorAware` option is set, the `land` command does extra work to
  make sure that every commit has a "Differential Revision" line and that the
  final merge commit has the commit description.

Here's what `convert` does in more detail:
  1. It does a dry run of decaffeinate on all files to make sure there won't be
     any failures.
  2. It backs up all .coffee files to .original.coffee files, which makes it
     easily to manually do a before-and-after comparison later.
  3. It generates a commit renaming the files from .coffee to .js (but not
     changing the contents). Putting this step in its own commit allows git to
     track the file history across renames (so, if possible, you should land the
     changes as a merge commit rather than squashing the commits together).
  4. It runs decaffeinate on all files and gets rid of the .coffee files, then
     generates a commit.
  5. If the `jscodeshiftScripts` config value is specified, it runs
     [jscodeshift](https://github.com/facebook/jscodeshift) with those scripts
     in the order specified.
  6. If the `mochaEnvFilePattern` config value is specified, it prepends
     `/* eslint-env mocha */` to the top of every test file.
  7. If the `fixImportsConfig` config value is specified, it runs a transform
     that does whole-codebase analysis to fix any import problems that might
     have been introduced by decaffeinate.
  8. It runs `eslint --fix` on all files, which applies some style fixes
     according to your lint rules. For any remaining lint failures, it puts a
     comment at the top of the file disabling those specific lint rules and
     leaves a TODO comment to fix any remaining style issues.
  9. All post-decaffeinate changes are committed as a third commit.

In all generated commits, "decaffeinate" is used as the author name (but not the
email address). This makes it clear to people using `git blame` that the file
was generated using decaffeinate, and not necessarily authored by the person who
happened to run the decaffeinate script.

If you want to see the full details, the [source code](src/convert.js) should
hopefully be fairly readable.

## Configuration

You can specify custom configuration in a config file, usually called
`bulk-decaffeinate.config.js`, in the current working directory. It should
export a JS object with your config. Any file starting with `bulk-decaffeinate`
and ending with `.config.js` will be counted, and multiple config files may
exist at once. If there are multiple config files, they are merged, with
alphabetically-later config file names taking precedence over
alphabetically-earlier files. Many config options can also be specified
directly as CLI arguments, with CLI arguments taking precedence over any config
file setting.

Here's an example config file:

```js
module.exports = {
  jscodeshiftScripts: [
    './scripts/dev/codemods/arrow-function.js',
    './scripts/dev/codemods/rd-to-create-element.js',
    './scripts/dev/codemods/create-element-to-jsx.js',
  ],
  mochaEnvFilePattern: '^.*-test.js$',
  fixImportsConfig: {
    searchPath: './coffee',
    absoluteImportPaths: ['./coffee'],
  },
};
```

### Specifying files to process

The following config keys can be specified:

* `searchDirectory`: a path to a directory where bulk-decaffeinate will search
  for all .coffee files (ignoring files in `node_modules` directories).
* `pathFile`: a path to a file containing a list of .coffee file paths to
  process, one per line.
* `filesToProcess`: an array of .coffee file paths to process.

The `filesToProcess` setting has highest precedence, then `pathFile`, then
`searchDirectory`.

Each of these has a command line arg version; see the result of `--help` for
more information.

### Other configuration

* `decaffeinateArgs`: an optional array of additional command-line arguments to
  pass to decaffeinate. For example, `['--keep-commonjs']` sets the preference
  to keep `require` and `module.exports` rather than converting them to `import`
  and `export`.
* `jscodeshiftScripts`: an optional array of paths to
  [jscodeshift](https://github.com/facebook/jscodeshift) scripts to run after
  decaffeinate. This is useful to automate any cleanups to convert the output of
  decaffeinate to code matching your JS style. In addition, you can specify any
  of the built-in scripts included with this package, currently just
  `prefer-function-declarations.js`.
* `fixImportsConfig`: an optional object. If present, a whole-codebase pass will
  be done to fix any incorrect imports involving the converted files. It should
  be an object with up to two fields:
  * `searchPath`: a required field specifying a path to a directory containing
    all JS files in the project.
  * `absoluteImportPaths`: an optional array of strings, each of which is used
    as an absolute path starting point when resolving imports. This is necessary
    if you do any tricks to get absolute-style imports in your project, since
    the fix-imports script needs to be able to resolve import names to files.
* `mochaEnvFilePattern`: an optional regular expression string. If specified,
  all generated JavaScript files with a path matching this pattern have the text
  `/* eslint-env mocha */` added to the start. For example, `"^.*-test.js$"`.
* `landConfig`: an object with preferences for the `land` command. There are
  three available options:
  * `remote`: an optional string with the name of the remote component of the
    branch to base commits off of. Defaults to `origin`.
  * `upstreamBranch`: an optional string with the name of the remote branch to
    base commits off of. Defaults to `master`. For example, if both `remote` and
    `upstreamBranch` are unspecified, then commits are created based on
    `origin/master`.
  * `phabricatorAware`: an optional boolean that's useful if you're using
    Phabricator for code review. If specified, the generated commits will all
    have a proper "Differential Revision" line and the final merge commit will
    be run through `arc amend` to pull in the updated commit message.
* `landBase`: if specified, overrides the auto-detected base commit when running
    the `land` command. Generally this is specified on the command line using
    `--land-base` rather than in a config file.
* `skipVerify`: set to `true` to skip the initial verification step when running
  the `convert` command. This makes bulk-decaffeinate take less time, but if any
  files fail to convert, it may leave the filesystem in a partially-converted
  state.

### Configuring paths to external tools

Rather than having bulk-decaffeinate automatically discover the relevant
binaries, you can specify them explicitly. If a path is not specified
explicitly, bulk-decaffeinate will first search `node_modules`, then your PATH,
then offer to install the tool globally, so generally it's unnecessary to
specify these paths in the config file.

These keys can be specified:

* `decaffeinatePath`: the path to the decaffeinate binary.
* `jscodeshiftPath`: the path to the jscodeshift binary.
* `eslintPath`: the path to the eslint binary.
