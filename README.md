# bulk-decaffeinate

A tool, backed by [decaffeinate](http://decaffeinate-project.org/), to help you
convert some or all of a CoffeeScript codebase to JavaScript.

Currently, `bulk-decaffeinate` is useful for evaluating a codebase for use
with decaffeinate, but does not yet perform the full conversion. Just run
`bulk-decaffeinate --help` for instructions.

Sample usage:
```
> npm install -g bulk-decaffeinate decaffeinate
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

## Configuration

You can specify custom configuration in a config file, usually called
`bulk-decaffeinate.json`, in the current working directory. Any file starting
with `bulk-decaffeinate` and ending with `.json` will be counted, and multiple
config files may exist at once. If there are multiple config files, they are
merged, with alphabetically-later config file names taking precedence over
alphabetically-earlier files. Many config options can also be specified directly
as CLI arguments, with CLI arguments taking precedence over any config file
setting.

The following config keys are valid:
* `searchDirectory`: a path to a directory containing .coffee files to run
  decaffeinate on. bulk-decaffeinate will do a recursive search through this
  directory for all .coffee files, ignoring `node_modules` directories.
* `pathFile`: a path to a file containing a list of .coffee file paths to run
  decaffeinate on, one per line. This takes precedence over `searchDirectory`.
* `filesToProcess`: an array of .coffee file paths to run decaffeinate on. This
  takes precedence over the `pathFile` and `searchDirectory` options.
* `decaffeinatePath`: the path to the decaffeinate binary. If not specified,
  bulk-decaffeinate searches your `node_modules` directory and your PATH, so
  generally this setting is unnecessary.

## Future plans

* Run follow-up commands like `eslint --fix` once decaffeinate finishes.
* Allow running custom follow-up codemods.
* When displaying errors, classify any known issues automatically and link to
  the corresponding GitHub issue.
* Any other sanity checks, instructions, or help for running decaffeinate on a
  real-world codebase.
