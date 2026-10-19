import { createServer } from 'node:http';

const port = Number(process.env.PORT) || 3000;

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Ship It server\n');
});

server.listen(port, () => {
  console.log(`Ship It listening on port ${port}`);
});
