const fs = require('fs');
const html = fs.readFileSync('page.html', 'utf8');
console.log('Size:', html.length);
const matches = html.match(/https:\/\/images\.unsplash\.com\/[^\s\"\'\?]+/g);
console.log('Matches:', matches ? [...new Set(matches)].slice(0, 10) : 'none');
