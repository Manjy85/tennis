const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5177;
const OUTPUT_PATH = path.resolve(__dirname, 'roland-garros.json');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/save-backup') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 5 * 1024 * 1024) req.socket.destroy();
  });

  req.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      if (!parsed || !parsed.data) throw new Error('invalid_payload');
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(parsed, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: OUTPUT_PATH }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'invalid_json' }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Save-backup server listening on http://localhost:${PORT}`);
  console.log(`Writing backups to: ${OUTPUT_PATH}`);
});
