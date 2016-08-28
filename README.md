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

## Future plans

* Run follow-up commands like `eslint --fix` once decaffeinate finishes.
* Allow running custom follow-up codemods.
* When displaying errors, classify any known issues automatically and link to
  the corresponding GitHub issue.
* Any other sanity checks, instructions, or help for running decaffeinate on a
  real-world codebase.
