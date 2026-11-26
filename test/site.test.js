'use strict';

// Spawns the real server and asserts the storefront is actually served.
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer(deadlineMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not become ready in time');
}

async function main() {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d.toString();
  });

  try {
    await waitForServer();

    const health = await fetch(`${BASE}/healthz`);
    assert(health.status === 200, `health status was ${health.status}`);
    const healthJson = await health.json();
    assert(healthJson.status === 'ok', 'health payload missing status ok');
    assert(
      (health.headers.get('content-type') || '').includes('application/json'),
      'health content-type was not JSON'
    );

    const home = await fetch(`${BASE}/`);
    assert(home.status === 200, `storefront status was ${home.status}`);
    assert(
      (home.headers.get('content-type') || '').includes('text/html'),
      'storefront content-type was not HTML'
    );
    const html = await home.text();
    assert(html.includes('<title>Sovrns Merch</title>'), 'storefront title missing');
    assert(html.includes('id="grid"'), 'product grid missing');
    assert(html.includes('Train'), 'hero copy missing');
    assert(html.includes('wa.me/919399862732'), 'WhatsApp checkout link missing');
    assert(html.includes('rzp.io'), 'Razorpay payment link comment missing');

    const head = await fetch(`${BASE}/`, { method: 'HEAD' });
    assert(head.status === 200, `HEAD status was ${head.status}`);

    const spaRoute = await fetch(`${BASE}/shop`);
    assert(spaRoute.status === 200, `extension-less route status was ${spaRoute.status}`);

    const missing = await fetch(`${BASE}/nope.png`);
    assert(missing.status === 404, `missing asset status was ${missing.status}`);

    const traversal = await fetch(`${BASE}/..%2f..%2fetc%2fpasswd`);
    assert(traversal.status === 400 || traversal.status === 404, 'path traversal was not blocked');
    const traversalBody = await traversal.text();
    assert(!traversalBody.includes('root:'), 'path traversal leaked file contents');

    const post = await fetch(`${BASE}/`, { method: 'POST', body: 'x' });
    assert(post.status === 405, `POST status was ${post.status}`);

    console.log('All storefront server checks passed (health, HTML, routing, traversal, method guard).');
  } finally {
    child.kill('SIGTERM');
    if (stderr.trim()) console.error('server stderr:\n' + stderr.trim());
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
