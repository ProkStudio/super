const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync(
  'c:/Users/HONOR/Desktop/traffic/Super/_truwas_extract/frontend/dist/assets/index-DFb0B33u.js',
  'utf8'
);

// Extract P_ object - starts before Goe function
const start = code.indexOf('"/profiles":{title:');
const end = code.indexOf('};function Goe');
const block = code.slice(start - 20, end + 2);

// Find variable name P_
const varMatch = code.slice(0, start).match(/const ([A-Za-z0-9_$]+)=\{[^}]*"\/profiles"/);
console.log('var match', varMatch?.[1]);

// Extract readable strings from the block by running fe decoder if possible
// Simpler: extract all ru: strings from the block
const ruStrings = [...block.matchAll(/\{ru:"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((m) =>
  m[1].replace(/\\"/g, '"')
);
console.log('ru strings count', ruStrings.length);
console.log(ruStrings.slice(0, 30).join('\n---\n'));

// Find how Goe is used
const goeIdx = code.indexOf('function Goe');
console.log('\n=== Goe usage ===');
console.log(code.slice(code.length - 5000));
