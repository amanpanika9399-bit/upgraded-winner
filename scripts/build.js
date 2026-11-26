'use strict';

// Build gate: the storefront is a single static page, so "build" verifies the
// shipped HTML is complete and internally consistent before it can be deployed.
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const failures = [];

function check(label, condition) {
  if (!condition) failures.push(label);
}

check('doctype present', /^\s*<!doctype html>/i.test(html));
check('html element closed', /<\/html>\s*$/.test(html));
check('title is Sovrns Merch', /<title>\s*Sovrns Merch\s*<\/title>/i.test(html));
check('product catalogue present', /var P=\[/.test(html));
check('cart drawer present', /id="drawer"/.test(html));
check('checkout handler present', /function msg\(\)/.test(html));
check('storefront grid present', /id="grid"/.test(html));

const productCount = (html.match(/\{id:"/g) || []).length;
check('eight products listed', productCount === 8);

if (failures.length) {
  console.error('Build check failed:\n - ' + failures.join('\n - '));
  process.exit(1);
}

console.log(`Build check passed: storefront HTML valid, ${productCount} products.`);
