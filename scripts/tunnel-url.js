// Shared by scripts/tunnel.js and scripts/start-tunnel.js: where the Cloudflare
// quick tunnel address is saved, and how to find it in cloudflared's output.

const fs = require('fs');
const path = require('path');

/** Saved in .expo/ (gitignored) while `npm run tunnel` is running. */
const TUNNEL_FILE = path.join(__dirname, '..', '.expo', 'tunnel.json');
/** Metro's port: the tunnel points here and Expo is started on it. */
const PORT = 8081;

/** The https://<words>.trycloudflare.com address in a chunk of cloudflared output, or null. */
function findTunnelUrl(text) {
  const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(text);
  return m ? m[0].toLowerCase() : null;
}

function saveTunnel(url, pid) {
  fs.mkdirSync(path.dirname(TUNNEL_FILE), { recursive: true });
  fs.writeFileSync(TUNNEL_FILE, JSON.stringify({ url, pid, port: PORT }, null, 2));
}

function clearTunnel() {
  try {
    fs.unlinkSync(TUNNEL_FILE);
  } catch {
    // already gone
  }
}

/** True if a process with this id is still running. */
function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/** The running tunnel's address, or null if `npm run tunnel` isn't running. */
function readTunnel() {
  try {
    const saved = JSON.parse(fs.readFileSync(TUNNEL_FILE, 'utf8'));
    if (typeof saved.url !== 'string' || !findTunnelUrl(saved.url)) return null;
    if (typeof saved.pid === 'number' && !isRunning(saved.pid)) return null;
    return saved.url;
  } catch {
    return null;
  }
}

module.exports = { TUNNEL_FILE, PORT, findTunnelUrl, saveTunnel, clearTunnel, readTunnel };
