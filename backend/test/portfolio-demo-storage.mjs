// Import acceptance fixture. Use only on loopback with an isolated demo bucket.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const bucket = '/photokondra-import-demo';
const objects = new Map();
createServer(async (req, res) => {
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
      if (length > 10_000_000) { res.writeHead(413); return res.end(); }
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
}).listen(19090, '127.0.0.1', () => console.log('Local import storage fixture ready on 19090'));
