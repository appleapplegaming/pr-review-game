// Serves the built client (dist/client) over plain HTTP. Every path is untrusted. The rules:
//  - only GET and HEAD, anything else is 405
//  - the path is decoded once, then must contain no NUL byte and no dot-prefixed segment
//  - the resolved file, with symlinks followed, must sit inside the client directory
//  - only regular files are served; a directory or missing file is 404 with a generic body
// `/` and `/r/:code` both return index.html, so the client router handles the room code.

import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};

/** Sent on every response, including errors. The CSP starts from 'self' and only opens what the app needs. */
const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self' ws: wss:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000',
};

const APP_SHELL = '/index.html';
const APP_ROUTE = /^\/r\/[^/]+$/;

function sendText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function cacheControl(path: string): string {
  if (path === APP_SHELL) return 'no-cache';
  // Vite names built assets with a content hash, so they can be cached for a year.
  if (path.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

/** Returns the decoded pathname, or null when the request path is not valid percent-encoding. */
function requestPath(rawUrl: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(rawUrl, 'http://localhost').pathname;
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

async function serve(base: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendText(res, 405, 'Method not allowed');
    return;
  }

  const decoded = requestPath(req.url ?? '/');
  if (decoded === null) {
    sendText(res, 400, 'Bad request');
    return;
  }
  if (decoded.includes('\0') || decoded.split('/').some((segment) => segment.startsWith('.'))) {
    sendText(res, 404, 'Not found');
    return;
  }

  const path = decoded === '/' || APP_ROUTE.test(decoded) ? APP_SHELL : decoded;
  const file = await resolveInside(base, path);
  if (file === null) {
    sendText(res, 404, 'Not found');
    return;
  }

  const info = await stat(file);
  if (!info.isFile()) {
    sendText(res, 404, 'Not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': cacheControl(path),
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/** The real path of `path` under `base`, or null if it does not exist or escapes `base` (symlinks followed). */
async function resolveInside(base: string, path: string): Promise<string | null> {
  const candidate = resolve(base, `.${path}`);
  if (!candidate.startsWith(base + sep)) return null;
  let real: string;
  try {
    real = await realpath(candidate);
  } catch {
    return null;
  }
  return real.startsWith(base + sep) ? real : null;
}

/** A request handler for node:http that serves files from `root`. */
export function createStaticHandler(
  root: string,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    // Resolved per request, so a client build that appears after start is picked up.
    realpath(resolve(root))
      .then((base) => serve(base, req, res))
      .catch(() => {
        if (!res.headersSent) sendText(res, 500, 'Server error');
        else res.destroy();
      });
  };
}
