// Isolated Playwright-only backend for Next's server-rendered admin layout.
import { createServer } from 'node:http';
createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/health') {
    response.end('{}');
    return;
  }
  if (
    request.url === '/api/v1/auth/me' &&
    request.headers.authorization === 'Bearer playwright-test'
  ) {
    response.end(
      JSON.stringify({ id: 'admin', email: 'admin@integration.invalid', role: 'ADMIN' }),
    );
    return;
  }
  response.statusCode = 404;
  response.end('{}');
}).listen(3003, '127.0.0.1');
