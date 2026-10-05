// npm run tunnel
// Starts a free Cloudflare quick tunnel to Metro (http://localhost:8081) so a phone on
// any network can reach Expo. No account needed. Saves the address for
// `npm run start:tunnel`, which must be started AFTER this prints "Tunnel ready".
// Keep this window open; Ctrl+C stops the tunnel. The address changes every time.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PORT, clearTunnel, findTunnelUrl, saveTunnel } = require('./tunnel-url');

/** cloudflared on PATH, or where the winget / MSI installer puts it (a new window may not have PATH yet). */
function cloudflaredPath() {
  const candidates = [
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'cloudflared', 'cloudflared.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'cloudflared', 'cloudflared.exe'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || 'cloudflared';
}

clearTunnel();
const exe = cloudflaredPath();
const child = spawn(exe, ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

let url = null;
function onOutput(chunk) {
  const text = chunk.toString();
  if (!url) {
    const found = findTunnelUrl(text);
    if (found) {
      url = found;
      saveTunnel(url, process.pid);
      console.log('');
      console.log('==============================================================');
      console.log(` Tunnel ready: ${url}`);
      console.log('');
      console.log(' Now, in a second window, run:   npm run start:tunnel');
      console.log(' (Give it ~10 seconds the first time for the address to work.)');
      console.log(' Keep this window open. Ctrl+C stops the tunnel.');
      console.log('==============================================================');
      console.log('');
      return;
    }
  }
  // After the address is known, only show problems.
  for (const line of text.split(/\r?\n/)) {
    if (!url || /\b(ERR|error|failed)\b/i.test(line)) {
      if (line.trim()) console.log(url ? `[cloudflared] ${line}` : line);
    }
  }
}
child.stdout.on('data', onOutput);
child.stderr.on('data', onOutput);

child.on('error', (e) => {
  clearTunnel();
  if (e.code === 'ENOENT') {
    console.error('cloudflared is not installed. Install it once with:');
    console.error('  winget install --id Cloudflare.cloudflared');
    console.error('then open a NEW cmd window and run npm run tunnel again.');
  } else {
    console.error(`Could not start cloudflared: ${e.message}`);
  }
  process.exit(1);
});

child.on('exit', (code) => {
  clearTunnel();
  console.log(`Tunnel stopped${code ? ` (cloudflared exited with code ${code})` : ''}.`);
  process.exit(code || 0);
});

function stop() {
  clearTunnel();
  child.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', clearTunnel);
