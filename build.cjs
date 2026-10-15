const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const output = path.join(root, 'dist');
if (path.dirname(output) !== root) throw new Error('Invalid output directory');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const name of ['index.html', 'room.js', 'vendor']) {
  fs.cpSync(path.join(root, name), path.join(output, name), { recursive: true });
}
console.log('Built standalone tennis game in dist/');
