import fs from 'fs';
import path from 'path';

const rippleJsPath = '/Users/pedrosantos/tizen-studio/tools/sec-tv-simulator/nwjs.app/Contents/Resources/app.nw/ripple.js';
const content = fs.readFileSync(rippleJsPath, 'utf8');

// Find define("ripple/db", ...
const dbDefIndex = content.indexOf('define("ripple/db"');
if (dbDefIndex !== -1) {
  // Print some characters after it
  console.log(content.substring(dbDefIndex, dbDefIndex + 2000));
} else {
  console.log('Not found');
}
