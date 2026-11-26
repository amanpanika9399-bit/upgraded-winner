'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({}, BASE_HEADERS, headers));
  res.end(body);
}

/** Map a request path to a file inside public/, or null when it escapes the root. */
function resolvePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  const normalised = path.posix.normalize(decoded);
  if (normalised.includes('\0')) return null;
  const rel = normalised.replace(/^\/+/, '');
  const full = path.join(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
  return full;
}

async function serveFile(res, filePath, method) {
  const ext = path.extname(filePath).toLowerCase();
  const data = await fs.readFile(filePath);
  const isHtml = ext === '.html' || ext === '';
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': data.length,
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=3600'
  };
  if (method === 'HEAD') {
    res.writeHead(200, Object.assign({}, BASE_HEADERS, headers));
    return res.end();
  }
  res.writeHead(200, Object.assign({}, BASE_HEADERS, headers));
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', {
      'Content-Type': 'text/plain; charset=utf-8',
      Allow: 'GET, HEAD'
    });
  }

  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/healthz' || urlPath === '/health') {
    return send(res, 200, JSON.stringify({ status: 'ok', service: 'sovrns-merch' }), {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
  }

  const target = resolvePath(urlPath);
  if (!target) {
    return send(res, 400, 'Bad Request', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  try {
    let filePath = target;
    let stat = await fs.stat(filePath).catch(() => null);

    if (stat && stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = await fs.stat(filePath).catch(() => null);
    }

    // Extension-less routes fall back to the storefront shell.
    if (!stat && path.extname(filePath) === '') {
      filePath = path.join(ROOT, 'index.html');
      stat = await fs.stat(filePath).catch(() => null);
    }

    if (!stat || !stat.isFile()) {
      return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
    }

    return await serveFile(res, filePath, method);
  } catch (err) {
    console.error('request failed', req.url, err);
    return send(res, 500, 'Internal Server Error', {
      'Content-Type': 'text/plain; charset=utf-8'
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Sovrns Merch listening on http://${HOST}:${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = server;
