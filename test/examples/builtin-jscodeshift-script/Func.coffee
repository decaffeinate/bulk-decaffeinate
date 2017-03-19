a = require('./A.coffee')
# This is a comment
f = ->
  console.log 'Hello world'
  return

arrow = ->
  3 + 4

arrowWithComment = ->
  # This is a comment
  5

@a = 6
do ->
  @b = 7
do =>
  @c = 8
class C
  d: ->
    @e = 9

return
