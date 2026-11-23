// Import acceptance fixture. Use only on loopback with an isolated demo bucket.
import { createServer, request } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pipeline } from 'node:stream';
import { URL } from 'node:url';

const bucket = '/photokondra-import-demo';
const objects = new Map();

if (process.argv.includes('--tls-proxy')) {
  const key = readFileSync(process.env.PORTFOLIO_DEMO_TLS_KEY);
  const cert = readFileSync(process.env.PORTFOLIO_DEMO_TLS_CERT);
  createHttpsServer({ key, cert }, (incoming, outgoing) => {
    const upstream = request({ hostname: '127.0.0.1', port: 19090, method: incoming.method,
      path: incoming.url, headers: incoming.headers }, (response) => {
      outgoing.writeHead(response.statusCode, response.headers);
      pipeline(response, outgoing, () => {});
    });
    upstream.on('error', () => {
      if (outgoing.headersSent) outgoing.destroy();
      else outgoing.writeHead(502).end();
    });
    pipeline(incoming, upstream, () => {});
  }).listen(19443, '127.0.0.1', () => console.log('Local storage TLS proxy ready on 19443'));
} else {
  createServer(handleStorage).listen(19090, '127.0.0.1', () => console.log('Local import storage fixture ready on 19090'));
}

async function handleStorage(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = decodeURIComponent(url.pathname);
  if (path === '/health') return res.end('OK');
  if (!path.startsWith(bucket + '/portfolio/media/')) {
    res.writeHead(404);
    return res.end();
  }
  if (req.method === 'PUT') {
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 20_000_000) { res.writeHead(413); return res.end(); }
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    const etag = '"' + createHash('md5').update(bytes).digest('hex') + '"';
    objects.set(path, { bytes, etag, type: req.headers['content-type'], cache: req.headers['cache-control'] });
    res.writeHead(200, { ETag: etag });
    return res.end();
  }
  if (req.method === 'DELETE') {
    objects.delete(path);
    res.writeHead(204);
    return res.end();
  }
  const object = objects.get(path);
  if (!object || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, {
    ETag: object.etag, 'Content-Length': object.bytes.length,
    'Content-Type': object.type ?? 'application/octet-stream', 'Cache-Control': object.cache ?? 'no-store',
  });
  res.end(req.method === 'HEAD' ? undefined : object.bytes);
}
