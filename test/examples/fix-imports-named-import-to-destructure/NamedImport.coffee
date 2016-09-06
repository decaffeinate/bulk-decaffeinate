{twelve, seventeen: tenAndSeven} = require './TwoValueDefaultExport'
{twenty} = require './NameClash'
{twentySix} = require './NamedExport';
{thirtyOne} = require './dashed-name'
console.log twelve;
console.log tenAndSeven;
NameClash = 25
console.log twenty;
console.log twentySix;
console.log NameClash;
console.log thirtyOne;
