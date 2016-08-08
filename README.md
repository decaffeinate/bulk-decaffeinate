# bulk-decaffeinate

A tool, backed by [decaffeinate](http://decaffeinate-project.org/), to help you
convert some or all of a CoffeeScript codebase to JavaScript.

Currently, `bulk-decaffeinate` is useful for *evaluating* a codebase for use
with decaffeinate, but does not yet perform the full conversion. In the future,
it will help with things like generating proper git commits and running
post-decaffeinate cleanups like `eslint --fix`.

Sample usage:
```bash
> npm install -g bulk-decaffeinate
> git clone git@github.com:github/hubot.git
Cloning into 'hubot'...
remote: Counting objects: 8287, done.
remote: Total 8287 (delta 0), reused 0 (delta 0), pack-reused 8287
Receiving objects: 100% (8287/8287), 1.75 MiB | 694.00 KiB/s, done.
Resolving deltas: 100% (4677/4677), done.
Checking connectivity... done.
> cd hubot
> bulk-decaffeinate check
Discovering .coffee files in the current directory...
Trying decaffeinate on 18 files...
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
# (7 browser tabs are opened, showing all failures.)
```
