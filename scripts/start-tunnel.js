// npm run start:tunnel
// Starts Expo on port 8081 with EXPO_PACKAGER_PROXY_URL set to the Cloudflare tunnel
// address that `npm run tunnel` saved, so the QR code works in Expo Go from any network.
// Run `npm run tunnel` first, in its own window. Extra flags go to expo, e.g.
//   npm run start:tunnel -- --clear

const { spawn } = require('child_process');
const { PORT, readTunnel } = require('./tunnel-url');

const url = readTunnel();
if (!url) {
  console.error('No Cloudflare tunnel is running.');
  console.error('First run  npm run tunnel  in another window, wait for "Tunnel ready", then run this again.');
  process.exit(1);
}

console.log(`Expo will use the tunnel: ${url}`);
console.log('Scan the QR code below with Expo Go (Android) or the Camera app (iPhone).');
console.log('');

const child = spawn(process.execPath, [require.resolve('expo/bin/cli'), 'start', '--port', String(PORT), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, EXPO_PACKAGER_PROXY_URL: url },
});
child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
