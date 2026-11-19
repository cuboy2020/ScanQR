/**
 * Quick QR Server
 * - Chạy cục bộ: http://localhost:8088
 * - Tương thích Vercel Serverless Function & Node.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');

const PORT = process.env.PORT || 8088;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function handler(req, res) {
  // Ho tro CORS Proxy de tai anh QR tu trang web khac
  if (req.url.startsWith('/proxy?url=')) {
    try {
      const targetUrl = decodeURIComponent(req.url.replace('/proxy?url=', ''));
      const parsedUrl = new URL(targetUrl);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      client.get(targetUrl, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': proxyRes.headers['content-type'] || 'image/png',
          'Access-Control-Allow-Origin': '*'
        });
        proxyRes.pipe(res);
      }).on('error', (err) => {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Proxy error: ' + err.message);
      });
      return;
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid URL');
      return;
    }
  }

  // Ho tro goi cong cu Cat man hinh he thong Windows (Win + Shift + S)
  if (req.url === '/api/win-snip') {
    try {
      exec('explorer ms-screenclip:');
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false }));
    }
    return;
  }

  let reqUrl = req.url.split('?')[0];
  if (reqUrl === '/' || reqUrl === '') reqUrl = '/index.html';

  const filePath = path.join(__dirname, reqUrl);
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

// Xuất handler cho Vercel Node.js Serverless Function
module.exports = handler;

// Chạy trực tiếp khi chạy bằng lệnh node server.js hoặc run.bat
if (require.main === module) {
  const server = http.createServer(handler);
  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`===============================================`);
    console.log(` Quick QR Server đang chạy tại: ${url}`);
    console.log(` Nhấn Ctrl + C để dừng server khi không dùng nữa.`);
    console.log(`===============================================`);
    if (process.platform === 'win32') {
      exec(`start ${url}`);
    }
  });
}
