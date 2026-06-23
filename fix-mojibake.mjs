import fs from 'fs';
import path from 'path';

// Windows-1252 special chars (0x80-0x9F range) reverse map: Unicode codepoint → W1252 byte
const W1252_REVERSE = new Map([
  [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8A], [0x2039, 0x8B], [0x0152, 0x8C],
  [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92], [0x201C, 0x93],
  [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B],
  [0x0153, 0x9C], [0x017E, 0x9E], [0x0178, 0x9F]
]);

function fixMojibake(str) {
  if (str.charCodeAt(0) === 0xFEFF) str = str.slice(1); // strip BOM
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const cp = str.codePointAt(i);
    if (cp > 0xFFFF) i++; // skip low surrogate
    if (cp <= 0x7F) {
      bytes.push(cp);
    } else if (cp >= 0xA0 && cp <= 0xFF) {
      bytes.push(cp);
    } else if (W1252_REVERSE.has(cp)) {
      bytes.push(W1252_REVERSE.get(cp));
    } else {
      // Not a W1252 char — keep original UTF-8 bytes unchanged
      const encoded = Buffer.from(String.fromCodePoint(cp), 'utf8');
      for (const b of encoded) bytes.push(b);
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function walk(dir) {
  const files = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (['node_modules', '.next'].includes(f)) continue;
    if (fs.statSync(full).isDirectory()) files.push(...walk(full));
    else if (f.endsWith('.tsx') || f.endsWith('.ts')) files.push(full);
  }
  return files;
}

const base = 'd:/JasaBersih.com/jasabersih/apps/admin';
let changed = 0;
for (const fpath of walk(base)) {
  const content = fs.readFileSync(fpath, 'utf8');
  const fixed = fixMojibake(content);
  if (fixed !== content.replace(/^﻿/, '')) {
    fs.writeFileSync(fpath, fixed, 'utf8');
    console.log('FIXED:', fpath.replace('d:/JasaBersih.com/jasabersih/', ''));
    changed++;
  }
}
console.log(`\nTotal fixed: ${changed} files`);
