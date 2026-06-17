// Skill Forge Sync Server — serves HTML + WebSocket relay on same port
// Run: node relay-server.js
// PC: http://localhost:3456   Phone: http://10.x.x.x:3456
// Both auto-detect relay. Just enter room code.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const os = require('os');

const PORT = 3456;

function getLocalIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const localIP = getLocalIP();

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// HTTP server + WebSocket
const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/skill-forge.html' : req.url;
  filePath = path.join(__dirname, filePath.split('?')[0]);

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

// WebSocket relay
const rooms = new Map();
const clients = new Map();

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const peerId = Math.random().toString(36).substring(2, 8);
  clients.set(ws, { id: peerId, roomCode: null });

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    switch (msg.type) {
      case 'create': {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms.set(roomCode, { host: ws, guest: null });
        clients.get(ws).roomCode = roomCode;
        clients.get(ws).isHost = true;
        ws.send(JSON.stringify({ type: 'roomCreated', roomCode }));
        break;
      }
      case 'join': {
        const code = (msg.roomCode || '').toUpperCase();
        const room = rooms.get(code);
        if (!room) { ws.send(JSON.stringify({ type: 'error', message: '房间不存在' })); return; }
        if (room.guest) { ws.send(JSON.stringify({ type: 'error', message: '房间已满' })); return; }
        room.guest = ws;
        clients.get(ws).roomCode = code;
        clients.get(ws).isHost = false;
        room.host.send(JSON.stringify({ type: 'peerJoined' }));
        ws.send(JSON.stringify({ type: 'joined', roomCode: code }));
        break;
      }
      default: {
        const client = clients.get(ws);
        if (!client || !client.roomCode) return;
        const room = rooms.get(client.roomCode);
        if (!room) return;
        const target = client.isHost ? room.guest : room.host;
        if (target && target.readyState === 1) target.send(data.toString());
        break;
      }
    }
  });

  ws.on('close', () => {
    const client = clients.get(ws);
    if (client && client.roomCode) {
      const room = rooms.get(client.roomCode);
      if (room) {
        const other = client.isHost ? room.guest : room.host;
        if (other && other.readyState === 1) other.send(JSON.stringify({ type: 'peerLeft' }));
        rooms.delete(client.roomCode);
      }
    }
    clients.delete(ws);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║   Skill Forge 同步服务               ║');
  console.log('  ║   电脑打开 http://localhost:' + PORT + '     ║');
  console.log('  ║   手机打开 http://' + localIP + ':' + PORT + '   ║');
  console.log('  ║   输同一个码即可同步                  ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log('  按 Ctrl+C 停止');
});
